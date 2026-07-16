/**
 * Kleine, screenübergreifend genutzte Helfer rund ums Datenmodell.
 * Regeln stammen aus der Prototyp-Logik (docs/design-handoff).
 */

import { ROLE_LABEL } from './constants'
import type { Person, ProgramItem, SongItem, Week } from './types'

export function isSong(item: ProgramItem): item is SongItem {
  return 'song' in item
}

/** Anzeigename wie im Prototyp: "S. Krüger". */
export function displayName(p: Person): string {
  return `${(p.fn[0] ?? '') + '.'} ${p.ln}`.trim()
}

/** Initialen für Avatare: "SK"; leerer Datensatz → "–". */
export function initials(p: Person): string {
  return ((p.fn[0] ?? '') + (p.ln[0] ?? '')).toUpperCase() || '–'
}

/** Rollenlabel, für Frauen in weiblicher Form ("Verkündigerin"). */
export function roleLabel(p: Person): string {
  const label = ROLE_LABEL[p.role]
  return p.female && p.role === 'verkuendiger' ? `${label}in` : label
}

/**
 * Bereichs-Key eines Hilfsdienstes. Jeder Dienst hat genau einen Bereich, der
 * aus seinem Key abgeleitet wird — so entsteht mit jedem neuen Dienst
 * automatisch ein Schalter im Personen-Detail. Der Präfix hält die dynamischen
 * Dienst-Bereiche von den festen Programm-Bereichen getrennt.
 */
export function serviceQualKey(serviceKey: string): string {
  return `svc:${serviceKey}`
}

/**
 * Bereiche, die laut den Anweisungen für die Zusammenkunft nur getaufte Brüder
 * ausführen — das sind alle außer den Schulungsaufgaben (die auch Schwestern
 * übernehmen), inklusive sämtlicher Hilfsdienste.
 */
export function isBrothersOnly(priv: string): boolean {
  return priv !== 'schulung'
}

/**
 * Qualifikationsprüfung; unbekannte Bereichs-Keys gelten als nicht erfüllt.
 * Schwestern sind für brüder-only-Bereiche nicht qualifiziert — greift bei Auto-
 * und manueller Zuteilung.
 */
export function isQualified(p: Person, priv: string): boolean {
  if (!p.priv[priv]) return false
  if (p.female && isBrothersOnly(priv)) return false
  return true
}

/**
 * Auslastung nur aus **Programmpunkten** (Aufgaben) über die gegebenen Wochen.
 * Zählt wie der Prototyp auch Begleiter-Erwähnungen im Rollenlabel
 * ("mit A. Hoffmann") — wer begleitet, hat ebenfalls eine Aufgabe.
 */
export function partWorkload(weeks: Week[], name: string): number {
  if (!name) return 0
  let count = 0
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      for (const section of meeting.sections) {
        for (const item of section.items) {
          if (isSong(item)) continue
          for (const slot of item.names) {
            if (slot.name === name) count++
            if (slot.rolle?.includes(name)) count++
          }
        }
      }
    }
  }
  return count
}

/** Auslastung nur aus **Hilfsdiensten** über die gegebenen Wochen. */
export function helperWorkload(weeks: Week[], name: string): number {
  if (!name) return 0
  let count = 0
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      for (const assigned of Object.values(meeting.helpers)) {
        for (const n of assigned) if (n === name) count++
      }
    }
  }
  return count
}

/** Gesamt-Auslastung (Programmpunkte + Hilfsdienste) über die gegebenen Wochen. */
export function workloadOf(weeks: Week[], name: string): number {
  return partWorkload(weeks, name) + helperWorkload(weeks, name)
}
