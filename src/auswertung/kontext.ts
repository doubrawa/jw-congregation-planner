import type { Auswertung } from '../data/auswertung'
import type { Lang } from '../data/types'
import type { Dict } from '../i18n/ui'

/** Die Unteransichten der Auswertung am Handy — ab dem Tablet steht alles auf einer Seite. */
export type Ansicht = 'ueberblick' | 'verteilung' | 'einseitig' | 'wartezeiten' | 'engpaesse' | 'weiteres'

/**
 * **Was jede Ansicht der Auswertung braucht**: die Zahlen und wie sie zu Wörtern
 * werden. Namen, Bereiche und Mengen formatiert eine Stelle (`AuswertungScreen`),
 * damit alle Ansichten dieselbe Sprache sprechen.
 */
export interface Kontext {
  a: Auswertung
  t: Dict
  lang: Lang
  /** Der Name einer Person der Versammlung. */
  name: (pid: string) => string
  /** Die Beschriftung eines Aufgabenbereichs (`bereichsName`). */
  bereich: (key: string) => string
  /** Dieselbe in Bausteinen, die Zusammenkunft kurz — je Baustein eine Zeile (`bereichsTeile`). */
  bereichKurz: (key: string) => string[]
  /** Der Name einer Predigtdienstgruppe, übersetzt — ohne Gruppe die Versammlung. */
  gruppe: (id: string | null) => string
  /** Eine Anzahl Wochen in Worten der Sprache („34 Wochen", `zeitspanne`). */
  dauer: (wochen: number) => string
  /** Eine Zahl in der Schreibweise der Sprache (Tausender, Dezimalstelle). */
  zahl: (n: number) => string
  /** Ein Tag kurz („17. Feb."). */
  datum: (iso: string) => string
  /** Der Monat eines Tages allein, kurz („Feb"), und sein Jahr („2026"). */
  monat: (iso: string) => string
  jahr: (iso: string) => string
  /** Ein Anteil (0 bis 1) als Prozent der Sprache („4,2 %"). */
  prozent: (anteil: number) => string
  personOeffnen: (pid: string) => void
  /**
   * Zu einer Unteransicht — am Handy öffnet sie sich, ab dem Tablet rollt die
   * Seite dorthin. Mit `bereich` stellen die Wartezeiten ihn ein.
   */
  ansichtOeffnen: (ansicht: Exclude<Ansicht, 'ueberblick'>, bereich?: string) => void
}

/** Erwartet wird ganz gezählt, wie die Zuteilungen auch. */
export function gerundet(erwartet: number): number {
  return Math.round(erwartet)
}
