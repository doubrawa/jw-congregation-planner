/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { setAnlass } from '../data/anlass'
import { syncAuxSlots } from '../data/aux-class'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG } from '../data/constants'
import { genFsWeek } from '../data/fs'
import { isSong } from '../data/helpers'
import type { FsInstance, FsRule, PlanEintrag, Section, Service, Week, WeitererPlan } from '../data/types'
import { spannenText, zeitraumText } from '../components/weitere-plaene-anzeige'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { Bogen } from './Bogen'
import { PlanBogen } from './PlanBogen'
import { tabellenBloecke } from './tabellen-bloecke'
import { GruppenbesuchBogen, TreffpunktBogen } from './TreffpunktBogen'
import { TrolleyBogen } from './TrolleyBogen'
import { useDruckBogen } from './useDruckBogen'
import { MonatsBogen, WochenBogen } from './ZusammenkunftBogen'

/**
 * **Die Druckbögen der Zusammenkünfte** (T121, Phase 9; Entwürfe
 * `GDruckWoche`, `GDruckMonat`): eigenes Papier statt des gedruckten
 * Bildschirms — beide Tage einer Woche auf einem Blatt, die Hilfsdienste
 * darunter, freie Plätze gepunktet zum Eintragen von Hand.
 */

const t = dict('de')

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'saal', name: 'Saalordner', count: 1, groups: false },
]

function mitte(): Section[] {
  return [
    {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ iid: 'e1', title: 'Lied 12 · Gebet · Einleitende Worte', meta: '1 Min.', names: [{ name: 'Vera Vorn', rolle: 'Vorsitz' }, { name: '', rolle: 'Gebet' }] }],
    },
    {
      label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
      items: [
        { iid: 'd4', num: 4, title: 'Gespräche beginnen', meta: '3 Min.', names: [{ name: 'Sara Schul', rolle: 'Schüler' }, { name: 'Paula Part', rolle: 'Partner', bereichsKey: 'schulungPartner' }] },
        { iid: 'd5', num: 5, title: 'Interesse fördern', meta: '4 Min.', names: [{ name: 'Sina Solo', rolle: 'Schüler' }, { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' }] },
      ],
    },
    {
      label: 'UNSER LEBEN ALS CHRIST', farbe: 'wein',
      items: [{ iid: 'l8', num: 8, title: 'Versammlungsbibelstudium', meta: '30 Min.', names: [{ name: 'Leo Leiter', rolle: 'Leiter' }, { name: 'Lea Leser', rolle: 'Leser' }] }],
    },
    { label: LABEL_ABSCHLUSS, farbe: 'neutral', items: [{ iid: 'a1', title: 'Lied 99 · Gebet', meta: '', names: [{ name: 'Gerd Gebet', rolle: 'Gebet' }] }] },
  ]
}

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07',
    mid: { date: '', end: 'Ende ca. 20:45', sections: mitte(), helpers: { mik: [{ name: 'Mia Mikro' }], saal: [] } },
    we: { date: '', end: 'Ende ca. 11:45', sections: [], helpers: { mik: [{ name: 'Max Mikro' }, { name: 'Moni Mikro' }], saal: [{ name: 'Sven Saal' }] } },
    ...over,
  }
}

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    screen: 'programm', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: true,
    services: DIENSTE, weeks: [woche()], week: 0,
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
}

