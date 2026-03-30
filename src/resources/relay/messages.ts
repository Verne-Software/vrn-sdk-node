import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type {
  ListMessagesParams,
  ListMessagesResponse,
  Message,
  SendMessageParams,
} from './types.js';

export class MessagesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Publish an event to all endpoints subscribed to the given event_type.
   * Automatically retries once on 429 (respects Retry-After header).
   *
   * @returns The accepted message with its assigned ID and timestamp.
   */
  async send(params: SendMessageParams, options?: RequestOptions): Promise<Message> {
    return this.http.post<Message>('/v1/relay/messages', { body: params, ...options });
  }

  /**
   * Returns a paginated list of previously sent events for the current tenant.
   */
  async list(params?: ListMessagesParams, options?: RequestOptions): Promise<ListMessagesResponse> {
    const query = buildQuery(params);
    const path = query ? `/v1/relay/messages?${query}` : '/v1/relay/messages';
    return this.http.get<ListMessagesResponse>(path, options);
  }
}

function buildQuery(params?: ListMessagesParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) searchParams.set(k, String(v));
  }
  return searchParams.toString();
}
