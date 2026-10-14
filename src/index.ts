// Main unified client
export { Verne } from './verne.js';

// Per-service clients
export { Relay } from './resources/relay/relay.js';
export { Gate } from './resources/gate/gate.js';
export { Passepartout } from './resources/passepartout/passepartout.js';
export { Clockwork } from './resources/clockwork/clockwork.js';

// Signed-token verification (no API key needed)
export { GateTokenVerifier } from './resources/gate/verifier.js';
export type { GateTokenVerifierConfig } from './resources/gate/verifier.js';

// Errors
export { VerneError, VerneAPIError, VerneTokenError } from './core/errors.js';
export type { APIErrorBody, TokenErrorReason } from './core/errors.js';

// Core types
export type {
  Paginated,
  ListParams,
  RequestOptions,
  VerneConfig,
  ServiceConfig,
} from './core/types.js';

// Relay types
export type {
  Message,
  SendMessageParams,
  ListMessagesParams,
  ListMessagesResponse,
} from './resources/relay/types.js';

// Gate types
export type {
  Identity,
  IdentityTraits,
  CreateIdentityParams,
  JsonPatchOp,
  SecuritySettings,
  OidcProvider,
  LoginFlow,
  LoginFlowParams,
  RegistrationFlowParams,
  OidcExchangeResult,
  AccessToken,
  CreateTokenParams,
  IntrospectResult,
  AuthorizeParams,
  AuthorizeResult,
  OrganizationAuthorizeReason,
  OwnershipAuthorizeReason,
  OrgClaim,
  SignedToken,
  SignedTokenClaims,
  VerifySignedOptions,
  GateSession,
  SessionCheck,
  Organization,
  CreateOrganizationParams,
  UpdateOrganizationParams,
  Role,
  CreateRoleParams,
  UpdateRoleParams,
  Member,
  AddMemberParams,
  UpdateMemberParams,
  AuditActorType,
  AuditLogEntry,
  ListAuditLogParams,
  LifecycleRuleKind,
  LifecycleRuleParamsByKind,
  LifecycleRule,
  LifecycleRules,
  SetLifecycleRuleParams,
  LifecycleRulePreview,
  LifecycleAction,
  ListLifecycleActionsParams,
} from './resources/gate/types.js';

// Passepartout types
export type {
  LoginStart,
  LoginStatus,
  TelegramUser,
  TokenIntrospection,
} from './resources/passepartout/types.js';

// Clockwork types
export type {
  CronJob,
  CreateCronJobParams,
  UpdateCronJobParams,
  DelayedJob,
  CreateDelayedJobParams,
  Execution,
  ClockworkUsage,
} from './resources/clockwork/types.js';
