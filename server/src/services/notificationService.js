// server/src/services/notificationService.js
// Notification service (Lesson 2): saves a notification and
// pushes it in real time to the merchant's open dashboards.
import { prisma } from "../prisma.js";

let io;
let merchantSockets;

// Called once from server.js after Socket.IO is created
export function init(app) {
  io = app.get("io");
  merchantSockets = app.get("merchantSockets");
}

export async function createNotification({
  type,
  title,
  message,
  data,
  userId,
}) {
  const notification = await prisma.notification.create({
    data: { type, title, message, data, userId },
  });

  // Real-time push to every dashboard tab of this merchant
  const socketIds = merchantSockets?.get(userId);

  if (io && socketIds?.size) {
    io.to([...socketIds]).emit("notification", notification);
  }

  return notification;
}

export async function getNotifications(userId, limit = 20) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId, read: false },
    }),
  ]);

  return { notifications, unreadCount };
}

export function markAsRead(id, userId) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export function markAllAsRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export default {
  init,
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
};
