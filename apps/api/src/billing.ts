import { createHmac, timingSafeEqual } from 'node:crypto';

export type Plan = 'community' | 'pro' | 'team' | 'enterprise';
export interface BillingCustomer { id: string; email: string; }
export interface CheckoutRequest { customer: BillingCustomer; plan: Exclude<Plan, 'community'>; successUrl: string; cancelUrl: string; }
export interface CheckoutResult { id: string; url: string; }

const priceMap: Record<Exclude<Plan, 'community'>, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export async function createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = priceMap[request.plan];
  if (!secret || !price) throw new Error('Stripe billing is not configured for this plan');
  const body = new URLSearchParams({
    mode: 'subscription',
    customer: request.customer.id,
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Stripe checkout failed: ${response.status}`);
  const data = await response.json() as { id: string; url: string | null };
  if (!data.url) throw new Error('Stripe did not return a checkout URL');
  return { id: data.id, url: data.url };
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('Stripe billing is not configured');
  const body = new URLSearchParams({ customer: customerId, return_url: returnUrl });
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Stripe portal failed: ${response.status}`);
  const data = await response.json() as { url: string };
  return { url: data.url };
}

export function verifyStripeSignature(payload: string, signature: string, secret: string, toleranceSeconds = 300): boolean {
  const timestamp = signature.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signatures = signature.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return signatures.some((value) => value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected)));
}
