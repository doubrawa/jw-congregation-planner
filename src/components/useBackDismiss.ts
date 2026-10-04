import { useEffect, useRef } from 'react'

/**
 * Lässt die Zurück-Geste (bzw. die Zurück-Taste) eine Ebene schließen, statt
 * die App zu verlassen.
 *
 * Auf dem Handy ist Zurück die meistgenutzte Geste überhaupt. Die App führt
 * keinen Verlauf je Adresse (kein Routing) — ohne das hier verließe Zurück sie
 * bei jedem Druck.
 *
 * Solange eine Ebene offen ist, liegt für sie ein zusätzlicher Verlaufseintrag
 * auf dem Stapel. Zurück entfernt ihn und schließt damit die Ebene. Wird sie
 * anders geschlossen (Knopf, Escape, Hintergrund-Tipp, ein anderer
 * Bildschirm), räumen wir den Eintrag selbst wieder ab.
 *
 * **Mehrere Ebenen übereinander** bringen jede ihren eigenen Eintrag mit, und
 * Zurück nimmt davon genau einen. Angesprochen ist immer nur die oberste:
 * Das S-89-Formular wird aus dem Zuteilungs-Sheet heraus geöffnet, und ein
 * Zurück räumte früher den ganzen Stapel ab — dieselbe Regel wie bei
 * `useEscape`, und aus demselben Grund: Ein Blatt weiß nicht, ob über ihm noch
 * eines liegt.
 *
 * **Seit dem 4.10.2026 auch Bildschirme und Unteransichten** (Zurück am Handy,
 * Variante B): Ein Bildschirm außer Start, ein Personen-Detail, ein geöffneter
 * Plan — jedes ist eine Ebene mit eigenem Eintrag. Zurück schließt zuerst das
 * Blatt, dann die Unteransicht, dann führt es zu Start; von Start aus verlässt
 * es die App. Welche Ebene oben liegt, entscheidet ihr **Rang** und erst bei
 * Gleichstand die Reihenfolge: Gehen zwei im selben Augenblick auf, hängt React
 * die Kinder vor den Eltern ein.
 */
const MARKER = 'cpOverlay'

/** Wie weit oben eine Ebene liegt: Zurück trifft immer die höchste. */
export type Ebene = 'bildschirm' | 'unteransicht' | 'blatt'

const RANG: Record<Ebene, number> = { bildschirm: 0, unteransicht: 1, blatt: 2 }

/** Eine offene Ebene. Ein eigenes Objekt je Einhängung — zwei gleiche wären sonst nicht zu unterscheiden. */
interface Lage {
  rang: number
  /** Reihenfolge der Einhängung — bei gleichem Rang ist die jüngste oben. */
  nr: number
  /**
   * Ein Zurück-Druck hat den Eintrag dieser Ebene schon genommen; beim
   * Schließen ist dann nichts mehr abzuräumen.
   *
   * Hier stand die Frage „liegt noch ein markierter Eintrag obenauf?" — und die
   * konnte nicht unterscheiden, **wessen** Eintrag das ist. Lagen zwei Blätter
   * übereinander, nahm Zurück den Eintrag des oberen; dessen Aufräumen sah dann
   * den (ebenso markierten) Eintrag des unteren, hielt ihn für den eigenen und
   * nahm ihn mit. Das untere Blatt stand offen ohne Eintrag da, und der nächste
   * Zurück-Druck verließ die App (gemessen am 4.10.2026,
   * `zurueck-stapel.test.tsx`).
   */
  verbraucht: boolean
  schliessen: () => void
}

/** Die offenen Ebenen, in der Reihenfolge ihrer Einhängung. */
const stapel: Lage[] = []
let einhaengungen = 0

