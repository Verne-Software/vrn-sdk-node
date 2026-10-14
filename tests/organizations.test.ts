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

const org = { id: ORG, name: 'Acme', created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z' };
const role = {
  id: ROLE,
  organization_id: ORG,
  name: 'admin',
  permissions: ['invoices:read', 'invoices:write'],
  created_at: '2026-10-14T09:01:00Z',
  updated_at: '2026-10-14T09:01:00Z',
};
const member = {
  organization_id: ORG,
  identity_id: USER,
  role_id: ROLE,
  expires_at: null,
  created_at: '2026-10-14T09:02:00Z',
  updated_at: '2026-10-14T09:02:00Z',
};
const page = <T>(data: T[]) => ({ data, has_more: false, next_cursor: null });

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

    it('a role still held surfaces as a 409 conflict', async () => {
      mockFetch(409, {
        error: {
          code: 'conflict',
          message: 'This role is held by 1 member and cannot be deleted.',
          request_id: 'req_1',
        },
      });
      const err = await gate.organizations.roles.delete(ORG, ROLE).catch((e) => e);
      expect(err).toBeInstanceOf(VerneAPIError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('conflict');
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

    it('list() and remove()', async () => {
      const spy = mockFetch(200, page([member]));
      const result = await gate.organizations.members.list(ORG);
      expect(result.data[0].expires_at).toBeNull();
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
