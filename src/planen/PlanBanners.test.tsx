/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Absence, FsInstance, Person, Qualifications, Section, Service, Week } from '../data/types'
import { EngpassBanner, FsConflictsBanner, OpenSlotsBanner } from './PlanBanners'

/**
 * **Die Banner über dem Plan.** Das Konflikt-Banner ist in
 * `konflikte.test.tsx` geprüft (T76/T81) — hier stehen die drei anderen:
 *
 * - **Offene Zuteilungen** sagen, was der Planer noch nicht getan hat.
 * - **Nicht besetzbar** (T96) sagt, was er auch nicht tun *kann*. Beides
 *   auseinanderzuhalten ist der ganze Zweck: Ohne die zweite Zahl sucht der
 *   Planer den Fehler bei sich oder bei der Auto-Zuteilung, die die Plätze
 *   kommentarlos offen lässt.
 * - **Treffpunkt-Konflikte** sind ein eigenes Banner mit eigener Datenquelle.
 *
 * Der wichtigste Fall für beide Wochen-Banner: eine **ausgefallene**
 * Zusammenkunft (T30). Dort ist nichts offen und nichts zu besetzen — stünde
 * dort eine Zahl, führte sie den Planer an einen Plan, den es nicht gibt.
 */

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) q[k] = true
  return q
}

const person = (id: string, ln: string, ...q: string[]): Person => ({
  id, fn: 'Max', ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: priv(...q), grp: null,
})

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** Zusammenkunft mit einem offenen Leser-Platz und zwei offenen Mikrofon-Plätzen. */
function abschnitt(): Section {
  return {
    label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
    items: [
      { song: 'Lied 12' },
      {
        num: 7, title: 'Versammlungsbibelstudium', meta: '30 Min.',
        names: [
          { name: 'Max Alt', pid: 'p-a', rolle: 'Leiter', bereichsKey: 'vbsLeiter' },
          { name: '', rolle: 'Leser', bereichsKey: 'leser' },
        ],
      },
    ],
  }
}

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '1.–7. September', book: '', start: '2026-09-07', current: false,
    mid: { date: '', end: '20:45', sections: [abschnitt()], helpers: { mik: [], rein: [] } },
    we: { date: '', end: '11:45', sections: [], helpers: {} },
    ...over,
  }
}

