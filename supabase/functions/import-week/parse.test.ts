import { describe, expect, it } from 'vitest'
import {
  applyGoldSlots,
  ministryNames,
  parseWorkbookWeek,
  weekendTemplate,
  type ImportedPart,
  type ImportedSong,
  type ImportedWeek,
} from './parse'
import { gedaechtnismahlWoche } from './gedaechtnismahl'
import { neueItemId } from '../_shared/zuteilungen.ts'

describe('applyGoldSlots – Schülerteil-Art aus der deutschen Fassung übertragen', () => {
  const emptyMeeting = () => ({ date: '', end: '', sections: [], helpers: {} })
  const withGold = (items: unknown[]): ImportedWeek =>
    ({
      range: '', book: '', current: false, we: emptyMeeting(),
      mid: { date: '', end: '', helpers: {}, sections: [{ label: '', farbe: 'gold', items }] },
    }) as ImportedWeek

  it('übernimmt Führer+Partner bzw. männlichen Vortrag positionsgenau', () => {
    const german = withGold([
      { title: 'Gespräche beginnen', names: ministryNames('Gespräche beginnen', '3 Min.') },
      { title: 'Vortrag', names: ministryNames('Vortrag', '5 Min.') },
    ])
    // lokalisierte Woche: die Heuristik griff nicht → je 1 Slot
    const localized = withGold([
      { title: 'Starting a Conversation', names: [{ name: '', bereichsKey: 'schulung' }] },
      { title: 'Talk', names: [{ name: '', bereichsKey: 'schulung' }] },
    ])
    applyGoldSlots(localized, german)
    const gold = localized.mid.sections[0].items as ImportedPart[]
    expect(gold[0].names.map((n) => n.bereichsKey)).toEqual(['schulung', 'schulungPartner'])
    expect(gold[1].names[0]).toMatchObject({ bereichsKey: 'schulung', male: true })
  })
})

describe('ministryNames – Slots je Schülerteil-Typ (deutscher Titel)', () => {
  it('Gesprächsteile → Führer (schulung) + Gesprächspartner (schulungPartner)', () => {
    for (const title of ['Gespräche beginnen', 'Interesse fördern', 'Menschen zu Jüngern machen']) {
      const n = ministryNames(title, 'Von Haus zu Haus · 3 Min.')
      expect(n.map((s) => s.bereichsKey)).toEqual(['schulung', 'schulungPartner'])
      expect(n[1].rolle).toBe('Partner')
    }
  })

  it('Vortrag/Ansprache → genau ein männlicher Slot', () => {
    const n = ministryNames('Vortrag', '5 Min.')
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ bereichsKey: 'schulung', male: true })
  })

  it('Unsere Glaubensansichten: mit Predigtdienst-Rahmen → 2 (Szene), sonst 1 (Ansprache, männlich)', () => {
    expect(ministryNames('Unsere Glaubensansichten erklären', 'Informell · 4 Min.')).toHaveLength(2)
    const talk = ministryNames('Unsere Glaubensansichten erklären', '5 Min.')
    expect(talk).toHaveLength(1)
    expect(talk[0].male).toBe(true)
  })

  it('unbekannter Titel → 1 Slot schulung (Partner ggf. manuell)', () => {
    const n = ministryNames('Etwas ganz Neues', '5 Min.')
    expect(n).toEqual([{ name: '', bereichsKey: 'schulung' }])
  })
})

// Synthetische Fixtures: bilden nur die *Struktur* der jw.org-Wochenseite nach
// (Tags, data-pid, Farbklassen, Noten-Icon, 1./2./3.-Nummer, „(Zahl …)“-Zeit) —
// KEIN übernommener jw.org-Inhalt.

