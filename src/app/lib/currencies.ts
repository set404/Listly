// Keep in sync with Listly-BE's src/lib/validation.ts CURRENCY_CODES —
// there's no shared package between the two apps, so this list is duplicated.
export const CURRENCIES = ["USD", "EUR", "AMD"] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

// Intl only resolves a currency to its actual symbol (rather than the bare
// ISO code) under locales where CLDR defines one — e.g. AMD only gets "֏"
// under "hy", and still falls back to "AMD" under "en". Since the app's UI
// language shouldn't change how a currency itself is written, these are
// hardcoded instead of going through Intl.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", AMD: "֏",
};

// The bare currency symbol (e.g. "$", "€", "֏") for compact UI like the
// currency picker, where there's no room for a full formatted amount.
export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    // Let Intl decide the locale-correct number formatting (grouping, decimal
    // separator, and where the currency sign goes), but substitute our own
    // symbol for the "currency" part — Intl's own choice of symbol depends on
    // the *display* locale, not the currency, so AMD only gets "֏" under a
    // "hy" locale and otherwise falls back to the bare code "AMD".
    const symbol = currencySymbol(currency);
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      // Drop a trailing ".00" for whole amounts (e.g. "$100" not "$100.00"),
      // while still showing cents when the amount actually has them.
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).formatToParts(amount);
    return parts.map((p) => (p.type === "currency" ? symbol : p.value)).join("");
  } catch {
    return `${amount} ${currency}`;
  }
}
