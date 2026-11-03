import React, {
  useEffect,
  useState,
} from "react";

import {
  api,
  money,
} from "../api.js";

import {
  Alert,
  Status,
} from "../components/UI.jsx";

export default function Payments({ token }) {
  const [status, setStatus] = useState("all");

  const [payments, setPayments] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // Load payment transactions
  useEffect(() => {
    let canceled = false;

    setLoading(true);

    const endpoint =
      status === "all"
        ? "/api/payments"
        : `/api/payments?status=${status}`;

    api(endpoint, { token })
      .then((data) => {
        if (!canceled) {
          setPayments(data);
          setError("");
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
  }, [status, token]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            Transaction history
          </h1>

          <p className="muted mt-1">
            Newest first. Numbers are masked for privacy.
          </p>
        </div>

        {/* Filter transactions */}
        <label className="text-sm font-semibold">
          Status

          <select
            className="input mt-1"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value)
            }
          >
            {[
              "all",
              "completed",
              "pending",
              "failed",
            ].map((item) => (
              <option
                key={item}
                value={item}
              >
                {item[0].toUpperCase() +
                  item.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Transaction table */}
      <div className="card mt-6 overflow-x-auto p-0!">
        {loading ? (
          <p className="p-6">
            Loading transactions…
          </p>
        ) : payments.length === 0 ? (
          <p className="muted p-6 text-center">
            No payments match this filter.
          </p>
        ) : (
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  "Date",
                  "Phone",
                  "Amount",
                  "Status",
                  "Receipt",
                  "Payment link",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-4 font-semibold"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-t border-slate-100"
                >
                  <td className="whitespace-nowrap px-5 py-4">
                    {new Date(
                      payment.createdAt
                    ).toLocaleString("en-KE")}
                  </td>

                  <td className="px-5 py-4">
                    {payment.phoneNumber}
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 font-medium">
                    {money(payment.amount)}
                  </td>

                  <td className="px-5 py-4">
                    <Status
                      status={payment.status}
                    />
                  </td>

                  <td className="px-5 py-4">
                    {payment.receipt || "—"}
                  </td>

                  <td className="px-5 py-4">
                    {payment.paymentLink?.slug ||
                      "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted mt-3 text-xs">
        Shows the latest 500 transactions.
        For a larger production app, add
        server-side pagination.
      </p>
    </div>
  );
}