const FIXTURE_DE = `
<article>
  <h1 data-pid="1" class="du-color--textSubdued">6.-12. Juli</h1>
  <h2 data-pid="2" class="du-fontSize--base">MUSTERBUCH 13-15</h2>
  <h3 data-pid="3" class="x"><span class="dc-icon--music"></span> Lied 123 und Gebet | Einleitende Worte (1 Min.)</h3>

  <h2 data-pid="4" class="du-color--teal-700">SCHÄTZE AUS GOTTES WORT</h2>
  <h3 data-pid="5" class="du-color--teal-700">1. Erster Vortrag</h3>
  <p data-pid="6">(10 Min.)</p>
  <h3 data-pid="16" class="du-color--teal-700">3. Bibellesung</h3>
  <p data-pid="17">(4 Min.) Mus 13:1-14 ( th Lektion 2 )</p>

  <h2 data-pid="18" class="du-color--gold-700">UNS IM DIENST VERBESSERN</h2>
  <h3 data-pid="19" class="du-color--gold-700">4. Gespräche beginnen</h3>
  <p data-pid="20">(3 Min.) VON HAUS ZU HAUS. Irgendein Text. ( lmd Lektion 1 Punkt 5 )</p>

  <h2 data-pid="25" class="du-color--maroon-600">UNSER LEBEN ALS CHRIST</h2>
  <h3 data-pid="26" class="x"><span class="dc-icon--music"></span> Lied 49</h3>
  <h3 data-pid="27" class="du-color--maroon-600">7. Örtliche Besprechung</h3>
  <p data-pid="28">(15 Min.) Besprechung.</p>
  <h3 data-pid="45" class="du-color--maroon-600">8. Versammlungs&shy;bibelstudium</h3>
  <p data-pid="46">(30 Min.) lfb Geschichte 100-101</p>
  <h3 data-pid="47" class="x"><span class="dc-icon--music"></span> Schlussworte (3 Min.) | Lied 61 und Gebet</h3>
</article>`

