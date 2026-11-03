import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  csvLesen,
  docxDokument,
  exportNamensAufloeser,
  monatAusDateiname,
  montagAusKopf,
  namensForm,
  PERSONEN_FLAGS,
  personenAlsNws,
  wochenAusUebersicht,
  zipEintrag,
} from './nws-exporte.mjs'
import { abschnitt, dokument, tabelle, wochenKopf, wochenuebersichtDocx, zipArchiv, type Zelle } from './wochenuebersicht-attrappe'

/**
 * **Was NWS exportiert, kommt Platz für Platz richtig an.**
 *
 * Seit dem NWS-Update vom 20.10.2026 liegen die Daten nicht mehr offen
 * entschlüsselbar auf dem Rechner. Der Weg in die App sind die Exporte, die NWS
 * selbst schreibt: die Personenliste (CSV) und die Wochenübersicht eines Monats
 * (docx). `nws-exporte.mjs` liest beide in die Formen, die die Importe schon
 * kennen. Ein Fehler dort fiele erst auf, wenn ein Programm falsch besetzt in
 * der App steht — oder gar nicht: Ein still übersprungener Platz sieht aus wie
 * einer, den NWS offen ließ.
 *
 * Gemessen am 2.11.2026 an den echten Exporten: die Personenliste bei 113 von
 * 113 Personen Feld für Feld gleich der NWS-Tabelle, die Wochenübersicht in 9
 * Wochen ohne Abweichung gegen den entschlüsselten Stand vom 18.10. Diese
 * Proben halten die Regeln fest, die dabei gefunden wurden — mit Platzhaltern,
 * denn die echten Exporte tragen die Namen der Versammlung.
 */

const NBSP = String.fromCharCode(0xa0)
const SHY = String.fromCharCode(0xad)
const ZWSP = String.fromCharCode(0x200b)
const BOM = String.fromCharCode(0xfeff)

/** Eine Zeile der Personenliste — alle Häkchen aus, sonst Platzhalter. */
function personZeile(werte: Record<string, string>): Record<string, string> {
  const aus = Object.fromEntries(Object.values(PERSONEN_FLAGS).map((spalte) => [spalte, 'False']))
  return {
    PersonID: '101', FirstName: 'Probe', LastName: 'Eins', DisplayName: 'Probe Eins', FamilyID: '', Gender: 'Male',
    Privilege: 'PUB', GroupResponsibility: 'None', FieldServiceGroupID: '', GroupName: '', Active: 'True', CLMStudent: 'False',
    ...aus,
    ...werte,
  }
}

describe('csvLesen — die Personenliste, wie NWS sie schreibt', () => {
  it('eine Notiz mit Komma, Zeilenumbruch und Anführungszeichen bleibt ein Feld — die nächste Person beginnt danach', () => {
    const text = 'PersonID,FirstName,Notes\r\n101,Probe,"erste Zeile, mit Komma\r\nzweite ""Zeile"""\r\n102,Zwei,\r\n'
    expect(csvLesen(text)).toEqual([
      { PersonID: '101', FirstName: 'Probe', Notes: 'erste Zeile, mit Komma\r\nzweite "Zeile"' },
      { PersonID: '102', FirstName: 'Zwei', Notes: '' },
    ])
  })

  it('das BOM am Anfang gehört nicht zum Namen der ersten Spalte', () => {
    const [zeile] = csvLesen(`${BOM}PersonID,FirstName\n101,Probe`)
    expect(Object.keys(zeile ?? {})).toEqual(['PersonID', 'FirstName'])
    expect(zeile?.PersonID).toBe('101')
  })

  it('leere Zeilen und das Zeilenende am Schluss ergeben keine Personen', () => {
    expect(csvLesen('PersonID\n101\n\n102\n').map((z: Record<string, string>) => z.PersonID)).toEqual(['101', '102'])
  })

  it('fehlt am Ende einer Zeile ein Feld, steht es leer da — nicht undefined', () => {
    expect(csvLesen('A,B\n1')).toEqual([{ A: '1', B: '' }])
  })
})

