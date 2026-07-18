/**
 * Sprachvarianten einer Woche (Week.alt): beim Import mitgeholte, struktur-
 * gleiche Fassungen des Programms in weiteren Sprachen. `localizedWeek`
 * übernimmt daraus nur die Texte (Titel, Meta, Lieder, Labels, Datum) — die
 * Zuteilungen (names/helpers), Flags und die Struktur bleiben kanonisch, denn
 * die Slot-Indizes sind über alle jw.org-Sprachfassungen identisch.
 */

import { isSong } from './helpers'
import type { Meeting, Week } from './types'

/** Texte einer Zusammenkunft aus der Variante übernehmen (Struktur muss passen). */
function mergeMeeting(target: Meeting, alt: Meeting): void {
  // Defensive: weicht die Struktur ab (z. B. nach nicht gespiegelten Edits),
  // bleibt die ganze Zusammenkunft kanonisch — falsche Titelzuordnung wäre
  // schlimmer als die falsche Sprache.
  if (alt.sections.length !== target.sections.length) return
  const aligned = target.sections.every(
    (s, si) => alt.sections[si].items.length === s.items.length,
  )
  if (!aligned) return

  if (alt.date) target.date = alt.date
  if (alt.end) target.end = alt.end
  target.sections.forEach((section, si) => {
    const altSection = alt.sections[si]
    if (altSection.label) section.label = altSection.label
    section.items.forEach((item, ii) => {
      const altItem = altSection.items[ii]
      if (isSong(item) && isSong(altItem)) {
        item.song = altItem.song
      } else if (!isSong(item) && !isSong(altItem)) {
        item.title = altItem.title
        if (altItem.meta) item.meta = altItem.meta
      }
    })
  })
}

/**
 * Woche in der Sprachvariante `jwCode` (jw.org-Code) — oder unverändert, wenn
 * keine Variante vorliegt. Gleiche Referenz zurück = keine Variante aktiv.
 */
export function localizedWeek(week: Week, jwCode: string | null | undefined): Week {
  const alt = jwCode ? week.alt?.[jwCode] : undefined
  if (!alt) return week
  const merged = structuredClone(week)
  if (alt.range) merged.range = alt.range
  if (alt.book) merged.book = alt.book
  mergeMeeting(merged.mid, alt.mid)
  mergeMeeting(merged.we, alt.we)
  return merged
}

/** Alle Wochen in der Variante `jwCode` (für die Aufgaben-Ableitung). */
export function localizedWeeks(weeks: Week[], jwCode: string | null | undefined): Week[] {
  if (!jwCode || !weeks.some((w) => w.alt?.[jwCode])) return weeks
  return weeks.map((w) => localizedWeek(w, jwCode))
}

/** Eine importierte Woche, der Sprachvarianten fehlen (Nachimport-Kandidat). */
export interface MissingVariants {
  wi: number // Wochenindex
  start: string // ISO-Startdatum (identifiziert die Woche auf jw.org)
  lang: string // Primärsprache der Woche (jw.org-Code)
  codes: string[] // fehlende Varianten-Sprachcodes
}

/**
 * Importierte Wochen (mit `start`), denen für die konfigurierten
 * Programmsprachen `altCodes` noch Varianten fehlen — etwa weil eine Sprache
 * erst nach dem Import hinzugefügt wurde. `fallbackLang` gilt für Alt-Wochen
 * ohne gespeicherte Herkunftssprache.
 */
export function missingVariants(
  weeks: Week[],
  altCodes: string[],
  fallbackLang: string,
): MissingVariants[] {
  const out: MissingVariants[] = []
  weeks.forEach((week, wi) => {
    if (!week.start) return // Demo-/Vorlagen-Wochen sind nicht nachladbar
    const lang = week.lang ?? fallbackLang
    const codes = altCodes.filter((c) => c !== lang && !week.alt?.[c])
    if (codes.length > 0) out.push({ wi, start: week.start, lang, codes })
  })
  return out
}
