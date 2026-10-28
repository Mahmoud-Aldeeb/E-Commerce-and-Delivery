import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import Logo from "@/components/layout/logo";

interface AuthShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export default function AuthShell({
  title,
  description,
  children,
  backHref = "/login",
  backLabel = "Back to sign in",
}: AuthShellProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="card p-6">
          <h1 className="mb-1 text-xl font-semibold">{title}</h1>
          {description && <p className="mb-5 text-sm text-ink-soft">{description}</p>}
          {children}
        </div>

        <Link
          href={backHref}
          className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeftIcon className="size-4" /> {backLabel}
        </Link>
      </div>
    </main>
  );
}