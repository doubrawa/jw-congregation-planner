/**
 * Kleine, screenübergreifend genutzte Helfer rund ums Datenmodell.
 * Regeln stammen aus der Prototyp-Logik (docs/design-handoff).
 */

import { ROLE_LABEL } from './constants'
import type { Person, ProgramItem, SongItem, Week } from './types'

export function isSong(item: ProgramItem): item is SongItem {
  return 'song' in item
}

/**
 * Anzeigename: voller Name ("Simon Krüger"); `dn` überschreibt ihn nur noch
 * bei echten Duplikaten (z. B. "Josef Mayer 1"). Zuteilungen in den Wochen
 * hängen an diesem String — Altbestände mit der früheren Kurzform
 * "V. Nachname" werden beim Laden migriert (migrateAssignmentNames in
 * lib/data.ts).
 */
export function displayName(p: Person): string {
  return p.dn || `${p.fn} ${p.ln}`.trim()
}

/** Frühere automatische Kurzform — nur noch für die Lade-Migration. */
export function shortDisplayName(p: Person): string {
  return `${(p.fn[0] ?? '') + '.'} ${p.ln}`.trim()
}

/** Initialen für Avatare: "SK"; leerer Datensatz → "–". */
export function initials(p: Person): string {
  return ((p.fn[0] ?? '') + (p.ln[0] ?? '')).toUpperCase() || '–'
}

/** Alphabetische Personen-Sortierung: Nachname, dann Vorname (deutsch). */
export function personCompare(a: Person, b: Person): number {
  return (
    a.ln.localeCompare(b.ln, 'de', { sensitivity: 'base' }) ||
    a.fn.localeCompare(b.fn, 'de', { sensitivity: 'base' })
  )
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
 * Qualifikationsprüfung; unbekannte Bereichs-Keys gelten als nicht erfüllt.
 * Bewusst KEINE Geschlechts-Sperre: welche Bereiche eine Schwester übernimmt
 * (z. B. wenn Brüder fehlen), entscheiden allein die Schalter im
 * Personen-Detail.
 */
export function isQualified(p: Person, priv: string): boolean {
  return Boolean(p.priv[priv])
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
