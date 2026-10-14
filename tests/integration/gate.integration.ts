/**
 * Integration suite: every 1.4.0 resource against a real Nautilus stack.
 *
 *   VERNE_API_KEY=vrn_…              key with scopes gate, clockwork, passepartout (required)
 *   VERNE_BASE_URL=http://api.soft.com   default; any other host needs VERNE_ALLOW_REMOTE=1
 *   VERNE_EMAIL_PREFIX=e2e-sdk-<run>  every end user created is <prefix>-<n>@e2e.soft.com
 *   VERNE_NARROW_KEY=vrn_…            optional: a key WITHOUT the gate scope (403 check)
 *
 * It creates end users, an organization with roles and members, changes the
 * tenant's security settings and return URLs for a moment, and removes all of it
 * again. Run it against a local stack, never production.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Clockwork,
  Gate,
  GateTokenVerifier,
  Verne,
  VerneAPIError,
  type Identity,
  type Organization,
  type Role,
} from '../../src/index.js';

const KEY = process.env.VERNE_API_KEY;
const BASE_URL = (process.env.VERNE_BASE_URL ?? 'http://api.soft.com').replace(/\/+$/, '');
const PREFIX = process.env.VERNE_EMAIL_PREFIX ?? `e2e-sdk-${Date.now().toString(36)}`;
const NARROW_KEY = process.env.VERNE_NARROW_KEY;

const host = new URL(BASE_URL).hostname;
if (KEY && !['api.soft.com', 'localhost', '127.0.0.1'].includes(host) && process.env.VERNE_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the integration suite against ${host}; set VERNE_ALLOW_REMOTE=1 to insist.`);
}

const suite = KEY ? describe.sequential : describe.skip;
// A skipped suite's body still runs at collection: the clients need *a* key to construct.
const API_KEY = KEY ?? 'vrn_unset';

const email = (n: string) => `${PREFIX}-${n}@e2e.soft.com`;
const password = () => `Pw-${randomUUID().slice(0, 13)}-Zq9!x`;

async function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err, `expected a ${status}`).toBeInstanceOf(VerneAPIError);
  expect((err as VerneAPIError).status).toBe(status);
  if (code) expect((err as VerneAPIError).code).toBe(code);
  return err as VerneAPIError;
}

/** A password login through the flow's `ui.action` — the part an SDK leaves to the browser. */
async function passwordLogin(gate: Gate, identifier: string, secret: string): Promise<string> {
  const flow = (await gate.createLoginFlow()) as { ui: { action: string } };
  const res = await fetch(flow.ui.action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ method: 'password', identifier, password: secret }),
  });
  const body = (await res.json()) as { session_token?: string };
  if (!res.ok || !body.session_token) throw new Error(`login failed: HTTP ${res.status}`);
  return body.session_token;
}

