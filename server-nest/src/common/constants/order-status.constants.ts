export const ACTIVE_STATUSES: string[] = [
  'Assigned',
  'Packed',
  'Out for Delivery',
];
export const FINISHED_STATUSES: string[] = ['Delivered', 'Cancelled'];

// The statuses an admin can set by hand. "Placed" and "Assigned" are not here on purpose:
// the first starts every order, and the second only comes from assigning a courier
export const ADMIN_SETTABLE_STATUSES = [
  'Packed',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];
