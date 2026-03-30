import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Relay, VerneAPIError, VerneError } from '../src/index.js';

const API_KEY = 'vrn_relay_test_sk_abc123';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  );
}

describe('Relay', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ apiKey: API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('messages.send()', () => {
    it('sends POST /v1/relay/messages with correct payload', async () => {
      const responseBody = {
        id: 'msg_001',
        event_type: 'user.created',
        status: 'accepted',
        timestamp: '2026-01-01T00:00:00Z',
      };
      const spy = mockFetch(202, responseBody);

      const result = await relay.messages.send({
        event_type: 'user.created',
        payload: { id: '123' },
      });

      expect(result).toEqual(responseBody);
      expect(spy).toHaveBeenCalledOnce();

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/relay/messages');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({
        event_type: 'user.created',
        payload: { id: '123' },
      });
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(
        `Bearer ${API_KEY}`,
      );
    });

    it('includes optional fields when provided', async () => {
      const spy = mockFetch(202, { id: 'msg_002', event_type: 'order.placed', status: 'accepted', timestamp: '2026-01-01T00:00:00Z' });

      await relay.messages.send({
        event_type: 'order.placed',
        payload: { order_id: '999' },
        idempotency_key: 'idem_key_1',
        channels: ['team-a'],
      });

      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.idempotency_key).toBe('idem_key_1');
      expect(body.channels).toEqual(['team-a']);
    });

    it('retries once on 429 and succeeds', async () => {
      const successBody = { id: 'msg_003', event_type: 'ping', status: 'accepted', timestamp: '2026-01-01T00:00:00Z' };
      vi.useFakeTimers();

      const spy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'Too many requests', request_id: 'req_1' } }), {
            status: 429,
            headers: { 'Retry-After': '0.01' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(successBody), { status: 202 }),
        );

      const promise = relay.messages.send({ event_type: 'ping', payload: {} });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result).toEqual(successBody);

      vi.useRealTimers();
    });

    it('throws VerneAPIError on 400', async () => {
      mockFetch(400, {
        error: { code: 'invalid_payload', message: "Field 'event_type' is required.", request_id: 'req_bad' },
      });

      await expect(
        relay.messages.send({ event_type: '', payload: {} }),
      ).rejects.toBeInstanceOf(VerneAPIError);
    });

    it('VerneAPIError has correct fields', async () => {
      mockFetch(401, {
        error: { code: 'unauthorized', message: 'Invalid token.', request_id: 'req_unauth' },
      });

      const err = await relay.messages
        .send({ event_type: 'x', payload: {} })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VerneAPIError);
      const apiErr = err as VerneAPIError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe('unauthorized');
      expect(apiErr.requestId).toBe('req_unauth');
    });
  });

  describe('messages.list()', () => {
    it('sends GET /v1/relay/messages', async () => {
      const spy = mockFetch(200, { data: [], has_more: false });

      await relay.messages.list();

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/relay/messages');
      expect(init?.method).toBe('GET');
    });

    it('appends query params', async () => {
      const spy = mockFetch(200, { data: [], has_more: false });

      await relay.messages.list({ limit: 5, event_type: 'user.created' });

      const url = spy.mock.calls[0][0] as string;
      expect(url).toContain('limit=5');
      expect(url).toContain('event_type=user.created');
    });
  });
});
