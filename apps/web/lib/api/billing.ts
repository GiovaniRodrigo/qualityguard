import { apiFetch } from './client';
import type { BillingSubscription } from './types';

export async function getBillingSubscription(): Promise<BillingSubscription> {
  return apiFetch<BillingSubscription>('/billing/subscription');
}
