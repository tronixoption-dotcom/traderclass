-- Offer a direct USDT wallet option for customers who do not use an exchange.
-- Admins must set the receiving address and enable the direction before it appears.
INSERT INTO public.funding_methods(
  code,name,provider,asset,network,deposit_address,instructions,
  min_amount,max_amount,deposits_enabled,withdrawals_enabled,sort_order
)
VALUES(
  'usdt','USDT','crypto','USDT','TRC20','UNCONFIGURED-USDT-TRC20',
  'Send only USDT over the configured network. Enter the transaction hash after sending.',
  10,100000,false,false,5
)
ON CONFLICT(code) DO NOTHING;
