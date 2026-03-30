import { HttpClient } from '../../core/http.js';
import type { ServiceConfig } from '../../core/types.js';
import { MessagesResource } from './messages.js';

export class Relay {
  readonly messages: MessagesResource;

  constructor(config: ServiceConfig) {
    const http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.messages = new MessagesResource(http);
  }
}
