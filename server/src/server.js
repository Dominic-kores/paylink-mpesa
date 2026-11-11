import "dotenv/config";

import http from "node:http";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { prisma } from "./prisma.js";
import {
  login,
  requireAdmin,
  verifyAdminToken,
  MERCHANT_ID,
} from "./auth.js";

import { wrap, limiter } from "./middleware.js";
import { maskPhone } from "./utils.js";

import paymentsRouter from "./routes/payments.js";
import analyticsRouter from "./routes/analytics.js";
import notificationsRouter from "./routes/notifications.js";
import notificationService from "./services/notificationService.js";

// --------------------------------------------------
// 1. Validate required environment variables
// --------------------------------------------------

for (const name of [
  "DATABASE_URL",
  "JWT_SECRET",
  "ADMIN_PASSWORD_HASH",
  "FRONTEND_URL",
]) {
  if (!process.env[name]) {
    throw new Error(
      `Missing environment variable: ${name}`
    );
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET must have at least 32 characters"
  );
}

// --------------------------------------------------
// 2. Express application configuration
// --------------------------------------------------

const app = express();

app.disable("x-powered-by");
app.disable("etag");

app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = process.env.FRONTEND_URL
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""));

app.use(
  cors({
    origin(origin, done) {
      if (!origin || allowedOrigins.includes(origin)) {
        return done(null, true);
      }

      done(new Error("Origin not allowed"));
    },
  })
);

app.use(express.json({ limit: "20kb" }));

// Prevent caching of sensitive API responses
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// --------------------------------------------------
// 3. Input validation and response helpers
// --------------------------------------------------

const linkSchema = z.object({
  amount: z.coerce.number().int().min(1).max(150000),

  description: z
    .string()
    .trim()
    .min(3)
    .max(150),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9-]{3,50}$/,
      "Slug: 3–50 lowercase letters, digits, dashes"
    )
    .optional()
    .or(z.literal("")),
});

// Return safe link details
const publicLink = (link) => ({
  id: link.id,
  slug: link.slug,
  amount: link.amount,
  description: link.description,
  active: link.active,
  merchantName: process.env.MERCHANT_NAME || "PayLink Merchant",
  createdAt: link.createdAt,
});

// --------------------------------------------------
// 4. Health check and admin login
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "PayLink API",
  });
});

app.post(
  "/api/admin/login",
  limiter(8),
  wrap(login)
);

// --------------------------------------------------
// 5. Create a new payment link
// POST /api/links
// --------------------------------------------------

app.post(
  "/api/links",
  requireAdmin,
  wrap(async (req, res) => {
    const parsed = linkSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0].message,
      });
    }

    const { amount, description } = parsed.data;

    let slug = parsed.data.slug || "";

    // Check custom slug uniqueness
    if (slug) {
      const exists = await prisma.paymentLink.findUnique({
        where: { slug },
      });

      if (exists) {
        return res.status(409).json({
          error: "This slug is already taken",
        });
      }
    }

    // Generate random slug if not provided
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (!slug) {
          slug = randomBytes(4).toString("hex");
        }

        const link = await prisma.paymentLink.create({
          data: {
            slug,
            amount,
            description,
          },
        });

        return res.status(201).json(publicLink(link));
      } catch (err) {
        if (err.code !== "P2002") {
          throw err;
        }

        if (parsed.data.slug) {
          return res.status(409).json({
            error: "This slug is already taken",
          });
        }

        // Retry when a random slug collides
        slug = "";
      }
    }

    return res.status(503).json({
      error: "Could not create a unique slug. Retry.",
    });
  })
);

// --------------------------------------------------
// 6. Get all payment links for the dashboard
// GET /api/links
// --------------------------------------------------

app.get(
  "/api/links",
  requireAdmin,
  wrap(async (_req, res) => {
    const links = await prisma.paymentLink.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        payments: {
          select: {
            amount: true,
            status: true,
          },
        },
      },
    });

    const results = links.map(({ payments, ...link }) => {
      const completed = payments.filter(
        (payment) => payment.status === "completed"
      );

      return {
        ...publicLink(link),

        completedPayments: completed.length,

        totalCollected: completed.reduce(
          (sum, payment) => sum + payment.amount,
          0
        ),
      };
    });

    res.json(results);
  })
);

// --------------------------------------------------
// 7. Get one payment link using its slug
// GET /api/links/:slug
// --------------------------------------------------

app.get(
  "/api/links/:slug",
  wrap(async (req, res) => {
    const link = await prisma.paymentLink.findUnique({
      where: {
        slug: req.params.slug,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Payment link not found",
      });
    }

    if (!link.active) {
      return res.status(410).json({
        error: "This payment link is no longer active",
      });
    }

    res.json(publicLink(link));
  })
);

// --------------------------------------------------
// 8. Activate or deactivate a payment link
// PATCH /api/links/:id/toggle
// --------------------------------------------------

