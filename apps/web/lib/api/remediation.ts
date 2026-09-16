import { getAuthToken } from './client';

export interface RemediationStreamCallbacks {
  onStart?: (info: {
    findingId: string;
    provider: string;
    wasLimited?: boolean;
    redacted?: boolean;
    limitReasons?: string[];
  }) => void;
  onChunk: (text: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export async function streamFindingRemediation(
  findingId: string,
  callbacks: RemediationStreamCallbacks,
  options?: { signal?: AbortSignal; files?: Array<{ path: string; content: string }> },
): Promise<void> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`/api/findings/${encodeURIComponent(findingId)}/remediate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: options?.files ?? [] }),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson.error) errorMsg = errJson.error;
    } catch {}
    const err = new Error(errorMsg);
    callbacks.onError(err);
    throw err;
  }

  if (!response.body) {
    const err = new Error('Response body is empty');
    callbacks.onError(err);
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf8');
  let buffer = '';

  try {
    while (true) {
      if (options?.signal?.aborted) {
        await reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let currentEvent = 'chunk';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
        } else if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          try {
            const parsed = JSON.parse(dataStr);
            if (currentEvent === 'start') {
              callbacks.onStart?.(parsed);
            } else if (currentEvent === 'chunk' && parsed.text) {
              callbacks.onChunk(parsed.text);
            } else if (currentEvent === 'complete') {
              callbacks.onComplete();
            } else if (currentEvent === 'error') {
              callbacks.onError(new Error(parsed.error ?? 'Unknown streaming error'));
            }
          } catch {
            // Ignore non-JSON lines
          }
        }
      }
    }
  } catch (error) {
    if (!options?.signal?.aborted) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    reader.releaseLock();
  }
}