describe('Das Word-Dokument aus dem Archiv', () => {
  const xml = '<w:document>Wochenübersicht</w:document>'

  it('liest word/document.xml, gepackt wie Word es ablegt — Umlaute bleiben Umlaute', () => {
    const buf = zipArchiv([{ name: '[Content_Types].xml', daten: '<Types/>' }, { name: 'word/document.xml', daten: xml }])
    expect(zipEintrag(buf, 'word/document.xml')?.toString('utf8')).toBe(xml)
  })

  it('steht die Größe erst hinter den Daten (Bit 3), gilt das zentrale Verzeichnis', () => {
    // Im lokalen Kopf stehen dann Nullen; wer dort läse, bekäme ein leeres Dokument.
    const buf = zipArchiv([{ name: 'word/document.xml', daten: xml, nachgestellt: true }])
    expect(zipEintrag(buf, 'word/document.xml')?.toString('utf8')).toBe(xml)
  })

  it('ungepackt gespeichert geht ebenso', () => {
    const buf = zipArchiv([{ name: 'word/document.xml', daten: xml, methode: 0 }])
    expect(zipEintrag(buf, 'word/document.xml')?.toString('utf8')).toBe(xml)
  })

  it('ein Eintrag, den es nicht gibt, ist null — die Frage danach wirft nicht', () => {
    const buf = zipArchiv([{ name: 'word/document.xml', daten: xml }])
    expect(zipEintrag(buf, 'word/fehlt.xml')).toBeNull()
  })

  it('eine Datei, die kein Archiv ist, bricht mit einer klaren Meldung ab', () => {
    expect(() => zipEintrag(Buffer.from('nur Text, kein Archiv'), 'word/document.xml')).toThrow('Kein ZIP-Archiv')
  })

  it('docxDokument liest die Datei — und nennt sie, wenn sie kein Word-Dokument ist', () => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'nws-exporte-'))
    try {
      const docx = path.join(ordner, 'Probe November 2026 Wochenübersicht.docx')
      fs.writeFileSync(docx, wochenuebersichtDocx([wochenKopf('November 02-08')]))
      expect(docxDokument(docx)).toContain('Wochenübersicht')

      const anderes = path.join(ordner, 'Probe.xlsx')
      fs.writeFileSync(anderes, zipArchiv([{ name: 'xl/workbook.xml', daten: '<workbook/>' }]))
      expect(() => docxDokument(anderes)).toThrow(`${anderes}: kein Word-Dokument`)
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true })
    }
  })
})

describe('Wer ist gemeint? Namen aus dem Export an die Personenliste', () => {
  it('ein Leerzeichen am Ende des Vornamens trennt die Person nicht von ihren Plätzen', () => {
    // So stand es in NWS (2.11.2026): Ohne Glätten fehlten einer Person alle Plätze.
    const { idZu } = exportNamensAufloeser([personZeile({ FirstName: 'Probe ', DisplayName: 'Probe E.' })])
    expect(idZu('Probe Eins')).toBe('101')
  })

  it('geschütztes Leerzeichen, weicher Trennstrich und Zeichen ohne Breite stören den Vergleich nicht', () => {
    expect(namensForm(`Probe${NBSP}Eins`)).toBe('Probe Eins')
    expect(namensForm(`Pro${SHY}be Eins`)).toBe('Probe Eins')
    expect(namensForm(`Probe${ZWSP} Eins `)).toBe('Probe Eins')
    expect(namensForm('  Probe \t Eins ')).toBe('Probe Eins')
    expect(namensForm(undefined)).toBe('')
  })

  it('der Anzeigename findet die Person auch', () => {
    const { idZu } = exportNamensAufloeser([personZeile({ DisplayName: 'Probe E.' })])
    expect(idZu('Probe E.')).toBe('101')
  })

  it('heißen zwei gleich, wird keiner geraten — mit dem NWS-Zähler im Nachnamen sind sie eindeutig', () => {
    const { idZu, mehrdeutig } = exportNamensAufloeser([
      personZeile({ PersonID: '102', LastName: 'Zwei 1', DisplayName: 'Probe Zwei' }),
      personZeile({ PersonID: '103', LastName: 'Zwei 2', DisplayName: 'Probe Zwei' }),
    ])
    expect(idZu('Probe Zwei')).toBeNull()
    expect(mehrdeutig('Probe Zwei')).toBe(true)
    expect(idZu('Probe Zwei 2')).toBe('103')
    expect(mehrdeutig('Probe Zwei 2')).toBe(false)
  })

  it('fehlen die Namensspalten oder die Personen, bricht es ab — statt niemanden zu finden', () => {
    // Sonst stünde jeder Name als Freitext da, und der Import schriebe ihn so.
    expect(() => exportNamensAufloeser([{ PersonID: '101', Name: 'Probe Eins' }])).toThrow('Spalte fehlt — FirstName, LastName, DisplayName')
    expect(() => exportNamensAufloeser([])).toThrow('keine Personen')
  })

  it('eine Zeile ohne PersonID zählt nicht, ein unbekannter Name ergibt null', () => {
    const { idZu, mehrdeutig } = exportNamensAufloeser([personZeile({ PersonID: ' ' })])
    expect(idZu('Probe Eins')).toBeNull()
    expect(idZu('Probe Unbekannt')).toBeNull()
    expect(mehrdeutig('Probe Unbekannt')).toBe(false)
  })
})

