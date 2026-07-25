import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { CreateDelayedJobParams, DelayedJob, Execution } from './types.js';

export class ClockworkDelayedResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Returns all delayed (one-shot) jobs for the current tenant.
   */
  async list(options?: RequestOptions): Promise<DelayedJob[]> {
    return this.http.get<DelayedJob[]>('/v1/clockwork/delayed', options);
  }

  /**
   * Schedules a new delayed job to run once at the given `run_at` time.
   *
   * @example
   * const job = await clockwork.delayed.create({
   *   name: 'send-reminder',
   *   run_at: '2026-01-01T09:00:00Z',
   *   url: 'https://example.com/hooks/reminder',
   * });
   */
  async create(params: CreateDelayedJobParams, options?: RequestOptions): Promise<DelayedJob> {
    return this.http.post<DelayedJob>('/v1/clockwork/delayed', { body: params, ...options });
  }

  /**
   * Cancels a pending delayed job. Resolves on `204 No Content`.
   */
  async cancel(jobId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`/v1/clockwork/delayed/${jobId}`, options);
  }

  /**
   * Returns the execution history for a delayed job.
   */
  async executions(jobId: string, options?: RequestOptions): Promise<Execution[]> {
    return this.http.get<Execution[]>(`/v1/clockwork/delayed/${jobId}/executions`, options);
  }
}
