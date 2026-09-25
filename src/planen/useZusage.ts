import { useApp } from '../app/context'
import { fsTaskKey } from '../data/fs'
import { istAusgefallen } from '../data/helpers'
import { helferKey, punktKey, ratgeberKey, zusageStatus } from '../data/planning'
import { useT } from '../i18n/useT'
import type { Dict } from '../i18n/ui'
import type { FsInstance, MeetingKey, PartItem, TaskStatus } from '../data/types'

/*
 * Die Ampel an jedem besetzten Platz: grün bestätigt, gelb wartet, rot
 * abgesagt (14. September 2026, vorher ✓ und …). Hier stehen Stufen und
 * Nachschlagen, die Darstellung in `ZusageStatus.tsx`.
 *
 * Die Farben stehen als Tokens in `tokens.css` (`--zusage-*`), je Palette
 * abgestimmt und mit `npm run contrast` geprüft. Allein auf die Farbe verlässt
 * sich der Punkt nicht: Die Legende nennt jede Stufe beim Namen, der Chip nennt
 * sie dem Screenreader.
 */

/** Die drei Stufen in Ampel-Reihenfolge — so stehen sie auch in der Legende. */
export const ZUSAGE_STUFEN: readonly TaskStatus[] = ['bestätigt', 'offen', 'verhindert']

/** Beschriftung je Stufe: in der Legende sichtbar, am Chip für den Screenreader. */
export const ZUSAGE_LABEL: Record<TaskStatus, keyof Dict> = {
  bestätigt: 'zusageBestaetigt',
  offen: 'zusageWartet',
  verhindert: 'zusageAbgesagt',
}

/**
 * CSS-Klasse je Stufe. Ohne Umlaut, damit Selektor und Klasse sicher
 * zusammenpassen — `tests/css-klassen.test.ts` hält beide Seiten zusammen.
 */
export const ZUSAGE_KLASSE: Record<TaskStatus, string> = {
  bestätigt: 'is-bestaetigt',
  offen: 'is-offen',
  verhindert: 'is-verhindert',
}

/** Stand der Zusage eines Platzes, fertig zum Anzeigen: Stufe und ihr Wort. */
export interface ZusageStand {
  stufe: TaskStatus
  label: string
}

/**
 * Stand der Zusage je Platz der **angezeigten** Woche.
 *
 * Die Schlüssel entstehen genau so wie dort, wo die eingeteilte Person
 * bestätigt: `eachAssignedSlot` und `deriveMyFsTasks`. Also aus der
 * Wochen-Kennung (`week.start`, für Zusammenkünfte wie für Treffpunkte), nicht
 * aus der Position in der Liste — ein Index läge nach einer Lücke im Bestand
 * eine Woche daneben (T66, T100), und jeder Punkt stünde still auf Gelb.
 *
 * Alle vier Platzsorten und die Treffpunkte fragen hier; eine eigene
 * Schlüsselrechnung in einer Komponente wäre die nächste, die man vergisst.
 * Die Beschriftung kommt gleich mit: Die Übersetzung wird einmal je Abschnitt
 * geholt, nicht in jedem der gut hundert Chips des Wochenstreifens.
 */
export function useZusage() {
  const { state } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  const woche = week?.start ?? ''
  const stand = (key: string): ZusageStand => {
    const stufe = zusageStatus(state.confirmations, key)
    return { stufe, label: t[ZUSAGE_LABEL[stufe]] }
  }
  return {
    /**
     * Gibt es in dieser Zusammenkunft überhaupt etwas zu bestätigen? Fällt sie
     * aus (T30), nicht: Es gibt dann keine Aufgabe, keine Erinnerung und keinen
     * Knopf zum Zusagen (`eachAssignedSlot`). Ein Punkt behauptete dort ein
     * Warten, das nie endet — oder eine Zusage für einen Abend, der nicht
     * stattfindet. Eine Kongress-Woche lässt alle Zusammenkünfte ausfallen.
     */
    moeglich: (tab: MeetingKey): boolean => !istAusgefallen(week, tab),
    teil: (tab: MeetingKey, item: PartItem, ni: number, aux: boolean) =>
      stand(punktKey(woche, tab, item.iid, ni, aux)),
    hilfsdienst: (tab: MeetingKey, svc: string, pos: number) => stand(helferKey(woche, tab, svc, pos)),
    ratgeber: (tab: MeetingKey) => stand(ratgeberKey(woche, tab)),
    treffpunkt: (inst: FsInstance) => stand(fsTaskKey(woche, inst.id)),
  }
}
