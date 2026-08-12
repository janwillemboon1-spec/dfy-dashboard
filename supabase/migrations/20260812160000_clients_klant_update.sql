-- RLS kent geen kolom-restrictie: deze policy staat een klant-sessie toe om de héle
-- clients-rij te updaten, inclusief email/status — niet alleen naam/telefoon. Die
-- restrictie komt bewust van de server-actie (wijzigEigenClientGegevens), die nooit meer
-- dan naam/telefoon meestuurt in de update. Zelfde aanpak als de eerste klant-schrijfbare
-- policy op voortgang_todos.
create policy "klant wijzigt eigen client" on clients
  for update using (id = current_client_id()) with check (id = current_client_id());
