/**
 * Control : ce que le QG tire des réponses de l'OS (/api/qg/control/recruitment, /payroll, /issues).
 * Les réponses brutes sont grosses et nominatives : on en fait ici des vues compactes, côté serveur.
 * Tout ce qui manque reste vide (null), jamais zéro.
 */
type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown) => ((typeof v === "string" && v.trim()) || typeof v === "number" ? String(v).trim() : null);
const DAY = 864e5;
const daysSince = (iso: string | null, now: number) => (iso && !Number.isNaN(new Date(iso).getTime()) ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

// ---------------------------------------------------------------- recrutement
export type Channel = "ruul" | "upwork";
export const CHANNEL_NAME: Record<Channel, string> = { ruul: "Ruul", upwork: "Upwork" };
const STEP: Record<string, string> = {
  candidature: "Candidature", offre_acceptee: "Offre acceptée", acceptee: "Acceptée", signee: "Contrat signé", profil_os: "Profil dans l'OS", ajoute_ruul: "Ajouté sur Ruul", pret_ruul: "Ruul prêt",
  connexion: "Connexion au dashboard", slack: "Slack rejoint", compte_tiktok: "Compte TikTok", warmup: "Warm-up", abonnements_5: "5 abonnements", premier_post: "Premier post", premiere_paie: "Première paie",
};
export const stepLabel = (s: string) => STEP[s] ?? s.replace(/_/g, " ");
export type Verdict = "vert" | "orange" | "rouge";
/** Vert si au moins 80 % de l'objectif est prêt, orange entre 50 et 80 %, rouge en dessous. */
export const verdictOf = (pct: number | null): Verdict | null => (pct === null ? null : pct >= 0.8 ? "vert" : pct >= 0.5 ? "orange" : "rouge");

type Group = { key: string; recrues: number | null; connexion: number | null; warmup: number | null; premierPost: number | null };
export type RecruitmentView = {
  cohort: string | null; previousCohort: string | null;
  /** « Prêt » = a publié son premier post. L'objectif vient de l'OS (vide tant qu'il n'y est pas saisi). */
  target: number | null; ready: number | null; pct: number | null; verdict: Verdict | null;
  stopped: number; stoppedReasons: { reason: string; count: number }[];
  channels: Record<Channel, {
    total: number | null;
    funnel: { step: string; n: number | null; previous: number | null }[];
    blocked: { step: string; count: number; oldestDays: number | null; names: string[] }[];
    byCountry: Group[]; byHm: Group[];
  }>;
  health: { name: string; tone: "ok" | "attention" | "panne"; facts: { label: string; value: string }[]; note: string | null }[];
};

const WORDS: [RegExp, string][] = [[/envoyees/g, "envoyées"], [/envoyes/g, "envoyés"], [/livres/g, "livrés"], [/refuses/g, "refusés"], [/reussis/g, "réussis"], [/echecs/g, "échecs"], [/echec/g, "échec"], [/bloque/g, "bloqué"], [/perime/g, "périmé"]];
const pretty = (s: string) => WORDS.reduce((t, [from, to]) => t.replace(from, to), s);
const HEALTH_NAME: Record<string, string> = { emails: "E-mails", nudges: "Relances automatiques", relances: "Relances", whatsapp: "WhatsApp" };
function healthOf(name: string, value: unknown): RecruitmentView["health"][number] {
  const facts: { label: string; value: string }[] = [];
  const errors: string[] = [];
  let failures = 0;
  const walk = (o: Raw, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      const label = `${prefix}${k.replace(/_/g, " ")}`;
      if (typeof v === "number") { if (/erreur|echec/i.test(k)) failures += v; if (v !== 0) facts.push({ label: pretty(label), value: v.toLocaleString("fr-FR") }); }
      else if (typeof v === "string" && v.length < 40 && !/^\d{4}-\d\d-\d\dT/.test(v)) facts.push({ label, value: v });
      else if (Array.isArray(v)) {
        if (/echec|erreur|refus/i.test(k)) { failures += v.length; arr(v).forEach((e) => { const m = str(e.erreur) ?? str(e.error); if (m) errors.push(m); }); }
      } else if (v && typeof v === "object" && depth < 2) walk(v as Raw, `${k.replace(/_/g, " ")} · `, depth + 1);
    }
  };
  const o = obj(value);
  walk(o, "", 0);
  const sent = num(o.envoyes), refused = num(o.refuses);
  const rate = sent && refused !== null ? refused / sent : null;
  const top = [...errors.reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0];
  const note = rate !== null && rate > 0.1 ? `${Math.round(rate * 100)} % des envois refusés` : top ? `${top[0]} (× ${top[1]})` : null;
  return { name: HEALTH_NAME[name] ?? name.replace(/_/g, " "), tone: rate !== null ? (rate > 0.25 ? "panne" : rate > 0.1 ? "attention" : "ok") : failures > 0 ? "attention" : "ok", facts: facts.slice(0, 5), note };
}

