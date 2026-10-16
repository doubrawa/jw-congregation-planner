/**
 * Lädt die Versammlungsdaten des eingeloggten Nutzers aus Supabase und spielt
 * sie in den State (Hydration). Getrennt vom Provider, damit auch der
 * Erstbefüllungs-Flow (AppShell) sie aufrufen kann.
 *
 * Jeder erfolgreiche Ladevorgang legt zusätzlich eine Momentaufnahme ab
 * (lib/snapshot.ts). Scheitert das Laden (typischerweise ohne Netz), wird sie
 * zurückgespielt: die App zeigt den letzten Stand mit Zeitangabe und lässt
 * keine Änderungen zu (staleAt), statt eine Fehlerseite zu zeigen.
 */

import type { Dispatch } from 'react'
import { loadCongregationData } from '../lib/data'
import { schreibenAbwarten, schreibStand } from '../lib/schreiben-unterwegs'
import { clearSnapshot, readSnapshot, saveSnapshot } from '../lib/snapshot'
import type { AppAction, HydratePayload } from './context'
import { ausstehendesSchreiben } from './persist'
import { aktuelleSitzung } from './sitzung'

export async function loadAndHydrate(
  dispatch: Dispatch<AppAction>,
  userId: string,
  opts?: { silent?: boolean },
): Promise<void> {
  // Einmal festgehalten, für beide Durchläufe unten: Der zweite gehört zur
  // selben Sitzung wie der erste, auch wenn dazwischen abgemeldet wurde.
  const meine = aktuelleSitzung()
  // Erst hinaus, was gebündelt wartet: `hydrate` verwirft, was dann noch
  // wartet — es beruht auf dem Stand, der gleich ersetzt wird (`persist.ts`).
  // Ohne das ginge eine eben getippte Änderung verloren, nur weil gerade
  // nachgeladen wird, nach „Plan senden" etwa oder einem Push-Klick.
  ausstehendesSchreiben()
  // Stiller Refresh (z. B. nach einem Push-Klick): kein „lädt…"-Zwischenschritt,
  // die aktuelle Ansicht bleibt stehen, bis die frischen Daten da sind.
  if (!opts?.silent) dispatch({ type: 'setDataStatus', status: 'loading' })
  /*
   * **Ging während des Ladens etwas hinaus, wird noch einmal geladen** — still
   * und einmal, nicht im Kreis. Die Abfrage kann vor ihm gelesen haben, und
   * der eingespielte Stand zeigte die eben gegebene Zusage wieder offen.
   *
   * Erst eingespielt, dann nachgeholt — nicht das erste Ergebnis verworfen:
   * Das Laden setzt die Stände der Wochen schon beim Lesen (`staendeSetzen`,
   * T39). Zeigte der Bildschirm bis zum zweiten Laden den alten Inhalt,
   * schriebe eine Änderung darin ihn mit dem neuen Stand — lautlos über das,
   * was ein anderer inzwischen gespeichert hat.
   */
  if (await ladenUndEinspielen(dispatch, userId, meine, opts?.silent === true)) {
    ausstehendesSchreiben()
    // Das zweite Laden ist eines mitten in der Sitzung — still, wie es heißt.
    await ladenUndEinspielen(dispatch, userId, meine, true)
  }
}

/**
 * Einmal laden und einspielen. `true`: Während des Ladens ging etwas hinaus,
 * das die Abfrage verpasst haben kann (`schreibStand`).
 *
 * `still`: ein Nachladen mitten in der Sitzung. Es legt das Blatt beim Öffnen
 * nicht erneut vor, und scheitert es, bleibt der Bestand stehen — er ist
 * frischer als jede Momentaufnahme. Bis zum 16.10.2026 fiel auch ein stilles
 * Nachladen auf die Momentaufnahme zurück: Ein Netzaussetzer nach „Plan
 * senden" ersetzte den Bildschirm durch den älteren Stand und sperrte ihn; ohne
 * Momentaufnahme stand die ganze App auf der Fehlerseite.
 */
async function ladenUndEinspielen(
  dispatch: Dispatch<AppAction>,
  userId: string,
  meine: number,
  still: boolean,
): Promise<boolean> {
  // Was schon unterwegs ist — eben hinausgeschrieben oder vorher losgegangen —,
  // soll im geladenen Stand stehen. Bis zum 15.10.2026 wurde es nur losgeschickt,
  // und die Abfrage konnte es überholen.
  await schreibenAbwarten()
  const vorher = schreibStand()
  const res = await loadCongregationData(userId)
  // Inzwischen abgemeldet: Dieser Stand gehört niemandem mehr (`sitzung.ts`).
  if (meine !== aktuelleSitzung()) return false
  if (res.ok) {
    const payload: HydratePayload = {
      ...res.data,
      congregationId: res.congregationId,
      userId: res.userId,
      empty: res.empty,
    }
    saveSnapshot(payload)
    dispatch({ type: 'hydrate', payload, ...(still ? { nachgeladen: true as const } : {}) })
    return schreibStand() !== vorher
  }

  // Mitgliedschaft ist weg → der alte Stand darf nicht weiterleben.
  if (res.reason === 'no-membership') {
    clearSnapshot()
    dispatch({ type: 'setDataStatus', status: 'no-membership', userId })
    return false
  }

  // Mitten in der Sitzung: Der Bestand bleibt, ein Hinweis sagt es (siehe oben).
  if (still) {
    dispatch({ type: 'nachladenGescheitert' })
    return false
  }
  // Ladefehler: letzten Stand nur lesend anzeigen, wenn einer vorliegt.
  const snap = readSnapshot(userId)
  if (snap) {
    dispatch({ type: 'hydrate', payload: snap.payload, staleAt: snap.at })
    return false
  }
  // userId mitgeben: Retry und Code-Einlösen brauchen es ohne Hydration
  dispatch({ type: 'setDataStatus', status: 'error', userId })
  return false
}
