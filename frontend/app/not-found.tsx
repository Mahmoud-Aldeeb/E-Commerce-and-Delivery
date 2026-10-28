import Link from "next/link";
import { CompassIcon } from "lucide-react";

export default function NotFound() {
  return (
    <section className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <CompassIcon className="size-8" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-md text-ink-soft">
        The page you are looking for does not exist or has moved.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          Back to home
        </Link>
      </div>
    </section>
  );
}