describe('personenAlsNws — die Personenliste in den Feldern der NWS-Tabelle', () => {
  /*
    Aus diesen Feldern leitet der Personen-Generator (`build-personen-sql.mjs`
    in nws-export) die Bereiche der App ab — genau wie aus der entschlüsselten
    Tabelle. Ein vertauschtes Häkchen gäbe einer Person einen Bereich, den sie
    in NWS nicht hat.
  */
  /** Die eine Person einer Zeile, Feld für Feld lesbar. */
  const nws = (werte: Record<string, string>) => personenAlsNws([personZeile(werte)]).persons[0] as Record<string, unknown>

  /**
   * Gemessen am 2.11.2026: Jede dieser Spalten trug bei allen 113 Personen
   * denselben Wert wie ihr Feld in der NWS-Tabelle. Hier ein zweites Mal
   * aufgeschrieben, nicht aus `PERSONEN_FLAGS` gelesen — sonst bestätigte die
   * Probe jede Vertauschung.
   */
  const GEMESSEN: Record<string, string> = {
    bk: 'UseForChairman', cb: 'UseForWeekendChairman', bm: 'UseForPrayers', bl: 'UseForAuxiliaryCounselor',
    bo: 'UseForTreasuresTalk', bp: 'UseForTreasuresGems', bq: 'UseForTreasuresBR',
    br: 'UseForApplyIC', bs: 'UseForApplyRV', bt: 'UseForApplyBS', ee: 'UseForApplyExplaining',
    bv: 'UseForApplyStudentTalk', bu: 'UseForApplyAssistant', bw: 'UseForLivingParts',
    bx: 'UseForCBS', by: 'UseForCBSReader', cq: 'UseForConductFSGroups', cp: 'UseForPublicWitnessing',
    ch: 'UseForDuty1', ci: 'UseForDuty2', dk: 'UseForDuty3', cj: 'UseForDuty4', ck: 'UseForDuty5', cl: 'UseForDuty6',
  }

  it('jedes Häkchen landet in dem Feld, in dem NWS es führt — und nur dort', () => {
    const felder = Object.keys(GEMESSEN)
    for (const [feld, spalte] of Object.entries(GEMESSEN)) {
      const p = nws({ [spalte]: 'True' })
      expect(felder.filter((f) => p[f]), spalte).toEqual([feld])
    }
    // Ein Häkchen, das der Leser nicht kennt, fehlte der Person in der App.
    expect(Object.keys(PERSONEN_FLAGS).sort()).toEqual([...felder].sort())
  })

  it('Dienstvorrecht und Verantwortung in der Gruppe, wie NWS sie zählt', () => {
    expect([nws({ Privilege: 'E' }).u, nws({ Privilege: 'MS' }).u, nws({ Privilege: 'PUB' }).u]).toEqual([2, 1, 0])
    expect([nws({ GroupResponsibility: 'Overseer' }).x, nws({ GroupResponsibility: 'Assistant' }).x, nws({}).x]).toEqual([1, 2, 0])
    expect([nws({ Gender: 'Female' }).t, nws({}).t]).toEqual([1, 0])
  })

  it('fehlt eine Spalte, bricht es ab — statt jeder Person diesen Bereich still zu nehmen', () => {
    const { UseForChairman: _weg, ...ohneVorsitz } = personZeile({})
    expect(() => personenAlsNws([ohneVorsitz])).toThrow('Spalte fehlt — UseForChairman')
    expect(() => personenAlsNws([])).toThrow('keine Personen')
  })

  it('ein unbekannter Wert bricht ab — auch ein klein geschriebenes „true" oder ein leeres Feld', () => {
    // Gemessen kamen nur diese Werte vor; ein anderer hieße, NWS hat den Export geändert.
    expect(() => nws({ Privilege: 'Elder' })).toThrow('unbekannter Wert „Elder" in Privilege (PersonID 101)')
    expect(() => nws({ UseForPrayers: 'true' })).toThrow('„true" in UseForPrayers')
    expect(() => nws({ Active: '' })).toThrow('„" in Active')
    expect(() => nws({ Gender: 'Unbekannt' })).toThrow('in Gender')
    expect(() => nws({ GroupResponsibility: 'Leader' })).toThrow('in GroupResponsibility')
  })

  it('aktiv steht umgekehrt da: ab ist nur bei Inaktiven falsch', () => {
    const { persons } = personenAlsNws([personZeile({ Active: 'True' }), personZeile({ PersonID: '102', Active: 'False' })])
    expect(persons.map((p: { ab: boolean }) => p.ab)).toEqual([true, false])
  })

  it('Kennungen bleiben Zahlen, und Person und Gruppe tragen dieselbe', () => {
    const { persons, groups } = personenAlsNws([personZeile({ FamilyID: '7', FieldServiceGroupID: '3', GroupName: 'PDG-3 Probe ' })])
    expect(persons[0]).toMatchObject({ ID: 101, f: 7, ax: 3, a: 'Probe', b: 'Eins', d: 'Probe Eins' })
    expect(groups).toEqual([{ ID: 3, a: 'PDG-3 Probe' }])
  })

  it('jede Gruppe einmal — und wer keiner angehört, erzeugt keine leere', () => {
    const { groups } = personenAlsNws([
      personZeile({ FieldServiceGroupID: '3', GroupName: 'PDG-3 Probe' }),
      personZeile({ PersonID: '102', FieldServiceGroupID: '3', GroupName: 'PDG-3 Probe' }),
      personZeile({ PersonID: '103', FieldServiceGroupID: '4', GroupName: 'PDG-4 Probe' }),
      personZeile({ PersonID: '104', FieldServiceGroupID: '', GroupName: '' }),
    ])
    expect(groups).toEqual([{ ID: 3, a: 'PDG-3 Probe' }, { ID: 4, a: 'PDG-4 Probe' }])
  })
})

