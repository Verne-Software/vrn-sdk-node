#!/usr/bin/env node
// A throwaway tenant and API key on a LOCAL Nautilus stack, for `npm run test:integration`.
//
//   node scripts/local-stack-key.mjs create <state.json>   register an e2e- tenant, mint keys
//   node scripts/local-stack-key.mjs env    <state.json>   print `export VERNE_…=…` lines
//   node scripts/local-stack-key.mjs revoke <state.json>   revoke the keys
//
// It registers the way the dashboard's sign-up form does (Kratos browser flow, then
// /auth/registration/tenant) and mints keys through the dashboard API with that session.
// The email is `e2e-sdk<run>@e2e.soft.com`, which nautilus' `make purge-e2e
// E2E_PREFIXES=e2e-sdk<run>` sweeps afterwards. The state file holds secrets (mode 0600);
// nothing here prints a key unless you ask for `env`.
//
// Refuses any API host but api.soft.com / localhost: this is not for production.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

const API = (process.env.VERNE_BASE_URL || 'http://api.soft.com').replace(/\/+$/, '');
if (!['api.soft.com', 'localhost', '127.0.0.1'].includes(new URL(API).hostname)) {
  throw new Error(`refusing non-local API ${API}`);
}

const jar = new Map();
function absorb(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function mintKey(session, name, scopes) {
  const res = await fetch(`${API}/dashboard/tenant/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `ory_kratos_session=${session}` },
    body: JSON.stringify({ name, scopes }),
  });
  if (res.status !== 201) throw new Error(`key creation: HTTP ${res.status}`);
  return res.json();
}

async function create(file) {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const prefix = `e2e-sdk${runId}`;
  const rnd = () => Math.random().toString(36).slice(2, 12);
  const password = `Pw-${rnd()}-${rnd()}-9!`;

  const flowRes = await fetch(`${API}/auth/self-service/registration/browser?identity_schema=tenant`, {
    headers: { Accept: 'application/json' },
  });
  absorb(flowRes);
  if (!flowRes.ok) throw new Error(`registration flow: HTTP ${flowRes.status}`);
  const flow = await flowRes.json();
  const csrf = flow.ui.nodes.find((n) => n.attributes?.name === 'csrf_token')?.attributes.value;

  const reg = await fetch(`${API}/auth/registration/tenant`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: JSON.stringify({
      flow: flow.id,
      csrf_token: csrf,
      password,
      traits: { email: `${prefix}@e2e.soft.com`, locale: 'en', display_name: `SDK ${runId}` },
    }),
  });
  absorb(reg);
  const body = await reg.json().catch(() => ({}));
  const session = jar.get('ory_kratos_session');
  if (!body?.session?.identity?.id || !session) throw new Error(`registration: HTTP ${reg.status}`);

  const scopes = (process.env.SCOPES || 'gate,clockwork,passepartout').split(',');
  const key = await mintKey(session, `sdk-${runId}`, scopes);
  const narrow = await mintKey(session, `sdk-${runId}-narrow`, ['clockwork']);

  writeFileSync(
    file,
    JSON.stringify({
      runId,
      prefix,
      baseUrl: API,
      tenantId: body.session.identity.id,
      session,
      keyId: key.id,
      key: key.raw_key,
      narrowKeyId: narrow.id,
      narrowKey: narrow.raw_key,
      scopes,
    }),
  );
  chmodSync(file, 0o600);
  console.log(`tenant registered: prefix ${prefix}, keys ${key.id} (${scopes}) and ${narrow.id} (clockwork)`);
}

function env(file) {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`export VERNE_BASE_URL='${s.baseUrl}'`);
  console.log(`export VERNE_API_KEY='${s.key}'`);
  console.log(`export VERNE_NARROW_KEY='${s.narrowKey}'`);
  console.log(`export VERNE_EMAIL_PREFIX='${s.prefix}'`);
}

async function revoke(file) {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  for (const id of [s.keyId, s.narrowKeyId].filter(Boolean)) {
    const res = await fetch(`${API}/dashboard/tenant/keys/${id}`, {
      method: 'PATCH',
      headers: { Cookie: `ory_kratos_session=${s.session}` },
    });
    console.log(`revoke ${id}: HTTP ${res.status}`);
  }
  console.log(`now sweep: (cd nautilus && E2E_PREFIXES=${s.prefix} make purge-e2e)`);
}

const [cmd, file] = process.argv.slice(2);
if (!file) throw new Error('usage: local-stack-key.mjs create|env|revoke <state.json>');
if (cmd === 'create') await create(file);
else if (cmd === 'env') env(file);
else if (cmd === 'revoke') await revoke(file);
else throw new Error(`unknown command ${cmd}`);
