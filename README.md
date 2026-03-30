# Verne Software Node.js SDK

[![npm version](https://img.shields.io/npm/v/@vernesoft/node.svg)](https://npmjs.org/package/@vernesoft/node)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)

The official Node.js and TypeScript library for the [Verne Nautilus](https://vernesoft.com) platform.

> **Server-side only.** API keys carry full service access and must never be used in browser or client-side code.

## Requirements

Node.js 18 or later.

## Installation

```bash
npm install @vernesoft/node
# or
yarn add @vernesoft/node
# or
pnpm add @vernesoft/node
```

## Quick Start

```ts
import { Verne } from '@vernesoft/node';

const verne = new Verne({
  relay: process.env.VERNE_RELAY_KEY,
  gate:  process.env.VERNE_GATE_KEY,
});
```

You can also instantiate services independently if you only need one:

```ts
import { Relay, Gate } from '@vernesoft/node';

const relay = new Relay({ apiKey: process.env.VERNE_RELAY_KEY });
const gate  = new Gate({ apiKey: process.env.VERNE_GATE_KEY });
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

## Error Handling

All API errors throw a `VerneAPIError` with structured fields:

```ts
import { VerneAPIError } from '@vernesoft/node';

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
