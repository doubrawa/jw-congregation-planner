/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { setAnlass } from '../data/anlass'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG } from '../data/constants'
import type { Section, Service, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { Bogen } from './Bogen'
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
        { iid: 'd4', num: 4, title: 'Gespräche beginnen', meta: '3 Min.', names: [{ name: 'Sara Schul', rolle: 'Schüler' }, { name: 'Paula Part', rolle: 'Partner' }] },
        { iid: 'd5', num: 5, title: 'Interesse fördern', meta: '4 Min.', names: [{ name: 'Sina Solo', rolle: 'Schüler' }, { name: '', rolle: 'Partner' }] },
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

  it('Eröffnung und Abschluss: je Person eine Zeile mit ihrer Rolle — das Lied steht im Kopf', () => {
    const { container } = zeige(<MonatsBogen monat="2026-09" />, { weeks: wochen() })
    const woche1 = container.querySelector('.druck-monat-woche')!
    const zeilen = [...woche1.querySelectorAll('.druck-knapp-zeile')].map((z) => z.children[1]?.textContent)
    expect(zeilen.slice(0, 2)).toEqual(['Vorsitz', 'Gebet'])
    expect(texte(woche1, '.druck-knapp-abschnitt .druck-lied')).toContain('Lied 12')
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

  it('ein fremder Druck behält sein Kennzeichen — der S-89-Bogen ist nicht ihrer', () => {
    zeige(<Stelle knopf="Woche" />)
    document.documentElement.dataset.print = 's89'
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.documentElement.dataset.print).toBe('s89')
  })
})
