import type { webcrypto } from 'node:crypto';
import { VerneError, VerneTokenError } from '../../core/errors.js';
import { DEFAULT_BASE_URL } from '../../core/http.js';
import type { SignedTokenClaims } from './types.js';

type SubtleCrypto = webcrypto.SubtleCrypto;
type CryptoKey = webcrypto.CryptoKey;
type JsonWebKey = webcrypto.JsonWebKey;

/** Cache lifetime when the key set answers without `Cache-Control: max-age`. */
const DEFAULT_JWKS_MAX_AGE_MS = 300_000;
/** An unknown `kid` refetches the key set at most this often. */
const MIN_REFETCH_INTERVAL_MS = 30_000;
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 10;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GateTokenVerifierConfig {
  /** Your tenant id. The issuer is `<baseUrl>/auth/<tenantId>`. */
  tenantId: string;
  /** Defaults to https://api.vernesoft.com — the same base URL as the API client. */
  baseUrl?: string;
  /** Allowed clock skew in seconds for `exp` and `nbf`. Default 10. */
  clockToleranceSeconds?: number;
  /** Timeout of a key-set request in milliseconds. Default 10000. */
  timeoutMs?: number;
}

/**
 * Verifies Gate signed tokens (ES256 JWTs) offline, against your tenant's published
 * public keys. No API key is involved: anything that receives a token can verify it.
 *
 * What it checks: the algorithm is ES256 (anything else, `none` included, is refused),
 * the key is the one the token's `kid` names in your tenant's key set, the signature,
 * `iss` is **your** issuer (a token of another Gate tenant is refused even though its
 * signature is valid), `exp` and `nbf`, and that `sub` is present.
 *
 * What it cannot check: whether the session behind the token is still alive. A signed
 * token lives 15 minutes and cannot be revoked; for anything that must follow a
 * revocation or a role change at once, ask `gate.sessions.check()` or introspection.
 *
 * The key set is cached for its `Cache-Control: max-age` (five minutes) and refetched
 * once when a token names a key it has not seen — which is how a key rotation is
 * followed. Keep one verifier per tenant and reuse it.
 *
 * @example
 * const verifier = new GateTokenVerifier({ tenantId: process.env.VERNE_TENANT_ID! });
 * const claims = await verifier.verify(token);
 * claims.sub;  // the end user's id
 * claims.orgs; // [{ id, role, permissions }]
 */
export class GateTokenVerifier {
  readonly issuer: string;
  readonly jwksUrl: string;

  private readonly toleranceSeconds: number;
  private readonly timeoutMs: number;
  private keys = new Map<string, CryptoKey>();
  private fetchedAt = 0;
  private maxAgeMs = DEFAULT_JWKS_MAX_AGE_MS;
  private inflight?: Promise<void>;

  constructor(config: GateTokenVerifierConfig) {
    if (!config.tenantId) {
      throw new VerneError('GateTokenVerifier needs your tenantId.');
    }
    const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.issuer = `${base}/auth/${config.tenantId}`;
    this.jwksUrl = `${this.issuer}/.well-known/jwks.json`;
    this.toleranceSeconds = config.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Verifies `token` and returns its claims. Throws {@link VerneTokenError} (with a
   * `reason`) when the token must not be trusted.
   */
  async verify(token: string): Promise<SignedTokenClaims> {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 3) {
      throw new VerneTokenError('malformed', 'Not a compact JWT.');
    }
    const [rawHeader, rawPayload, rawSignature] = parts;
    const header = decodeJson(rawHeader, 'header');
    const payload = decodeJson(rawPayload, 'payload');

    if (header.alg !== 'ES256') {
      throw new VerneTokenError(
        'unsupported_alg',
        `Token algorithm ${JSON.stringify(header.alg)} is not accepted; Gate signs with ES256.`,
      );
    }
    if (typeof header.kid !== 'string' || header.kid === '') {
      throw new VerneTokenError('malformed', 'Token header has no `kid`.');
    }

    const key = await this.keyFor(header.kid);
    const signature = base64UrlDecode(rawSignature);
    if (!signature || signature.length !== 64) {
      throw new VerneTokenError('bad_signature', 'Token signature is not a P-256 signature.');
    }
    const subtle = await subtleCrypto();
    const valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
    if (!valid) {
      throw new VerneTokenError('bad_signature', 'Token signature does not verify.');
    }

    if (payload.iss !== this.issuer) {
      throw new VerneTokenError(
        'wrong_issuer',
        `Token issuer ${JSON.stringify(payload.iss)} is not ${this.issuer}.`,
      );
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number') {
      throw new VerneTokenError('missing_claim', 'Token has no `exp`.');
    }
    if (now > payload.exp + this.toleranceSeconds) {
      throw new VerneTokenError('expired', 'Token has expired.');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > now + this.toleranceSeconds) {
      throw new VerneTokenError('not_yet_valid', 'Token is not valid yet.');
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new VerneTokenError('missing_claim', 'Token has no `sub`.');
    }

    return payload as SignedTokenClaims;
  }

