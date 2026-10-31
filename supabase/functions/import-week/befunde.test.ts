import { describe, expect, it } from 'vitest'
import { befundAufDeutsch, heftBefunde, strukturBefunde, type Befund } from './befunde.ts'
import { applyGoldSlots, parseWorkbookWeek, type ImportedPart, type ImportedWeek } from './parse.ts'

/**
 * **Was an einer Woche nach einer neuen Form des Arbeitshefts aussieht**
 * (`befunde.ts`, 31.10.2026).
 *
 * Der Parser rät, wo er etwas nicht kennt — und bis dahin sagte das beim Holen
 * niemand. Ein neuer Punkt unter „Uns im Dienst verbessern" kam mit einem
 * geratenen Schülerplatz an; ein Punkt hinter der Bibellesung nahm ihr die
 * Plätze; ein Abschnitt mit fremder Farbklasse fiel ganz weg. Jeder dieser Fälle
 * steht hier als Seite, wie jw.org sie schreiben könnte, und muss einen Befund
 * ergeben — und die gewöhnliche Woche keinen: Ein Hinweis bei jeder Woche
 * würde bald überlesen.
 *
 * Gemessen am 31.10.2026 an 320 echten Wochenseiten (68 deutsche Wochen
 * 11/2025–2/2027, die laufenden dazu in 14 Sprachen): kein Befund außer den
 * zwei Lücken, die dabei behoben wurden (`SETTING_RE`, das chinesische
 * Schlusslied ohne Link).
 *
 * Die Seiten tragen die Struktur der echten (Farbklassen, Noten-Symbol,
 * Nummer, Zeitklammer); der Text ist Platzhalter, bis auf die Wörter, an denen
 * der Parser entscheidet. Bis zum 31.10.2026 standen die Prüfungen in
 * `scripts/heft-pruefen.mjs` und ihre Proben in `heft-pruefen.test.ts`.
 */

let pid = 10
const ueberschrift = (farbe: string, text: string) => `<h2 data-pid="${pid++}" class="du-color--${farbe}">${text}</h2>`
const punkt = (farbe: string, kopf: string, zeit: string) =>
  `<h3 data-pid="${pid++}" class="du-color--${farbe}">${kopf}</h3><p data-pid="${pid++}">${zeit}</p>`
const lied = (text: string) => `<h3 data-pid="${pid++}" class="x"><span class="dc-icon--music"></span> ${text}</h3>`

const SCHAETZE = 'teal-700'
const DIENST = 'gold-700'
const LEBEN = 'maroon-600'

const VORTRAG = punkt(SCHAETZE, '1. Erster Vortrag', '(10 Min.)')
const GRABEN = punkt(SCHAETZE, '2. Nach geistigen Schätzen graben', '(10 Min.)')
const BIBELLESUNG = (nr: number) => punkt(SCHAETZE, `${nr}. Bibellesung`, '(4 Min.) Mus 13:1-14 (th Lektion 2)')
const ZWISCHENLIED = lied('Lied 49')
const STUDIUM = (nr: number) => punkt(LEBEN, `${nr}. Versammlungsbibelstudium`, '(30 Min.) lfb Geschichte 100-101')

/** Die Teile einer gewöhnlichen Woche, in ihrer Folge. */
const TEILE = {
  eroeffnung: lied('Lied 123 und Gebet | Einleitende Worte (1 Min.)'),
  schaetze: ueberschrift(SCHAETZE, 'SCHÄTZE AUS GOTTES WORT') + VORTRAG + GRABEN + BIBELLESUNG(3),
  dienst:
    ueberschrift(DIENST, 'UNS IM DIENST VERBESSERN') +
    punkt(DIENST, '4. Gespräche beginnen', '(3 Min.) VON HAUS ZU HAUS. Text. (lmd Lektion 1 Punkt 5)') +
    punkt(DIENST, '5. Was würdest du sagen?', '(5 Min.) Besprechung. VON HAUS ZU HAUS. Text.') +
    punkt(DIENST, '6. Vortrag', '(5 Min.) ijwbq Artikel 157. (th Lektion 8)'),
  leben:
    ueberschrift(LEBEN, 'UNSER LEBEN ALS CHRIST') + ZWISCHENLIED + punkt(LEBEN, '7. Örtliche Bedürfnisse', '(15 Min.)') + STUDIUM(8),
  abschluss: lied('Schlussworte (3 Min.) | Lied 61 und Gebet'),
}

