import type { Paginated } from '../../core/types.js';

/** A message (event) as returned by the Relay API. */
export interface Message {
  /** Unique message identifier. */
  id: string;
  /** Dot-notated event name (e.g. 'user.created'). */
  event_type: string;
  /** Delivery status after being accepted by Relay. */
  status: 'accepted';
  /** ISO 8601 timestamp of when the event was accepted. */
  timestamp: string;
}

/** Parameters for sending an event via Relay. */
export interface SendMessageParams {
  /** Dot-notated event name (e.g. 'user.created'). */
  event_type: string;
  /** Arbitrary JSON payload delivered to subscribers. */
  payload: Record<string, unknown>;
  /**
   * Optional idempotency key to prevent duplicate delivery within a 24-hour window.
   * If a message with the same key was already accepted, a 409 is returned.
   */
  idempotency_key?: string;
  /** Restrict delivery to endpoints listening on these channels. */
  channels?: string[];
}

/** Query parameters for listing sent events. */
export interface ListMessagesParams {
  /** Number of items per page. Max 100. Defaults to 20. */
  limit?: number;
  /** Pagination cursor from a previous response. */
  cursor?: string;
  /** Filter results by event type. */
  event_type?: string;
}

/** Paginated list of messages returned by GET /v1/relay/messages. */
export type ListMessagesResponse = Paginated<Message>;
