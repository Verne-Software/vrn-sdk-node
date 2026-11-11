import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gate, VerneAPIError } from '../src/index.js';

const API_KEY = 'vrn_9f8a7c1b2d3e4f50';
const BASE = 'https://api.vernesoft.com';
const ORG = '3b2f6f0e-8f0c-4a54-9f1d-0c7a5d1e2b10';
const ROLE = '5d0e9b4a-1c2f-4e6a-8d3b-7a9c2e4f6b81';
const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function mockFetch(status: number, body: unknown) {
  // One spy per test: a second `vi.spyOn` would start a new call log.
  const spy = vi.isMockFunction(global.fetch) ? vi.mocked(global.fetch) : vi.spyOn(global, 'fetch');
  return spy.mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? {} : { 'Content-Type': 'application/json' },
    }),
  );
}

function call(spy: ReturnType<typeof mockFetch>, n = 0) {
  const [url, init] = spy.mock.calls[n];
  return {
    url: String(url),
    method: init?.method,
    body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    headers: init?.headers as Record<string, string>,
  };
}

const org = {
  id: ORG,
  name: 'Acme',
  member_count: 12,
  created_at: '2026-10-14T09:00:00Z',
  updated_at: '2026-10-14T09:00:00Z',
};
const role = {
  id: ROLE,
  organization_id: ORG,
  name: 'admin',
  permissions: ['invoices:read', 'invoices:write'],
  member_count: 3,
  created_at: '2026-10-14T09:01:00Z',
  updated_at: '2026-10-14T09:01:00Z',
};
const member = {
  organization_id: ORG,
  identity_id: USER,
  role_id: ROLE,
  email: 'alice@example.com',
  display_name: 'Alice',
  expires_at: null,
  created_at: '2026-10-14T09:02:00Z',
  updated_at: '2026-10-14T09:02:00Z',
};
const page = <T>(data: T[]) => ({ data, has_more: false, next_cursor: null });
const counted = <T>(data: T[], total: number) => ({ ...page(data), total });