/** Die Nummern der Punkte in `html` um `n` verschieben — für einen eingeschobenen Punkt davor. */
const um = (html: string, n: number) => html.replace(/>(\d+)\. /g, (_, z: string) => `>${Number(z) + n}. `)

/** Eine Wochenseite — die gewöhnliche, oder mit ersetzten Teilen. */
const seite = (teile: Partial<typeof TEILE> = {}, kopf = '6.-12. Juli') =>
  `<article><h1 data-pid="1" class="du-color--textSubdued">${kopf}</h1>` +
  `<h2 data-pid="2" class="du-fontSize--base">MUSTERBUCH 13-15</h2>` +
  Object.values({ ...TEILE, ...teile }).join('') +
  '</article>'

/** Eine deutsche Seite parsen und prüfen, wie `import-week` es tut. */
const befundeVon = (html: string): Befund[] => {
  const w = parseWorkbookWeek(html)
  return heftBefunde(w, w)
}

const punkte = (w: ImportedWeek, kind: string) =>
  w.mid.sections.find((s) => s.kind === kind)!.items.filter((i): i is ImportedPart => 'names' in i)
const bereiche = (w: ImportedWeek, kind: string) => punkte(w, kind).map((p) => p.names.map((n) => n.bereichsKey).join('+'))

describe('die gewöhnliche Woche', () => {
  it('meldet nichts — ein Hinweis bei jeder Woche würde überlesen', () => {
    // Positivkontrolle: Die Seite ist wirklich vollständig erkannt.
    const w = parseWorkbookWeek(seite())
    expect(bereiche(w, 'schaetze')).toEqual(['vortrag', 'besprechung', 'bibellesung'])
    expect(punkte(w, 'dienst')).toHaveLength(3)
    expect(bereiche(w, 'lac')).toEqual(['besprechung', 'studium+leser'])
    expect(heftBefunde(w, w)).toEqual([])
  })

  it('auch „Gespräch mit einem Bibelschüler" ist bekannt (bis zum 31.10.2026 nicht)', () => {
    // Gefunden in der Woche ab 14.9.2026, als die Prüfungen zum ersten Mal
    // über ein ganzes Jahr liefen: Der Rahmen fehlte in `SETTING_RE`.
    const dienst =
      ueberschrift(DIENST, 'UNS IM DIENST VERBESSERN') +
      punkt(DIENST, '4. Menschen zu Jüngern machen', '(4 Min.) Gespräch mit einem Bibelschüler. Text. (th Lektion 11)')
    expect(befundeVon(seite({ dienst, leben: um(TEILE.leben, -2) }))).toEqual([])
  })
})

