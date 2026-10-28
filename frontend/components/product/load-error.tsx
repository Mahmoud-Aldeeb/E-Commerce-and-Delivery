"use client";

import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

export default function LoadError({ message }: { message: string }) {
  const router = useRouter();

  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <TriangleAlertIcon className="size-8 text-warning" />
      <p className="font-medium">{message}</p>
      <button onClick={() => router.refresh()} className="btn btn-secondary btn-sm">
        Try again
      </button>
    </div>
  );
}