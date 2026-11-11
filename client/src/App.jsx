import React, {
  useState,
} from "react";

import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import { api } from "./api.js";

import { Alert } from "./components/UI.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import ToastNotification from "./components/ToastNotification.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";

import Create from "./pages/Create.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Payments from "./pages/Payments.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";

// --------------------------------------------------
// Login component
// --------------------------------------------------

function Login({ onLogin }) {
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [working, setWorking] = useState(false);

  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();

    setError("");
    setWorking(true);

    try {
      const { token } = await api(
        "/api/admin/login",
        {
          method: "POST",

          body: {
            password,
          },
        }
      );

      onLogin(token);

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="card mx-auto mt-12 max-w-md">
      <h1 className="text-2xl font-bold">
        Dashboard sign in
      </h1>

      <p className="muted mt-1">
        Only the link owner can create
        links and review transactions.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={submit}
      >
        <label className="label">
          Admin password

          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
          />
        </label>

        {error && <Alert>{error}</Alert>}

        <button
          className="btn-primary w-full"
          disabled={working}
        >
          {working
            ? "Signing in…"
            : "Sign in"}
        </button>
      </form>
    </section>
  );
}

// --------------------------------------------------
// Main application
// --------------------------------------------------

export default function App() {
  // Training-project session persistence
  const [token, setToken] = useState(
    () =>
      sessionStorage.getItem(
        "paylink_admin_token"
      ) || ""
  );

  // Save JWT after login
  const login = (newToken) => {
    sessionStorage.setItem(
      "paylink_admin_token",
      newToken
    );

    setToken(newToken);
  };

  // Logout
  const logout = () => {
    sessionStorage.removeItem(
      "paylink_admin_token"
    );

    setToken("");
  };

  // Protect private frontend routes
  const guard = (element) =>
    token ? (
      element
    ) : (
      <Navigate
        to="/login"
        replace
      />
    );

  // Navigation styling
  const nav = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-emerald-50 text-emerald-700"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  const page = (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="container-main flex flex-wrap items-center justify-between gap-3 py-4">
          <Link
            to="/"
            className="text-2xl font-extrabold tracking-tight text-emerald-700"
          >
            PayLink
            <span className="text-slate-900">
              .
            </span>
          </Link>

          <nav
            className="flex flex-wrap items-center gap-1"
            aria-label="Main navigation"
          >
            {token && (
              <>
                <NavLink
                  className={nav}
                  to="/create"
                >
                  Create
                </NavLink>

                <NavLink
                  className={nav}
                  to="/dashboard"
                >
                  Dashboard
                </NavLink>

                <NavLink
                  className={nav}
                  to="/payments"
                >
                  Payments
                </NavLink>
              </>
            )}

            {token && <NotificationBell />}

            {token ? (
              <button
                className="btn-outline ml-2"
                onClick={logout}
              >
                Sign out
              </button>
            ) : (
              <Link
                className="btn-outline"
                to="/login"
              >
                Admin sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Application routes */}
      <main className="container-main py-8">
        <Routes>
          {/* Landing page */}
          <Route
            path="/"
            element={
              <div className="card mx-auto max-w-3xl py-12 text-center">
                <div className="mx-auto mb-5 w-fit rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
                  M-Pesa • Kenya
                </div>

                <h1 className="text-4xl font-extrabold tracking-tight">
                  Get paid with a simple link.
                </h1>

                <p className="muted mx-auto mt-4 max-w-xl text-lg">
                  Create a payment link,
                  share it with your customer
                  and collect through Safaricom
                  M-Pesa STK Push.
                </p>

                <Link
                  className="btn-primary mt-7 inline-block"
                  to={
                    token
                      ? "/create"
                      : "/login"
                  }
                >
                  Create payment link
                </Link>
              </div>
            }
          />

          {/* Admin login */}
          <Route
            path="/login"
            element={
              token ? (
                <Navigate
                  to="/dashboard"
                  replace
                />
              ) : (
                <Login onLogin={login} />
              )
            }
          />

          {/* Merchant-only routes */}
          <Route
            path="/create"
            element={guard(
              <Create token={token} />
            )}
          />

          <Route
            path="/dashboard"
            element={guard(
              <Dashboard token={token} />
            )}
          />

          <Route
            path="/payments"
            element={guard(
              <Payments token={token} />
            )}
          />

          {/* Public customer payment page */}
          <Route
            path="/pay/:slug"
            element={<PaymentPage />}
          />

          {/* 404 page */}
          <Route
            path="*"
            element={
              <div className="card text-center">
                <h1 className="text-2xl font-bold">
                  404 — Page not found
                </h1>

                <Link
                  className="link mt-4 inline-block"
                  to="/"
                >
                  Back home
                </Link>
              </div>
            }
          />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        PayLink v2 • M-Pesa via Daraja •
        Training project
      </footer>
    </div>
  );

  // Signed-in merchants get live notifications + toasts.
  // key={token} gives a fresh socket per session.
  return token ? (
    <NotificationProvider key={token} token={token}>
      {page}
      <ToastNotification />
    </NotificationProvider>
  ) : (
    page
  );
}