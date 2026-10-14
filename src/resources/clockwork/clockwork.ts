import { HttpClient } from '../../core/http.js';
import type { RequestOptions, ServiceConfig } from '../../core/types.js';
import { ClockworkDelayedResource } from './delayed.js';
import { ClockworkJobsResource } from './jobs.js';
import type { ClockworkUsage } from './types.js';

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

  /**
   * How many jobs exist against the plan's limits. Creating a job over a limit, or
   * resuming a paused one, is refused with `402` (`UPGRADE_REQUIRED` or
   * `JOB_LIMIT_REACHED`) — never retried.
   */
  async usage(options?: RequestOptions): Promise<ClockworkUsage> {
    return this.http.get<ClockworkUsage>('/v1/clockwork/usage', options);
  }
}
