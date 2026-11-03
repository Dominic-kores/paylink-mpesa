import React, {
  useEffect,
  useState,
} from "react";

import { useParams } from "react-router-dom";

import {
  api,
  money,
} from "../api.js";

import { Alert } from "../components/UI.jsx";

export default function Pay() {
  const { slug } = useParams();

  const [link, setLink] = useState(null);

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState("");

  const [starting, setStarting] = useState(false);

  const [paymentId, setPaymentId] = useState("");

  // form -> processing -> success / failed / timeout
  const [state, setState] = useState("form");

  const [result, setResult] = useState(null);

  // ------------------------------------------------
  // 1. Fetch payment link details
  // ------------------------------------------------

  useEffect(() => {
    let canceled = false;

    api(
      `/api/links/${encodeURIComponent(slug)}`
    )
      .then((data) => {
        if (!canceled) {
          setLink(data);
        }
      })
      .catch((err) => {
        if (!canceled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [slug]);

  // ------------------------------------------------
  // 2. Initiate M-Pesa STK Push
  // ------------------------------------------------

  async function pay(e) {
    e.preventDefault();

    setError("");
    setStarting(true);

    try {
      const data = await api(
        "/api/mpesa/stkpush",
        {
          method: "POST",

          body: {
            linkSlug: slug,
            phoneNumber: phone,
          },
        }
      );

      setPaymentId(data.paymentId);

      setState("processing");
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  // ------------------------------------------------
  // 3. Poll payment status every 3 seconds
  // ------------------------------------------------

  useEffect(() => {
    if (!paymentId || state !== "processing") {
      return;
    }

    let canceled = false;
    let count = 0;

    const interval = setInterval(async () => {
      if (canceled) {
        return;
      }

      count++;

      try {
        const data = await api(
          `/api/payments/${encodeURIComponent(
            paymentId
          )}/poll`
        );

        if (canceled) {
          return;
        }

        if (data.status === "completed") {
          setResult(data);
          setState("success");
        } else if (data.status === "failed") {
          setResult(data);
          setState("failed");
        }
      } catch {
        // Temporary network errors do not mean
        // the customer payment has failed.
      }

      // Stop after 40 polling attempts
      if (count >= 40 && !canceled) {
        setState((current) =>
          current === "processing"
            ? "timeout"
            : current
        );
      }
    }, 3000);

    // Prevent memory leaks
    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [paymentId, state]);

  // ------------------------------------------------
  // 4. Loading state
  // ------------------------------------------------

  if (loading) {
    return (
      <p className="text-center">
        Loading payment page…
      </p>
    );
  }

  // ------------------------------------------------
  // 5. Invalid or inactive payment link
  // ------------------------------------------------

  if (!link) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-bold">
          Payment unavailable
        </h1>

        <div className="mt-4">
          <Alert>
            {error || "Payment link not found"}
          </Alert>
        </div>
      </div>
    );
  }

  // ------------------------------------------------
  // 6. Main customer payment interface
  // ------------------------------------------------

  return (
    <section className="card mx-auto max-w-lg">
      {/* Payment information */}
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">
          Secure M-Pesa payment
        </p>

        <h1 className="mt-2 text-2xl font-bold">
          {link.description}
        </h1>

        <div className="my-5 rounded-xl bg-emerald-50 p-5">
          <p className="muted text-sm">
            Amount due
          </p>

          <p className="mt-1 text-4xl font-extrabold text-emerald-700">
            {money(link.amount)}
          </p>
        </div>
      </div>

      {/* Customer payment form */}
      {state === "form" && (
        <form
          onSubmit={pay}
          className="space-y-4"
        >
          <label className="label">
            M-Pesa phone number

            <input
              className="input"
              required
              type="tel"
              autoComplete="tel"
              placeholder="0712345678"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
            />
          </label>

          <p className="muted text-xs">
            The payment amount is fixed.
            An STK Push request will be sent
            to your handset.
          </p>

          {error && <Alert>{error}</Alert>}

          <button
            className="btn-primary w-full"
            disabled={starting}
          >
            {starting
              ? "Sending STK Push…"
              : `Pay ${money(link.amount)} now`}
          </button>
        </form>
      )}

      {/* Processing state */}
      {state === "processing" && (
        <div
          className="py-8 text-center"
          role="status"
        >
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />

          <h2 className="text-xl font-bold">
            Check your phone
          </h2>

          <p className="muted mt-2">
            Enter your M-Pesa PIN to approve
            the payment. We are checking
            your payment status…
          </p>
        </div>
      )}

      {/* Successful payment */}
      {state === "success" && (
        <div className="py-6 text-center">
          <p className="text-5xl">✓</p>

          <h2 className="mt-3 text-2xl font-bold text-emerald-700">
            Payment confirmed
          </h2>

          <p className="muted mt-2">
            Thank you for your payment of{" "}
            {money(link.amount)}.
          </p>

          <p className="mt-3 text-sm">
            Receipt:{" "}
            <b>
              {result?.receipt ||
                "Pending receipt details"}
            </b>
          </p>
        </div>
      )}

      {/* Failed payment */}
      {state === "failed" && (
        <div className="py-6 text-center">
          <h2 className="text-2xl font-bold text-rose-700">
            Payment not completed
          </h2>

          <p className="muted mt-3">
            {result?.resultDesc ||
              "The transaction was unsuccessful."}
          </p>

          <button
            className="btn-primary mt-5"
            onClick={() => {
              setPaymentId("");
              setState("form");
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Timeout state */}
      {state === "timeout" && (
        <div className="py-6 text-center">
          <h2 className="text-xl font-bold">
            Confirmation is taking longer
          </h2>

          <p className="muted mt-3">
            We have not received a final result.
            Do not pay again until you check
            your M-Pesa messages or confirm
            with the merchant.
          </p>

          <button
            className="btn-outline mt-4"
            onClick={() =>
              setState("processing")
            }
          >
            Keep checking
          </button>
        </div>
      )}

      <p className="muted mt-8 border-t border-slate-100 pt-4 text-center text-xs">
        Powered by Safaricom Daraja.
        Never enter your M-Pesa PIN
        on this website.
      </p>
    </section>
  );
}