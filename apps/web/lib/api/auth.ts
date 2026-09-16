import { apiFetch, clearAuthToken, setAuthToken } from './client';
import type { Organization, Project, User } from './types';

export interface AuthResponse {
  token: string;
  userId: string;
  organizationId?: string;
  email?: string;
}

export interface MeResponse {
  user: User;
  organization: Organization;
  projects: Project[];
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function register(email: string, password: string, organization?: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, organization }),
  });
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me');
}

export function logout(): void {
  clearAuthToken();
}