function Buehne({ state, children }: { state: AppState; children: React.ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={vi.fn()}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

const zeige = (inhalt: React.ReactNode, over: Partial<AppState> = {}) =>
  render(<Buehne state={zustand(over)}>{inhalt}</Buehne>)

const texte = (c: ParentNode, sel: string) => [...c.querySelectorAll(sel)].map((e) => e.textContent ?? '')

afterEach(cleanup)

describe('Der Wochenbogen', () => {
  it('beide Tage auf einem Blatt, die Hilfsdienste darunter — Kopf mit Versammlung, Thema und Woche samt Jahr', () => {
    const { container } = zeige(<WochenBogen wi={0} />)
    expect(container.querySelectorAll('.druck-blatt')).toHaveLength(1)
    expect(texte(container, '.druck-tag-datum')).toEqual(['Dienstag, 8. September', 'Sonntag, 13. September'])
    const kopf = container.querySelector('.druck-blatt-kopf')?.textContent ?? ''
    expect(kopf).toContain('Versammlung Nordheim')
    expect(kopf).toContain(t.navZusammenkuenfte)
    expect(kopf).toContain('7.–13. September 2026')
    expect(container.querySelector('.druck-blatt-fuss')?.textContent).toContain('Seite 1 von 1')
  })

  it('Namen mit Rolle, ein freier Platz gepunktet — mit seinem Namen für Vorleseprogramme', () => {
    const { container } = zeige(<WochenBogen wi={0} />)
    const punkte = [...container.querySelectorAll('.druck-punkt')]
    const gespraech = punkte.find((p) => p.textContent?.includes('Gespräche beginnen'))!
    expect(gespraech.querySelector('.druck-personen')?.textContent).toBe('Sara Schul Schüler · Paula Part Partner')
    const eroeffnung = punkte.find((p) => p.textContent?.includes('Einleitende Worte'))!
    expect(eroeffnung.querySelectorAll('.druck-offen')).toHaveLength(1)
    expect(eroeffnung.querySelector('.druck-offen')?.getAttribute('aria-label')).toBe(t.offenWort)
  })

  it('auf Papier steht der eigene Name, kein „Du" — der Aushang gilt allen', () => {
    const { container } = zeige(<WochenBogen wi={0} />, { personId: 'p-a' })
    expect(container.textContent).not.toContain(t.chipDu)
  })

  it('die Hilfsdienste: je Dienst eine Zeile, je Tag eine Spalte — bis zur Platzzahl, freie Plätze gepunktet', () => {
    const { container } = zeige(<WochenBogen wi={0} />)
    const zeilen = [...container.querySelectorAll('.druck-hilfsdienste .druck-dienst-zeile:not(.druck-dienst-zeile--kopf)')]
    expect(zeilen.map((z) => z.firstElementChild?.textContent)).toEqual(['Mikrofone', 'Saalordner'])
    const [mik, saal] = zeilen
    // Mikrofone: unter der Woche einer von zwei Plätzen besetzt — Name und Punkte.
    expect(mik?.children[1]?.textContent).toBe('Mia Mikro, ')
    expect(mik?.children[1]?.querySelector('.druck-offen')).not.toBeNull()
    expect(mik?.children[2]?.textContent).toBe('Max Mikro, Moni Mikro')
    expect(saal?.children[1]?.querySelector('.druck-offen')).not.toBeNull()
    expect(saal?.children[2]?.textContent).toBe('Sven Saal')
  })

  it('fällt ein Tag aus, steht er durchgestrichen da — mit dem Grund statt des Programms', () => {
    const w = woche({ dev: { mid: { cancelled: true, reason: 'Saal belegt' } } })
    const { container } = zeige(<WochenBogen wi={0} />, { weeks: [w] })
    expect(container.querySelector('.druck-tag-datum s')?.textContent).toBe('Dienstag, 8. September')
    expect(container.querySelector('.druck-ausfall')?.textContent).toBe('Saal belegt')
  })
})

describe('Der Monatsbogen', () => {
  const MONTAGE = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-10-05']
  const wochen = () => MONTAGE.map((start) => woche({ start, range: `Woche ab ${start}` }))

  it('jede Woche, deren Montag im Monat liegt — knapp, je Punkt eine Zeile', () => {
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks: wochen() })
    expect(texte(container, '.druck-monat-titel')).toEqual(['Woche ab 2026-09-07', 'Woche ab 2026-09-14'])
    expect(container.querySelector('.druck-blatt-kopf')?.textContent).toContain('September 2026')
  })

  it('Schüler und Partner als „A mit B", Leiter und Leser als „A · Leser B" — fehlt einer, ist der Platz frei', () => {
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks: wochen() })
    const woche1 = container.querySelector('.druck-monat-woche')!
    const zeilen = [...woche1.querySelectorAll('.druck-knapp-zeile')].map((z) => [...z.children].map((c) => c.textContent))
    expect(zeilen).toContainEqual(['4', 'Gespräche beginnen', 'Sara Schul mit Paula Part'])
    expect(zeilen).toContainEqual(['8', 'Versammlungsbibelstudium', 'Leo Leiter · Leser Lea Leser'])
    const interesse = [...woche1.querySelectorAll('.druck-knapp-zeile')].find((z) => z.textContent?.includes('Interesse fördern'))!
    expect(interesse.querySelector('.druck-offen')).not.toBeNull()
    expect(interesse.textContent).not.toContain('Sina Solo')
  })

  it('der Partner ist sein Platz, nicht das Wort davor — auch mit anderer Beschriftung „A mit B"', () => {
    // Wie beim Zuteilen (`planning.ts`) zählt `bereichsKey`; die Rolle ist nur
    // die Beschriftung des Platzes.
    const umbenannt = wochen().map((w) => ({
      ...w,
      mid: {
        ...w.mid,
        sections: w.mid.sections.map((s) => ({
          ...s,
          items: s.items.map((item) =>
            isSong(item)
              ? item
              : { ...item, names: item.names.map((n) => (n.bereichsKey === 'schulungPartner' ? { ...n, rolle: 'Gesprächspartner' } : n)) },
          ),
        })),
      },
    }))
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks: umbenannt })
    const zeilen = [...container.querySelectorAll('.druck-monat-woche .druck-knapp-zeile')].map((z) => z.children[2]?.textContent)
    expect(zeilen).toContain('Sara Schul mit Paula Part')
  })

  it('Eröffnung und Abschluss: je Person eine Zeile mit ihrer Rolle — das Lied steht im Kopf', () => {
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks: wochen() })
    const woche1 = container.querySelector('.druck-monat-woche')!
    const zeilen = [...woche1.querySelectorAll('.druck-knapp-zeile')].map((z) => z.children[1]?.textContent)
    expect(zeilen.slice(0, 2)).toEqual(['Vorsitz', 'Gebet'])
    expect(texte(woche1, '.druck-knapp-abschnitt .druck-lied')).toContain('Lied 12')
  })

  it('mit Zusätzlicher Klasse steht ihr Ratgeber da — wie im Wochenbogen (16.10.2026)', () => {
    // Bis dahin standen im Monatsbogen die Plätze der Klasse, ihr Ratgeber nicht.
    const weeks = syncAuxSlots(wochen(), true).map((w) =>
      w.mid.auxRatgeber ? { ...w, mid: { ...w.mid, auxRatgeber: { ...w.mid.auxRatgeber, name: 'Rolf Rat' } } } : w,
    )
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks })
    const woche1 = container.querySelector('.druck-monat-woche')!
    const zeilen = [...woche1.querySelectorAll('.druck-knapp-zeile')].map((z) => [...z.children].map((c) => c.textContent))
    expect(zeilen).toContainEqual(['', `${t.auxKlasse} · ${t.auxRatgeber}`, 'Rolf Rat'])
    // Gegenprobe: ohne Klasse keine solche Zeile.
    cleanup()
    const ohne = zeige(<MonatsBogen monat="2026-09" />, { weeks: wochen() }).container
    expect(ohne.textContent).not.toContain(t.auxRatgeber)
  })

  it('die Kongresswoche steht mit einem Satz da — und wann die nächste Zusammenkunft ist', () => {
    const weeks = setAnlass(wochen(), 1, 'kongress')
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks })
    const kongress = container.querySelector('.druck-monat-woche')!
    expect(kongress.querySelector('.druck-anlass')?.textContent).toBe(t.kongress)
    expect(kongress.querySelector('.druck-kongress')?.textContent).toBe(t.kongressAusfall)
    expect(kongress.querySelector('.druck-hinweis')?.textContent).toContain('Dienstag, 15. September')
    expect(kongress.querySelector('.druck-knapp-tag')).toBeNull()
  })
})

