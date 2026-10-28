import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}

export default function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel = "View all",
}: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          {linkLabel} <ArrowRightIcon className="size-4" />
        </Link>
      )}
    </div>
  );
}