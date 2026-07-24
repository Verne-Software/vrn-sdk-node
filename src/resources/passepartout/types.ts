/** The Telegram end-user captured during login. */
export interface TelegramUser {
  id: string;
  username?: string;
  first_name?: string;
  photo_url?: string;
}

/** Response from starting a Telegram login. */
export interface LoginStart {
  /** Opaque nonce identifying this login attempt. Poll `loginStatus(nonce)` with it. */
  nonce: string;
  /** `https://t.me/<bot>?start=<nonce>` — send the end-user here to authenticate. */
  deep_link: string;
  /** ISO-8601 timestamp after which the nonce expires. */
  expires_at: string;
}

/** Current state of a Telegram login attempt. */
export interface LoginStatus {
  /** `pending` until the user completes the Telegram flow, then `completed`. */
  status: 'pending' | 'completed';
  /** Present once completed — the end-user's access token. */
  access_token?: string;
  /** Present once completed — when the access token expires (ISO-8601). */
  expires_at?: string;
  /** Present once completed — the provisioned Kratos identity id. */
  identity_id?: string;
  /** Present once completed — the authenticated Telegram user. */
  user?: TelegramUser;
}

/** Result of introspecting a Passepartout access token. */
export interface TokenIntrospection {
  active: boolean;
  subject?: string;
  tenant_id?: string;
  scopes?: string[];
  expires_at?: string;
}