  private async keyFor(kid: string): Promise<CryptoKey> {
    const stale = Date.now() - this.fetchedAt > this.maxAgeMs;
    if (stale) {
      await this.refresh(this.keys.size === 0);
    }
    let key = this.keys.get(kid);
    if (!key && Date.now() - this.fetchedAt >= MIN_REFETCH_INTERVAL_MS) {
      // A kid we have not seen: a new key may have started signing. Ask once.
      await this.refresh(true);
      key = this.keys.get(kid);
    }
    if (!key) {
      throw new VerneTokenError('unknown_kid', `No key ${kid} in ${this.jwksUrl}.`);
    }
    return key;
  }

  /**
   * Fetches the key set. With `required` false a failure keeps the keys already cached
   * (a stale key set is still the right one unless a token says otherwise).
   */
  private async refresh(required: boolean): Promise<void> {
    this.inflight ??= this.load().finally(() => {
      this.inflight = undefined;
    });
    try {
      await this.inflight;
    } catch (err) {
      if (required) throw err;
    }
  }

  private async load(): Promise<void> {
    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      response = await fetch(this.jwksUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      throw new VerneTokenError(
        'jwks_unavailable',
        `Could not fetch ${this.jwksUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new VerneTokenError(
        'jwks_unavailable',
        `${this.jwksUrl} answered HTTP ${response.status}.`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new VerneTokenError('jwks_unavailable', `${this.jwksUrl} did not answer JSON.`);
    }
    const jwks = (body as { keys?: unknown }).keys;
    if (!Array.isArray(jwks)) {
      throw new VerneTokenError('jwks_unavailable', `${this.jwksUrl} has no \`keys\`.`);
    }

    const subtle = await subtleCrypto();
    const keys = new Map<string, CryptoKey>();
    for (const jwk of jwks as Array<JsonWebKey & { kid?: string; use?: string }>) {
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.kid !== 'string') continue;
      if (jwk.use !== undefined && jwk.use !== 'sig') continue;
      const { kty, crv, x, y } = jwk;
      try {
        keys.set(
          jwk.kid,
          await subtle.importKey(
            'jwk',
            { kty, crv, x, y },
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          ),
        );
      } catch {
        // A key we cannot import is a key we cannot verify with; skip it.
      }
    }
    this.keys = keys;
    this.fetchedAt = Date.now();
    this.maxAgeMs = maxAgeMs(response.headers.get('Cache-Control'));
  }
}

function maxAgeMs(cacheControl: string | null): number {
  const match = cacheControl ? /max-age=(\d+)/i.exec(cacheControl) : null;
  return match ? Number(match[1]) * 1000 : DEFAULT_JWKS_MAX_AGE_MS;
}

function decodeJson(segment: string, what: string): Record<string, unknown> {
  const bytes = base64UrlDecode(segment);
  if (bytes) {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }
  throw new VerneTokenError('malformed', `Token ${what} is not base64url JSON.`);
}

function base64UrlDecode(segment: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) return null;
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

let subtlePromise: Promise<SubtleCrypto> | undefined;

/** WebCrypto: global in Node 19+, Deno, Bun and edge runtimes; `node:crypto` on Node 18. */
function subtleCrypto(): Promise<SubtleCrypto> {
  subtlePromise ??= (async () => {
    const global = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto;
    if (global?.subtle) return global.subtle;
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.webcrypto.subtle as SubtleCrypto;
  })();
  return subtlePromise;
}
