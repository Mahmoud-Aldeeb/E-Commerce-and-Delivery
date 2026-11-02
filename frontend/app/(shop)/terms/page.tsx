import type { Metadata } from "next";
import { DemoNotice, InfoList, InfoPage, InfoSection } from "@/components/info/info-page";
import { siteConfig, storeInfo } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { DELIVERY_FEE, TAX_RATE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules for using ${siteConfig.name} and placing an order.`,
};

export default function TermsPage() {
  const cities = storeInfo.deliveryCities.join(", ");

  return (
    <InfoPage
      title="Terms of Service"
      updated={storeInfo.legalUpdatedAt}
      intro={`These terms apply when you use the ${siteConfig.name} website and place an order. By creating an account or placing an order, you agree to them.`}
    >
      <DemoNotice />

      <InfoSection title="About the store">
        <p>
          {siteConfig.name} is run by Mahmoud Aldeeb from {storeInfo.address}.
        </p>
      </InfoSection>

      <InfoSection title="Your account">
        <InfoList
          items={[
            "Give correct information and keep your password private.",
            "You are responsible for what happens under your account.",
            "We may suspend an account that is used to abuse the store.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Products and prices">
        <InfoList
          items={[
            "Prices are in US dollars (USD).",
            `At checkout we add tax of ${Math.round(TAX_RATE * 100)}% and a delivery fee of ${formatPrice(DELIVERY_FEE)}. Delivery is free when the subtotal of the order is above ${formatPrice(siteConfig.freeDeliveryThreshold)}.`,
            "Prices and stock can change. The price you see when you place the order is the price you pay.",
            "A coupon code takes money off the items of an order. Each code has its own conditions, such as a minimum order, dates or a limit of uses. Delivery and tax are worked out after the discount. When you cancel an order, the use of its coupon is given back.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Orders and payment">
        <InfoList
          items={[
            "You can pay by card (through Stripe) or in cash to the courier when the order arrives.",
            "A cash order is confirmed when you place it. A card order is confirmed when Stripe confirms your payment.",
            "We need your phone number so the courier can reach you.",
            "If an item sells out before the payment of a card order is confirmed, we cancel the order automatically and refund the full amount.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Delivery">
        <InfoList
          items={[
            `We deliver in ${cities}.`,
            `We aim to deliver within ${storeInfo.deliveryHours} hours of your order.`,
            "When a courier is assigned, a 6-digit delivery code appears on your order page. Give it to the courier only when the order is at your door.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Cancelling an order">
        <InfoList
          items={[
            "You can cancel from My orders until the order is packed.",
            "A card payment is refunded in full to the card you paid with. Banks usually take 5 to 10 business days to show the refund.",
            `After the order is packed, contact us at ${storeInfo.email} or ${storeInfo.phone}.`,
          ]}
        />
      </InfoSection>

      <InfoSection title="Returns and exchanges">
        <p>
          You can return or exchange an item within {storeInfo.returnDays} days of receiving it if
          it has a manufacturing defect. Contact us with your order number, and we will arrange the
          exchange or the refund.
        </p>
      </InfoSection>

      <InfoSection title="Reviews">
        <InfoList
          items={[
            "Only a customer who received a product can review it, once for each product. You can edit or delete your review at any time.",
            "A review must be honest and about the product. Do not post insults, personal data, advertising or anything unlawful.",
            "A review is shown with your first name and the first letter of your last name.",
            "We may hide or delete a review that breaks these rules. We do not remove a review only because it is negative.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Using the site">
        <p>Do not try to break, overload or misuse the site or the accounts of other people.</p>
      </InfoSection>

      <InfoSection title="Changes and availability">
        <p>
          The site is provided as it is. It can change or be offline from time to time, and we may
          update these terms. The date at the top of the page shows the last change.
        </p>
      </InfoSection>

      <InfoSection title="Contact">
        <p>
          <a href={`mailto:${storeInfo.email}`} className="font-medium text-primary-700 hover:underline">
            {storeInfo.email}
          </a>{" "}
          or{" "}
          <a href={storeInfo.phoneHref} className="font-medium text-primary-700 hover:underline">
            {storeInfo.phone}
          </a>
          , {storeInfo.replyHours}.
        </p>
      </InfoSection>
    </InfoPage>
  );
}