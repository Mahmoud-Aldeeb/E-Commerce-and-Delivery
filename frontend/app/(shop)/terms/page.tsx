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
            "You can pay by card (through Stripe), in cash to the courier when the order arrives, or with your store wallet. The wallet can pay a whole order, or a part of it while you pay the rest by card or in cash. You choose whether to use it on every order.",
            "A cash order, or an order the wallet pays in full, is confirmed when you place it. A card order is confirmed when Stripe confirms your payment.",
            "We need your phone number so the courier can reach you.",
            "If an item sells out, or your wallet balance is no longer enough, before the payment of a card order is confirmed, we cancel the order automatically and refund what you paid.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Store wallet">
        <InfoList
          items={[
            "The store wallet is store credit in US dollars. You can use it only in this store, and it cannot be withdrawn as cash.",
            "Money gets into your wallet when you choose to have a refund sent to it, and when what your wallet paid for an order is given back. Every movement is shown in My wallet.",
            "The wallet is never used unless you choose to use it at checkout.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Delivery">
        <InfoList
          items={[
            `We deliver in ${cities}.`,
            `We aim to deliver within ${storeInfo.deliveryHours} hours of your order.`,
            "When a courier is assigned, a 6-digit delivery code appears on your order page. Give it to the courier only when the order is at your door.",
            "For an order you pay partly with your wallet, the courier collects only the rest in cash.",
          ]}
        />
      </InfoSection>

      <InfoSection title="Cancelling an order">
        <InfoList
          items={[
            "You can cancel from My orders until the order is packed.",
            "What you paid by card is refunded in full to the card you paid with. Banks usually take 5 to 10 business days to show the refund.",
            "What your store wallet paid goes back to your wallet at once.",
            `After the order is packed, contact us at ${storeInfo.email} or ${storeInfo.phone}.`,
          ]}
        />
      </InfoSection>

      <InfoSection title="Returns and refunds">
        <InfoList
          items={[
            `After an order is delivered, you can ask to return an item that has a manufacturing defect, within ${storeInfo.returnDays} days of the delivery. Do it from the order page: choose the items, how many, and describe the defect.`,
            "The store looks at every request. When it approves one, it tells you how to send the item back. The cost of sending it back is yours. The refund is sent when the store receives the item. If the item does not arrive in good order, or the defect is not confirmed, the store may refuse the return and tells you why.",
            "Items without a manufacturing defect are not covered by returns. Contact us if you have a problem with an order.",
            "You get the price of the items you return, with their share of the tax and of any discount. Delivery is not refunded.",
            "A card payment is refunded to the card. For a cash order you choose where the refund goes: your store wallet (available as soon as the store receives the item), your mobile wallet, or InstaPay. A refund to a mobile wallet or InstaPay can take a few days.",
            "If your wallet paid a part of the order, that part goes back to your wallet first, and the rest goes where the payment came from or where you chose.",
            "To exchange an item, return it and order the one you want.",
          ]}
        />
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