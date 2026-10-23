-- Apply after deploying the fast quote path. Rollback cadence with:
-- SELECT cron.alter_job(jobid, schedule := '5 seconds') FROM cron.job WHERE jobname = 'grid-tick';
-- Retains the existing endpoint and authorization inside Postgres; never outputs the command.
DO $$
DECLARE job_id bigint; job_command text;
BEGIN
  SELECT jobid, command INTO STRICT job_id, job_command FROM cron.job WHERE jobname = 'grid-tick';
  IF job_command ~ 'timeout_milliseconds\s*:=' THEN
    job_command := regexp_replace(job_command, 'timeout_milliseconds\s*:=\s*[0-9]+', 'timeout_milliseconds := 45000');
  ELSIF job_command ~ 'net\.http_post\s*\(\s*url\s*:=' THEN
    job_command := regexp_replace(job_command, '(net\.http_post\s*\()', '\1timeout_milliseconds := 45000, ');
  ELSE
    RAISE EXCEPTION 'Inspect scheduler argument structure before changing timeout';
  END IF;
  PERFORM cron.alter_job(job_id, schedule := '2 seconds', command := job_command);
END $$;
