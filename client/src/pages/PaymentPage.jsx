// client/src/pages/PaymentPage.jsx
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";

import { api, money } from "../api.js";
import { Alert } from "../components/UI.jsx";
import { socket, connectSocket, disconnectSocket } from "../socket.js";

// Fallback polling while the socket does the real work. The
// poll also triggers the server's Daraja status query when
// Safaricom's callback is slow or never arrives (common in
// the sandbox).
const FALLBACK_POLL_MS = 10000;
const TIMEOUT_MS = 120000;

export default function PaymentPage() {
  const { slug } = useParams();
  const [paymentLink, setPaymentLink] = useState(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle, initiating, waiting, completed, failed, timeout
  const [paymentResult, setPaymentResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  // The payment this browser started. Status events for other
  // customers paying the same link are ignored.
  const paymentIdRef = useRef(null);

  // Fetch payment link details
  useEffect(() => {
    let canceled = false;

    api(`/api/links/${encodeURIComponent(slug)}`)
      .then((data) => !canceled && setPaymentLink(data))
      .catch((err) => !canceled && setError(err.message))
      .finally(() => !canceled && setLoading(false));

    return () => {
      canceled = true;
    };
  }, [slug]);

  // Set up WebSocket for real-time status updates
  const paymentLinkId = paymentLink?.id;

  useEffect(() => {
    if (!paymentLinkId) return;

    // Re-watch on every (re)connect: the server forgets
    // a socket when it disconnects.
    const watch = () => {
      socket.emit("watch-payment", paymentLinkId);
      setLive(true);
    };
    const onDisconnect = () => setLive(false);

    const onStatus = (data) => {
      if (!paymentIdRef.current || data.paymentId !== paymentIdRef.current) {
        return;
      }

      if (data.status === "processing") {
        setStatus("waiting");
      } else if (data.status === "completed") {
        setStatus("completed");
        setPaymentResult(data);
      } else if (data.status === "failed") {
        setStatus("failed");
        setError(data.reason || "Payment was not completed");
      }
    };

    socket.on("connect", watch);
    socket.on("disconnect", onDisconnect);
    socket.on("payment-status", onStatus);

    connectSocket();
    if (socket.connected) watch();

    return () => {
      socket.off("connect", watch);
      socket.off("disconnect", onDisconnect);
      socket.off("payment-status", onStatus);
      disconnectSocket();
    };
  }, [paymentLinkId]);

  // Fallback poll + timeout while waiting for the payer's PIN
  useEffect(() => {
    if (status !== "waiting" || !paymentIdRef.current) return;

    let canceled = false;
    const paymentId = paymentIdRef.current;

    const interval = setInterval(async () => {
      try {
        const data = await api(
          `/api/payments/${encodeURIComponent(paymentId)}/poll`
        );
        if (canceled) return;

        if (data.status === "completed") {
          setStatus("completed");
          setPaymentResult({
            amount: data.amount,
            mpesaReceiptNumber: data.receipt,
            paidAt: data.paidAt,
          });
        } else if (data.status === "failed") {
          setStatus("failed");
          setError(data.resultDesc || "Payment was not completed");
        }
      } catch {
        // A network blip does not mean the payment failed
      }
    }, FALLBACK_POLL_MS);

    const timeout = setTimeout(() => {
      if (!canceled) setStatus("timeout");
    }, TIMEOUT_MS);

    return () => {
      canceled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [status]);

  const handlePay = async (e) => {
    e.preventDefault();
    setStatus("initiating");
    setError("");

    try {
      const data = await api("/api/payments/initiate", {
        method: "POST",
        body: {
          paymentLinkId: paymentLink.id,
          phone,
          email,
        },
      });

      if (data.success) {
        paymentIdRef.current = data.paymentId;
        setStatus("waiting");
      } else {
        setStatus("idle");
        setError(data.error || "Failed to initiate payment");
      }
    } catch (err) {
      setStatus("idle");
      setError(err.message || "Something went wrong. Please try again.");
    }
  };

  if (loading) {
    return <p className="text-center">Loading...</p>;
  }

  if (!paymentLink) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-bold">Payment unavailable</h1>
        <div className="mt-4">
          <Alert>{error || "Payment link not found"}</Alert>
        </div>
      </div>
    );
  }

  return (
    <section className="card mx-auto max-w-lg">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">
          {paymentLink.merchantName}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{paymentLink.description}</h1>
        <div className="my-5 rounded-xl bg-emerald-50 p-5">
          <p className="muted text-sm">Amount due</p>
          <p className="mt-1 text-4xl font-extrabold text-emerald-700">
            {money(paymentLink.amount)}
          </p>
        </div>
      </div>

      {/* Live status: Waiting for payment -> Processing -> Payment received */}
      {status !== "failed" && status !== "timeout" && (
        <StatusSteps status={status} live={live} />
      )}

      {/* Payment Form */}
      {status === "idle" && (
        <form onSubmit={handlePay} className="space-y-4">
          <label className="label">
            M-Pesa Phone Number
            <input
              className="input"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678"
              required
            />
          </label>

          <label className="label">
            Email (for receipt){" "}
            <span className="font-normal text-slate-400">(optional)</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {error && <Alert>{error}</Alert>}

          <button type="submit" className="btn-primary w-full">
            Pay {money(paymentLink.amount)}
          </button>
        </form>
      )}

      {/* Initiating */}
      {status === "initiating" && (
        <div className="py-8 text-center" role="status">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="text-slate-700">
            Sending payment request to your phone...
          </p>
        </div>
      )}

      {/* Waiting for Payment */}
      {status === "waiting" && (
        <div className="py-8 text-center" role="status">
          <span className="relative mx-auto mb-5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-amber-500" />
          </span>
          <p className="text-slate-700">
            Check your phone for the M-Pesa prompt.
            <br />
            Enter your PIN to complete the payment.
          </p>
          <p className="mt-3 text-xs italic text-slate-400">
            This page will update automatically when the payment is confirmed.
          </p>
        </div>
      )}

      {/* Payment Completed */}
      {status === "completed" && paymentResult && (
        <div className="rounded-xl bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-xl font-bold text-white">
            ✓
          </div>
          <h2 className="text-xl font-bold text-emerald-800">
            Payment Successful
          </h2>
          <p className="mt-1 text-slate-700">
            {money(paymentResult.amount ?? paymentLink.amount)} paid
            successfully.
          </p>

          <dl className="mt-5 text-left text-sm">
            <div className="flex justify-between border-b border-emerald-100 py-2">
              <dt className="text-slate-500">M-Pesa Receipt</dt>
              <dd className="font-semibold">
                {paymentResult.mpesaReceiptNumber || "Pending"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-emerald-100 py-2">
              <dt className="text-slate-500">Date</dt>
              <dd className="font-semibold">
                {new Date(paymentResult.paidAt || Date.now()).toLocaleDateString(
                  "en-KE",
                  { dateStyle: "medium" }
                )}
              </dd>
            </div>
          </dl>

          {email && (
            <p className="mt-4 text-sm text-slate-500">
              A receipt has been sent to {email}
            </p>
          )}
        </div>
      )}

      {/* Payment Failed */}
      {status === "failed" && (
        <div className="rounded-xl bg-rose-50 p-6 text-center">
          <p className="text-lg font-bold text-rose-700">
            Payment Not Completed
          </p>
          <p className="mt-2 text-slate-700">{error}</p>
          <button
            onClick={() => {
              paymentIdRef.current = null;
              setStatus("idle");
              setError("");
            }}
            className="btn-primary mt-4"
          >
            Try Again
          </button>
        </div>
      )}

      {/* No result after 2 minutes */}
      {status === "timeout" && (
        <div className="py-6 text-center">
          <h2 className="text-xl font-bold">Confirmation is taking longer</h2>
          <p className="muted mt-3">
            We have not received a final result. Do not pay again until you
            check your M-Pesa messages or confirm with the merchant.
          </p>
          <button className="btn-outline mt-4" onClick={() => setStatus("waiting")}>
            Keep checking
          </button>
        </div>
      )}

      <p className="muted mt-8 border-t border-slate-100 pt-4 text-center text-xs">
        Powered by Safaricom Daraja. Never enter your M-Pesa PIN on this
        website.
      </p>
    </section>
  );
}

const STEPS = [
  ["Waiting for payment...", "Waiting for payment"],
  ["Processing...", "Processing"],
  ["Payment received!", "Payment received"],
];

// "Waiting for payment..." -> "Processing..." -> "Payment received!"
function StatusSteps({ status, live }) {
  const current = status === "completed" ? 2 : status === "waiting" ? 1 : 0;

  return (
    <div className="mb-6">
      <ol className="grid grid-cols-3" aria-label="Payment status">
        {STEPS.map(([activeLabel, label], index) => {
          const done = index < current || status === "completed";
          const active = index === current && status !== "completed";

          return (
            <li
              key={label}
              className="relative flex flex-col items-center text-center"
              aria-current={active ? "step" : undefined}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${
                    done || active ? "bg-emerald-600" : "bg-slate-200"
                  }`}
                />
              )}

              <span
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white ${
                  done
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-300 opacity-60" />
                )}
                <span className="relative">{done ? "✓" : index + 1}</span>
              </span>

              <span
                className={`mt-2 px-1 text-xs font-semibold leading-tight ${
                  done || active ? "text-slate-800" : "text-slate-400"
                }`}
              >
                {active || (done && index === 2) ? activeLabel : label}
              </span>
            </li>
          );
        })}
      </ol>

      <p
        className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400"
        role="status"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            live ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
        {live ? "Live updates on" : "Connecting for live updates..."}
      </p>
    </div>
  );
}
