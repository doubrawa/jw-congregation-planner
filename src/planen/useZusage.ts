import { useApp } from '../app/context'
import { fsTaskKey } from '../data/fs'
import { istAusgefallen } from '../data/helpers'
import { platzKey, type Platz } from '../data/plaetze'
import { helferKey, punktKey, ratgeberKey, zusageStatus } from '../data/planning'
import { useT } from '../i18n/useT'
import type { Dict } from '../i18n/ui'
import type { FsInstance, MeetingKey, PartItem, TaskStatus } from '../data/types'

/*
 * Die Zusage an jedem besetzten Platz: bestätigt, wartet, abgesagt
 * (14. September 2026, vorher ✓ und …). Hier stehen Stufen und Nachschlagen.
 * Gezeigt wird sie seit T121 als Punkt der Lage — voll, blass, rot — über
 * `PlatzZeile` (`LAGE_KLASSE`); die eigenen Punkte der Treffpunkte und ihre
 * Legende (`ZusageStatus.tsx`) sind mit Phase 10 entfallen.
 *
 * Allein auf die Farbe verlässt sich der Punkt nicht: Der Platz nennt die
 * Stufe dem Screenreader, die Gruppenbesuche schreiben sie aus.
 */

/** Beschriftung je Stufe: am Platz für den Screenreader, bei den Gruppenbesuchen sichtbar. */
export const ZUSAGE_LABEL: Record<TaskStatus, keyof Dict> = {
  bestätigt: 'zusageBestaetigt',
  offen: 'zusageWartet',
  verhindert: 'zusageAbgesagt',
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
    /** Derselbe Stand für einen Platz aus dem Durchlauf (`allePlaetze`). */
    platz: (tab: MeetingKey, platz: Platz) => stand(platzKey(platz, woche, tab)),
    hilfsdienst: (tab: MeetingKey, svc: string, pos: number) => stand(helferKey(woche, tab, svc, pos)),
    ratgeber: (tab: MeetingKey) => stand(ratgeberKey(woche, tab)),
    treffpunkt: (inst: FsInstance) => stand(fsTaskKey(woche, inst.id)),
  }
}
