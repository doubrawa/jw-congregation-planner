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
import { reducer } from '../app/reducer'
import { deriveMyFsTasks, fsWochenKennungen } from '../data/fs'
import { emptyQualifications } from '../data/helpers'
import { deriveMyTasks } from '../data/planning'
import { dict } from '../i18n/ui'
import type { FsInstance, Person, Service, Week } from '../data/types'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Was die eingeteilte Person zusagt, sieht der Planer am Platz — an jedem.**
 *
 * Anna ist in einer Woche fünfmal eingeteilt: im Hauptsaal, in der Zusätzlichen
 * Klasse, als Ratgeberin der Klasse, am Mikrofon und als Leiterin eines
 * Treffpunkts. Sie bestätigt in ihrer App alles, was ihr vorgelegt wird. Danach
 * muss der Planer an genau diesen fünf Chips Grün sehen — und an Bernds Platz
 * daneben weiter Gelb.
 *
 * **Warum die Probe von den Aufgaben ausgeht und nicht von Schlüsseln:** Die
 * Zusage entsteht unter der Aufgaben-Id, die `deriveMyTasks` und
 * `deriveMyFsTasks` liefern. Der Chip sucht sie unter einem Schlüssel, den die
 * Planen-Ansicht selbst bildet (`useZusage`). Beide Rechnungen müssen
 * übereinstimmen, sonst bleibt der Punkt still gelb, obwohl längst zugesagt ist
 * — niemand sähe einen Fehler, nur eine Ampel, die nie umspringt.
 *
 * Deshalb liegt die angezeigte Woche **hinter einer Lücke** im Bestand (T100):
 * Die zweite geladene Woche beginnt am 21. September, nicht am 14. Wer den
 * Schlüssel aus der Position rechnet statt aus der Woche, trifft daneben —
 * bei den Zusammenkünften wie bei den Treffpunkten.
 */

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '', priv: emptyQualifications(),
})

const ANNA = person('p-anna', 'Anna', 'Beispiel')
const BERND = person('p-bernd', 'Bernd', 'Anders')
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

const anna = { name: 'Anna Beispiel', pid: ANNA.id }
const bernd = { name: 'Bernd Anders', pid: BERND.id }

function woche(start: string, besetzt: boolean): Week {
  const wer = besetzt ? anna : { name: '' }
  return {
    range: '', book: '', start, current: false,
    mid: {
      date: '', end: '20:45',
      sections: [
        {
          label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
          items: [{
            num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
            names: [{ ...wer, bereichsKey: 'schulung' }],
            aux: [{ ...wer, bereichsKey: 'schulung' }],
          }],
        },
      ],
      auxRatgeber: { ...wer, rolle: 'Ratgeber', bereichsKey: 'ratgeber' },
      helpers: { mik: besetzt ? [anna, bernd] : [] },
    },
    we: { date: '', end: '11:45', sections: [], helpers: {} },
  }
}

/** Zwei geladene Wochen mit Lücke; angezeigt wird die zweite. */
const WOCHEN = [woche('2026-09-07', false), woche('2026-09-21', true)]
const TREFFPUNKTE: FsInstance[][] = [
  [],
  [{ id: 'tp1', ruleId: null, grp: '', wd: 6, time: '09:30', place: 'Saal', leader: 'Anna Beispiel', lpid: ANNA.id }],
]
/** Der Montag der ERSTEN Woche — daraus plus Position käme für die zweite der 14. heraus. */
const BASIS = new Date(2026, 8, 7, 12, 0)

function stand(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    screen: 'planen', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: null, planner: true,
    persons: [ANNA, BERND], groups: [], services: DIENSTE, absences: [],
    weeks: WOCHEN, fsWeeks: TREFFPUNKTE, fsRules: [], fsBase: BASIS, week: 1,
    auxClass: true, confirmations: {},
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
}

/** Alles, was Anna in ihrer App vorgelegt bekommt — Zusammenkünfte und Treffpunkte. */
function annasAufgaben(s: AppState): string[] {
  return [
    ...deriveMyTasks(s.weeks, s.services, 'Anna Beispiel', {}, '', ANNA.id),
    ...deriveMyFsTasks(s.fsWeeks, fsWochenKennungen(s.weeks, s.fsBase), 'Anna Beispiel', {}, ANNA.id, 'Leiter'),
  ].map((task) => task.id)
}

/** Anna tippt jede Aufgabe an — über den Reducer, wie in der App. */
function annaBestaetigtAlles(s: AppState): AppState {
  return annasAufgaben(s).reduce((st, id) => reducer(st, { type: 'confirmTask', id }), s)
}

function zeige(state: AppState) {
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PlanenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />).container
}

/** Nur die mittlere (angezeigte) Seite des Wochenstreifens. */
const seite = (c: HTMLElement): HTMLElement =>
  (c.querySelector('.week-page:not(.week-page--vor):not(.week-page--nach)') as HTMLElement) ?? c

