/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { Absence, Person, Qualifications, Section, Service, Week } from '../data/types'
import { BesetzungKarte } from './WochenStand'
import { privSetzen } from '../data/helpers'
import { punktKey, sentKey } from '../data/planning'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Was über dem Plan steht.** Die Konflikte der Zusammenkunft sind in
 * `konflikte.test.tsx` geprüft (T76/T81) — hier stehen die übrigen:
 *
 * - **Offene Zuteilungen** sagen, was der Planer noch nicht getan hat.
 * - **Nicht besetzbar** (T96) sagt, was er auch nicht tun *kann*. Beides
 *   auseinanderzuhalten ist der ganze Zweck: Ohne die zweite Angabe sucht der
 *   Planer den Fehler bei sich oder bei der Auto-Zuteilung, die die Plätze
 *   kommentarlos offen lässt.
 *
 * Beide Angaben stehen seit T121 in der Besetzung unter „Zu klären"
 * (`BesetzungKarte`). Die Konflikte der Treffpunkte stehen am Platz ihres
 * Leiters (`panels.test.tsx`). Der wichtigste Fall hier: eine **ausgefallene**
 * Zusammenkunft (T30). Dort ist nichts offen und nichts zu besetzen — stünde
 * dort eine Zahl, führte sie den Planer an einen Plan, den es nicht gibt.
 */

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) privSetzen(q, k, true)
  return q
}

