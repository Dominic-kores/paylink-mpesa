import React, {
  useEffect,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  api,
  downloadCSV,
  money,
  paymentUrl,
} from "../api.js";

import {
  Alert,
  CopyButton,
  QR,
} from "../components/UI.jsx";

export default function Dashboard({ token }) {
  const [links, setLinks] = useState([]);

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(true);

  const [workingId, setWorkingId] = useState("");

  // Fetch payment links from the backend
  async function load() {
    try {
      const data = await api("/api/links", {
        token,
      });

      setLinks(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  // Activate or deactivate a payment link
  async function toggle(id) {
    setWorkingId(id);

    try {
      await api(`/api/links/${id}/toggle`, {
        method: "PATCH",
        token,
      });

      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorkingId("");
    }
  }

  // Download a CSV report
  async function csv(link) {
    try {
      await downloadCSV(
        link.id,
        link.slug,
        token
      );
    } catch (err) {
      setError(err.message);
    }
  }

  // Calculate overall dashboard statistics
  const payments = links.reduce(
    (total, link) =>
      total + link.completedPayments,
    0
  );

  const collected = links.reduce(
    (total, link) =>
      total + link.totalCollected,
    0
  );

  return (
    <div>
      {/* Dashboard header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            Your dashboard
          </h1>

          <p className="muted mt-1">
            Manage payment links and collections.
          </p>
        </div>

        <Link
          className="btn-primary"
          to="/create"
        >
          + Create link
        </Link>
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Summary statistics */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["Total links", links.length],
          ["Completed payments", payments],
          ["Total collected", money(collected)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="card"
          >
            <p className="muted text-sm">
              {label}
            </p>

            <p className="mt-2 text-2xl font-extrabold">
              {value}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-9 text-xl font-bold">
        Payment links
      </h2>

      {loading ? (
        <p className="mt-5">
          Loading your links…
        </p>
      ) : links.length === 0 ? (
        <div className="card mt-4 text-center">
          <h3 className="font-semibold">
            No payment links yet
          </h3>

          <p className="muted mt-1">
            Create your first link to start
            collecting payments.
          </p>

          <Link
            className="link mt-3 inline-block"
            to="/create"
          >
            Create one
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {links.map((link) => (
            <section
              className="card"
              key={link.id}
            >
              {/* Link description and status */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    {link.description}
                  </h3>

                  <p className="muted mt-1 text-sm">
                    /pay/{link.slug}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    link.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {link.active
                    ? "Active"
                    : "Inactive"}
                </span>
              </div>

              {/* Payment amount */}
              <p className="mt-4 text-2xl font-bold">
                {money(link.amount)}
              </p>

              {/* Collection statistics */}
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="muted">
                    Payments
                  </span>

                  <p className="font-semibold">
                    {link.completedPayments}
                  </p>
                </div>

                <div>
                  <span className="muted">
                    Collected
                  </span>

                  <p className="font-semibold">
                    {money(link.totalCollected)}
                  </p>
                </div>
              </div>

              {/* Link actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <CopyButton
                  value={paymentUrl(link.slug)}
                />

                <Link
                  className="btn-outline"
                  to={`/pay/${link.slug}`}
                >
                  Preview
                </Link>

                <button
                  className="btn-outline"
                  onClick={() => csv(link)}
                >
                  Download CSV
                </button>
              </div>

              {/* QR and activation control */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <QR slug={link.slug} />

                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    disabled={workingId === link.id}
                    checked={link.active}
                    onChange={() => toggle(link.id)}
                  />

                  Active link
                </label>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}