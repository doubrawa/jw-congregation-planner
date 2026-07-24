/**
 * Kleine, screenübergreifend genutzte Helfer rund ums Datenmodell.
 * Regeln stammen aus der Prototyp-Logik (docs/design-handoff).
 */

import { QUALIFICATION_ORDER, ROLE_LABEL } from './constants'
import type { Group, Meeting, Person, ProgramItem, Qualifications, SongItem, Week } from './types'

export function isSong(item: ProgramItem): item is SongItem {
  return 'song' in item
}

/**
 * Gruppen-Id, deren Aufseher (ov) oder Gehilfe (as) die Person ist — sonst null.
 * Grundlage der Treffpunkt-Planungsrechte für Gruppenaufseher.
 */
export function overseerGroup(groups: Group[], personId: string | null): string | null {
  if (!personId) return null
  return groups.find((g) => g.ov === personId || g.as === personId)?.id ?? null
}

/** Die Vorsitz-Bereiche (fest + Alt-Schlüssel), die je Zusammenkunft umzuschlüsseln sind. */
const CHAIR_KEYS = new Set(['vorsitz', 'vorsitzMid', 'vorsitzWe'])

/**
 * Setzt den Bereichs-Schlüssel des Vorsitz-Slots je nach Zusammenkunft:
 * unter der Woche → `vorsitzMid`, Wochenende → `vorsitzWe`. So verlangt jeder
 * Slot genau die passende Qualifikation. Idempotent und referenz-erhaltend
 * (unveränderte Wochen behalten ihre Referenz). Deckt Alt-Daten mit dem
 * früheren gemeinsamen `vorsitz` beim Laden ab und normalisiert Demo/Vorlagen.
 */
export function normalizeChairKeys(weeks: Week[]): Week[] {
  let anyChanged = false
  const next = weeks.map((week) => {
    const mid = chairMeeting(week.mid, 'vorsitzMid')
    const we = chairMeeting(week.we, 'vorsitzWe')
    if (mid === week.mid && we === week.we) return week
    anyChanged = true
    return { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

function chairMeeting(meeting: Meeting, key: 'vorsitzMid' | 'vorsitzWe'): Meeting {
  let changed = false
  const sections = meeting.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (isSong(item)) return item
      let itemChanged = false
      const names = item.names.map((slot) => {
        const isChair =
          slot.rolle === 'Vorsitz' || (slot.bereichsKey != null && CHAIR_KEYS.has(slot.bereichsKey))
        if (isChair && slot.bereichsKey !== key) {
          itemChanged = true
          return { ...slot, bereichsKey: key }
        }
        return slot
      })
      if (!itemChanged) return item
      changed = true
      return { ...item, names }
    }),
  }))
  return changed ? { ...meeting, sections } : meeting
}

/** Voller Name „Vorname Nachname" (getrimmt); leer, wenn beide Felder leer sind. */
export function fullName(p: Person): string {
  return `${p.fn} ${p.ln}`.trim()
}

/** Listen-/Kopf-Label: voller Name, sonst Em-Dash-Platzhalter für Namenlose. */
export function personLabel(p: Person): string {
  return fullName(p) || '—'
}

/**
 * Frische Qualifikations-Map mit allen festen Programm-Bereichen auf `false` —
 * einzige Quelle der Standard-Bereiche (neue Person, normalizePriv). Dynamische
 * Hilfsdienst-Bereiche (`svc:<key>`) kommen erst durch Zuweisung hinzu.
 */
export function emptyQualifications(): Qualifications {
  const priv = {} as Qualifications
  for (const key of QUALIFICATION_ORDER) priv[key] = false
  return priv
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