describe('parseWorkbookWeek (Struktur, deutsche Seite)', () => {
  const wk = parseWorkbookWeek(FIXTURE_DE)
  const mid = wk.mid
  const byLabel = (label: string) => mid.sections.find((s) => s.label === label)!
  const parts = (label: string) => byLabel(label).items.filter((i) => 'names' in i) as ImportedPart[]

  it('liest Wochenbereich und Bibelbuch', () => {
    expect(wk.range).toBe('6.–12. Juli') // Bindestrich → Halbgeviertstrich
    expect(wk.book).toBe('MUSTERBUCH 13-15')
  })

  it('baut Eröffnung mit Vorsitz + Anfangsgebet', () => {
    const open = byLabel('ERÖFFNUNG').items[0] as ImportedPart
    expect(open.title).toContain('Lied 123')
    expect(open.meta).toBe('1 Min.')
    expect(open.names.map((n) => n.rolle)).toEqual(['Vorsitz', 'Gebet'])
    expect(open.names.map((n) => n.bereichsKey)).toEqual(['vorsitzMid', 'gebet'])
  })

  it('mappt Farbklassen auf Sektionen und Qualifikationen', () => {
    expect(byLabel('SCHÄTZE AUS GOTTES WORT').farbe).toBe('petrol')
    expect(byLabel('UNS IM DIENST VERBESSERN').farbe).toBe('gold')
    expect(byLabel('UNSER LEBEN ALS CHRIST').farbe).toBe('wein')
    expect(parts('SCHÄTZE AUS GOTTES WORT')[0].names[0].bereichsKey).toBe('vortrag')
    expect(parts('UNS IM DIENST VERBESSERN')[0].names[0].bereichsKey).toBe('schulung')
  })

  it('Bibellesung (= letzter Schätze-Punkt): Schriftstelle im Titel, Quelle in Meta', () => {
    const bl = parts('SCHÄTZE AUS GOTTES WORT').at(-1)!
    expect(bl.title).toBe('Bibellesung · Mus 13:1-14')
    expect(bl.meta).toBe('4 Min. · th Lektion 2')
    expect(bl.names[0].bereichsKey).toBe('bibellesung')
  })

  it('Dienst-Rahmen wird wörtlich übernommen (verbatim, sprachunabhängig)', () => {
    expect(parts('UNS IM DIENST VERBESSERN')[0].meta).toBe('VON HAUS ZU HAUS · 3 Min. · lmd Lektion 1 Punkt 5')
  })

  it('Besprechung als Rahmen übernommen', () => {
    const p = parts('UNSER LEBEN ALS CHRIST').find((x) => x.title === 'Örtliche Besprechung')!
    expect(p.meta).toBe('Besprechung · 15 Min.')
  })

  it('Zwischenlied als eigenes Item in „Unser Leben als Christ“', () => {
    const song = byLabel('UNSER LEBEN ALS CHRIST').items.find((i) => 'song' in i) as ImportedSong
    expect(song.song).toBe('Lied 49')
  })

  it('Versammlungsbibelstudium (= letzter Punkt): Soft-Hyphen weg, Leiter + Leser', () => {
    const vbs = parts('UNSER LEBEN ALS CHRIST').at(-1)!
    expect(vbs.title).toBe('Versammlungsbibelstudium')
    expect(vbs.meta).toBe('30 Min. · lfb Geschichte 100-101')
    expect(vbs.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Leiter:studium', 'Leser:leser'])
  })

  it('Abschluss mit Schlussgebet', () => {
    const close = byLabel('ABSCHLUSS').items[0] as ImportedPart
    expect(close.title).toContain('Lied 61')
    expect(close.names[0].bereichsKey).toBe('gebet')
  })

  it('erzeugt eine Wochenend-Vorlage (nicht im Arbeitsheft)', () => {
    expect(wk.we.sections.map((s) => s.label)).toEqual([
      'ERÖFFNUNG',
      'ÖFFENTLICHER VORTRAG',
      'WACHTTURM-STUDIUM',
      'ABSCHLUSS',
    ])
  })
})

// Identische Struktur, aber eine erfundene Sprache ohne ein einziges deutsches/
// englisches Schlüsselwort. Beweist, dass die Erkennung rein strukturell/
// positionell ist (Farben, Noten-Icon, Nummer, Zeitklammer, Reihenfolge) und der
// sichtbare Text 1:1 aus der Zielsprache übernommen wird. Die Rollen-Schlüssel
// (Vorsitz/Gebet/Leiter/Leser) und ERÖFFNUNG/ABSCHLUSS bleiben kanonisch deutsch,
// da sie Logik-Schlüssel bzw. app-sprachige Labels sind.
const FIXTURE_XX = `
<article>
  <h1 data-pid="1" class="du-color--textSubdued">Zap 6-12</h1>
  <h2 data-pid="2" class="du-fontSize--base">QORBLA 13-15</h2>
  <h3 data-pid="3" class="x"><span class="dc-icon--music"></span> Xylo 123 qi Preku | Vorqi Blen (1 vim)</h3>

  <h2 data-pid="4" class="du-color--teal-700">XORBI SATO</h2>
  <h3 data-pid="5" class="du-color--teal-700">1. Prva Vorbo</h3>
  <p data-pid="6">(10 vim)</p>
  <h3 data-pid="16" class="du-color--teal-700">3. Librolekt</h3>
  <p data-pid="17">(4 vim) Qor 13:1-14 ( th plek 2 )</p>

  <h2 data-pid="18" class="du-color--gold-700">SERVO XI</h2>
  <h3 data-pid="19" class="du-color--gold-700">4. Konvo Beg</h3>
  <p data-pid="20">(3 vim) DOMO XI DOMO. Bla bla frob. ( lmd plek 1 puno 5 )</p>

  <h2 data-pid="25" class="du-color--maroon-600">VIVO KRISTO</h2>
  <h3 data-pid="26" class="x"><span class="dc-icon--music"></span> Xylo 49</h3>
  <h3 data-pid="27" class="du-color--maroon-600">7. Loka Diskuto</h3>
  <p data-pid="28">(15 vim) Diskuto.</p>
  <h3 data-pid="45" class="du-color--maroon-600">8. Kongreso Librostudo</h3>
  <p data-pid="46">(30 vim) lfb geso 100-101</p>
  <h3 data-pid="47" class="x"><span class="dc-icon--music"></span> Finvorbo (3 vim) | Xylo 61 qi Preku</h3>
</article>`

describe('parseWorkbookWeek (sprachunabhängig, erfundene Sprache)', () => {
  const wk = parseWorkbookWeek(FIXTURE_XX)
  const byLabel = (label: string) => wk.mid.sections.find((s) => s.label === label)!
  const parts = (label: string) => byLabel(label).items.filter((i) => 'names' in i) as ImportedPart[]

  it('übernimmt Datum, Buch und Sektions-Überschriften wörtlich', () => {
    expect(wk.range).toBe('Zap 6–12')
    expect(wk.book).toBe('QORBLA 13-15')
    expect(wk.mid.sections.map((s) => s.label)).toEqual([
      'ERÖFFNUNG', // unser Label bleibt deutsch
      'XORBI SATO',
      'SERVO XI',
      'VIVO KRISTO',
      'ABSCHLUSS',
    ])
    expect(byLabel('XORBI SATO').farbe).toBe('petrol')
    expect(byLabel('VIVO KRISTO').farbe).toBe('wein')
  })

  it('Eröffnung strukturell erkannt (Titel lokalisiert, Rollen kanonisch)', () => {
    const open = byLabel('ERÖFFNUNG').items[0] as ImportedPart
    expect(open.title).toBe('Xylo 123 qi Preku · Vorqi Blen')
    expect(open.meta).toBe('1 vim')
    expect(open.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Vorsitz:vorsitzMid', 'Gebet:gebet'])
  })

  it('Bibellesung = letzter Schätze-Punkt (Position, nicht Text)', () => {
    const bl = parts('XORBI SATO').at(-1)!
    expect(bl.title).toBe('Librolekt · Qor 13:1-14')
    expect(bl.meta).toBe('4 vim · th plek 2')
    expect(bl.names[0].bereichsKey).toBe('bibellesung')
  })

  it('Rahmen + Minuten wörtlich (verbatim), Quelle über MEPS-Kürzel', () => {
    expect(parts('SERVO XI')[0].meta).toBe('DOMO XI DOMO · 3 vim · lmd plek 1 puno 5')
    expect(parts('SERVO XI')[0].names[0].bereichsKey).toBe('schulung')
  })

  it('Zwischenlied lokalisiert übernommen', () => {
    const song = byLabel('VIVO KRISTO').items.find((i) => 'song' in i) as ImportedSong
    expect(song.song).toBe('Xylo 49')
  })

  it('VBS = letzter Unser-Leben-Punkt (Position): Leiter + Leser', () => {
    const vbs = parts('VIVO KRISTO').at(-1)!
    expect(vbs.title).toBe('Kongreso Librostudo')
    expect(vbs.meta).toBe('30 vim · lfb geso 100-101')
    expect(vbs.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Leiter:studium', 'Leser:leser'])
  })

  it('Abschluss strukturell erkannt (Schlussgebet)', () => {
    const close = byLabel('ABSCHLUSS').items[0] as ImportedPart
    expect(close.title).toBe('Finvorbo · Xylo 61 qi Preku')
    expect(close.names[0].bereichsKey).toBe('gebet')
  })
})

/**
 * **Jeder importierte Punkt trägt eine eigene Kennung — daran hängt alles.**
 *
 * Seit dem 17. September 2026 ist `iid` Pflichtfeld, und der Aufgaben-Schlüssel
 * hat nur noch eine Form: `<woche>|<mid|we>|part|<iid>|<platz>`. Damit fielen
 * die Lade-Migration, die sie nachtrug, und die ganze Umbenennungs-Mechanik
 * beim Einfügen und Verschieben weg (T104).
 *
 * Der Compiler hält das an den Objektliteralen fest — aber nur dort. Er sagt
 * nichts über die Wege, die Punkte **nachträglich** anfassen (`applyGoldSlots`,
 * `applyStudy` in index.ts, `stripVariant`), und nichts über Eindeutigkeit.
 * Genau das prüft dieser Block, und zwar an jeder Stelle, an der eine Woche
 * entsteht: die geparste Wochenseite, die Wochenend-Vorlage und die Woche des
 * Gedächtnismahls.
 *
 * Bliebe eine Kennung aus, wäre der Schaden still: Der Schlüssel hieße
 * `…|part|undefined|0`, die Bestätigung des Eingeteilten landete unter einem
 * anderen, und `send-reminders` erinnerte ihn Tag für Tag an dieselbe Aufgabe.
 */
describe('Kennungen: jeder Punkt hat genau eine, und keine doppelt', () => {
  /** Alle Programmpunkte beider Zusammenkünfte einer importierten Woche. */
  const punkte = (w: ImportedWeek): ImportedPart[] =>
    [w.mid, w.we].flatMap((m) => m.sections.flatMap((s) => s.items.filter((i) => 'names' in i) as ImportedPart[]))

  const pruefe = (name: string, w: ImportedWeek) => {
    const alle = punkte(w)
    expect(alle.length, `${name}: gar keine Punkte — die Probe misst nichts`).toBeGreaterThan(3)
    expect(
      alle.filter((p) => !p.iid).map((p) => p.title),
      `${name}: Punkt ohne Kennung`,
    ).toEqual([])
    const ids = alle.map((p) => p.iid)
    expect(new Set(ids).size, `${name}: Kennung doppelt vergeben`).toBe(ids.length)
  }

  it('die deutsche Wochenseite', () => {
    pruefe('FIXTURE_DE', parseWorkbookWeek(FIXTURE_DE))
  })

  it('eine fremdsprachige Wochenseite', () => {
    pruefe('FIXTURE_XX', parseWorkbookWeek(FIXTURE_XX))
  })

  it('die Wochenend-Vorlage für sich', () => {
    const vorlage = weekendTemplate('6.–12. Juli')
    const teile = vorlage.sections.flatMap((s) => s.items.filter((i) => 'names' in i) as ImportedPart[])
    expect(teile.filter((p) => !p.iid)).toEqual([])
    expect(new Set(teile.map((p) => p.iid)).size).toBe(teile.length)
  })

  it('die Woche des Gedächtnismahls (ohne Arbeitsheft-Seite)', () => {
    // Ihre Mitte bleibt leer — geprüft wird das Wochenende, das sie mitbringt.
    pruefe('Gedächtnismahl', gedaechtnismahlWoche('2026-03-30', '2026-04-02') as ImportedWeek)
  })

  it('zwei Aufrufe vergeben verschiedene Kennungen', () => {
    // Sonst trügen zwei nebeneinanderliegende Wochen dieselben Schlüssel, und
    // eine Bestätigung der einen erschiene an der anderen.
    const a = punkte(parseWorkbookWeek(FIXTURE_DE)).map((p) => p.iid)
    const b = punkte(parseWorkbookWeek(FIXTURE_DE)).map((p) => p.iid)
    expect(a.filter((id) => b.includes(id))).toEqual([])
  })

  it('applyGoldSlots lässt die Kennungen der Zielwoche unberührt', () => {
    // Die Slot-Vorlagen kommen aus der deutschen Fassung, die Kennungen nicht:
    // Gespeichert wird die lokalisierte Woche, und ihre Schlüssel sind die,
    // unter denen bestätigt wird.
    const ziel = parseWorkbookWeek(FIXTURE_XX)
    const vorher = punkte(ziel).map((p) => p.iid)
    applyGoldSlots(ziel, parseWorkbookWeek(FIXTURE_DE))
    expect(punkte(ziel).map((p) => p.iid)).toEqual(vorher)
  })

  it('eine Kennung trägt kein Trennzeichen und hat volle Länge', () => {
    // Der Schlüssel wird an `|` zerlegt; und `Math.random().toString(36)` allein
    // liefert gelegentlich weniger als acht Zeichen, im Extremfall gar keins.
    for (let i = 0; i < 2000; i++) {
      const id = neueItemId()
      expect(id).toHaveLength(8)
      expect(id).not.toContain('|')
    }
  })
})
