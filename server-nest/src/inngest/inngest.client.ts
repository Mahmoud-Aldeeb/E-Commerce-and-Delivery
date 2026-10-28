import { Inngest } from 'inngest';

// The id identifies this app in the Inngest dashboard.
// It is NOT the old project's "grocery-delivery" on purpose, so the two
// backends can never overwrite each other's functions.
export const inngest = new Inngest({ id: 'ecommerce-store' });
