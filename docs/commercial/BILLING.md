# QualityGuard Billing

## Plans

| Plan | Model | Billing |
|---|---|---|
| Community | Individual/local | Free |
| Pro | Individual professional | Stripe subscription |
| Team | Shared governance | Stripe subscription |
| Enterprise | Governance/self-hosted | Stripe subscription/custom |

## Stripe setup

Create three recurring Stripe Prices and set:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_TEAM=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

The API exposes:

- `POST /billing/checkout` — creates a subscription Checkout Session.
- `POST /billing/portal` — creates a customer Billing Portal session.
- `POST /webhooks/stripe` — verifies Stripe signatures and synchronizes subscription state.

Configure Stripe to send subscription lifecycle events to `/webhooks/stripe`, especially `customer.subscription.created`, `updated`, and `deleted`.

## Security

- Stripe secret keys are server-side only.
- Webhooks are authenticated with Stripe's signed payload.
- Checkout and portal routes require an authenticated QualityGuard user.
- Subscription state is treated as webhook-owned state, not client input.

## Production gate

Before accepting real customers, replace the development `MemoryStore` with the PostgreSQL repository, configure HTTPS, secret management, rate limiting, email verification/password recovery, and run Stripe test-mode end-to-end tests before switching to live prices.
