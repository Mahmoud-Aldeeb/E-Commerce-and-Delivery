import type { Metadata } from "next";
import Link from "next/link";
import { Faq, InfoPage } from "@/components/info/info-page";
import { storeInfo, siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { DELIVERY_FEE, TAX_RATE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about delivery, payment, cancelling and returns.",
};

const link = "font-medium text-primary-700 hover:underline";

export default function FaqPage() {
  return (
    <InfoPage title="Frequently asked questions" intro="Quick answers about ordering, delivery and returns.">
      <div className="space-y-3">
        <Faq question="Where do you deliver, and how long does it take?">
          We deliver in {storeInfo.deliveryCities.join(", ")}. We aim to deliver within{" "}
          {storeInfo.deliveryHours} hours of your order.
        </Faq>

        <Faq question="How much does delivery cost?">
          Delivery is {formatPrice(DELIVERY_FEE)}, and free when the subtotal of your order is above{" "}
          {formatPrice(siteConfig.freeDeliveryThreshold)}. Tax of {Math.round(TAX_RATE * 100)}% is added
          at checkout.
        </Faq>

        <Faq question="How can I pay?">
          By card, or in cash to the courier when the order arrives.
        </Faq>

        <Faq question="How do I use a coupon code?">
          Enter the code in the order summary during checkout, and press Apply. The discount is taken
          off the items of your order, and delivery and tax are worked out after it. Each code has its
          own conditions, such as a minimum order or an end date.
        </Faq>

        <Faq question="Is my card information safe?">
          You enter your card on the page of Stripe, our payment partner. We never see or store your
          card details.
        </Faq>

        <Faq question="Can I choose which items of my cart to order?">
          Yes. Tick the items you want in your cart. The others stay in your cart for later.
        </Faq>

        <Faq question="How do I track my order?">
          Open <Link href="/orders" className={link}>My orders</Link> and choose the order. When a
          courier is on the way, you can follow them live on the map.
        </Faq>

        <Faq question="Who can write a review?">
          Only customers who received a product. After your order is delivered, open the product (or
          use Rate this product on the order page) to leave a rating and a comment. You can edit or
          delete your review later.
        </Faq>

        <Faq question="What is the delivery code?">
          When a courier is assigned, a 6-digit code appears on your order page. Give it to the
          courier only when the order is at your door. It proves the order reached the right person.
        </Faq>

        <Faq question="Can I cancel an order?">
          Yes, from the order page, until the order is packed. A card payment is refunded in full.
          Banks usually take 5 to 10 business days to show it.
        </Faq>

        <Faq question="I paid by card, but my order still says it is confirming the payment.">
          This usually takes a few seconds. If it takes longer, wait a few minutes and press Check
          again on the order page. If nothing changes, contact us with your order number.
        </Faq>

        <Faq question="What if an item sells out after I pay?">
          We cancel the order automatically and refund the full amount.
        </Faq>

        <Faq question="Can I return or exchange an item?">
          Yes, within {storeInfo.returnDays} days of receiving it, if it has a manufacturing defect.
          Contact us with your order number.
        </Faq>

        <Faq question="I forgot my password, or I signed up with Google.">
          Use Forgot password on the sign-in page. If you signed up with Google, you can also add a
          password in <Link href="/account" className={link}>My account</Link>. If an account that had
          a password is linked to Google by signing in with Google, the old password is removed: use
          Forgot password to set a new one.
        </Faq>

        <Faq question="How can I contact you?">
          Visit the <Link href="/contact" className={link}>contact page</Link>, or write to{" "}
          <a href={`mailto:${storeInfo.email}`} className={link}>
            {storeInfo.email}
          </a>
          . We reply {storeInfo.replyHours}.
        </Faq>
      </div>
    </InfoPage>
  );
}