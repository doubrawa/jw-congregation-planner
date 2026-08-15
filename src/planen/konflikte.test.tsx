/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import type { Meeting, Person, Service, Week } from '../data/types'
import { ConflictsBanner } from './PlanBanners'
import { HelpersPanel } from './HelpersPanel'

/**
 * T76 — das Konflikt-Banner und der Plan darunter.
 *
 * Zwei Befunde in einem: „+N weitere mögliche Konflikte" war **toter Text** —
 * es nannte eine Zahl und ließ den Planer damit stehen; und die betroffenen
 * Zuteilungen sahen im Programm aus wie alle anderen, sodass man den im Banner
 * genannten Namen darunter erst suchen musste.
 *
 * Die Wochen hier sind mit Absicht selbst gebaut und nicht die Demo-Daten: die
 * bringen eigene Konflikte mit, und dann prüfte der Test die Demo statt die
 * Regel.
 */

function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'ton', name: 'Tonanlage', count: 1, groups: false },
]

const person = (id: string, name: string): Person => ({
  id, fn: name, ln: '', role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

/** Zusammenkunft mit einem Programmpunkt (die genannten Namen) und Hilfsdiensten. */
function zusammenkunft(namen: Array<{ name: string; pid?: string }>, helpers: Meeting['helpers'] = {}): Meeting {
  return {
    date: '', end: '',
    sections: [
      { label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: [{ title: 'Punkt', meta: '', names: namen }] },
    ],
    helpers,
  }
}

/** Aufeinanderfolgende Montage — sonst zählt keine Serie (T36). */
const MONTAGE = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']

function woche(i: number, mid: Meeting): Week {
  return {
    range: '', book: '', start: MONTAGE[i]!, current: false,
    mid,
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

/**
 * `anzahl` Personen, jede in den Wochen 0–2 auf demselben Programmpunkt (Woche
 * 3 bleibt frei, sonst ist es keine auffällige Serie, sondern Dauerbetrieb).
 * Serien sind die einzige Konfliktart, die gekürzt wird.
 */
function mitSerien(anzahl: number): { weeks: Week[]; persons: Person[] } {
  const persons = Array.from({ length: anzahl }, (_, n) => person(`p${n}`, `Serie ${n}`))
  const namen = persons.map((p) => ({ name: p.fn, pid: p.id }))
  const weeks = [
    woche(0, zusammenkunft(namen)),
    woche(1, zusammenkunft(namen)),
    woche(2, zusammenkunft(namen)),
    woche(3, zusammenkunft([{ name: '' }])),
  ]
  return { weeks, persons }
}

const basis = (over: Partial<AppState>): AppState => ({
  ...initialState(),
  week: 1, // mittlere Woche der Serie
  planner: true,
  services: DIENSTE,
  absences: [],
  ...over,
})

describe('T76 — „+N weitere" klappt die übrigen Konflikte auf', () => {
  const zeilen = (c: HTMLElement) => c.querySelectorAll('.plan-conflict-row').length
  const schalter = (c: HTMLElement) => c.querySelector('.plan-conflict-more')

  const zeige = (anzahl: number) => {
    const { weeks, persons } = mitSerien(anzahl)
    return render(
      <Buehne state={basis({ weeks, persons })}>
        <ConflictsBanner tab="mid" />
      </Buehne>,
    )
  }

  it('zeigt zunächst zwei Serien und einen Schalter für den Rest', () => {
    const { container } = zeige(3)
    expect(zeilen(container)).toBe(2)
    const mehr = schalter(container)
    // Ein Schalter, kein Text — genau das war der Befund.
    expect(mehr?.tagName).toBe('BUTTON')
    expect(mehr?.getAttribute('aria-expanded')).toBe('false')
    expect(mehr?.textContent).toContain('1') // „+1 weitere …"
  })

  it('klappt auf und wieder zu', () => {
    const { container } = zeige(3)
    fireEvent.click(schalter(container)!)
    expect(zeilen(container)).toBe(3)
    expect(schalter(container)?.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(schalter(container)!)
    expect(zeilen(container)).toBe(2)
    expect(schalter(container)?.getAttribute('aria-expanded')).toBe('false')
  })

  it('ohne Rest kein Schalter', () => {
    const { container } = zeige(2)
    expect(zeilen(container)).toBe(2)
    expect(schalter(container)).toBeNull()
  })
})

describe('T76 — die betroffene Zuteilung hebt sich im Plan ab', () => {
  const chips = (c: HTMLElement) => [...c.querySelectorAll('.slot-chip')]
  const markiert = (c: HTMLElement) => chips(c).filter((el) => el.className.includes('is-konflikt'))

  /** Eine Woche, in der Anna Programmpunkt UND Hilfsdienst hat (helperTask). */
  const mitHelferKonflikt = (): { state: AppState; meeting: Meeting } => {
    const anna = person('p-anna', 'Anna')
    const bernd = person('p-bernd', 'Bernd')
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna.id }], {
      ton: [{ name: 'Anna', pid: anna.id }],
      mik: [{ name: 'Bernd', pid: bernd.id }, { name: '' }],
    })
    return {
      state: basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna, bernd] }),
      meeting,
    }
  }

  it('markiert den Chip der betroffenen Person — und nur ihn', () => {
    const { state, meeting } = mitHelferKonflikt()
    const { container } = render(
      <Buehne state={state}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(1)
    expect(markiert(container)[0]?.textContent).toContain('Anna')
    // Bernd steht nur einmal da und bleibt unberührt.
    const bernd = chips(container).find((el) => el.textContent?.includes('Bernd'))
    expect(bernd?.className).not.toContain('is-konflikt')
  })

  it('ohne Konflikt bleibt kein Chip markiert', () => {
    const anna = person('p-anna', 'Anna')
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna.id }], { ton: [{ name: '' }], mik: [] })
    const { container } = render(
      <Buehne state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna] })}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(0)
  })

  it('markiert auch Plätze ohne Person-Id — über den Anzeigenamen', () => {
    /*
     * Am laufenden Demo-Stand aufgefallen, nicht am Reißbrett: dort tragen die
     * Hilfsdienst-Plätze **keine** `pid`. Die Konfliktprüfung löst den Namen
     * über die Personenliste zu einer Id auf, die Markierung verglich aber
     * `pid`/Name direkt — der abwesende Ordner stand im Banner, sein Chip blieb
     * unmarkiert. Beide Seiten müssen dieselbe Auflösung benutzen.
     */
    const anna = person('p-anna', 'Anna')
    const meeting = zusammenkunft([{ name: 'Anna' }], { ton: [{ name: 'Anna' }] }) // ohne pid
    const { container } = render(
      <Buehne state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna] })}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(1)
  })

  it('die Markierung folgt der Person-Id, nicht dem Namen', () => {
    // Zwei Personen desselben Anzeigenamens: im Konflikt ist nur die eine.
    // Über den Namen gesucht leuchtete auch die andere auf (T57).
    const anna1 = person('p-anna-1', 'Anna')
    const anna2 = person('p-anna-2', 'Anna')
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna1.id }], {
      ton: [{ name: 'Anna', pid: anna1.id }],
      mik: [{ name: 'Anna', pid: anna2.id }, { name: '' }],
    })
    const { container } = render(
      <Buehne state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna1, anna2] })}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(1)
  })

  it('die Gruppen-Rotation ist keine Person und wird nie markiert', () => {
    const anna = person('p-anna', 'Anna')
    const dienste: Service[] = [...DIENSTE, { key: 'rein', name: 'Reinigung', count: 1, groups: true }]
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna.id }], {
      ton: [{ name: 'Anna', pid: anna.id }],
      rein: [{ name: 'Gruppe 1' }],
    })
    const { container } = render(
      <Buehne
        state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna], services: dienste })}
      >
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    const gruppe = chips(container).find((el) => el.textContent?.includes('Gruppe 1'))
    expect(gruppe?.className).not.toContain('is-konflikt')
  })
})
