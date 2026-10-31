/**
 * **Tauschen** (T153) — über die Edge Function `tauschen`, nie direkt in die
 * Tabellen.
 *
 * Jede Aktion sagt einem anderen etwas und schreibt, was ein Mitglied selbst
 * nicht schreiben darf: die Woche eines anderen, seine Zusage, das
 * Versand-Tagebuch. Deshalb wartet die App hier auf die Antwort, wie bei den
 * Trolleys: Ob der Tausch noch geht, weiß erst der Server.
 *
 * **Ohne Datenbank** (Entwicklerseite, Tests) rechnet die App mit denselben
 * Regeln (`supabase/functions/tauschen/regeln.ts`) und nimmt jeden Wunsch an;
 * wer ein Konto hat, liest sie aus den geladenen Mitgliedern (Entwicklerseite:
 * `konto=1`).
 */

import type { ServiceRow, Week as EdgeWeek } from '../../supabase/functions/_shared/zuteilungen.ts'
import { type Lage, tauschAngebote as angeboteNachRegeln, tauschPruefen } from '../../supabase/functions/tauschen/regeln.ts'
import { gesendeteWochen } from '../data/offene-plaetze'
import type { TauschAnfrage } from '../data/tausch'
import type { Absence, MeetingTimes, Person, SentLog, Service, Week } from '../data/types'
import { ladungJetzt, tauschStaendeUebernehmen } from './data'
import { fehlerAntwort } from './function-antwort'
import { supabase } from './supabase'
import { tauschAnfrageFromRow, type TauschAnfrageRow } from './zeilen'

/**
 * Warum ein Tausch nicht ging, so weit die App es unterscheidet: Für diesen
 * Platz läuft schon eine Anfrage, die Anfrage gibt es nicht mehr, der Stand
 * hat sich geändert (jeder andere Grund des Servers) — oder es kam keine
 * Antwort (`netz`).
 */
export type TauschFehler = 'already-asked' | 'gone' | 'stand' | 'netz'

/** Ein Aufruf und sein Ergebnis — oder der Grund, warum es nicht ging. */
export type TauschErgebnis<T> = { ok: true; wert: T } | { ok: false; fehler: TauschFehler }

/** Ein Platz, den man im Tausch übernehmen könnte, und wer ihn jetzt hat. */
export interface TauschAngebot {
  nimmt: string
  personId: string
  /**
   * Hat er ein Konto? Dann fragt die App ihn an. Ohne Konto sieht er keine
   * Anfrage: Die beiden sprechen sich mündlich ab, und der Fragende tauscht
   * gleich (`tauschDirekt`, Betreiber 30.10.2026).
   */
  konto: boolean
}

/**
 * Was die App ohne Datenbank für die Regeln braucht — derselbe Bestand, den
 * sie ohnehin hält.
 */
export interface TauschBestand {
  weeks: readonly Week[]
  services: readonly Service[]
  persons: readonly Person[]
  absences: readonly Absence[]
  sentLog: SentLog
  zeiten: MeetingTimes
  ich: string
  heute: string
  /** Die Personen mit Konto — aus den geladenen Mitgliedern, nur ohne Datenbank gebraucht. */
  konten: ReadonlySet<string>
}

/**
 * Gründe, die der Server nennt und die App unterscheidet. Jeder andere —
 * `past`, `busy`, `absent`, `not-yours`, `no-account` … — heißt für sie
 * dasselbe: Seit dem Laden hat sich etwas geändert, und der Tausch geht so
 * nicht mehr (`stand`).
 */
const BEKANNT: ReadonlySet<string> = new Set<TauschFehler>(['already-asked', 'gone'])

async function aufrufen<T>(body: object): Promise<TauschErgebnis<T | undefined>> {
  if (!supabase) return { ok: true, wert: undefined }
  const { data, error } = await supabase.functions.invoke('tauschen', { body })
  if (!error) return { ok: true, wert: data as T }
  const grund = (await fehlerAntwort(error))?.error
  if (!grund) {
    console.error('[tauschen]', error.message)
    return { ok: false, fehler: 'netz' }
  }
  return { ok: false, fehler: BEKANNT.has(grund) ? (grund as TauschFehler) : 'stand' }
}

/** Die Lage nach den Regeln des Servers, aus dem Bestand der App — nur ohne Datenbank gebraucht. */
function lageAus(b: TauschBestand): Lage {
  return {
    wochen: new Map(b.weeks.map((w) => [w.start, { start: w.start, data: w as unknown as EdgeWeek, updated_at: '' }])),
    services: b.services.map((s): ServiceRow => ({ key: s.key, name: s.name, count: s.count, groups: Boolean(s.groups) })),
    personen: new Map(b.persons.map((p) => [p.id, { id: p.id, fn: p.fn, ln: p.ln, priv: p.priv as unknown as Record<string, boolean> }])),
    // Von und bis sind Kalendertage („JJJJ-MM-TT"), wie die Spalten.
    abwesend: (pid, tag) => b.absences.some((a) => a.personId === pid && a.from <= tag && tag <= a.to),
    gesendet: gesendeteWochen(b.sentLog),
    zeiten: b.zeiten,
    heute: b.heute,
  }
}

