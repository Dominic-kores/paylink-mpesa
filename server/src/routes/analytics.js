// server/src/routes/analytics.js
// Payment analytics for the merchant dashboard
import express from "express";

import { prisma } from "../prisma.js";
import { requireAdmin } from "../auth.js";

const router = express.Router();

const TIME_ZONE = "Africa/Nairobi";

// YYYY-MM-DD as seen in Kenya. Using toISOString() (UTC)
// would put payments made between 00:00 and 03:00 EAT on
// the previous day.
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);

// Start of a Kenyan calendar day (EAT is UTC+3, no DST)
const startOfDay = (key) => new Date(`${key}T00:00:00+03:00`);

router.get("/analytics", requireAdmin, async (req, res) => {
  try {
    // Total received
    const totals = await prisma.payment.aggregate({
      where: { status: "completed" },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Last 7 days, today included
    const dailyTotals = {};
    const dailyCounts = {};
    const today = startOfDay(dayKey(new Date()));

    for (let i = 6; i >= 0; i--) {
      const key = dayKey(new Date(today.getTime() - i * 86400000));
      dailyTotals[key] = 0;
      dailyCounts[key] = 0;
    }

    const sevenDaysAgo = startOfDay(Object.keys(dailyTotals)[0]);

    // Payments over the last 7 days
    const recentPayments = await prisma.payment.findMany({
      where: {
        status: "completed",
        paidAt: { gte: sevenDaysAgo },
      },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    });

    // Group by date
    recentPayments.forEach((payment) => {
      const key = dayKey(payment.paidAt);
      if (dailyTotals[key] !== undefined) {
        dailyTotals[key] += payment.amount;
        dailyCounts[key] += 1;
      }
    });

    const chartData = Object.entries(dailyTotals).map(([date, total]) => ({
      date,
      label: new Date(`${date}T12:00:00+03:00`).toLocaleDateString("en-KE", {
        weekday: "short",
        timeZone: TIME_ZONE,
      }),
      total,
      count: dailyCounts[date],
    }));

    res.json({
      totalReceived: totals._sum.amount || 0,
      totalPayments: totals._count.id || 0,
      chartData,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

export default router;
