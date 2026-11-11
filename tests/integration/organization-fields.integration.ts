/**
 * Integration suite for 1.6.0: what the organization routes say since Nautilus v1.10.44 —
 * `member_count` on organizations and roles, `email` and `display_name` on members,
 * `total` on the three lists, `reason` on their 404s and 409s, and the audit entries for
 * creating and renaming an organization. Same environment as `gate.integration.ts`
 * (VERNE_API_KEY with the gate scope, VERNE_BASE_URL, VERNE_EMAIL_PREFIX); everything it
 * creates is deleted again.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Verne, VerneAPIError } from '../../src/index.js';
import type { Identity, Organization, Role } from '../../src/index.js';

const KEY = process.env.VERNE_API_KEY;
const BASE_URL = (process.env.VERNE_BASE_URL ?? 'http://api.soft.com').replace(/\/+$/, '');
const PREFIX = process.env.VERNE_EMAIL_PREFIX ?? `e2e-sdk-${Date.now().toString(36)}`;

const host = new URL(BASE_URL).hostname;
if (KEY && !['api.soft.com', 'localhost', '127.0.0.1'].includes(host) && process.env.VERNE_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the integration suite against ${host}; set VERNE_ALLOW_REMOTE=1 to insist.`);
}

const suite = KEY ? describe.sequential : describe.skip;
const API_KEY = KEY ?? 'vrn_unset';
const email = (n: string) => `${PREFIX}-${n}@e2e.soft.com`;

async function refusal(promise: Promise<unknown>): Promise<VerneAPIError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err, 'expected the API to refuse').toBeInstanceOf(VerneAPIError);
  return err as VerneAPIError;
}

suite('1.6.0 organization fields against a live stack', () => {
  const gate = new Verne({ apiKey: API_KEY, baseUrl: BASE_URL }).gate;
  const cleanup: Array<() => Promise<unknown>> = [];

  let alice: Identity;
  let bob: Identity;
  let org: Organization;
  let admin: Role;
  let viewer: Role;

  beforeAll(async () => {
    alice = await gate.identities.create({ schema_id: 'user', traits: { email: email('alice') } });
    cleanup.push(() => gate.identities.delete(alice.id));
    bob = await gate.identities.create({ schema_id: 'user', traits: { email: email('bob') } });
    cleanup.push(() => gate.identities.delete(bob.id));
  });

  afterAll(async () => {
    for (const step of cleanup.reverse()) await step().catch(() => undefined);
  });

  it('a new organization and its roles count nobody; the lists carry total', async () => {
    const before = (await gate.organizations.list({ limit: 1 })).total;
    org = await gate.organizations.create({ name: `${PREFIX} Acme` });
    cleanup.push(() => gate.organizations.delete(org.id));
    expect(org.member_count).toBe(0);

    const after = await gate.organizations.list({ limit: 1 });
    expect(after.total).toBe(before + 1);
    expect(after.data).toHaveLength(1);

    admin = await gate.organizations.roles.create(org.id, { name: 'admin', permissions: ['invoices:write'] });
    viewer = await gate.organizations.roles.create(org.id, { name: 'viewer' });
    expect(admin.member_count).toBe(0);

    const roles = await gate.organizations.roles.list(org.id, { limit: 1 });
    expect(roles.data).toHaveLength(1);
    expect(roles.total).toBe(2);
  });

  it('a member answer carries the person\'s email and display_name', async () => {
    const added = await gate.organizations.members.add(org.id, { identity_id: alice.id, role_id: admin.id });
    expect(added.email).toBe(email('alice'));
    // The `user` schema has no name trait: an API-created user has none.
    expect(added.display_name).toBeNull();

    const moved = await gate.organizations.members.update(org.id, alice.id, { role_id: viewer.id });
    expect(moved.email).toBe(email('alice'));
    await gate.organizations.members.update(org.id, alice.id, { role_id: admin.id });

    const members = await gate.organizations.members.list(org.id);
    expect(members.total).toBe(1);
    expect(members.data.map((m) => [m.identity_id, m.email])).toEqual([[alice.id, email('alice')]]);
  });

  it('member_count follows the memberships', async () => {
    expect((await gate.organizations.get(org.id)).member_count).toBe(1);
    expect((await gate.organizations.roles.get(org.id, admin.id)).member_count).toBe(1);
    expect((await gate.organizations.roles.get(org.id, viewer.id)).member_count).toBe(0);
    const listed = (await gate.organizations.list({ limit: 100 })).data.find((o) => o.id === org.id);
    expect(listed?.member_count).toBe(1);
  });

  it('every 409 says why: role_name_taken, already_member, role_held', async () => {
    const taken = await refusal(gate.organizations.roles.create(org.id, { name: 'admin' }));
    expect([taken.status, taken.code, taken.reason]).toEqual([409, 'conflict', 'role_name_taken']);

    const twice = await refusal(
      gate.organizations.members.add(org.id, { identity_id: alice.id, role_id: viewer.id }),
    );
    expect([twice.status, twice.code, twice.reason]).toEqual([409, 'conflict', 'already_member']);

    const held = await refusal(gate.organizations.roles.delete(org.id, admin.id));
    expect([held.status, held.code, held.reason]).toEqual([409, 'conflict', 'role_held']);
  });

  it('every 404 says what: organization, role, member, end_user', async () => {
    const noOrg = await refusal(gate.organizations.get(randomUUID()));
    expect([noOrg.status, noOrg.code, noOrg.reason]).toEqual([404, 'not_found', 'organization']);

    const noRole = await refusal(gate.organizations.roles.get(org.id, randomUUID()));
    expect([noRole.status, noRole.code, noRole.reason]).toEqual([404, 'not_found', 'role']);

    const notMember = await refusal(gate.organizations.members.update(org.id, bob.id, { role_id: viewer.id }));
    expect([notMember.status, notMember.code, notMember.reason]).toEqual([404, 'not_found', 'member']);

    const stranger = await refusal(
      gate.organizations.members.add(org.id, { identity_id: randomUUID(), role_id: viewer.id }),
    );
    expect([stranger.status, stranger.code, stranger.reason]).toEqual([404, 'not_found', 'end_user']);
  });

  it('the audit log records creating and renaming the organization', async () => {
    const renamed = await gate.organizations.update(org.id, { name: `${PREFIX} Acme Corp` });
    expect(renamed.member_count).toBe(1);

    const created = await gate.auditLog.list({ action: 'organization.created', target_id: org.id });
    expect(created.data).toHaveLength(1);
    expect(created.data[0].details).toMatchObject({ name: `${PREFIX} Acme` });

    const updated = await gate.auditLog.list({ action: 'organization.updated', target_id: org.id });
    expect(updated.data).toHaveLength(1);
    expect(updated.data[0].details).toMatchObject({
      previous_name: `${PREFIX} Acme`,
      name: `${PREFIX} Acme Corp`,
    });
  });
});
