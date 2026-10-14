import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Gate, GateTokenVerifier, VerneTokenError } from '../src/index.js';

const subtle = webcrypto.subtle;
const TENANT = '550e8400-e29b-41d4-a716-446655440000';
const ISSUER = `https://api.vernesoft.com/auth/${TENANT}`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;

type Pair = { privateKey: webcrypto.CryptoKey; jwk: webcrypto.JsonWebKey & { kid: string } };

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes) : bytes).toString('base64url');

async function keyPair(kid: string): Promise<Pair> {
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as webcrypto.CryptoKeyPair;
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid } };
}

async function sign(
  pair: Pair,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'ES256', typ: 'JWT', kid: pair.jwk.kid },
) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = new Uint8Array(
    await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(input)),
  );
  return `${input}.${b64url(sig)}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    sub: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    sid: '8e4f0b2a-3c1d-4e5f-9a6b-7c8d9e0f1a2b',
    tenant_id: TENANT,
    schema_id: 'user',
    email: 'ada@example.com',
    role: 'authenticated',
    orgs: [{ id: 'o1', role: 'admin', permissions: ['invoices:write'] }],
    iat: now,
    nbf: now,
    exp: now + 900,
    jti: 'j1',
    ...overrides,
  };
}

function serveJwks(...keys: Array<webcrypto.JsonWebKey & { kid: string }>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    expect(String(url)).toBe(JWKS_URL);
    return new Response(JSON.stringify({ keys: keys.map((k) => ({ ...k, alg: 'ES256', use: 'sig' })) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  });
}

describe('GateTokenVerifier', () => {
  let current: Pair;
  let other: Pair;

  beforeAll(async () => {
    current = await keyPair('k1');
    other = await keyPair('k2');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('accepts a token signed by the tenant key and returns its claims', async () => {
    const spy = serveJwks(current.jwk);
    const verifier = new GateTokenVerifier({ tenantId: TENANT });
    const result = await verifier.verify(await sign(current, claims()));
    expect(result.sub).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(result.orgs).toEqual([{ id: 'o1', role: 'admin', permissions: ['invoices:write'] }]);

    // The key set is cached: a second token does not refetch it.
    await verifier.verify(await sign(current, claims({ jti: 'j2' })));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  const refusals: Array<[string, () => Promise<string>, string]> = [
    ['another tenant\'s issuer', () => sign(current, claims({ iss: 'https://api.vernesoft.com/auth/other' })), 'wrong_issuer'],
    ['an expired token', () => sign(current, claims({ exp: Math.floor(Date.now() / 1000) - 60 })), 'expired'],
    ['a token not valid yet', () => sign(current, claims({ nbf: Math.floor(Date.now() / 1000) + 600 })), 'not_yet_valid'],
    ['a token without sub', () => sign(current, claims({ sub: '' })), 'missing_claim'],
    ['alg none', async () => `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64url(JSON.stringify(claims()))}.`, 'unsupported_alg'],
    ['alg HS256', () => sign(current, claims(), { alg: 'HS256', kid: 'k1' }), 'unsupported_alg'],
    ['a signature by another key under our kid', () => sign({ ...other, jwk: { ...other.jwk, kid: 'k1' } }, claims()), 'bad_signature'],
    ['garbage', async () => 'not-a-jwt', 'malformed'],
  ];

  for (const [label, make, reason] of refusals) {
    it(`refuses ${label} (${reason})`, async () => {
      serveJwks(current.jwk);
      const verifier = new GateTokenVerifier({ tenantId: TENANT });
      const err = await verifier.verify(await make()).catch((e) => e);
      expect(err).toBeInstanceOf(VerneTokenError);
      expect(err.reason).toBe(reason);
    });
  }

  it('tolerates a little clock skew', async () => {
    serveJwks(current.jwk);
    const verifier = new GateTokenVerifier({ tenantId: TENANT });
    const now = Math.floor(Date.now() / 1000);
    await expect(verifier.verify(await sign(current, claims({ exp: now - 5 })))).resolves.toBeTruthy();
  });

  it('refetches the key set once for an unknown kid (a rotation), not on every token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let served = [current.jwk];
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ keys: served }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      }),
    );
    const verifier = new GateTokenVerifier({ tenantId: TENANT });
    await verifier.verify(await sign(current, claims()));
    expect(spy).toHaveBeenCalledTimes(1);

    // A new key starts signing; it has been published meanwhile.
    served = [current.jwk, other.jwk];
    vi.setSystemTime(Date.now() + 31_000);
    await expect(verifier.verify(await sign(other, claims()))).resolves.toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);

    // A kid nobody publishes: refused, and not refetched again within 30 seconds.
    const stranger = await keyPair('k3');
    const err = await verifier.verify(await sign(stranger, claims())).catch((e) => e);
    expect(err.reason).toBe('unknown_kid');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reports an unreachable key set as jwks_unavailable', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }));
    const verifier = new GateTokenVerifier({ tenantId: TENANT });
    const err = await verifier.verify(await sign(current, claims())).catch((e) => e);
    expect(err.reason).toBe('jwks_unavailable');
  });

  it('gate.tokens.verifySigned() builds the issuer from the client base URL', async () => {
    const localIssuer = `http://api.soft.com/auth/${TENANT}`;
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      expect(String(url)).toBe(`${localIssuer}/.well-known/jwks.json`);
      return new Response(JSON.stringify({ keys: [current.jwk] }), { status: 200 });
    });
    const gate = new Gate({ apiKey: 'vrn_x', baseUrl: 'http://api.soft.com/' });
    const result = await gate.tokens.verifySigned(await sign(current, claims({ iss: localIssuer })), {
      tenantId: TENANT,
    });
    expect(result.iss).toBe(localIssuer);
  });
});
