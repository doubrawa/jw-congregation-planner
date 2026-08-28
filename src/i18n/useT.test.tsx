/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import React from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useApp,
  useAppDispatch,
  useStaticStore,
} from '../app/context'
import { AppProvider } from '../app/store'
import { buildDemoWeeks } from '../data/testdaten'
import { dict } from './ui'
import { makeTr } from './translate'
import { fill, useProgWeek, useT } from './useT'
import type { Meeting, PartItem, Week } from '../data/types'

// Die gerenderten Bühnen sonst im Dokument stehen — getByText fände dann
// mehrere Treffer.
afterEach(cleanup)

/**
 * Provider-Wrapper mit einem Teil-State (useT liest nur lang/congLang).
 *
 * Der Speicher gehört dazu: `useT` liest seit T41 über Selektoren, und die
 * gehen am Zustands-Kontext vorbei.
 */
function wrapper(state: Partial<AppState>) {
  return ({ children }: { children: React.ReactNode }) => {
    const store = useStaticStore(state as AppState)
    return (
      <AppDispatchContext.Provider value={() => {}}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state as AppState}>{children}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
}

describe('useApp', () => {
  it('wirft außerhalb eines Providers', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {}) // React-Render-Fehler stummschalten
    expect(() => renderHook(() => useApp())).toThrow(/AppProvider/)
    err.mockRestore()
  })
  it('liefert state/dispatch innerhalb des Providers', () => {
    const { result } = renderHook(() => useApp(), { wrapper: wrapper({ lang: 'de' }) })
    expect(result.current.state.lang).toBe('de')
    expect(typeof result.current.dispatch).toBe('function')
  })
})

describe('useT', () => {
  it('Deutsch: tu/tp sind Identität, kein Programm-Fallback', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper({ lang: 'de', congLang: 'Deutsch' }) })
    expect(result.current.tu('Lied 5')).toBe('Lied 5')
    expect(result.current.tp('Lied 5')).toBe('Lied 5')
    expect(result.current.progFallback).toBe(false)
    expect(typeof result.current.t).toBe('object')
  })

  it('Englisch (App + Versammlung): tu/tp übersetzen Programm-Inhalte', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper({ lang: 'en', congLang: 'Englisch' }) })
    expect(result.current.tu('Lied 5')).toBe('Song 5')
    expect(result.current.tp('Lied 5')).toBe('Song 5')
    expect(result.current.progFallback).toBe(false)
  })

  it('nicht unterstützte Versammlungssprache → progFallback, tp Identität', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper({ lang: 'de', congLang: 'Cebuano' }) })
    expect(result.current.progFallback).toBe(true)
    expect(result.current.tp('Lied 5')).toBe('Lied 5')
  })
})

