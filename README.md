# Verne Software Node.js SDK

[![npm version](https://img.shields.io/npm/v/@verne-software/sdk.svg)](https://npmjs.org/package/@verne-software/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)

The official Node.js and TypeScript library for the [Verne Nautilus](https://vernesoft.com) platform.

> **Server-side only.** API keys carry full service access and must never be used in browser or client-side code.

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

const verne = new Verne({
  relay:     process.env.VERNE_RELAY_KEY,
  gate:      process.env.VERNE_GATE_KEY,
  clockwork: process.env.VERNE_CLOCKWORK_KEY,
});
```

You can also instantiate services independently if you only need one:

```ts
import { Relay, Gate, Clockwork } from '@verne-software/sdk';

const relay     = new Relay({ apiKey: process.env.VERNE_RELAY_KEY });
const gate      = new Gate({ apiKey: process.env.VERNE_GATE_KEY });
const clockwork = new Clockwork({ apiKey: process.env.VERNE_CLOCKWORK_KEY });
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
  idempotency_key: 'evt_abc', // prevent duplicate delivery within 24h
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

## Gate — Auth-as-a-Service

### Identity Management

Manage your end-users. The `tenant_id` is automatically scoped to your API key.

```ts
// Create a user
const identity = await verne.gate.identities.create({
  schema_id: 'user',
  traits: {
    email: 'user@example.com',
    custom_data: { role: 'editor' },
  },
  credentials: {
    password: { config: { password: 'StrongPassword123!' } },
  },
  state: 'active',
});

// Get a user
await verne.gate.identities.get(identity.id);

// Update a user (JSON Patch — RFC 6902)
await verne.gate.identities.patch(identity.id, [
  { op: 'replace', path: '/traits/custom_data/role', value: 'admin' },
]);

// Delete a user
await verne.gate.identities.delete(identity.id);

// Activate / deactivate a user (an inactive user cannot log in)
await verne.gate.identities.deactivate(identity.id);
await verne.gate.identities.activate(identity.id);
// …or set the state explicitly:
await verne.gate.identities.setState(identity.id, 'inactive');

// Resend the email verification link
await verne.gate.identities.resendVerification(identity.id);
```

### Security Settings

Read or replace the tenant's security settings (passwordless login, TOTP MFA):

```ts
const security = await verne.gate.settings.getSecurity();
// security.passwordless_enabled, security.mfa_enabled

// Both fields are required — the update is a full replacement, not a merge.
await verne.gate.settings.updateSecurity({
  passwordless_enabled: true,
  mfa_enabled: false,
});
```

### Access Tokens

Exchange your long-lived API key for a short-lived access token:

```ts
const token = await verne.gate.tokens.create({
  subject: 'usr_123',
  scopes: ['gate.tokens.read'], // optional
  ttl_seconds: 3600,            // optional, default 3600, max 86400
});

// token.access_token — attach to downstream requests
// token.expires_at   — ISO 8601 expiry
```

Validate a token:

```ts
const info = await verne.gate.tokens.introspect(token.access_token);

if (!info.active) {
  // token is expired or invalid
}
```

### Authorization

Check whether a subject is allowed to perform an action:

```ts
const decision = await verne.gate.authorize({
  subject: 'usr_123',
  action: 'relay.messages.read',
  resource: 'tenant:ten_001',
});

if (!decision.allowed) {
  throw new Error('Forbidden');
}
```

## Clockwork — Cron-as-a-Service

Schedule recurring and one-shot HTTP jobs. The `tenant_id` is automatically scoped to your API key.

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

// Inspect the execution history (returns Execution[])
const runs = await verne.clockwork.jobs.executions(job.id);

// Delete a job
await verne.clockwork.jobs.delete(job.id);
```

### Delayed Jobs

One-shot jobs that fire once at a specific time:

```ts
// Schedule a delayed job
const delayed = await verne.clockwork.delayed.create({
  name: 'send-reminder',
  run_at: '2026-01-01T09:00:00Z', // ISO 8601 timestamp
  url: 'https://example.com/hooks/reminder',
});

// List all delayed jobs (returns DelayedJob[])
const pending = await verne.clockwork.delayed.list();

// Inspect the execution history (returns Execution[])
const runs = await verne.clockwork.delayed.executions(delayed.id);

// Cancel a pending job
await verne.clockwork.delayed.cancel(delayed.id);
```

## Error Handling

All API errors throw a `VerneAPIError` with structured fields:

```ts
import { VerneAPIError } from '@verne-software/sdk';

try {
  await verne.relay.messages.send({ event_type: 'ping', payload: {} });
} catch (err) {
  if (err instanceof VerneAPIError) {
    console.error(err.code);      // e.g. 'invalid_payload', 'unauthorized'
    console.error(err.status);    // HTTP status code
    console.error(err.requestId); // include in support requests
  }
}
```

Network failures and timeouts throw a base `VerneError`.

## Configuration

Both `Verne` and the per-service clients accept an optional `timeoutMs` (default `30000`):

```ts
const verne = new Verne({
  relay: process.env.VERNE_RELAY_KEY,
  timeoutMs: 10_000,
});
```

Individual requests can be cancelled with an `AbortSignal`:

```ts
const controller = new AbortController();

await verne.relay.messages.send(
  { event_type: 'ping', payload: {} },
  { signal: controller.signal },
);
```

## License

[MIT](LICENSE)
