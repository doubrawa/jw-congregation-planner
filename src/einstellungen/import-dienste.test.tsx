/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
import type { Person, Qualifications, Service, Week } from '../data/types'

/**
 * **Programm-Import und Hilfsdienste — die beiden Einstellungen, die den Plan
 * überhaupt erst möglich machen.**
 *
 * Der Import ist der einzige Weg, an ein Wochenprogramm zu kommen, und er
 * verhält sich in Demo und Produktion völlig verschieden. Beide Wege müssen
 * hinter demselben Knopf stecken.
 *
 * Bei den Hilfsdiensten geht es um einen Fall, der sonst unsichtbar bleibt
 * (T79): Ein **neu angelegter** Dienst bringt einen Aufgabenbereich mit, den
 * bis dahin keine Person gesetzt hat. Sein Platz bleibt dann Woche für Woche
 * offen, ohne dass irgendwo stünde, woran es liegt. Genau deshalb steht die
 * Zahl der freigegebenen Personen an der Zeile — und wird hervorgehoben, wenn
 * sie 0 ist.
 */

const importNextWeek = vi.fn((_after?: string, _lang?: string, _alt?: string[]) =>
  Promise.resolve<{ ok: boolean; week?: Week; error?: string }>({ ok: true, week: undefined }),
)
const importWeekVariants = vi.fn((_start: string, _lang: string, _codes: string[]) =>
  Promise.resolve<{ ok: boolean; week?: Week }>({ ok: false }),
)

vi.mock('../lib/import', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  importNextWeek: (a?: string, b?: string, c?: string[]) => importNextWeek(a, b, c),
  importWeekVariants: (a: string, b: string, c: string[]) => importWeekVariants(a, b, c),
}))

const { ImportPanel } = await import('./ImportPanel')
const { ServicesPanel } = await import('./ServicesPanel')

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) q[k] = true
  return q
}

const person = (id: string, ln: string, ...q: string[]): Person => ({
  id, fn: 'Max', ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: priv(...q),
})

function woche(start: string | undefined, range = '7.–13. September'): Week {
  return {
    range, book: '', start, current: false,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  } as Week
}

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

function zeige(was: 'import' | 'dienste', over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [], services: DIENSTE, groups: [], weeks: [], fsWeeks: [],
    congLang: 'Deutsch', progLangs: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'import' ? <ImportPanel /> : <ServicesPanel />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.svc-row')]

beforeEach(() => {
  vi.useRealTimers()
  importNextWeek.mockClear().mockResolvedValue({ ok: true, week: woche('2026-09-14') })
  importWeekVariants.mockClear().mockResolvedValue({ ok: false })
})
afterEach(cleanup)

describe('„Geladen bis" beantwortet die häufigste Frage', () => {
  it('nennt das Ende der spätesten Woche und zählt die geladenen', () => {
    const { container } = zeige('import', { weeks: [woche('2026-09-07'), woche('2026-09-14')] })
    const status = container.querySelector('.imp-status')?.textContent ?? ''
    expect(status).toContain('20') // Sonntag der zweiten Woche, 20. September
    expect(container.querySelector('.imp-count')?.textContent).toBe('2 Wochen geladen')
  })

  it('ohne ISO-Datum (Demo, Vorlagen) den Wochenbereich im Klartext', () => {
    const { container } = zeige('import', { weeks: [woche(undefined, '7.–13. September')] })
    expect(container.querySelector('.kv-key')?.textContent).toContain('7.–13. September')
  })

  it('ganz ohne Woche einen eigenen Satz statt einer leeren Angabe', () => {
    const { container } = zeige('import', { weeks: [] })
    expect(container.querySelector('.kv-key')?.textContent).toBe(t.geladenNichts)
    expect(container.querySelector('.imp-count')).toBeNull()
  })
})

describe('Import im Demo-Modus', () => {
  it('simuliert einen Abruf statt jw.org anzurufen', async () => {
    vi.useFakeTimers()
    const { container, dispatch } = zeige('import', { dataStatus: 'demo', imported: false })
    fireEvent.click(container.querySelector('.imp-btn')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'startImport' })
    expect(importNextWeek).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(dispatch).toHaveBeenCalledWith({ type: 'finishImport' })
  })

  it('ein zweites Mal geht nicht — es gibt nur die eine Beispielwoche', () => {
    const { container, dispatch } = zeige('import', { dataStatus: 'demo', imported: true })
    fireEvent.click(container.querySelector('.imp-btn')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastAlleWochen })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'startImport')).toBe(false)
  })
})