export function readRecruitment(payload: unknown, now: number): RecruitmentView {
  const p = obj(payload);
  const prev = obj(p.precedente);
  const channel = (c: Channel): RecruitmentView["channels"][Channel] => {
    const before = new Map(arr(obj(prev.entonnoir)[c]).map((s) => [str(s.etape), num(s.n)]));
    const groups = (list: unknown, key: string): Group[] =>
      arr(list).map((g) => { const e = obj(g.etapes); return { key: str(g[key]) ?? "–", recrues: num(g.recrues), connexion: num(e.connexion), warmup: num(e.warmup), premierPost: num(e.premier_post) }; }).sort((a, b) => (b.recrues ?? 0) - (a.recrues ?? 0));
    return {
      total: num(obj(p.totaux)[c]),
      funnel: arr(obj(p.entonnoir)[c]).map((s) => ({ step: str(s.etape) ?? "?", n: num(s.n), previous: before.get(str(s.etape)) ?? null })),
      blocked: Object.entries(obj(obj(p.bloques)[c])).map(([step, people]) => {
        const list = arr(people);
        // Ancienneté : depuis l'entrée de la personne dans le parcours (candidature ou offre acceptée).
        const ages = list.map((x) => daysSince(str(obj(x.etapes).candidature) ?? str(obj(x.etapes).offre_acceptee), now)).filter((d): d is number => d !== null);
        return { step, count: list.length, oldestDays: ages.length ? Math.max(...ages) : null, names: list.slice(0, 4).map((x) => str(x.nom) ?? "?") };
      }).filter((b) => b.count > 0).sort((a, b) => b.count - a.count),
      byCountry: groups(obj(p.par_pays)[c], "pays"), byHm: groups(obj(p.par_hm)[c], "hm"),
    };
  };
  const channels = { ruul: channel("ruul"), upwork: channel("upwork") };
  const posted = (["ruul", "upwork"] as const).map((c) => channels[c].funnel.find((s) => s.step === "premier_post")?.n ?? null);
  const ready = posted.some((v) => v !== null) ? posted.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
  const goals = arr(p.objectifs).map((o) => num(o.objectif) ?? num(o.target) ?? num(o.nombre) ?? num(o.n)).filter((v): v is number => v !== null);
  const target = goals.length ? goals.reduce((a, v) => a + v, 0) : num(p.objectif);
  const pct = target && ready !== null ? ready / target : null;
  const reasons = arr(p.arretes).reduce((m, x) => m.set(str(x.raison) ?? "autre", (m.get(str(x.raison) ?? "autre") ?? 0) + 1), new Map<string, number>());
  return {
    cohort: str(p.cohorte), previousCohort: str(prev.cohorte), target, ready, pct, verdict: verdictOf(pct),
    stopped: arr(p.arretes).length, stoppedReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    channels, health: Object.entries(obj(p.sante_canaux)).map(([k, v]) => healthOf(k, v)),
  };
}

