create policy "klant wijzigt eigen client" on clients
  for update using (id = current_client_id()) with check (id = current_client_id());
