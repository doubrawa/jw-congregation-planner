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
 * Zerlegt einen zusammengesetzten ERÖFFNUNG/ABSCHLUSS-Titel (` · `-getrennt, z. B.
 * „Lied 138 · Gebet" oder „Schlussworte · Lied 76 · Gebet") in den Lied-Teil und
 * den Rest. Das Lied ist das einzige Atom mit einer Nummer — Gebet/Einleitende
 * Worte/Schlussworte tragen keine (sprachunabhängig, funktioniert auch für
 * übersetzte Titel). Ohne Nummern-Atom: `song` null, `rest` = Titel unverändert.
 * Nur auf ERÖFFNUNG/ABSCHLUSS anwenden (dort ist das Nummern-Atom eindeutig das
 * Lied; bei anderen Punkten könnten Schriftstellen Ziffern enthalten).
 */
export function splitOpeningSong(title: string): { song: string | null; rest: string } {
  const atoms = title.split(' · ')
  const idx = atoms.findIndex((a) => /\d/.test(a))
  if (idx < 0) return { song: null, rest: title }
  return { song: atoms[idx].trim(), rest: atoms.filter((_, i) => i !== idx).join(' · ') }
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

/**
 * Anzeigenamen, die sich zwei oder mehr Personen teilen. Solche Dubletten sind
 * ein Datenproblem für den Planer: wo ein Slot keine Person-Id trägt
 * (Hilfsdienste, externe Beteiligte, Altdaten) ordnen deriveMyTasks/
 * derivePendingNames/Konfliktprüfung über den Anzeigenamen zu — Namensgleiche
 * teilen sich dann fälschlich Aufgaben. Abhilfe: je Person einen eindeutigen
 * Anzeigenamen (dn) vergeben. Liefert je betroffenem Namen die Personenzahl,
 * alphabetisch sortiert.
 */
export function duplicateDisplayNames(persons: Person[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const p of persons) {
    const name = displayName(p)
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
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
  // Ein Gesprächsführer (schulung) darf auch als Partner einspringen — daher
  // deckt der Partner-Slot beide Bereiche ab.
  if (priv === 'schulungPartner') return Boolean(p.priv.schulungPartner || p.priv.schulung)
  return Boolean(p.priv[priv])
}

/**
 * Darf `cand` als Gesprächspartner zu `lead` eingeteilt werden? Die Anweisungen
 * verlangen dasselbe Geschlecht (oder Familienangehörige — Familienbezüge kennt
 * die App noch nicht, daher vorerst strikt gleiches Geschlecht). Die Regel ist
 * hier gekapselt, damit die Familien-Ausnahme später an EINER Stelle ergänzt
 * werden kann. Ohne zugeteilten Führer (leer) keine Einschränkung.
 */
export function partnerGenderOk(lead: Person | undefined, cand: Person): boolean {
  if (!lead) return true
  if (Boolean(lead.female) === Boolean(cand.female)) return true
  // Familienangehörige (gleicher Haushalt) dürfen auch geschlechtsübergreifend
  // Partner sein (z. B. Ehepaar, Vater/Tochter) — jw.org-Anweisung.
  return Boolean(lead.fam) && lead.fam === cand.fam
}

/** Andere Personen im selben Haushalt (Familienangehörige). */
export function familyMembers(persons: Person[], person: Person): Person[] {
  if (!person.fam) return []
  return persons.filter((p) => p.id !== person.id && p.fam === person.fam)
}

/**
 * `memberId` in den Haushalt von `id` aufnehmen: beide teilen sich danach
 * dieselbe Familien-Id (bestehende bevorzugt, sonst neu). Symmetrisch — die
 * Familienzugehörigkeit ist damit von beiden Seiten sichtbar.
 */
export function linkFamily(persons: Person[], id: string, memberId: string): Person[] {
  if (id === memberId) return persons
  const a = persons.find((p) => p.id === id)
  const b = persons.find((p) => p.id === memberId)
  if (!a || !b) return persons
  const hid = a.fam || b.fam || crypto.randomUUID()
  return persons.map((p) => (p.id === id || p.id === memberId ? { ...p, fam: hid } : p))
}

/** `memberId` aus dem Haushalt lösen; bleibt nur eine Person übrig, wird auch die gelöst. */
export function unlinkFamily(persons: Person[], memberId: string): Person[] {
  const m = persons.find((p) => p.id === memberId)
  if (!m?.fam) return persons
  const hid = m.fam
  const next = persons.map((p) => (p.id === memberId ? { ...p, fam: null } : p))
  const rest = next.filter((p) => p.fam === hid)
  return rest.length <= 1 ? next.map((p) => (p.fam === hid ? { ...p, fam: null } : p)) : next
}

/** Nur-Verkündiger (kein Ältester/Dienstamtgehilfe) — Pool für Gesprächsteile. */
export function isPlainPublisher(p: Person): boolean {
  return p.role === 'verkuendiger'
}

/**
 * Auslastung nur aus **Programmpunkten** (Aufgaben) über die gegebenen Wochen.
 * Zählt wie der Prototyp auch Begleiter-Erwähnungen im Rollenlabel
 * ("mit A. Hoffmann") — wer begleitet, hat ebenfalls eine Aufgabe.
 *
 * Beide Räume zählen: ein Schülerteil in der Zusätzlichen Klasse (`item.aux`)
 * ist dieselbe Aufgabe wie im Hauptsaal, und der Ratgeber der Klasse ist
 * ebenfalls eingeteilt. Wurden sie nicht mitgezählt, galt genau die Hälfte
 * aller Schulungsaufgaben als „frei" — wer in der Klasse dran war, stand in der
 * Strichliste weiter bei null und wurde gleich wieder gewählt.
 *
 * Die Begleiter-Erwähnung wird nur im Hauptsaal gezählt: `angleichen` kopiert
 * die Rollenbeschriftung in die Klasse ("Regeln folgen immer dem Hauptsaal"),
 * sie dort erneut zu zählen verdoppelte dieselbe Begleitung.
 */
export function partWorkload(weeks: Week[], name: string): number {
  if (!name) return 0
  let count = 0
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      if (meeting.auxRatgeber?.name === name) count++
      for (const section of meeting.sections) {
        for (const item of section.items) {
          if (isSong(item)) continue
          for (const slot of item.names) {
            if (slot.name === name) count++
            if (slot.rolle?.includes(name)) count++
          }
          for (const slot of item.aux ?? []) if (slot.name === name) count++
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
        for (const slot of assigned) if (slot.name === name) count++
      }
    }
  }
  return count
}

/** Gesamt-Auslastung (Programmpunkte + Hilfsdienste) über die gegebenen Wochen. */
export function workloadOf(weeks: Week[], name: string): number {
  return partWorkload(weeks, name) + helperWorkload(weeks, name)
}

/** Belegungsart einer Person in EINER Woche (für die Mini-Quadrate). */
export type WeekLoad = 'void' | 'none' | 'task' | 'helper'

/**
 * Radius des Auslastungs-Fensters: so viele Wochen vor und nach der geplanten
 * zählen mit.
 *
 * Einzige Quelle dieser Zahl — für die **Anzeige** (Mini-Quadrate und „… in 5
 * Wochen" im Zuteilungs-Sheet) und für die **Entscheidung** der automatischen
 * Zuteilung. Das waren lange zwei verschiedene Zahlen: gezeigt wurden 5 Wochen,
 * sortiert wurde nach 7. Der Planer las also unter dem Namen eine Zahl, nach der
 * gar nicht sortiert worden war. Gemessen macht die Weite keinen Unterschied
 * mehr (30 Schwestern über ein Jahr: 10–11 Aufgaben bei ±2 wie bei ±3, ein
 * 4er-Ton-Pool jeweils exakt 26/26/26/26), seit die Wartezeit die Fairness
 * trägt — also gilt die Zahl, die man auch sieht.
 *
 * Sie stand früher dreifach da: als Literal beim Ausschneiden der Wochen, als
 * Literal beim Aufruf und ausgeschrieben in 34 Übersetzungen („… in 5 Wochen").
 * Beim letzten Wechsel von 4 auf 5 blieben drei Sprachen bei der alten Zahl
 * stehen; deshalb wird sie in den Text eingesetzt statt hineingeschrieben.
 */
export const LOAD_RADIUS = 2

/** Wie viele Wochen das Auslastungs-Fenster umfasst (aktuelle + beide Seiten). */
export const LOAD_WEEKS = LOAD_RADIUS * 2 + 1

/**
 * Belegung je Woche im ±`radius`-Fenster um `wi` (Standard LOAD_RADIUS).
 * `void` = keine solche Woche geladen, `none` = frei, `task` = Programmpunkt
 * (Aufgabe), `helper` = nur Hilfsdienst (Aufgabe hat Vorrang, falls beides in
 * derselben Woche).
 */
export function loadWindow(weeks: Week[], name: string, wi: number, radius = LOAD_RADIUS): WeekLoad[] {
  const out: WeekLoad[] = []
  for (let i = wi - radius; i <= wi + radius; i++) {
    const week = weeks[i]
    if (!week) out.push('void')
    else if (partWorkload([week], name) > 0) out.push('task')
    else if (helperWorkload([week], name) > 0) out.push('helper')
    else out.push('none')
  }
  return out
}
