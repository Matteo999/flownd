-- Tabelle scritte solo dal backend o da funzioni security definer: i client
-- mantengono lettura (e le sole modifiche che l'app usa davvero).

-- coach_insights: generati dal backend, l'app li legge soltanto.
drop policy if exists "coach_insights_client_insert_guard" on public.coach_insights;
create policy "coach_insights_client_insert_guard" on public.coach_insights
  as restrictive for insert to authenticated with check (false);
drop policy if exists "coach_insights_client_update_guard" on public.coach_insights;
create policy "coach_insights_client_update_guard" on public.coach_insights
  as restrictive for update to authenticated using (false);
drop policy if exists "coach_insights_client_delete_guard" on public.coach_insights;
create policy "coach_insights_client_delete_guard" on public.coach_insights
  as restrictive for delete to authenticated using (false);

-- goal_notifications: create da service role e funzioni security definer;
-- l'app le segna come lette e le elimina.
drop policy if exists "goal_notifications_client_insert_guard" on public.goal_notifications;
create policy "goal_notifications_client_insert_guard" on public.goal_notifications
  as restrictive for insert to authenticated with check (false);

-- coach_messages: il client (tramite l'API con il token utente) inserisce solo
-- messaggi utente. Risposte e proposte dell'assistente sono scritte dal backend
-- con service role; la risoluzione passa da resolve_coach_action (definer).
drop policy if exists "coach_messages_client_insert_guard" on public.coach_messages;
create policy "coach_messages_client_insert_guard" on public.coach_messages
  as restrictive for insert to authenticated
  with check (role = 'user' and pending_action is null and action_status is null);
drop policy if exists "coach_messages_client_update_guard" on public.coach_messages;
create policy "coach_messages_client_update_guard" on public.coach_messages
  as restrictive for update to authenticated using (false);
