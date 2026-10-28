"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import Logo from "@/components/layout/logo";
import PageLoader from "@/components/ui/page-loader";
import { useDeliveryAuth } from "@/context/delivery-auth-context";

// UX guard. The real protection is the API: it rejects any request without a valid partner token
export default function DeliveryShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { partner, isReady, logout } = useDeliveryAuth();

  useEffect(() => {
    if (isReady && !partner) router.replace("/delivery/login");
  }, [isReady, partner, router]);

  // Until the session is read (and while redirecting) show a loader, never the portal
  if (!isReady || !partner) return <PageLoader />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="badge badge-primary">Delivery</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{partner.name}</p>
              <p className="text-xs capitalize text-ink-muted">{partner.vehicleType}</p>
            </div>
            <button onClick={logout} className="btn btn-ghost p-2" aria-label="Sign out">
              <LogOutIcon className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}