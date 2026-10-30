const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Names come from the database (and users): escape them before putting them in HTML
const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

const chunk = <T>(items: T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    rows.push(items.slice(i, i + size));
  return rows;
};

export interface LowStockProduct {
  name: string;
  image: string;
  category: string;
  stock: number | null;
}

export function lowStockEmail(product: LowStockProduct): string {
  const details = [product.category]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' • ');

  return `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #dc2626, #ef4444); padding: 24px 28px;">
      <h2 style="color: #fff; margin: 0; font-size: 20px;">Low Stock Alert</h2>
    </div>
    <div style="padding: 28px;">
      <div style="margin-bottom: 20px;">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" style="width: 64px; height: 64px; border-radius: 12px; object-fit: cover; vertical-align: middle; margin-right: 12px;" />` : ''}
        <span style="display: inline-block; vertical-align: middle;">
          <strong style="font-size: 18px; color: #111827;">${escapeHtml(product.name)}</strong><br />
          <span style="font-size: 14px; color: #6b7280;">${details}</span>
        </span>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 13px; color: #991b1b; font-weight: 600;">CURRENT STOCK</p>
        <p style="margin: 0; font-size: 32px; font-weight: 700; color: #dc2626;">${escapeHtml(product.stock)}</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">units remaining</p>
      </div>
      <p style="margin: 20px 0 0; font-size: 13px; color: #9ca3af; text-align: center;">Please restock this item as soon as possible.</p>
    </div>
  </div>`;
}

export interface DealProduct {
  name: string;
  image: string;
  price: number;
  originalPrice: number | null;
}

const dealCell = (p: DealProduct): string => `
  <td style="width: 33%; padding: 8px; vertical-align: top;">
    <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; text-align: center;">
      ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" style="width: 100%; height: 100px; object-fit: cover;" />` : ''}
      <div style="padding: 10px;">
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(p.name)}</p>
        <p style="margin: 4px 0 0; font-size: 15px; font-weight: 700; color: #16a34a;">
          $${p.price.toFixed(2)}
          ${p.originalPrice && p.originalPrice > p.price ? `<span style="font-size: 11px; color: #9ca3af; text-decoration: line-through; margin-left: 4px;">$${p.originalPrice.toFixed(2)}</span>` : ''}
        </p>
      </div>
    </div>
  </td>`;

export function monthlyOffersEmail(
  userName: string,
  deals: DealProduct[],
  shopUrl: string,
): string {
  const rows = chunk(deals, 3)
    .map((row) => `<tr>${row.map(dealCell).join('')}</tr>`)
    .join('');

  return `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #f97316, #fb923c); padding: 24px 28px;">
      <h2 style="color: #fff; margin: 0; font-size: 20px;">This Month's Top Deals</h2>
      <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">Exclusive offers to kick off your month right</p>
    </div>
    <div style="padding: 28px;">
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">Hi <strong>${escapeHtml(userName)}</strong>, check out this month's top picks!</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <div style="text-align: center; margin-top: 24px;">
        <a href="${escapeHtml(shopUrl)}" style="display: inline-block; background: #16a34a; color: #fff; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">Shop All Deals →</a>
      </div>
    </div>
  </div>`;
}

// ---------- Order confirmation ----------

const BRAND = 'Cartly';
const money = (value: number) => `$${value.toFixed(2)}`;

export interface OrderEmailItem {
  name: string;
  price: number;
  quantity: number;
}

export interface OrderEmailData {
  /** What the customer sees in the app, like "#A1B2C3D4" */
  number: string;
  customerName: string;
  customerPhone: string | null;
  items: OrderEmailItem[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  paymentMethod: string;
  address: {
    label: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  orderUrl: string;
}

// Information only: what was ordered, what it costs, where it goes and what happens next.
// Everything a person typed (names, address) is escaped before it goes inside the HTML
export function orderConfirmationEmail(order: OrderEmailData): string {
  const paidByCard = order.paymentMethod === 'card';

  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #111827;">${escapeHtml(item.name)} <span style="color: #6b7280;">&times; ${escapeHtml(item.quantity)}</span></td>
          <td style="padding: 8px 0; font-size: 14px; color: #111827; text-align: right; white-space: nowrap;">${money(item.price * item.quantity)}</td>
        </tr>`,
    )
    .join('');

  const totalRow = (label: string, value: string, strong = false) => `
        <tr>
          <td style="padding: 4px 0; font-size: ${strong ? 16 : 14}px; ${strong ? 'font-weight: 700; color: #111827;' : 'color: #6b7280;'}">${label}</td>
          <td style="padding: 4px 0; font-size: ${strong ? 16 : 14}px; text-align: right; ${strong ? 'font-weight: 700; color: #111827;' : 'color: #374151;'}">${value}</td>
        </tr>`;

  const payment = paidByCard
    ? `<strong>Paid by card.</strong> Nothing more to pay.`
    : `<strong>Pay ${money(order.total)} in cash</strong> to the courier when your order arrives.`;

  const phone = order.customerPhone
    ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">The courier may call you on <strong>${escapeHtml(order.customerPhone)}</strong>.</p>`
    : '';

  const cancelNote = paidByCard
    ? 'You can cancel from My orders until the order is packed, and a card payment is refunded in full.'
    : 'You can cancel from My orders until the order is packed.';

  return `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
    <div style="background: #0f766e; padding: 24px 28px;">
      <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 13px;">${BRAND}</p>
      <h2 style="color: #fff; margin: 4px 0 0; font-size: 20px;">Thank you, your order is confirmed</h2>
    </div>
    <div style="padding: 28px;">
      <p style="margin: 0 0 4px; font-size: 15px; color: #374151;">Hi ${escapeHtml(order.customerName)},</p>
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">We received your order <strong>${escapeHtml(order.number)}</strong>. Here is what you ordered.</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">${itemRows}</table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
        ${totalRow('Subtotal', money(order.subtotal))}
        ${totalRow('Delivery', order.deliveryFee === 0 ? 'Free' : money(order.deliveryFee))}
        ${totalRow('Tax', money(order.tax))}
        ${totalRow('Total', money(order.total), true)}
      </table>

      <div style="margin-top: 20px; background: #f9fafb; border-radius: 12px; padding: 16px;">
        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Payment</p>
        <p style="margin: 0; font-size: 14px; color: #111827;">${payment}</p>
      </div>

      <div style="margin-top: 12px; background: #f9fafb; border-radius: 12px; padding: 16px;">
        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Delivery address</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #111827;"><strong>${escapeHtml(order.address.label)}</strong><br />${escapeHtml(order.address.address)}<br />${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.zip)}</p>
        ${phone}
      </div>

      <p style="margin: 24px 0 8px; font-size: 14px; font-weight: 600; color: #111827;">What happens next</p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #374151;">
        <li>We prepare your order and a courier is assigned.</li>
        <li>A 6-digit delivery code then appears on your order page. Give it to the courier only when the order is at your door.</li>
        <li>While it is on its way, you can follow the courier on the map.</li>
      </ol>
      <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">${cancelNote}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: #9ca3af;">Your order page: <a href="${escapeHtml(order.orderUrl)}" style="color: #6b7280;">${escapeHtml(order.orderUrl)}</a></p>
    </div>
  </div>`;
}
