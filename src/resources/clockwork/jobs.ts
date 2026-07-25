import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { CreateCronJobParams, CronJob, Execution, UpdateCronJobParams } from './types.js';

export class ClockworkJobsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Returns all cron jobs for the current tenant.
   */
  async list(options?: RequestOptions): Promise<CronJob[]> {
    return this.http.get<CronJob[]>('/v1/clockwork/jobs', options);
  }

  /**
   * Creates a new recurring cron job.
   *
   * @example
   * const job = await clockwork.jobs.create({
   *   name: 'nightly-report',
   *   schedule: '0 2 * * *',
   *   url: 'https://example.com/hooks/report',
   * });
   */
  async create(params: CreateCronJobParams, options?: RequestOptions): Promise<CronJob> {
    return this.http.post<CronJob>('/v1/clockwork/jobs', { body: params, ...options });
  }

  /**
   * Partially updates an existing cron job. Only the fields you provide are changed.
   */
  async update(
    jobId: string,
    params: UpdateCronJobParams,
    options?: RequestOptions,
  ): Promise<CronJob> {
    return this.http.patch<CronJob>(`/v1/clockwork/jobs/${jobId}`, { body: params, ...options });
  }

  /**
   * Deletes a cron job. Resolves on `204 No Content`.
   */
  async delete(jobId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`/v1/clockwork/jobs/${jobId}`, options);
  }

  /**
   * Returns the execution history for a cron job (most recent runs first).
   */
  async executions(jobId: string, options?: RequestOptions): Promise<Execution[]> {
    return this.http.get<Execution[]>(`/v1/clockwork/jobs/${jobId}/executions`, options);
  }
}