function zeige(kind: 'open' | 'engpass' | 'fs', over: Partial<AppState> = {}, onlyGroup: string | null = null) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [person('p-a', 'Alt', 'vbsLeiter'), person('p-b', 'Brand', 'leser', 'svc:mik')],
    services: DIENSTE, groups: [], absences: [],
    weeks: [woche()], fsWeeks: [[]], week: 0,
    congregation: { name: 'Test', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {kind === 'open' && <OpenSlotsBanner tab="mid" tpw={(s) => s} />}
            {kind === 'engpass' && <EngpassBanner tab="mid" />}
            {kind === 'fs' && <FsConflictsBanner onlyGroup={onlyGroup} />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement, sel: string) => [...c.querySelectorAll(sel)].map((x) => x.textContent ?? '')
const zahl = (c: HTMLElement) => c.querySelector('.plan-banner-count')?.textContent

afterEach(cleanup)

describe('Offene Zuteilungen', () => {
  it('nennt jede offene Stelle und die Gesamtzahl', () => {
    const { container } = zeige('open')
    expect(container.querySelector('.plan-banner-title')?.textContent).toBe(t.offeneTitle)
    // 1 Leser + 2 Mikrofone + 1 Reinigung — die Kopfzahl zählt Plätze, nicht Zeilen
    expect(zahl(container)).toBe('4')
    expect(zeilen(container, '.plan-open-label')).toEqual([
      'Versammlungsbibelstudium · Leser',
      'Mikrofone ×2',
      'Reinigung',
    ])
  })

  it('ein Lied ist kein offener Platz', () => {
    const { container } = zeige('open')
    expect(zeilen(container, '.plan-open-label').some((x) => x.includes('Lied'))).toBe(false)
  })

  it('ist alles besetzt, steht das Banner gar nicht da', () => {
    const w = woche()
    const item = w.mid.sections[0]!.items[1] as { names: Array<{ name: string }> }
    item.names[1]!.name = 'Max Brand'
    w.mid.helpers.mik = [{ name: 'Max Brand' }, { name: 'Max Alt' }]
    w.mid.helpers.rein = [{ name: 'Gruppe 1' }]
    const { container } = zeige('open', { weeks: [w] })
    expect(container.querySelector('.plan-open')).toBeNull()
  })

  it('eine ausgefallene Zusammenkunft hat nichts offen (T30)', () => {
    // Sonst führte die Zahl den Planer an einen Plan, den es nicht gibt.
    const w = woche({ dev: { mid: { cancelled: true, reason: 'Kongress' } } })
    const { container } = zeige('open', { weeks: [w] })
    expect(container.querySelector('.plan-open')).toBeNull()
  })

  it('ohne geladene Woche bleibt es still, statt abzustürzen', () => {
    const { container } = zeige('open', { weeks: [], week: 0 })
    expect(container.querySelector('.plan-open')).toBeNull()
  })
})

describe('Nicht besetzbar (T96) — was auch mit Mühe nicht geht', () => {
  const ABWESEND: Absence[] = [
    { id: 'a1', personId: 'p-b', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
  ]
  // Der Leser-Platz ist gedeckt (p-a kann ihn und ist da) — allein die
  // Mikrofone sind knapp. So misst das Banner genau einen Bereich.
  const NUR_MIKROFONE: Partial<AppState> = {
    persons: [person('p-a', 'Alt', 'vbsLeiter', 'leser'), person('p-b', 'Brand', 'svc:mik')],
    absences: ABWESEND,
  }

  it('meldet den Bereich, in dem an diesem Tag zu wenige da sind', () => {
    // Zwei Mikrofon-Plätze, ein einziger Qualifizierter — und der ist abwesend.
    const { container } = zeige('engpass', NUR_MIKROFONE)
    expect(container.querySelector('.plan-banner-title')?.textContent).toBe(t.engpassTitle)
    expect(zeilen(container, '.plan-conflict-text')).toEqual([
      'Mikrofone · nötig 2 · verfügbar 0 · abwesend 1 von 1',
    ])
  })

  it('die Kopfzahl nennt die Plätze, die deshalb offen bleiben müssen', () => {
    const { container } = zeige('engpass', NUR_MIKROFONE)
    expect(zahl(container)).toBe('2')
  })

  it('der Hilfsdienst trägt den Namen, den die Versammlung ihm gegeben hat', () => {
    const dienste: Service[] = [{ key: 'mik', name: 'Tonanlage', count: 2, groups: false }]
    const { container } = zeige('engpass', { ...NUR_MIKROFONE, services: dienste })
    expect(container.querySelector('.plan-conflict-text')?.textContent).toContain('Tonanlage')
  })

  it('ein fester Bereich trägt seine Beschriftung aus dem Wörterbuch', () => {
    // Niemand ist für „Leser" qualifiziert → der Platz ist nicht besetzbar.
    const { container } = zeige('engpass', {
      persons: [person('p-a', 'Alt', 'vbsLeiter'), person('p-b', 'Brand', 'svc:mik')],
    })
    const texte = zeilen(container, '.plan-conflict-text').join(' | ')
    expect(texte).toContain('nötig 1')
    expect(texte).toContain('von 0')
  })

  it('solange es gerade reicht, schweigt es', () => {
    const { container } = zeige('engpass', {
      persons: [
        person('p-a', 'Alt', 'vbsLeiter'),
        person('p-b', 'Brand', 'leser', 'svc:mik'),
        person('p-c', 'Cohn', 'svc:mik'),
      ],
    })
    expect(container.querySelector('.plan-engpass')).toBeNull()
  })

  it('die Gruppen-Rotation braucht niemanden und wird nie gemeldet', () => {
    const { container } = zeige('engpass', { absences: ABWESEND })
    expect(zeilen(container, '.plan-conflict-text').some((x) => x.includes('Reinigung'))).toBe(false)
  })

  it('eine ausgefallene Zusammenkunft ist nicht zu besetzen (T30)', () => {
    const w = woche({ dev: { mid: { cancelled: true, reason: 'Kongress' } } })
    const { container } = zeige('engpass', { ...NUR_MIKROFONE, weeks: [w] })
    expect(container.querySelector('.plan-engpass')).toBeNull()
  })

  it('ohne geladene Woche bleibt es still', () => {
    const { container } = zeige('engpass', { weeks: [], week: 0 })
    expect(container.querySelector('.plan-engpass')).toBeNull()
  })

  it('trotz Freigabe zählt eine Schwester mit — der Schalter entscheidet, nicht die Rechnung', () => {
    const schwester: Person = {
      ...person('p-s', 'Sommer', 'svc:mik'), female: true,
    }
    const { container } = zeige('engpass', {
      persons: [person('p-a', 'Alt', 'vbsLeiter'), person('p-b', 'Brand', 'leser'), schwester],
      absences: [],
    })
    // Nur ein Mikrofon-Platz zu wenig — nicht zwei, weil sie mitzählt.
    const zeile = zeilen(container, '.plan-conflict-text').find((x) => x.includes('Mikrofone')) ?? ''
    expect(zeile).toContain('verfügbar 1')
  })
})

describe('Treffpunkt-Konflikte sind ein eigenes Banner', () => {
  const inst = (over: Partial<FsInstance> = {}): FsInstance =>
    ({ id: 'f1', ruleId: 'r1', wd: 6, time: '09:30', place: 'Saal', leader: '', grp: null, ...over }) as FsInstance

  const basis = new Date(2026, 8, 7, 12, 0) // Montag der Woche

  it('meldet, wer am Tag seines Treffpunkts abwesend ist — mit Tag und Ort', () => {
    const { container } = zeige('fs', {
      fsWeeks: [[inst({ leader: 'Max Brand', lpid: 'p-b' })]],
      fsBase: basis,
      absences: [{ id: 'a1', personId: 'p-b', userId: null, from: '2026-09-12', to: '2026-09-13', reason: '' }],
    })
    const zeile = container.querySelector('.plan-conflict-text')?.textContent ?? ''
    expect(zeile).toContain('Max Brand')
    expect(zeile).toContain('Samstag')
    expect(zeile).toContain('Saal')
  })

  it('zweimal am selben Tag ist ebenfalls ein Konflikt', () => {
    const { container } = zeige('fs', {
      fsWeeks: [[
        inst({ id: 'f1', leader: 'Max Brand', lpid: 'p-b' }),
        inst({ id: 'f2', leader: 'Max Brand', lpid: 'p-b', place: 'Park' }),
      ]],
      fsBase: basis,
    })
    expect(zahl(container)).toBe('1')
    expect(container.querySelector('.plan-conflict-text')?.textContent).toContain(t.sheetSchonHeute)
  })

  it('ohne Konflikt steht das Banner nicht da', () => {
    const { container } = zeige('fs', {
      fsWeeks: [[inst({ leader: 'Max Brand', lpid: 'p-b' })]],
      fsBase: basis,
    })
    expect(container.querySelector('.plan-conflicts')).toBeNull()
  })

  it('ein Gruppenaufseher sieht nur die Konflikte seiner Gruppe', () => {
    const { container } = zeige(
      'fs',
      {
        fsWeeks: [[
          inst({ id: 'f1', leader: 'Max Brand', lpid: 'p-b', grp: 'g1' }),
          inst({ id: 'f2', leader: 'Max Brand', lpid: 'p-b', grp: 'g2', place: 'Park' }),
        ]],
        fsBase: basis,
        absences: [{ id: 'a1', personId: 'p-b', userId: null, from: '2026-09-12', to: '2026-09-13', reason: '' }],
      },
      'g1',
    )
    const texte = zeilen(container, '.plan-conflict-text').join(' | ')
    expect(texte).toContain('Saal')
    expect(texte).not.toContain('Park')
  })
})

describe('Vollständigkeitsprobe: die beiden Zahlen meinen Verschiedenes', () => {
  it('„offen" zählt unbesetzte Plätze, „nicht besetzbar" fehlende Personen', () => {
    // Derselbe Zustand, zwei Banner: zwei Mikrofon-Plätze sind offen (weil
    // niemand eingeteilt ist) UND nicht besetzbar (weil niemand da ist).
    const lage: Partial<AppState> = {
      // p-a deckt den Leser-Platz und ist da; p-b kann nur Mikrofone und fehlt.
      persons: [person('p-a', 'Alt', 'vbsLeiter', 'leser'), person('p-b', 'Brand', 'svc:mik')],
      absences: [
        { id: 'a1', personId: 'p-b', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
      ],
    }
    const offen = zeige('open', lage)
    expect(zahl(offen.container)).toBe('4') // Leser + 2 Mikrofone + Reinigung
    cleanup()
    const eng = zeige('engpass', lage)
    expect(zahl(eng.container)).toBe('2') // nur die 2 Mikrofone sind unbesetzbar
  })

  it('ein besetzter Platz ist nicht mehr offen — kann aber weiter unbesetzbar sein', () => {
    // Gefragt ist, ob die Versammlung an dem Tag genug Leute HAT.
    const w = woche()
    w.mid.helpers.mik = [{ name: 'Max Brand', pid: 'p-b' }, { name: 'Max Brand', pid: 'p-b' }]
    const abwesend: Absence[] = [
      { id: 'a1', personId: 'p-b', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
    ]
    const offen = zeige('open', { weeks: [w], absences: abwesend })
    expect(zeilen(offen.container, '.plan-open-label').some((x) => x.includes('Mikrofone'))).toBe(false)
    cleanup()
    const eng = zeige('engpass', { weeks: [w], absences: abwesend })
    expect(
      zeilen(eng.container, '.plan-conflict-text').some((x) => x.includes('Mikrofone')),
    ).toBe(true)
  })
})

// Der Bereichs-Schlüssel eines Hilfsdienstes ist die Brücke zwischen Person und
// Platz — steht er falsch, meldet das Banner den Engpass am falschen Bereich.
describe('Der Bereichs-Schlüssel bleibt derselbe wie an der Person', () => {
  it('svc:<dienst> — hier wie dort', () => {
    expect(serviceQualKey('mik')).toBe('svc:mik')
  })
})
