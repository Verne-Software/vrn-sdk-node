import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clockwork, Gate, Passepartout, Relay, Verne, VerneAPIError, VerneError } from '../src/index.js';

const KEY = 'vrn_9f8a7c1b2d3e4f50';

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('429 retry policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not wait out the monthly Relay limit: throws at once with retryAfter', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      response(
        429,
        {
          error: {
            code: 'RELAY_MESSAGE_LIMIT_REACHED',
            message: 'You have sent the 10000 messages the Free plan includes this month.',
            request_id: 'req_1',
            plan: 'free',
            limit: 10000,
            current: 10000,
          },
        },
        { 'Retry-After': '1209600' },
      ),
    );
    const relay = new Relay({ apiKey: KEY });
    const err = await relay.messages.send({ event_type: 'ping', payload: {} }).catch((e) => e);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(VerneAPIError);
    expect(err.code).toBe('RELAY_MESSAGE_LIMIT_REACHED');
    expect(err.retryAfter).toBe(1209600);
    expect(err.details).toEqual({ plan: 'free', limit: 10000, current: 10000 });
  });

  it('does not retry a 429 whose Retry-After is longer than a minute', async () => {
    const spy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '61' }),
      );
    const relay = new Relay({ apiKey: KEY });
    await expect(relay.messages.send({ event_type: 'ping', payload: {} })).rejects.toMatchObject({
      status: 429,
      retryAfter: 61,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never retries a 402', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      response(402, {
        error: { code: 'UPGRADE_REQUIRED', message: 'limit', request_id: 'r', kind: 'cron', limit: 10, current: 10 },
      }),
    );
    const cw = new Clockwork({ apiKey: KEY });
    const err = await cw.jobs
      .create({ name: 'n', schedule: '0 * * * *', url: 'https://example.com' })
      .catch((e) => e);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(err.code).toBe('UPGRADE_REQUIRED');
    expect(err.details.kind).toBe('cron');
  });

  it('still retries a short 429 once', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(429, { error: { code: 'rate_limited', message: 'x' } }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(response(201, { access_token: 'gat_live_x', expires_at: '', subject: 's', tenant_id: 't' }));
    const gate = new Gate({ apiKey: KEY });
    const promise = gate.tokens.create({ subject: 's' });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({ access_token: 'gat_live_x' });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('error bodies', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the 403 for a missing scope is the standard envelope', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      response(403, {
        error: {
          code: 'forbidden',
          message: 'This API key is not authorized for Passepartout.',
          request_id: 'req_x',
        },
      }),
    );
    const pp = new Passepartout({ apiKey: KEY });
    await expect(pp.loginStart()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      requestId: 'req_x',
      message: 'This API key is not authorized for Passepartout.',
      details: {},
    });
  });

  it('a body that is not JSON is still a VerneAPIError with the status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    const gate = new Gate({ apiKey: KEY });
    const err = await gate.identities.get('x').catch((e) => e);
    expect(err).toBeInstanceOf(VerneAPIError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('unknown');
    expect(err.message).toBe('HTTP 502');
  });
});

describe('Verne with one API key', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses apiKey for every service', async () => {
    const spy = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async () => response(200, { providers: [], return_urls: [], data: [] }));
    const verne = new Verne({ apiKey: KEY });
    await verne.gate.settings.getReturnUrls();
    await verne.clockwork.jobs.list();
    for (const [, init] of spy.mock.calls) {
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    }
    expect(verne.relay).toBeInstanceOf(Relay);
    expect(verne.passepartout).toBeInstanceOf(Passepartout);
  });

  it('a per-service key overrides apiKey for that service only', async () => {
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async () => response(200, []));
    const verne = new Verne({ apiKey: KEY, clockwork: 'vrn_other' });
    await verne.clockwork.jobs.list();
    await verne.gate.sessions.list('u');
    expect((spy.mock.calls[0][1]?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer vrn_other',
    );
    expect((spy.mock.calls[1][1]?.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${KEY}`,
    );
  });

  it('without any key is a configuration error naming apiKey', () => {
    expect(() => new Verne({})).toThrow(/apiKey/);
    expect(() => new Verne({})).toThrow(VerneError);
  });
});
