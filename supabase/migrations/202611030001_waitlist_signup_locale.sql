-- Lingua del browser al momento dell'iscrizione (tag BCP 47, es. "it-IT"),
-- per scrivere l'avviso di lancio nella lingua giusta quando l'app ne avrà più
-- d'una. Null per le iscrizioni precedenti o se il browser non la comunica.

alter table public.waitlist_signups
  add column if not exists locale text
    check (locale is null or char_length(locale) between 2 and 35);
