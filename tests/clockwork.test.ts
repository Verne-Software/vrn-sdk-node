import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clockwork, VerneAPIError } from '../src/index.js';

const API_KEY = 'vrn_clockwork_test_sk_abc123';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? {} : { 'Content-Type': 'application/json' },
    }),
  );
}

const CRON_JOB = {
  id: 'job_1',
  tenant_id: 'ten_1',
  name: 'nightly-report',
  schedule: '0 2 * * *',
  url: 'https://example.com/hooks/report',
  method: 'POST',
  headers: {},
  body: null,
  is_active: true,
  last_run_at: null,
  next_run_at: '2026-01-02T02:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DELAYED_JOB = {
  id: 'del_1',
  tenant_id: 'ten_1',
  name: 'send-reminder',
  run_at: '2026-01-01T09:00:00Z',
  url: 'https://example.com/hooks/reminder',
  method: 'POST',
  headers: {},
  body: null,
  status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const EXECUTION = {
  id: 'exec_1',
  job_id: 'job_1',
  status: 'success',
  started_at: '2026-01-01T02:00:00Z',
  completed_at: '2026-01-01T02:00:01Z',
  duration_ms: 1000,
  response_status: 200,
  response_body: 'ok',
  error_message: null,
};

describe('Clockwork', () => {
  let clockwork: Clockwork;

  beforeEach(() => {
    clockwork = new Clockwork({ apiKey: API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Cron Jobs
  // ---------------------------------------------------------------------------

  describe('jobs.list()', () => {
    it('sends GET /v1/clockwork/jobs and returns a bare array', async () => {
      const spy = mockFetch(200, [CRON_JOB]);

      const result = await clockwork.jobs.list();

      expect(result).toEqual([CRON_JOB]);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/jobs');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe('jobs.create()', () => {
    it('sends POST /v1/clockwork/jobs with the params body', async () => {
      const spy = mockFetch(201, CRON_JOB);

      const params = {
        name: 'nightly-report',
        schedule: '0 2 * * *',
        url: 'https://example.com/hooks/report',
      };
      const result = await clockwork.jobs.create(params);

      expect(result).toEqual(CRON_JOB);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/jobs');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual(params);
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe('jobs.update()', () => {
    it('sends PATCH /v1/clockwork/jobs/:id with the partial body', async () => {
      const updated = { ...CRON_JOB, is_active: false };
      const spy = mockFetch(200, updated);

      const result = await clockwork.jobs.update('job_1', { is_active: false });

      expect(result).toEqual(updated);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/jobs/job_1');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(init?.body as string)).toEqual({ is_active: false });
    });
  });

  describe('jobs.delete()', () => {
    it('sends DELETE /v1/clockwork/jobs/:id', async () => {
      const spy = mockFetch(204, null);

      await clockwork.jobs.delete('job_1');

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/jobs/job_1');
      expect(init?.method).toBe('DELETE');
    });
  });

  describe('jobs.executions()', () => {
    it('sends GET /v1/clockwork/jobs/:id/executions and returns a bare array', async () => {
      const spy = mockFetch(200, [EXECUTION]);

      const result = await clockwork.jobs.executions('job_1');

      expect(result).toEqual([EXECUTION]);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/jobs/job_1/executions');
      expect(init?.method).toBe('GET');
    });
  });

  // ---------------------------------------------------------------------------
  // Delayed Jobs
  // ---------------------------------------------------------------------------

  describe('delayed.list()', () => {
    it('sends GET /v1/clockwork/delayed and returns a bare array', async () => {
      const spy = mockFetch(200, [DELAYED_JOB]);

      const result = await clockwork.delayed.list();

      expect(result).toEqual([DELAYED_JOB]);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/delayed');
      expect(init?.method).toBe('GET');
    });
  });

  describe('delayed.create()', () => {
    it('sends POST /v1/clockwork/delayed with the params body', async () => {
      const spy = mockFetch(201, DELAYED_JOB);

      const params = {
        name: 'send-reminder',
        run_at: '2026-01-01T09:00:00Z',
        url: 'https://example.com/hooks/reminder',
      };
      const result = await clockwork.delayed.create(params);

      expect(result).toEqual(DELAYED_JOB);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/delayed');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual(params);
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe('delayed.cancel()', () => {
    it('sends DELETE /v1/clockwork/delayed/:id', async () => {
      const spy = mockFetch(204, null);

      await clockwork.delayed.cancel('del_1');

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/delayed/del_1');
      expect(init?.method).toBe('DELETE');
    });
  });

  describe('delayed.executions()', () => {
    it('sends GET /v1/clockwork/delayed/:id/executions and returns a bare array', async () => {
      const spy = mockFetch(200, [EXECUTION]);

      const result = await clockwork.delayed.executions('del_1');

      expect(result).toEqual([EXECUTION]);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/clockwork/delayed/del_1/executions');
      expect(init?.method).toBe('GET');
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws VerneAPIError with correct fields on API error', async () => {
      mockFetch(404, {
        error: { code: 'job_not_found', message: 'Job does not exist.', request_id: 'req_err' },
      });

      const err = await clockwork.jobs.executions('missing').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VerneAPIError);
      const apiErr = err as VerneAPIError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('job_not_found');
      expect(apiErr.requestId).toBe('req_err');
      expect(apiErr.message).toBe('Job does not exist.');
    });
  });
});
