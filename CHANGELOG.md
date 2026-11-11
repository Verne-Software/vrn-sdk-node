# Changelog

All notable changes to `@verne-software/sdk`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [1.6.0] — 2026-11-11

The first release on npm since 1.4.1: it also carries everything in 1.5.0 below.

What the organization routes answer since Nautilus v1.10.44, typed.

### Added

- **Who a member is**: `Member.email` and `Member.display_name`, on every answer that
  carries a member (`members.add()`, `list()`, `update()`). Both are `null` when the person
  has none: a Telegram user has no address, and their name is the first name (or the
  username) they signed in with.
- **Counts**: `Organization.member_count` (people holding a role in it) and
  `Role.member_count` (people holding that role — a role with members cannot be deleted).
  `organizations.list()`, `roles.list()` and `members.list()` return the new
  `PaginatedWithTotal<T>`: `Paginated<T>` plus `total`, how many the whole list has, the
  same on every page.
- **Why a 404 or a 409**: `VerneAPIError.reason`. On the organization routes a
  `404 not_found` names what was not found (`'organization'`, `'role'`, `'member'`,
  `'end_user'`, `'project'`) and a `409 conflict` why it is one (`'role_name_taken'`,
  `'role_held'`, `'already_member'`); the new `ErrorReason` type lists them. `code` is
  unchanged, and the value stays in `details.reason` too, so 1.5 code behaves as before.
  `reason` is read only from the API's envelope, never from an identity-service body
  passed through on `/auth/*`, where it is a sentence.
- The audit log records `organization.created` and `organization.updated` (a rename, with
  `previous_name` in `details`). `auditLog.list({ action })` takes them as it takes any
  action; nothing changed in the SDK for that.

## [1.5.0] — tagged 2026-10-25, not published

Tagged `v1.5.0` but never published to npm: its changes reach npm in 1.6.0. Going from 1.4.1 to 1.6.0 brings everything below.

### Added

- **Time zones for cron jobs**: `CronJob.timezone` (an IANA name, `'UTC'` unless set), and
  `timezone` on `clockwork.jobs.create()` and `update()`. `'0 9 * * *'` in
  `'Europe/Paris'` runs at 09:00 Paris time all year round; `next_run_at` stays in UTC. An
  unknown zone is `400 invalid_payload`.
- **Importing users**: `CreateIdentityParams` types `email_verified`, `metadata_public` and
  the credentials an import sends — `credentials.password.config.hashed_password` (bcrypt)
  and `credentials.oidc.config.providers` (`IdentityCredentialsInput`,
  `OidcCredentialProvider`). The SDK already sent them; TypeScript no longer needs a cast.
- **Typed self-service flows**: `LoginFlow` (and the new `RegistrationFlow`, returned by
  `createRegistrationFlow()`) type `id`, `type`, `expires_at`, `ui.action`, `ui.method`,
  `ui.nodes` (`UiNode`, `UiNodeAttributes`) and `ui.messages` (`UiText`), so
  `flow.ui.action` type-checks without a cast. Other fields stay reachable through the
  index signature. `SelfServiceFlow` and `FlowUi` are exported.

## [1.4.1] — 2026-10-15

### Changed

- Package description and README opening name the product as Nautilus by Verne
  Software; registry metadata (homepage, documentation, keywords). No code changes.

## [1.4.0] — 2026-10-14

### Added

- **One key for every service**: `new Verne({ apiKey })`. Keys are `vrn_…` with scopes;
  the per-service keys (`relay`, `gate`, …) still work and override `apiKey`.
- **Organizations, roles and members**: `gate.organizations` (`create`, `list`, `get`,
  `update`, `delete`), `.roles` (`create`, `list`, `get`, `update`, `delete`),
  `.members` (`add`, `list`, `update`, `remove`), and
  `gate.identities.listOrganizations()`.
