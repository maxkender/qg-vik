/**
 * Dates et « horizons » du QG.
 * Un horizon (bucket) est : inbox | life | d:2026-11-18 | w:2026-W47 | m:2026-11 | y:2026
 * Semaines ISO, lundi → dimanche. Tout est en heure locale du navigateur.
 */

export const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const DAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, "0");

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
/** Lundi de la semaine de d. */
export function monday(d: Date): Date {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}
/** [année ISO, numéro de semaine ISO] */
export function isoWeek(d: Date): [number, number] {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7);
  return [year, week];
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayKey = (d: Date) => `d:${isoDate(d)}`;
export const weekKey = (d: Date) => {
  const [y, w] = isoWeek(d);
  return `w:${y}-W${pad(w)}`;
};
export const monthKey = (d: Date) => `m:${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const yearKey = (d: Date) => `y:${d.getFullYear()}`;

export type BucketKind = "inbox" | "life" | "d" | "w" | "m" | "y";
export type ParsedBucket = { kind: BucketKind; start: Date | null; end: Date | null };

/** Début et fin (dernier jour inclus) de la période d'un horizon. */
export function parseBucket(bucket: string): ParsedBucket {
  if (bucket === "inbox" || bucket === "life") return { kind: bucket, start: null, end: null };
  const kind = bucket[0] as BucketKind;
  const v = bucket.slice(2);
  if (kind === "d") {
    const [y, m, d] = v.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    return { kind, start, end: start };
  }
  if (kind === "w") {
    const [y, w] = v.split("-W").map(Number);
    // Le 4 janvier est toujours en semaine 1.
    const start = addDays(monday(new Date(y, 0, 4)), (w - 1) * 7);
    return { kind, start, end: addDays(start, 6) };
  }
  if (kind === "m") {
    const [y, m] = v.split("-").map(Number);
    return { kind, start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  if (kind === "y") {
    const y = Number(v);
    return { kind, start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  }
  return { kind: "inbox", start: null, end: null };
}

/** En retard : la période de l'horizon est entièrement passée. */
export function isLate(bucket: string, today: Date): boolean {
  const { end } = parseBucket(bucket);
  return end !== null && end.getTime() < startOfDay(today).getTime();
}

/** « 16–22 nov. » ou « 30 nov.–6 déc. » */
export function weekRange(start: Date): string {
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
    : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
}

/** « mercredi 18 novembre » */
export const longDate = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** Étiquette courte d'un horizon : « Aujourd'hui », « Demain », « jeu. 19 nov. », « S47 », « Novembre », « 2027 ». */
export function bucketLabel(bucket: string, today: Date): string {
  if (bucket === "inbox") return "Inbox";
  if (bucket === "life") return "Vie";
  const { kind, start } = parseBucket(bucket);
  if (!start) return bucket;
  const t = startOfDay(today);
  if (kind === "d") {
    const diff = Math.round((start.getTime() - t.getTime()) / 864e5);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Demain";
    if (diff === -1) return "Hier";
    return `${DAYS_SHORT[start.getDay()]} ${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}`;
  }
  if (kind === "w") {
    const [y, w] = isoWeek(start);
    return y === isoWeek(t)[0] ? `S${w}` : `S${w} ${y}`;
  }
  if (kind === "m") {
    const name = cap(MONTHS[start.getMonth()]);
    return start.getFullYear() === t.getFullYear() ? name : `${name} ${start.getFullYear()}`;
  }
  return String(start.getFullYear());
}

/** Ordre chronologique approximatif d'un horizon (pour trier « du plus proche au plus lointain »). */
export function bucketRank(bucket: string): number {
  if (bucket === "inbox") return Number.MAX_SAFE_INTEGER - 1;
  if (bucket === "life") return Number.MAX_SAFE_INTEGER;
  const { end } = parseBucket(bucket);
  return end ? end.getTime() : Number.MAX_SAFE_INTEGER - 2;
}
