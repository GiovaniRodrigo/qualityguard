export interface User { id: string; email: string; passwordHash: string; createdAt: string; }
export interface Organization { id: string; name: string; ownerId: string; plan: 'community' | 'pro' | 'team' | 'enterprise'; stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string; }
export interface Project { id: string; organizationId: string; name: string; repository: string; createdAt: string; }

export class MemoryStore {
  readonly users = new Map<string, User>();
  readonly organizations = new Map<string, Organization>();
  readonly projects = new Map<string, Project>();
}
