import { HttpClient } from '../../core/http.js';
import type { ServiceConfig } from '../../core/types.js';
import { ClockworkDelayedResource } from './delayed.js';
import { ClockworkJobsResource } from './jobs.js';

export class Clockwork {
  readonly jobs: ClockworkJobsResource;
  readonly delayed: ClockworkDelayedResource;

  private readonly http: HttpClient;

  constructor(config: ServiceConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.jobs = new ClockworkJobsResource(this.http);
    this.delayed = new ClockworkDelayedResource(this.http);
  }
}
