-- Métodos de pagamento da kursiPay (2026-11-12).
-- Multicaixa Express ('mcx') e Referência ('reference') mantêm o código; passam a ser
-- cobrados pela kursiPay. Novos: PayPay, cartão Visa/Mastercard (em USD) e Pix (em BRL).
alter table public.orders drop constraint if exists orders_method_check;
alter table public.orders add constraint orders_method_check
  check (method = any (array['wallet','reference','mcx','paypal','paypay','card','pix']));