// ----------------------------------------------------------------------- paie
export type PayrollView = {
  week: string | null; paidOn: string | null; currency: string;
  totals: { expected: number | null; paid: number | null; gap: number | null; posters: number | null; withGap: number | null };
  /** Ce que contient cette paie : doublements, bonus, Comment Masters, et les cas à part. */
  included: { doublements: number; bonus: { count: number; total: number }; commentMasters: { count: number; total: number }; kills: number; toCheck: number };
  gaps: { name: string; country: string | null; channel: string | null; expected: number | null; paid: number | null; gap: number; reason: string | null }[];
  complaints: { id: string; date: string | null; name: string | null; text: string | null; category: string | null; level: string | null; open: boolean; status: string | null; expected: number | null; paid: number | null; gap: number | null }[];
};
export function readPayroll(payload: unknown): PayrollView {
  const p = obj(payload);
  const t = obj(p.totaux);
  const posters = arr(p.posteurs);
  const expected = (x: Raw) => obj(x.attendu);
  const sumOf = (key: string) => { const list = posters.map((x) => num(expected(x)[key]) ?? 0).filter((v) => v > 0); return { count: list.length, total: Math.round(list.reduce((a, v) => a + v, 0) * 100) / 100 }; };
  return {
    week: str(p.semaine), paidOn: str(p.paye_le), currency: str(p.devise) ?? "USD",
    totals: { expected: num(t.attendu), paid: num(t.paye), gap: num(t.ecart), posters: num(t.posteurs), withGap: num(t.avec_ecart) },
    included: {
      doublements: posters.filter((x) => expected(x).doublement === true).length, bonus: sumOf("bonus"), commentMasters: sumOf("comment_master"),
      kills: posters.filter((x) => expected(x).action === "kill").length, toCheck: posters.filter((x) => expected(x).action === "a_verifier").length,
    },
    gaps: posters.filter((x) => num(x.ecart)).map((x) => {
      const e = expected(x), action = str(e.action);
      return { name: str(x.nom) ?? "?", country: str(x.pays), channel: str(x.canal), expected: num(e.total), paid: num(obj(x.paye).total), gap: num(x.ecart)!, reason: str(e.raison_regle) ?? (action && action !== "payer" ? `Action prévue : ${action.replace(/_/g, " ")}` : null) };
    }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)),
    complaints: arr(p.plaintes_7j).map((c, i) => {
      const slip = obj(c.paie_semaine), status = str(c.statut);
      return { id: str(c.id) ?? String(i), date: str(c.le), name: str(c.nom), text: str(c.texte)?.replace(/\s+/g, " ").slice(0, 260) ?? null, category: str(c.categorie), level: str(c.niveau), open: status !== "resolu", status, expected: num(slip.attendu), paid: num(slip.paye), gap: num(slip.ecart) };
    }).sort((a, b) => Number(b.open) - Number(a.open) || (b.date ?? "").localeCompare(a.date ?? "")),
  };
}

// ------------------------------------------------------------------ problèmes
export type Severity = "critique" | "haute" | "moyenne" | "basse";
export type Issue = { id: string; title: string; severity: Severity; status: string; since: string | null; detail: string | null; prompt: string };
const RANK: Record<Severity, number> = { critique: 0, haute: 1, moyenne: 2, basse: 3 };
const names = (list: Raw[], key: string, max = 8) => { const all = list.map((x) => str(x[key])).filter(Boolean); return all.length ? `${all.slice(0, max).join(", ")}${all.length > max ? `, et ${all.length - max} autres` : ""}` : null; };

