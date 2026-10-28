import Link from "next/link";
import { ArrowRightIcon, BikeIcon, CheckIcon, MapPinIcon } from "lucide-react";
import { heroSectionData } from "@/config/site";

const steps = ["Placed", "Packed", "On the way", "Delivered"];
const activeStep = 2; // index of the current step in the preview

// Decorative preview of the live tracking feature. The data is static on purpose.
function TrackingPreview() {
  return (
    <div aria-hidden="true" className="card hidden p-6 lg:block">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <BikeIcon className="size-5" />
        </span>
        <div>
          <p className="font-semibold">Your order is on the way</p>
          <p className="text-sm text-ink-muted">Arriving in about 12 minutes</p>
        </div>
      </div>

      <ol className="mt-6 flex items-center">
        {steps.map((step, index) => (
          <li key={step} className="flex flex-1 items-center last:flex-none">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${index <= activeStep ? "bg-primary-700 text-white" : "bg-line text-ink-muted"
                }`}
            >
              {index < activeStep ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            {index < steps.length - 1 && (
              <span
                className={`mx-1 h-0.5 flex-1 ${index < activeStep ? "bg-primary-700" : "bg-line"}`}
              />
            )}
          </li>
        ))}
      </ol>
      <div className="mt-2 grid grid-cols-4 text-[11px] text-ink-muted">
        {steps.map((step) => (
          <span key={step}>{step}</span>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-control bg-canvas px-3 py-2.5 text-sm text-ink-soft">
        <MapPinIcon className="size-4 text-primary-700" />
        Follow your courier live on the map
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="overflow-hidden rounded-card border border-primary-100 bg-primary-50">
      <div className="grid items-center gap-10 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:py-16">
        <div>
          <span className="badge badge-primary">{heroSectionData.eyebrow}</span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            {heroSectionData.title}
          </h1>
          <p className="mt-4 max-w-lg text-base text-ink-soft">
            {heroSectionData.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={heroSectionData.primaryCta.href} className="btn btn-primary btn-lg">
              {heroSectionData.primaryCta.label}
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link href={heroSectionData.secondaryCta.href} className="btn btn-secondary btn-lg">
              {heroSectionData.secondaryCta.label}
            </Link>
          </div>
        </div>

        <TrackingPreview />
      </div>
    </section>
  );
}