describe('Import in der Produktion', () => {
  it('holt die nächste Woche in der Versammlungssprache', async () => {
    const { container } = zeige('import', {
      weeks: [woche('2026-09-07')], congLang: 'Englisch',
    })
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-09-07', 'en', []))
  })

  it('unbekannte Versammlungssprache fällt auf Deutsch zurück statt leer zu bleiben', async () => {
    const { container } = zeige('import', { congLang: 'Erfundisch' })
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith(undefined, 'de', []))
  })

  it('weitere Programmsprachen kommen als Varianten mit — ohne die Hauptsprache doppelt', async () => {
    const { container } = zeige('import', {
      congLang: 'Deutsch', progLangs: ['Englisch', 'Deutsch'],
    })
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith(undefined, 'de', ['en']))
  })

  it('die geholte Woche wird angehängt', async () => {
    const neue = woche('2026-09-14')
    importNextWeek.mockResolvedValue({ ok: true, week: neue })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'addImportedWeek', week: neue }),
    )
  })

  it('ein Fehler beendet den Lauf und sagt, was los ist', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'Keine weitere Woche verfügbar' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'stopImport' }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'showToast', text: 'Keine weitere Woche verfügbar',
    })
  })

  it('ohne angebundene Datenbank steht der passende Satz — nicht der vom Anmelden', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'demo' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.importOhneDb }),
    )
  })

  it('ein unbekannter Fehler bekommt den allgemeinen Satz', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'unbekannt' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.importFehler }),
    )
  })

  it('fehlende Sprachvarianten geladener Wochen werden zuerst nachgezogen', async () => {
    // Eine Programmsprache, die nach dem Import hinzukam, fehlt sonst dauerhaft.
    const alt = woche('2026-09-14')
    importWeekVariants.mockResolvedValue({ ok: true, week: { ...alt, alt: { en: alt } } })
    const { container, dispatch } = zeige('import', {
      weeks: [woche('2026-09-07')], congLang: 'Deutsch', progLangs: ['Englisch'],
    })
    fireEvent.click(container.querySelector('.imp-btn')!)
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledWith('2026-09-07', 'de', ['en']))
    await waitFor(() =>
      expect(dispatch.mock.calls.some((c) => c[0].type === 'mergeWeekAlt')).toBe(true),
    )
  })

  it('während eines laufenden Imports löst ein zweiter Tipp nichts aus', () => {
    const { container } = zeige('import', { importing: true })
    fireEvent.click(container.querySelector('.imp-btn')!)
    expect(importNextWeek).not.toHaveBeenCalled()
  })

  it('der Knopf sagt, was gerade ist', () => {
    expect(zeige('import').container.querySelector('.imp-btn')?.textContent).toBe(t.importBtn)
    cleanup()
    expect(zeige('import', { importing: true }).container.querySelector('.imp-btn')?.textContent)
      .toBe(t.importiere)
    cleanup()
    expect(zeige('import', { imported: true }).container.querySelector('.imp-btn')?.textContent)
      .toBe(t.alleImportiert)
  })
})

