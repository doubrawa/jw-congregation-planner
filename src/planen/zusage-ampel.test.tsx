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
import { reducer } from '../app/reducer'
import { deriveMyFsTasks } from '../data/fs'
import { emptyQualifications } from '../data/helpers'
import { deriveMyTasks, sentKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { FsInstance, Person, Service, Week } from '../data/types'
import { PlanenScreen } from './PlanenScreen'
import { STANDARD_ZEITEN } from '../data/vorgaben'

/**
 * **Was die eingeteilte Person zusagt, sieht der Planer am Platz — an jedem.**
 *
 * Anna ist in einer Woche fünfmal eingeteilt: im Hauptsaal, in der Zusätzlichen
 * Klasse, als Ratgeberin der Klasse, am Mikrofon und als Leiterin eines
 * Treffpunkts. Sie bestätigt in ihrer App alles, was ihr vorgelegt wird. Danach
 * muss der Planer an genau diesen fünf Plätzen Grün sehen — und an Bernds Platz
 * daneben weiter Gelb.
 *
 * **Warum die Probe von den Aufgaben ausgeht und nicht von Schlüsseln:** Die
 * Zusage entsteht unter der Aufgaben-Id, die `deriveMyTasks` und
 * `deriveMyFsTasks` liefern. Der Platz sucht sie unter einem Schlüssel, den die
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
  id, fn, ln, role: 'aeltester', female: false, mail: '', priv: emptyQualifications(),
})

const ANNA = person('p-anna', 'Anna', 'Beispiel')
const BERND = person('p-bernd', 'Bernd', 'Anders')
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

const anna = { name: 'Anna Beispiel', pid: ANNA.id }
const bernd = { name: 'Bernd Anders', pid: BERND.id }

function woche(start: string, besetzt: boolean): Week {
  const wer = besetzt ? anna : { name: '' }
  return {
    range: '', book: '', start, 
    mid: {
      date: '', end: '20:45',
      sections: [
        {
          label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
          items: [{ iid: 'i104',
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
  [{ id: 'tp1', ruleId: null, grp: null, wd: 6, time: '09:30', place: 'Saal', leader: 'Anna Beispiel', lpid: ANNA.id }],
]
function stand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    screen: 'planen', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: null, planner: true,
    persons: [ANNA, BERND], groups: [], services: DIENSTE, absences: [],
    weeks: WOCHEN, fsWeeks: TREFFPUNKTE, fsRules: [], week: 1,
    auxClass: true, confirmations: {},
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
}

/** Alles, was Anna in ihrer App vorgelegt bekommt — Zusammenkünfte und Treffpunkte. */
function annasAufgaben(s: AppState): string[] {
  return [
    ...deriveMyTasks(s.weeks, s.services, 'Anna Beispiel', {}, STANDARD_ZEITEN, ANNA.id),
    ...deriveMyFsTasks(s.fsWeeks, s.weeks.map((w) => w.start), 'Anna Beispiel', {}, ANNA.id, 'Leiter'),
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

/**
 * Nur die mittlere (angezeigte) Seite des Wochenstreifens. Bis T120 stand hier
 * ein Selektor auf `.week-page`, den nur die Nachbarn tragen: Er traf nie, und
 * die Chips kamen aus allen drei Wochen.
 */
const seite = (c: HTMLElement): HTMLElement => (c.querySelector('.week-strip > .screen') as HTMLElement) ?? c

/** Die Stufe hinter dem Wort, das ein Vorleseprogramm an einem Platz hört. */
const STUFE_DES_WORTS: Record<string, string> = {
  [t.zusageBestaetigt]: 'is-bestaetigt',
  [t.zusageWartet]: 'is-offen',
  [t.zusageAbgesagt]: 'is-verhindert',
}

/**
 * Stufe je Platz einer Person: `is-bestaetigt` / `is-offen` / `is-verhindert`,
 * ohne Zusage `kein Punkt`. Jeder Platz ist seit T121 eine Zeile — der Leiter
 * eines Treffpunkts seit Phase 5e auch: „wartet" steht sichtbar bei der Rolle,
 * die übrigen Stufen verborgen für Vorleseprogramme.
 */
function stufenVon(c: HTMLElement, name: string): string[] {
  return [...seite(c).querySelectorAll('.platz')]
    .filter((p) => p.querySelector('.platz-name')?.textContent === name)
    .map((p) => {
      const wort = p.querySelector('.sr-only')?.textContent ?? (p.classList.contains('is-wartet') ? t.zusageWartet : '')
      return STUFE_DES_WORTS[wort] ?? 'kein Punkt'
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

/*
 * Betreiber 31.10.2026: Der Haken „weiß Bescheid" zählt am Punkt der Plätze wie
 * eine Zusage, wie in der Spur. Er hängt an Platz **und** Name — jede
 * Platzsorte muss den Namen ihres Platzes mitgeben, sonst bliebe ihr Punkt gelb.
 */
describe('Der Haken „weiß Bescheid" zählt am Punkt wie eine Zusage (31.10.2026)', () => {
  /** Anna hat kein Konto; der Planer hat ihr jede ihrer Aufgaben persönlich gesagt. */
  const annaWeissBescheid = (s: AppState): AppState => ({
    ...s,
    persoenlich: Object.fromEntries(annasAufgaben(s).map((id) => [sentKey(id, 'Anna Beispiel'), '2026-09-14T10:00:00Z'])),
  })

  it('an jedem ihrer Plätze — Hauptsaal, Klasse, Ratgeber, Mikrofon; Bernd daneben bleibt gelb', () => {
    const c = zeige(annaWeissBescheid(stand()))
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt', 'is-bestaetigt', 'is-bestaetigt', 'is-bestaetigt'])
    expect(stufenVon(c, 'Bernd Anders')).toEqual(['is-offen'])
  })

  it('… und an ihrem Treffpunkt', () => {
    const c = zeige(annaWeissBescheid(stand({ tab: 'fs' })))
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt'])
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
    const annasPlaetze = stufenVon(c, 'Anna Beispiel')
    expect(annasPlaetze).toHaveLength(4)
    expect(annasPlaetze.every((s) => s === 'kein Punkt')).toBe(true)
    expect(seite(c).querySelectorAll('.platz .sr-only, .platz.is-wartet')).toHaveLength(0)
  })

  it('… die Treffpunkte derselben Woche schon — sie hängen an keiner Zusammenkunft', () => {
    const c = zeige({ ...danachAusgefallen(), tab: 'fs' })
    expect(stufenVon(c, 'Anna Beispiel')).toEqual(['is-bestaetigt'])
  })
})

describe('Die Legende (T121, `GPlanen`)', () => {
  it('nennt die vier Lagen beim Namen — mit denselben Punkten wie die Plätze', () => {
    const legende = seite(zeige(stand())).querySelector('.besetzung-legende')!
    const eintraege = [...legende.querySelectorAll('li')]
    expect(eintraege.map((e) => e.textContent)).toEqual([t.zusageBestaetigt, t.zusageWartet, t.lageProblem, t.offenWort])
    expect(eintraege.map((e) => e.className)).toEqual(['is-voll', 'is-wartet', 'is-problem', 'is-offen'])
    expect(eintraege.every((e) => e.querySelector('.platz-punkt'))).toBe(true)
  })

  it('spricht die Sprache des Planers', () => {
    const en = dict('en')
    const legende = seite(zeige(stand({ lang: 'en' }))).querySelector('.besetzung-legende')!
    expect([...legende.querySelectorAll('li')].map((e) => e.textContent)).toEqual([
      en.zusageBestaetigt, en.zusageWartet, en.lageProblem, en.offenWort,
    ])
    // „Problem" heißt in beiden Sprachen gleich — die Probe muss an einem Wort
    // hängen, das sich unterscheidet.
    expect(en.zusageWartet).not.toBe(t.zusageWartet)
  })
})