describe('Welche Woche? Monat aus dem Dateinamen, Montag aus dem Kopf', () => {
  it('den Dateinamen vergibt NWS mit Monat und Jahr', () => {
    expect(monatAusDateiname('Probe November 2026 Wochenübersicht.docx')).toEqual({ monat: 11, jahr: 2026 })
    expect(monatAusDateiname('Probe März 2027 Wochenübersicht.docx')).toEqual({ monat: 3, jahr: 2027 })
    expect(monatAusDateiname('Wochenübersicht.docx')).toBeNull()
  })

  it('eine Woche über den Monatswechsel gehört dem Monat ihres Montags — in beiden Dateien', () => {
    expect(montagAusKopf('November 02-08', 2026, 11)).toBe('2026-11-02')
    expect(montagAusKopf('November 30-Dezember 06', 2026, 11)).toBe('2026-11-30')
    expect(montagAusKopf('November 30-Dezember 06', 2026, 12)).toBe('2026-11-30')
  })

  it('die erste Woche einer Januar-Datei beginnt im Dezember des Vorjahres', () => {
    expect(montagAusKopf('Dezember 29-Januar 04', 2026, 1)).toBe('2025-12-29')
  })

  it('ein Kopf, der nicht auf einen Montag fällt, bricht ab — statt die Woche zu verschieben', () => {
    // Gegenprobe zur Jahresregel: Im falschen Jahr fiele der 29. Dezember auf einen Dienstag.
    expect(() => montagAusKopf('Dezember 29-Januar 04', 2027, 1)).toThrow('beginnt nicht an einem Montag')
    expect(() => montagAusKopf('Probemonat 02-08', 2026, 11)).toThrow('Wochenkopf nicht lesbar')
  })
})