/*
 * **Die Buchführung über die eigenen Einträge.**
 *
 * Bis zum 4.10.2026 schickte jede schließende Ebene sofort ihr eigenes
 * `history.back()` los und kündigte es an, damit der folgende `popstate` nicht
 * als Druck des Nutzers galt. Das brach, sobald im selben Augenblick eine
 * andere Ebene aufging — das Handy-Menü schließt, der gewählte Bildschirm
 * öffnet: Deren `pushState` brach das noch laufende `back()` ab (in jsdom
 * gemessen, `zurueck-am-handy.test.tsx`; ob ein Browser es auch tut, ist Sache
 * der Engine, und darauf darf nichts beruhen). Die Ankündigung blieb liegen und
 * verschluckte den nächsten echten Zurück-Druck.
 *
 * Jetzt wird gezählt, nicht sofort gehandelt:
 *
 * - Was zugeht, wird gezählt (`abzuraeumen`) und erst in einer Mikroaufgabe
 *   abgeräumt — nach allen Effekten desselben Augenblicks. Geht dabei eine
 *   andere Ebene auf, steht ihr `pushState` damit immer **vor** dem `back()`,
 *   und nichts bricht ab.
 * - Ein eigener Rückschritt ist `unterwegs`, bis sein `popstate` da ist. Geht
 *   in der Zeit eine Ebene auf (ein späterer Augenblick), legt sie ihren
 *   Eintrag erst danach an (`nachzutragen`).
 * - Ein einziger Horcher entscheidet: eigener Rückschritt oder Druck des
 *   Nutzers. Ein Druck schließt die oberste Ebene.
 *
 * Hier stand anfangs noch ein Ausgleich (die neue Ebene übernimmt den Eintrag
 * der eben geschlossenen). Die Mutationsprobe zeigte: Ohne ihn ändert sich
 * nichts, die Mikroaufgabe trägt den Fall allein — also weg damit.
 */
let abzuraeumen = 0
let unterwegs = 0
let nachzutragen = 0
let geplant = false
let horcht = false

function eintragAnlegen(): void {
  history.pushState({ ...history.state, [MARKER]: true }, '')
}

/** Eine Ebene ist aufgegangen und braucht einen Eintrag. */
function eintragen(): void {
  if (unterwegs > 0) {
    nachzutragen++ // erst, wenn der eigene Rückschritt angekommen ist
    return
  }
  eintragAnlegen()
}

/** Eine Ebene ist ohne Zurück-Druck zugegangen — ihr Eintrag muss weg. */
function austragen(): void {
  if (nachzutragen > 0) {
    nachzutragen-- // ihr Eintrag war noch gar nicht angelegt
    return
  }
  // Liegt gar kein Eintrag von uns obenauf und ist nichts unterwegs, gibt es
  // nichts abzuräumen — ein `back()` ginge dann aus der App hinaus.
  const state = history.state as Record<string, unknown> | null
  if (unterwegs === 0 && abzuraeumen === 0 && !state?.[MARKER]) return
  abzuraeumen++
  planen()
}

function planen(): void {
  if (geplant) return
  geplant = true
  queueMicrotask(aufraeumen)
}

function aufraeumen(): void {
  geplant = false
  if (abzuraeumen === 0 || unterwegs > 0) return // nach dem laufenden Rückschritt (siehe `beimPopstate`)
  const n = abzuraeumen
  abzuraeumen = 0
  unterwegs++
  if (n === 1) history.back()
  else history.go(-n)
}

/**
 * Die Ebene, die ein Zurück-Druck jetzt meint: höchster Rang, bei Gleichstand
 * die jüngste — und keine, die ein früherer Druck schon getroffen hat. So
 * schließen zwei schnelle Drücke zwei Ebenen, nicht zweimal dieselbe.
 */
function oberste(): Lage | undefined {
  let beste: Lage | undefined
  for (const lage of stapel) {
    if (lage.verbraucht) continue
    if (!beste || lage.rang > beste.rang || (lage.rang === beste.rang && lage.nr > beste.nr)) beste = lage
  }
  return beste
}

function beimPopstate(): void {
  if (unterwegs > 0) {
    // Der eigene Rückschritt ist angekommen. Was inzwischen aufging, bekommt
    // jetzt seinen Eintrag; was inzwischen zuging, geht jetzt.
    unterwegs--
    for (; nachzutragen > 0; nachzutragen--) eintragAnlegen()
    if (abzuraeumen > 0) planen()
    return
  }
  const lage = oberste()
  if (!lage) return
  lage.verbraucht = true
  lage.schliessen()
}

/**
 * @param ebene Wo die Ebene liegt — ein Blatt (Standard) über einer
 *   Unteransicht über einem Bildschirm.
 */
export function useBackDismiss(active: boolean, onDismiss: () => void, ebene: Ebene = 'blatt'): void {
  // Über eine Ref, damit ein neu erzeugtes onDismiss den Effekt nicht neu
  // startet (das würde den Verlaufseintrag doppeln).
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useEffect(() => {
    if (!active) return
    if (!horcht) {
      window.addEventListener('popstate', beimPopstate)
      horcht = true
    }
    const lage: Lage = { rang: RANG[ebene], nr: ++einhaengungen, verbraucht: false, schliessen: () => dismiss.current() }
    stapel.push(lage)
    eintragen()
    return () => {
      const i = stapel.indexOf(lage)
      if (i >= 0) stapel.splice(i, 1)
      if (!lage.verbraucht) austragen()
    }
  }, [active, ebene])
}
