import axios from "axios";

// Daraja base URL (sandbox by default)
const base = () =>
  (
    process.env.DARAJA_BASE_URL ||
    "https://sandbox.safaricom.co.ke"
  ).replace(/\/$/, "");

// HTTP client with timeout protection
const http = axios.create({
  timeout: 18000,
});

// Cache OAuth tokens to avoid unnecessary requests
let cache = {
  token: "",
  expiresAt: 0,
};

// STEP 1: Get Safaricom OAuth access token
export async function getAccessToken() {
  if (cache.token && Date.now() < cache.expiresAt) {
    return cache.token;
  }

  const key = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error("Daraja credentials are missing");
  }

  const basic = Buffer.from(
    `${key}:${secret}`
  ).toString("base64");

  const { data } = await http.get(
    `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${basic}`,
      },
    }
  );

  if (!data?.access_token) {
    throw new Error("Daraja did not return an access token");
  }

  cache = {
    token: data.access_token,
    expiresAt:
      Date.now() +
      Math.max(
        60,
        Number(data.expires_in || 3599) - 90
      ) * 1000,
  };

  return cache.token;
}

// STEP 2: Generate timestamp in Kenya's timezone
function timestampEAT() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const p = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return (
    `${p.year}${p.month}${p.day}` +
    `${p.hour}${p.minute}${p.second}`
  );
}

// STEP 3: Generate STK Push credentials
function credentials() {
  const BusinessShortCode =
    process.env.DARAJA_SHORTCODE;

  const passkey = process.env.DARAJA_PASSKEY;

  if (!BusinessShortCode || !passkey) {
    throw new Error("Daraja shortcode/passkey missing");
  }

  const Timestamp = timestampEAT();

  const Password = Buffer.from(
    `${BusinessShortCode}${passkey}${Timestamp}`
  ).toString("base64");

  return {
    BusinessShortCode,
    Password,
    Timestamp,
  };
}

// STEP 4: Convert Kenyan phone numbers to 254 format
export function formatPhone(input) {
  if (typeof input !== "string") {
    throw new Error("Phone number is required");
  }

  const digits = input.replace(/[\s+()-]/g, "");

  let number = digits;

  if (
    /^07\d{8}$/.test(digits) ||
    /^01\d{8}$/.test(digits)
  ) {
    number = `254${digits.slice(1)}`;
  } else if (
    /^7\d{8}$/.test(digits) ||
    /^1\d{8}$/.test(digits)
  ) {
    number = `254${digits}`;
  }

  if (!/^254[17]\d{8}$/.test(number)) {
    throw new Error(
      "Use a valid Kenyan phone, e.g. 0712345678"
    );
  }

  return number;
}

// STEP 5: Initiate an M-Pesa STK Push
export async function sendSTK({
  phone,
  amount,
  slug,
  description,
}) {
  const token = await getAccessToken();

  const creds = credentials();

  const publicURL = (
    process.env.BACKEND_PUBLIC_URL || ""
  ).replace(/\/$/, "");

  if (!/^https:\/\//.test(publicURL)) {
    throw new Error(
      "BACKEND_PUBLIC_URL must be a public HTTPS URL"
    );
  }

  const callbackToken =
    process.env.MPESA_CALLBACK_TOKEN;

  if (!callbackToken || callbackToken.length < 32) {
    throw new Error(
      "MPESA_CALLBACK_TOKEN must be at least 32 characters"
    );
  }

  const { data } = await http.post(
    `${base()}/mpesa/stkpush/v1/processrequest`,
    {
      ...creds,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: creds.BusinessShortCode,
      PhoneNumber: phone,

      CallBackURL:
        `${publicURL}/api/mpesa/callback?token=` +
        encodeURIComponent(callbackToken),

      AccountReference: slug.slice(0, 12),
      TransactionDesc: description.slice(0, 100),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
}

// STEP 6: Query the status of an STK transaction
export async function querySTK(checkoutRequestId) {
  const token = await getAccessToken();

  const { data } = await http.post(
    `${base()}/mpesa/stkpushquery/v1/query`,
    {
      ...credentials(),
      CheckoutRequestID: checkoutRequestId,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
}