/* ===================== Die Wochenübersicht ================================= */

/** Die App führt „Probe Zwei 2" (NWS-Zähler im Nachnamen) als „Probe Zwei (2)"; die übrigen kennt sie nicht. */
const IN_DER_APP = new Map([['Probe Zwei 2', 'Probe Zwei (2)']])
const person = (text: string) => IN_DER_APP.get(text) ?? null

/**
 * Die erste Zeile der Zusammenkunft unter der Woche. Eine Titelzeile hat sie
 * nicht; eine Tabelle, die mit einer einzelnen Zelle beginnt, liest sich als
 * eigener Abschnitt.
 */
const VORSITZ_OFFEN = ['Vorsitzender', '·', 'Anfangsgebet', '·']

/** Die Zusammenkunft unter der Woche. */
function mitte(leben: Zelle[][] = [['6. Probe-Punkt', 'Probe Zwölf']]): string {
  return tabelle([
    ['Vorsitzender', 'Probe Eins', 'Anfangsgebet', 'Probe Zwei 2'],
    ['Schätze aus Gottes Wort'],
    ['1. Probe-Vortrag', 'Probe Drei'],
    ['2. Nach geistigen Schätzen graben', 'Probe Vier'],
    // Der Hauptsaal steht hier nicht in der letzten Spalte — die Raumzeile sagt, wo.
    ['', 'Hauptsaal', 'Zweiter Raum'],
    ['3. Bibellesung', 'Probe Fünf', 'Probe Sechs'],
    ['Uns im Dienst verbessern'],
    ['4. Probe-Gespräch', 'Probe Sieben & Probe Acht', 'Probe Neun & Probe Zehn'],
    ['5. Probe-Vortrag', 'Probe Elf', '·'],
    ['Unser Leben als Christ'],
    ...leben,
    ['7. Versammlungsbibelstudium', ['Leiter', 'Leser'], ['Probe Dreizehn', 'Probe Vierzehn']],
    ['Schlusslied', '', 'Schlussgebet', 'Probe Fünfzehn'],
  ])
}

const DIENSTE = [
  ['Saalordner', 'Probe Eins', 'Türordner', 'Probe Zwei 2'],
  ['Mikrofone', 'Probe Drei & Probe Vier', 'Audio/Video', 'Probe Fünf'],
  ['Zoomordner', '·', 'Benutzerdefiniert 1', 'Probe Sechs'],
]

function wochenende(redner: Zelle = ['Probe Gast', '(Probeversammlung)']): string {
  return abschnitt('Zusammenkunft am Wochenende', [
    ['Vorsitzender', 'Probe Eins'],
    // Der Redner steht vor dem Thema — das Thema gehört trotzdem zu ihm.
    ['Vortragsredner', redner],
    ['Öffentlicher Vortrag', 'Probe-Thema'],
    ['Wachtturm-Leser', 'Probe Zwei 2'],
  ])
}

/** Eine ganze Woche, wie NWS sie exportiert. */
function woche(kopf: string[] = ['August 24-30'], teile: { mitte?: string; wochenende?: string } = {}): string[] {
  return [
    wochenKopf(...kopf),
    teile.mitte ?? mitte(),
    abschnitt('Dienste unter der Woche', DIENSTE),
    teile.wochenende ?? wochenende(),
    abschnitt('Dienste am Wochenende', [['Saalordner', 'Probe Sechs', 'Mikrofone', '·']]),
    abschnitt('Reinigung', [['Zwischenreinigung', 'PDG-2 Probe', 'Wöchentliche Reinigung', 'PDG-3 Probe']]),
    abschnitt('Predigtdienst', [['Montag', 'Dienstag'], [['9:30 (PDG-1)', 'Probe-Ort', 'Leiter: Probe Eins'], '·']]),
  ]
}

