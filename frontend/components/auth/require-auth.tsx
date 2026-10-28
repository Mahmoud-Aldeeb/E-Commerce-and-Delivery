"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/context/auth-context";

// UX guard for private pages. The real protection is the API: it rejects
// requests without a valid token, whatever this component renders.
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isReady } = useAuth();

  useEffect(() => {
    if (isReady && !user) {
      const target = window.location.pathname + window.location.search;
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
    }
  }, [isReady, user, router]);

  // Until the session is read (and while redirecting) show a loader, never the private page
  if (!isReady || !user) return <PageLoader />;

  return <>{children}</>;
}