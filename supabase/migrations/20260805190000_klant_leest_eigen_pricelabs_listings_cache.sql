-- Gevonden tijdens Taak 5's zelf-review: pricelabs_listings_cache was tot nu toe
-- admin-only (terecht — het bevat de PriceLabs-listings van alle klanten door elkaar,
-- bedoeld voor het admin-only koppelscherm uit Fase 2a). Maar syncEigenListings (Taak 5)
-- moet voor de klant's EIGEN, al gekoppelde listing het pms-veld kunnen opzoeken, en
-- draait via de RLS-scoped client — zonder deze policy komt die lookup altijd leeg terug
-- en kan de sync nooit slagen. Bewust smal geschoold: een klant ziet alleen de cache-rij
-- die hoort bij een listing die al aan hém gekoppeld is, nooit de rest van de cache.
create policy "klant leest eigen gekoppelde pricelabs_listings_cache" on pricelabs_listings_cache
  for select using (
    pricelabs_listing_id in (
      select pricelabs_listing_id from listings
      where client_id = current_client_id() and pricelabs_listing_id is not null
    )
  );
