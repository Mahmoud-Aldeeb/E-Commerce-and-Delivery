import type { Metadata } from "next";
import Link from "next/link";
import { MailIcon, MapPinIcon, PhoneIcon, type LucideIcon } from "lucide-react";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { storeInfo } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: "How to reach the store.",
};

function ContactCard({
  icon: Icon,
  title,
  value,
  href,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="card p-5">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      {href ? (
        <a href={href} className="mt-1 block break-all text-sm text-primary-700 hover:underline">
          {value}
        </a>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">{value}</p>
      )}
    </div>
  );
}

export default function ContactPage() {
  return (
    <InfoPage title="Contact us" intro="Write or call us. We reply during the hours below.">
      <div className="grid gap-4 sm:grid-cols-3">
        <ContactCard icon={MailIcon} title="Email" value={storeInfo.email} href={`mailto:${storeInfo.email}`} />
        <ContactCard icon={PhoneIcon} title="Phone" value={storeInfo.phone} href={storeInfo.phoneHref} />
        <ContactCard icon={MapPinIcon} title="Based in" value={storeInfo.address} />
      </div>

      <InfoSection title="Reply hours">
        <p>{storeInfo.replyHours}</p>
      </InfoSection>

      <InfoSection title="We deliver in">
        <p>{storeInfo.deliveryCities.join(", ")}</p>
      </InfoSection>

      <InfoSection title="Before you write">
        <p>
          Your answer may be in the{" "}
          <Link href="/faq" className="font-medium text-primary-700 hover:underline">
            FAQ
          </Link>
          . If you write about an order, include its number (the code that starts with # on the
          order page).
        </p>
      </InfoSection>
    </InfoPage>
  );
}