describe('neue Programmpunkte — ihre Plätze sind geraten', () => {
  const NEU_DE = punkt(DIENST, '7. Etwas ganz Neues', '(5 Min.) Rollenspiel zu dritt. Text.')

  it('eine neue Form unter „Uns im Dienst verbessern": ein Schülerplatz, geraten', () => {
    const w = parseWorkbookWeek(seite({ dienst: TEILE.dienst + NEU_DE, leben: um(TEILE.leben, 1) }))
    // So kam der Punkt an: ein Platz, als hätte der Parser es gewusst.
    expect(punkte(w, 'dienst').at(-1)!.names).toEqual([{ name: '', bereichsKey: 'schulung' }])
    expect(heftBefunde(w, w)).toEqual([{ art: 'unbekannt', nr: 7, titel: 'Etwas ganz Neues', form: 'Rollenspiel zu dritt' }])
  })

  it('Gegenprobe: „Vortrag des Vorsitzenden" kennt der Parser — auch wo der Titel anderes sagt', () => {
    const dienst =
      ueberschrift(DIENST, 'UNS IM DIENST VERBESSERN') +
      punkt(DIENST, '4. Gespräche beginnen', '(3 Min.) VON HAUS ZU HAUS. Text.') +
      punkt(DIENST, '5. Menschen zu Jüngern machen', '(2 Min.) Vortrag des Vorsitzenden. Text.') +
      punkt(DIENST, '6. Vortrag', '(5 Min.) ijwbq Artikel 157. (th Lektion 8)')
    expect(befundeVon(seite({ dienst }))).toEqual([])
  })

  it('in einer anderen Sprache prüft die deutsche Fassung die Form — gemeldet wird der Punkt der Seite', () => {
    // Der Parser versteht die Formen nur deutsch. Die Plätze kommen nach der
    // Stelle von der deutschen Seite (`applyGoldSlots`), der Befund ebenso.
    const leben = um(TEILE.leben, 1)
    const deutsch = parseWorkbookWeek(seite({ dienst: TEILE.dienst + NEU_DE, leben }))
    const fremd = parseWorkbookWeek(
      seite({ dienst: TEILE.dienst + punkt(DIENST, '7. Nova Afero', '(5 vim) Rolludo tri. Frob.'), leben }),
    )
    applyGoldSlots(fremd, deutsch)
    expect(heftBefunde(fremd, deutsch)).toEqual([{ art: 'unbekannt', nr: 7, titel: 'Nova Afero', form: 'Rollenspiel zu dritt' }])
    // Ohne deutsche Fassung (`heft-pruefen` für eine weitere Sprache) bleibt
    // diese Prüfung aus — die deutsche Seite meldet sie schon.
    expect(heftBefunde(fremd, null)).toEqual([])
  })

  it('ein vierter Punkt unter „Schätze aus Gottes Wort", hinter der Bibellesung: sie behält ihren Platz', () => {
    const schaetze = TEILE.schaetze + punkt(SCHAETZE, '4. Kurzer Rückblick', '(2 Min.)')
    const w = parseWorkbookWeek(seite({ schaetze, dienst: um(TEILE.dienst, 1), leben: um(TEILE.leben, 1) }))
    // Bis zum 31.10.2026 galt der letzte Punkt als Bibellesung: Der neue bekam
    // ihren Platz, sie den einer Besprechung, ohne Schriftstelle im Titel.
    expect(bereiche(w, 'schaetze')).toEqual(['vortrag', 'besprechung', 'bibellesung', 'besprechung'])
    expect(punkte(w, 'schaetze')[2]!.title).toBe('Bibellesung · Mus 13:1-14')
    expect(heftBefunde(w, w)).toEqual([{ art: 'unbekannt', nr: 4, titel: 'Kurzer Rückblick', form: '2 Min.' }])
  })

  it('… und vor ihr', () => {
    const schaetze =
      ueberschrift(SCHAETZE, 'SCHÄTZE AUS GOTTES WORT') + VORTRAG + GRABEN + punkt(SCHAETZE, '3. Kurzer Rückblick', '(2 Min.)') + BIBELLESUNG(4)
    const w = parseWorkbookWeek(seite({ schaetze, dienst: um(TEILE.dienst, 1), leben: um(TEILE.leben, 1) }))
    expect(bereiche(w, 'schaetze')).toEqual(['vortrag', 'besprechung', 'besprechung', 'bibellesung'])
    expect(heftBefunde(w, w)).toEqual([{ art: 'unbekannt', nr: 3, titel: 'Kurzer Rückblick', form: '2 Min.' }])
  })
})

