/**
 * Nachrichten über die Function `send-plan`: „Plan senden", „Jetzt erinnern"
 * und die Meldung über entzogene Zuteilungen — dazu der Haken „persönlich
 * Bescheid gegeben".
 */

import type { EntzogeneZuteilung } from '../../data/plan-versand'
import { supabase } from '../supabase'
import { mitverfolgen } from '../schreiben-unterwegs'
import { run } from './schreibweg'

/**
 * **Persönlich Bescheid gegeben** (T121, Phase 5g) — oder den Haken wieder
 * weg. Wer kein Konto hat, ist auf keinem Weg zu erreichen; der Planer sagt es
 * ihm selbst und hakt es in den Zusagen der Woche ab. Über
 * `persoenlich_bescheid` (security definer): Das Versand-Tagebuch schreibt
 * sonst nur `send-plan`.
 */
export function persoenlichBescheid(taskKey: string, name: string, ja: boolean): void {
  if (!supabase) return
  void run(supabase.rpc('persoenlich_bescheid', { p_task_key: taskKey, p_name: name, p_ja: ja }))
}

/** Ergebnis eines „Plan senden"-Laufs (Edge Function `send-plan`). */
export interface PlanVersand {
  /** Wie viele Personen eine Nachricht bekommen haben. */
  personen: number
  /** Namen ohne App-Konto — die muss der Planer persönlich ansprechen. */
  ohneKonto: string[]
}

/**
 * „Plan senden": jede eingeteilte Person bekommt **eine** Nachricht mit allen
 * ihren Aufgaben dieser Woche.
 *
 * Läuft serverseitig, weil Web-Push den privaten VAPID-Schlüssel braucht und
 * weil das Versand-Tagebuch (`assignment_log`) nur die Service-Role schreiben
 * darf — ein Client, der sich selbst als „informiert" einträgt, könnte damit
 * Nachrichten unterdrücken.
 *
 * **Nicht** fire-and-forget wie die übrigen Aufrufe: Der Planer hat den Knopf
 * bewusst gedrückt und muss erfahren, was daraus wurde — vor allem, wen er
 * mangels Konto selbst ansprechen muss.
 */
export function sendPlan(weekStart: string, heute: string): Promise<PlanVersand | null> {
  // `heute`: der Kalendertag, mit dem die Vorschau am Knopf gerechnet hat —
  // die Function lässt Vergangenes weg und soll denselben Tag meinen.
  return planSenden({ action: 'plan', weekStart, heute })
}

/**
 * Der eine Aufruf hinter den Knöpfen, die auf die Antwort von `send-plan`
 * warten — „Plan senden" (bis zum 3.10.2026 dreimal abgeschrieben) und „Jetzt
 * erinnern". `null`: Er ist gescheitert.
 */
async function sendPlanAntwort<T>(body: {
  action: 'plan' | 'erinnern'
  heute: string
  weekStart?: string
}): Promise<Partial<T> | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('send-plan', { body })
  if (error) {
    console.error(`[send-plan/${body.action}]`, error.message)
    return null
  }
  return (data ?? {}) as Partial<T>
}

async function planSenden(body: { action: 'plan'; heute: string; weekStart: string }): Promise<PlanVersand | null> {
  const res = await sendPlanAntwort<PlanVersand>(body)
  return res && { personen: res.personen ?? 0, ohneKonto: res.ohneKonto ?? [] }
}

/** Ergebnis von „Jetzt erinnern" (`send-plan`, Aktion `erinnern`). */
export interface Erinnert {
  /** Wie viele Personen jetzt erinnert wurden. */
  personen: number
  /** Wie viele heute schon eine Erinnerung hatten und deshalb ausblieben. */
  schonHeute: number
}

/**
 * **Jetzt erinnern** (Zusagen der Woche, T121, Phase 5g): Wer von seinem
 * Platz der Woche schon weiß und noch nicht zugesagt hat, bekommt die
 * Erinnerung sofort — je Person und Tag höchstens eine, von selbst oder von
 * Hand. Nicht fire-and-forget: Der Planer hat gedrückt und soll erfahren, was
 * daraus wurde. `heute` wie bei `sendPlan`: Vergangenes bleibt draußen.
 *
 * **Reihenfolge beim Ausrollen:** erst die Function — eine ältere kennt die
 * Aktion nicht und antwortet mit 400.
 */
export async function erinnerungSenden(weekStart: string, heute: string): Promise<Erinnert | null> {
  const res = await sendPlanAntwort<Erinnert>({ action: 'erinnern', weekStart, heute })
  return res && { personen: res.personen ?? 0, schonHeute: res.schonHeute ?? 0 }
}

/**
 * Zuteilungen, von denen jemand wusste (zugesagt oder gemeldet), wurden
 * zurückgezogen oder verlegt — die betroffenen Personen erfahren es sofort
 * (`entzogeneZuteilungen`).
 *
 * Das ist der einzige Fall, in dem eine Zuteilungs-Nachricht nicht auf den
 * Knopf wartet: Wer von seinem Platz weiß, bereitet vor. Bliebe es beim
 * nächsten „Plan senden", übte jemand tagelang für einen Platz, den er nicht
 * mehr hat.
 *
 * **Ein Aufruf für alle Entzüge einer Änderung.** Hier ging je Entzug ein
 * eigener `invoke` hinaus, und die Function wiederholte für jeden davor
 * dieselben fünf REST-Runden über Mitglieder, Personen und Push-Abos. Eine
 * Auto-Zuteilung, die eine Zusammenkunft neu besetzt, löste damit ein Dutzend
 * voller Aufrufe aus — für Nachrichten, die ohnehin alle aus demselben Bestand
 * zugestellt werden. Als Liste sind es fünf Runden, einmal.
 *
 * Bezeichnung und Termin gehen kanonisch deutsch mit — der Client hat den Platz
 * gerade in der Hand, die Function könnte ihn nach dem Überschreiben nicht mehr
 * nachschlagen.
 *
 * **Reihenfolge beim Ausrollen:** Die Function muss die Listenform kennen,
 * bevor ein Client sie schickt (`npx supabase functions deploy send-plan`).
 * Umgekehrt ist es unkritisch — die alte Einzelform nimmt sie weiter an.
 */
export function sendPlanEntzug(entzuege: EntzogeneZuteilung[]): void {
  if (!supabase || entzuege.length === 0) return
  // **Kein `run()`**: Dessen Fehlerweg meldet „Änderung konnte nicht gespeichert
  // werden" — hier ist aber nichts zu speichern, sondern eine Nachricht zu
  // schicken. Gespeichert ist die Änderung längst; der Planer erfährt, dass
  // der Betroffene nichts davon weiß, und sagt es ihm selbst (`entzugMelder`).
  mitverfolgen(
    supabase.functions
      .invoke('send-plan', {
        body: {
          action: 'entzug',
          entzuege: entzuege.map((z) => ({
            taskKey: z.key,
            name: z.name,
            pid: z.pid,
            label: z.label,
            datum: z.datum,
          })),
        },
      })
      .then(({ error }) => {
        if (!error) return
        console.error('[send-plan/entzug]', error.message)
        entzugMelder?.()
      }),
  )
}

/**
 * Meldung „die Nachricht über einen Entzug ging nicht hinaus". Wie beim
 * Schreibfehler kennt diese Schicht weder Dispatch noch Sprache; wer es
 * anzeigt, meldet sich hier an (store.tsx).
 */
let entzugMelder: (() => void) | null = null

export function setEntzugMelder(fn: (() => void) | null): void {
  entzugMelder = fn
}
