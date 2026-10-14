# Verne Software Node.js SDK

[![npm version](https://img.shields.io/npm/v/@verne-software/sdk.svg)](https://npmjs.org/package/@verne-software/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)

The official Node.js and TypeScript library for the [Verne Nautilus](https://vernesoft.com) platform.

> **Server-side only.** API keys carry full access to the APIs they were created for and must never be used in browser or client-side code.

## Requirements

Node.js 18 or later.

## Installation

```bash
npm install @verne-software/sdk
# or
yarn add @verne-software/sdk
# or
pnpm add @verne-software/sdk
```

## Quick Start

```ts
import { Verne } from '@verne-software/sdk';

const verne = new Verne({ apiKey: process.env.VERNE_API_KEY });

await verne.relay.messages.send({ event_type: 'user.created', payload: { id: 'usr_123' } });
await verne.gate.organizations.create({ name: 'Acme' });
```

### API keys

Create a key on **Dashboard → Keys** and tick the APIs it may call — its **scopes**: `relay`, `gate`, `clockwork`, `passepartout`. A key looks like `vrn_9f8a7…` and does not name an API. Pass it once as `apiKey`; the client sends it as `Authorization: Bearer …` to every service.

- A call to an API the key has no scope for is refused by the API with `403`, code `forbidden`, message `This API key is not authorized for <API>.` The SDK does not check scopes itself.
- To use a different key for one service, pass it as `relay`, `gate`, `clockwork` or `passepartout`; it overrides `apiKey` for that service only.
- There is **no test or live mode and no sandbox**: every key acts on your real data. Use a separate key per environment.
- Keys made before scopes existed (`vrn_gate_…`, `vrn_relay_…`, …) keep working, for the one API they name.

You can also instantiate one service on its own:

```ts
import { Gate, Clockwork } from '@verne-software/sdk';

const gate = new Gate({ apiKey: process.env.VERNE_API_KEY });
const clockwork = new Clockwork({ apiKey: process.env.VERNE_API_KEY });
```

## Relay — Webhooks-as-a-Service

Send events to all subscribed endpoints:

```ts
await verne.relay.messages.send({
  event_type: 'user.created',
  payload: { id: 'usr_123' },
});
```

Optional parameters:

```ts
await verne.relay.messages.send({
  event_type: 'order.placed',
  payload: { order_id: '999' },
  idempotency_key: 'evt_abc', // a repeat within 12 hours returns the original message
  channels: ['team-a'],       // restrict to specific endpoint channels
});
```

List previously sent events:

```ts
const page = await verne.relay.messages.list({ limit: 20, event_type: 'user.created' });

console.log(page.data);        // Message[]
console.log(page.has_more);    // boolean
console.log(page.next_cursor); // pass to the next call to paginate
```

## Gate — sign-in and users

### Identities

Manage your end users. They are kept apart per tenant: the same address at another tenant is a different person.

```ts
// Create a user (traits are `email` and, optionally, `locale`)
const identity = await verne.gate.identities.create({
  schema_id: 'user',
  traits: { email: 'user@example.com' },
  credentials: {
    password: { config: { password: 'StrongPassword123!' } },
  },
});
// A second user with the same address in your account is a 409 `conflict`.

// Get, update (JSON Patch — RFC 6902), delete
await verne.gate.identities.get(identity.id);
await verne.gate.identities.patch(identity.id, [
  { op: 'replace', path: '/traits/email', value: 'new@example.com' },
]);
await verne.gate.identities.delete(identity.id);

// Activate / deactivate (an inactive user cannot sign in; nothing is deleted)
await verne.gate.identities.deactivate(identity.id);
await verne.gate.identities.activate(identity.id);

// Resend the email verification link
await verne.gate.identities.resendVerification(identity.id);
```

Your own fields about a user go in **custom metadata**, not in traits:

```ts
await verne.gate.identities.updateMetadata(identity.id, { plan: 'pro', seats: 5 }); // merged
await verne.gate.identities.updateMetadata(identity.id, { seats: null });           // removes `seats`
const metadata = await verne.gate.identities.getMetadata(identity.id);              // { plan: 'pro' }
```

### Organizations, roles and members

Group your end users into organizations (their teams, workspaces, companies). A **role** is a named set of permissions inside one organization; a **member** holds one role. Everything acts on the project the key belongs to. Gate keeps this data and reports it; it does not enforce it — ask it.

```ts
const org = await verne.gate.organizations.create({ name: 'Acme' });

const admin = await verne.gate.organizations.roles.create(org.id, {
  name: 'admin',                                     // lowercase, digits, _ and -
  permissions: ['invoices:read', 'invoices:write'], // lowercase segments joined by `:`
});

await verne.gate.organizations.members.add(org.id, {
  identity_id: identity.id,
  role_id: admin.id,
  expires_at: '2027-01-31T23:59:59Z', // optional: the membership ends then
});

// Change the role or the deadline: leave expires_at out to keep it, null to remove it
await verne.gate.organizations.members.update(org.id, identity.id, { expires_at: null });

// Lists are cursor-paged: loop while has_more, passing next_cursor as cursor
const { data, has_more, next_cursor } = await verne.gate.organizations.members.list(org.id, { limit: 50 });

// A user's organizations, with role and permissions in each
const held = await verne.gate.identities.listOrganizations(identity.id);
```

A role somebody holds cannot be deleted (`409 conflict`); a second role of the same name in one organization is `409 conflict`; past 100 roles, `409 limit_reached`.

#### Checking a permission

```ts
if (!(await verne.gate.organizations.can(org.id, identity.id, 'invoices:write'))) {
  throw new Error('Forbidden');
}

// Or the full decision:
const decision = await verne.gate.organizations.authorize(org.id, identity.id, 'invoices:write');
// { allowed: true, decision_id: 'dec_…', reason: 'member_with_permission', role: 'admin' }
```

`reason` is one of `member_with_permission`, `member_without_permission`, `not_a_member`, `subject_inactive`, `no_such_organization`; `role` is present when the user is a member. The match is exact (no wildcards) and live. A permission no role could hold (`Invoices:*`, the `nautilus:` prefix) is a `400 invalid_payload` error, never `false`.

`gate.authorize({ subject, action, resource })` is the same endpoint; with any resource that is not `organization:<id>` it only says whether `subject` is one of your active end users. Its `reason` is a code too: `owned_by_tenant` (the one `allowed: true`), `subject_inactive`, `not_owned_by_tenant`, `not_a_known_identity`. The sentence a person would read is in `message`, for your logs — its wording can change, `reason` is the contract.

```ts
const decision = await verne.gate.authorize({ subject: identity.id, action: 'read', resource: 'doc:1' });
// { allowed: true, decision_id: 'dec_…', reason: 'owned_by_tenant', message: 'subject `…` is an identity owned by tenant `…`' }
```

### Sessions

```ts
// Is this session good enough to act on? (the one call to gate your routes on)
const check = await verne.gate.sessions.check(sessionToken);
// { active, aal, mfa_required, mfa_satisfied, identity_id, orgs: [{ id, role, permissions }] }

const sessions = await verne.gate.sessions.list(identity.id);
await verne.gate.sessions.revoke(sessions[0].id); // one device
await verne.gate.sessions.revokeAll(identity.id); // everywhere
```

`revokeAll()` succeeds also when the user has no session, so a "log out everywhere" button can be pressed twice. An id that is not one of your users (another account's, unknown, or one you deleted) is `403 forbidden`.

With MFA required (`settings.updateSecurity({ passwordless_enabled, mfa_enabled: true })`), `check()` throws a `VerneAPIError` with code `mfa_required` and `details.required_aal === 'aal2'`; start a step-up flow with `gate.createLoginFlow({ aal: 'aal2', session_token: sessionToken })`. A dead, foreign or unknown session is `401`.

### Signed tokens (JWT)

For a platform that verifies signatures instead of calling Gate (Supabase, an API gateway):

```ts
const { token } = await verne.gate.tokens.createSigned(sessionToken); // no API key involved

const claims = await verne.gate.tokens.verifySigned(token, { tenantId: process.env.VERNE_TENANT_ID! });
claims.sub;  // the end user's id
claims.orgs; // [{ id, role, permissions }], as of when the token was made
```

Verification is offline, against your tenant's public keys (fetched once, cached, refetched when a new key appears). It refuses anything but ES256, another tenant's issuer, a bad signature, an expired token — with a `VerneTokenError` whose `reason` says which. To verify where you have no Gate client:

```ts
import { GateTokenVerifier } from '@verne-software/sdk';

const verifier = new GateTokenVerifier({ tenantId: process.env.VERNE_TENANT_ID! });
const claims = await verifier.verify(token);
```

A signed token lives **15 minutes** and **cannot be revoked**; its `orgs` are as old as the token. For anything that must follow a revocation or a role change at once, use `sessions.check()`, introspection or `organizations.can()`.

### Audit log

```ts
const page = await verne.gate.auditLog.list({
  action: 'organization.member_added',
  from: new Date(Date.now() - 7 * 24 * 3600 * 1000),
  limit: 50,
});
// newest first; page.data[i] = { id, occurred_at, action, actor, target, project_id, details, ip, user_agent }
```

Any key with the `gate` scope reads the **whole** log, including your team members' IP addresses and user agents. Keep `gate` keys on your backend.

### Automatic deletion of inactive accounts

```ts
const { tier, rules } = await verne.gate.lifecycle.listRules();

const preview = await verne.gate.lifecycle.previewRule('delete_unverified', {
  delete_after_days: 14,
  warn_before_days: 3,
}); // { matching_now, capped, … } — look before you switch it on

await verne.gate.lifecycle.setRule('delete_unverified', {
  enabled: true,
  params: { delete_after_days: 14, warn_before_days: 3 },
});

const actions = await verne.gate.lifecycle.listActions({ status: 'pending' });
await verne.gate.lifecycle.deleteRule('delete_unverified');
```

Only `delete_unverified` is in the Free plan; switching on another rule is `403 plan_required`.

### Settings

```ts
const security = await verne.gate.settings.getSecurity();
// Both fields are required — the update is a full replacement, not a merge.
await verne.gate.settings.updateSecurity({ passwordless_enabled: true, mfa_enabled: false });

// Social login: where your backend receives the user (matched exactly)
await verne.gate.settings.updateReturnUrls(['https://app.example.com/auth/callback']);
const flow = await verne.gate.createLoginFlow({ state: csrfBoundValue }); // then, at your callback:
const { session_token } = await verne.gate.exchangeOidcCode(code);
```

### Access tokens

Short-lived opaque tokens for a user or a service account:

```ts
const token = await verne.gate.tokens.create({
  subject: 'usr_123',
  scopes: ['gate.tokens.read'], // optional
  ttl_seconds: 3600,            // optional, default 3600, max 86400
});

const info = await verne.gate.tokens.introspect(token.access_token);
if (!info.active) {
  // expired, unknown, or its user is deactivated or deleted — `info` is just { active: false }
}
// For an end user, info.orgs lists their organizations, read now.
```

## Passepartout — Telegram sign-in

```ts
const { nonce, deep_link } = await verne.passepartout.loginStart();
// send the user to deep_link, then poll:
const status = await verne.passepartout.loginStatus(nonce);
if (status.status === 'completed') {
  const info = await verne.passepartout.introspect(status.access_token!);
  info.orgs; // the user's organizations in your project
}
```

## Clockwork — Cron-as-a-Service

Schedule recurring and one-shot HTTP jobs.

### Cron Jobs

```ts
// Create a recurring job
const job = await verne.clockwork.jobs.create({
  name: 'nightly-report',
  schedule: '0 2 * * *', // cron expression
  url: 'https://example.com/hooks/report',
  method: 'POST',                       // optional, defaults to POST
  headers: { 'X-Api-Key': 'secret' },   // optional
  body: JSON.stringify({ scope: 'all' }), // optional
});

// List all cron jobs (returns CronJob[])
const jobs = await verne.clockwork.jobs.list();

// Update a job (partial — only the fields you pass are changed)
await verne.clockwork.jobs.update(job.id, { schedule: '0 3 * * *', is_active: false });

// Inspect the execution history (returns Execution[], one row per attempt)
const runs = await verne.clockwork.jobs.executions(job.id);

// Delete a job
await verne.clockwork.jobs.delete(job.id);
```

### Delayed Jobs

One-shot jobs that fire once at a specific time:

```ts
const delayed = await verne.clockwork.delayed.create({
  name: 'send-reminder',
  run_at: '2026-01-01T09:00:00Z', // ISO 8601 timestamp
  url: 'https://example.com/hooks/reminder',
});

const pending = await verne.clockwork.delayed.list();
const runs = await verne.clockwork.delayed.executions(delayed.id);
await verne.clockwork.delayed.cancel(delayed.id);
```

### Usage

```ts
const usage = await verne.clockwork.usage();
// { plan: 'free', cron: { active: 3, limit: 10 }, delayed: { pending: 12, limit: 100 } }
```

## Error Handling

API errors throw a `VerneAPIError`:

```ts
import { VerneAPIError } from '@verne-software/sdk';

try {
  await verne.gate.organizations.members.add(orgId, { identity_id, role_id });
} catch (err) {
  if (err instanceof VerneAPIError) {
    err.status;     // HTTP status
    err.code;       // e.g. 'conflict' — branch on status + code
    err.message;    // a sentence to show a person
    err.details;    // extra members of the error, e.g. { plan, limit, current }
    err.retryAfter; // seconds, when the response had Retry-After
    err.requestId;  // include in support requests
  }
}
```

| Status | `code` | Meaning |
|:--|:--|:--|
| 400 | `invalid_payload` | Something in the request is malformed; `message` says what. |
| 401 | `unauthorized` | No key, or a revoked or invalid one; for a session, a dead session. |
| 402 | `ACTIVE_USER_LIMIT_REACHED`, `UPGRADE_REQUIRED`, `JOB_LIMIT_REACHED`, `BILLING_HARD_BLOCKED`, `SUBSCRIPTION_PAST_DUE` | A plan or billing limit. Does not lift by waiting — the SDK never retries it. |
| 403 | `forbidden` | The key lacks the scope for this API (`message` names it), or the resource is not yours. |
| 403 | `plan_required`, `mfa_required`, `account_disabled` | A rule not in your plan; a second factor owed; a deactivated Telegram user. |
| 404 | `not_found` | No such thing in your project. |
| 409 | `conflict`, `limit_reached` | It already exists **in your account** (an end user with that address, a role name, a membership), a role still held, or a cap reached. |
| 429 | `rate_limited`, `RELAY_MESSAGE_LIMIT_REACHED` | Too fast, or Relay's monthly limit. |
| 5xx | `upstream_unavailable`, `internal_error` | Retry; quote `requestId` to support. |

Codes are an open set; treat unknown ones generically. Every API route, Clockwork's included, answers in this envelope with a string `code` and a `requestId`. A body in another shape (one that did not come from the API — a proxy in between, an identity-service answer passed through on `/auth/*`) still becomes a `VerneAPIError`, with `code: 'unknown'` and whatever sentence it had in `message`.

**Retries.** A `POST` that gets a short `429` (a `Retry-After` of a minute or less) is retried once after waiting. Relay's monthly limit (`429 RELAY_MESSAGE_LIMIT_REACHED`, `Retry-After` until the 1st) and every `402` are thrown at once.

Network failures and timeouts throw a base `VerneError`; a refused signed token throws `VerneTokenError`.

## Configuration

`Verne` and the per-service clients accept `baseUrl` and `timeoutMs` (default `30000`):

```ts
const verne = new Verne({ apiKey: process.env.VERNE_API_KEY, timeoutMs: 10_000 });
```

Individual requests can be cancelled with an `AbortSignal`:

```ts
const controller = new AbortController();

await verne.relay.messages.send(
  { event_type: 'ping', payload: {} },
  { signal: controller.signal },
);
```

## Development

```bash
npm test             # unit tests (no network)
npm run lint
npm run typecheck
npm run build
```

### Integration tests

`npm run test:integration` runs every resource against a real Nautilus stack. It is opt-in and skipped without a key; it creates end users, an organization and settings changes, and removes them again.

| Variable | |
|:--|:--|
| `VERNE_API_KEY` | A key with the scopes `gate`, `clockwork`, `passepartout`. Required. |
| `VERNE_BASE_URL` | Default `http://api.soft.com` (the local stack). Any other host needs `VERNE_ALLOW_REMOTE=1`. |
| `VERNE_EMAIL_PREFIX` | Every end user created is `<prefix>-<name>@e2e.soft.com`. |
| `VERNE_NARROW_KEY` | Optional: a key **without** the `gate` scope, to check the `403`. |

Against a local stack, `scripts/local-stack-key.mjs` registers a throwaway `e2e-` tenant and mints the keys:

```bash
node scripts/local-stack-key.mjs create /tmp/sdk-it.json
eval "$(node scripts/local-stack-key.mjs env /tmp/sdk-it.json)"
npm run test:integration
node scripts/local-stack-key.mjs revoke /tmp/sdk-it.json   # then purge the tenant it names
```

## License

[MIT](LICENSE)
