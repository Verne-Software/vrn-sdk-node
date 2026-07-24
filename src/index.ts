// Main unified client
export { Verne } from './verne.js';

// Per-service clients
export { Relay } from './resources/relay/relay.js';
export { Gate } from './resources/gate/gate.js';
export { Passepartout } from './resources/passepartout/passepartout.js';

// Errors
export { VerneError, VerneAPIError } from './core/errors.js';
export type { APIErrorBody } from './core/errors.js';

// Core types
export type { Paginated, RequestOptions, VerneConfig, ServiceConfig } from './core/types.js';

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
  AccessToken,
  CreateTokenParams,
  IntrospectResult,
  AuthorizeParams,
  AuthorizeResult,
} from './resources/gate/types.js';

// Passepartout types
export type {
  LoginStart,
  LoginStatus,
  TelegramUser,
  TokenIntrospection,
} from './resources/passepartout/types.js';
