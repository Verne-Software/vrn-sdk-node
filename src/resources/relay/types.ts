import type { Paginated } from '../../core/types.js';

/** A message (event) as returned by the Relay API. */
export interface Message {
  /** Unique message identifier. */
  id: string;
  /** Dot-notated event name (e.g. 'user.created'). */
  event_type: string;
  /**
   * Always `'accepted'`.
   *
   * It records that Relay took the event, not what each subscriber endpoint did
   * with it afterwards — per-endpoint delivery state lives in the Console under
   * Dashboard → Relay. A literal type rather than `string`, so a `switch` over
   * it cannot grow a branch that never runs.
   */
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
   * Optional idempotency key, deduplicating within a 24-hour window.
   *
   * Sending the same key twice does not create a second event and does not
   * fail: the second call returns `202` with the *originally* accepted message,
   * same `id` and same `timestamp`. So a retry of a request whose response you
   * never saw needs no special handling — there is no duplicate to tell apart
   * from a success.
   */
  idempotency_key?: string;
  /** Restrict delivery to endpoints listening on these channels. */
  channels?: string[];
}

/** Query parameters for listing sent events. */
export interface ListMessagesParams {
  /** Number of items per page. Defaults to 20; anything above 100 is clamped to 100. */
  limit?: number;
  /**
   * Pagination cursor from a previous response's `next_cursor`.
   *
   * `next_cursor` is `null` on the last page, so paginate until `has_more` is
   * `false` rather than until `data` comes back empty.
   */
  cursor?: string;
  /** Filter results by event type. */
  event_type?: string;
}

/** Paginated list of messages returned by GET /v1/relay/messages. */
export type ListMessagesResponse = Paginated<Message>;