export function readIssues(payload: unknown): Issue[] {
  const p = obj(payload);
  const out: Issue[] = [];
  const add = (id: string, severity: Severity, title: string, o: { detail?: string | null; since?: string | null; status?: string; fix: string }) =>
    out.push({ id, severity, title, status: o.status ?? "ouvert", since: o.since ?? null, detail: o.detail ?? null, prompt: [`Problème : ${title}`, o.detail, `Correction attendue : ${o.fix}`].filter(Boolean).join("\n\n") });

  const crons = obj(p.crons);
  arr(crons.en_echec_24h).forEach((c, i) => add(`cron-${str(c.job) ?? i}`, "critique", `Tâche planifiée en échec : ${str(c.job) ?? "?"}`, { detail: str(c.message) ?? str(c.erreur) ?? str(c.statut), since: str(c.dernier), fix: "Trouve pourquoi cette tâche échoue, corrige-la, relance-la et rattrape ce qu'elle a manqué." }));
  const bots = obj(p.bots);
  arr(bots.taches).filter((t) => t.en_erreur === true || t.en_retard === true).forEach((t) => {
    const job = str(t.job) ?? str(t.tache) ?? "?";
    add(`bot-${job}`, "haute", `Robot ${job} ${t.en_erreur === true ? "en erreur" : "en retard"}`, { detail: str(t.message) ?? (str(t.dernier_at) ? null : "Aucun passage enregistré."), since: str(t.dernier_at), fix: "Vérifie pourquoi ce robot n'est pas passé à l'heure, relance-le et confirme que le passage suivant est planifié." });
  });
  [obj(bots.upwork), ...arr(bots.upwork_comptes)].forEach((u, i) => {
    const who = str(u.compte) ? `compte ${str(u.compte)}` : "connexion";
    if (u.alerte === true || u.limite === true || str(u.derniere_erreur)) add(`upwork-${i}`, "haute", `Upwork (${who}) : ${u.limite === true ? "limite atteinte" : "alerte"}`, { detail: str(u.derniere_erreur) ?? str(u.renouvellement_erreur), fix: "Rétablis la connexion Upwork et vérifie que les appels repassent." });
    else if (u.expire_bientot === true) add(`upwork-exp-${i}`, "moyenne", `Upwork (${who}) : l'accès expire bientôt`, { since: null, fix: "Renouvelle l'accès Upwork avant son expiration." });
  });
  const kills = obj(p.kills_non_finis);
  const control = arr(kills.controle);
  [...new Set(control.map((k) => str(k.libelle) ?? "Kill non terminé"))].forEach((label) => {
    const list = control.filter((k) => (str(k.libelle) ?? "Kill non terminé") === label);
    add(`kill-${label}`, "haute", `${plural(list.length, "posteur")} : ${label.charAt(0).toLowerCase()}${label.slice(1)}`, { detail: names(list, "nom"), fix: "Termine ces kills : clôture ce qui reste ouvert (contrat, accès) pour chaque posteur listé, puis confirme-le." });
  });
  (["arrets", "kills_auto"] as const).forEach((k) => { const list = arr(kills[k]); if (list.length) add(`kill-${k}`, "haute", `${plural(list.length, k === "arrets" ? "arrêt non terminé" : "kill automatique non terminé", k === "arrets" ? "arrêts non terminés" : "kills automatiques non terminés")}`, { detail: names(list, "nom"), fix: "Termine ces kills jusqu'au bout et dis-moi ce qui bloquait." }); });
  const support = obj(p.support_en_retard);
  const late48 = num(support.plus_de_48h) ?? 0, late24 = num(support.plus_de_24h) ?? 0;
  if (late24 > 0) {
    const levels = Object.entries(obj(support.par_niveau)).map(([k, v]) => `${k} ${v}`).join(", ");
    add("support", late48 > 0 ? "haute" : "moyenne", late48 > 0 ? `${plural(late48, "message")} de posteurs sans réponse depuis plus de 48 h` : `${plural(late24, "message")} de posteurs sans réponse depuis plus de 24 h`, { detail: `${late24} depuis plus de 24 h${levels ? ` · en attente chez : ${levels}` : ""}.`, since: arr(support.plus_anciens).map((x) => str(x.le)).filter(Boolean).sort()[0] ?? null, fix: "Liste ces messages par ancienneté, réponds à ceux que le bot peut traiter et remonte les autres à la bonne personne." });
  }
  // Un même incident revient souvent plusieurs jours de suite : on le montre une fois.
  const incidents = new Map<string, { posters: number; days: string[]; category: string | null; ticket: boolean }>();
  arr(p.incidents).forEach((x) => { const title = str(x.titre) ?? "Incident"; const cur = incidents.get(title) ?? { posters: 0, days: [], category: str(x.categorie), ticket: false }; cur.posters += num(x.posteurs) ?? 0; if (str(x.jour)) cur.days.push(str(x.jour)!); cur.ticket ||= Boolean(x.ticket_at); incidents.set(title, cur); });
  incidents.forEach((x, title) => add(`incident-${title}`, x.posters >= 5 ? "haute" : x.posters >= 2 ? "moyenne" : "basse", title, { detail: `${plural(x.posters, "posteur")} concerné${x.posters > 1 ? "s" : ""}${x.days.length > 1 ? `, signalé ${x.days.length} jours` : ""}${x.category ? ` · ${x.category.replace(/_/g, " ")}` : ""}.`, since: x.days.sort()[0] ?? null, status: x.ticket ? "ticket ouvert" : "sans ticket", fix: "Trouve la cause, corrige-la pour tous les posteurs concernés et dis-moi ce que tu as changé." }));
  const shadow = arr(p.shadowban_probable);
  if (shadow.length) add("shadowban", "moyenne", `${plural(shadow.length, "compte")} en shadowban probable`, { detail: names(shadow, "handle"), since: shadow.map((x) => str(x.depuis)).filter(Boolean).sort()[0] ?? null, fix: "Vérifie ces comptes et propose pour chacun : attendre, changer de contenu, ou le remplacer." });
  const noPost = arr(obj(p.posts_du_jour).comptes_actifs_sans_post_prevu);
  if (noPost.length) add("sans-post", "moyenne", `${plural(noPost.length, "compte actif", "comptes actifs")} sans post prévu aujourd'hui`, { detail: names(noPost, "handle"), since: str(p.jour), fix: "Planifie les posts manquants pour ces comptes et explique pourquoi ils n'en avaient pas." });
  const lost = arr(p.comptes_introuvables);
  if (lost.length) add("introuvables", "moyenne", `${plural(lost.length, "compte TikTok introuvable", "comptes TikTok introuvables")}`, { detail: names(lost, "handle"), since: lost.map((x) => str(x.introuvable_at)).filter(Boolean).sort()[0] ?? null, fix: "Retrouve le nouveau nom de ces comptes ou marque-les comme perdus, et préviens les posteurs." });
  const tickets = arr(p.tickets_ouverts);
  if (tickets.length) add("tickets", "basse", `${plural(tickets.length, "ticket ouvert", "tickets ouverts")}`, { detail: [...new Set(tickets.map((x) => str(x.statut)?.replace(/_/g, " ")).filter(Boolean))].join(", ") || null, since: tickets.map((x) => str(x.ticket_at)).filter(Boolean).sort()[0] ?? null, fix: "Fais avancer ces tickets ou ferme ceux qui sont réglés." });
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.since ?? "9").localeCompare(b.since ?? "9"));
}

