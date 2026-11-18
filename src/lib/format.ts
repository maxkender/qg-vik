const nbsp = " ";
const thin = " ";

/** 12 345 € */
export const eur = (n: number | null | undefined, digits = 0) =>
  n == null ? "–" : n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + nbsp + "€";
/** 8,9 % (à partir d'une fraction 0.089) */
export const pct = (n: number | null | undefined, digits = 1) =>
  n == null ? "–" : (n * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits }) + nbsp + "%";
/** 21,9 M · 14 k */
export const big = (n: number | null | undefined) =>
  n == null
    ? "–"
    : Math.abs(n) >= 1e6
      ? (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + nbsp + "M"
      : Math.abs(n) >= 1e3
        ? (n / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(n) >= 1e4 ? 0 : 1 }) + nbsp + "k"
        : n.toLocaleString("fr-FR");
export const int = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("fr-FR"));
/** Variation relative entre deux valeurs, ou null si non calculable. */
export const change = (now: number | null | undefined, before: number | null | undefined) =>
  now == null || before == null || before === 0 ? null : (now - before) / Math.abs(before);
export const signedPct = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 100)) + thin + "%";
/** 18/11 à partir de 2026-11-18 */
export const shortDate = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
