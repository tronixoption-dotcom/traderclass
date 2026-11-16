ALTER TABLE public.funding_methods DROP CONSTRAINT funding_methods_check;
ALTER TABLE public.funding_methods ADD CONSTRAINT funding_methods_crypto_configuration_check
  CHECK (provider <> 'crypto' OR (
    asset IN ('USD','USDT') AND length(trim(network)) > 0 AND
    (NOT deposits_enabled OR (length(trim(deposit_address)) >= 8 AND upper(trim(deposit_address)) NOT LIKE 'UNCONFIGURED-%'))
  ));

DROP POLICY "Read enabled funding methods" ON public.funding_methods;
CREATE POLICY "Users read payment methods" ON public.funding_methods FOR SELECT TO authenticated
  USING (deposits_enabled OR withdrawals_enabled OR provider='crypto' OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.funding_methods(code,name,provider,asset,network,deposit_address,instructions,min_amount,max_amount,deposits_enabled,withdrawals_enabled,sort_order)
VALUES
  ('binance','Binance','crypto','USDT','TRC20','UNCONFIGURED-BINANCE-TRC20','Only send USDT over the network shown. Enter the transaction hash after sending.',1,100000,false,false,10),
  ('bybit','Bybit','crypto','USDT','TRC20','UNCONFIGURED-BYBIT-TRC20','Only send USDT over the network shown. Enter the transaction hash after sending.',1,100000,false,false,20),
  ('okx','OKX','crypto','USDT','TRC20','UNCONFIGURED-OKX-TRC20','Only send USDT over the network shown. Enter the transaction hash after sending.',1,100000,false,false,30)
ON CONFLICT(code) DO NOTHING;
