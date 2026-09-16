import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { handler } from './server.js';

describe('GitHub Webhook Endpoint HTTP Security & Processing — QG-PROD-002.2', () => {
  let server: Server;
  let baseUrl: string;
  const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const testSecret = 'test-github-webhook-secret-xyz-987';

  beforeAll(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = testSecret;
    server = createServer((req, res) => {
      handler(req, res).catch((err: unknown) => {
        console.error(err);
        res.writeHead(500);
        res.end("Internal Server Error");
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function signPayload(body: string, secret = testSecret): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  it('1. rejects webhook requests missing x-hub-signature-256 header with 401', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const res = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeDefined();
  });

  it('2. rejects webhook requests with forged or invalid HMAC signature with 401', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const res = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=1111111111111111111111111111111111111111111111111111111111111111',
      },
      body: payload,
    });
    expect(res.status).toBe(401);
  });

  it('3. rejects webhook signed with wrong secret with 401', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const forgedSig = signPayload(payload, 'wrong-secret-key');
    const res = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': forgedSig,
      },
      body: payload,
    });
    expect(res.status).toBe(401);
  });

  it('4. accepts validly signed reviewable pull_request event with 202 Accepted', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'test-org/repo-alpha', default_branch: 'main' },
      pull_request: {
        number: 101,
        head: { sha: 'a1b2c3d4e5f6' },
        base: { sha: 'f6e5d4c3b2a1' },
        title: 'Feature implementation',
      },
    });
    const validSig = signPayload(payload);
    const deliveryId = `del-${Date.now()}-1`;

    const res = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': validSig,
        'x-github-delivery': deliveryId,
      },
      body: payload,
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { accepted: boolean; deliveryId: string; analyzing: boolean };
    expect(data.accepted).toBe(true);
    expect(data.deliveryId).toBe(deliveryId);
    expect(data.analyzing).toBe(true);
  });

  it('5. deduplicates replay webhook with duplicate x-github-delivery returning 200 idempotent', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'test-org/repo-alpha', default_branch: 'main' },
      pull_request: {
        number: 102,
        head: { sha: 'b2c3d4e5f6a1' },
        base: { sha: 'f6e5d4c3b2a1' },
        title: 'Feature implementation duplicate test',
      },
    });
    const validSig = signPayload(payload);
    const deliveryId = `replay-test-delivery-${Date.now()}`;

    // First delivery
    const res1 = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': validSig,
        'x-github-delivery': deliveryId,
      },
      body: payload,
    });
    expect(res1.status).toBe(202);

    // Second delivery with identical delivery ID
    const res2 = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': validSig,
        'x-github-delivery': deliveryId,
      },
      body: payload,
    });
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as { accepted: boolean; duplicate: boolean; deliveryId: string };
    expect(data2.accepted).toBe(true);
    expect(data2.duplicate).toBe(true);
    expect(data2.deliveryId).toBe(deliveryId);
  });

  it('6. accepts non-reviewable actions with 202 Accepted but analyzing: false', async () => {
    const payload = JSON.stringify({
      action: 'labeled',
      repository: { full_name: 'test-org/repo-alpha', default_branch: 'main' },
      pull_request: {
        number: 103,
        head: { sha: 'c3d4e5f6a1b2' },
        base: { sha: 'f6e5d4c3b2a1' },
        title: 'Labeled PR',
      },
    });
    const validSig = signPayload(payload);

    const res = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': validSig,
      },
      body: payload,
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { accepted: boolean; analyzing: boolean };
    expect(data.accepted).toBe(true);
    expect(data.analyzing).toBe(false);
  });
});
