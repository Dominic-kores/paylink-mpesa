import React from "react";

import { money } from "../api.js";

// Round up to a "nice" axis maximum: 1, 2, 2.5, 5 × 10^n
function niceMax(value) {
  if (value <= 0) return 1000;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find(
    (m) => m * power >= value
  );
  return step * power;
}

const compact = (value) =>
  new Intl.NumberFormat("en-KE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const longDate = (key) =>
  new Intl.DateTimeFormat("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(`${key}T12:00:00+03:00`));

// Single-series bar chart of completed payments per day
export default function PaymentsChart({ data }) {
  const max = niceMax(Math.max(...data.map((d) => d.total)));
  const ticks = [max, max / 2, 0];
  const empty = data.every((d) => d.total === 0);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">
          Payments received — last 7 days
        </h2>
        <p className="muted text-sm">
          {money(data.reduce((sum, d) => sum + d.total, 0))} this
          week
        </p>
      </div>

      <div className="relative mt-6 flex h-56 gap-2">
        {/* Y axis labels */}
        <div className="flex w-10 shrink-0 flex-col justify-between pb-6 text-right text-[11px] text-slate-400">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none">
              {compact(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Recessive gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => (
              <div
                key={t}
                className={`border-t ${
                  t === 0
                    ? "border-slate-300"
                    : "border-dashed border-slate-100"
                }`}
              />
            ))}
          </div>

          {empty && (
            <p className="absolute inset-x-0 top-1/3 text-center text-sm text-slate-400">
              No completed payments in the last 7 days
            </p>
          )}

          {/* Bars: the whole column is the hover target.
              Screen readers use the table below instead. */}
          <div
            className="absolute inset-0 flex"
            aria-hidden="true"
          >
            {data.map((day, index) => {
              const isToday = index === data.length - 1;
              const pct = (day.total / max) * 100;

              return (
                <div
                  key={day.date}
                  className="group relative flex h-full flex-1 flex-col items-center"
                >
                  <div className="relative flex w-full flex-1 items-end justify-center rounded-lg transition group-hover:bg-slate-50">
                    {day.total > 0 && (
                      <div
                        className="w-3/5 max-w-12 rounded-t bg-emerald-600 transition-[height] duration-300"
                        style={{
                          height: `${pct}%`,
                          minHeight: 4,
                        }}
                      />
                    )}

                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                      <p className="font-semibold">
                        {longDate(day.date)}
                      </p>
                      <p className="mt-0.5">
                        {money(day.total)} ·{" "}
                        {day.count}{" "}
                        {day.count === 1 ? "payment" : "payments"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`mt-2 h-4 text-xs ${
                      isToday
                        ? "font-bold text-slate-700"
                        : "text-slate-500"
                    }`}
                  >
                    {isToday ? "Today" : day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Same data for screen readers */}
      <table className="sr-only">
        <caption>Payments received per day, last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
            <th scope="col">Payments</th>
          </tr>
        </thead>
        <tbody>
          {data.map((day) => (
            <tr key={day.date}>
              <td>{longDate(day.date)}</td>
              <td>{money(day.total)}</td>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
