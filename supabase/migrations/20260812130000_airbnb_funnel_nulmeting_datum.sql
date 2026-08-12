-- Losstaand van bijgewerkt_op (dat verandert mee bij elke correctie): de admin kiest zelf
-- de datum waarop de meting daadwerkelijk is gedaan, zodat die datum blijft staan ook als
-- een percentage later nog wordt aangepast. Nullable: bestaande rijen (en nieuw ingevulde
-- metingen zonder datum) hebben nog geen waarde totdat de admin er een instelt.
alter table airbnb_funnel_nulmeting add column nulmeting_datum date;
