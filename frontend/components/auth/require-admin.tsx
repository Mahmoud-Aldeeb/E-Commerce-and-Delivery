"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldOffIcon } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import PageLoader from "@/components/ui/page-loader";
import { useAuth } from "@/context/auth-context";

// UX guard. The real protection is the API: every admin route answers 403 to a non-admin
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isReady } = useAuth();

  useEffect(() => {
    if (isReady && !user) {
      const target = window.location.pathname + window.location.search;
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
    }
  }, [isReady, user, router]);

  if (!isReady || !user) return <PageLoader />;

  if (!user.isAdmin) {
    return (
      <div className="container-page max-w-lg py-20">
        <EmptyState
          icon={ShieldOffIcon}
          title="Admins only"
          description="Your account does not have access to this area."
          action={
            <Link href="/" className="btn btn-primary">
              Back to the store
            </Link>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}