/**
 * Integration suite for 1.5.0: Clockwork time zones and importing a user with a
 * password hash, a confirmed address and metadata. Same environment as
 * `gate.integration.ts` (VERNE_API_KEY with scopes gate + clockwork, VERNE_BASE_URL,
 * VERNE_EMAIL_PREFIX); everything it creates is deleted again.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { Verne, VerneAPIError } from '../../src/index.js';

const KEY = process.env.VERNE_API_KEY;
const BASE_URL = (process.env.VERNE_BASE_URL ?? 'http://api.soft.com').replace(/\/+$/, '');
const PREFIX = process.env.VERNE_EMAIL_PREFIX ?? `e2e-sdk-${Date.now().toString(36)}`;

const host = new URL(BASE_URL).hostname;
if (KEY && !['api.soft.com', 'localhost', '127.0.0.1'].includes(host) && process.env.VERNE_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the integration suite against ${host}; set VERNE_ALLOW_REMOTE=1 to insist.`);
}

const suite = KEY ? describe.sequential : describe.skip;
const API_KEY = KEY ?? 'vrn_unset';

// bcrypt (cost 10) of IMPORTED_PASSWORD — a test value, nothing else.
const IMPORTED_PASSWORD = 'Imported-Pw-104!';
const IMPORTED_HASH = '$2b$10$Ky/GcB0gC9sEpv84tO7.Wuxp7RsfSWrDYtz7M5iU4akOb3O5Y1Kq2';

suite('1.5.0 against a live stack', () => {
  const verne = new Verne({ apiKey: API_KEY, baseUrl: BASE_URL });
  const cleanup: Array<() => Promise<unknown>> = [];

  afterAll(async () => {
    for (const step of cleanup.reverse()) await step().catch(() => undefined);
  });

  it('a cron job keeps its time zone: create, list, update, delete', async () => {
    const job = await verne.clockwork.jobs.create({
      name: `${PREFIX}-tz`,
      schedule: '0 9 * * *',
      timezone: 'Europe/Paris',
      url: 'https://example.com/hooks/tz',
      method: 'GET',
    });
    cleanup.push(() => verne.clockwork.jobs.delete(job.id));

    expect(job.timezone).toBe('Europe/Paris');
    // 09:00 in Paris in October (CEST, UTC+2) is 07:00 UTC.
    expect(job.next_run_at).toMatch(/T07:00:00(\.0+)?(Z|\+00:00)$/);

    const listed = (await verne.clockwork.jobs.list()).find((j) => j.id === job.id);
    expect(listed?.timezone).toBe('Europe/Paris');

    const moved = await verne.clockwork.jobs.update(job.id, { timezone: 'America/New_York' });
    expect(moved.timezone).toBe('America/New_York');
    // 09:00 in New York in October (EDT, UTC-4) is 13:00 UTC.
    expect(moved.next_run_at).toMatch(/T13:00:00(\.0+)?(Z|\+00:00)$/);

    await verne.clockwork.jobs.delete(job.id);
  });

  it('a job created without a zone is UTC; an unknown zone is 400 invalid_payload', async () => {
    const job = await verne.clockwork.jobs.create({
      name: `${PREFIX}-utc`,
      schedule: '0 9 * * *',
      url: 'https://example.com/hooks/utc',
    });
    cleanup.push(() => verne.clockwork.jobs.delete(job.id));
    expect(job.timezone).toBe('UTC');

    const err = await verne.clockwork.jobs
      .update(job.id, { timezone: 'Mars/Olympus' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerneAPIError);
    expect((err as VerneAPIError).status).toBe(400);
    expect((err as VerneAPIError).code).toBe('invalid_payload');
  });

  it('an imported user: bcrypt hash, confirmed address, metadata; signs in with the old password', async () => {
    const email = `${PREFIX}-import@e2e.soft.com`;
    const identity = await verne.gate.identities.create({
      schema_id: 'user',
      traits: { email },
      credentials: { password: { config: { hashed_password: IMPORTED_HASH } } },
      email_verified: true,
      metadata_public: { previous_user_id: 'auth0|sdk-104' },
    });
    cleanup.push(() => verne.gate.identities.delete(identity.id));

    expect(identity.verifiable_addresses?.[0].verified).toBe(true);
    expect(identity.verifiable_addresses?.[0].status).toBe('completed');
    expect(identity.metadata_public).toEqual({ previous_user_id: 'auth0|sdk-104' });

    const fetched = await verne.gate.identities.get(identity.id);
    expect(fetched.verifiable_addresses?.[0].verified).toBe(true);

    const flow = await verne.gate.createLoginFlow();
    const res = await fetch(flow.ui.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ method: 'password', identifier: email, password: IMPORTED_PASSWORD }),
    });
    const body = (await res.json()) as { session_token?: string };
    expect(res.status).toBe(200);
    expect(body.session_token).toBeTruthy();

    await verne.gate.identities.delete(identity.id);
  });
});