/** Mit wem der eigene Platz `gibtAb` getauscht werden könnte — der früheste zuerst. */
export async function tauschAngebote(gibtAb: string, bestand: TauschBestand): Promise<TauschErgebnis<TauschAngebot[]>> {
  const antwort = await aufrufen<{ angebote?: (Omit<TauschAngebot, 'konto'> & { konto?: boolean })[] }>({ aktion: 'angebote', gibtAb, heute: bestand.heute })
  if (!antwort.ok) return antwort
  // Ohne `konto` (Function von vor dem 30.10.2026) kamen nur Inhaber mit Konto.
  if (antwort.wert) return { ok: true, wert: (antwort.wert.angebote ?? []).map((a) => ({ ...a, konto: a.konto !== false })) }
  return {
    ok: true,
    wert: angeboteNachRegeln(lageAus(bestand), gibtAb, bestand.ich).map((b) => ({
      nimmt: b.key,
      personId: b.person.id,
      konto: bestand.konten.has(b.person.id),
    })),
  }
}

/** Den fragen, der `nimmt` hat. Zurück kommt die Anfrage, wie sie jetzt dasteht. */
export async function tauschAnfragen(
  gibtAb: string,
  angebot: TauschAngebot,
  bestand: TauschBestand,
): Promise<TauschErgebnis<TauschAnfrage>> {
  const antwort = await aufrufen<{ anfrage?: TauschAnfrageRow }>({ aktion: 'anfragen', gibtAb, nimmt: angebot.nimmt, heute: bestand.heute })
  if (!antwort.ok) return antwort
  if (antwort.wert?.anfrage) return { ok: true, wert: tauschAnfrageFromRow(antwort.wert.anfrage) }
  // Ohne Datenbank: dieselbe Prüfung und dieselbe Anfrage, wie sie der Server
  // anlegte — bis zum früheren der beiden Tage.
  const urteil = tauschPruefen(lageAus(bestand), gibtAb, angebot.nimmt, bestand.ich)
  if (!urteil.ok) return { ok: false, fehler: 'stand' }
  return { ok: true, wert: { id: crypto.randomUUID(), von: bestand.ich, an: urteil.b.person.id, gibtAb, nimmt: angebot.nimmt, bis: urteil.bis } }
}

/** Die eigene Anfrage zurückziehen. */
export async function tauschZurueckziehen(id: string): Promise<TauschErgebnis<void>> {
  const antwort = await aufrufen({ aktion: 'zurueckziehen', id })
  return antwort.ok ? { ok: true, wert: undefined } : antwort
}

/** Eine Anfrage an mich ablehnen — der Fragende erfährt es. */
export async function tauschAblehnen(id: string): Promise<TauschErgebnis<void>> {
  const antwort = await aufrufen({ aktion: 'ablehnen', id })
  return antwort.ok ? { ok: true, wert: undefined } : antwort
}

/**
 * **Gleich tauschen** mit jemandem ohne Konto — abgesprochen haben es die
 * beiden mündlich. Die App übernimmt die neuen Stände wie beim Annehmen.
 */
export async function tauschDirekt(gibtAb: string, angebot: TauschAngebot, bestand: TauschBestand): Promise<TauschErgebnis<void>> {
  const geladen = ladungJetzt()
  const antwort = await aufrufen<{ wochen?: unknown[] }>({ aktion: 'direkt', gibtAb, nimmt: angebot.nimmt, heute: bestand.heute })
  if (!antwort.ok) return antwort
  if (antwort.wert) {
    tauschStaendeUebernehmen(antwort.wert.wochen ?? [], geladen)
    return { ok: true, wert: undefined }
  }
  // Ohne Datenbank: dieselbe Prüfung wie der Server.
  return tauschPruefen(lageAus(bestand), gibtAb, angebot.nimmt, bestand.ich).ok
    ? { ok: true, wert: undefined }
    : { ok: false, fehler: 'stand' }
}

/**
 * Eine Anfrage an mich annehmen: Die Function tauscht beide Plätze; die App
 * übernimmt die neuen Stände der Wochen, wie nach dem Einspringen — sonst
 * meldete die nächste eigene Änderung einen Konflikt, den es nicht gab.
 */
export async function tauschAnnehmen(id: string, heute: string): Promise<TauschErgebnis<void>> {
  const geladen = ladungJetzt()
  const antwort = await aufrufen<{ wochen?: unknown[] }>({ aktion: 'annehmen', id, heute })
  if (!antwort.ok) return antwort
  tauschStaendeUebernehmen(antwort.wert?.wochen ?? [], geladen)
  return { ok: true, wert: undefined }
}
