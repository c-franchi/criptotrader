INSERT INTO public.user_tokens (user_id, address, symbol, name, decimals)
SELECT u.user_id, t.address, t.symbol, t.name, 18
FROM (
  SELECT user_id, lower(token) tk FROM public.strategies
  UNION SELECT user_id, lower(token) FROM public.orders
  UNION SELECT user_id, lower(token) FROM public.grid_bots
  UNION SELECT user_id, lower(token_address) FROM public.price_alerts
) u
JOIN (VALUES
  ('0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA','GTE','Gold Tech'),
  ('0xDbb962A6Fa2b9AEAf27Ec2D7fd5e820d479bdb3D','BGA','BIGHAIR')
) t(address, symbol, name) ON lower(t.address) = u.tk
WHERE NOT EXISTS (SELECT 1 FROM public.user_tokens x WHERE x.user_id = u.user_id AND lower(x.address) = u.tk);