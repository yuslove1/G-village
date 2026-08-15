"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

/**
 * Shared between every grid that shows a heart (browse, search, wishlist
 * itself) so "is this saved" and "toggle it" stay one implementation instead
 * of three copies drifting apart. Not used by the listing detail page, which
 * predates this hook and already has its own working version — no reason to
 * churn code that isn't broken just to deduplicate it.
 */
export function useWishlist() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.wishlist.list(),
    enabled: status === "authenticated",
  });

  const savedIds = new Set((query.data?.wishlist ?? []).map((w) => w.listing.id));

  const toggle = useMutation({
    mutationFn: async (listingId: string) => {
      if (savedIds.has(listingId)) await api.wishlist.remove(listingId);
      else await api.wishlist.add(listingId);
    },
    onSuccess: (_data, listingId) => {
      toast.success(savedIds.has(listingId) ? "Removed from saved" : "Saved to your wishlist");
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not update your saved items");
    },
  });

  return {
    isAuthenticated: status === "authenticated",
    items: query.data?.wishlist ?? [],
    isLoading: query.isLoading,
    isSaved: (listingId: string) => savedIds.has(listingId),
    toggle: toggle.mutate,
  };
}
