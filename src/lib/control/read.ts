/**
 * Ce que le QG lit dans les réponses de l'OS (/api/qg/control/*). Lecture tolérante : noms anglais ou français,
 * et tout ce qui manque reste vide (null), jamais zéro. Le format attendu est décrit dans docs/control-os.md.
 */
type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const list = (...values: unknown[]): Raw[] => {
  for (const v of values) if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Raw[];
  return [];
};
const num = (...values: unknown[]) => {
  for (const v of values) if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const str = (...values: unknown[]) => {
  for (const v of values) if ((typeof v === "string" && v.trim()) || typeof v === "number") return String(v).trim();
  return null;
};

// ---------------------------------------------------------------- recrutement
export type Verdict = "vert" | "orange" | "rouge";
export type Recruitment = {
  cohort: { name: string | null; start: string | null; target: number | null; ready: number | null; pct: number | null; verdict: Verdict | null };
  funnel: { label: string; count: number | null; previous: number | null }[];
  blocked: { label: string; count: number | null; oldestDays: number | null; reason: string | null }[];
  byCountry: { country: string | null; hm: string | null; target: number | null; ready: number | null; inProgress: number | null; blocked: number | null }[];
  channels: { name: string; status: "ok" | "attention" | "panne" | null; applicants: number | null; hired: number | null; note: string | null }[];
};
/** Vert si au moins 80 % de l'objectif est prêt, orange entre 50 et 80 %, rouge en dessous. */
export const verdictOf = (pct: number | null): Verdict | null => (pct === null ? null : pct >= 0.8 ? "vert" : pct >= 0.5 ? "orange" : "rouge");
const health = (v: string | null) => (!v ? null : /^(ok|good|healthy|vert|green)/i.test(v) ? "ok" : /^(down|ko|panne|rouge|red|dead)/i.test(v) ? "panne" : "attention");

export function readRecruitment(payload: unknown): Recruitment {
  const p = obj(payload);
  const c = obj(p.cohort ?? p.next_cohort ?? p.cohorte);
  const target = num(c.target, c.objectif), ready = num(c.ready, c.prets, c.ready_count);
  const pct = target && ready !== null ? ready / target : null;
  return {
    cohort: { name: str(c.name, c.nom, c.label), start: str(c.start_date, c.start, c.date), target, ready, pct, verdict: verdictOf(pct) },
    funnel: list(p.funnel, p.entonnoir).map((s) => ({ label: str(s.label, s.step, s.etape) ?? "?", count: num(s.count, s.nombre), previous: num(s.previous, s.previous_count, s.precedent) })),
    blocked: list(p.blocked, p.bloques).map((s) => ({ label: str(s.label, s.step, s.etape) ?? "?", count: num(s.count, s.nombre), oldestDays: num(s.oldest_days, s.max_days, s.jours), reason: str(s.reason, s.raison) })),
    byCountry: list(p.by_country, p.by_country_hm, p.pays).map((r) => ({ country: str(r.country, r.pays), hm: str(r.hm, r.hiring_manager), target: num(r.target, r.objectif), ready: num(r.ready, r.prets), inProgress: num(r.in_progress, r.en_cours), blocked: num(r.blocked, r.bloques) })),
    channels: list(p.channels, p.canaux).map((r) => ({ name: str(r.name, r.channel, r.canal) ?? "?", status: health(str(r.status, r.health, r.etat)), applicants: num(r.applicants_7d, r.applicants, r.candidats), hired: num(r.hired_7d, r.hired, r.recrutes), note: str(r.note, r.detail) })),
  };
}

// ----------------------------------------------------------------------- paie
export type Payroll = {
  calendar: { date: string; type: string; label: string; count: number | null }[];
  check: { week: string | null; expected: number | null; paid: number | null; gap: number | null; currency: string; lines: { label: string; expected: number | null; paid: number | null; gap: number | null; reason: string | null }[] } | null;
  complaints: { id: string; poster: string | null; date: string | null; message: string | null; expected: number | null; paid: number | null; verdict: string | null; status: string | null }[];
  counters: { label: string; value: string }[];
};
const gapOf = (expected: number | null, paid: number | null, given: number | null) => given ?? (expected !== null && paid !== null ? Math.round((paid - expected) * 100) / 100 : null);

export function readPayroll(payload: unknown): Payroll {
  const p = obj(payload);
  const m = obj(p.monday_check ?? p.check ?? p.verification);
  const hasCheck = Object.keys(m).length > 0;
  const expected = num(m.expected, m.attendu), paid = num(m.paid, m.paye);
  const counters = p.counters ?? p.compteurs;
  return {
    calendar: list(p.calendar, p.calendrier).map((e) => ({ date: str(e.date, e.day) ?? "", type: str(e.type, e.kind) ?? "autre", label: str(e.label, e.title, e.titre) ?? "", count: num(e.count, e.nombre) })).filter((e) => e.date),
    check: hasCheck
      ? { week: str(m.week, m.semaine), expected, paid, gap: gapOf(expected, paid, num(m.gap, m.ecart)), currency: str(m.currency, m.devise) ?? "USD",
          lines: list(m.lines, m.lignes, m.details).map((l) => { const e = num(l.expected, l.attendu), d = num(l.paid, l.paye); return { label: str(l.label, l.poster, l.name) ?? "?", expected: e, paid: d, gap: gapOf(e, d, num(l.gap, l.ecart)), reason: str(l.reason, l.raison) }; }) }
      : null,
    complaints: list(p.complaints, p.plaintes).map((c, i) => { const slip = obj(c.payslip ?? c.fiche); return { id: str(c.id) ?? String(i), poster: str(c.poster, c.posteur, c.name), date: str(c.date, c.created_at), message: str(c.message, c.text, c.plainte), expected: num(slip.expected, c.expected, slip.attendu), paid: num(slip.paid, c.paid, slip.paye), verdict: str(c.verdict, c.match), status: str(c.status, c.statut) }; }),
    counters: Array.isArray(counters)
      ? list(counters).map((c) => ({ label: str(c.label, c.name) ?? "?", value: str(c.value, c.count) ?? "–" }))
      : Object.entries(obj(counters)).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => ({ label: k.replace(/_/g, " "), value: typeof v === "number" ? v.toLocaleString("fr-FR") : String(v) })),
  };
}