/** Stufe je Chip einer Person: `is-bestaetigt` / `is-offen` / `is-verhindert`. */
function stufenVon(c: HTMLElement, name: string): string[] {
  return [...seite(c).querySelectorAll('.slot-chip')]
    .filter((chip) => chip.textContent?.includes(name))
    .map((chip) => {
      const punkt = chip.querySelector('.zusage-punkt')
      return ['is-bestaetigt', 'is-offen', 'is-verhindert'].find((k) => punkt?.classList.contains(k)) ?? 'kein Punkt'
    })
}

afterEach(cleanup)

describe('Die Ampel zeigt an allen Plätzen, was zugesagt ist', () => {
  it('die Vorgabe trägt, was sie soll: fünf Aufgaben für Anna, in der Woche ab dem 21.', () => {
    // Ohne diese Zeile prüften die Fälle darunter womöglich weniger Plätze.
    const ids = annasAufgaben(stand())
    expect(ids).toHaveLength(5)
    expect(ids.every((id) => id.includes('2026-09-21'))).toBe(true)
  })

  it('Anna bestätigt alles — Hauptsaal, Klasse, Ratgeber und Mikrofon werden grün', () => {
    const c = zeige(annaBestaetigtAlles(stand()))
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt', 'is-bestaetigt', 'is-bestaetigt', 'is-bestaetigt'])
  })

  it('… und ihr Treffpunkt ebenso', () => {
    const c = zeige(annaBestaetigtAlles(stand({ tab: 'fs' })))
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt'])
  })

  it('Bernd hat nichts bestätigt — sein Platz daneben bleibt gelb', () => {
    // Gegenprobe: Ohne sie könnte die Ansicht schlicht alles grün malen.
    const c = zeige(annaBestaetigtAlles(stand()))
    expect(stufenVon(c, 'Bernd Anders')).toEqual(['is-offen'])
  })

  it('sagt Anna das Mikrofon ab, wird genau dieser Platz rot', () => {
    let s = annaBestaetigtAlles(stand())
    const mikrofon = annasAufgaben(s).find((id) => id.includes('|helper|'))!
    s = reducer(s, { type: 'declineTask', id: mikrofon })
    const c = zeige(s)
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt', 'is-bestaetigt', 'is-bestaetigt', 'is-verhindert'])
  })
})

describe('Eine ausgefallene Zusammenkunft trägt keine Punkte (T30)', () => {
  /** Annas Woche, nachdem sie alles zugesagt hat — und danach fällt die Zusammenkunft aus. */
  const danachAusgefallen = (): AppState => {
    const s = annaBestaetigtAlles(stand())
    const weeks = s.weeks.map((w, i) => (i === 1 ? { ...w, dev: { mid: { cancelled: true } } } : w))
    return { ...s, weeks }
  }

  it('weder im Programm noch beim Ratgeber noch an den Hilfsdiensten — auch nicht mit Zusagen von vorher', () => {
    // Die Namen bleiben stehen, damit nichts verloren ist, falls der Ausfall
    // zurückgenommen wird. Einen Punkt tragen sie nicht: Es gibt dazu keine
    // Aufgabe mehr, und ein grüner Punkt meldete eine Zusage für einen Abend,
    // der nicht stattfindet.
    const c = zeige(danachAusgefallen())
    const annasChips = stufenVon(c, 'Anna Beispiel')
    expect(annasChips).toHaveLength(4)
    expect(annasChips.every((s) => s === 'kein Punkt')).toBe(true)
    expect(seite(c).querySelectorAll('.slot-chip .zusage-punkt')).toHaveLength(0)
  })

  it('… die Treffpunkte derselben Woche schon — sie hängen an keiner Zusammenkunft', () => {
    const c = zeige({ ...danachAusgefallen(), tab: 'fs' })
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt'])
  })
})

describe('Die Legende', () => {
  it('nennt die drei Stufen beim Namen — mit denselben Punkten wie die Chips', () => {
    const legende = seite(zeige(stand())).querySelector('.plan-legend')!
    const eintraege = [...legende.querySelectorAll('.plan-legend-item')]
    expect(eintraege.map((e) => e.textContent)).toEqual([t.zusageBestaetigt, t.zusageWartet, t.zusageAbgesagt])
    expect(eintraege.map((e) => e.querySelector('.zusage-punkt')?.className)).toEqual([
      'zusage-punkt is-bestaetigt', 'zusage-punkt is-offen', 'zusage-punkt is-verhindert',
    ])
  })

  it('spricht die Sprache des Planers', () => {
    const en = dict('en')
    const legende = seite(zeige(stand({ lang: 'en' }))).querySelector('.plan-legend')!
    expect([...legende.querySelectorAll('.plan-legend-item')].map((e) => e.textContent)).toEqual([
      en.zusageBestaetigt, en.zusageWartet, en.zusageAbgesagt,
    ])
    expect(en.zusageAbgesagt).not.toBe(t.zusageAbgesagt)
  })
})
