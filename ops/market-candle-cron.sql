-- Run ONCE on the production database after deploying the market-candle-tick endpoint
-- and applying 0022_market_candle_archive.sql. Does not alter the grid-tick job.
-- Reuses the existing grid-tick job's authenticated HTTP command, so no token
-- or service-role key is ever exposed in this file or in the application UI.
DO $$
DECLARE grid_command text; derived_command text;
BEGIN
  SELECT command INTO grid_command FROM cron.job
    WHERE jobname = 'grid-tick' AND active = true;
  IF grid_command IS NULL THEN
    RAISE EXCEPTION 'grid-tick cron is missing or inactive. Restore the scheduler in this workspace first.';
  END IF;
  IF strpos(grid_command, '/api/public/hooks/grid-tick') = 0 THEN
    RAISE EXCEPTION 'The current grid-tick command does not contain its expected URL; inspect it privately.';
  END IF;
  derived_command := replace(
    grid_command,
    '/api/public/hooks/grid-tick',
    '/api/public/hooks/candle-tick'
  );
  -- A backfill can make two sequential, bounded public-API requests.
  IF derived_command ~ 'timeout_milliseconds\s*:=' THEN
    derived_command := regexp_replace(
      derived_command, 'timeout_milliseconds\s*:=\s*[0-9]+',
      'timeout_milliseconds := 45000'
    );
  ELSIF derived_command ~ 'net\.http_post\s*\(' THEN
    derived_command := regexp_replace(
      derived_command, '(net\.http_post\s*\()',
      '\1timeout_milliseconds := 45000, '
    );
  ELSE
    RAISE EXCEPTION 'Cannot safely identify HTTP timeout in existing cron command';
  END IF;
  PERFORM cron.schedule('market-candle-tick', '* * * * *', derived_command);
END $$;

-- Safe inspection: no HTTP commands, secrets or keys are returned.
SELECT jobname, active, schedule, jobid
FROM cron.job
WHERE jobname IN ('grid-tick', 'market-candle-tick');

-- Verify last run without exposing authorization headers:
-- SELECT j.jobname, d.status, d.start_time, d.end_time, left(d.return_message, 160) AS note
-- FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
-- WHERE j.jobname='market-candle-tick'
-- ORDER BY d.start_time DESC LIMIT 10;