// ------------------------------------------------------------------ problèmes
export type Issue = { id: string; title: string; severity: "critique" | "haute" | "moyenne" | "basse"; status: string | null; since: string | null; detail: string | null; fix: string | null; prompt: string };
const SEVERITY = { critique: 0, haute: 1, moyenne: 2, basse: 3 } as const;
const severity = (v: string | null): Issue["severity"] => (!v ? "moyenne" : /^(crit|urgent|p0|blocker)/i.test(v) ? "critique" : /^(high|haut|major|p1|élev|elev)/i.test(v) ? "haute" : /^(low|bas|faible|minor|p3)/i.test(v) ? "basse" : "moyenne");
const isOpen = (status: string | null) => !status || !/^(done|fixed|resolved|closed|résolu|resolu|corrig|ferm)/i.test(status);

export function readIssues(payload: unknown): Issue[] {
  const p = obj(payload);
  return list(payload, p.issues, p.problems, p.problemes)
    .map((r, i) => {
      const title = str(r.title, r.titre, r.name) ?? "Problème sans titre";
      const detail = str(r.detail, r.description, r.details), fix = str(r.expected_fix, r.fix, r.correction, r.correction_attendue);
      // Prêt à coller dans l'OS : le problème, puis la correction attendue.
      const prompt = str(r.prompt) ?? [`Problème : ${title}`, detail, fix ? `Correction attendue : ${fix}` : "Correction attendue : trouve la cause, corrige-la, et dis-moi ce que tu as changé."].filter(Boolean).join("\n\n");
      return { id: str(r.id) ?? String(i), title, severity: severity(str(r.severity, r.gravite, r.priority)), status: str(r.status, r.statut), since: str(r.since, r.first_seen, r.created_at, r.depuis), detail, fix, prompt };
    })
    .filter((x) => isOpen(x.status))
    .sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || (a.since ?? "").localeCompare(b.since ?? ""));
}

// ------------------------------------------------- ce qui demande ton attention
export type Kind = "recrutement" | "paie" | "problemes";
export type ControlData = Record<Kind, { payload: unknown; fetchedAt: string | null; downSince: string | null; configured: boolean }>;
export type Attention = { lines: { tone: "bad" | "warn" | "good" | "none"; text: string }[]; count: number };

const ago = (iso: string, now: number) => {
  const min = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} j`;
};
/** « données indisponibles depuis X », ou rien si la source répond. */
export function unavailable(d: ControlData[Kind], now: number): string | null {
  if (!d.configured) return "données indisponibles : l'OS n'est pas encore branché";
  if (d.downSince) return `données indisponibles depuis ${ago(d.downSince, now)}`;
  return d.payload === null ? "données indisponibles : pas encore de relevé" : null;
}

export function attention(data: ControlData, now: number): Attention {
  const lines: Attention["lines"] = [];
  let count = 0;
  const off = (k: Kind, name: string) => { const u = unavailable(data[k], now); if (u) lines.push({ tone: "none", text: `${name} : ${u}.` }); return Boolean(u); };
  if (!off("recrutement", "Recrutement")) {
    const { cohort, blocked } = readRecruitment(data.recrutement.payload);
    const stuck = blocked.reduce((a, b) => a + (b.count ?? 0), 0);
    if (cohort.verdict && cohort.verdict !== "vert") count++;
    lines.push(cohort.pct === null ? { tone: "none", text: "Recrutement : objectif de la prochaine cohorte inconnu." } : { tone: cohort.verdict === "vert" ? "good" : cohort.verdict === "orange" ? "warn" : "bad", text: `Recrutement : ${cohort.ready} prêts sur ${cohort.target} pour ${cohort.name ?? "la prochaine cohorte"} (${Math.round(cohort.pct * 100)} %)${stuck ? `, ${stuck} bloqués` : ""}.` });
  }
  if (!off("paie", "Paie")) {
    const { check, complaints } = readPayroll(data.paie.payload);
    const open = complaints.filter((c) => isOpen(c.status)).length;
    const gap = check?.gap ?? null;
    if (gap) count++;
    if (open) count++;
    lines.push({ tone: gap ? "bad" : open ? "warn" : gap === 0 ? "good" : "none", text: `Paie : ${gap === null ? "vérification du lundi indisponible" : gap === 0 ? "le lundi tombe juste" : `écart de ${Math.abs(gap).toLocaleString("fr-FR")} ${check!.currency === "EUR" ? "€" : "$"} lundi`}${open ? `, ${open} plainte${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""}` : ""}.` });
  }
  if (!off("problemes", "Autres problèmes")) {
    const issues = readIssues(data.problemes.payload);
    const hot = issues.filter((i) => i.severity === "critique" || i.severity === "haute");
    count += hot.length;
    lines.push({ tone: hot.length ? "bad" : issues.length ? "warn" : "good", text: issues.length ? `Autres problèmes : ${issues.length} ouvert${issues.length > 1 ? "s" : ""}${hot.length ? `, dont ${hot.length} grave${hot.length > 1 ? "s" : ""} (${hot[0].title})` : ""}.` : "Autres problèmes : aucun ouvert." });
  }
  return { lines, count };
}
export { isOpen };