const person = (id: string, ln: string, ...q: string[]): Person => ({
  id, fn: 'Max', ln, role: 'verkuendiger', female: false, priv: priv(...q), grp: null,
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
      { iid: 'i101',
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
    range: '1.–7. September', book: '', start: '2026-09-07',
    mid: { date: '', end: '20:45', sections: [abschnitt()], helpers: { mik: [], rein: [] } },
    we: { date: '', end: '11:45', sections: [], helpers: {} },
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [person('p-a', 'Alt', 'vbsLeiter'), person('p-b', 'Brand', 'leser', 'svc:mik')],
    services: DIENSTE, groups: [], absences: [],
    weeks: [woche()], fsWeeks: [[]], week: 0,
    congregation: { name: 'Test', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <BesetzungKarte tab="mid" tpw={(s) => s} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement, sel: string) => [...c.querySelectorAll(sel)].map((x) => x.textContent ?? '')
/** Die Zeile „Offene Zuteilungen" unter „Zu klären" — ohne sie `null`. */
const offenZeile = (c: HTMLElement) => c.querySelector('.klaeren-zeile[data-art="offen"]')
/** Was unter „Zu klären" nicht besetzbar ist. */
const engpass = (c: HTMLElement) => zeilen(c, '.klaeren-zeile[data-art="engpass"]')

afterEach(cleanup)

/*
 * Betreiber 31.10.2026: Der Haken „weiß Bescheid" zählt im Saal beim Planen
 * wie eine Zusage — wie in der Spur darüber. Max Alt hat kein Konto; der
 * Planer hat es ihm gesagt.
 */
describe('Der Saal beim Planen', () => {
  it('wem der Planer ohne Konto Bescheid gegeben hat, sitzt voll statt blass', () => {
    const lagen = (c: HTMLElement) => [...c.querySelectorAll('.saal-platz')].map((p) => p.getAttribute('class'))
    const ohne = lagen(zeige().container)
    expect(ohne).toContain('saal-platz is-wartet')
    expect(ohne).not.toContain('saal-platz is-voll')
    cleanup()
    const bescheid = { [sentKey(punktKey('2026-09-07', 'mid', 'i101', 0), 'Max Alt')]: '2026-09-07T10:00:00Z' }
    const mit = lagen(zeige({ persoenlich: bescheid }).container)
    expect(mit).toContain('saal-platz is-voll')
    expect(mit).not.toContain('saal-platz is-wartet')
  })
})

describe('Offene Zuteilungen', () => {
  it('nennen die Gesamtzahl und jede offene Stelle', () => {
    const { container } = zeige()
    // 1 Leser + 2 Mikrofone + 1 Reinigung — die Zahl zählt Plätze, nicht Zeilen
    expect(offenZeile(container)?.textContent).toContain(fill(t.offeneZut, { n: 4 }))
    expect(offenZeile(container)?.querySelector('.klaeren-wo')?.textContent).toBe(
      'Versammlungsbibelstudium · Leser, Mikrofone ×2, Reinigung',
    )
  })

  it('ein Lied ist kein offener Platz', () => {
    const { container } = zeige()
    expect(offenZeile(container)?.textContent).not.toContain('Lied')
  })

  it('ist alles besetzt, steht die Zeile gar nicht da', () => {
    const w = woche()
    const item = w.mid.sections[0]!.items[1] as { names: Array<{ name: string }> }
    item.names[1]!.name = 'Max Brand'
    w.mid.helpers.mik = [{ name: 'Max Brand' }, { name: 'Max Alt' }]
    w.mid.helpers.rein = [{ name: 'Gruppe 1' }]
    const { container } = zeige({ weeks: [w] })
    expect(offenZeile(container)).toBeNull()
  })

  it('eine ausgefallene Zusammenkunft hat nichts offen und nichts zu besetzen (T30)', () => {
    // Sonst führte die Zahl den Planer an einen Plan, den es nicht gibt.
    const w = woche({ dev: { mid: { cancelled: true, reason: 'Kongress' } } })
    const { container } = zeige({ weeks: [w] })
    expect(container.querySelector('.besetzung')).toBeNull()
  })

  it('ohne geladene Woche bleibt es still, statt abzustürzen', () => {
    const { container } = zeige({ weeks: [], week: 0 })
    expect(container.querySelector('.besetzung')).toBeNull()
  })
})

describe('Nicht besetzbar (T96) — was auch mit Mühe nicht geht', () => {
  const ABWESEND: Absence[] = [
    { id: 'a1', personId: 'p-b', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
  ]
  // Der Leser-Platz ist gedeckt (p-a kann ihn und ist da) — allein die
  // Mikrofone sind knapp. So misst die Karte genau einen Bereich.
  const NUR_MIKROFONE: Partial<AppState> = {
    persons: [person('p-a', 'Alt', 'vbsLeiter', 'leser'), person('p-b', 'Brand', 'svc:mik')],
    absences: ABWESEND,
  }

  it('meldet den Bereich, in dem an diesem Tag zu wenige da sind — mit dem Grund', () => {
    // Zwei Mikrofon-Plätze, ein einziger Qualifizierter — und der ist abwesend.
    const { container } = zeige(NUR_MIKROFONE)
    expect(engpass(container)).toEqual([zahlBinden('Mikrofone · nötig 2 · verfügbar 0 · abwesend 1 von 1')])
  })

  it('der Hilfsdienst trägt den Namen, den die Versammlung ihm gegeben hat', () => {
    const dienste: Service[] = [{ key: 'mik', name: 'Tonanlage', count: 2, groups: false }]
    const { container } = zeige({ ...NUR_MIKROFONE, services: dienste })
    expect(engpass(container).join(' | ')).toContain('Tonanlage')
  })

  it('ein fester Bereich trägt seine Beschriftung aus dem Wörterbuch', () => {
    // Niemand ist für „Leser" qualifiziert → der Platz ist nicht besetzbar.
    const { container } = zeige({
      persons: [person('p-a', 'Alt', 'vbsLeiter'), person('p-b', 'Brand', 'svc:mik')],
    })
    const texte = engpass(container).join(' | ')
    expect(texte).toContain('nötig 1')
    expect(texte).toContain('von 0')
  })

  it('solange es gerade reicht, schweigt es', () => {
    const { container } = zeige({
      persons: [
        person('p-a', 'Alt', 'vbsLeiter'),
        person('p-b', 'Brand', 'leser', 'svc:mik'),
        person('p-c', 'Cohn', 'svc:mik'),
      ],
    })
    expect(engpass(container)).toEqual([])
  })

  it('die Gruppen-Rotation braucht niemanden und wird nie gemeldet', () => {
    const { container } = zeige({ absences: ABWESEND })
    expect(engpass(container).some((x) => x.includes('Reinigung'))).toBe(false)
  })

  it('trotz Freigabe zählt eine Schwester mit — der Schalter entscheidet, nicht die Rechnung', () => {
    const schwester: Person = {
      ...person('p-s', 'Sommer', 'svc:mik'), female: true,
    }
    const { container } = zeige({
      persons: [person('p-a', 'Alt', 'vbsLeiter'), person('p-b', 'Brand', 'leser'), schwester],
      absences: [],
    })
    // Nur ein Mikrofon-Platz zu wenig — nicht zwei, weil sie mitzählt.
    const zeile = engpass(container).find((x) => x.includes('Mikrofone')) ?? ''
    expect(zeile).toContain('verfügbar 1')
  })
})

describe('Vollständigkeitsprobe: die beiden Angaben meinen Verschiedenes', () => {
  it('„offen" zählt unbesetzte Plätze, „nicht besetzbar" fehlende Personen', () => {
    // Derselbe Zustand: zwei Mikrofon-Plätze sind offen (weil niemand
    // eingeteilt ist) UND nicht besetzbar (weil niemand da ist).
    const { container } = zeige({
      // p-a deckt den Leser-Platz und ist da; p-b kann nur Mikrofone und fehlt.
      persons: [person('p-a', 'Alt', 'vbsLeiter', 'leser'), person('p-b', 'Brand', 'svc:mik')],
      absences: [
        { id: 'a1', personId: 'p-b', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
      ],
    })
    expect(offenZeile(container)?.textContent).toContain(fill(t.offeneZut, { n: 4 })) // Leser + 2 Mikrofone + Reinigung
    expect(engpass(container)).toEqual([zahlBinden('Mikrofone · nötig 2 · verfügbar 0 · abwesend 1 von 1')]) // nur die Mikrofone
  })

  it('ein besetzter Platz ist nicht mehr offen — kann aber weiter unbesetzbar sein', () => {
    // Gefragt ist, ob die Versammlung an dem Tag genug Leute HAT.
    const w = woche()
    w.mid.helpers.mik = [{ name: 'Max Brand', pid: 'p-b' }, { name: 'Max Brand', pid: 'p-b' }]
    const abwesend: Absence[] = [
      { id: 'a1', personId: 'p-b', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
    ]
    const { container } = zeige({ weeks: [w], absences: abwesend })
    expect(offenZeile(container)?.querySelector('.klaeren-wo')?.textContent).not.toContain('Mikrofone')
    expect(engpass(container).some((x) => x.includes('Mikrofone') && x.includes('nötig'))).toBe(true)
  })
})

// Der Bereichs-Schlüssel eines Hilfsdienstes ist die Brücke zwischen Person und
// Platz — steht er falsch, meldet die Karte den Engpass am falschen Bereich.
describe('Der Bereichs-Schlüssel bleibt derselbe wie an der Person', () => {
  it('svc:<dienst> — hier wie dort', () => {
    expect(serviceQualKey('mik')).toBe('svc:mik')
  })
})