describe('gate.organizations', () => {
  let gate: Gate;

  beforeEach(() => {
    gate = new Gate({ apiKey: API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create() sends POST /v1/gate/organizations with the name', async () => {
    const spy = mockFetch(201, org);
    expect(await gate.organizations.create({ name: 'Acme' })).toEqual(org);
    const c = call(spy);
    expect(c.url).toBe(`${BASE}/v1/gate/organizations`);
    expect(c.method).toBe('POST');
    expect(c.body).toEqual({ name: 'Acme' });
    expect(c.headers['Authorization']).toBe(`Bearer ${API_KEY}`);
  });

  it('list() pages with limit and cursor, and drops what is unset', async () => {
    const spy = mockFetch(200, page([org]));
    await gate.organizations.list({ limit: 50, cursor: 'abc' });
    expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations?limit=50&cursor=abc`);

    const spy2 = mockFetch(200, page([]));
    const result = await gate.organizations.list();
    expect(call(spy2, 1).url).toBe(`${BASE}/v1/gate/organizations`);
    expect(result.has_more).toBe(false);
  });

  it('list() carries total, and each organization its member_count', async () => {
    mockFetch(200, { data: [org], has_more: true, next_cursor: 'c2', total: 37 });
    const result = await gate.organizations.list({ limit: 1 });
    expect(result.total).toBe(37);
    expect(result.next_cursor).toBe('c2');
    expect(result.data[0].member_count).toBe(12);

    mockFetch(200, org);
    expect((await gate.organizations.get(ORG)).member_count).toBe(12);
  });

  it('a missing organization is 404 not_found with reason organization', async () => {
    mockFetch(404, {
      error: {
        code: 'not_found',
        message: 'Organization not found.',
        request_id: 'req_1',
        reason: 'organization',
      },
    });
    const err = await gate.organizations.get(ORG).catch((e) => e);
    expect(err).toBeInstanceOf(VerneAPIError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
    expect(err.reason).toBe('organization');
  });

  it('get(), update() and delete() address one organization', async () => {
    const spy = mockFetch(200, org);
    await gate.organizations.get(ORG);
    expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations/${ORG}`);

    mockFetch(200, { ...org, name: 'Acme 2' });
    await gate.organizations.update(ORG, { name: 'Acme 2' });
    expect(call(spy, 1).method).toBe('PATCH');
    expect(call(spy, 1).body).toEqual({ name: 'Acme 2' });

    mockFetch(204, null);
    await expect(gate.organizations.delete(ORG)).resolves.toBeUndefined();
    expect(call(spy, 2).method).toBe('DELETE');
  });

  it('URL-encodes ids so a caller value cannot reshape the path', async () => {
    const spy = mockFetch(200, org);
    await gate.organizations.get('../identities');
    expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations/..%2Fidentities`);
  });

  describe('roles', () => {
    it('create() sends name and permissions', async () => {
      const spy = mockFetch(201, role);
      await gate.organizations.roles.create(ORG, {
        name: 'admin',
        permissions: ['invoices:read', 'invoices:write'],
      });
      const c = call(spy);
      expect(c.url).toBe(`${BASE}/v1/gate/organizations/${ORG}/roles`);
      expect(c.method).toBe('POST');
      expect(c.body).toEqual({ name: 'admin', permissions: ['invoices:read', 'invoices:write'] });
    });

    it('list(), get(), update(), delete()', async () => {
      const spy = mockFetch(200, page([role]));
      await gate.organizations.roles.list(ORG, { limit: 10 });
      expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations/${ORG}/roles?limit=10`);

      mockFetch(200, role);
      await gate.organizations.roles.get(ORG, ROLE);
      expect(call(spy, 1).url).toBe(`${BASE}/v1/gate/organizations/${ORG}/roles/${ROLE}`);

      mockFetch(200, role);
      await gate.organizations.roles.update(ORG, ROLE, { permissions: ['invoices:read'] });
      expect(call(spy, 2).method).toBe('PATCH');
      expect(call(spy, 2).body).toEqual({ permissions: ['invoices:read'] });

      mockFetch(204, null);
      await gate.organizations.roles.delete(ORG, ROLE);
      expect(call(spy, 3).method).toBe('DELETE');
    });

    it('list() carries total; a role carries member_count', async () => {
      mockFetch(200, counted([role], 2));
      const result = await gate.organizations.roles.list(ORG);
      expect(result.total).toBe(2);
      expect(result.data[0].member_count).toBe(3);
    });

    it('a role still held surfaces as 409 conflict with reason role_held', async () => {
      mockFetch(409, {
        error: {
          code: 'conflict',
          message: 'This role is held by 1 member and cannot be deleted.',
          request_id: 'req_1',
          reason: 'role_held',
        },
      });
      const err = await gate.organizations.roles.delete(ORG, ROLE).catch((e) => e);
      expect(err).toBeInstanceOf(VerneAPIError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('conflict');
      expect(err.reason).toBe('role_held');
      // Kept where 1.5 put it, so code reading details.reason still works.
      expect(err.details.reason).toBe('role_held');
    });

    it('a taken role name is 409 conflict with reason role_name_taken', async () => {
      mockFetch(409, {
        error: {
          code: 'conflict',
          message: 'This organization already has a role with that name.',
          request_id: 'req_1',
          reason: 'role_name_taken',
        },
      });
      const err = await gate.organizations.roles.create(ORG, { name: 'admin' }).catch((e) => e);
      expect(err.code).toBe('conflict');
      expect(err.reason).toBe('role_name_taken');
    });

    it('a role limit hit is 409 limit_reached with no reason', async () => {
      mockFetch(409, {
        error: { code: 'limit_reached', message: 'An organization has at most 100 roles.', request_id: 'r' },
      });
      const err = await gate.organizations.roles.create(ORG, { name: 'r101' }).catch((e) => e);
      expect(err.code).toBe('limit_reached');
      expect(err.reason).toBeUndefined();
    });
  });

  describe('members', () => {
    it('add() sends identity and role, and expires_at only when given', async () => {
      const spy = mockFetch(201, member);
      await gate.organizations.members.add(ORG, { identity_id: USER, role_id: ROLE });
      expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations/${ORG}/members`);
      expect(call(spy).body).toEqual({ identity_id: USER, role_id: ROLE });

      mockFetch(201, member);
      await gate.organizations.members.add(ORG, {
        identity_id: USER,
        role_id: ROLE,
        expires_at: new Date('2027-01-31T23:59:59Z'),
      });
      expect(call(spy, 1).body.expires_at).toBe('2027-01-31T23:59:59.000Z');
    });

    it('update() tells absent, null and a time apart for expires_at', async () => {
      const spy = mockFetch(200, member);
      await gate.organizations.members.update(ORG, USER, { role_id: ROLE });
      expect(call(spy).body).toEqual({ role_id: ROLE });
      expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations/${ORG}/members/${USER}`);
      expect(call(spy).method).toBe('PATCH');

      mockFetch(200, member);
      await gate.organizations.members.update(ORG, USER, { expires_at: null });
      expect(call(spy, 1).body).toEqual({ expires_at: null });

      mockFetch(200, member);
      await gate.organizations.members.update(ORG, USER, { expires_at: '2027-03-31T23:59:59Z' });
      expect(call(spy, 2).body).toEqual({ expires_at: '2027-03-31T23:59:59Z' });
    });

    it('every member answer carries email and display_name, null when the person has none', async () => {
      mockFetch(201, member);
      const added = await gate.organizations.members.add(ORG, { identity_id: USER, role_id: ROLE });
      expect(added.email).toBe('alice@example.com');
      expect(added.display_name).toBe('Alice');

      // A Telegram user: no address, the first name they signed in with.
      mockFetch(200, { ...member, email: null, display_name: 'Jules' });
      const updated = await gate.organizations.members.update(ORG, USER, { role_id: ROLE });
      expect(updated.email).toBeNull();
      expect(updated.display_name).toBe('Jules');
    });

    it('add() refusals carry their reason: end_user, already_member', async () => {
      mockFetch(404, {
        error: { code: 'not_found', message: 'End user not found.', request_id: 'r', reason: 'end_user' },
      });
      const missing = await gate.organizations.members
        .add(ORG, { identity_id: USER, role_id: ROLE })
        .catch((e) => e);
      expect([missing.status, missing.code, missing.reason]).toEqual([404, 'not_found', 'end_user']);

      mockFetch(409, {
        error: { code: 'conflict', message: 'Already a member.', request_id: 'r', reason: 'already_member' },
      });
      const twice = await gate.organizations.members
        .add(ORG, { identity_id: USER, role_id: ROLE })
        .catch((e) => e);
      expect([twice.status, twice.code, twice.reason]).toEqual([409, 'conflict', 'already_member']);
    });

    it('list() and remove()', async () => {
      const spy = mockFetch(200, counted([member], 1));
      const result = await gate.organizations.members.list(ORG);
      expect(result.data[0].expires_at).toBeNull();
      expect(result.data[0].email).toBe('alice@example.com');
      expect(result.total).toBe(1);
      expect(call(spy).url).toBe(`${BASE}/v1/gate/organizations/${ORG}/members`);

      mockFetch(204, null);
      await gate.organizations.members.remove(ORG, USER);
      expect(call(spy, 1).method).toBe('DELETE');
      expect(call(spy, 1).url).toBe(`${BASE}/v1/gate/organizations/${ORG}/members/${USER}`);
    });
  });

  describe('authorize() and can()', () => {
    it('authorize() builds the organization resource and returns the decision with role', async () => {
      const decision = {
        allowed: true,
        decision_id: 'dec_1',
        reason: 'member_with_permission',
        role: 'admin',
      };
      const spy = mockFetch(200, decision);
      const result = await gate.organizations.authorize(ORG, USER, 'invoices:write');
      expect(result).toEqual(decision);
      const c = call(spy);
      expect(c.url).toBe(`${BASE}/v1/gate/authorize`);
      expect(c.body).toEqual({
        subject: USER,
        action: 'invoices:write',
        resource: `organization:${ORG}`,
      });
    });

    it('can() is the boolean of the decision', async () => {
      mockFetch(200, { allowed: true, decision_id: 'd', reason: 'member_with_permission', role: 'admin' });
      expect(await gate.organizations.can(ORG, USER, 'invoices:write')).toBe(true);

      mockFetch(200, { allowed: false, decision_id: 'd', reason: 'not_a_member' });
      expect(await gate.organizations.can(ORG, USER, 'invoices:write')).toBe(false);
    });

    it('can() throws on an invalid permission instead of answering false', async () => {
      mockFetch(400, {
        error: {
          code: 'invalid_payload',
          message: 'Invalid permission `Invoices:*`: `*` is reserved and cannot be used in a permission.',
          request_id: 'req_1',
        },
      });
      await expect(gate.organizations.can(ORG, USER, 'Invoices:*')).rejects.toMatchObject({
        status: 400,
        code: 'invalid_payload',
      });
    });
  });

  it('identities.listOrganizations() reads the user\'s organizations, paged', async () => {
    const claims = page([{ id: ORG, role: 'admin', permissions: ['invoices:read'] }]);
    const spy = mockFetch(200, claims);
    const result = await gate.identities.listOrganizations(USER, { limit: 50 });
    expect(result).toEqual(claims);
    expect(call(spy).url).toBe(`${BASE}/v1/gate/identities/${USER}/organizations?limit=50`);
  });
});
