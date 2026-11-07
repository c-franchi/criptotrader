-- Apply 0023_order_accounting_retry.sql and publish the accounting-tick route FIRST.
-- This new job only audits previous receipts. It never signs or sends transactions.
-- No secrets are emitted: the existing authorized grid-tick command is reused.
DO $$
DECLARE original_command text; accounting_command text;
BEGIN
  SELECT command INTO original_command FROM cron.job
    WHERE jobname = 'grid-tick' AND active = true;
  IF original_command IS NULL OR
     strpos(original_command, '/api/public/hooks/grid-tick') = 0 THEN
    RAISE EXCEPTION 'Existing grid-tick job not found or not configured for this workspace';
  END IF;
  accounting_command := replace(original_command,
    '/api/public/hooks/grid-tick',
    '/api/public/hooks/accounting-tick');
  PERFORM cron.schedule('accounting-tick', '*/2 * * * *', accounting_command);
END $$;
SELECT jobname, active, schedule, jobid FROM cron.job
  WHERE jobname IN ('grid-tick','accounting-tick');
