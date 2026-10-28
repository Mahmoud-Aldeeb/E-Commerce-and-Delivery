import { QueryClient } from "@tanstack/react-query";
import { getErrorStatus } from "@/lib/api";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With server rendering, a staleTime above 0 avoids an immediate refetch after hydration
        staleTime: 60_000,
        retry: (failureCount, error) => {
          // Retrying cannot fix a 4xx answer (not found, forbidden, validation...)
          const status = getErrorStatus(error);
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        // Opt in per query where it matters (order tracking polls on its own)
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  // Server: a NEW client every time, so two visitors never share cached data
  if (typeof window === "undefined") return makeQueryClient();

  // Browser: one client for the whole session
  return (browserQueryClient ??= makeQueryClient());
}
