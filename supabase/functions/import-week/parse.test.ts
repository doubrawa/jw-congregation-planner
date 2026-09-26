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
      range: '', book: '', we: emptyMeeting(),
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
    // Der Rückfall, wenn kein Beschreiber dasteht — gemessen kam das nie vor.
    expect(ministryNames('Unsere Glaubensansichten erklären', 'Informell · 4 Min.')).toHaveLength(2)
    const talk = ministryNames('Unsere Glaubensansichten erklären', '5 Min.')
    expect(talk).toHaveLength(1)
    expect(talk[0].male).toBe(true)
  })

  it('Unsere Glaubensansichten als gespielte Szene → Schüler + Partner, auch für Schwestern', () => {
    // S-38-X 8/26, Abs. 11. Die Szene trägt keinen Rahmen, nur ihren
    // Beschreiber — und kam deshalb als männliche Ansprache mit einem Platz an.
    expect(ministryNames('Unsere Glaubensansichten erklären', 'Gespielte Szene · 5 Min. · th Lektion 17')).toEqual([
      { name: '', rolle: 'Schüler', bereichsKey: 'schulung' },
      { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' },
    ])
  })

  it('… als Vortrag → ein männlicher Teilnehmer', () => {
    expect(ministryNames('Unsere Glaubensansichten erklären', 'Vortrag · 4 Min. · th Lektion 7')).toEqual([
      { name: '', bereichsKey: 'schulung', male: true },
    ])
  })

  it('ein Beschreiber zählt nur als ganzes Atom', () => {
    // „Vortrag des Dienstaufsehers" steht unter „Unser Leben als Christ" und ist
    // die Aufgabe eines Ältesten. Käme er hier vor, fiele er auf die Regel für
    // Unbekanntes zurück — ein Vortrag eines Teilnehmers wird er nicht.
    expect(ministryNames('Etwas ganz Neues', 'Vortrag des Dienstaufsehers · 5 Min.')).toEqual([
      { name: '', bereichsKey: 'schulung' },
    ])
  })

  it('unbekannter Titel → 1 Slot schulung (Partner ggf. manuell)', () => {
    const n = ministryNames('Etwas ganz Neues', '5 Min.')
    expect(n).toEqual([{ name: '', bereichsKey: 'schulung' }])
  })

  it('Besprechung → ein Platz für einen Bruder, kein Schülerteil', () => {
    // S-38-X 8/26, Abs. 9: „Was würdest du sagen?" leitet der Vorsitzende, ein
    // anderer Ältester oder ein geeigneter Dienstamtgehilfe. Derselbe Platz wie
    // die Punkte unter „Unser Leben als Christ" — ohne Rolle, ohne `male`.
    expect(ministryNames('Was würdest du sagen?', 'Besprechung · 6 Min.')).toEqual([
      { name: '', bereichsKey: 'vortrag' },
    ])
  })

  it('die Form entscheidet vor dem Titel', () => {
    // Abs. 6 gilt für jede Besprechung des Programmteils. Trüge eine einmal den
    // Titel eines Schülerteils, bliebe sie trotzdem keine gespielte Szene.
    expect(ministryNames('Gespräche beginnen', 'Besprechung · 5 Min.')).toEqual([
      { name: '', bereichsKey: 'vortrag' },
    ])
    // Gegenprobe: Der Rahmen an derselben Stelle macht es nicht dazu.
    expect(ministryNames('Gespräche beginnen', 'VON HAUS ZU HAUS · 5 Min.')).toHaveLength(2)
    // Ebenso der Vortrag: Ihn hält ein Bruder (Abs. 11 und 12), auch unter dem
    // Titel eines Gesprächsteils. Bei „Unsere Glaubensansichten erklären" fiele
    // das nicht auf — dort käme über den Titel dasselbe heraus.
    expect(ministryNames('Menschen zu Jüngern machen', 'Vortrag · 5 Min.')).toEqual([
      { name: '', bereichsKey: 'schulung', male: true },
    ])
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

/*
 * Bausteine einer Wochenseite in der **Form** der echten (gemessen am
 * 26.9.2026): der Programmteil „Uns im Dienst verbessern", eingebettet in die
 * übrigen Abschnitte. Der Text ist Platzhalter; echt sind nur die Wörter, an
 * denen der Import entscheidet.
 */

/** Wochenseite um einen Programmteil „Uns im Dienst verbessern". */
const seite = (dienstteil: string) => `
<article>
  <h1 data-pid="1" class="du-color--textSubdued">1.-7. Juli</h1>
  <h2 data-pid="2" class="du-fontSize--base">MUSTERBUCH 1-3</h2>
  <h3 data-pid="3" class="x"><span class="dc-icon--music"></span> Lied 1 und Gebet | Einleitende Worte (1 Min.)</h3>
  <h2 data-pid="4" class="du-color--teal-700">SCHÄTZE AUS GOTTES WORT</h2>
  <h3 data-pid="5" class="du-color--teal-700">1. Erster Vortrag</h3>
  <p data-pid="6">(10 Min.)</p>
  <h3 data-pid="7" class="du-color--teal-700">3. Bibellesung</h3>
  <p data-pid="8">(4 Min.) Mus 1:1-9 ( th Lektion 2 )</p>
${dienstteil}
  <h2 data-pid="40" class="du-color--maroon-600">UNSER LEBEN ALS CHRIST</h2>
  <h3 data-pid="41" class="du-color--maroon-600">7. Örtliche Besprechung</h3>
  <p data-pid="42">(15 Min.) Besprechung.</p>
  <h3 data-pid="43" class="du-color--maroon-600">8. Versammlungsbibelstudium</h3>
  <p data-pid="44">(30 Min.) lfb Geschichte 1</p>
  <h3 data-pid="45" class="x"><span class="dc-icon--music"></span> Schlussworte (3 Min.) | Lied 2 und Gebet</h3>
</article>`

/** Ein Schülerteil in der Form der echten Seite: Zeitzeile ein `div` tief. */
const schuelerteil = (pid: number, titel: string, zeit: string) => `
  <h3 class="du-fontSize--base du-color--gold-700 du-margin-top--8 du-margin-bottom--0" id="p${pid}" data-pid="${pid}">${titel}</h3>
  <div class="du-margin-inlineStart--5 du-color--textSubdued du-margin-top--1 du-margin-children-vertical--0">
    <p id="p${pid + 1}" data-pid="${pid + 1}" class="p${pid + 1}">${zeit}</p>
  </div>`

/** Verweis auf eine Publikation, wie jw.org ihn setzt: das Kürzel kursiv im Link. */
const pub = (kuerzel: string, text: string) => `<a class="pub-${kuerzel}" href="#"><em>${kuerzel}</em> ${text}</a>`
const lmd = (text: string) => pub('lmd', text)

/** Die Programmpunkte eines Abschnitts, ohne Lieder. */
const teile = (w: ImportedWeek, farbe: string) =>
  w.mid.sections.find((s) => s.farbe === farbe)!.items.filter((i) => 'names' in i) as ImportedPart[]

/**
 * **Eine Besprechung unter „Uns im Dienst verbessern" ist keine Schulungsaufgabe.**
 *
 * „Was würdest du sagen?" steht seit den Arbeitsheften 2026 regelmäßig als
 * letzter Punkt dieses Programmteils; die S-38 lässt ihn vom Vorsitzenden,
 * einem anderen Ältesten oder einem geeigneten Dienstamtgehilfen leiten
 * (S-38-X 8/26, Abs. 9). Der Import gab ihm einen Schüler-Platz.
 *
 * Die Form der echten Seite (21.–27.9.2026): Die Zeitzeile steckt zwei `div`
 * tief, der Beschreiber steht vor dem Rahmen, der Verweis auf die Broschüre
 * steht im Satz statt in Klammern, und darunter folgen Fragen samt Antwortfeld
 * — Absätze mit `data-pid`, die kein Programmpunkt sind.
 */
describe('Besprechung unter „Uns im Dienst verbessern" (Was würdest du sagen?)', () => {
  /** Die Besprechung: Zeitzeile zwei `div` tief, darunter die Fragen mit Antwortfeld. */
  const besprechung = (titel: string, zeit: string, fragen: [string, string], antwort: string) => `
  <h3 class="du-fontSize--base du-color--gold-700 du-margin-top--8 du-margin-bottom--0" id="p24" data-pid="24">${titel}</h3>
  <div class="du-margin-inlineStart--5 du-margin-inlineStart-desktopOnly--6">
    <div class="du-color--textSubdued du-margin-top--1 du-margin-children-vertical--0">
      <p id="p25" data-pid="25" class="p25">${zeit}</p>
    </div>
    <ul class="du-listStyleType--none du-padding-inlineStart--0">
      <li>
        <p id="p26" data-pid="26" class="p26">${fragen[0]}</p>
        <div class="gen-field" id="p27" data-pid="27"><label for="tt43" class="dc-screenReaderText">${antwort}</label><textarea id="tt43"></textarea></div>
      </li>
      <li class="du-margin-top--8">
        <p id="p28" data-pid="28" class="p28">${fragen[1]}</p>
        <div class="gen-field" id="p29" data-pid="29"><label for="tt48" class="dc-screenReaderText">${antwort}</label><textarea id="tt48"></textarea></div>
      </li>
    </ul>
  </div>`

  const DEUTSCH = seite(`
  <h2 data-pid="18" class="du-color--gold-700">UNS IM DIENST VERBESSERN</h2>
${schuelerteil(19, '4. Gespräche beginnen', `(3 Min.) IN DER ÖFFENTLICHKEIT. Irgendein Satz. (${lmd('Lektion 5 Punkt 5')})`)}
${schuelerteil(21, '5. Interesse fördern', `(4 Min.) VON HAUS ZU HAUS. Irgendein Satz. (${lmd('Lektion 9 Punkt 4')})`)}
${besprechung(
  '6. Was würdest du sagen?',
  `(6 Min.) Besprechung. VON HAUS ZU HAUS. Irgendein Satz mit ${lmd('Lektion 2 Punkt 5')}. Noch ein Satz:`,
  ['Erste Frage?', 'Zweite Frage?'],
  'Deine Antwort',
)}`)

  // Derselbe Programmteil in einer erfundenen Sprache — ohne ein Wort, an dem
  // die Heuristik etwas erkennen könnte. Das Gerüst drumherum darf deutsch
  // bleiben: `applyGoldSlots` sieht nur auf „Uns im Dienst verbessern".
  const FREMD = seite(`
  <h2 data-pid="18" class="du-color--gold-700">SERVO XI</h2>
${schuelerteil(19, '4. Konvo Beg', `(3 vim) PUBLIKO. Bla bla. (${lmd('plek 5 puno 5')})`)}
${schuelerteil(21, '5. Sekvo', `(4 vim) DOMO XI DOMO. Bla bla. (${lmd('plek 9 puno 4')})`)}
${besprechung(
  '6. Kion vi dirus?',
  `(6 vim) Diskuto. DOMO XI DOMO. Bla ${lmd('plek 2 puno 5')}. Frob:`,
  ['Unua demando?', 'Dua demando?'],
  'Via respondo',
)}`)

  const de = parseWorkbookWeek(DEUTSCH)
  const punkt = teile(de, 'gold').at(-1)!

  it('liest Nummer, Titel, Dauer und Meta wie jeden Punkt — der Beschreiber steht vorn', () => {
    expect(punkt).toMatchObject({ num: 6, title: 'Was würdest du sagen?', meta: 'Besprechung · 6 Min.', mins: 6 })
  })

  it('bekommt den Platz eines Bruders, keinen Schüler-Platz', () => {
    expect(punkt.names).toEqual([{ name: '', bereichsKey: 'vortrag' }])
  })

  it('… denselben wie die Besprechung unter „Unser Leben als Christ"', () => {
    expect(punkt.names).toEqual(teile(de, 'wein')[0]!.names)
  })

  it('die Fragen darunter sind kein Programmpunkt, die Schülerteile davor bleiben', () => {
    expect(teile(de, 'gold').map((p) => p.title)).toEqual([
      'Gespräche beginnen',
      'Interesse fördern',
      'Was würdest du sagen?',
    ])
    for (const p of teile(de, 'gold').slice(0, 2)) {
      expect(p.names.map((n) => n.bereichsKey)).toEqual(['schulung', 'schulungPartner'])
    }
  })

  it('eine fremdsprachige Woche bekommt den Platz aus der deutschen Fassung', () => {
    const fremd = parseWorkbookWeek(FREMD)
    const fremderPunkt = () => teile(fremd, 'gold').at(-1)!
    // Gegenprobe: Für sich allein erkennt der Import die Besprechung nicht —
    // die Heuristik liest nur Deutsch.
    expect(fremderPunkt().names).toEqual([{ name: '', bereichsKey: 'schulung' }])
    applyGoldSlots(fremd, de)
    expect(fremderPunkt().names).toEqual([{ name: '', bereichsKey: 'vortrag' }])
    // Der Text bleibt der der Zielsprache; übertragen wird nur der Platz.
    expect(fremderPunkt()).toMatchObject({ title: 'Kion vi dirus?', meta: 'Diskuto · 6 vim' })
  })
})

/**
 * **„Unsere Glaubensansichten erklären": gespielte Szene oder Vortrag.**
 *
 * Der Punkt wechselt von Woche zu Woche die Form, und die S-38 teilt nach ihr
 * zu (S-38-X 8/26, Abs. 11): Den Vortrag hält ein Bruder, die gespielte Szene
 * übernimmt ein Teilnehmer oder eine Teilnehmerin mit Gesprächspartner. Die
 * Szene kam als Vortrag an — ein Platz, nur für Brüder.
 *
 * Die Form der echten Seite (5.–11.10. und 20.–26.7.2026): Der Beschreiber
 * steht, wo sonst der Rahmen steht — einen Rahmen trägt der Punkt nie —, und im
 * Titel steckt ein Weichtrennzeichen.
 */
describe('Unsere Glaubensansichten erklären: gespielte Szene oder Vortrag', () => {
  const woche = (dienstteil: string) => parseWorkbookWeek(seite(dienstteil))
  const mitPunkt = (zeit: string) => woche(`
  <h2 data-pid="18" class="du-color--gold-700">UNS IM DIENST VERBESSERN</h2>
${schuelerteil(19, '4. Gespräche beginnen', `(3 Min.) INFORMELL. Irgendein Satz. (${lmd('Lektion 1 Punkt 5')})`)}
${schuelerteil(26, '7. Unsere Glaubens­ansichten erklären', zeit)}`)

  const SZENE = mitPunkt(`(3 Min.) Gespielte Szene. ${pub('ijwbq', 'Artikel 1')} – Thema: Irgendeine Frage? (${pub('th', 'Lektion 17')})`)
  const VORTRAG = mitPunkt(`(4 Min.) Vortrag. ${pub('ijwbq', 'Artikel 2')} – Thema: Irgendeine Frage? (${pub('th', 'Lektion 20')})`)
  const punkt = (w: ImportedWeek) => teile(w, 'gold').at(-1)!

  it('liest Titel und Meta — der Beschreiber steht, wo sonst der Rahmen steht', () => {
    expect(punkt(SZENE)).toMatchObject({
      num: 7,
      title: 'Unsere Glaubensansichten erklären',
      meta: 'Gespielte Szene · 3 Min. · th Lektion 17',
    })
    expect(punkt(VORTRAG)).toMatchObject({ meta: 'Vortrag · 4 Min. · th Lektion 20' })
  })

  it('die gespielte Szene bekommt Schüler und Partner — nicht nur Brüder', () => {
    expect(punkt(SZENE).names).toEqual([
      { name: '', rolle: 'Schüler', bereichsKey: 'schulung' },
      { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' },
    ])
  })

  it('der Vortrag bleibt ein Platz für einen Bruder', () => {
    expect(punkt(VORTRAG).names).toEqual([{ name: '', bereichsKey: 'schulung', male: true }])
  })

  it('eine fremdsprachige Woche bekommt die Plätze aus der deutschen Fassung', () => {
    const fremd = woche(`
  <h2 data-pid="18" class="du-color--gold-700">SERVO XI</h2>
${schuelerteil(19, '4. Konvo Beg', `(3 vim) NEFORMALE. Bla bla. (${lmd('plek 1 puno 5')})`)}
${schuelerteil(26, '7. Klarigi niajn kredojn', `(3 vim) Ludita sceno. ${pub('ijwbq', 'artikolo 1')} – Temo: Frob? (${pub('th', 'plek 17')})`)}`)
    // Gegenprobe: Für sich allein wird daraus nur ein unbekannter Punkt.
    expect(punkt(fremd).names).toEqual([{ name: '', bereichsKey: 'schulung' }])
    applyGoldSlots(fremd, SZENE)
    expect(punkt(fremd).names.map((n) => n.bereichsKey)).toEqual(['schulung', 'schulungPartner'])
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
