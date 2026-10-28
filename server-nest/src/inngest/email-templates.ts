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
