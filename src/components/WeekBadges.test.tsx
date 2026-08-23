/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { dict } from '../i18n/ui'
import type { Week } from '../data/types'
import { AusfallBanner, MemorialBanner, TerminListe, WeekChips } from './WeekBadges'
import { WeekNav } from './WeekNav'

/**
 * **Die Chips und Banner über dem Wochenprogramm.**
 *
 * Sie beantworten in einem Blick die Frage, die im Saal am häufigsten gestellt
 * wird: *Findet diese Woche überhaupt etwas statt — und wann?* Genau deshalb
 * sind hier mehrere Regeln zusammengekommen, die nichts miteinander zu tun
 * haben und trotzdem dieselbe Fläche teilen:
 *
 * - Der **Kongress** hat kein eigenes Flag: er wirkt als Ausfall *beider*
 *   Zusammenkünfte und wird über `anlassArt` erkannt (T64).
 * - Der Chip **AKTUELLE WOCHE** hängt an der gerechneten laufenden Woche, nicht
 *   am `current`-Flag der Daten — das setzt nur der Demo-Bestand und wird nie
 *   nachgeführt; in der Produktion erschien der Chip deshalb nie.
 * - Der **Grund eines Ausfalls** sind die Worte des Planers und bleiben
 *   unübersetzt. Für „entfällt" gibt es kein gemessenes Wort in 33 Sprachen;
 *   der durchgestrichene Name der Zusammenkunft trägt die Aussage allein.
 */

const t = dict('de')

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '1.–7. September', book: '', start: '2026-09-07', current: false,
    mid: { date: 'Di, 8. September · 19:00', end: '20:45', sections: [], helpers: {} },
    we: { date: 'So, 13. September · 10:00', end: '11:45', sections: [], helpers: {} },
    ...over,
  }
}

