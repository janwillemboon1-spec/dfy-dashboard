-- Analoog aan de bestaande "klant leest eigen nulmeting"-policy — monthly_actuals was
-- tot nu toe (Fase 2a) admin-only. Het klantdashboard heeft deze koppeling nodig om
-- eigen resultaten te tonen.
create policy "klant leest eigen monthly_actuals" on monthly_actuals
  for select using (
    listing_id in (select id from listings where client_id = current_client_id())
  );