suite('Gate 1.4.0 against a live stack', () => {
  const verne = new Verne({ apiKey: API_KEY, baseUrl: BASE_URL });
  const gate = verne.gate;
  const cleanup: Array<() => Promise<unknown>> = [];

  let tenantId: string;
  let member: Identity;
  let outsider: Identity;
  let memberPassword: string;
  let org: Organization;
  let admin: Role;
  let viewer: Role;

  beforeAll(async () => {
    memberPassword = password();
    member = await gate.identities.create({
      schema_id: 'user',
      traits: { email: email('member') },
      credentials: { password: { config: { password: memberPassword } } },
    });
    cleanup.push(() => gate.identities.delete(member.id));
    outsider = await gate.identities.create({ schema_id: 'user', traits: { email: email('outsider') } });
    cleanup.push(() => gate.identities.delete(outsider.id));
  });

  afterAll(async () => {
    for (const step of cleanup.reverse()) {
      await step().catch(() => undefined);
    }
  });

  it('tokens.create() authenticates with the header and answers for the tenant', async () => {
    const token = await gate.tokens.create({ subject: 'sdk-integration' });
    expect(token.access_token).toMatch(/^gat_/);
    tenantId = token.tenant_id;
    expect(tenantId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a key without the gate scope gets the standard 403 envelope', async () => {
    if (!NARROW_KEY) return;
    const narrow = new Gate({ apiKey: NARROW_KEY, baseUrl: BASE_URL });
    const err = await expectApiError(narrow.organizations.list(), 403, 'forbidden');
    expect(err.message).toBe('This API key is not authorized for Gate.');
    expect(err.requestId).toMatch(/^req_/);
  });

  it('409 is "you already have this end user"', async () => {
    await expectApiError(
      gate.identities.create({ schema_id: 'user', traits: { email: email('member') } }),
      409,
      'conflict',
    );
  });

  it('custom metadata: read, merge, delete a key', async () => {
    expect(await gate.identities.getMetadata(member.id)).toEqual({});
    expect(await gate.identities.updateMetadata(member.id, { plan: 'pro', seats: 5 })).toEqual({
      plan: 'pro',
      seats: 5,
    });
    expect(await gate.identities.updateMetadata(member.id, { seats: null })).toEqual({ plan: 'pro' });
  });

  it('organizations: create, list, get, rename', async () => {
    org = await gate.organizations.create({ name: 'Acme' });
    cleanup.push(() => gate.organizations.delete(org.id));
    expect(org.name).toBe('Acme');

    const listed = await gate.organizations.list({ limit: 100 });
    expect(listed.data.map((o) => o.id)).toContain(org.id);

    expect((await gate.organizations.get(org.id)).id).toBe(org.id);
    org = await gate.organizations.update(org.id, { name: 'Acme Corp' });
    expect(org.name).toBe('Acme Corp');

    await expectApiError(gate.organizations.create({ name: '' }), 400, 'invalid_payload');
  });

  it('roles: create, list, get, update; names are unique per organization', async () => {
    admin = await gate.organizations.roles.create(org.id, {
      name: 'admin',
      permissions: ['invoices:write', 'invoices:read', 'invoices:read'],
    });
    expect(admin.permissions).toEqual(['invoices:read', 'invoices:write']);
    viewer = await gate.organizations.roles.create(org.id, { name: 'viewer' });
    viewer = await gate.organizations.roles.update(org.id, viewer.id, { permissions: ['invoices:read'] });
    expect(viewer.permissions).toEqual(['invoices:read']);

    const roles = await gate.organizations.roles.list(org.id, { limit: 1 });
    expect(roles.data).toHaveLength(1);
    expect(roles.has_more).toBe(true);
    const next = await gate.organizations.roles.list(org.id, { limit: 1, cursor: roles.next_cursor! });
    expect(next.data[0].id).not.toBe(roles.data[0].id);

    expect((await gate.organizations.roles.get(org.id, admin.id)).name).toBe('admin');
    await expectApiError(gate.organizations.roles.create(org.id, { name: 'admin' }), 409, 'conflict');
    await expectApiError(gate.organizations.roles.create(org.id, { name: 'Admin' }), 400, 'invalid_payload');
  });

  it('members: add, list, change the deadline, refuse a second membership', async () => {
    const added = await gate.organizations.members.add(org.id, {
      identity_id: member.id,
      role_id: admin.id,
    });
    expect(added.expires_at).toBeNull();
    await expectApiError(
      gate.organizations.members.add(org.id, { identity_id: member.id, role_id: viewer.id }),
      409,
      'conflict',
    );

    const deadline = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    deadline.setUTCMilliseconds(0);
    const dated = await gate.organizations.members.update(org.id, member.id, { expires_at: deadline });
    expect(new Date(dated.expires_at!).getTime()).toBe(deadline.getTime());
    const kept = await gate.organizations.members.update(org.id, member.id, { role_id: admin.id });
    expect(kept.expires_at).not.toBeNull();
    const cleared = await gate.organizations.members.update(org.id, member.id, { expires_at: null });
    expect(cleared.expires_at).toBeNull();

    const members = await gate.organizations.members.list(org.id);
    expect(members.data.map((m) => m.identity_id)).toEqual([member.id]);

    const held = await gate.identities.listOrganizations(member.id);
    expect(held.data).toEqual([
      { id: org.id, role: 'admin', permissions: ['invoices:read', 'invoices:write'] },
    ]);
    expect((await gate.identities.listOrganizations(outsider.id)).data).toEqual([]);
  });

  it('a role somebody holds cannot be deleted', async () => {
    const err = await expectApiError(gate.organizations.roles.delete(org.id, admin.id), 409, 'conflict');
    expect(err.message).toMatch(/held by 1 member/);
  });

  it('authorize / can: every reason the organization check gives', async () => {
    const yes = await gate.organizations.authorize(org.id, member.id, 'invoices:write');
    expect(yes).toMatchObject({ allowed: true, reason: 'member_with_permission', role: 'admin' });
    expect(yes.decision_id).toMatch(/^dec_/);

    const no = await gate.organizations.authorize(org.id, member.id, 'members:invite');
    expect(no).toMatchObject({ allowed: false, reason: 'member_without_permission', role: 'admin' });

    const stranger = await gate.organizations.authorize(org.id, outsider.id, 'invoices:read');
    expect(stranger).toMatchObject({ allowed: false, reason: 'not_a_member' });
    expect(stranger.role).toBeUndefined();

    const missing = await gate.organizations.authorize(randomUUID(), member.id, 'invoices:read');
    expect(missing).toMatchObject({ allowed: false, reason: 'no_such_organization' });

    await gate.identities.deactivate(member.id);
    try {
      const inactive = await gate.organizations.authorize(org.id, member.id, 'invoices:write');
      expect(inactive).toMatchObject({ allowed: false, reason: 'subject_inactive', role: 'admin' });
    } finally {
      await gate.identities.activate(member.id);
    }

    expect(await gate.organizations.can(org.id, member.id, 'invoices:write')).toBe(true);
    expect(await gate.organizations.can(org.id, member.id, 'members:invite')).toBe(false);
    await expectApiError(gate.organizations.can(org.id, member.id, 'Invoices:*'), 400, 'invalid_payload');

    // The plain ownership check: a code in `reason`, the sentence in `message`.
    const owned = await gate.authorize({ subject: member.id, action: 'read', resource: 'doc:1' });
    expect(owned).toMatchObject({ allowed: true, reason: 'owned_by_tenant' });
    expect(owned.message).toMatch(/is an identity owned by tenant/);
    const nobody = await gate.authorize({ subject: randomUUID(), action: 'read', resource: 'doc:1' });
    expect(nobody).toMatchObject({ allowed: false, reason: 'not_a_known_identity' });
    const notAnId = await gate.authorize({ subject: 'usr_123', action: 'read', resource: 'doc:1' });
    expect(notAnId).toMatchObject({ allowed: false, reason: 'not_a_known_identity' });
    await gate.identities.deactivate(outsider.id);
    try {
      const off = await gate.authorize({ subject: outsider.id, action: 'read', resource: 'doc:1' });
      expect(off).toMatchObject({ allowed: false, reason: 'subject_inactive' });
    } finally {
      await gate.identities.activate(outsider.id);
    }
  });

  it('revokeAll: idempotent for a user with no session; 403 for an id not yours', async () => {
    await gate.sessions.revokeAll(outsider.id); // never signed in
    await gate.sessions.revokeAll(outsider.id); // and again
    await expectApiError(gate.sessions.revokeAll(randomUUID()), 403, 'forbidden');

    const gone = await gate.identities.create({ schema_id: 'user', traits: { email: email('gone') } });
    await gate.identities.delete(gone.id);
    // Deleted through the API: no longer yours, so 403 like any other stranger.
    await expectApiError(gate.sessions.revokeAll(gone.id), 403, 'forbidden');
  });

  it('a malformed token request is 400 invalid_payload with a request id', async () => {
    const err = await expectApiError(
      gate.tokens.create({ subject: 'x', ttl_seconds: 'soon' as unknown as number }),
      400,
      'invalid_payload',
    );
    expect(err.requestId).toMatch(/^req_/);
  });

  it('identities no longer carry the owner stamp', async () => {
    const read = await gate.identities.get(member.id);
    expect(JSON.stringify(read)).not.toContain('verne_tenant_id');
  });

  it('introspection lists the end user\'s organizations', async () => {
    const token = await gate.tokens.create({ subject: member.id });
    const info = await gate.tokens.introspect(token.access_token);
    expect(info.active).toBe(true);
    expect(info.orgs).toEqual([{ id: org.id, role: 'admin', permissions: ['invoices:read', 'invoices:write'] }]);
    expect(await gate.tokens.introspect('gat_live_not_a_token')).toEqual({ active: false });
  });

  it('sessions: check, mfa_required, signed token, verify, revoke', async () => {
    const sessionToken = await passwordLogin(gate, email('member'), memberPassword);

    const check = await gate.sessions.check(sessionToken);
    expect(check).toMatchObject({ active: true, identity_id: member.id, mfa_satisfied: true });
    expect(check.orgs).toEqual([{ id: org.id, role: 'admin', permissions: ['invoices:read', 'invoices:write'] }]);

    const security = await gate.settings.getSecurity();
    await gate.settings.updateSecurity({ ...security, mfa_enabled: true });
    try {
      const err = await expectApiError(gate.sessions.check(sessionToken), 403, 'mfa_required');
      expect(err.details).toMatchObject({ required_aal: 'aal2', current_aal: 'aal1' });
    } finally {
      await gate.settings.updateSecurity(security);
    }

    const signed = await gate.tokens.createSigned(sessionToken);
    expect(signed.session.id).toBeTruthy();
    const claims = await gate.tokens.verifySigned(signed.token, { tenantId });
    expect(claims).toMatchObject({ sub: member.id, tenant_id: tenantId, role: 'authenticated', sid: signed.session.id });
    expect(claims.orgs).toEqual([{ id: org.id, role: 'admin', permissions: ['invoices:read', 'invoices:write'] }]);
    expect(claims.iss).toBe(`${BASE_URL}/auth/${tenantId}`);

    // Another tenant id means another issuer: the same token is refused.
    const foreign = new GateTokenVerifier({ tenantId: randomUUID(), baseUrl: BASE_URL });
    await expect(foreign.verify(signed.token)).rejects.toMatchObject({ reason: 'wrong_issuer' });

    const sessions = await gate.sessions.list(member.id);
    expect(sessions.map((s) => s.id)).toContain(signed.session.id);

    await gate.sessions.revoke(signed.session.id);
    await gate.sessions.revoke(signed.session.id); // idempotent
    await expectApiError(gate.tokens.createSigned(sessionToken), 401);
    await expectApiError(gate.sessions.check(sessionToken), 401, 'unauthorized');
    await expectApiError(gate.sessions.revoke(randomUUID()), 404, 'not_found');
    await gate.sessions.revokeAll(member.id); // nothing left to revoke: still a success
  });

  it('audit log records the role and membership changes, filtered and paged', async () => {
    const added = await gate.auditLog.list({ action: 'organization.member_added', target_id: member.id });
    expect(added.data).toHaveLength(1);
    expect(added.data[0]).toMatchObject({
      action: 'organization.member_added',
      actor: { type: 'api_key' },
      target: { type: 'identity', id: member.id },
    });

    const since = new Date(Date.now() - 3600_000);
    const first = await gate.auditLog.list({ limit: 1, from: since });
    expect(first.data).toHaveLength(1);
    expect(first.has_more).toBe(true);
    const second = await gate.auditLog.list({ limit: 1, cursor: first.next_cursor!, from: since });
    expect(second.data[0].id).not.toBe(first.data[0].id);

    await expectApiError(gate.auditLog.list({ action: 'nope' }), 400, 'invalid_payload');
  });

  it('lifecycle: list, set (off), preview, delete, actions; plan_required on Free', async () => {
    const rules = await gate.lifecycle.listRules();
    expect(rules.rules.map((r) => r.kind).sort()).toEqual([
      'delete_inactive',
      'delete_unverified',
      'expire_roles',
      'remind_unverified',
    ]);

    const saved = await gate.lifecycle.setRule('delete_unverified', {
      enabled: false,
      params: { delete_after_days: 14, warn_before_days: 3 },
    });
    cleanup.push(() => gate.lifecycle.deleteRule('delete_unverified'));
    expect(saved).toMatchObject({ kind: 'delete_unverified', configured: true, enabled: false });
    expect(saved.params).toEqual({ delete_after_days: 14, warn_before_days: 3 });

    const preview = await gate.lifecycle.previewRule('delete_unverified', {
      delete_after_days: 14,
      warn_before_days: 3,
    });
    expect(preview).toMatchObject({ kind: 'delete_unverified', capped: false });
    expect(typeof preview.matching_now).toBe('number');
    expect((await gate.lifecycle.previewRule('expire_roles', {})).kind).toBe('expire_roles');

    await gate.lifecycle.deleteRule('delete_unverified');
    expect((await gate.lifecycle.listActions({ limit: 5 })).data).toBeInstanceOf(Array);

    if (rules.tier === 'free') {
      await expectApiError(
        gate.lifecycle.setRule('remind_unverified', { enabled: true, params: { remind_after_hours: 24 } }),
        403,
        'plan_required',
      );
    }
    await expectApiError(
      gate.lifecycle.setRule('delete_unverified', { enabled: true, params: { delete_after_days: 1, warn_before_days: 1 } }),
      400,
      'invalid_payload',
    );
  });

  it('return URLs round-trip and drive the login flow', async () => {
    const before = await gate.settings.getReturnUrls();
    try {
      const urls = await gate.settings.updateReturnUrls(['http://localhost:3000/auth/callback']);
      expect(urls).toEqual(['http://localhost:3000/auth/callback']);
      const flow = await gate.createLoginFlow({
        return_to: 'http://localhost:3000/auth/callback',
        state: 'sdk-integration-1',
      });
      expect(flow.id).toBeTruthy();
      await expectApiError(gate.createLoginFlow({ return_to: 'https://elsewhere.example/cb' }), 400);
    } finally {
      await gate.settings.updateReturnUrls(before);
    }
    await expectApiError(gate.exchangeOidcCode('gxc_not_a_code'), 404);
  });

  it('removing a member, a role and the organization', async () => {
    await gate.organizations.members.remove(org.id, member.id);
    expect((await gate.organizations.can(org.id, member.id, 'invoices:read'))).toBe(false);
    await gate.organizations.roles.delete(org.id, admin.id);
    await gate.organizations.roles.delete(org.id, viewer.id);
    await gate.organizations.delete(org.id);
    await expectApiError(gate.organizations.get(org.id), 404, 'not_found');
  });
});

suite('Clockwork 1.4.0 against a live stack', () => {
  const clockwork = new Clockwork({ apiKey: API_KEY, baseUrl: BASE_URL });

  it('usage() reports the plan and its limits', async () => {
    const usage = await clockwork.usage();
    expect(typeof usage.plan).toBe('string');
    expect(typeof usage.cron.active).toBe('number');
    expect(typeof usage.delayed.pending).toBe('number');
  });

  it('an engine error is the standard envelope, with a request id', async () => {
    const err = await expectApiError(
      clockwork.jobs.create({ name: 'sdk-bad', schedule: 'not a schedule', url: 'https://example.com' }),
      400,
      'invalid_payload',
    );
    expect(err.message).toMatch(/cron/i);
    expect(err.requestId).toMatch(/^req_/);
  });
});
