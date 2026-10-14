/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Lang, Reminders } from '../data/types'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { ErinnerungenInhalt } from './ErinnerungenInhalt'

/**
 * **Erinnerungen als Zeitleiste** (T121, Phase 6c-4, Entwurf `GErinnerungen`):
 * Der Admin sieht, wie die App eine Aufgabe begleitet — vom gesendeten Plan bis
 * zum Tag selbst —, und stellt die drei Werte dort ein, wo sie in dieser Folge
 * wirken. Darunter steht, was ohne Einstellung sofort hinausgeht und an wen.
 * Geprüft wird, was er liest und was ein Tipp bewirkt.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: vi.fn() }))

const t = dict('de')
const STANDARD: Reminders = { first: 7, last: 1, repeat: false }

function zeige(reminders: Reminders = STANDARD, lang: Lang = 'de') {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'einstellungen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    reminders, lang,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <ErinnerungenInhalt />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

/** Die Schritte der Zeitleiste — die Einträge der einen Liste, in ihrer Folge. */
const schritte = (c: HTMLElement) => within(within(c).getByRole('list')).getAllByRole('listitem')
const titel = (schritt: HTMLElement) => schritt.querySelector('.erin-titel')?.textContent
/** Der Schritt mit diesem Titel. */
const schritt = (c: HTMLElement, name: string) => {
  const gefunden = schritte(c).find((s) => titel(s) === name)
  if (!gefunden) throw new Error(`kein Schritt „${name}"`)
  return gefunden
}
const unterzeile = (s: HTMLElement) => s.querySelector('.klein-text')?.textContent
/** Die Möglichkeiten der letzten Erinnerung, wie sie dastehen, und welche gedrückt ist. */
const wahl = (c: HTMLElement) => within(within(c).getByRole('group', { name: t.remLetzte })).getAllByRole('button')
const gedrueckt = (c: HTMLElement) => wahl(c).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)

describe('Die Zeitleiste', () => {
  it('fünf Schritte in ihrer Folge: vom gesendeten Plan bis zur Aufgabe', () => {
    const { container } = zeige()
    expect(schritte(container).map(titel)).toEqual([
      t.erinPlanGesendet, t.remErste, t.erinTaeglich, t.remLetzte, t.erinDieAufgabe,
    ])
    expect(container.querySelector('.erin-einleitung')?.textContent).toBe(t.erinEinleitung)
  })

  it('„Plan gesendet" zitiert den Titel, unter dem die Mitteilung wirklich ankommt', () => {
    const { container } = zeige()
    expect(unterzeile(schritt(container, t.erinPlanGesendet))).toBe('Sofort: „Neue Zuteilung“ mit der Bitte um Zusage')
  })

  it('… in der Sprache des Lesers — nicht den deutschen', () => {
    const en = dict('en')
    const { container } = zeige(STANDARD, 'en')
    expect(unterzeile(schritt(container, en.erinPlanGesendet))).toBe(
      'Immediately: “New assignment” with a request to confirm',
    )
  })

  it('nach der Aufgabe meldet sich die App nicht mehr — dort endet die Linie', () => {
    const { container } = zeige()
    const letzter = schritte(container).at(-1)!
    expect(unterzeile(letzter)).toBe(t.erinDanachStill)
    expect(letzter.querySelector('.erin-linie')).toBeNull()
    expect(schritte(container).slice(0, -1).every((s) => s.querySelector('.erin-linie'))).toBe(true)
  })

  it('die Seite bringt keinen eigenen Titel mit — den setzt, wer sie zeigt', () => {
    const { container } = zeige()
    expect(container.querySelector('h1, .seitentitel')).toBeNull()
  })
})

describe('Erste Erinnerung: Tage vor der Aufgabe', () => {
  const knopf = (c: HTMLElement, name: string) =>
    within(schritt(c, t.remErste)).getByRole('button', { name })

  it('die Zahl steht neben dem Titel, darunter, was sie zählt', () => {
    const { container } = zeige({ ...STANDARD, first: 7 })
    const s = schritt(container, t.remErste)
    expect(unterzeile(s)).toBe(t.erinTageVorAufgabe)
    expect(within(s).getByRole('group', { name: `${t.remErste}, ${t.erinTageVorAufgabe}` }).textContent).toContain('7')
  })

  it('− und + verstellen sie um einen Tag', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.a11yIncrease))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'changeReminder', key: 'first', delta: 1 })
    fireEvent.click(knopf(container, t.a11yDecrease))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'changeReminder', key: 'first', delta: -1 })
  })

  it('an den Grenzen der Datenbank ist Schluss: frühestens drei Wochen, spätestens einen Tag vorher', () => {
    const oben = zeige({ ...STANDARD, first: 21 })
    expect(knopf(oben.container, t.a11yIncrease).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(knopf(oben.container, t.a11yIncrease))
    expect(oben.dispatch).not.toHaveBeenCalled()
    cleanup()
    const unten = zeige({ ...STANDARD, first: 1 })
    expect(knopf(unten.container, t.a11yDecrease).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(knopf(unten.container, t.a11yDecrease))
    expect(unten.dispatch).not.toHaveBeenCalled()
  })
})

describe('Täglich wiederholen, bis die Zusage da ist', () => {
  const schalter = (c: HTMLElement) => within(schritt(c, t.erinTaeglich)).getByRole('switch', { name: t.remRepeat })

  it('der Schalter zeigt, was gilt', () => {
    expect(schalter(zeige({ ...STANDARD, repeat: false }).container).getAttribute('aria-checked')).toBe('false')
    cleanup()
    expect(schalter(zeige({ ...STANDARD, repeat: true }).container).getAttribute('aria-checked')).toBe('true')
  })

  it('ein Tipp schaltet um', () => {
    const { container, dispatch } = zeige()
    expect(unterzeile(schritt(container, t.erinTaeglich))).toBe(t.erinBisZusage)
    fireEvent.click(schalter(container))
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleReminderRepeat' })
  })
})