describe('Hilfsdienste anlegen, zählen, löschen', () => {
  it('jeder Dienst steht mit Name und Platzzahl da', () => {
    const { container } = zeige('dienste')
    expect(zeilen(container)).toHaveLength(2)
    expect(zeilen(container)[0]!.querySelector('.svc-name')?.textContent).toBe('Mikrofone')
    expect(zeilen(container)[0]!.querySelector('.svc-count')?.textContent).toBe('2')
  })

  it('die Platzzahl lässt sich in Einerschritten ändern', () => {
    const { container, dispatch } = zeige('dienste')
    const zeile = zeilen(container)[0]!
    fireEvent.click(zeile.querySelector(`[aria-label="${t.a11yIncrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeServiceCount', key: 'mik', delta: 1 })
    fireEvent.click(zeile.querySelector(`[aria-label="${t.a11yDecrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeServiceCount', key: 'mik', delta: -1 })
  })

  it('ein Dienst lässt sich löschen', () => {
    const { container, dispatch } = zeige('dienste')
    fireEvent.click(zeilen(container)[0]!.querySelector('.svc-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeService', key: 'mik' })
  })

  it('ein neuer Dienst braucht einen Namen — leer wird darum gebeten', () => {
    const { container, dispatch } = zeige('dienste')
    fireEvent.click(container.querySelector('.svc-add-btn')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameEingeben })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addService')).toBe(false)
  })

  it('mit Namen entsteht er mit einem Platz und eigenem Schlüssel', () => {
    const { container, dispatch } = zeige('dienste')
    const feld = container.querySelector<HTMLInputElement>('.svc-add-input')!
    fireEvent.change(feld, { target: { value: '  Parkplatz  ' } })
    fireEvent.click(container.querySelector('.svc-add-btn')!)
    const svc = dispatch.mock.calls.find((c) => c[0].type === 'addService')![0].service
    expect(svc).toMatchObject({ name: 'Parkplatz', count: 1, groups: false })
    expect(svc.key).toMatch(/^svc-/)
    expect(feld.value).toBe('')
  })

  it('zwei nacheinander angelegte bekommen verschiedene Schlüssel', () => {
    const { container, dispatch } = zeige('dienste')
    const feld = container.querySelector<HTMLInputElement>('.svc-add-input')!
    for (const name of ['Eins', 'Zwei']) {
      fireEvent.change(feld, { target: { value: name } })
      fireEvent.click(container.querySelector('.svc-add-btn')!)
    }
    const keys = dispatch.mock.calls.filter((c) => c[0].type === 'addService').map((c) => c[0].service.key)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('Für wie viele der Dienst freigegeben ist (T79)', () => {
  it('zählt die Personen mit diesem Aufgabenbereich', () => {
    const { container } = zeige('dienste', {
      persons: [person('p1', 'Alt', serviceQualKey('mik')), person('p2', 'Brand'), person('p3', 'Cohn', serviceQualKey('mik'))],
    })
    expect(zeilen(container)[0]!.querySelector('.svc-sub')?.textContent).toBe('2 Personen')
  })

  it('hebt hervor, wenn niemand freigegeben ist — der Fall des neuen Dienstes', () => {
    // Sein Platz bliebe sonst Woche für Woche offen, ohne erkennbaren Grund.
    const { container } = zeige('dienste', { persons: [person('p1', 'Alt')] })
    expect(zeilen(container)[0]!.querySelector('.svc-sub--leer')).toBeTruthy()
  })

  it('mit Freigegebenen nicht mehr', () => {
    const { container } = zeige('dienste', {
      persons: [person('p1', 'Alt', serviceQualKey('mik'))],
    })
    expect(zeilen(container)[0]!.querySelector('.svc-sub--leer')).toBeNull()
  })

  it('die Zeile führt in die Freigabe-Liste', () => {
    const { container, dispatch } = zeige('dienste')
    fireEvent.click(zeilen(container)[0]!.querySelector('.svc-open')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openServiceSheet', key: 'mik' })
  })

  it('die Gruppen-Rotation braucht niemanden — keine Liste, keine Hervorhebung', () => {
    const { container } = zeige('dienste', { persons: [] })
    const rein = zeilen(container)[1]!
    expect(rein.querySelector('.svc-open')).toBeNull()
    expect(rein.querySelector('.svc-sub')?.textContent).toBe(t.gruppenRotation)
    expect(rein.querySelector('.svc-sub--leer')).toBeNull()
  })
})
