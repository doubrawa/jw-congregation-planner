import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TABELLEN as ABWESENHEITEN } from './abwesenheiten-importieren.mjs'
import { lebend, personIdAufloeser } from './nws-personen.mjs'
import {
  NWS_TABELLEN,
  PERSONEN_VERWEISE,
  juengereSicherung,
  ladeStand,
  liegtIn,
  main,
  staendeAus,
  vereine,
  vereinePersonen,
  vereineZeilen,
} from './nws-staende-vereinen.mjs'
import { TABELLEN as TREFFPUNKTE } from './treffpunkte-importieren.mjs'
import { TABELLEN as WOCHENPLANUNG, sammleNwsWochen, uuid5 } from './wochenplanung-importieren.mjs'

/**
 * **Was NWS gelöscht hat, holt der Neuaufbau aus den Sicherungen** (18.10.2026).
 *
 * NWS löscht abgelaufene Zeilen, seine automatischen Sicherungen haben sie
 * noch. Drei Dinge entscheiden, ob das Vereinen stimmt: Eine in NWS entfernte
 * Zuteilung darf nicht aus einer älteren Sicherung zurückkommen; eine Person
 * bleibt eine, obwohl ihre `ID` im April 2026 das Format wechselte; und eine
 * Abwesenheit mit der alten ID muss bei der Person ankommen, die die App kennt
 * — sonst fiele sie still weg.
 */

const ALT_ID = 'alt-00000000000001' // Form bis April 2026: Text, 18 Zeichen
const NEU_ID = 430000001 // seitdem: neunstellige Zahl
const paul = { ID: NEU_ID, mid: 100001, cid: '111-222-333', d: 'Paul Beispiel', Deleted: false }
const paulAlt = { ID: ALT_ID, mid: 100001, cid: '111-222-333', d: 'Paul Beispiel', Deleted: false }
const anna = { ID: 'alt-00000000000002', mid: 100002, d: 'Anna Muster', Deleted: false } // nur noch in der Sicherung

/** Ein Stand wie aus `ladeStand`, ohne Platte; nicht genannte Tabellen leer, `null` bleibt `null`. */
const stand = (name: string, tabellen: Record<string, unknown[] | null>) => ({
  name,
  tabellen: Object.fromEntries(NWS_TABELLEN.map((d) => [d, d in tabellen ? tabellen[d] : []])),
})

describe('vereineZeilen', () => {
  it('nimmt je ID die Fassung des jüngsten Standes', () => {
    const neu = [{ ID: 1, a: '2026-02-02', b: 100001, Deleted: false }]
    const alt = [{ ID: 1, a: '2026-02-02', b: 100002, Deleted: false }]
    expect(vereineZeilen([neu, alt])).toEqual(neu)
  })

  it('lässt eine in NWS entfernte Zuteilung nicht aus der Sicherung zurückkommen', () => {
    // NWS behält den Löschvermerk, bis die Zeile abläuft — er gewinnt.
    const neu = [{ ID: 7, Deleted: true }]
    const alt = [{ ID: 7, a: '2026-02-02', b: 100001, c: 0, Deleted: false }]
    const vereint = vereineZeilen([neu, alt])
    expect(vereint).toEqual(neu)
    expect(lebend(vereint)).toEqual([])
  })

  it('holt, was im jüngeren Stand schon abgelaufen ist, aus dem älteren', () => {
    const neu = [{ ID: 2, a: '2026-03-02', Deleted: false }]
    const alt = [{ ID: 1, a: '2025-11-03', Deleted: false }, { ID: 2, a: '2026-03-02', Deleted: false }]
    expect(vereineZeilen([neu, alt]).map((z) => z.ID)).toEqual([1, 2])
  })

  it('stellt, was nur ältere Stände kennen, nach vorn — bei zwei Zeilen für einen Platz nimmt der Import die jüngere', () => {
    // Zwei lebende Zuteilungen für den Vorsitz derselben Woche: die alte aus
    // einer Sicherung, in NWS längst ersetzt und ihr Löschvermerk abgelaufen,
    // und die neue. `sammleNwsWochen` nimmt die letzte.
    const neu = [{ ID: 2, a: '2026-02-02', b: 100001, c: 0, Deleted: false }]
    const alt = [{ ID: 1, a: '2026-02-02', b: 100002, c: 0, Deleted: false }]
    const vereint = vereineZeilen([neu, alt])
    const namen: Record<number, string> = { 100001: 'Paul Beispiel', 100002: 'Anna Muster' }
    const wochen = sammleNwsWochen({ clmAssignments: vereint }, (ref: number) => namen[ref] ?? null)
    expect(wochen.get('2026-02-02')?.mid.chairman).toBe('Paul Beispiel')
  })

  it('vergleicht die ID als Text — NWS schrieb sie nicht immer als Zahl', () => {
    expect(vereineZeilen([[{ ID: 5, b: 1 }], [{ ID: '5', b: 2 }]])).toEqual([{ ID: 5, b: 1 }])
  })

  it('bricht bei einer Zeile ohne ID ab, statt still eine zu wählen', () => {
    expect(() => vereineZeilen([[{ a: '2026-02-02' }]], 'Duties_7.5.json')).toThrow(/Duties_7\.5\.json.*ohne ID/)
  })
})

