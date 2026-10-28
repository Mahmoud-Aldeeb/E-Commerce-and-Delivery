import { heroSectionData } from "@/config/site";

export default function Features() {
  return (
    <section aria-label="Why shop with us" className="py-6">
      <ul className="card grid grid-cols-2 gap-1 p-2 lg:grid-cols-4">
        {heroSectionData.features.map((feature) => (
          <li key={feature.title} className="flex items-center gap-3 rounded-control p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
              <feature.icon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">{feature.title}</p>
              <p className="text-xs text-ink-muted">{feature.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}