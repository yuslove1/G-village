"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Retrying a 401 or a 409 just repeats a decision the server has
            // already made. Only server faults are worth a second attempt.
            retry: (count, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return count < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  // Runs once per load, not per navigation — the access token lives in a
  // module-level variable (see lib/api.ts), so a client-side route change
  // never loses it. Only a hard reload does, and that is exactly what this
  // recovers from via the refresh cookie.
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