describe('vereinePersonen', () => {
  it('führt eine Person über die mid zusammen, obwohl ihre ID im April 2026 das Format wechselte', () => {
    expect(vereinePersonen([[paul], [paulAlt]])).toEqual([paul])
  })

  it('behält Weggezogene aus älteren Ständen — ihre alten Zuteilungen trügen sonst keinen Namen', () => {
    expect(vereinePersonen([[paul], [paulAlt, anna]])).toEqual([paul, anna])
  })

  it('nimmt für eine in NWS gelöschte Person die letzte Fassung ohne Löschvermerk', () => {
    const geloescht = { ID: NEU_ID, mid: 100001, Deleted: true }
    expect(vereinePersonen([[geloescht], [paul]])).toEqual([paul])
    // Nur wer überall gelöscht ist, bleibt als Vermerk.
    expect(vereinePersonen([[geloescht]])).toEqual([geloescht])
  })
})

describe('vereine', () => {
  const frisch = stand('frisch', {
    'Persons_7.5.json': [paul],
    'AwayPeriods_7.5.json': [{ ID: 900, a: NEU_ID, b: '2026-10-12', c: '2026-10-18', Deleted: false }],
  })
  const sicherung = stand('2026-03-15_18-31-24', {
    'Persons_7.5.json': [paulAlt, anna],
    'AwayPeriods_7.5.json': [
      { ID: 'alt-a1', a: ALT_ID, b: '2026-03-09', c: '2026-03-15', Deleted: false },
      { ID: 'alt-a2', a: 'alt-00000000000002', b: '2026-03-09', c: '2026-03-12', Deleted: false },
    ],
    'FieldServiceMeetings_7.5.json': [{ ID: 50, a: '2026-01-10T09:30:00', h: 100001, Deleted: false }],
    'UnavailablePeriods_7.5.json': null, // gab es in der älteren NWS-Fassung noch nicht
  })

  it('schreibt eine Abwesenheit mit der alten ID auf die neue um — die App findet die Person', () => {
    const { tabellen, umgeschrieben } = vereine([frisch, sicherung])
    const abwesenheit = tabellen['AwayPeriods_7.5.json']!.find((z) => z.ID === 'alt-a1')
    expect(abwesenheit?.a).toBe(NEU_ID)
    expect(umgeschrieben).toBe(1)
    // So, wie `abwesenheiten-importieren.mjs` sie auflöst: bei der App-Person aus dem frischen Stand.
    expect(personIdAufloeser(tabellen['Persons_7.5.json'])(abwesenheit?.a)).toBe(uuid5(`person:${NEU_ID}`))
  })

  it('lässt die Abwesenheit eines Weggezogenen, wie sie ist', () => {
    const { tabellen } = vereine([frisch, sicherung])
    expect(tabellen['AwayPeriods_7.5.json']!.find((z) => z.ID === 'alt-a2')?.a).toBe('alt-00000000000002')
  })

  it('lässt einen Verweis über die mid stehen — die blieb beim Wechsel der ID gleich', () => {
    const { tabellen } = vereine([frisch, sicherung])
    expect(tabellen['FieldServiceMeetings_7.5.json']).toEqual(sicherung.tabellen['FieldServiceMeetings_7.5.json'])
  })

  it('kommt mit einer Tabelle zurecht, die ein älterer Stand nicht hat', () => {
    const mitVerhinderung = stand('frisch', { 'Persons_7.5.json': [paul], 'UnavailablePeriods_7.5.json': [{ ID: 3, a: '111-222-333-100001' }] })
    expect(vereine([mitVerhinderung, sicherung]).tabellen['UnavailablePeriods_7.5.json']).toEqual([{ ID: 3, a: '111-222-333-100001' }])
  })

  it('liefert jede Tabelle, die die Importe lesen — auch leer', () => {
    // Die Importe laden ihre Tabellen ohne Rückfall (`ladeTabellen`): Fehlte eine Datei, stiegen sie aus.
    expect(Object.keys(vereine([frisch]).tabellen).sort()).toEqual(NWS_TABELLEN)
  })
})

