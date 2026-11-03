import React, { useState } from "react";

import { Link } from "react-router-dom";

import {
  api,
  paymentUrl,
} from "../api.js";

import {
  Alert,
  CopyButton,
  QR,
} from "../components/UI.jsx";

export default function Create({ token }) {
  const [form, setForm] = useState({
    amount: "",
    description: "",
    slug: "",
  });

  const [created, setCreated] = useState(null);

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  // Update form fields
  function update(e) {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  // Submit the new payment link
  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setCreated(null);

    try {
      const data = await api("/api/links", {
        method: "POST",
        token,

        body: {
          ...form,

          amount: Number(form.amount),

          slug: form.slug.trim().toLowerCase(),
        },
      });

      setCreated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">
        Create payment link
      </h1>

      <p className="muted mt-1">
        Set the price once so your client cannot
        accidentally pay a different amount.
      </p>

      <section className="card mt-6">
        <form
          onSubmit={submit}
          className="space-y-5"
        >
          {/* Amount */}
          <label className="label">
            Amount (KES)

            <input
              className="input"
              name="amount"
              type="number"
              min="1"
              max="150000"
              step="1"
              required
              placeholder="15000"
              value={form.amount}
              onChange={update}
            />
          </label>

          {/* Description */}
          <label className="label">
            Description

            <input
              className="input"
              name="description"
              maxLength="150"
              minLength="3"
              required
              placeholder="Logo design - Acme Corp"
              value={form.description}
              onChange={update}
            />
          </label>

          {/* Optional slug */}
          <label className="label">
            Custom slug (optional)

            <input
              className="input"
              name="slug"
              pattern="[a-z0-9-]{3,50}"
              title="Lowercase letters, digits and dashes, 3–50 characters"
              placeholder="logo-design"
              value={form.slug}
              onChange={update}
            />

            <small className="muted font-normal">
              Leave empty to generate a unique
              8-character slug.
            </small>
          </label>

          {error && <Alert>{error}</Alert>}

          <button
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading
              ? "Creating…"
              : "Generate payment link"}
          </button>
        </form>
      </section>

      {/* Success screen */}
      {created && (
        <section className="card mt-6 space-y-4 border-emerald-200">
          <Alert tone="success">
            Payment link created successfully!
          </Alert>

          <p className="break-all rounded-lg bg-slate-50 p-3 font-mono text-sm">
            {paymentUrl(created.slug)}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <CopyButton
              value={paymentUrl(created.slug)}
            />

            <Link
              to={`/pay/${created.slug}`}
              className="btn-outline"
            >
              Open payment page
            </Link>
          </div>

          <QR slug={created.slug} />

          <Link
            className="link inline-block"
            to="/dashboard"
          >
            View all payment links
          </Link>
        </section>
      )}
    </div>
  );
}