describe('Bibellesung und Versammlungsbibelstudium', () => {
  it('eine Bibellesung ohne Schriftstelle und Quelle', () => {
    const schaetze = TEILE.schaetze.replace('(4 Min.) Mus 13:1-14 (th Lektion 2)', '(4 Min.)')
    expect(befundeVon(seite({ schaetze }))).toEqual([{ art: 'bibellesung', abschnitt: 'schaetze' }])
  })

  it('… und eine mit Schriftstelle, aber ohne Quelle', () => {
    const schaetze = TEILE.schaetze.replace(' (th Lektion 2)', '')
    expect(befundeVon(seite({ schaetze }))).toEqual([{ art: 'bibellesung', abschnitt: 'schaetze' }])
  })

  it('ein Punkt hinter dem Studium: Der letzte ist dann nicht der längste', () => {
    // Als Studium gilt weiter der letzte Punkt — Leiter und Leser bekommt der
    // neue. Gemessen ist das Studium immer der längste (30 gegen höchstens 15).
    const w = parseWorkbookWeek(seite({ leben: TEILE.leben + punkt(LEBEN, '9. Hinweis', '(2 Min.)') }))
    expect(bereiche(w, 'lac')).toEqual(['besprechung', 'besprechung', 'studium+leser'])
    expect(heftBefunde(w, w)).toEqual([{ art: 'studium', abschnitt: 'lac' }])
  })

  it('Gegenprobe: ein weiterer Punkt vor dem Studium ist gewöhnlich', () => {
    // Jeder Punkt unter „Unser Leben als Christ" außer dem Studium gehört
    // einem Bruder (S-38-X 8/26, Abs. 16) — dort rät der Parser nichts.
    const leben =
      ueberschrift(LEBEN, 'UNSER LEBEN ALS CHRIST') +
      ZWISCHENLIED +
      punkt(LEBEN, '7. Örtliche Bedürfnisse', '(15 Min.)') +
      punkt(LEBEN, '8. Bericht', '(10 Min.)') +
      STUDIUM(9)
    expect(befundeVon(seite({ leben }))).toEqual([])
  })
})

describe('Lieder, Abschnitte, Nummern', () => {
  it('Eröffnung und Abschluss ohne Liednummer — so kam ab 2027 die Rückfall-Zeile', () => {
    // Ohne Noten-Symbol und ohne Link erkennt der Parser die Zeilen nicht und
    // setzt die deutsche Vorlage („Lied · Gebet · Einleitende Worte").
    const w = parseWorkbookWeek(
      seite({
        eroeffnung: '<p data-pid="3">Lied 123 und Gebet | Einleitende Worte (1 Min.)</p>',
        abschluss: '<p data-pid="99">Schlussworte (3 Min.) | Lied 61 und Gebet</p>',
      }),
    )
    expect(w.mid.sections[0]!.items[0]).toMatchObject({ title: 'Lied · Gebet · Einleitende Worte' })
    expect(heftBefunde(w, w)).toEqual([
      { art: 'lied', abschnitt: 'eroeffnung' },
      { art: 'lied', abschnitt: 'abschluss' },
    ])
  })

  it('die Liednummer zählt in jeder Schrift', () => {
    expect(befundeVon(seite({ eroeffnung: lied('سرود ۱۲۲ و دعا | سخنان آغازین (۱ دقیقه)') }))).toEqual([])
  })

  it('kein Zwischenlied unter „Unser Leben als Christ"', () => {
    expect(befundeVon(seite({ leben: TEILE.leben.replace(ZWISCHENLIED, '') }))).toEqual([
      { art: 'lied', abschnitt: 'lac' },
    ])
  })

  it('ein Abschnitt mit fremder Farbklasse fällt weg — leer, und die Nummern springen', () => {
    // „gold" heißt eines Tages anders: Die Überschrift wird nicht erkannt, die
    // Punkte darunter auch nicht. Was bleibt, ist die Lücke.
    expect(befundeVon(seite({ dienst: TEILE.dienst.replaceAll('gold-700', 'yellow-700') }))).toEqual([
      { art: 'leer', abschnitt: 'dienst' },
      { art: 'nummern', nr: 7 },
    ])
  })

  it('ein zusätzlicher Abschnitt mit neuer Farbe: Seine Punkte fehlen — die Lücke zeigt es', () => {
    const neu = ueberschrift('blue-700', 'NEUER ABSCHNITT') + punkt('blue-700', '7. Neuer Punkt', '(5 Min.)')
    expect(befundeVon(seite({ dienst: TEILE.dienst + neu, leben: um(TEILE.leben, 1) }))).toEqual([{ art: 'nummern', nr: 8 }])
  })

  it('ein Sprung meldet sich einmal, nicht bei jedem Punkt dahinter', () => {
    // `heft-pruefen` schrieb bis zum 31.10.2026 jeden folgenden Punkt als
    // „steht an Stelle …" hin — fünf Zeilen für eine einzige Lücke.
    const schaetze = ueberschrift(SCHAETZE, 'SCHÄTZE AUS GOTTES WORT') + VORTRAG + BIBELLESUNG(3)
    expect(befundeVon(seite({ schaetze }))).toEqual([{ art: 'nummern', nr: 3 }])
  })

  it('ein Punkt ohne Minuten', () => {
    const schaetze = TEILE.schaetze.replace('(10 Min.)', '')
    expect(befundeVon(seite({ schaetze }))).toEqual([{ art: 'unvollstaendig', nr: 1, titel: 'Erster Vortrag', fehlt: ['minuten'] }])
  })

  it('eine unlesbare Nummer fehlt — sie ist kein Sprung, und die Punkte dahinter bleiben still (Review 31.10.2026)', () => {
    // So kam das Birmanische an („၃။"), bevor der Parser das Zeichen kannte:
    // Jeder Punkt meldete „davor fehlt womöglich ein Programmpunkt".
    const schaetze = TEILE.schaetze.replace('2. Nach geistigen', '2× Nach geistigen')
    const w = parseWorkbookWeek(seite({ schaetze }))
    expect(punkte(w, 'schaetze')[1]!.num).toBeUndefined() // Positivkontrolle: die Nummer ist wirklich weg
    expect(heftBefunde(w, w)).toEqual([
      { art: 'unvollstaendig', nr: 2, titel: '2× Nach geistigen Schätzen graben', fehlt: ['nummer'] },
    ])
  })

  it('ohne Zeitraum', () => {
    expect(befundeVon(seite({}, ''))).toEqual([{ art: 'zeitraum' }])
  })
})