- **Permission checks in an organization**: `gate.organizations.authorize(orgId,
  identityId, permission)` and `.can(…)` → `boolean`. `AuthorizeResult` gains `role`;
  `reason` is typed for the organization answers.
- **Audit log**: `gate.auditLog.list()` with filters and cursor paging.
- **Automatic deletion rules**: `gate.lifecycle` (`listRules`, `setRule`, `deleteRule`,
  `previewRule`, `listActions`).
- **Signed tokens (JWT)**: `gate.tokens.createSigned(sessionToken)`,
  `gate.tokens.verifySigned(token, { tenantId })` and the standalone
  `GateTokenVerifier` — ES256 against the tenant's JWKS, issuer checked, no new
  dependency. Failures throw `VerneTokenError` with a `reason`.
- **Sessions**: `gate.sessions` (`list`, `revoke`, `revokeAll`, `check`). `check()` is
  `GET /v1/gate/auth/session`: `mfa_satisfied`, `orgs`, and `403 mfa_required`.
- **Custom metadata**: `gate.identities.getMetadata()` / `updateMetadata()`.
- **Social-login return**: `gate.settings.getReturnUrls()` / `updateReturnUrls()`,
  `gate.exchangeOidcCode()`, `gate.createRegistrationFlow()`, and `return_to`, `state`,
  `aal`, `session_token` on `gate.createLoginFlow()`.
- `orgs` / `orgs_truncated` on Gate and Passepartout introspection results.
- `clockwork.usage()`; `Execution.attempt`.
- `VerneAPIError.details` (the extra members of the error: `plan`, `limit`,
  `required_aal`, …) and `VerneAPIError.retryAfter`.
- `npm run test:integration`: an opt-in suite against a running stack.

### Changed

- Aligned with the API changes of October 2026: `AuthorizeResult` gains `message`, and
  `reason` is typed for every resource — `OwnershipAuthorizeReason` (`owned_by_tenant`,
  `subject_inactive`, `not_owned_by_tenant`, `not_a_known_identity`) beside the
  organization codes; the sentence the ownership check used to put in `reason` is now
  `message`. `sessions.revokeAll()` is documented as succeeding for a user with no
  session (`204`, it was a `404`). Docs and comments name `invalid_payload` (not
  `invalid_request`) for a malformed token request and treat Clockwork errors as the
  standard envelope; the string-form and numeric-code parsing stays as a fallback.
  Identities no longer carry `metadata_public.verne_tenant_id`; the SDK never read it.

### Fixed

- `gate.tokens.create()` sent the key in the request body without an
  `Authorization` header, which the API answers with `401`. It now sends the header
  like every other call, and no longer puts the key in the body.
- A `429` was retried after waiting out any `Retry-After` — for Relay's monthly limit,
  up to a month. Only a `Retry-After` of 60 seconds or less is waited out now; the
  monthly limit (`RELAY_MESSAGE_LIMIT_REACHED`) is thrown at once with `retryAfter`.
- An error body whose `error` is a string (Clockwork) lost its message (`HTTP 400`);
  the sentence is now the error's `message`. A body that is not JSON is now a
  `VerneAPIError` with the status instead of a bare `VerneError`.
- Types: identity traits are `email` and `locale` — the `custom_data` and `tenant_id`
  traits never existed in the API (creating with `custom_data` is a `400`); use custom
  metadata. Introspection fields other than `active` are optional (an inactive token is
  just `{ active: false }`).
- Docs: keys are `vrn_…` with no test/live environment; the Relay idempotency window is
  12 hours, not 24; `409` means "already exists in your account".
- Ids in paths are URL-encoded.

## [1.3.0] — 2026-07-25

### Added

- Clockwork (Cron-as-a-Service): `clockwork.jobs` and `clockwork.delayed`.

## [1.2.0] — 2026-07-24

### Added

- Passepartout (Telegram sign-in): `loginStart`, `loginStatus`, `introspect`.
