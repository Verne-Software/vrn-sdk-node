// ---------------------------------------------------------------------------
// Cron Jobs
// ---------------------------------------------------------------------------

/** A recurring HTTP job scheduled on a cron expression. */
export interface CronJob {
  id: string;
  tenant_id: string;
  name: string;
  /** Cron expression, e.g. `'0 * * * *'` (hourly). */
  schedule: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Parameters for creating a new cron job. */
export interface CreateCronJobParams {
  name: string;
  /** Cron expression, e.g. `'0 * * * *'` (hourly). */
  schedule: string;
  url: string;
  /** HTTP method to invoke the target URL with. Defaults to `POST`. */
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Parameters for updating an existing cron job. All fields are optional —
 * only the fields you provide are changed.
 */
export interface UpdateCronJobParams {
  name?: string;
  /** Cron expression, e.g. `'0 * * * *'` (hourly). */
  schedule?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Delayed Jobs
// ---------------------------------------------------------------------------

/** A one-shot HTTP job scheduled to run once at a specific time. */
export interface DelayedJob {
  id: string;
  tenant_id: string;
  name: string;
  /** ISO 8601 timestamp at which the job should fire. */
  run_at: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Parameters for scheduling a new delayed job. */
export interface CreateDelayedJobParams {
  name: string;
  /** ISO 8601 timestamp at which the job should fire. */
  run_at: string;
  url: string;
  /** HTTP method to invoke the target URL with. Defaults to `POST`. */
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

// ---------------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------------

/** A single execution (run) of a cron or delayed job. */
export interface Execution {
  id: string;
  job_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
}