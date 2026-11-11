import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { useNotifications } from "../context/NotificationContext.jsx";

const timeAgo = (value) => {
  const seconds = Math.round(
    (Date.now() - new Date(value).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function BellIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    connected,
    markRead,
    markAllRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;

    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${
          unreadCount ? `, ${unreadCount} unread` : ""
        }`}
        aria-expanded={open}
      >
        <BellIcon />

        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-bold">Notifications</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
                {connected ? "Live" : "Reconnecting…"}
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-emerald-700 hover:underline"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                No notifications yet. You’ll see payments here
                the moment they arrive.
              </li>
            )}

            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    n.read ? "" : "bg-emerald-50/50"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      n.type === "payment_failed"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {n.type === "payment_failed" ? "!" : "✓"}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {n.title}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">
                      {n.message}
                    </span>
                  </span>

                  {!n.read && (
                    <span
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                      aria-label="Unread"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
