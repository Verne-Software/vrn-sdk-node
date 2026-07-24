import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Passepartout } from '../src/index.js';

const API_KEY = 'vrn_passepartout_test_sk_abc123';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? {} : { 'Content-Type': 'application/json' },
    }),
  );
}

describe('Passepartout', () => {
  let pp: Passepartout;

  beforeEach(() => {
    pp = new Passepartout({ apiKey: API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loginStart()', () => {
    it('sends POST /v1/passepartout/login/start with auth', async () => {
      const body = { nonce: 'abc', deep_link: 'https://t.me/bot?start=abc', expires_at: '2026-07-24T00:00:00Z' };
      const spy = mockFetch(200, body);

      const result = await pp.loginStart();

      expect(result).toEqual(body);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/passepartout/login/start');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe('loginStatus()', () => {
    it('sends GET /v1/passepartout/login/status?nonce=', async () => {
      const body = { status: 'completed', access_token: 'ppt_live_x', user: { id: '42', username: 'ada' } };
      const spy = mockFetch(200, body);

      const result = await pp.loginStatus('abc');

      expect(result).toEqual(body);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/passepartout/login/status?nonce=abc');
      expect(init?.method).toBe('GET');
    });

    it('url-encodes the nonce', async () => {
      const spy = mockFetch(200, { status: 'pending' });
      await pp.loginStatus('a b/c');
      const [url] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/passepartout/login/status?nonce=a%20b%2Fc');
    });
  });

  describe('introspect()', () => {
    it('sends POST /v1/passepartout/tokens/introspect with the token in the body', async () => {
      const body = { active: true, subject: 'identity_1', tenant_id: 'ten_1' };
      const spy = mockFetch(200, body);

      const result = await pp.introspect('ppt_live_x');

      expect(result).toEqual(body);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/passepartout/tokens/introspect');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ access_token: 'ppt_live_x' });
    });
  });
});