describe('useProgWeek', () => {
  it('ohne Woche → tpw fällt auf tp zurück', () => {
    const { result } = renderHook(() => useProgWeek(undefined), { wrapper: wrapper({ lang: 'de', congLang: 'Deutsch' }) })
    expect(result.current.week).toBeUndefined()
    expect(result.current.tpw('Lied 5')).toBe('Lied 5')
  })

  it('Woche ohne passende Sprachvariante → dieselbe Woche, tpw = tp', () => {
    const week = buildDemoWeeks()[0]
    const { result } = renderHook(() => useProgWeek(week), { wrapper: wrapper({ lang: 'de', congLang: 'Deutsch' }) })
    expect(result.current.week).toBe(week)
    expect(result.current.tpw('Lied 5')).toBe('Lied 5')
  })

  /**
   * **Der Fall, für den es `useProgWeek` überhaupt gibt — und der nie geprüft
   * war.**
   *
   * Eine Versammlung hält ihr Programm auf Spanisch; ein Bruder hat die App auf
   * Japanisch. Beim Import wurde die japanische Fassung mitgeholt (`Week.alt`).
   * Dann — und nur dann — **wechselt die ganze Woche die Sprache**: Titel und
   * Lieder kommen aus der Variante, und die Vorlagen-Strings, die es dort nicht
   * gibt (Wochenend-Vorlage, eigene LAC-Punkte), gehen durch `makeTr` in die
   * **App**-Sprache statt in die der Versammlung.
   *
   * Beide Hälften wurden bisher nur mit gleicher App- und Versammlungssprache
   * gemessen — also gerade dort, wo der Wechsel gar nicht stattfindet.
   */
  function wocheMitVariante(): Week {
    const leer: Meeting = { date: '', end: '', sections: [], helpers: {} }
    const mid: Meeting = {
      date: 'Dienstag, 8. September · 19:00',
      end: 'Ende ca. 20:45',
      sections: [{
        label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schaetze', farbe: 'petrol',
        items: [{ num: 1, title: 'Nach geistigen Schätzen graben', meta: '10 Min.', mins: 10, names: [{ name: 'T. Lindner', bereichsKey: 'vortrag' }] }],
      }],
      helpers: {},
    }
    const jaMid: Meeting = {
      date: '9月8日火曜日 · 19:00',
      end: '約20:45終了',
      sections: [{
        label: '神の言葉の宝', kind: 'schaetze', farbe: 'petrol',
        items: [{ num: 1, title: '霊的な宝を探る', meta: '10分', names: [] }],
      }],
      helpers: {},
    }
    return {
      range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07', current: false,
      mid, we: structuredClone(leer),
      alt: {
        ja: { range: '9月7–13日', book: 'エレミヤ 32', start: '2026-09-07', current: false, mid: jaMid, we: structuredClone(leer) },
      },
    }
  }

  it('App-Sprache mit eigener Variante: die Woche wechselt die Sprache', () => {
    const week = wocheMitVariante()
    const { result } = renderHook(() => useProgWeek(week), {
      wrapper: wrapper({ lang: 'ja', congLang: 'Spanisch' }),
    })
    expect(result.current.week).not.toBe(week)
    const gezeigt = result.current.week!
    const abschnitt = gezeigt.mid.sections[0]!
    const punkt = abschnitt.items[0] as PartItem
    expect(gezeigt.range).toBe('9月7–13日')
    expect(abschnitt.label).toBe('神の言葉の宝')
    // Die Zuteilung bleibt kanonisch — die Variante trägt keine.
    expect(punkt.names[0]!.name).toBe('T. Lindner')
  })

  it('und tpw übersetzt Vorlagen-Texte dann in die App-Sprache, nicht in die der Versammlung', () => {
    // Der Kern: „Lied 5" steht in der Wochenend-Vorlage kanonisch deutsch und
    // kommt in keiner Variante vor. Es muss japanisch werden (Sprache des
    // Lesers), nicht spanisch (Sprache der Versammlung) — sonst stünde mitten
    // im japanischen Programm ein spanisches Lied.
    const { result } = renderHook(() => useProgWeek(wocheMitVariante()), {
      wrapper: wrapper({ lang: 'ja', congLang: 'Spanisch' }),
    })
    expect(result.current.tpw('Lied 5')).toBe(makeTr('ja')('Lied 5'))
    expect(result.current.tpw('Lied 5')).not.toBe(makeTr('es')('Lied 5'))
  })

  it('ohne passende Variante bleibt es bei der Versammlungssprache', () => {
    // Dieselbe Woche, aber die App läuft auf Koreanisch — dafür wurde nichts
    // mitgeholt. Dann zeigt die App das spanische Programm, und `tpw` ist `tp`.
    const week = wocheMitVariante()
    const { result } = renderHook(() => useProgWeek(week), {
      wrapper: wrapper({ lang: 'ko', congLang: 'Spanisch' }),
    })
    expect(result.current.week).toBe(week)
    expect(result.current.tpw('Lied 5')).toBe(makeTr('es')('Lied 5'))
  })

  it('App- und Versammlungssprache gleich → keine Variante, kein Umweg', () => {
    // `useProgWeek` fragt gar nicht erst nach einer Variante, wenn beide
    // Sprachen dieselben sind: Das Programm steht schon in der richtigen.
    const week = wocheMitVariante()
    const { result } = renderHook(() => useProgWeek(week), {
      wrapper: wrapper({ lang: 'ja', congLang: 'Japanisch' }),
    })
    expect(result.current.week).toBe(week)
  })
})

describe('fill (Sanity im Hook-Umfeld)', () => {
  it('ersetzt Platzhalter', () => {
    expect(fill('{n}x', { n: 2 })).toBe('2x')
  })
})

/*
 * Der eigentliche Ertrag von T41, gemessen.
 *
 * `useT` liest zwei Felder — `lang` und `congLang` —, hing aber über `useApp()`
 * am ganzen Zustand. 44 Bausteine nutzen den Hook: jede Aktion, gleich welche,
 * rief sie alle auf den Plan. Ein einzelner Tastendruck in einem Personenfeld
 * rendert damit die halbe Anwendung neu, obwohl sich an keiner Übersetzung
 * etwas geändert hat.
 *
 * Gemessen wird deshalb am **echten** Provider, mit echten Aktionen.
 */
describe('useT weckt nur die Sprache', () => {
  /** Baustein, der wie die 44 anderen nur übersetzen will. */
  function Uebersetzt({ zaehler }: { zaehler: { n: number } }) {
    const { t } = useT()
    zaehler.n++
    return <span>{t.autoZuteilen}</span>
  }

  function Ausloeser({ beschriftung, action }: { beschriftung: string; action: AppAction }) {
    const dispatch = useAppDispatch()
    return (
      <button type="button" onClick={() => dispatch(action)}>
        {beschriftung}
      </button>
    )
  }

  it('eine Aktion ohne Sprachbezug lässt ihn schlafen', () => {
    const zaehler = { n: 0 }
    const { getByText } = render(
      <AppProvider>
        <Uebersetzt zaehler={zaehler} />
        <Ausloeser beschriftung="wochenende" action={{ type: 'setTab', tab: 'we' }} />
      </AppProvider>,
    )
    expect(zaehler.n).toBe(1)
    fireEvent.click(getByText('wochenende'))
    // Über useApp() stünde hier 2 — und in der echten App 44-mal 2.
    expect(zaehler.n).toBe(1)
  })

  it('ein Sprachwechsel weckt ihn sehr wohl — und übersetzt', () => {
    const zaehler = { n: 0 }
    const { getByText } = render(
      <AppProvider>
        <Uebersetzt zaehler={zaehler} />
        <Ausloeser beschriftung="englisch" action={{ type: 'setLang', lang: 'en' }} />
      </AppProvider>,
    )
    const deutsch = dict('de').autoZuteilen
    expect(getByText(deutsch)).toBeTruthy()
    fireEvent.click(getByText('englisch'))
    expect(zaehler.n).toBe(2)
    expect(getByText(dict('en').autoZuteilen)).toBeTruthy()
  })
})
