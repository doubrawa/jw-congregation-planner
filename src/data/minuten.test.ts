import { describe, expect, it } from 'vitest'
import { itemMinutes, lacAdjust } from './meeting-edit'
import type { Meeting, PartItem, Week } from './types'
import { ersteZahl, ersteZahlErsetzen, zahl, zahlErsetzen, zahlWieVorlage } from './ziffern'

/**
 * Die Minuten eines Programmpunkts, sprachunabhängig (T32).
 *
 * Der Fehler war nicht, dass ein Ausdruck zu eng war — er war, dass eine Zahl
 * aus einem Anzeigetext zurückgelesen wurde. Die Wochenseite schreibt sie in
 * der Sprache und der Schrift der Ausgabe; `/(\d+) Min\./` traf davon genau
 * eine. Gemessen an 19 echten Sprachfassungen (siehe nachtrag-sprachen.md).
 *
 * Alle Meta-Zeilen hier sind nachgebaut, kein übernommener jw.org-Inhalt.
 */

/** Wie die Zeitangabe in den gemessenen Sprachen aussieht. */
const SPRACHEN: Array<[string, string, number]> = [
  ['de', '3 Min.', 3],
  ['en', '3 min.', 3],
  ['sw', 'Dak. 3', 3], // Latein, westliche Ziffern — und trotzdem verfehlt
  ['ja', '3分', 3],
  ['cmn-hans', '3 分钟', 3],
  ['ar', '٣ دق', 3], // arabisch-indische Ziffern
  ['fa', '۳ دقیقه', 3], // erweiterte arabisch-indische — anderer Block!
  ['hi', '३ मि.', 3],
  ['th', '3 นาที', 3],
  ['el', '3 λεπτά', 3],
  ['he', '3 דק׳', 3],
]

describe('Ziffern fremder Schriften', () => {
  it.each(SPRACHEN)('%s: „%s“ ergibt %i', (_lang, text, wert) => {
    expect(ersteZahl(text)).toBe(wert)
  })

  it('liest mehrstellige Zahlen in jeder Schrift', () => {
    expect(zahl('١٥')).toBe(15)
    expect(zahl('۱۵')).toBe(15)
    expect(zahl('१५')).toBe(15)
    expect(zahl('１５')).toBe(15) // vollbreit
    expect(zahl('15')).toBe(15)
  })

  it('schreibt in der Schrift der Vorlage zurück', () => {
    // Aus „٣“ wird „١٥“ — nicht „15“. Eine westliche Zahl mitten in einem
    // arabischen Programm wäre für den Leser ein Fremdkörper.
    expect(zahlWieVorlage(15, '٣')).toBe('١٥')
    expect(zahlWieVorlage(15, '۳')).toBe('۱۵')
    expect(zahlWieVorlage(15, '३')).toBe('१५')
    expect(zahlWieVorlage(15, '3')).toBe('15')
    expect(zahlWieVorlage(15, 'ohne Ziffer')).toBe('15')
  })

  it('ersetzt nur die erste Zahl und lässt den Rest stehen', () => {
    expect(ersteZahlErsetzen('٣ دق', 15)).toBe('١٥ دق')
    expect(ersteZahlErsetzen('Dak. 3', 15)).toBe('Dak. 15')
    // Thailändisch: die Quellenangabe bringt zwei weitere Zahlen mit, die
    // nichts mit der Dauer zu tun haben.
    expect(ersteZahlErsetzen('3 นาที · lmd บทเรียน 1 ข้อ 5', 15)).toBe(
      '15 นาที · lmd บทเรียน 1 ข้อ 5',
    )
  })

  it('lässt einen Text ohne Ziffer unverändert', () => {
    expect(ersteZahlErsetzen('Lied · Gebet', 15)).toBe('Lied · Gebet')
    expect(ersteZahl('Lied · Gebet')).toBeNull()
  })
})

describe('itemMinutes', () => {
  it('nimmt das Feld, wenn es da ist', () => {
    expect(itemMinutes({ title: 'x', meta: '3 Min.', mins: 10, names: [] })).toBe(10)
  })

  it.each(SPRACHEN)('%s: liest Altdaten ohne Feld aus der Meta-Zeile', (_lang, meta, wert) => {
    // Wochen, die vor dieser Änderung importiert wurden, haben kein `mins`.
    // Sie müssen ohne erneuten Import weiterfunktionieren — sonst stünden alle
    // bestehenden fremdsprachigen Versammlungen weiter ohne Minuten da.
    expect(itemMinutes({ title: 'x', meta, names: [] })).toBe(wert)
  })

  it('nimmt die erste Zahl, nicht irgendeine', () => {
    // Die Meta-Zeile ist „Rahmen · Zeit · Quelle“. Der Rahmen enthält per
    // Konstruktion keine Ziffer (settingOf verwirft ziffernhaltige Segmente),
    // und ohne Zeitangabe entsteht gar keine Meta-Zeile. Die erste Zahl ist
    // deshalb immer die Dauer — auch wenn die Quelle weitere mitbringt.
    expect(itemMinutes({ title: 'x', meta: '3 นาที · lmd บทเรียน 1 ข้อ 5', names: [] })).toBe(3)
    expect(itemMinutes({ title: 'x', meta: 'VON HAUS ZU HAUS · 3 Min. · lmd Lektion 1', names: [] })).toBe(3)
  })

  it('ohne Meta und ohne Feld: keine Minuten', () => {
    // Eröffnungslied und Gebet haben keine Dauer — dort dürfen die
    // Minuten-Knöpfe auch nicht erscheinen.
    expect(itemMinutes({ title: 'Lied · Gebet', names: [] })).toBeNull()
  })

  it('der alte Ausdruck hätte in 9 von 11 Fassungen versagt', () => {
    // Festgehalten, damit der Rückschritt sichtbar wäre: nicht „ein Sonderfall
    // fehlt“, sondern „die Annahme war deutsch“.
    const alt = /(\d+) Min\./
    const getroffen = SPRACHEN.filter(([, meta]) => alt.test(meta)).map(([l]) => l)
    expect(getroffen).toEqual(['de'])
  })
})

