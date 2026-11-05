import { ClockIcon } from "lucide-react";
import { formatClock, formatEtaRange } from "@/lib/eta";
import type { DeliveryEta } from "@/types";

function EtaShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex items-start gap-3 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <ClockIcon className="size-5" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="mt-1 text-sm text-ink-soft">{children}</div>
      </div>
    </section>
  );
}

export default function EtaCard({ eta }: { eta: DeliveryEta | null }) {
  if (!eta) {
    return (
      <EtaShell title="Your courier is on the way">
        <p>The arrival time appears as soon as the courier shares their location.</p>
      </EtaShell>
    );
  }

  if (eta.minutes === 0) {
    return (
      <EtaShell title="Your courier is about to arrive">
        <p>Have your delivery code ready.</p>
      </EtaShell>
    );
  }

  return (
    <EtaShell title={`Arriving in about ${formatEtaRange(eta)}`}>
      <p>
        Estimated from the live location of your courier, {eta.distanceKm} km away in a straight
        line. Roads and traffic can change it.
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Location updated at {formatClock(eta.locationUpdatedAt)}
      </p>
    </EtaShell>
  );
}