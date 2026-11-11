export const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5001"
).replace(/\/$/, "");

// General reusable API function
export async function api(
  path,
  {
    method = "GET",
    body,
    token,
  } = {}
) {
  const response = await fetch(
    `${BASE_URL}${path}`,
    {
      method,

      headers: {
        ...(body
          ? {
              "Content-Type": "application/json",
            }
          : {}),

        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },

      body: body
        ? JSON.stringify(body)
        : undefined,

      cache: "no-store",
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        `Request failed (HTTP ${response.status})`
    );
  }

  return data;
}

// Download payment history as CSV
export async function downloadCSV(
  linkId,
  slug,
  token
) {
  const response = await fetch(
    `${BASE_URL}/api/links/${linkId}/payments.csv`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("CSV download failed");
  }

  const blob = await response.blob();

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = `${slug}-payments.csv`;

  document.body.append(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);
}

// Format amounts in Kenyan shillings
export const money = (value) =>
  `KES ${new Intl.NumberFormat("en-KE").format(
    value
  )}`;

// Generate a shareable payment URL
export const paymentUrl = (slug) =>
  `${window.location.origin}/pay/${slug}`;