describe('strukturBefunde — gliedert sich die Fassung wie die deutsche?', () => {
  it('gleich gegliedert: nichts zu melden', () => {
    expect(strukturBefunde(parseWorkbookWeek(seite()), parseWorkbookWeek(seite()), 'en')).toEqual([])
  })

  it('ein Punkt mehr verschöbe Plätze und Texte, die nach der Stelle gehen', () => {
    const de = parseWorkbookWeek(seite())
    const fremd = parseWorkbookWeek(seite({ dienst: TEILE.dienst + punkt(DIENST, '9. Zusatz', '(1 vim)') }))
    expect(strukturBefunde(de, fremd, 'en')).toEqual([
      expect.objectContaining({ art: 'gliederung', sprache: 'en', ist: expect.stringContaining('gold: 4 5 6 9 | wein') }),
    ])
  })
})

describe('befundAufDeutsch — für heft-pruefen und das Protokoll', () => {
  it('jeder Befund ergibt einen Satz, der die Stelle nennt — die Abschnitte mit der Überschrift der Woche', () => {
    const alle: Befund[] = [
      { art: 'zeitraum' },
      { art: 'lied', abschnitt: 'eroeffnung' },
      { art: 'leer', abschnitt: 'dienst' },
      { art: 'nummern', nr: 7 },
      { art: 'unvollstaendig', nr: 3, titel: 'Bibellesung', fehlt: ['nummer', 'minuten', 'plaetze'] },
      { art: 'unbekannt', nr: 5, titel: 'Etwas Neues', form: 'Rollenspiel' },
      { art: 'bibellesung', abschnitt: 'schaetze' },
      { art: 'studium', abschnitt: 'lac' },
      { art: 'gliederung', sprache: 'en', ist: 'a', soll: 'b' },
    ]
    // Die Überschriften kommen aus der Woche — für das Protokoll die deutsche Fassung.
    const woche = parseWorkbookWeek(seite())
    expect(alle.map((b) => befundAufDeutsch(b, woche))).toEqual([
      'kein Zeitraum',
      '„ERÖFFNUNG" ohne Lied mit Nummer',
      '„UNS IM DIENST VERBESSERN" ohne Punkte',
      'die Nummern springen bei Punkt 7',
      'Punkt 3 „Bibellesung" ohne Nummer, Minuten, Plätze',
      'Punkt 5 „Etwas Neues": Form „Rollenspiel" — der Parser rät die Plätze',
      '„SCHÄTZE AUS GOTTES WORT": kein Punkt mit Schriftstelle und Quelle — als Bibellesung gilt der letzte',
      '„UNSER LEBEN ALS CHRIST": der letzte Punkt ist nicht der längste — er gilt trotzdem als Versammlungsbibelstudium',
      'en gegliedert „a" statt wie Deutsch „b"',
    ])
  })
})
