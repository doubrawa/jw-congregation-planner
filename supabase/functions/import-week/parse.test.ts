import { describe, expect, it } from 'vitest'
import { parseWorkbookWeek, type ImportedPart, type ImportedSong } from './parse'

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
    expect(open.names.map((n) => n.bereichsKey)).toEqual(['vorsitz', 'gebet'])
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
    expect(bl.names[0].bereichsKey).toBe('lesen')
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
    expect(vbs.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Leiter:studium', 'Leser:lesen'])
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
    expect(open.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Vorsitz:vorsitz', 'Gebet:gebet'])
  })

  it('Bibellesung = letzter Schätze-Punkt (Position, nicht Text)', () => {
    const bl = parts('XORBI SATO').at(-1)!
    expect(bl.title).toBe('Librolekt · Qor 13:1-14')
    expect(bl.meta).toBe('4 vim · th plek 2')
    expect(bl.names[0].bereichsKey).toBe('lesen')
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
    expect(vbs.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Leiter:studium', 'Leser:lesen'])
  })

  it('Abschluss strukturell erkannt (Schlussgebet)', () => {
    const close = byLabel('ABSCHLUSS').items[0] as ImportedPart
    expect(close.title).toBe('Finvorbo · Xylo 61 qi Preku')
    expect(close.names[0].bereichsKey).toBe('gebet')
  })
})
