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

/** Same auth + refresh-retry shape as request(), but for a binary response. */
async function requestBlob(path: string, skipRefresh = false): Promise<Blob> {
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { headers, credentials: "include" });

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await (refreshPromise ??= doRefresh().finally(() => {
      refreshPromise = null;
    }));
    if (refreshed) return requestBlob(path, true);
  }

  if (!res.ok) {
    throw new ApiError(res.status, "unknown", "Could not download that file.");
  }

  return res.blob();
}

/**
 * Multipart upload, kept separate from request() rather than folding a
 * FormData branch into it — request() always JSON-encodes body and sets
 * Content-Type itself, which is exactly wrong here: FormData needs the
 * browser to set its own multipart boundary, so Content-Type must be left
 * unset entirely.
 */
export async function uploadPhotos(files: File[], skipRefresh = false): Promise<string[]> {
  const form = new FormData();
  for (const file of files) form.append("photos", file);

  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}/uploads`, {
    method: "POST",
    headers,
    credentials: "include",
    body: form,
  });

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await (refreshPromise ??= doRefresh().finally(() => {
      refreshPromise = null;
    }));
    if (refreshed) return uploadPhotos(files, true);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(res.status, err?.code ?? "unknown", err?.message ?? "Could not upload that photo.");
  }

  return payload.urls as string[];
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

export interface SaleSummary {
  reference: string;
  title: string;
  status: string;
  mode: "DIRECT" | "COMMISSION";
  offer: Money;
  finalOffer: Money | null;
  pickupAt: string | null;
  inspected: boolean;
  createdAt: string;
}

export interface Alert {
  id: string;
  product: { id: string; title: string; category: string } | null;
  query: string | null;
  tiers: Array<"NEW" | "UK_USED" | "NG_USED">;
  maxPrice: Money | null;
  viaPush: boolean;
  viaEmail: boolean;
  viaSms: boolean;
  isActive: boolean;
  lastFiredAt: string | null;
  createdAt: string;
  matchCount: number;
}

export interface PayoutAccount {
  id: string;
  bankName: string;
  accountLast4: string;
  accountName: string;
  isDefault: boolean;
}

export interface RecentPayout {
  reference: string;
  device: string;
  amount: Money;
  paidAt: string;
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  phone: string;
  isDefault: boolean;
  createdAt: string;
}

export interface SavedCard {
  id: string;
  last4: string;
  expMonth: string;
  expYear: string;
  cardType: string;
  bank: string | null;
  isDefault: boolean;
}

export interface OrderDetail {
  reference: string;
  status: string;
  subtotal: Money;
  tradeIn: Money;
  delivery: Money;
  total: Money;
  reservedUntil: string | null;
  deliveredAt: string | null;
  createdAt: string;
  address: { label: string; line1: string; city: string; state: string } | null;
  items: Array<{ title: string; quantity: number; unitPrice: Money; lineTotal: Money; tier: string }>;
  timeline: Array<{ status: string; note: string | null; at: string }>;
  payment: { status: string; channel: string; paidAt: string | null } | null;
}

export interface Receipt {
  reference: string;
  issuedAt: string;
  paid: boolean;
  lines: Array<{ description: string; quantity: number; amount: Money }>;
  tradeInCredit: Money | null;
  delivery: Money;
  total: Money;
  deliverTo: string | null;
}

export interface AdminAction {
  type: "confirm_sourcing" | "inspect" | "pay_seller";
  label: string;
  detail: string;
  href: string;
  urgency: "urgent" | "today" | "due";
}

export interface AdminOverview {
  today: { revenue: Money; orders: number };
  queues: { toFulfil: number; inspections: number; pendingPayouts: number };
  ledger: { balanced: boolean; delta: string };
  actions: AdminAction[];
}

export interface AdminPayoutDue {
  userId: string;
  name: string;
  phone: string;
  balance: Money;
  hasPayoutAccount: boolean;
}

export interface AdminOrder {
  reference: string;
  status: string;
  customer: string;
  phone: string;
  location: string | null;
  total: Money;
  cost: Money;
  margin: Money;
  vendor: string | null;
  vendorPhone: string | null;
  title: string;
  createdAt: string;
}

export interface AdminListing {
  reference: string;
  title: string;
  tier: "NEW" | "UK_USED" | "NG_USED";
  status: string;
  stockCount: number;
  price: Money;
  vendor: string;
  updatedAt: string;
}

export interface AdminVendor {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  location: string;
  supplies: string[];
  ordersFilled: number;
  marginPercent: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  order: number;
}

export interface InspectionQueueItem {
  reference: string;
  device: string;
  claimedGrade: string;
  claimedBattery: number | null;
  offer: Money;
  mode: "DIRECT" | "COMMISSION";
  pickupAt: string | null;
  pickupAddress: string | null;
  photos: string[];
  status: string;
  seller: { name: string; phone: string; city: string | null } | null;
  assignedAgent: { id: string; name: string } | null;
}

export interface AdminAnalytics {
  revenue: Money;
  margin: Money;
  marginPercent: string;
  orderCount: number;
  avgOrder: Money;
  growthPercent: number | null;
  revenueSeries: Array<{ date: string; revenue: Money }>;
  topSellers: Array<{ model: string; unitsSold: number; margin: Money }>;
}

export interface AdminAgent {
  id: string;
  fullName: string;
  city: string | null;
  state: string | null;
  inspectionsThisMonth: number;
  status: "ACTIVE" | "ONBOARDING";
}

export interface AgentStats {
  today: { completed: number };
  thisWeek: { completed: number };
  thisMonth: { completed: number; approved: number; rejected: number };
  queue: { assignedToMe: number; openForClaim: number };
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
  notifyOrderUpdates: boolean;
  notifyPriceAlerts: boolean;
  notifyMarketing: boolean;
}

// ---------------------------------------------------------------- endpoints

export const api = {
  auth: {
    register: (body: { fullName: string; phone: string; email?: string; password: string }) =>
      // devOtp only ever arrives outside production — the backend has no SMS
      // provider wired up yet, so this is how a dev completes their own
      // phone verification without one.
      request<{ user: User; accessToken: string; devOtp?: string }>("/auth/register", {
        method: "POST",
        body,
      }),

    login: (body: { identifier: string; password: string }) =>
      request<{ user: User; accessToken: string }>("/auth/login", { method: "POST", body }),

    logout: () => request<void>("/auth/logout", { method: "POST" }),

    google: (idToken: string) =>
      request<
        | { needsPhone: false; user: User; accessToken: string }
        | { needsPhone: true; signupToken: string; fullName: string; email: string }
      >("/auth/google", { method: "POST", body: { idToken } }),

    googleComplete: (body: { signupToken: string; phone: string }) =>
      request<{ user: User; accessToken: string; devOtp?: string }>("/auth/google/complete", {
        method: "POST",
        body,
      }),

    me: () => request<{ user: User }>("/auth/me"),

    sendOtp: () => request<{ sent: boolean }>("/auth/otp/send", { method: "POST" }),

    verifyOtp: (code: string) =>
      request<{ verified: boolean }>("/auth/otp/verify", { method: "POST", body: { code } }),

    updateNotifications: (
      body: Partial<Pick<User, "notifyOrderUpdates" | "notifyPriceAlerts" | "notifyMarketing">>,
    ) => request<{ user: User }>("/auth/notifications", { method: "PATCH", body }),
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
    create: (
      body: {
        addressId?: string;
        items: Array<{ listingId: string; quantity: number }>;
        tradeIn?: { productId: string; grade: string; batteryHealth?: number; ageMonths: number };
        deliveryKobo?: number;
      },
      key: string,
    ) =>
      request<{ order: { reference: string; total: Money; reservedUntil: string } }>("/orders", {
        method: "POST",
        body,
        idempotencyKey: key,
      }),

    list: () => request<{ orders: OrderSummary[] }>("/orders"),

    get: (reference: string) => request<{ order: OrderDetail }>(`/orders/${reference}`),

    pay: (reference: string, channel: string, key: string, savedCardId?: string) =>
      request<{
        payment: { reference: string; authorizationUrl: string | null; paid?: boolean };
      }>(`/orders/${reference}/pay`, {
        method: "POST",
        body: { channel, savedCardId },
        idempotencyKey: key,
      }),

    confirm: (reference: string, paymentReference: string) =>
      request<{ paid: boolean }>(`/orders/${reference}/confirm`, {
        method: "POST",
        body: { paymentReference },
      }),

    receipt: (reference: string) => request<{ receipt: Receipt }>(`/orders/${reference}/receipt`),

    receiptPdf: (reference: string) => requestBlob(`/orders/${reference}/receipt.pdf`),
  },

  sales: {
    quote: (body: {
      productId: string;
      ageMonths: number;
      grade: string;
      batteryHealth?: number;
      hasOriginalBox?: boolean;
      hasCharger?: boolean;
      isCracked?: boolean;
    }) => request<{ quote: Quote }>("/sales/quote", { method: "POST", body }),

    tradeInQuote: (body: {
      productId: string;
      ageMonths: number;
      grade: string;
      batteryHealth?: number;
    }) => request<{ credit: Money }>("/sales/trade-in-quote", { method: "POST", body }),

    create: (body: {
      productId: string;
      ageMonths: number;
      grade: string;
      batteryHealth?: number;
      hasOriginalBox?: boolean;
      hasCharger?: boolean;
      isCracked?: boolean;
      mode: "DIRECT" | "COMMISSION";
      photos: string[];
      pickupType?: "pickup" | "dropoff";
      pickupAt?: string;
      pickupAddress?: string;
    }) =>
      request<{ sale: { reference: string; offer: Money; status: string } }>("/sales", {
        method: "POST",
        body,
      }),

    list: () => request<{ sales: SaleSummary[] }>("/sales"),

    cancel: (reference: string) =>
      request<{ cancelled: boolean }>(`/sales/${reference}/cancel`, { method: "POST" }),
  },

  alerts: {
    list: () => request<{ alerts: Alert[] }>("/alerts"),

    create: (body: {
      productId?: string;
      query?: string;
      tiers?: string[];
      maxKobo?: number;
      viaPush?: boolean;
      viaEmail?: boolean;
      viaSms?: boolean;
    }) => request<{ alert: Alert }>("/alerts", { method: "POST", body }),

    update: (
      id: string,
      body: Partial<{
        isActive: boolean;
        viaPush: boolean;
        viaEmail: boolean;
        viaSms: boolean;
        maxKobo: number | null;
      }>,
    ) => request<{ alert: Alert }>(`/alerts/${id}`, { method: "PATCH", body }),

    remove: (id: string) => request<void>(`/alerts/${id}`, { method: "DELETE" }),
  },

  addresses: {
    list: () => request<{ addresses: Address[] }>("/addresses"),

    create: (body: {
      label: string;
      line1: string;
      city: string;
      state: string;
      phone: string;
      isDefault?: boolean;
    }) => request<{ address: Address }>("/addresses", { method: "POST", body }),

    update: (id: string, body: Partial<{ label: string; line1: string; city: string; state: string; phone: string; isDefault: boolean }>) =>
      request<{ address: Address }>(`/addresses/${id}`, { method: "PATCH", body }),

    remove: (id: string) => request<void>(`/addresses/${id}`, { method: "DELETE" }),
  },

  payouts: {
    get: () =>
      request<{
        balance: Money;
        accounts: PayoutAccount[];
        pendingPayout: { reference: string; amount: Money } | null;
        recentPayouts: RecentPayout[];
      }>("/payouts"),

    banks: () => request<{ banks: Array<{ code: string; name: string }> }>("/payouts/banks"),

    addAccount: (body: { bankCode: string; accountNumber: string; accountName: string }) =>
      request<{ account: PayoutAccount }>("/payouts/accounts", { method: "POST", body }),

    removeAccount: (id: string) => request<void>(`/payouts/accounts/${id}`, { method: "DELETE" }),

    withdraw: () =>
      request<{ pending: boolean; reference: string; amount: Money }>("/payouts/withdraw", {
        method: "POST",
      }),
  },

  paymentMethods: {
    list: () => request<{ cards: SavedCard[] }>("/payment-methods"),

    makeDefault: (id: string) => request<void>(`/payment-methods/${id}/default`, { method: "PATCH" }),

    remove: (id: string) => request<void>(`/payment-methods/${id}`, { method: "DELETE" }),
  },

  wishlist: {
    list: () => request<{ wishlist: Array<{ id: string; createdAt: string; listing: Listing }> }>("/wishlist"),

    add: (listingId: string) =>
      request<{ listing: Listing }>("/wishlist", { method: "POST", body: { listingId } }),

    remove: (listingId: string) => request<void>(`/wishlist/${listingId}`, { method: "DELETE" }),
  },

  admin: {
    overview: () => request<AdminOverview>("/admin/overview"),

    orders: (params: { status?: string; cursor?: string } = {}) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
      );
      return request<{ orders: AdminOrder[]; nextCursor: string | null }>(`/admin/orders?${q.toString()}`);
    },

    setOrderStatus: (reference: string, status: string, note?: string) =>
      request<{ order: { reference: string; status: string } }>(`/admin/orders/${reference}/status`, {
        method: "POST",
        body: { status, note },
      }),

    listings: (params: { q?: string; status?: string } = {}) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
      );
      return request<{ listings: AdminListing[] }>(`/admin/listings?${q.toString()}`);
    },

    createListing: (body: {
      productId: string;
      tier: string;
      priceKobo: number;
      costKobo?: number;
      vendorId?: string;
      grade?: string;
      batteryHealth?: number;
      stockCount?: number;
      photos?: string[];
      descriptionMd?: string;
      publish?: boolean;
    }) => request<{ listing: { reference: string; status: string } }>("/admin/listings", { method: "POST", body }),

    updateListing: (
      reference: string,
      body: Partial<{ priceKobo: number; stockCount: number; status: string; descriptionMd: string }>,
    ) => request<{ listing: { reference: string; status: string } }>(`/admin/listings/${reference}`, {
      method: "PATCH",
      body,
    }),

    vendors: () => request<{ vendors: AdminVendor[] }>("/admin/vendors"),

    createVendor: (body: {
      businessName: string;
      contactName: string;
      phone: string;
      location: string;
      supplies?: string[];
      paymentTerms?: string;
    }) => request<{ vendor: { id: string; businessName: string } }>("/admin/vendors", { method: "POST", body }),

    deleteVendor: (id: string) => request<void>(`/admin/vendors/${id}`, { method: "DELETE" }),

    inspections: () => request<{ inspections: InspectionQueueItem[] }>("/admin/inspections"),

    completeInspection: (
      reference: string,
      body: {
        screenMatches: boolean;
        noHiddenDamage: boolean;
        batteryOk: boolean;
        powersOn: boolean;
        notIcloudLocked: boolean;
        imeiClean: boolean;
        imei?: string;
        gradeAssessed: string;
        batteryActual?: number;
        adjustedKobo?: number;
        listPriceKobo: number;
        approve: boolean;
        rejectReason?: string;
        notes?: string;
        checklistResults?: Array<{ itemId: string; passed: boolean }>;
      },
    ) =>
      request<{ approved: boolean; listingReference: string | null }>(
        `/admin/inspections/${reference}/complete`,
        { method: "POST", body },
      ),

    assignInspection: (reference: string, agentId: string) =>
      request<{ assigned: boolean }>(`/admin/inspections/${reference}/assign`, {
        method: "POST",
        body: { agentId },
      }),

    claimInspection: (reference: string) =>
      request<{ claimed: boolean }>(`/admin/inspections/${reference}/claim`, { method: "POST" }),

    analytics: (days?: number) =>
      request<AdminAnalytics>(`/admin/analytics${days ? `?days=${days}` : ""}`),

    agents: () => request<{ agents: AdminAgent[] }>("/admin/agents"),

    createAgent: (body: {
      fullName: string;
      phone: string;
      email?: string;
      city?: string;
      state?: string;
      role?: "AGENT" | "ADMIN";
    }) =>
      request<{ agent: { id: string; fullName: string; phone: string; role: string }; tempPassword: string }>(
        "/admin/agents",
        { method: "POST", body },
      ),

    deleteAgent: (id: string) => request<void>(`/admin/agents/${id}`, { method: "DELETE" }),

    payouts: () => request<{ sellers: AdminPayoutDue[] }>("/admin/payouts"),

    myStats: () => request<AgentStats>("/admin/agents/me"),

    checklistItems: () => request<{ items: ChecklistItem[] }>("/admin/checklist-items"),

    createChecklistItem: (label: string) =>
      request<{ item: ChecklistItem }>("/admin/checklist-items", { method: "POST", body: { label } }),

    deleteChecklistItem: (id: string) =>
      request<void>(`/admin/checklist-items/${id}`, { method: "DELETE" }),
  },
};
