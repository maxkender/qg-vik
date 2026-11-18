import { addDays, addMonths, dayKey, monday, monthKey, startOfDay, weekKey, yearKey } from "@/lib/dates";
import type { Owner } from "@/lib/members";
import type { Prio } from "@/lib/types";

export type QuickAdd = { title: string; prio?: Prio; owner?: Owner; bucket?: string };

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PRIO: Record<string, Prio> = {
  urgent: "urgent", u: "urgent", "!": "urgent",
  normal: "normal", afaire: "normal", n: "normal",
  "plus-tard": "later", plustard: "later", tard: "later", later: "later", l: "later",
};
const OWNER: Record<string, Owner> = {
  max: "max", maximilien: "max", m: "max",
  adrien: "adrien", a: "adrien",
  tous: "both", deux: "both", both: "both", nous: "both",
};
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Lit une ligne d'ajout rapide : « Appeler le comptable !urgent @adrien demain ».
 *   !urgent  !tard             → priorité
 *   @max  @adrien  @tous       → personne
 *   aujourd'hui, demain, lundi…dimanche, semaine, semaine prochaine, mois,
 *   mois prochain, année, inbox, vie, S48, 25/11 → horizon
 * Les mots de date ne sont reconnus qu'en fin de ligne, pour ne pas manger le titre.
 */
export function parseQuickAdd(input: string, today: Date): QuickAdd {
  const out: QuickAdd = { title: "" };
  const t = startOfDay(today);
  let words = input.trim().split(/\s+/).filter(Boolean);

  // Priorité et personne : n'importe où dans la ligne.
  words = words.filter((w) => {
    if (w.startsWith("!") && w.length > 1) {
      const p = PRIO[strip(w.slice(1))];
      if (p) {
        out.prio = p;
        return false;
      }
    }
    if (w.startsWith("@") && w.length > 1) {
      const o = OWNER[strip(w.slice(1))];
      if (o) {
        out.owner = o;
        return false;
      }
    }
    return true;
  });

  // Date : un ou deux derniers mots.
  const last = (n: number) => strip(words.slice(-n).join(" ")).replace(/[’']/g, "'");
  const take = (n: number, bucket: string) => {
    out.bucket = bucket;
    words = words.slice(0, -n);
  };
  const two = words.length >= 2 ? last(2) : "";
  const one = words.length >= 1 ? last(1) : "";

  if (two === "semaine prochaine") take(2, weekKey(addDays(monday(t), 7)));
  else if (two === "cette semaine") take(2, weekKey(t));
  else if (two === "mois prochain") take(2, monthKey(addMonths(t, 1)));
  else if (two === "ce mois") take(2, monthKey(t));
  else if (two === "cette annee") take(2, yearKey(t));
  else if (two === "annee prochaine") take(2, `y:${t.getFullYear() + 1}`);
  else if (one === "aujourd'hui" || one === "auj") take(1, dayKey(t));
  else if (one === "demain") take(1, dayKey(addDays(t, 1)));
  else if (one === "semaine") take(1, weekKey(t));
  else if (one === "mois") take(1, monthKey(t));
  else if (one === "annee") take(1, yearKey(t));
  else if (one === "inbox") take(1, "inbox");
  else if (one === "vie") take(1, "life");
  else if (WEEKDAYS.includes(one)) {
    // Prochain jour de ce nom (aujourd'hui exclu).
    const diff = (WEEKDAYS.indexOf(one) - t.getDay() + 7) % 7 || 7;
    take(1, dayKey(addDays(t, diff)));
  } else if (/^s\d{1,2}$/.test(one)) {
    const w = Number(one.slice(1));
    if (w >= 1 && w <= 53) take(1, `w:${t.getFullYear()}-W${String(w).padStart(2, "0")}`);
  } else if (/^\d{1,2}\/\d{1,2}$/.test(one)) {
    const [d, m] = one.split("/").map(Number);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let date = new Date(t.getFullYear(), m - 1, d);
      // Une date déjà bien passée veut dire l'an prochain.
      if (date.getTime() < addDays(t, -31).getTime()) date = new Date(t.getFullYear() + 1, m - 1, d);
      take(1, dayKey(date));
    }
  }

  out.title = words.join(" ").trim();
  return out;
}
