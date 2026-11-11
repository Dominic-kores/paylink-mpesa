import rateLimit from "express-rate-limit";

// Forward asynchronous errors to Express
export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Basic rate limiting
export const limiter = (max) =>
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