const lesen = (tabellen: string[], jahr = 2026, monat = 8) => wochenAusUebersicht(dokument(tabellen), { jahr, monat, person })

describe('wochenAusUebersicht — jeder Name an seinen Platz', () => {
  it('eine ganze Woche: Programm, Hilfsdienste und Reinigung, in der Form des NWS-Imports', () => {
    const { wochen, uebersprungen } = lesen(woche())
    expect([...wochen.keys()]).toEqual(['2026-08-24'])
    expect(wochen.get('2026-08-24')).toEqual({
      besonderheit: null,
      mid: {
        chairman: 'Probe Eins',
        openingPrayer: 'Probe Zwei (2)',
        closingPrayer: 'Probe Fünfzehn',
        auxCounselor: null,
        treasuresTalk: 'Probe Drei',
        spiritualGems: 'Probe Vier',
        bibleReading: 'Probe Fünf',
        apply: [{ student: 'Probe Sieben', assistant: 'Probe Acht' }, { student: 'Probe Elf', assistant: null }],
        living: ['Probe Zwölf'],
        cbs: 'Probe Dreizehn',
        cbsReader: 'Probe Vierzehn',
        helpers: { saal: ['Probe Eins'], eingang: ['Probe Zwei (2)'], mik: ['Probe Drei', 'Probe Vier'], ton: ['Probe Fünf'] },
        cleaning: 'Gruppe 3',
      },
      we: {
        chairman: 'Probe Eins',
        watchtowerReader: 'Probe Zwei (2)',
        speaker: { name: 'Probe Gast', external: true, herkunft: 'Probeversammlung', theme: 'Probe-Thema', number: null },
        openingSong: null,
        closingSong: null,
        helpers: { saal: ['Probe Sechs'] },
        cleaning: null,
      },
    })
    // „Benutzerdefiniert 1" hat kein App-Pendant: gezählt, nicht übernommen.
    expect(uebersprungen).toEqual({ dienste: 1 })
  })

  it('ohne Raumzeile zählt die letzte Spalte als Hauptsaal', () => {
    const ohneRaeume = tabelle([VORSITZ_OFFEN, ['Schätze aus Gottes Wort'], ['3. Bibellesung', 'Probe Fünf', 'Probe Sechs']])
    const { wochen } = lesen([wochenKopf('August 24-30'), ohneRaeume])
    expect(wochen.get('2026-08-24')?.mid.bibleReading).toBe('Probe Sechs')
  })

  it('ein Bruder der Versammlung als Redner wird an seine Person gebunden — kein Gast', () => {
    const { wochen } = lesen(woche(undefined, { wochenende: wochenende(['Probe Zwei 2']) }))
    expect(wochen.get('2026-08-24')?.we.speaker).toEqual({ name: 'Probe Zwei (2)', external: false, herkunft: null, theme: 'Probe-Thema', number: null })
  })

  it('wen die App nicht kennt, der behält den Namen aus dem Export — geglättet', () => {
    const mitLeerraum = tabelle([['Vorsitzender', `Probe${NBSP} Eins `, 'Anfangsgebet', '·']])
    const { wochen } = lesen([wochenKopf('August 24-30'), mitLeerraum])
    expect(wochen.get('2026-08-24')?.mid).toMatchObject({ chairman: 'Probe Eins', openingPrayer: null })
  })

  it('der Vortrag des Kreisaufsehers verschiebt die Punkte nicht — und die Woche sagt, dass er kommt', () => {
    const leben = [['6. Probe-Punkt', 'Probe Zwölf'], ['7. Probe-Dienstvortrag', 'KA: Probe Kreisaufseher']]
    const { wochen } = lesen(woche(['Dezember 07-13', 'Kreisaufseher'], { mitte: mitte(leben) }), 2026, 12)
    const ka = wochen.get('2026-12-07')
    expect(ka?.besonderheit).toBe('Kreisaufseher')
    expect(ka?.mid.living).toEqual(['Probe Zwölf'])
  })

  it('mehrere Wochen in einer Datei, jede an ihrem Montag', () => {
    const { wochen } = lesen([...woche(['November 23-29']), ...woche(['November 30-Dezember 06'])], 2026, 11)
    expect([...wochen.keys()]).toEqual(['2026-11-23', '2026-11-30'])
  })

  it('die Zwischenreinigung gilt, wenn keine wöchentliche eingetragen ist', () => {
    const { wochen } = lesen([wochenKopf('August 24-30'), abschnitt('Reinigung', [['Zwischenreinigung', 'PDG-2 Probe', 'Wöchentliche Reinigung', '·']])])
    expect(wochen.get('2026-08-24')?.mid.cleaning).toBe('Gruppe 2')
  })

  it('ein benutzerdefinierter Dienst ohne Eingeteilten zählt nicht als übersprungen', () => {
    const { uebersprungen } = lesen([wochenKopf('August 24-30'), abschnitt('Dienste unter der Woche', [['Benutzerdefiniert 2', '·']])])
    expect(uebersprungen).toEqual({ dienste: 0 })
  })

  it('das Und-Zeichen zwischen zwei Namen übersteht die XML-Kodierung', () => {
    // Im Dokument steht „&amp;" — erst nach dem Entschlüsseln trennt es die Namen.
    const xml = dokument([wochenKopf('August 24-30'), abschnitt('Dienste unter der Woche', [['Mikrofone', 'Probe Drei & Probe Vier']])])
    expect(xml).toContain('Drei &amp; Probe Vier')
    const { wochen } = wochenAusUebersicht(xml, { jahr: 2026, monat: 8, person })
    expect(wochen.get('2026-08-24')?.mid.helpers.mik).toEqual(['Probe Drei', 'Probe Vier'])
  })
})

