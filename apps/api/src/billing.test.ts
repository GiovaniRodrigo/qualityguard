import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { mapSubscriptionEvent, verifyStripeSignature } from './billing.js';

describe('billing utilities', () => {
  const secret = 'whsec_test_secret_12345';
  const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });

  it('validates authentic Stripe webhook signatures', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    const header = `t=${timestamp},v1=${signature}`;
    expect(verifyStripeSignature(payload, header, secret)).toBe(true);
  });

  it('rejects invalid Stripe webhook signatures', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=invalidsig`;
    expect(verifyStripeSignature(payload, header, secret)).toBe(false);
  });

  it('maps subscription events to plan models', () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { plan: 'team' },
        },
      },
    };
    const mapped = mapSubscriptionEvent(event);
    expect(mapped?.customerId).toBe('cus_123');
    expect(mapped?.plan).toBe('team');
    expect(mapped?.status).toBe('active');
  });

  it('downgrades canceled subscriptions to community plan', () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'canceled',
        },
      },
    };
    const mapped = mapSubscriptionEvent(event);
    expect(mapped?.plan).toBe('community');
  });
});