function buehne(kind: string, inhalt: ReactNode, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = { ...initialState(), dataStatus: 'ready', ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>{inhalt}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  void kind
  return { dispatch, ...render(<Buehne />) }
}

const chips = (c: HTMLElement) => [...c.querySelectorAll('.week-chip')].map((x) => x.textContent ?? '')

afterEach(cleanup)

describe('Die Wochen-Chips', () => {
  it('ohne Besonderheit steht gar nichts da — keine leere Leiste', () => {
    const { container } = buehne('chips', <WeekChips week={woche()} showCurrent />)
    expect(container.querySelector('.week-chips')).toBeNull()
  })

  it('die laufende Woche wird als solche gekennzeichnet', () => {
    const { container } = buehne('chips', <WeekChips week={woche()} showCurrent istAktuell />)
    expect(chips(container)).toEqual([t.aktuelleWoche])
  })

  it('das `current`-Flag der Daten entscheidet das NICHT — es wird nie nachgeführt', () => {
    // In der Produktion setzt es niemand; der Chip erschien deshalb nie.
    const { container } = buehne('chips', <WeekChips week={woche({ current: true })} showCurrent />)
    expect(container.querySelector('.week-chips')).toBeNull()
  })

  it('im Planen wird die laufende Woche nicht gekennzeichnet — dort plant man voraus', () => {
    const { container } = buehne('chips', <WeekChips week={woche()} showCurrent={false} istAktuell />)
    expect(container.querySelector('.week-chips')).toBeNull()
  })

  it('Kreisaufseher-Woche und Gedächtnismahl bekommen ihren Chip', () => {
    const co = buehne('chips', <WeekChips week={woche({ co: true })} showCurrent />)
    expect(chips(co.container)).toEqual([t.coWoche])
    cleanup()
    const mem = buehne('chips', <WeekChips week={woche({ mem: true })} showCurrent />)
    expect(chips(mem.container)).toEqual([t.memWoche])
  })

  it('der Kongress ebenso — obwohl er gar kein eigenes Flag hat (T64)', () => {
    const kongress = woche({
      anlass: { art: 'kongress' },
      dev: { mid: { cancelled: true }, we: { cancelled: true } },
    } as Partial<Week>)
    const { container } = buehne('chips', <WeekChips week={kongress} showCurrent />)
    expect(chips(container)[0]).toBe(t.kongress)
  })

  it('eine Verlegung sieht man schon in der Navigation — ohne den Tab zu wechseln', () => {
    const verlegt = woche({ dev: { mid: { day: 'Donnerstag' } } })
    const { container } = buehne('chips', <WeekChips week={verlegt} showCurrent />)
    expect(chips(container)).toEqual([t.tabMid])
    expect(container.querySelector('.week-chip--dev s')).toBeNull() // verlegt, nicht gestrichen
  })

  it('eine ausgefallene Zusammenkunft steht durchgestrichen da', () => {
    const aus = woche({ dev: { we: { cancelled: true, reason: 'Kongress' } } })
    const { container } = buehne('chips', <WeekChips week={aus} showCurrent />)
    expect(container.querySelector('.week-chip--dev s')?.textContent).toBe(t.tabWe)
  })

  it('fallen beide aus, stehen beide da', () => {
    const aus = woche({ dev: { mid: { cancelled: true }, we: { cancelled: true } } })
    const { container } = buehne('chips', <WeekChips week={aus} showCurrent />)
    expect(chips(container)).toEqual([t.tabMid, t.tabWe])
  })
})

describe('Das Gedächtnismahl-Banner', () => {
  it('steht auf dem Tab der ausfallenden Zusammenkunft — und nennt ihr Datum', () => {
    const mem = woche({ mem: true, memCancel: 'mid' } as Partial<Week>)
    const { container } = buehne('mem', <MemorialBanner week={mem} tab="mid" />)
    expect(container.querySelector('.mem-banner')?.textContent).toContain(t.tabMid)
    expect(container.querySelector('.mem-banner-date')?.textContent).toBe('Di, 8. September · 19:00')
  })

  it('auf dem anderen Tab nicht — dort findet das gewohnte Programm statt', () => {
    const mem = woche({ mem: true, memCancel: 'mid' } as Partial<Week>)
    const { container } = buehne('mem', <MemorialBanner week={mem} tab="we" />)
    expect(container.querySelector('.mem-banner')).toBeNull()
  })

  it('in einer gewöhnlichen Woche gar nicht', () => {
    const { container } = buehne('mem', <MemorialBanner week={woche()} tab="mid" />)
    expect(container.querySelector('.mem-banner')).toBeNull()
  })

  it('eine Mahl-Woche ohne ausfallende Zusammenkunft ebenso wenig', () => {
    // Das Datum steht noch nicht fest — dann ist auch noch nichts gestrichen.
    const mem = woche({ mem: true })
    const { container } = buehne('mem', <MemorialBanner week={mem} tab="mid" />)
    expect(container.querySelector('.mem-banner')).toBeNull()
  })
})

describe('Das Ausfall-Banner (T30)', () => {
  it('streicht den Namen der Zusammenkunft durch und nennt den Grund des Planers', () => {
    const aus = woche({ dev: { mid: { cancelled: true, reason: 'Kongress in Nürnberg' } } })
    const { container } = buehne('aus', <AusfallBanner week={aus} tab="mid" />)
    expect(container.querySelector('.ausfall-name')?.textContent).toBe(t.tabMid)
    expect(container.querySelector('.ausfall-grund')?.textContent).toBe('Kongress in Nürnberg')
  })

  it('ohne Grund bleibt der durchgestrichene Name allein — das genügt', () => {
    const aus = woche({ dev: { mid: { cancelled: true } } })
    const { container } = buehne('aus', <AusfallBanner week={aus} tab="mid" />)
    expect(container.querySelector('.ausfall-name')).toBeTruthy()
    expect(container.querySelector('.ausfall-grund')).toBeNull()
  })

  it('der Grund steht in Leserichtung seiner eigenen Schrift — er ist unübersetzter Freitext', () => {
    const aus = woche({ dev: { mid: { cancelled: true, reason: 'Kongress' } } })
    const { container } = buehne('aus', <AusfallBanner week={aus} tab="mid" />)
    expect(container.querySelector('.ausfall-grund')?.getAttribute('dir')).toBe('auto')
  })

  it('eine bloße Verlegung ist kein Ausfall', () => {
    const verlegt = woche({ dev: { mid: { day: 'Donnerstag', time: '18:30' } } })
    const { container } = buehne('aus', <AusfallBanner week={verlegt} tab="mid" />)
    expect(container.querySelector('.ausfall-banner')).toBeNull()
  })

  it('ohne Woche stürzt es nicht ab — die leere Versammlung hat keine', () => {
    const { container } = buehne('aus', <AusfallBanner week={undefined} tab="mid" />)
    expect(container.querySelector('.ausfall-banner')).toBeNull()
  })

  it('meldet sich als Statusmeldung — auch für Screenreader', () => {
    const aus = woche({ dev: { mid: { cancelled: true } } })
    const { container } = buehne('aus', <AusfallBanner week={aus} tab="mid" />)
    expect(container.querySelector('.ausfall-banner')?.getAttribute('role')).toBe('status')
  })
})

describe('Weitere Termine der Woche (T63)', () => {
  const mitTerminen = (): Week =>
    woche({
      termine: [
        { id: 'x2', title: 'Ältestenbesprechung', day: 'Donnerstag', time: '19:30', place: 'Saal' },
        { id: 'x1', title: 'Pionierbesprechung', day: 'Montag', time: '18:00' },
      ],
    } as Partial<Week>)

  it('stehen nach Wochentag sortiert da — nicht in Eingabereihenfolge', () => {
    const { container } = buehne('termine', <TerminListe week={mitTerminen()} />)
    expect([...container.querySelectorAll('.termin-was')].map((x) => x.textContent)).toEqual([
      'Pionierbesprechung', 'Ältestenbesprechung',
    ])
  })

  it('jeder nennt Tag und Uhrzeit, der Ort steht nur, wenn einer da ist', () => {
    const { container } = buehne('termine', <TerminListe week={mitTerminen()} />)
    const zeilen = [...container.querySelectorAll('.termin-zeile')]
    expect(zeilen[0]!.querySelector('.termin-wann')?.textContent).toBe('Montag · 18:00')
    expect(zeilen[0]!.querySelector('.termin-ort')).toBeNull()
    expect(zeilen[1]!.querySelector('.termin-ort')?.textContent).toBe('Saal')
  })

  it('die Bezeichnung bleibt in ihrer eigenen Leserichtung — sie ist unübersetzter Freitext', () => {
    const { container } = buehne('termine', <TerminListe week={mitTerminen()} />)
    expect(container.querySelector('.termin-was')?.getAttribute('dir')).toBe('auto')
  })

  it('ein Termin ohne Tag steht hinten und ohne Zeitangabe da — er ist unfertig', () => {
    const w = woche({
      termine: [
        { id: 'x1', title: 'Ohne Tag' },
        { id: 'x2', title: 'Mit Tag', day: 'Montag' },
      ],
    } as Partial<Week>)
    const { container } = buehne('termine', <TerminListe week={w} />)
    const zeilen = [...container.querySelectorAll('.termin-zeile')]
    expect(zeilen.map((z) => z.querySelector('.termin-was')?.textContent)).toEqual(['Mit Tag', 'Ohne Tag'])
    expect(zeilen[1]!.querySelector('.termin-wann')).toBeNull()
  })

  it('ohne Termine steht keine Liste da', () => {
    expect(buehne('termine', <TerminListe week={woche()} />).container.querySelector('.termin-liste'))
      .toBeNull()
  })

  it('ohne Woche ebenso wenig', () => {
    expect(buehne('termine', <TerminListe week={undefined} />).container.querySelector('.termin-liste'))
      .toBeNull()
  })
})

describe('Die Wochen-Navigation', () => {
  const nav = (canPrev: boolean, canNext: boolean, onPrev = vi.fn(), onNext = vi.fn()) =>
    buehne('nav', (
      <WeekNav canPrev={canPrev} canNext={canNext} onPrev={onPrev} onNext={onNext}>
        <span className="probe">1.–7. September</span>
      </WeekNav>
    ))

  it('die beiden Pfeile sind benannt — sonst hört ein Screenreader nur „Schaltfläche"', () => {
    const { container } = nav(true, true)
    expect([...container.querySelectorAll('.week-arrow')].map((b) => b.getAttribute('aria-label'))).toEqual([
      t.a11yPrevWeek, t.a11yNextWeek,
    ])
  })

  it('der Mittelteil trägt, was hineingegeben wird', () => {
    const { container } = nav(true, true)
    expect(container.querySelector('.week-center .probe')?.textContent).toBe('1.–7. September')
  })

  it('blättern löst genau die passende Seite aus', () => {
    const prev = vi.fn()
    const next = vi.fn()
    const { container } = nav(true, true, prev, next)
    const pfeile = [...container.querySelectorAll('.week-arrow')]
    fireEvent.click(pfeile[0]!)
    fireEvent.click(pfeile[1]!)
    expect(prev).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('am Rand ist der jeweilige Pfeil gesperrt — er liefe ins Leere', () => {
    const { container } = nav(false, true)
    const pfeile = [...container.querySelectorAll<HTMLButtonElement>('.week-arrow')]
    expect(pfeile[0]!.disabled).toBe(true)
    expect(pfeile[1]!.disabled).toBe(false)
  })

  it('ein gesperrter Pfeil löst auch beim Tippen nichts aus', () => {
    const prev = vi.fn()
    const { container } = nav(false, true, prev)
    fireEvent.click(container.querySelector('.week-arrow')!)
    expect(prev).not.toHaveBeenCalled()
  })
})
