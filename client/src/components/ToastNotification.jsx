import React from "react";

import { useNotifications } from "../context/NotificationContext.jsx";

// Pops up in the corner when a live notification arrives
export default function ToastNotification() {
  const { toasts, dismissToast } = useNotifications();

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const failed = toast.type === "payment_failed";

        return (
          <div
            key={toast.id}
            role="status"
            className={`toast-in pointer-events-auto flex gap-3 rounded-2xl border bg-white p-4 shadow-lg ${
              failed ? "border-rose-200" : "border-emerald-200"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold ${
                failed
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {failed ? "!" : "✓"}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{toast.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              className="self-start text-slate-400 hover:text-slate-700"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
