const TOKEN_KEY = 'qualityguard_auth_token';
let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return memoryToken;
    }
  }
  return memoryToken;
}

export function setAuthToken(token: string): void {
  memoryToken = token;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }
}

export function clearAuthToken(): void {
  memoryToken = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }
}

export interface FetchOptions extends RequestInit {
  retryCount?: number;
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // In browser, call /api/... which Next.js rewrites to the API server or direct URL
  const url = path.startsWith('/api') ? path : `/api${path}`;

  const maxRetries = options.retryCount ?? 1;
  let lastError: Error = new Error('Unknown network error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) errorMessage = body.error;
        } catch {}
        if (
          response.status === 401 ||
          (response.status === 403 &&
            !url.includes('/billing') &&
            !url.includes('/auth/login') &&
            !url.includes('/auth/register'))
        ) {
          clearAuthToken();
        }
        throw new Error(errorMessage);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries && !lastError.message.includes('401') && !lastError.message.includes('403')) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      } else {
        break;
      }
    }
  }

  throw lastError;
}
