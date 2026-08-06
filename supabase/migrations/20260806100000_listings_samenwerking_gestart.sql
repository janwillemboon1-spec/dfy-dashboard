-- Datum waarop de DFY-samenwerking voor déze accommodatie startte. Nullable: bestaande
-- listings en listings die (nog) via handmatige nulmeting-invoer werken, hebben dit niet
-- nodig. Per listing i.p.v. per client, want een klant kan accommodaties op verschillende
-- momenten hebben laten starten.
alter table listings add column samenwerking_gestart date;
