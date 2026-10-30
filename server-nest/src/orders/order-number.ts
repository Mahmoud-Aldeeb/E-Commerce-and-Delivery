// The number the customer sees for an order, like "#F4C489A5": the LAST 8 characters of the id.
// It MUST give the same text as orderNumber() in the web app (frontend/lib/orders.ts):
// the customer compares the email with the site
export const orderNumber = (id: string) => `#${id.slice(-8).toUpperCase()}`;
