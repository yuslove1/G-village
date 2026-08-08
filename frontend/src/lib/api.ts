import type { Money } from "./utils";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/**
 * The access token lives in memory only. Putting it in localStorage means any
 * injected script can read it, and the refresh cookie is httpOnly precisely so
 * a page compromise cannot mint new sessions.
 */
let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotencyKey?: string;
  skipRefresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, skipRefresh, ...init } = options;

  const headers = new Headers(init.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include", // carries the refresh cookie
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // One retry after a silent refresh. Guarded by a shared promise so ten
  // parallel requests hitting a stale token do not fire ten refreshes.
  if (res.status === 401 && !skipRefresh) {
    const refreshed = await (refreshPromise ??= doRefresh().finally(() => {
      refreshPromise = null;
    }));
    if (refreshed) return request<T>(path, { ...options, skipRefresh: true });
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "unknown",
      err?.message ?? "Something went wrong. Try again.",
      err?.fields,
    );
  }

  return payload as T;
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

/** Fresh key per attempt so a genuine retry is not mistaken for a duplicate. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// ------------------------------------------------------------------- types

export interface Listing {
  id: string;
  reference: string;
  title: string;
  category: string;
  tier: "NEW" | "UK_USED" | "NG_USED";
  price: Money;
  saving: Money | null;
  grade: string | null;
  batteryHealth: number | null;
  photos: string[];
  inStock: boolean;
  publishedAt: string | null;
}

export interface ListingDetail extends Listing {
  description: string | null;
  verified: boolean;
  specs: Record<string, unknown> | null;
}

export interface OrderSummary {
  reference: string;
  status: string;
  total: Money;
  itemCount: number;
  title: string;
  createdAt: string;
}

export interface Quote {
  offer: Money;
  suggestedList: Money;
  confidence: "high" | "medium" | "low";
  breakdown: Array<{ label: string; amount: Money }>;
  validUntil: string;
}

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: "BUYER" | "SELLER" | "AGENT" | "ADMIN";
  phoneVerified: boolean;
  city: string | null;
  state: string | null;
}

// ---------------------------------------------------------------- endpoints

export const api = {
  auth: {
    register: (body: { fullName: string; phone: string; email?: string; password: string }) =>
      request<{ user: User; accessToken: string }>("/auth/register", { method: "POST", body }),

    login: (body: { identifier: string; password: string }) =>
      request<{ user: User; accessToken: string }>("/auth/login", { method: "POST", body }),

    logout: () => request<void>("/auth/logout", { method: "POST" }),

    me: () => request<{ user: User }>("/auth/me"),

    sendOtp: () => request<{ sent: boolean }>("/auth/otp/send", { method: "POST" }),

    verifyOtp: (code: string) =>
      request<{ verified: boolean }>("/auth/otp/verify", { method: "POST", body: { code } }),
  },

  catalog: {
    listings: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      );
      return request<{ listings: Listing[]; nextCursor: string | null }>(
        `/catalog/listings?${q.toString()}`,
      );
    },

    listing: (reference: string) =>
      request<{ listing: ListingDetail }>(`/catalog/listings/${reference}`),

    products: () =>
      request<{ products: Array<{ id: string; brand: string; model: string; variant: string | null; category: string; baseNew: Money }> }>(
        "/catalog/products",
      ),
  },

  orders: {
    create: (body: unknown, key: string) =>
      request<{ order: { reference: string; total: Money; reservedUntil: string } }>("/orders", {
        method: "POST",
        body,
        idempotencyKey: key,
      }),

    list: () => request<{ orders: OrderSummary[] }>("/orders"),

    get: (reference: string) => request<{ order: Record<string, unknown> }>(`/orders/${reference}`),

    pay: (reference: string, channel: string, key: string) =>
      request<{ payment: { reference: string; authorizationUrl: string | null } }>(
        `/orders/${reference}/pay`,
        { method: "POST", body: { channel }, idempotencyKey: key },
      ),

    confirm: (reference: string, paymentReference: string) =>
      request<{ paid: boolean }>(`/orders/${reference}/confirm`, {
        method: "POST",
        body: { paymentReference },
      }),

    receipt: (reference: string) =>
      request<{ receipt: Record<string, unknown> }>(`/orders/${reference}/receipt`),
  },

  sales: {
    quote: (body: unknown) => request<{ quote: Quote }>("/sales/quote", { method: "POST", body }),

    create: (body: unknown) =>
      request<{ sale: { reference: string; offer: Money; status: string } }>("/sales", {
        method: "POST",
        body,
      }),

    list: () => request<{ sales: Array<Record<string, unknown>> }>("/sales"),
  },
};