describe('Letzte Erinnerung: am Tag oder einen Tag vorher', () => {
  const tippe = (c: HTMLElement, text: string) => {
    const knopf = wahl(c).find((b) => b.textContent === text)
    if (!knopf) throw new Error(`keine Möglichkeit „${text}"`)
    fireEvent.click(knopf)
  }

  it('zwei Möglichkeiten, gedrückt ist, was gilt', () => {
    const { container } = zeige({ ...STANDARD, last: 1 })
    expect(wahl(container).map((b) => b.textContent)).toEqual(['Am Tag', '1 Tag vorher'])
    expect(gedrueckt(container)).toEqual(['1 Tag vorher'])
  })

  it('„Am Tag" setzt null Tage', () => {
    const { container, dispatch } = zeige({ ...STANDARD, last: 1 })
    tippe(container, 'Am Tag')
    expect(dispatch).toHaveBeenCalledWith({ type: 'setReminder', key: 'last', value: 0 })
  })

  it('„1 Tag vorher" setzt einen Tag', () => {
    const { container, dispatch } = zeige({ ...STANDARD, last: 0 })
    expect(gedrueckt(container)).toEqual(['Am Tag'])
    tippe(container, '1 Tag vorher')
    expect(dispatch).toHaveBeenCalledWith({ type: 'setReminder', key: 'last', value: 1 })
  })

  it('die schon gedrückte noch einmal: nichts zu speichern', () => {
    const { container, dispatch } = zeige({ ...STANDARD, last: 1 })
    tippe(container, '1 Tag vorher')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ein Bestandswert über einem Tag steht als dritte Möglichkeit da — gedrückt, damit man sieht, was gilt', () => {
    const { container, dispatch } = zeige({ ...STANDARD, last: 3 })
    expect(wahl(container).map((b) => b.textContent)).toEqual(['Am Tag', '1 Tag vorher', '3 Tage vorher'])
    expect(gedrueckt(container)).toEqual(['3 Tage vorher'])
    tippe(container, 'Am Tag')
    expect(dispatch).toHaveBeenCalledWith({ type: 'setReminder', key: 'last', value: 0 })
  })
})

describe('Sofort gemeldet', () => {
  const karte = (c: HTMLElement, name: string) => {
    const k = [...c.querySelectorAll<HTMLElement>('.karte')].find((x) => x.querySelector('.karte-titel')?.textContent === name)
    if (!k) throw new Error(`keine Karte „${name}"`)
    return k
  }
  const zeilen = (k: HTMLElement) =>
    [...k.querySelectorAll('.erin-meldung')].map((z) => [z.querySelector('.erin-meldung-titel')?.textContent, z.querySelector('.klein-text')?.textContent])

  it('drei Fälle, je mit denen, an die sie gehen — eine Absage an Admins und Planer, ein Ersatzgesuch nur bei Hilfsdiensten', () => {
    const { container } = zeige()
    expect(zeilen(karte(container, t.erinSofortGemeldet))).toEqual([
      [t.erinAbsage, t.erinAnPlaner],
      [t.notifErsatzGesucht, t.erinErsatzAn],
      [t.notifEntzug, t.erinEntzugAn],
    ])
    expect(t.erinErsatzAn).toContain('Hilfsdiensten')
  })

  it('Ersatzgesuch und Entzug heißen wie die Mitteilungen selbst — auch in der Sprache des Lesers', () => {
    const en = dict('en')
    const { container } = zeige(STANDARD, 'en')
    const titelDerZeilen = zeilen(karte(container, en.erinSofortGemeldet)).map(([name]) => name)
    expect(titelDerZeilen.slice(1)).toEqual(['Substitute needed', 'Assignment withdrawn'])
  })

  it('am Ende: E-Mails nur für Einladungen', () => {
    const { container } = zeige()
    expect(container.querySelector('.erin-fuss')?.textContent).toBe(t.erinMailNur)
  })
})

describe('In jeder Sprache', () => {
  beforeAll(async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
  })

  /*
   * Eine Möglichkeit der Wahl steht für sich, nicht mitten im Satz — sie beginnt
   * groß. `remVorher` („{dauer} vorher") taugt dafür nicht überall: Russisch
   * beginnt mit „за", und in Swahili beginnt schon die Dauer aus Intl mit einem
   * Wort („siku 1"). Deshalb die eigenen Fassungen `…Option`.
   */
  it('jede Möglichkeit der letzten Erinnerung beginnt groß — oder in einer Schrift ohne Groß und Klein', () => {
    const klein: string[] = []
    let geprueft = 0
    for (const { code } of APP_LANGS) {
      // Mit einem Bestandswert über einem Tag: dann stehen alle drei Formen da.
      const { container } = zeige({ ...STANDARD, last: 3 }, code)
      const gruppe = within(container).getByRole('group', { name: dict(code).remLetzte })
      for (const knopf of within(gruppe).getAllByRole('button')) {
        const text = knopf.textContent ?? ''
        const erstes = [...text][0] ?? ''
        if (erstes !== erstes.toLocaleUpperCase(code)) klein.push(`${code}: ${text}`)
        geprueft++
      }
      cleanup()
    }
    expect(klein).toEqual([])
    // Gegenprobe: Jede Sprache zeigte ihre drei Möglichkeiten — sonst prüfte die Schleife ins Leere.
    expect(geprueft).toBe(APP_LANGS.length * 3)
  })
})
