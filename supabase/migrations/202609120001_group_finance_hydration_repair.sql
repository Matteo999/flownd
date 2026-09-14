-- Ripara la prima versione della migrazione delle quote di gruppo.
-- Le righe create automaticamente dal vecchio switch avevano sempre quota 100%,
-- effective_from nel mese di creazione e timestamp created/updated identici.

delete from public.group_contribution_rules rule
using public.group_members member
where member.group_id = rule.group_id
  and member.user_id = rule.user_id
  and member.share_monthly_budget
  and rule.percentage = 100
  and rule.effective_from = date_trunc('month', rule.created_at)::date
  and rule.created_at = rule.updated_at;

update public.group_members member
set share_monthly_budget = false
where member.share_monthly_budget
  and not exists (
    select 1
    from public.group_contribution_rules rule
    where rule.group_id = member.group_id
      and rule.user_id = member.user_id
      and rule.effective_from <= date_trunc('month', current_date)::date
      and rule.percentage > 0
  );

delete from public.group_monthly_contributions snapshot
where snapshot.cycle_start = date_trunc('month', current_date)::date
  and not exists (
    select 1
    from public.group_contribution_rules rule
    where rule.group_id = snapshot.group_id
      and rule.user_id = snapshot.user_id
      and rule.effective_from <= snapshot.cycle_start
  );
