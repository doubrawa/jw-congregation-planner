/**
 * **Der Saal auf dem Start** (T121): die Besetzung einer Zusammenkunft als Bild
 * aus 18 Plätzen — dem Logo 4-6-8. Er steht über der eigenen nächsten Aufgabe
 * und sagt auf einen Blick, wie weit der Abend steht: voll heißt zugesagt,
 * blass wartet auf Zusage, rot ist abgesagt, gestrichelt noch offen — und der
 * eigene Platz trägt einen Ring.
 *
 * **Ein Bild, keine Zählung.** Eine Zusammenkunft hat zwanzig bis dreißig
 * Plätze, der Saal achtzehn. Die Anteile werden darauf verteilt; die genauen
 * Zahlen nennt die Beschriftung für Vorleseprogramme. Nur eines darf dabei nie
 * passieren: dass eine Lage, die es gibt, im Bild verschwindet. Eine einzige
 * Absage unter dreißig Plätzen bekäme rechnerisch keinen Platz — sie bekommt
 * trotzdem einen, denn genau sie ist die Nachricht.
 *
 * Die Stufen kommen aus derselben Quelle wie die Ampel im Planen
 * (`zusageStatus`), die Plätze aus demselben Durchlauf (`allePlaetze`).
 */

import { platzKey, allePlaetze } from './plaetze'
import { zusageStatus } from './planning'
import type { ConfirmationMap, Meeting, MeetingKey, Service, TaskStatus } from './types'

/** Lage eines Platzes im Bild. */
export type SaalLage = 'voll' | 'wartet' | 'problem' | 'offen' | 'du'

/** Wie viele Plätze der Saal zeigt — die Plätze des Logos 4-6-8. */
export const SAAL_PLAETZE = 18

/**
 * Wo der eigene Platz sitzt: zweite Reihe, Mitte — wie auf dem Entwurf. Fest,
 * damit er nicht wandert, wenn sich die Besetzung ändert.
 */
const DU_PLATZ = 6

/** Die Besetzung einer Zusammenkunft, gezählt je Lage. Der eigene Platz zählt nicht mit. */
export interface Besetzung {
  voll: number
  wartet: number
  problem: number
  offen: number
  /** Sitzt der Leser selbst in dieser Zusammenkunft? */
  du: boolean
}

const LAGE_DER_ZUSAGE: Record<TaskStatus, 'voll' | 'wartet' | 'problem'> = {
  bestätigt: 'voll',
  offen: 'wartet',
  verhindert: 'problem',
}

/**
 * Die Besetzung einer Zusammenkunft: jeder Platz einmal, der des Lesers
 * (`meinKey`) gesondert.
 */
export function besetzung(
  meeting: Meeting,
  services: readonly Service[],
  confirmations: ConfirmationMap,
  woche: string,
  tab: MeetingKey,
  meinKey: string | null,
): Besetzung {
  const b: Besetzung = { voll: 0, wartet: 0, problem: 0, offen: 0, du: false }
  for (const platz of allePlaetze(meeting, services)) {
    if (!platz.slot?.name) {
      b.offen++
      continue
    }
    const key = platzKey(platz, woche, tab)
    if (key === meinKey) {
      b.du = true
      continue
    }
    b[LAGE_DER_ZUSAGE[zusageStatus(confirmations, key)]]++
  }
  return b
}

/** Besetzte Plätze (mit dem eigenen) und alle Plätze — für die Beschriftung. */
export function besetztVon(b: Besetzung): { besetzt: number; gesamt: number } {
  const du = b.du ? 1 : 0
  const besetzt = b.voll + b.wartet + b.problem + du
  return { besetzt, gesamt: besetzt + b.offen }
}

/** Die Lagen in der Reihenfolge, in der sie Plätze bekommen und bei Gleichstand gewinnen. */
const ORDNUNG = ['voll', 'wartet', 'problem', 'offen'] as const
type Verteilt = (typeof ORDNUNG)[number]

/**
 * Die 18 Plätze des Bilds, von vorn nach hinten.
 *
 * Verteilt wird nach dem größten Rest (Hare-Niemeyer): Jede Lage bekommt
 * ihren Anteil abgerundet, die übrigen Plätze die mit dem größten Rest. Danach
 * erhält jede vorhandene Lage mindestens einen Platz — genommen von der Lage
 * mit den meisten.
 *
 * **Offen sitzt hinten**, wie ein Saal sich von vorn füllt. Wartende und
 * Absagen verteilen sich gleichmäßig unter die Besetzten, statt als Block
 * beieinander zu sitzen: Jeder Platz einer Lage hat eine Wunschstelle (gleicher
 * Abstand über die Reihe), und alle zusammen werden danach geordnet.
 */
export function saalLagen(b: Besetzung): SaalLage[] {
  const frei = SAAL_PLAETZE - (b.du ? 1 : 0)
  const anzahl = verteilen({ voll: b.voll, wartet: b.wartet, problem: b.problem, offen: b.offen }, frei)

  const vorn = frei - anzahl.offen
  const wunsch: Array<{ lage: Verteilt; stelle: number; rang: number }> = []
  for (const [rang, lage] of ORDNUNG.entries()) {
    if (lage === 'offen') continue
    for (let j = 0; j < anzahl[lage]; j++) wunsch.push({ lage, stelle: (j + 0.5) / anzahl[lage], rang })
  }
  wunsch.sort((x, y) => x.stelle - y.stelle || x.rang - y.rang)
  const reihe: SaalLage[] = [...wunsch.map((w) => w.lage), ...Array<SaalLage>(frei - vorn).fill('offen')]
  if (b.du) reihe.splice(DU_PLATZ, 0, 'du')
  return reihe
}

/** `n` Plätze nach dem größten Rest auf die Lagen — keine vorhandene geht leer aus. */
function verteilen(zahlen: Record<Verteilt, number>, n: number): Record<Verteilt, number> {
  const summe = ORDNUNG.reduce((s, lage) => s + zahlen[lage], 0)
  // Nichts gezählt (keine Plätze, oder nur der eigene): Der Rest des Saals ist offen.
  if (summe === 0) return { voll: 0, wartet: 0, problem: 0, offen: n }

  const anteil = ORDNUNG.map((lage) => ({ lage, genau: (zahlen[lage] * n) / summe }))
  const out = Object.fromEntries(anteil.map((a) => [a.lage, Math.floor(a.genau)])) as Record<Verteilt, number>
  let rest = n - ORDNUNG.reduce((s, lage) => s + out[lage], 0)
  for (const a of [...anteil].sort((x, y) => (y.genau % 1) - (x.genau % 1))) {
    if (rest === 0) break
    out[a.lage]++
    rest--
  }

  for (const lage of ORDNUNG) {
    if (zahlen[lage] === 0 || out[lage] > 0) continue
    const groesste = ORDNUNG.reduce((g, l) => (out[l] > out[g] ? l : g))
    out[groesste]--
    out[lage]++
  }
  return out
}
