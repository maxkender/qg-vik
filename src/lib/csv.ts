/** Lecture d'un CSV (séparateur ; ou , détecté, guillemets gérés). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? undefined : clean.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type BankLine = { date: string; vendor: string; label: string | null; amount: number; currency: string; external_id: string | null };

function findCol(headers: string[], ...needles: string[]): number {
  for (const n of needles) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function toIsoDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function toNumber(v: string): number | null {
  const s = v.replace(/[\s  €$]/g, "");
  if (!s) return null;
  // « 1.234,56 » ou « 1,234.56 » ou « -12,00 »
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const dec = lastComma > lastDot ? "," : ".";
  const n = Number(s.replace(dec === "," ? /\./g : /,/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Lit un export de transactions bancaires (Qonto, en français ou en anglais) et
 * ne garde que les sorties d'argent. Renvoie aussi ce qui n'a pas pu être lu.
 */
export function readBankExport(text: string): { lines: BankLine[]; skipped: number; error?: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { lines: [], skipped: 0, error: "Fichier vide ou illisible." };
  const h = rows[0].map(norm);
  const cDate = findCol(h, "date de l'operation (locale)", "date de l'operation", "operation date (local)", "operation date", "settlement date", "date de la valeur", "date");
  const cVendor = findCol(h, "nom de la contrepartie", "contrepartie", "counterparty name", "counterparty", "libelle", "label", "description");
  const cAmount = findCol(h, "montant total (ttc)", "total amount (incl", "montant total", "total amount", "montant", "amount");
  const cDebit = findCol(h, "debit");
  const cCredit = findCol(h, "credit");
  const cId = findCol(h, "identifiant de transaction", "transaction id", "identifiant", "id");
  const cRef = findCol(h, "reference");
  const cCur = findCol(h, "devise", "currency");
  const cStatus = findCol(h, "statut", "status");
  if (cDate < 0 || cVendor < 0 || (cAmount < 0 && cDebit < 0)) {
    return { lines: [], skipped: 0, error: "Colonnes introuvables : il faut au moins une date, un nom de contrepartie et un montant." };
  }
  const lines: BankLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = toIsoDate(r[cDate] ?? "");
    const vendor = (r[cVendor] ?? "").trim();
    let amount: number | null = null;
    if (cDebit >= 0 && (r[cDebit] ?? "").trim()) amount = Math.abs(toNumber(r[cDebit]) ?? 0);
    else if (cAmount >= 0) {
      const n = toNumber(r[cAmount] ?? "");
      // Sortie d'argent = montant négatif (ou colonne crédit vide quand elle existe).
      if (n !== null && n < 0) amount = -n;
      else if (n !== null && cCredit >= 0 && !(r[cCredit] ?? "").trim() && cDebit >= 0) amount = n;
    }
    const status = cStatus >= 0 ? norm(r[cStatus] ?? "") : "";
    if (/declin|refus|annul|cancel|revers/.test(status)) continue;
    if (!date || !vendor || !amount) {
      if (date && vendor && amount === null) continue; // ligne de crédit : ignorée sans bruit
      skipped++;
      continue;
    }
    lines.push({
      date,
      vendor,
      label: cRef >= 0 ? (r[cRef] ?? "").trim() || null : null,
      amount: Math.round(amount * 100) / 100,
      currency: cCur >= 0 ? (r[cCur] ?? "EUR").trim() || "EUR" : "EUR",
      external_id: cId >= 0 ? (r[cId] ?? "").trim() || null : null,
    });
  }
  return { lines, skipped };
}