/**
 * **Der Bogen der Treffpunkte** (Entwurf `GDruckTreffpunkte`): Versammlung und
 * Gruppen je Datum, was anders ist als sonst, die nächsten Gruppenbesuche —
 * mit dem, was der Leser auch am Bildschirm sieht (`fsVisible`).
 */
describe('Der Bogen der Treffpunkte', () => {
  const GRUPPEN = [
    { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
    { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
  ]
  const REGELN: FsRule[] = [
    { id: 'rv', grp: null, wd: 3, time: '09:30', place: 'Königreichssaal', monthly: 0, skipCong: false },
    { id: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie A', monthly: 0, skipCong: false },
    { id: 'r2', grp: 'g2', wd: 6, time: '10:00', place: 'Bei Familie B', monthly: 0, skipCong: false, aus: ['2026-09-14'] },
  ]
  const STARTS = ['2026-09-07', '2026-09-14']
  const fsWeeks = (): FsInstance[][] =>
    STARTS.map((start) => genFsWeek(start, REGELN).map((inst) => (inst.id === 'rv' ? { ...inst, leader: 'Leo Leiter' } : inst)))
  const ICH_IN_G1 = { id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger' as const, female: false, tel: '', mail: '', priv: demoZustand().persons[0]!.priv, grp: 'g1' }

  const zeigeBogen = (over: Partial<AppState>) =>
    zeige(<TreffpunktBogen wochen={[0, 1]} zeitraum="September 2026" />, {
      weeks: STARTS.map((start) => woche({ start })),
      fsWeeks: fsWeeks(),
      fsRules: REGELN,
      groups: GRUPPEN,
      persons: [ICH_IN_G1],
      personId: 'p-a',
      gruppenbesuche: [
        { id: 'b1', woche: '2026-09-14', grp: 'g1', pid: null },
        { id: 'b2', woche: '2026-10-12', grp: 'g2', pid: null },
      ],
      ...over,
    })
  /** Die Zeilen der Tabelle mit diesem Titel: die erste in ihrem Block, die übrigen schließen an (`tabellenBloecke`). */
  const tabelle = (c: HTMLElement, titel: string): Element[] => {
    const start = [...c.querySelectorAll('.druck-block')].find((b) => b.querySelector('.druck-tabelle-titel')?.textContent === titel)
    const bloecke: Element[] = start ? [start] : []
    for (let b = start?.nextElementSibling; b?.classList.contains('druck-block--anschluss'); b = b.nextElementSibling) bloecke.push(b)
    return bloecke.flatMap((b) => [...b.querySelectorAll('.druck-tabelle-zeile:not(.druck-tabelle-zeile--kopf)')])
  }
  const zellen = (zeilen: Iterable<Element>) => [...zeilen].map((z) => [...z.children].map((c) => c.textContent))

  it('wer zuteilt, druckt Versammlung und alle Gruppen je Datum — ein freier Leiter gepunktet', () => {
    const { container } = zeigeBogen({ planner: true })
    expect(zellen(tabelle(container, t.druckVersammlungstreffpunkte)).map((z) => [z[2], z[3]])).toEqual([
      ['Königreichssaal', 'Leo Leiter'],
      ['Königreichssaal', 'Leo Leiter'],
    ])
    const gruppen = [...tabelle(container, t.druckGruppentreffpunkte)]
    expect(gruppen.map((z) => z.children[2]?.textContent)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 1'])
    expect(gruppen.every((z) => z.querySelector('.druck-offen') !== null)).toBe(true)
  })

  it('„Anders als sonst": was entfällt, und der Besuch des Dienstaufsehers', () => {
    const { container } = zeigeBogen({ planner: true })
    const anders = texte(container, '.druck-anders-zeile')
    expect(anders).toContainEqual(expect.stringContaining(`Gruppe 2 · ${t.druckEntfaellt}`))
    expect(anders).toContainEqual(expect.stringContaining(`Gruppe 1 · ${t.gbMarker}`))
  })

  it('an einem anderen Tag als im Grundplan: „statt" nennt den Tag — sonst stünden dort dieselben Angaben', () => {
    // Der Grundplan hat Gruppe 1 am Samstag; in dieser Woche steht sie am Freitag.
    const [erste, ...rest] = fsWeeks()
    const verlegt = [erste!.map((inst) => (inst.id === 'r1' ? { ...inst, wd: 5 } : inst)), ...rest]
    const { container } = zeigeBogen({ planner: true, fsWeeks: verlegt })
    expect(texte(container, '.druck-anders-zeile')).toContainEqual(
      expect.stringContaining(fill(t.druckStatt, { alt: 'Sa., 12.9. · 09:30 · Bei Familie A' })),
    )
  })

  it('der Bogen der Gruppenbesuche nennt die kommenden — vorbeigegangene nicht, wie die Ansicht', () => {
    const { container } = zeige(<GruppenbesuchBogen />, {
      planner: true,
      groups: GRUPPEN,
      gruppenbesuche: [
        { id: 'alt', woche: '2020-01-06', grp: 'g1', pid: null },
        { id: 'neu', woche: '2099-03-02', grp: 'g2', pid: null },
      ],
    })
    expect(container.querySelector('.druck-blatt-kopf')?.textContent).toContain(t.gbTitel)
    expect(zellen(tabelle(container, t.fsGruppenbesucheTab)).map((z) => z[2])).toEqual(['Gruppe 2'])
  })

  it('wer nicht zuteilt, druckt die Versammlung und die eigene Gruppe — von fremden Besuchen nur Woche und Gruppe', () => {
    const { container } = zeigeBogen({ planner: false, zuteiler: false })
    expect([...tabelle(container, t.druckGruppentreffpunkte)].map((z) => z.children[2]?.textContent)).toEqual(['Gruppe 1', 'Gruppe 1'])
    expect(texte(container, '.druck-anders-zeile').some((z) => z.includes('Gruppe 2'))).toBe(false)
    const besuche = zellen(tabelle(container, t.fsGruppenbesucheTab))
    expect(besuche.map((z) => z[2])).toEqual(['Gruppe 1', 'Gruppe 2'])
    expect(besuche[0]?.[1]).toContain('Bei Familie A')
    expect(besuche[1]?.[1]).toBe('')
  })
})

/**
 * **Die Trolleys über zwei Wochen** (Entwurf `GDruckTrolleys`): je Tag eine
 * Zeile, je Trolley eine Spalte; gestrichelt, wo jemand einen Partner sucht.
 */
describe('Der Bogen der Trolleys', () => {
  const person = (id: string, fn: string, ln: string) => ({ ...demoZustand().persons[0]!, id, fn, ln })
  const TROLLEYS = [
    { id: 't1', name: 'Trolley 1', ort: 'Depot', hinweis: '' },
    { id: 't2', name: 'Trolley 2', ort: 'Saal', hinweis: 'Schlüssel im Fach' },
  ]
  const termin = (id: string, trolleyId: string, datum: string, partner: string | null) => ({
    id, trolleyId, datum, von: '09:00', bis: '11:00', pid: 'p-a', partner, gemeinsam: false,
  })
  const zeigeTrolleys = () =>
    zeige(<TrolleyBogen montag="2026-09-07" />, {
      persons: [person('p-a', 'Anton', 'Alt'), person('p-b', 'Berta', 'Brand')],
      trolleys: TROLLEYS,
      trolleyTermine: [
        termin('r1', 't1', '2026-09-08', 'p-b'),
        termin('r2', 't2', '2026-09-16', null),
        termin('r3', 't1', '2026-09-21', 'p-b'), // die dritte Woche — nicht mehr auf dem Bogen
      ],
    })

  it('zwei Wochen, je Tag eine Zeile — zwischen den Wochen ein Strich', () => {
    const { container } = zeigeTrolleys()
    const zeilen = [...container.querySelectorAll('.druck-trolley-zeile:not(.druck-trolley-zeile--kopf)')]
    expect(zeilen).toHaveLength(14)
    expect(zeilen.map((z, i) => (z.classList.contains('is-neue-woche') ? i : -1)).filter((i) => i >= 0)).toEqual([7])
    expect(texte(container, '.druck-trolley-kopf')).toEqual(['Trolley 1abholen: Depot', 'Trolley 2abholen: Saal'])
  })

  it('wer mit wem steht — und gestrichelt, wo jemand einen Partner sucht', () => {
    const { container } = zeigeTrolleys()
    const termine = [...container.querySelectorAll('.druck-termin')]
    expect(termine).toHaveLength(2)
    expect(termine[0]?.textContent).toContain('09:00–11:00')
    expect(termine[0]?.classList.contains('is-gesucht')).toBe(false)
    expect(termine[1]?.classList.contains('is-gesucht')).toBe(true)
    expect(termine[1]?.textContent).toContain(t.trolleyPartnerGesucht)
  })

  it('darunter die Hinweise der Trolleys und dass die App am Vortag erinnert', () => {
    const { container } = zeigeTrolleys()
    const hinweis = container.querySelector('.druck-trolleys .druck-hinweis')?.textContent ?? ''
    expect(hinweis).toContain('Trolley 2 · Schlüssel im Fach')
    expect(hinweis).not.toContain('Trolley 1 ·')
    expect(hinweis).toContain(t.erinTrolleyVortag)
  })
})

/**
 * **Gemessen, nicht geschätzt** (`Bogen`): Wie viele Blöcke auf ein Blatt
 * passen, entscheidet ihre gemessene Höhe. jsdom rechnet kein Layout — die
 * Höhen kommen deshalb hier aus `data-hoehe`.
 */
describe('Bogen: Blöcke nach gemessener Höhe verteilen', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const hoehe = this.classList.contains('druck-blatt-kopf')
        ? 85
        : this.classList.contains('druck-blatt-fuss')
          ? 27
          : Number(this.querySelector<HTMLElement>('[data-hoehe]')?.dataset.hoehe ?? 0)
      return { height: hoehe, width: 0, top: 0, left: 0, right: 0, bottom: hoehe, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const bloecke = (...hoehen: number[]) => hoehen.map((h, i) => ({ key: `b${i}`, inhalt: <div data-hoehe={h}>Block {i}</div> }))
  const blaetter = (c: HTMLElement) => [...c.querySelectorAll('.druck-blatt')].map((b) => texte(b, '[data-hoehe]'))

  it('so viele Blöcke je Blatt, wie passen — die Seitenzahlen stimmen', () => {
    // Platz: 1122 − 85 (Kopf) − 27 (Fuß) = 1010; unter vitest gibt es kein CSS, also keinen Rand und keinen Abstand.
    const { container } = zeige(<Bogen titel="T" zeitraum="Z" bloecke={bloecke(500, 500, 500)} />)
    expect(blaetter(container)).toEqual([['Block 0', 'Block 1'], ['Block 2']])
    expect(texte(container, '.druck-blatt-fuss')).toEqual([
      expect.stringContaining('Seite 1 von 2'),
      expect.stringContaining('Seite 2 von 2'),
    ])
    expect(document.querySelector('.druck-messen'), 'die Messung bleibt nicht stehen').toBeNull()
  })

  it('Kopf und Fuß zählen mit — zwei Blöcke, die nur ohne sie zusammen passten, stehen auf zwei Blättern', () => {
    // 2 × 530 = 1060: mehr als 1010 (mit Kopf und Fuß), weniger als 1122 (ohne).
    const { container } = zeige(<Bogen titel="T" zeitraum="Z" bloecke={bloecke(530, 530)} />)
    expect(blaetter(container)).toEqual([['Block 0'], ['Block 1']])
  })

  it('ein Block, höher als ein Blatt, läuft weiter, statt abgeschnitten zu werden', () => {
    const { container } = zeige(<Bogen titel="T" zeitraum="Z" bloecke={bloecke(300, 1400)} />)
    const [erst, lang] = [...container.querySelectorAll('.druck-blatt')]
    expect(erst?.classList.contains('druck-blatt--ueberlang')).toBe(false)
    expect(lang?.classList.contains('druck-blatt--ueberlang')).toBe(true)
  })

  /** Eine Tabelle mit 30 Zeilen zu je 40 px. */
  const langeTabelle = () =>
    tabellenBloecke(
      't',
      { titel: 'Tabelle', spalten: '1fr', kopf: ['Spalte'] },
      Array.from({ length: 30 }, (_, i) => ({
        key: `z${i}`,
        zellen: [
          <span key="z" data-hoehe={40}>
            Zeile {i}
          </span>,
        ],
      })),
    )

  it('eine lange Tabelle läuft Zeile für Zeile auf dem nächsten Blatt weiter — Überschrift und Spaltenköpfe nur oben', () => {
    const { container } = zeige(<Bogen titel="T" zeitraum="Z" bloecke={langeTabelle()} />)
    // Platz 1010, je Zeile 40: 25 aufs erste Blatt, der Rest aufs zweite.
    expect(blaetter(container).map((b) => b.length)).toEqual([25, 5])
    const [erstes, zweites] = [...container.querySelectorAll('.druck-blatt')]
    expect(erstes!.querySelectorAll('.druck-tabelle-titel, .druck-tabelle-zeile--kopf')).toHaveLength(2)
    expect(zweites!.querySelector('.druck-tabelle-titel, .druck-tabelle-zeile--kopf')).toBeNull()
    // Oben auf dem zweiten Blatt die nächste Zeile — ohne den Abstand, der sie sonst an die davor rückt.
    expect(zweites!.querySelector('.druck-block')?.className).toBe('druck-block druck-block--anschluss')
    expect(erstes!.querySelector('.druck-block')?.className).toBe('druck-block')
  })

  it('zwischen den Zeilen einer Tabelle zählt der Abstand der Blöcke nicht — sonst bliebe das Blatt halb leer', () => {
    const echt = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
      el.classList.contains('druck-blatt')
        ? ({ paddingTop: '0px', paddingBottom: '0px', rowGap: '16px' } as CSSStyleDeclaration)
        : echt(el, pseudo),
    )
    // Platz: 1010 − 2 × 16 (je ein Abstand unter dem Kopf und über dem Fuß) = 978.
    // Ohne Abstände 24 Zeilen; zählte zwischen ihnen je einer mit, wären es 17.
    const { container } = zeige(<Bogen titel="T" zeitraum="Z" bloecke={langeTabelle()} />)
    expect(blaetter(container).map((b) => b.length)).toEqual([24, 6])
  })

  it('je ein Abstand unter dem Kopf und über dem Fuß — passt es nur mit einem, geht es aufs nächste Blatt (16.10.2026)', () => {
    // Abgezogen war bis dahin nur einer: Ein volles Blatt war 16 px höher als
    // A4, und der Fuß rutschte in den Rand des Papiers.
    const echt = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
      el.classList.contains('druck-blatt')
        ? ({ paddingTop: '0px', paddingBottom: '0px', rowGap: '16px' } as CSSStyleDeclaration)
        : echt(el, pseudo),
    )
    // 485 + 16 + 485 = 986: passt in 1010 − 16 = 994, nicht in 1010 − 32 = 978.
    const { container } = zeige(<Bogen titel="T" zeitraum="Z" bloecke={bloecke(485, 485)} />)
    expect(blaetter(container)).toEqual([['Block 0'], ['Block 1']])
  })

  it('eine Tabelle ohne Zeilen steht gar nicht da', () => {
    expect(tabellenBloecke('t', { spalten: '1fr', kopf: ['Spalte'] }, [], <p>davor</p>)).toEqual([])
  })
})

/**
 * **Ein Weiterer Plan auf Papier** (Entwurf `GDruckPlaene`, dort der
 * Winterdienst): je Woche oder Monat eine Zeile, wer dran ist und wer die
 * Gruppe leitet. Jede Zeile ein Block, damit ein langer Plan weiterläuft —
 * hier je Block 40 px statt eines Layouts, das jsdom nicht rechnet.
 */
describe('Der Bogen eines Weiteren Plans', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const hoehe = this.classList.contains('druck-blatt-kopf')
        ? 85
        : this.classList.contains('druck-blatt-fuss')
          ? 27
          : this.classList.contains('druck-block')
            ? 40
            : 0
      return { height: hoehe, width: 0, top: 0, left: 0, right: 0, bottom: hoehe, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const AUFSEHER = { ...demoZustand().persons[0]!, id: 'p-auf', fn: 'Otto', ln: 'Ober' }
  const GRUPPEN = [
    { id: 'g1', name: 'Gruppe 1', overseerId: 'p-auf', assistantId: null },
    { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
  ]
  const PLAN: WeitererPlan = { id: 'pl', name: 'Winterdienst', von: '2026-09-07', bis: '2026-09-27', entwurf: false }
  const eintrag = (datum: string, grp: string | null): PlanEintrag => ({ id: `e-${datum}`, planId: 'pl', datum, grp })
  const zeigePlan = (plan: WeitererPlan, planEintraege: PlanEintrag[] = []) =>
    zeige(<PlanBogen plan={plan} />, { persons: [AUFSEHER], groups: GRUPPEN, plaene: [plan], planEintraege })
  const datenZeilen = (c: ParentNode) => [...c.querySelectorAll('.druck-tabelle-zeile:not(.druck-tabelle-zeile--kopf)')]
  const zellen = (c: ParentNode) => datenZeilen(c).map((z) => [...z.children].map((s) => s.textContent))

  it('je Woche des Zeitraums eine Zeile: wann, welche Gruppe, ihr Aufseher — eine Woche ohne Gruppe gepunktet', () => {
    const { container } = zeigePlan(PLAN, [eintrag('2026-09-07', 'g1'), eintrag('2026-09-21', 'g2')])
    expect(texte(container, '.druck-titel')).toEqual(['Winterdienst'])
    expect(texte(container, '.druck-zeitraum')).toEqual([`${t.saal} · ${zeitraumText(PLAN, 'de')}`])
    expect(texte(container, '.druck-plan-intro')).toEqual([t.druckPlanJeWoche])
    expect(texte(container, '.druck-tabelle-zeile--kopf > span')).toEqual([t.gbWoche, t.gbGruppe, t.rolleGruppenaufseher])
    expect(zellen(container)).toEqual([
      [spannenText(PLAN, '2026-09-07', 'de'), 'Gruppe 1', 'Otto Ober'],
      // Ohne Eintrag — etwa nachdem der Zeitraum verlängert wurde — steht die Woche trotzdem da.
      [spannenText(PLAN, '2026-09-14', 'de'), '', ''],
      [spannenText(PLAN, '2026-09-21', 'de'), 'Gruppe 2', ''],
    ])
    expect(datenZeilen(container)[1]!.querySelector('.druck-offen')).not.toBeNull()
  })

  it('fett steht die Gruppe, die dran ist — der Aufseher leise daneben', () => {
    const { container } = zeigePlan(PLAN, [eintrag('2026-09-07', 'g1')])
    expect([...datenZeilen(container)[0]!.children].map((s) => s.className)).toEqual(['', 'is-betont', 'druck-leise'])
  })

  it('im Monatstakt je Monat eine Zeile — mit eigenem Satz und Spaltenkopf', () => {
    const monate: WeitererPlan = { ...PLAN, bis: '2026-11-30', takt: 'monat' }
    const { container } = zeigePlan(monate, [eintrag('2026-10-01', 'g2')])
    expect(texte(container, '.druck-plan-intro')).toEqual([t.druckPlanJeMonat])
    expect(texte(container, '.druck-tabelle-zeile--kopf > span')[0]).toBe(t.druckMonatSpalte)
    expect(zellen(container).map((z) => z.slice(0, 2))).toEqual([
      ['September 2026', ''],
      ['Oktober 2026', 'Gruppe 2'],
      ['November 2026', ''],
    ])
  })

  it('ein Plan ohne Namen heißt auf Papier wie in der App', () => {
    const { container } = zeigePlan({ ...PLAN, name: '' })
    expect(texte(container, '.druck-titel')).toEqual([t.wpOhneName])
  })

  it('ein Plan über ein Jahr läuft auf dem nächsten Blatt weiter — und die Seitenzahlen stimmen', () => {
    // 52 Wochen zu je 40 px, Platz 1010: 25, 25 und 2.
    const { container } = zeigePlan({ ...PLAN, bis: '2027-09-05' })
    const blaetter = [...container.querySelectorAll('.druck-blatt')]
    expect(blaetter.map((b) => datenZeilen(b).length)).toEqual([25, 25, 2])
    expect(texte(container, '.druck-blatt-fuss').map((f) => f.slice(f.lastIndexOf('·') + 2))).toEqual([
      'Seite 1 von 3',
      'Seite 2 von 3',
      'Seite 3 von 3',
    ])
    expect(container.querySelector('.druck-blatt--ueberlang')).toBeNull()
  })
})

describe('useDruckBogen', () => {
  function Stelle({ knopf }: { knopf?: string }) {
    const { drucken, bogen } = useDruckBogen()
    return (
      <>
        {knopf && (
          <button type="button" onClick={() => drucken(<p className="inhalt">{knopf}</p>)}>
            {knopf}
          </button>
        )}
        {bogen}
      </>
    )
  }

  let imDruck: { kennzeichen?: string; inhalt: string[] } = { inhalt: [] }
  beforeEach(() => {
    imDruck = { inhalt: [] }
    window.print = vi.fn(() => {
      imDruck = { kennzeichen: document.documentElement.dataset.print, inhalt: texte(document, '.druck-bogen .inhalt') }
    })
  })
  afterEach(() => {
    delete document.documentElement.dataset.print
  })

  it('erst zeichnen, dann drucken — im selben Klick, unter dem Kennzeichen „bogen"', () => {
    const { getByText } = zeige(
      <>
        <Stelle />
        <Stelle knopf="Woche" />
      </>,
    )
    fireEvent.click(getByText('Woche'))
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(imDruck).toEqual({ kennzeichen: 'bogen', inhalt: ['Woche'] })
  })

  it('nach dem Druckdialog räumt nur ab, wer gedruckt hat — auch neben einer zweiten Stelle', () => {
    // Der Wochenstreifen zeichnet seinen Inhalt dreimal: Die erste Stelle
    // druckt nie, hört aber als erste auf „afterprint".
    const { getByText } = zeige(
      <>
        <Stelle />
        <Stelle knopf="Woche" />
      </>,
    )
    fireEvent.click(getByText('Woche'))
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.querySelector('.druck-bogen')).toBeNull()
    expect(document.documentElement.dataset.print).toBeUndefined()
  })

  it('ein fremder Druck behält sein Kennzeichen — die Anmelde-Zettel sind nicht ihrer', () => {
    zeige(<Stelle knopf="Woche" />)
    document.documentElement.dataset.print = 'anmeldezettel'
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.documentElement.dataset.print).toBe('anmeldezettel')
  })

  it('kam kein „afterprint", verteilt der nächste Druck seine Blöcke neu — nicht nach dem vorigen Bogen', () => {
    // Gefunden am 15.10.2026 im Browser: Ein Plan, auf ein Jahr verlängert,
    // kam mit den 13 Wochen des ersten Drucks heraus.
    function Zwei() {
      const { drucken, bogen } = useDruckBogen()
      const bogenMit = (n: number) => (
        <Bogen
          titel="T"
          zeitraum="Z"
          bloecke={Array.from({ length: n }, (_, i) => ({ key: `b${i}`, inhalt: <p className="inhalt">{`Block ${i}`}</p> }))}
        />
      )
      return (
        <>
          <button type="button" onClick={() => drucken(bogenMit(1))}>
            Kurz
          </button>
          <button type="button" onClick={() => drucken(bogenMit(3))}>
            Lang
          </button>
          {bogen}
        </>
      )
    }
    const { getByText } = zeige(<Zwei />)
    fireEvent.click(getByText('Kurz'))
    fireEvent.click(getByText('Lang'))
    expect(imDruck.inhalt).toEqual(['Block 0', 'Block 1', 'Block 2'])
  })
})
