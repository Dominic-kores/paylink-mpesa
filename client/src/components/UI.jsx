import React from "react";

import { QRCodeSVG } from "qrcode.react";

import { paymentUrl } from "../api.js";

// Display error or success messages
export function Alert({
  children,
  tone = "error",
}) {
  const style =
    tone === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-rose-50 border-rose-200 text-rose-700";

  return (
    <div
      role="alert"
      className={`rounded-xl border px-4 py-3 text-sm ${style}`}
    >
      {children}
    </div>
  );
}

// Show a payment status badge
export function Status({ status }) {
  const colors = {
    completed:
      "bg-emerald-100 text-emerald-800",

    pending:
      "bg-amber-100 text-amber-800",

    failed:
      "bg-rose-100 text-rose-800",
  };

  const color =
    colors[status] ||
    "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${color}`}
    >
      {status}
    </span>
  );
}

// Generate a QR code for a payment link
export function QR({ slug }) {
  return (
    <div
      className="w-fit rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
      aria-label="QR code for payment page"
    >
      <QRCodeSVG
        value={paymentUrl(slug)}
        size={116}
        marginSize={1}
      />
    </div>
  );
}

// Copy the generated payment URL
export function CopyButton({
  value,
  children = "Copy link",
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      window.prompt(
        "Copy this link:",
        value
      );
    }
  }

  return (
    <button
      className="btn-outline"
      onClick={copy}
      type="button"
    >
      {copied ? "Copied!" : children}
    </button>
  );
}