import { Loader2Icon } from "lucide-react";

export default function PageLoader() {
  return (
    <div
      className="flex min-h-[50vh] w-full items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Loader2Icon className="size-8 animate-spin text-primary-700" />
    </div>
  );
}