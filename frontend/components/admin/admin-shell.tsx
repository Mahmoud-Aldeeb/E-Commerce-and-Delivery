"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  LayoutGridIcon,
  LogOutIcon,
  MenuIcon,
  PackageSearchIcon,
  ShoppingBagIcon,
  StoreIcon,
  TruckIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import RequireAdmin from "@/components/auth/require-admin";
import Logo from "@/components/layout/logo";
import { useAuth } from "@/context/auth-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: BarChart3Icon, exact: true },
  { href: "/admin/products", label: "Products", icon: PackageSearchIcon },
  { href: "/admin/categories", label: "Categories", icon: LayoutGridIcon },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBagIcon },
  { href: "/admin/delivery-partners", label: "Delivery partners", icon: TruckIcon },
];

const itemClass = "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-line px-5">
        <Logo />
        <span className="badge badge-primary">Admin</span>
      </div>

      <nav aria-label="Admin" className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`${itemClass} ${active ? "bg-primary-50 text-primary-800" : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-line p-3">
        <div className="px-3 pb-2">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-ink-muted">{user?.email}</p>
        </div>
        <Link href="/" className={`${itemClass} text-ink-soft hover:bg-canvas hover:text-ink`}>
          <StoreIcon className="size-4" /> Back to store
        </Link>
        <button onClick={logout} className={`${itemClass} text-danger hover:bg-danger-soft`}>
          <LogOutIcon className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <RequireAdmin>
      <div className="min-h-screen lg:flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface lg:block">
          <SidebarContent />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="btn btn-ghost -ml-2 p-2"
              aria-label="Open menu"
            >
              <MenuIcon className="size-5" />
            </button>
            <Logo />
          </header>

          <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 bg-surface shadow-pop">
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
              <button
                onClick={() => setDrawerOpen(false)}
                className="btn btn-ghost absolute right-2 top-3 p-2"
                aria-label="Close menu"
              >
                <XIcon className="size-5" />
              </button>
            </aside>
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}