app.patch(
  "/api/links/:id/toggle",
  requireAdmin,
  wrap(async (req, res) => {
    const link = await prisma.paymentLink.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Link not found",
      });
    }

    const updated = await prisma.paymentLink.update({
      where: {
        id: link.id,
      },
      data: {
        active: !link.active,
      },
    });

    res.json(publicLink(updated));
  })
);

// --------------------------------------------------
// 9. Download payments for a link as CSV
// GET /api/links/:id/payments.csv
// --------------------------------------------------

function csvCell(value) {
  let text = String(value ?? "");

  // Prevent spreadsheet formula injection
  if (/^[\s]*[=+@\-\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

app.get(
  "/api/links/:id/payments.csv",
  requireAdmin,
  wrap(async (req, res) => {
    const link = await prisma.paymentLink.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Link not found",
      });
    }

    const payments = await prisma.payment.findMany({
      where: {
        paymentLinkId: link.id,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    const rows = [
      [
        "Date",
        "Phone (masked)",
        "Amount KES",
        "Status",
        "Receipt",
        "Description",
      ],

      ...payments.map((payment) => [
        payment.createdAt.toISOString(),
        maskPhone(payment.phoneNumber),
        payment.amount,
        payment.status,
        payment.mpesaReceiptNumber,
        payment.transactionDesc,
      ]),
    ];

    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    res.set(
      "Content-Disposition",
      `attachment; filename="${link.slug}-payments.csv"`
    );

    res
      .type("text/csv; charset=utf-8")
      .send("\uFEFF" + csv);
  })
);

// --------------------------------------------------
// 10. Payments, analytics and notifications (v2)
// --------------------------------------------------

app.use("/api", paymentsRouter);
app.use("/api", analyticsRouter);
app.use("/api", notificationsRouter);

// --------------------------------------------------
// 11. Global error handling
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  if (err.message === "Origin not allowed") {
    return res.status(403).json({
      error: err.message,
    });
  }

  if (err.response) {
    console.error(
      "Daraja API error:",
      err.response.status,
      err.response.data?.errorMessage ||
        err.message
    );

    return res.status(502).json({
      error:
        err.response.data?.errorMessage ||
        "Payment provider unavailable",
    });
  }

  if (err.code === "P2002") {
    return res.status(409).json({
      error: "Duplicate record",
    });
  }

  console.error("API error:", err.message);

  res.status(500).json({
    error: "Internal server error",
  });
});

// --------------------------------------------------
// 12. Socket.IO: real-time payment status + notifications
// --------------------------------------------------

// Replace app.listen() with this:
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

// Track payer connections: { paymentLinkId: Set<socketId> }
// A Set (not a single id) so two customers on the same link,
// or two tabs, do not overwrite each other.
const payerSockets = new Map();

// Track merchant connections: { userId: Set<socketId> }
const merchantSockets = new Map();

const addSocket = (map, key, socketId) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(socketId);
};

const removeSocket = (map, key, socketId) => {
  map.get(key)?.delete(socketId);
  if (map.get(key)?.size === 0) map.delete(key);
};

io.on("connection", (socket) => {
  // Payer watches a specific payment link
  socket.on("watch-payment", (paymentLinkId) => {
    if (typeof paymentLinkId !== "string" || paymentLinkId.length > 64) {
      return;
    }

    if (socket.paymentLinkId) {
      removeSocket(payerSockets, socket.paymentLinkId, socket.id);
    }

    addSocket(payerSockets, paymentLinkId, socket.id);
    socket.paymentLinkId = paymentLinkId;
    console.log(`Payer watching payment: ${paymentLinkId}`);
  });

  // Merchant registers for notifications. The dashboard sends
  // its login token, so nobody else can subscribe to the
  // merchant's payment notifications.
  socket.on("register-merchant", (token) => {
    try {
      verifyAdminToken(token);
    } catch {
      socket.emit("register-error", "Session expired. Please sign in.");
      return;
    }

    addSocket(merchantSockets, MERCHANT_ID, socket.id);
    socket.userId = MERCHANT_ID;
    console.log(`Merchant registered: ${MERCHANT_ID}`);
  });

  socket.on("disconnect", () => {
    if (socket.paymentLinkId) {
      removeSocket(payerSockets, socket.paymentLinkId, socket.id);
    }
    if (socket.userId) {
      removeSocket(merchantSockets, socket.userId, socket.id);
    }
  });
});

// Make io accessible to routes
app.set("io", io);
app.set("payerSockets", payerSockets);
app.set("merchantSockets", merchantSockets);

notificationService.init(app);

// --------------------------------------------------
// 13. Start the server
// --------------------------------------------------

const port = Number(process.env.PORT || 5001);

server.listen(port, "0.0.0.0", () => {
  console.log(`PayLink v2 server running on http://localhost:${port}`);
});
