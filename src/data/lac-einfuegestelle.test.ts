import { describe, expect, it } from 'vitest'
import { isSong } from './helpers'
import { lacAdd, lacAddIndex } from './meeting-edit'
import type { Meeting, PartItem, ProgramItem, Week } from './types'

/**
 * T61 — die Einfügestelle für einen eigenen Punkt ist strukturell, nicht
 * deutsch.
 *
 * `lacAddIndex` suchte das Versammlungsbibelstudium mit
 * `title.startsWith('Versammlungsbibelstudium')`. Bei fremdsprachiger
 * Versammlungssprache trifft das nie — der neue Punkt landete dann **hinter**
 * dem Bibelstudium statt davor. Gutartiger als T32 (es passiert etwas, nur an
 * der falschen Stelle), aber dieselbe Familie: eine deutsche Annahme in einer
 * Datei, die alle Sprachen bedienen muss.
 *
 * Erkannt wird das Bibelstudium jetzt an seinem **Leser-Slot**. Den vergibt der
 * Import genau einmal je Zusammenkunft, unabhängig von der Sprache.
 */

/** Der letzte Unser-Leben-Punkt, wie ihn der Import anlegt: Leiter + Leser. */
function bibelstudium(title: string): PartItem {
  return {
    num: 7,
    title,
    meta: '30 Min.',
    mins: 30,
    names: [
      { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
      { name: '', rolle: 'Leser', bereichsKey: 'leser' },
    ],
  }
}

/** Ein gewöhnlicher Punkt unter „Unser Leben als Christ" — ohne Leser. */
function punkt(num: number, title: string): PartItem {
  return { num, title, meta: '15 Min.', mins: 15, names: [{ name: '', bereichsKey: 'studium' }] }
}

/** Minimale Woche mit genau einem LAC-Abschnitt. KEIN übernommener jw.org-Inhalt. */
function wocheMit(items: ProgramItem[]): Week[] {
  const meeting = (): Meeting => ({
    date: 'Dienstag, 8. September · 19:00',
    end: 'Ende ca. 20:45',
    sections: [{ label: 'UNSER LEBEN ALS CHRIST', farbe: 'wein', items: structuredClone(items) }],
    helpers: {},
  })
  return [{ range: '7.–13. September', book: '', current: true, mid: meeting(), we: meeting() }]
}

const titelIndex = (items: ProgramItem[], title: string) =>
  items.findIndex((i) => !isSong(i) && (i as PartItem).title === title)

describe('lacAddIndex findet das Bibelstudium in jeder Sprache', () => {
  // Titel aus `translate-data.ts` — dieselbe Struktur, andere Schrift.
  const sprachen: Array<[string, string]> = [
    ['Deutsch', 'Versammlungsbibelstudium'],
    ['Englisch', 'Congregation Bible Study'],
    ['Japanisch', '会衆聖書研究'],
    ['Hebräisch', 'שיעור המקרא הקהילתי'],
    ['Arabisch', 'درس الجماعة للكتاب المقدس'],
    ['Griechisch', 'Εκκλησιαστική Γραφική Μελέτη'],
  ]

  it.each(sprachen)('%s: der neue Punkt landet davor', (_sprache, titel) => {
    const items = [punkt(6, 'Bedürfnisse der Versammlung'), bibelstudium(titel)]
    expect(lacAddIndex(items)).toBe(1)

    const w = lacAdd(wocheMit(items), 0, 'mid', 0, 'Örtliche Hinweise')
    const next = w[0].mid.sections[0].items
    expect(titelIndex(next, 'Örtliche Hinweise')).toBeLessThan(titelIndex(next, titel))
  })
})

describe('Grenzfälle der Einfügestelle', () => {
  it('ohne Leser-Slot ans Ende — die Kreisaufseher-Woche hat kein Bibelstudium', () => {
    // Der Dienstvortrag ersetzt es; dann gibt es keine Stelle, vor die es müsste.
    const items = [punkt(6, 'Bedürfnisse der Versammlung'), punkt(7, 'Dienstvortrag')]
    expect(lacAddIndex(items)).toBe(2)
  })

  it('leerer Abschnitt ergibt Position 0', () => {
    expect(lacAddIndex([])).toBe(0)
  })

  it('Lieder zählen mit, werden aber nie als Bibelstudium gelesen', () => {
    const items: ProgramItem[] = [{ song: 'Lied 100' }, bibelstudium('会衆聖書研究')]
    expect(lacAddIndex(items)).toBe(1)
  })

  it('zwei eigene Punkte reihen sich hintereinander, beide vor dem Bibelstudium', () => {
    // Die neuen Punkte tragen nur `studium`, keinen Leser — sonst würde der
    // zweite vor dem ersten einsortiert und die Reihenfolge kehrte sich um.
    const w1 = lacAdd(wocheMit([bibelstudium('Congregation Bible Study')]), 0, 'mid', 0, 'Erster')
    const w2 = lacAdd(w1, 0, 'mid', 0, 'Zweiter')
    const items = w2[0].mid.sections[0].items
    expect(items.map((i) => (isSong(i) ? '' : (i as PartItem).title))).toEqual([
      'Erster',
      'Zweiter',
      'Congregation Bible Study',
    ])
  })
})
