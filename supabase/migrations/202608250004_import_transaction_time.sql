-- Gli import PDF/CSV/XLSX e le scansioni IA devono conservare separatamente
-- il giorno contabile e l'eventuale orario esplicito presente nel documento.

with candidates as (
  select
    id,
    replace(
      substring(
        raw_description from
        '(?i)(?:alle[[:space:]]+(?:ore[[:space:]]+)?|ore[[:space:]]+|at[[:space:]]+|a[[:space:]]+las[[:space:]]+|à[[:space:]]+|um[[:space:]]+)?([0-9]{1,2}[:.][0-9]{2})'
      ),
      '.',
      ':'
    ) as local_time
  from public.transactions
  where source in ('file_import', 'ai_scan')
    and raw_description is not null
    and occurred_time is null
), valid_candidates as (
  select id, local_time
  from candidates
  where local_time is not null
    and split_part(local_time, ':', 1)::integer between 0 and 23
    and split_part(local_time, ':', 2)::integer between 0 and 59
)
update public.transactions as transaction
set occurred_time = valid_candidates.local_time::time,
    occurred_time_source = 'narrative'
from valid_candidates
where transaction.id = valid_candidates.id;

-- Un timestamp a mezzanotte non è un orario osservato. Usiamo mezzogiorno
-- soltanto come valore tecnico stabile: la UI mostra occurred_time, se esiste.
update public.transactions
set occurred_at = (
  (occurred_at at time zone 'UTC')::date::text || 'T12:00:00Z'
)::timestamptz
where source in ('file_import', 'ai_scan');
