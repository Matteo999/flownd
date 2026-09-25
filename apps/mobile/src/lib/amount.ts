// Parsing degli importi digitati o incollati dall'utente, in formato italiano
// ("1.250,50") o internazionale ("1250.50", "1,250.50").

// Limite della colonna numeric(12, 2) usata per gli importi su Supabase.
export const MAX_AMOUNT = 9_999_999_999.99;

// Restituisce NaN se il testo non è un numero valido. Con allowThousands false
// (tassi, percentuali) il punto è sempre decimale: "3.125" resta 3,125.
export function parseDecimalInput(
  value: string,
  { allowThousands = true }: { allowThousands?: boolean } = {},
) {
  let normalized = value.replace(/[\s\u00a0€]/g, '');
  if (!normalized) return Number.NaN;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Entrambi presenti: l'ultimo è il separatore decimale.
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = normalized.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    const parts = normalized.split(',');
    // Più virgole ("1,250,000") sono separatori delle migliaia, a gruppi di tre.
    if (parts.length > 2) {
      if (!parts.slice(1).every((part) => part.length === 3)) return Number.NaN;
      normalized = parts.join('');
    } else {
      normalized = normalized.replace(',', '.');
    }
  } else if (lastDot >= 0 && allowThousands) {
    const parts = normalized.split('.');
    // "1.250" o "1.250.000": punti come migliaia (convenzione italiana).
    const thousandsOnly =
      parts.length > 2 || (parts[1].length === 3 && /^-?[1-9]\d{0,2}$/.test(parts[0]));
    if (thousandsOnly && parts.slice(1).every((part) => part.length === 3)) {
      normalized = parts.join('');
    }
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

// Importo arrotondato al centesimo; 0 se il testo non è valido.
export function parseEuroAmount(value: string) {
  const parsed = parseDecimalInput(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}
