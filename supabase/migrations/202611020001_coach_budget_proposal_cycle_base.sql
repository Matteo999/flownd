-- Le proposte update_budget del Coach esprimono il limite in euro sul budget del
-- ciclo corrente: la percentuale va calcolata su quella base, non sulla stima
-- planned_monthly_income del profilo (che resta la base salvata delle allocazioni).

create or replace function public.resolve_coach_action(
  p_message_id uuid,
  p_resolution text,
  p_arguments jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  proposal public.coach_messages%rowtype;
  action_type text;
  arguments jsonb;
  resolution_content text;
  resolution_message public.coach_messages%rowtype;
  goal_id uuid;
  target_amount numeric;
  amount numeric;
  planned_income numeric;
  budget_base numeric;
  target_key text;
  target_percentage numeric;
  needs_percentage numeric;
  wants_percentage numeric;
  savings_percentage numeric;
  remaining numeric;
  adjustment numeric;
  allocations jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_resolution not in ('confirmed', 'cancelled') then
    raise exception 'invalid coach action resolution';
  end if;

  select * into proposal
  from public.coach_messages
  where id = p_message_id and user_id = current_user_id
  for update;

  if not found or proposal.pending_action is null then
    raise exception 'coach proposal not found';
  end if;
  if proposal.action_status <> 'pending' then
    return jsonb_build_object(
      'actionStatus', proposal.action_status,
      'message', null
    );
  end if;

  action_type := proposal.pending_action ->> 'type';
  arguments := coalesce(p_arguments, proposal.pending_action -> 'arguments', '{}'::jsonb);

  if p_resolution = 'confirmed' then
    if action_type = 'add_transaction' then
      amount := nullif(arguments ->> 'amount', '')::numeric;
      if amount is null or amount <= 0 or trim(coalesce(arguments ->> 'description', '')) = '' then
        raise exception 'invalid transaction proposal';
      end if;
      insert into public.transactions (
        user_id, description, amount, category, occurred_at, source, kind,
        internal_transfer, excluded_from_totals, excluded_from_budget
      ) values (
        current_user_id,
        trim(arguments ->> 'description'),
        amount,
        coalesce(nullif(trim(arguments ->> 'category'), ''), 'Altro'),
        coalesce(nullif(arguments ->> 'occurred_at', '')::timestamptz, now()),
        'manual', 'expense', false, false, false
      );
      resolution_content := 'Spesa salvata nella Timeline.';

    elsif action_type = 'create_goal' then
      target_amount := nullif(arguments ->> 'target_amount', '')::numeric;
      if target_amount is null or target_amount <= 0 or trim(coalesce(arguments ->> 'name', '')) = '' then
        raise exception 'invalid goal proposal';
      end if;
      insert into public.goals (
        user_id, name, target_amount, deadline_label, monthly_contribution,
        allocation_percentage, priority
      ) values (
        current_user_id,
        trim(arguments ->> 'name'),
        target_amount,
        nullif(arguments ->> 'deadline', ''),
        0,
        0,
        coalesce((select max(priority) + 1 from public.goals
          where user_id = current_user_id and active and group_id is null), 0)
      );
      resolution_content := 'Obiettivo creato.';

    elsif action_type = 'update_goal' then
      goal_id := nullif(arguments ->> 'goal_id', '')::uuid;
      if goal_id is null or not exists (
        select 1 from public.goals
        where id = goal_id and user_id = current_user_id
          and group_id is null and active
      ) then raise exception 'active personal goal not found'; end if;
      if nullif(trim(coalesce(arguments ->> 'name', '')), '') is null
        and nullif(arguments ->> 'target_amount', '') is null
        and not (arguments ? 'deadline') then
        raise exception 'empty goal update';
      end if;
      if nullif(arguments ->> 'target_amount', '') is not null
        and (arguments ->> 'target_amount')::numeric <= 0 then
        raise exception 'invalid goal target';
      end if;
      update public.goals
      set name = coalesce(nullif(trim(arguments ->> 'name'), ''), name),
          target_amount = coalesce(nullif(arguments ->> 'target_amount', '')::numeric, target_amount),
          deadline_label = case when arguments ? 'deadline'
            then nullif(arguments ->> 'deadline', '') else deadline_label end,
          status = case
            when coalesce(nullif(arguments ->> 'target_amount', '')::numeric, target_amount) <= saved_amount
              then 'reached'
            else 'active' end
      where id = goal_id and user_id = current_user_id;
      resolution_content := 'Obiettivo aggiornato.';

    elsif action_type = 'update_budget' then
      target_key := arguments ->> 'category_key';
      amount := nullif(arguments ->> 'monthly_limit', '')::numeric;
      if target_key is null or target_key not in ('needs', 'wants', 'savings')
        or amount is null or amount <= 0 then
        raise exception 'invalid budget proposal';
      end if;
      select planned_monthly_income into planned_income
      from public.profiles where id = current_user_id;
      if planned_income is null or planned_income <= 0 then
        raise exception 'planned monthly income missing';
      end if;
      -- Il Coach propone il limite sul budget del ciclo (entrate reali meno la
      -- quota ai gruppi) e allega quella base; le proposte storiche non l'hanno.
      budget_base := nullif(arguments ->> 'budget_base', '')::numeric;
      if budget_base is null or budget_base <= 0 then
        budget_base := planned_income;
      end if;
      target_percentage := round(greatest(5, least(90, amount / budget_base * 100)));
      select
        max(allocation_percentage) filter (where category_key = 'needs'),
        max(allocation_percentage) filter (where category_key = 'wants'),
        max(allocation_percentage) filter (where category_key = 'savings')
      into needs_percentage, wants_percentage, savings_percentage
      from public.budget_categories
      where user_id = current_user_id and is_macro;
      if needs_percentage is null or wants_percentage is null or savings_percentage is null then
        raise exception 'macro budgets missing';
      end if;

      remaining := target_percentage - case target_key
        when 'needs' then needs_percentage
        when 'wants' then wants_percentage
        else savings_percentage end;
      if target_key = 'needs' then needs_percentage := target_percentage;
      elsif target_key = 'wants' then wants_percentage := target_percentage;
      else savings_percentage := target_percentage;
      end if;

      if remaining > 0 then
        if target_key in ('needs', 'savings') then
          adjustment := least(remaining, greatest(0, wants_percentage - 5));
          wants_percentage := wants_percentage - adjustment; remaining := remaining - adjustment;
        else
          adjustment := least(remaining, greatest(0, needs_percentage - 5));
          needs_percentage := needs_percentage - adjustment; remaining := remaining - adjustment;
        end if;
        if target_key = 'needs' then
          adjustment := least(remaining, greatest(0, savings_percentage - 5));
          savings_percentage := savings_percentage - adjustment; remaining := remaining - adjustment;
        elsif target_key = 'wants' then
          adjustment := least(remaining, greatest(0, savings_percentage - 5));
          savings_percentage := savings_percentage - adjustment; remaining := remaining - adjustment;
        else
          adjustment := least(remaining, greatest(0, needs_percentage - 5));
          needs_percentage := needs_percentage - adjustment; remaining := remaining - adjustment;
        end if;
      elsif remaining < 0 then
        remaining := abs(remaining);
        if target_key in ('needs', 'savings') then
          adjustment := least(remaining, greatest(0, 90 - wants_percentage));
          wants_percentage := wants_percentage + adjustment; remaining := remaining - adjustment;
        else
          adjustment := least(remaining, greatest(0, 90 - needs_percentage));
          needs_percentage := needs_percentage + adjustment; remaining := remaining - adjustment;
        end if;
        if target_key = 'needs' then
          adjustment := least(remaining, greatest(0, 90 - savings_percentage));
          savings_percentage := savings_percentage + adjustment; remaining := remaining - adjustment;
        elsif target_key = 'wants' then
          adjustment := least(remaining, greatest(0, 90 - savings_percentage));
          savings_percentage := savings_percentage + adjustment; remaining := remaining - adjustment;
        else
          adjustment := least(remaining, greatest(0, 90 - needs_percentage));
          needs_percentage := needs_percentage + adjustment; remaining := remaining - adjustment;
        end if;
      end if;
      if remaining > 0.01 then raise exception 'budget allocation cannot be balanced'; end if;

      select jsonb_agg(jsonb_build_object(
        'id', category_key,
        'percentage', case category_key
          when 'needs' then needs_percentage
          when 'wants' then wants_percentage
          when 'savings' then savings_percentage
          else allocation_percentage end,
        'isMacro', is_macro,
        'parentId', parent_key,
        'parentCategoryId', parent_category_key,
        'budgetEnabled', budget_enabled
      ) order by created_at)
      into allocations
      from public.budget_categories where user_id = current_user_id;
      perform public.save_budget_allocations(planned_income, allocations);
      resolution_content := 'Budget aggiornato.';
    else
      raise exception 'unsupported coach action';
    end if;
  else
    resolution_content := 'Va bene, non ho salvato nulla.';
  end if;

  update public.coach_messages
  set pending_action = jsonb_set(pending_action, '{arguments}', arguments, true),
      action_status = p_resolution
  where id = proposal.id;

  insert into public.coach_messages (
    conversation_id, user_id, role, content
  ) values (
    proposal.conversation_id, current_user_id, 'assistant', resolution_content
  ) returning * into resolution_message;

  return jsonb_build_object(
    'actionStatus', p_resolution,
    'message', jsonb_build_object(
      'id', resolution_message.id,
      'conversationId', resolution_message.conversation_id,
      'role', resolution_message.role,
      'content', resolution_message.content,
      'pendingAction', null,
      'actionStatus', null,
      'createdAt', resolution_message.created_at
    )
  );
end;
$$;

revoke all on function public.resolve_coach_action(uuid, text, jsonb)
  from public, anon;
grant execute on function public.resolve_coach_action(uuid, text, jsonb)
  to authenticated;
