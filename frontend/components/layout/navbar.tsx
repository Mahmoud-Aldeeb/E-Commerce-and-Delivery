"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  LogOutIcon,
  MapPinIcon,
  MenuIcon,
  PackageIcon,
  SearchIcon,
  ShieldIcon,
  ShoppingCartIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import Logo from "@/components/layout/logo";
import { useAuth } from "@/context/auth-context";
import { useCart } from "@/context/cart-context";
import { buildHref } from "@/lib/product-filters";

const navLink =
  "rounded-control px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink";
const menuItem =
  "flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-canvas hover:text-ink";

function SearchForm({ className = "" }: { className?: string }) {
  const router = useRouter();
  const inputId = useId();
  const [query, setQuery] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
    setQuery("");
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={className}>
      <label htmlFor={inputId} className="sr-only">
        Search products
      </label>
      <div className="relative w-full">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for products"
          className="input pl-10"
        />
      </div>
    </form>
  );
}

function AccountMenu() {
  const { user, isReady, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // While the menu is open: a click outside or the Escape key closes it
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Until the saved session is read, do not show "Sign in" to someone who is signed in
  if (!isReady) return <div className="skeleton size-9 rounded-full" />;

  if (!user) {
    return (
      <Link href="/login" className="btn btn-primary btn-sm">
        Sign in
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full p-1 transition-colors hover:bg-canvas"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <ChevronDownIcon className="size-3.5 text-ink-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-50 mt-2 w-60 rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <Link href="/account" role="menuitem" className={menuItem} onClick={() => setOpen(false)}>
            <UserIcon className="size-4" /> My account
          </Link>
          <Link href="/orders" role="menuitem" className={menuItem} onClick={() => setOpen(false)}>
            <PackageIcon className="size-4" /> My orders
          </Link>
          <Link href="/addresses" role="menuitem" className={menuItem} onClick={() => setOpen(false)}>
            <MapPinIcon className="size-4" /> Addresses
          </Link>
          {user.isAdmin && (
            <Link href="/admin" role="menuitem" className={menuItem} onClick={() => setOpen(false)}>
              <ShieldIcon className="size-4" /> Admin dashboard
            </Link>
          )}
          <div className="border-t border-line pt-1">
            <button
              role="menuitem"
              onClick={logout}
              className={`${menuItem} text-danger hover:bg-danger-soft hover:text-danger`}
            >
              <LogOutIcon className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ categories }: { categories: string[] }) {
  const { cartCount, setIsCartOpen } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="container-page flex h-16 items-center gap-3 lg:gap-6">
        <button
          className="btn btn-ghost -ml-2 p-2 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>

        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <Link href="/products" className={navLink}>
            Products
          </Link>
          <Link href="/deals" className={navLink}>
            Deals
          </Link>
        </nav>

        <SearchForm className="hidden flex-1 md:block md:max-w-xl" />

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setIsCartOpen(true)}
            className="btn btn-ghost relative p-2"
            aria-label={`Open cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
          >
            <ShoppingCartIcon className="size-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-primary-700 px-1 text-[10px] font-semibold leading-4.5 text-white">
                {cartCount}
              </span>
            )}
          </button>
          <AccountMenu />
        </div>
      </div>

      {/* Search row on small screens */}
      <div className="container-page pb-3 md:hidden">
        <SearchForm />
      </div>


      {/* Mobile menu */}
      {mobileOpen && (
        <nav aria-label="Mobile" className="border-t border-line bg-surface md:hidden">
          <div className="container-page space-y-1 py-3">
            <Link href="/products" className={`${navLink} block`} onClick={closeMobile}>
              All products
            </Link>
            <Link href="/deals" className={`${navLink} block`} onClick={closeMobile}>
              Flash deals
            </Link>
            <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Categories
            </p>
            {categories.length > 0 && (
              <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Categories
              </p>
            )}
            {categories.map((name) => (
              <Link
                key={name}
                href={buildHref("/products", { category: name })}
                className={`${navLink} block`}
                onClick={closeMobile}
              >
                {name}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}