describe('NWS_TABELLEN', () => {
  it('ist genau, was die drei Importe lesen', () => {
    const gelesen = new Set([...Object.values(WOCHENPLANUNG), ...Object.values(ABWESENHEITEN), ...Object.values(TREFFPUNKTE)])
    expect(new Set(NWS_TABELLEN)).toEqual(gelesen)
  })

  it('enthält jede Tabelle mit Personenverweisen über die ID', () => {
    // Hieße eine Datei anders, würde ihr Verweis still nicht umgeschrieben.
    for (const datei of Object.keys(PERSONEN_VERWEISE)) expect(NWS_TABELLEN).toContain(datei)
  })
})

describe('liegtIn', () => {
  const ordner = path.join(os.tmpdir(), 'staende')

  it('erkennt den Ordner selbst und alles darin, nicht aber den Nachbarn', () => {
    expect(liegtIn(ordner, ordner)).toBe(true)
    expect(liegtIn(ordner, path.join(ordner, 'neu'))).toBe(true)
    expect(liegtIn(ordner, path.join(ordner, '..neu'))).toBe(true) // ein Name, kein Schritt hinauf
    expect(liegtIn(ordner, path.join(os.tmpdir(), 'staende-vereint'))).toBe(false)
    expect(liegtIn(ordner, os.tmpdir())).toBe(false)
  })

  it.runIf(process.platform === 'win32')('nimmt unter Windows Groß- und Kleinschreibung gleich wie das Dateisystem', () => {
    expect(liegtIn(ordner, path.join(ordner.toUpperCase(), 'neu'))).toBe(true)
  })
})

