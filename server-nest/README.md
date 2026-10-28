# E-commerce Backend (NestJS)

REST API for an online store with delivery tracking: users, products, orders,
card payments, delivery partners and an admin dashboard.

## Tech stack

NestJS 11 · TypeScript · PostgreSQL (Neon) · Prisma 7 · JWT · Stripe · Cloudinary ·
Inngest (background jobs) · Nodemailer (Brevo SMTP) · Swagger

## Getting started

```bash
npm install                   # also runs `prisma generate`
cp .env.example .env          # then fill in the values
npx prisma migrate deploy     # create the tables in your database
npm run seed                  # demo products + first admin (local only)
npm run start:dev
```

- API: `http://localhost:5050/api`
- Swagger: `http://localhost:5050/docs`

## Scripts

| Script                                 | What it does                                         |
| -------------------------------------- | ---------------------------------------------------- |
| `npm run start:dev`                    | Development server with reload                       |
| `npm run build` / `npm run start:prod` | Production build and start                           |
| `npm run seed`                         | Wipes products, inserts demo data, creates the admin |
| `npm run migrate:deploy`               | Applies the Prisma migrations                        |

## Roles and authentication

| Actor            | Token                                | Guard                      |
| ---------------- | ------------------------------------ | -------------------------- |
| Customer         | JWT `{ id }`                         | `AuthGuard`                |
| Admin            | Customer account with `role = ADMIN` | `AuthGuard` + `AdminGuard` |
| Delivery partner | JWT `{ id, role: "delivery" }`       | `DeliveryAuthGuard`        |

Send the token as `Authorization: Bearer <token>`.

## API overview (all routes are under `/api`)

| Area      | Routes                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | `POST /auth/register`, `POST /auth/login`                                                                                        |
| Products  | `GET /products`, `GET /products/flash-deals`, `GET /products/:id`; admin: `POST`, `PUT /:id`, `DELETE /:id`                      |
| Orders    | `POST /orders`, `GET /orders`, `GET /orders/:id`, `PUT /orders/:id/location`; admin: `GET /orders/all`, `PUT /orders/:id/status` |
| Addresses | `GET/POST /addresses`, `PUT/DELETE /addresses/:id`                                                                               |
| Upload    | `POST /upload` (multipart field `image`)                                                                                         |
| Delivery  | `POST /delivery/login`; partner: `GET /delivery/my-deliveries[/:id]`, `PUT .../:id/status`, `/location`, `/complete`, `/cancel`  |
| Admin     | `GET /admin/stats`, `GET/POST /admin/delivery-partners`, `PUT /admin/delivery-partners/:id`, `PUT /admin/orders/:id/assign`      |
| Webhooks  | `POST /stripe` (Stripe), `/inngest` (Inngest)                                                                                    |

Full request and response schemas are in Swagger.

## How an order flows

1. Customer places an order. Prices are always read from the database.
2. **Cash:** stock is decreased immediately. **Card:** a Stripe Checkout URL is returned
   and the order stays hidden until the Stripe webhook confirms the payment
   (which then decreases the stock).
3. Admin assigns a delivery partner (or Inngest auto-assigns one after 5 minutes) and a
   6-digit OTP is generated for the customer.
4. The partner updates the status and live location, and completes the delivery with the OTP.

## Background jobs (Inngest)

Low-stock email to admins · monthly deals email to users · automatic rider assignment.

## Deployment notes

- Host it on a long-running server (Railway, Render…), not on serverless functions.
- Set every variable of `.env.example` on the host and `NODE_ENV=production`.
- Stripe: create a webhook pointing to `https://<host>/api/stripe`.
- Inngest: sync the app from the Inngest dashboard using `https://<host>/api/inngest`.
- Behind a proxy the app already sets `trust proxy`, so rate limiting sees real client IPs.

## Security notes

Rate limiting on login, register, OTP and upload · whitelist validation on every DTO ·
ownership checks on user data · Stripe and Inngest requests are signature-verified ·
OTP never returned to delivery partners · password hashes never returned.