describe('lacAdjust in fremder Sprache', () => {
  it('ändert Zahl und Anzeigetext — und zwar in dessen eigener Schrift', () => {
    const w = lacAdjust([woche('١٠ دق', 10)], 0, 'mid', 0, 0, 5)
    const item = w[0].mid.sections[0].items[0] as PartItem
    expect(item.mins).toBe(15)
    expect(item.meta).toBe('١٥ دق')
    expect(w[0].mid.end).toBe('Ende ca. 20:50')
  })

  it('greift auch bei Altdaten ohne Feld', () => {
    const w = lacAdjust([woche('10 分')], 0, 'mid', 0, 0, 5)
    const item = w[0].mid.sections[0].items[0] as PartItem
    expect(item.mins).toBe(15)
    expect(item.meta).toBe('15 分')
  })

  it('zieht die Sprachvarianten mit', () => {
    // Die Variante zeigt denselben Punkt in einer anderen Sprache. Bliebe ihre
    // Meta-Zeile stehen, zeigte ein Sprachwechsel die alte Dauer.
    const w0 = woche('10 Min.', 10)
    w0.alt = { ja: woche('10 分', 10) }
    const w = lacAdjust([w0], 0, 'mid', 0, 0, 5)
    const variante = w[0].alt!.ja.mid.sections[0].items[0] as PartItem
    expect(variante.mins).toBe(15)
    expect(variante.meta).toBe('15 分')
    expect(w[0].alt!.ja.mid.end).toBe('Ende ca. 20:50')
  })

  it('hält die Grenzen 5 und 45 ein', () => {
    expect(minutenNach(woche('10 Min.', 10), -100)).toBe(5)
    expect(minutenNach(woche('10 Min.', 10), 100)).toBe(45)
  })
})

function minutenNach(w0: Week, delta: number): number | null {
  const w = lacAdjust([w0], 0, 'mid', 0, 0, delta)
  return itemMinutes(w[0].mid.sections[0].items[0] as PartItem)
}

/** Kleinste Woche, die `lacAdjust` braucht: ein Punkt, eine Endzeit. */
function woche(meta: string, mins?: number): Week {
  const item: PartItem = { title: 'Punkt', meta, names: [] }
  if (mins != null) item.mins = mins
  const mid: Meeting = {
    date: '7.–13. September',
    end: 'Ende ca. 20:45',
    sections: [{ label: 'UNSER LEBEN ALS CHRIST', farbe: 'wein', items: [item] }],
    helpers: {},
  }
  return { range: '7.–13. September', book: '', current: false, mid, we: structuredClone(mid) }
}

describe('zahlErsetzen — eine bestimmte Zahl, nicht die erste', () => {
  /*
    Beim Wachtturm-Studium beginnt die Meta-Zeile mit der Nummer des
    Studienartikels, nicht mit der Dauer. `ersteZahlErsetzen` machte aus
    „Studienartikel 28 · 60 Min." beim Kürzen ein „Studienartikel 30 · 60 Min.":
    die Dauer blieb, der Artikel wurde ein anderer. Gefunden vom Test zu T62.
  */
  it('trifft die Dauer, nicht die Artikelnummer', () => {
    expect(zahlErsetzen('Studienartikel 28 · 60 Min.', 60, 30)).toBe('Studienartikel 28 · 30 Min.')
  })

  it('vergleicht über den Wert, nicht über die Zeichen', () => {
    // „٦٠" und 60 sind dieselbe Zahl — und ersetzt wird in der Schrift, die
    // dort steht.
    expect(zahlErsetzen('المقالة ٢٨ · ٦٠ دق', 60, 30)).toBe('المقالة ٢٨ · ٣٠ دق')
    expect(zahlErsetzen('研究記事 28 · 60 分', 60, 30)).toBe('研究記事 28 · 30 分')
  })

  it('lässt den Text in Ruhe, wenn die Zahl nicht vorkommt', () => {
    expect(zahlErsetzen('Studienartikel 28 · 45 Min.', 60, 30)).toBe('Studienartikel 28 · 45 Min.')
    expect(zahlErsetzen('ohne Ziffern', 60, 30)).toBe('ohne Ziffern')
  })

  it('nimmt das erste Vorkommen, wenn die Zahl zweimal dasteht', () => {
    expect(zahlErsetzen('30 · Kapitel 30', 30, 15)).toBe('15 · Kapitel 30')
  })
})
