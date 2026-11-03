import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Login using the administrator's password
export async function login(req, res) {
  const password = req.body?.password;

  if (
    typeof password !== "string" ||
    password.length > 200 ||
    !process.env.ADMIN_PASSWORD_HASH
  ) {
    return res.status(401).json({
      error: "Invalid credentials",
    });
  }

  const valid = await bcrypt.compare(
    password,
    process.env.ADMIN_PASSWORD_HASH
  );

  if (!valid) {
    return res.status(401).json({
      error: "Invalid credentials",
    });
  }

  // Generate an authenticated session token
  const token = jwt.sign(
    { role: "admin" },
    process.env.JWT_SECRET,
    {
      expiresIn: "2h",
      issuer: "paylink",
      audience: "paylink-dashboard",
    }
  );

  return res.json({ token });
}

// Middleware for protecting private API routes
export function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Sign in required",
    });
  }

  try {
    const payload = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET,
      {
        issuer: "paylink",
        audience: "paylink-dashboard",
      }
    );

    if (payload.role !== "admin") {
      throw new Error("Invalid role");
    }

    next();
  } catch {
    res.status(401).json({
      error: "Session expired. Please sign in.",
    });
  }
}