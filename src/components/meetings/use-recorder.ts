"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Un morceau toutes les 6 minutes : chaque envoi reste léger, et une coupure ne fait perdre que la fin. */
const SEGMENT_MS = 6 * 60 * 1000;
const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export type RecorderState = "idle" | "recording" | "finishing";

/**
 * Enregistre la réunion au micro et la transcrit au fil de l'eau.
 * Rien n'est gardé : chaque morceau d'audio est envoyé, transcrit, puis oublié.
 */
export function useMeetingRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<{ tick?: number; cut?: number }>({});
  const parts = useRef<string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const send = useCallback((blob: Blob, index: number) => {
    if (blob.size < 1500) return;
    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch("/api/assistant/reunion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: { mime: blob.type || "audio/webm", data: await toBase64(blob) } }) });
        const json = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
        if (!res.ok) throw new Error(json?.error ?? "La transcription a échoué.");
        parts.current[index] = json?.text ?? "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "La transcription a échoué.");
      } finally {
        setPending((n) => n - 1);
      }
    });
  }, []);

  /** Démarre un morceau ; à la fin du morceau, l'envoie et enchaîne sur le suivant tant qu'on enregistre. */
  const next = useRef<(index: number) => void>(() => {});
  const begin = useCallback((index: number) => {
    if (!stream.current) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => send(new Blob(chunks, { type: rec.mimeType || mime }), index);
    rec.start();
    recorder.current = rec;
    timers.current.cut = window.setTimeout(() => {
      rec.stop();
      next.current(index + 1);
    }, SEGMENT_MS);
  }, [send]);
  useEffect(() => {
    next.current = begin;
  }, [begin]);

  const release = useCallback(() => {
    window.clearInterval(timers.current.tick);
    window.clearTimeout(timers.current.cut);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return void setError("Ce navigateur ne sait pas enregistrer le micro.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return void setError("Micro refusé. Autorise le micro pour ce site, puis réessaie.");
    }
    parts.current = [];
    queue.current = Promise.resolve();
    setSeconds(0);
    setState("recording");
    timers.current.tick = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    begin(0);
  }, [begin]);

  /** Arrête, attend la fin des transcriptions et rend le texte complet. */
  const stop = useCallback(async (): Promise<string> => {
    setState("finishing");
    const rec = recorder.current;
    window.clearTimeout(timers.current.cut);
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.addEventListener("stop", () => resolve(), { once: true });
        rec.stop();
      });
    }
    release();
    // Le dernier morceau vient d'entrer dans la file : on attend qu'elle se vide.
    await new Promise((r) => setTimeout(r, 50));
    await queue.current;
    return parts.current.filter(Boolean).join("\n");
  }, [release]);

  const reset = useCallback(() => setState("idle"), []);
  useEffect(() => release, [release]);

  return { state, seconds, pending, error, start, stop, reset, setError };
}