// ------------------------------------------------- ce qui demande ton attention
export type Kind = "recrutement" | "paie" | "problemes";
type Meta = { fetchedAt: string | null; downSince: string | null; configured: boolean };
export type ControlData = { recrutement: Meta & { view: RecruitmentView | null }; paie: Meta & { view: PayrollView | null }; problemes: Meta & { view: Issue[] | null } };
export type Attention = { lines: { tone: "bad" | "warn" | "good" | "none"; text: string }[]; count: number };

const ago = (iso: string, now: number) => { const min = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60000)); return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} j`; };
/** « données indisponibles depuis X », ou rien si la source répond. */
export function unavailable(d: Meta & { view: unknown }, now: number): string | null {
  if (!d.configured) return "données indisponibles : l'OS n'est pas encore branché";
  if (d.downSince) return `données indisponibles depuis ${ago(d.downSince, now)}`;
  return d.view === null ? "données indisponibles : pas encore de relevé" : null;
}
const money = (v: number, currency: string) => `${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency === "EUR" ? "€" : "$"}`;

export function attention(data: ControlData, now: number): Attention {
  const lines: Attention["lines"] = [];
  let count = 0;
  const off = (k: Kind, name: string) => { const u = unavailable(data[k], now); if (u) lines.push({ tone: "none", text: `${name} : ${u}.` }); return Boolean(u); };
  if (!off("recrutement", "Recrutement")) {
    const r = data.recrutement.view!;
    const stuck = (["ruul", "upwork"] as const).reduce((a, c) => a + r.channels[c].blocked.reduce((x, b) => x + b.count, 0), 0);
    if (r.verdict && r.verdict !== "vert") count++;
    lines.push({ tone: r.verdict === "vert" ? "good" : r.verdict === "orange" ? "warn" : r.verdict === "rouge" ? "bad" : "none", text: `Recrutement : ${r.ready ?? "?"} recrues ont posté${r.target ? ` sur ${r.target} visées (${Math.round(r.pct! * 100)} %)` : ", objectif non défini dans l'OS"} · ${stuck} bloquées à une étape.` });
  }
  if (!off("paie", "Paie")) {
    const p = data.paie.view!;
    const open = p.complaints.filter((c) => c.open).length;
    const gap = p.totals.gap;
    if (gap) count++;
    if (open) count++;
    lines.push({ tone: gap ? "bad" : open ? "warn" : gap === 0 ? "good" : "none", text: `Paie : ${gap === null ? "vérification du lundi indisponible" : gap === 0 ? "le lundi tombe juste" : `écart de ${money(gap, p.currency)} sur ${p.totals.withGap ?? p.gaps.length} posteurs`}${open ? ` · ${plural(open, "plainte ouverte", "plaintes ouvertes")}` : ""}.` });
  }
  if (!off("problemes", "Autres problèmes")) {
    const issues = data.problemes.view!;
    const hot = issues.filter((i) => i.severity === "critique" || i.severity === "haute");
    count += hot.length;
    lines.push({ tone: hot.length ? "bad" : issues.length ? "warn" : "good", text: issues.length ? `Autres problèmes : ${issues.length} ouverts${hot.length ? `, dont ${plural(hot.length, "grave")}. Le premier : ${hot[0].title.charAt(0).toLowerCase()}${hot[0].title.slice(1)}` : ""}.` : "Autres problèmes : aucun ouvert." });
  }
  return { lines, count };
}
