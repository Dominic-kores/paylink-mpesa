// server/src/routes/notifications.js
// Merchant notification bell (Lesson 2)
import express from "express";

import { requireAdmin } from "../auth.js";
import { wrap } from "../middleware.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

router.get(
  "/notifications",
  requireAdmin,
  wrap(async (req, res) => {
    res.json(await notificationService.getNotifications(req.userId));
  })
);

router.patch(
  "/notifications/read-all",
  requireAdmin,
  wrap(async (req, res) => {
    await notificationService.markAllAsRead(req.userId);
    res.json({ ok: true });
  })
);

router.patch(
  "/notifications/:id/read",
  requireAdmin,
  wrap(async (req, res) => {
    await notificationService.markAsRead(req.params.id, req.userId);
    res.json({ ok: true });
  })
);

export default router;