describe('auf der Platte', () => {
  let wurzel: string
  const lege = (dir: string, tabellen: Record<string, unknown[]>) => {
    fs.mkdirSync(dir, { recursive: true })
    for (const [datei, zeilen] of Object.entries(tabellen)) fs.writeFileSync(path.join(dir, datei), JSON.stringify(zeilen))
  }

  beforeEach(() => {
    wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'nws-staende-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(wurzel, { recursive: true, force: true })
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('ordnet einen Ordner voller Sicherungen jüngste zuerst und übergeht Fremdes', () => {
    const frisch = path.join(wurzel, 'frisch')
    const sicherungen = path.join(wurzel, 'sicherungen')
    lege(frisch, { 'Persons_7.5.json': [] })
    for (const name of ['2026-03-15_18-31-24', '2026-10-18_08-26-46', '2026-04-25_06-43-30']) {
      lege(path.join(sicherungen, name), { 'Persons_7.5.json': [] })
    }
    fs.mkdirSync(path.join(sicherungen, '_roh-2026-10-19_07-00-00')) // halb entpackt, ohne Personen
    lege(path.join(sicherungen, 'MyData-kopie'), { 'Persons_7.5.json': [] }) // ein Stand, aber ohne Zeitstempel
    expect(staendeAus(frisch, sicherungen).map((d) => path.basename(d))).toEqual([
      'frisch',
      '2026-10-18_08-26-46',
      '2026-04-25_06-43-30',
      '2026-03-15_18-31-24',
    ])
  })

  it('nimmt einen einzelnen älteren Stand als einen — etwa einen früher vereinten', () => {
    const frisch = path.join(wurzel, 'frisch')
    const vereint = path.join(wurzel, 'vereint')
    lege(frisch, { 'Persons_7.5.json': [] })
    lege(vereint, { 'Persons_7.5.json': [] })
    expect(staendeAus(frisch, vereint)).toEqual([frisch, vereint])
  })

  it('setzt null für eine Tabelle, die es im Stand nicht gibt', () => {
    const dir = path.join(wurzel, 'alt')
    lege(dir, { 'Persons_7.5.json': [paulAlt] })
    const s = ladeStand(dir)
    expect(s.tabellen['Persons_7.5.json']).toEqual([paulAlt])
    expect(s.tabellen['UnavailablePeriods_7.5.json']).toBeNull()
  })

  it('schreibt jede Tabelle der Importe und woraus sie besteht', async () => {
    const frisch = path.join(wurzel, 'frisch')
    const sicherungen = path.join(wurzel, 'sicherungen')
    const ziel = path.join(wurzel, 'vereint')
    lege(frisch, { 'Persons_7.5.json': [paul] })
    lege(path.join(sicherungen, '2026-03-15_18-31-24'), { 'Persons_7.5.json': [paulAlt, anna] })
    await main(['--frisch', frisch, '--aelter', sicherungen, '--nach', ziel])
    expect(process.exitCode).toBeUndefined()
    for (const datei of NWS_TABELLEN) expect(fs.existsSync(path.join(ziel, datei)), datei).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(ziel, 'Persons_7.5.json'), 'utf8'))).toEqual([paul, anna])
    expect(JSON.parse(fs.readFileSync(path.join(ziel, 'vereint-aus.json'), 'utf8')).staende).toEqual(['frisch', '2026-03-15_18-31-24'])
  })

  it('erkennt eine Sicherung, die nach dem frischen Stand entstand', () => {
    const frisch = path.join(wurzel, 'frisch')
    lege(frisch, { 'Persons_7.5.json': [] })
    const entschluesselt = new Date(2026, 9, 18, 12, 0, 0) // so stempelt das decrypt-tool
    fs.utimesSync(path.join(frisch, 'Persons_7.5.json'), entschluesselt, entschluesselt)
    const sicherungen = ['2026-10-18_13-00-00', '2026-10-18_08-26-46'].map((n) => path.join(wurzel, 'sicherungen', n))
    expect(juengereSicherung(frisch, sicherungen)).toBe('2026-10-18_13-00-00')
    expect(juengereSicherung(frisch, sicherungen.slice(1))).toBeNull()
    // Ein früher vereinter Ordner trägt keinen Zeitstempel im Namen — er zählt nicht.
    expect(juengereSicherung(frisch, [path.join(wurzel, 'MyData-vereint')])).toBeNull()
  })

  it('vereint nicht, wenn eine Sicherung jünger ist als der frische Stand', async () => {
    const frisch = path.join(wurzel, 'frisch')
    const sicherungen = path.join(wurzel, 'sicherungen')
    const ziel = path.join(wurzel, 'vereint')
    lege(frisch, { 'Persons_7.5.json': [paul] })
    const alt = new Date(2026, 2, 1, 9, 0, 0)
    fs.utimesSync(path.join(frisch, 'Persons_7.5.json'), alt, alt)
    lege(path.join(sicherungen, '2026-03-15_18-31-24'), { 'Persons_7.5.json': [paulAlt] })
    await main(['--frisch', frisch, '--aelter', sicherungen, '--nach', ziel])
    expect(process.exitCode).toBe(2)
    expect(fs.existsSync(ziel)).toBe(false)
  })

  it('schreibt nicht in einen der Stände', async () => {
    const frisch = path.join(wurzel, 'frisch')
    const sicherungen = path.join(wurzel, 'sicherungen')
    lege(frisch, { 'Persons_7.5.json': [paul] })
    lege(path.join(sicherungen, '2026-03-15_18-31-24'), { 'Persons_7.5.json': [paulAlt] })
    await main(['--frisch', frisch, '--aelter', sicherungen, '--nach', frisch])
    expect(process.exitCode).toBe(2)
    await main(['--frisch', frisch, '--aelter', sicherungen, '--nach', path.join(sicherungen, 'neu')])
    expect(process.exitCode).toBe(2)
    expect(fs.readdirSync(frisch)).toEqual(['Persons_7.5.json'])
    expect(fs.existsSync(path.join(sicherungen, 'neu'))).toBe(false)
  })
})