describe('wochenAusUebersicht — Unbekanntes bricht ab, statt still wegzufallen', () => {
  /*
    Ändert NWS seinen Export — ein neuer Abschnitt, ein umbenannter Dienst —,
    soll der Import stehen bleiben. Liefe er weiter, fehlten Plätze, und
    niemand sähe den Unterschied zu einem Platz, den NWS offen ließ.
  */
  const kopf = wochenKopf('August 24-30')

  it('ein unbekannter Abschnitt', () => {
    expect(() => lesen([kopf, abschnitt('Probe-Abschnitt', [['Probe', 'Probe Eins']])])).toThrow('unbekannter Abschnitt „Probe-Abschnitt"')
  })

  it('ein unbekannter Dienst', () => {
    expect(() => lesen([kopf, abschnitt('Dienste unter der Woche', [['Gartenpflege', 'Probe Eins']])])).toThrow('unbekannter Dienst „Gartenpflege"')
  })

  it('ein unbekannter Programmpunkt unter den Schätzen und ein unbekannter Teil der Zusammenkunft', () => {
    expect(() => lesen([kopf, tabelle([VORSITZ_OFFEN, ['Schätze aus Gottes Wort'], ['4. Probe-Punkt', 'Probe Eins']])])).toThrow('unbekannter Programmpunkt')
    expect(() => lesen([kopf, tabelle([['Vorsitzender', 'Probe Eins'], ['Probe-Teil']])])).toThrow('unbekannter Abschnitt „Probe-Teil"')
  })

  it('eine Zeile vor dem ersten Teil der Zusammenkunft', () => {
    expect(() => lesen([kopf, tabelle([['1. Probe-Vortrag', 'Probe Drei']])])).toThrow('außerhalb eines Abschnitts')
  })

  it('eine Tabelle vor dem ersten Wochenkopf', () => {
    expect(() => lesen([abschnitt('Reinigung', [])])).toThrow('vor dem ersten Wochenkopf')
  })

  it('eine verschachtelte Tabelle', () => {
    const verschachtelt = `<w:tbl><w:tr><w:tc>${tabelle([['Probe']])}</w:tc></w:tr></w:tbl>`
    expect(() => lesen([kopf, verschachtelt])).toThrow('verschachtelte Tabelle')
  })

  it('die Gegenprobe: ein bekannter Export geht ohne Wurf durch', () => {
    expect(() => lesen(woche())).not.toThrow()
  })
})
