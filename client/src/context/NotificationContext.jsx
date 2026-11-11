import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api } from "../api.js";
import {
  socket,
  connectSocket,
  disconnectSocket,
} from "../socket.js";

const NotificationContext = createContext(null);

const TOAST_MS = 6000;

// Holds the merchant's notifications, unread count and
// toasts, and keeps them live over an authenticated socket.
export function NotificationProvider({ token, children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [connected, setConnected] = useState(false);

  // Bumped on every live notification so pages
  // (e.g. the dashboard) can refetch their data.
  const [revision, setRevision] = useState(0);

  const dismissToast = useCallback((id) => {
    setToasts((current) =>
      current.filter((toast) => toast.id !== id)
    );
  }, []);

  // Initial load
  useEffect(() => {
    let canceled = false;

    api("/api/notifications", { token })
      .then((data) => {
        if (canceled) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch((err) =>
        console.error("Notifications:", err.message)
      );

    return () => {
      canceled = true;
    };
  }, [token]);

  // Live updates: register this dashboard with the server.
  // Re-register on every (re)connect, because the server
  // forgets a socket when it disconnects.
  useEffect(() => {
    const register = () => {
      socket.emit("register-merchant", token);
      setConnected(true);
    };
    const onDisconnect = () => setConnected(false);
    const onRegisterError = (message) => {
      setConnected(false);
      console.warn("Live updates:", message);
    };

    const onNotification = (notification) => {
      setNotifications((current) =>
        [notification, ...current].slice(0, 20)
      );
      setUnreadCount((count) => count + 1);
      setRevision((value) => value + 1);

      setToasts((current) => [...current, notification]);
      setTimeout(
        () => dismissToast(notification.id),
        TOAST_MS
      );
    };

    socket.on("connect", register);
    socket.on("disconnect", onDisconnect);
    socket.on("register-error", onRegisterError);
    socket.on("notification", onNotification);

    connectSocket();
    if (socket.connected) register();

    return () => {
      socket.off("connect", register);
      socket.off("disconnect", onDisconnect);
      socket.off("register-error", onRegisterError);
      socket.off("notification", onNotification);
      disconnectSocket();
    };
  }, [token, dismissToast]);

  const markRead = useCallback(
    async (id) => {
      const target = notifications.find((n) => n.id === id);
      if (!target || target.read) return;

      setNotifications((current) =>
        current.map((n) =>
          n.id === id ? { ...n, read: true } : n
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));

      await api(`/api/notifications/${id}/read`, {
        method: "PATCH",
        token,
      }).catch(() => {});
    },
    [notifications, token]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((n) => ({ ...n, read: true }))
    );
    setUnreadCount(0);

    await api("/api/notifications/read-all", {
      method: "PATCH",
      token,
    }).catch(() => {});
  }, [token]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts,
        connected,
        revision,
        markRead,
        markAllRead,
        dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
