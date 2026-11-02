import type { Metadata } from "next";
import { DemoNotice, InfoList, InfoPage, InfoSection } from "@/components/info/info-page";
import { siteConfig, storeInfo } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${siteConfig.name} collects, why, and who else sees it.`,
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy Policy"
      updated={storeInfo.legalUpdatedAt}
      intro={`This page explains what ${siteConfig.name} collects when you use the store, why, and who else sees it.`}
    >
      <DemoNotice />

      <InfoSection title="What we collect">
        <InfoList
          items={[
            <>
              <strong>Your account:</strong> your name, email address and phone number. Your password
              is stored only as a one-way hash, which we cannot read. If you sign in with Google,
              Google tells us your name, email address and profile picture (never your Google
              password).
            </>,
            <>
              <strong>Delivery addresses:</strong> the street, city and area you type, and the
              position you pick on the map.
            </>,
            <>
              <strong>Your orders:</strong> the items, prices, payment method, status and refund
              status of each order, and the 6-digit delivery code.
            </>,
            <>
              <strong>The location of the courier:</strong> while your order is on its way, the phone
              of the courier shares its position about every 10 seconds, so you can follow it on the
              map.
            </>,
            <>
              <strong>Technical data:</strong> your IP address is used for a few minutes to limit
              repeated requests, which protects the store from abuse. When something breaks on our
              server, an error report is sent to us with technical details. It leaves out passwords,
              cookies and sign-in tokens.
            </>,
            <>
              <strong>On your device:</strong> your sign-in, your cart and a few display choices are
              saved in the local storage of your browser. We do not use advertising or analytics
              trackers.
            </>,
            <>
              <strong>Your reviews:</strong> the rating and comment you write about a product you
              received. A review is public: it is shown with your first name and the first letter of
              your last name, never your email address or your phone number. You can edit or delete
              it at any time, and we may hide or remove a review that breaks the rules.
            </>,
          ]}
        />
      </InfoSection>

      <InfoSection title="How we use it">
        <InfoList
          items={[
            "To take, prepare, deliver and refund your orders.",
            "To let the courier of your order reach you: the courier sees your name, delivery address and phone number.",
            "To email you about your account and your orders, such as an order confirmation or a password reset link. We do not send promotional emails.",
            "To keep the store secure and to fix errors.",
          ]}
        />
        <p>We do not sell your information.</p>
      </InfoSection>

      <InfoSection title="Who else handles it">
        <p>These services work for us, and each one only sees what it needs:</p>
        <InfoList
          items={[
            <>
              <strong>Stripe</strong> takes card payments. Your card details go straight to Stripe:
              we never see or store them.
            </>,
            <>
              <strong>Neon</strong> hosts our database and <strong>Vercel</strong> hosts the website.
            </>,
            <>
              <strong>Brevo</strong> sends our emails.
            </>,
            <>
              <strong>Cloudinary</strong> stores product images (no customer data).
            </>,
            <>
              <strong>Inngest</strong> runs background tasks, such as the email after an order.
            </>,
            <>
              <strong>Upstash</strong> keeps the short-lived counters that limit repeated requests.
            </>,
            <>
              <strong>Sentry</strong> receives the error reports.
            </>,
            <>
              <strong>Google</strong> is involved only if you choose Sign in with Google.
            </>,
            <>
              <strong>OpenStreetMap</strong> provides the map pictures. They load from its servers,
              so it sees your IP address when you open a map.
            </>,
          ]}
        />
      </InfoSection>

      <InfoSection title="Your choices">
        <InfoList
          items={[
            "You can change your phone number and add a password in My account, and manage your addresses in Addresses.",
            "When you reset your password, your other devices are signed out.",
            `To correct or delete your data, email ${storeInfo.email}. We handle these requests by hand.`,
          ]}
        />
      </InfoSection>

      <InfoSection title="Security">
        <p>
          The site uses HTTPS, passwords are stored as hashes, and repeated sign-in attempts are
          limited. No online service is perfectly secure, so we cannot promise absolute security.
        </p>
      </InfoSection>

      <InfoSection title="Changes and contact">
        <p>
          When this policy changes, we update the date at the top of the page. Questions? Write to{" "}
          <a href={`mailto:${storeInfo.email}`} className="font-medium text-primary-700 hover:underline">
            {storeInfo.email}
          </a>
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}