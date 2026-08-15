"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Money } from "@/lib/utils";

/**
 * Client-only, persisted to localStorage. There is no server-side cart
 * concept in this app — order creation takes a flat list of {listingId,
 * quantity} directly (see api.orders.create) — so the cart only needs to
 * survive a reload, not a device switch. Snapshotting title/price/photo at
 * add-time (rather than storing bare ids) means the cart page renders
 * instantly with no extra fetch; checkout re-verifies each listing against
 * the live catalogue before creating the order, so a stale snapshot here
 * can never actually overcharge or oversell.
 */
export interface CartItem {
  id: string;
  reference: string;
  title: string;
  category: string;
  tier: string;
  price: Money;
  photo: string | null;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clear: () => void;
}

// Matches the backend's own per-line cap (order.routes.ts createSchema).
const MAX_QTY = 5;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      add: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.id === item.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity) } : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: Math.min(MAX_QTY, quantity) }] };
        }),

      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      setQuantity: (id, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.id !== id)
              : state.items.map((i) =>
                  i.id === id ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i,
                ),
        })),

      clear: () => set({ items: [] }),
    }),
    { name: "gv-cart" },
  ),
);

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}
