const BASE = "https://apiv2.shiprocket.in/v1/external";
const REQUEST_TIMEOUT_MS = 15_000;

let cachedToken = null;
let tokenExpiry = 0;
let loginPromise = null;
let loginBlockedUntil = 0;

export class ShiprocketConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShiprocketConfigurationError";
  }
}

export class ShiprocketApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ShiprocketApiError";
    this.status = status;
  }
}

const tokenExpiration = (token) => {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(decoded.exp) ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
};

const parseResponse = async (response) => {
  let data = {};
  try {
    data = await response.json();
  } catch {
    if (response.ok) {
      throw new ShiprocketApiError("Shiprocket returned an invalid response.");
    }
  }

  if (!response.ok) {
    throw new ShiprocketApiError(
      `Shiprocket request failed (HTTP ${response.status}).`,
      response.status,
    );
  }

  return data;
};

const getToken = async () => {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (Date.now() < loginBlockedUntil) {
    throw new ShiprocketApiError(
      "Shiprocket authentication is temporarily unavailable.",
      503,
    );
  }
  if (loginPromise) return loginPromise;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) {
    throw new ShiprocketConfigurationError(
      "Shiprocket credentials are not configured.",
    );
  }

  loginPromise = (async () => {
    const response = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
    const data = await parseResponse(response);
    if (typeof data.token !== "string" || !data.token) {
      throw new ShiprocketApiError(
        "Shiprocket authentication returned no token.",
      );
    }

    cachedToken = data.token;
    const expiresAt = tokenExpiration(cachedToken);
    tokenExpiry = expiresAt
      ? Math.min(expiresAt - 5 * 60 * 1000, Date.now() + 9 * 24 * 60 * 60 * 1000)
      : Date.now() + 6 * 60 * 60 * 1000;
    if (tokenExpiry <= Date.now()) {
      cachedToken = null;
      throw new ShiprocketApiError(
        "Shiprocket returned a token that is about to expire.",
      );
    }
    loginBlockedUntil = 0;
    return cachedToken;
  })();

  try {
    return await loginPromise;
  } catch (error) {
    cachedToken = null;
    tokenExpiry = 0;
    loginBlockedUntil = Date.now() + 60_000;
    throw error;
  } finally {
    loginPromise = null;
  }
};

export const srFetch = async (
  path,
  { method = "GET", body, retry = true } = {},
) => {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  ) {
    throw new Error("Invalid Shiprocket API path.");
  }
  const url = new URL(path.slice(1), `${BASE}/`);
  if (
    url.origin !== new URL(BASE).origin ||
    !url.pathname.startsWith("/v1/external/")
  ) {
    throw new Error("Invalid Shiprocket API path.");
  }

  const token = await getToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "error",
  });

  if (response.status === 401 && retry) {
    cachedToken = null;
    tokenExpiry = 0;
    return srFetch(path, { method, body, retry: false });
  }

  return parseResponse(response);
};

export const resetShiprocketToken = () => {
  cachedToken = null;
  tokenExpiry = 0;
  loginBlockedUntil = 0;
};
