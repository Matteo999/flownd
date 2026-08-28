-- La vecchia regola cercava "esso" come sottostringa e intercettava quindi
-- anche la parola italiana "presso" presente nelle causali dei pagamenti carta.
-- Correggiamo esclusivamente falsi positivi riconoscibili, senza ricategorizzare
-- movimenti modificati dall'utente o reali spese di trasporto.
update public.transactions
set category = case
  when description ~* '^[[:space:]]*amazon([.]it)?' then 'Shopping'
  when description ~* '^[[:space:]]*game[[:space:]]+7([[:space:]]|$)' then 'Shopping'
  when description ~* 'eurobrico' then 'Casa e utenze'
  else category
end
where source = 'open_banking'
  and category = 'Trasporti e Auto'
  and raw_description ~* '\mpresso\M'
  and (
    description ~* '^[[:space:]]*amazon([.]it)?'
    or description ~* '^[[:space:]]*game[[:space:]]+7([[:space:]]|$)'
    or description ~* 'eurobrico'
  );
