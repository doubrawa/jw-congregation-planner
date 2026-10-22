/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { DashboardScreen } from '../dashboard/DashboardScreen'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { deutschFinder, sichtbareTexte } from '../../tests/deutsch-erkennen'
import type { Lang } from '../data/types'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { ErsteSchritteFilm } from './ErsteSchritteFilm'
import { ErsteSchritteKarte, ErsteSchritteKnopf, WEG_KEY } from './ErsteSchritteKarte'
import { WORTE } from './film-szenen'
import { GESAMT, SZENEN, szenenBeginn, type SzenenId } from './film-zeit'

/**
 * **Erste Schritte: die Karte auf Start und der Film** (22.10.2026).
 *
 * Wer neu ist, findet oben auf Start eine Karte, die einen Film von knapp einer
 * Minute zeigt: Link antippen, Aufgabe bestätigen, die App aufs Handy holen,
 * Erinnerungen einschalten. Verteidigt wird hier, was ein Verkündiger davon
 * merkt:
 *
 *  - Die Karte **geht für immer**, sobald der Film einmal ganz gesehen ist oder
 *    das ✕ sie wegklickt — aber nicht, wenn jemand den Film nur anfängt.
 *  - Der Film läuft von selbst, lässt sich **anhalten** (eine Bewegung über
 *    fünf Sekunden braucht eine Pause) und nochmal ansehen. **Ohne Bewegung**
 *    läuft nichts von selbst — dann blättert man Schritt für Schritt.
 *  - Er schließt **wie ein Blatt**: ✕, Escape, Zurück.
 *  - Seine Worte **zitieren die Knöpfe der App wörtlich**, in jeder Sprache —
 *    wer „Bestätigen" sucht, soll auch „Bestätigen" lesen. Und in einer fremden
 *    Sprache rutscht kein deutsches Wort durch (T123).
 *
 * Die Bewegung selbst rechnet jsdom nicht (kein Layout); dass sie ohne Sprung
 * läuft, ist im Browser gemessen. Hier zählt, was zu welcher Zeit dasteht.
 */

const de = dict('de')
const FREMD = APP_LANGS.map((l) => l.code).filter((c): c is Exclude<Lang, 'de'> => c !== 'de')

// Erfundene Namen: In einer fremden Sprache darf nichts Deutsches stehen, auch
// nicht der Name einer Versammlung, der nach deutschem Ort klingt.
const VERSAMMLUNG = 'Xavelo'
const VORNAME = 'Xabebo'

let wenigerBewegung = false

beforeAll(async () => {
  await Promise.all(FREMD.map((code) => loadOverlay(code)))
})

beforeEach(() => {
  localStorage.clear()
  wenigerBewegung = false
  window.matchMedia = vi.fn((abfrage: string) => ({
    matches: abfrage === '(prefers-reduced-motion: reduce)' && wenigerBewegung,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  // Die Proben lassen die Uhr vorlaufen — und mit ihr die Bilder des Films.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function zustand(over: Partial<AppState> = {}): AppState {
  const basis = demoZustand()
  const ich = basis.persons[0]!
  return {
    ...basis,
    planner: false,
    zuteiler: false,
    personId: ich.id,
    persons: basis.persons.map((p) => (p.id === ich.id ? { ...p, fn: VORNAME } : p)),
    congregation: { ...basis.congregation, name: VERSAMMLUNG },
    ...over,
  }
}

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

const zeige = (inhalt: ReactNode, over: Partial<AppState> = {}) => render(<Buehne state={zustand(over)}>{inhalt}</Buehne>)

/** Der Film läuft so viele Sekunden weiter. */
const vorspulen = (sekunden: number) => act(() => vi.advanceTimersByTime(sekunden * 1000))

const film = () => screen.queryByRole('dialog', { name: de.ersteSchritte })
const ansage = () => document.querySelector('[data-f="ansage"]')?.textContent ?? ''
const knopf = (text: string) => screen.queryAllByRole('button').find((b) => b.textContent === text)
const karte = () => document.querySelector('.erste-schritte-karte')

/** Die Worte einer Szene, wie der Film sie schreibt. */
const worte = (id: SzenenId) => document.querySelector(`[data-f="worte-${id}"]`)?.textContent ?? ''

describe('Die Karte auf Start', () => {
  it('steht oben auf Start, wer neu ist — „Ansehen" öffnet den Film', () => {
    zeige(<DashboardScreen />)
    expect(karte()?.textContent).toContain(de.ersteSchritte)
    expect(karte()?.textContent).toContain(de.ersteSchritteKarte)
    // Vor der großen Karte der nächsten Aufgabe: Wer neu ist, soll sie sehen.
    const spalte = document.querySelector('.start-spalte')
    expect(spalte?.firstElementChild).toBe(karte())
    expect(film()).toBeNull()
    fireEvent.click(knopf(de.ersteSchritteAnsehen)!)
    expect(film()).not.toBeNull()
  })

  it('das ✕ nimmt sie für immer von diesem Gerät — auch nach dem nächsten Öffnen der App', () => {
    const { unmount } = zeige(<DashboardScreen />)
    fireEvent.click(screen.getByRole('button', { name: de.pushKarteWeg }))
    expect(karte()).toBeNull()
    expect(localStorage.getItem(WEG_KEY)).toBe('1')
    unmount()
    zeige(<DashboardScreen />)
    expect(karte()).toBeNull()
  })

  it('wer den Film ganz gesehen hat, findet sie nicht mehr', () => {
    const { unmount } = zeige(<ErsteSchritteKarte />)
    fireEvent.click(knopf(de.ersteSchritteAnsehen)!)
    vorspulen(GESAMT + 1)
    expect(knopf(de.ersteSchritteNochmal)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: de.a11yClose }))
    expect(karte()).toBeNull()
    unmount()
    zeige(<ErsteSchritteKarte />)
    expect(karte()).toBeNull()
  })

  it('wer ihn vorher schließt, findet sie wieder — gesehen hat er ihn ja nicht', () => {
    zeige(<ErsteSchritteKarte />)
    fireEvent.click(knopf(de.ersteSchritteAnsehen)!)
    vorspulen(5)
    fireEvent.click(screen.getByRole('button', { name: de.a11yClose }))
    expect(film()).toBeNull()
    expect(karte()).not.toBeNull()
    expect(localStorage.getItem(WEG_KEY)).toBeNull()
  })

  it('ohne Speicher (privates Fenster) geht sie trotzdem — bis die App neu lädt', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('voll')
    })
    zeige(<ErsteSchritteKarte />)
    fireEvent.click(screen.getByRole('button', { name: de.pushKarteWeg }))
    expect(karte()).toBeNull()
  })
})

describe('Im Profil', () => {
  it('bleibt der Film abrufbar, auch wenn die Karte auf Start fort ist', () => {
    localStorage.setItem(WEG_KEY, '1')
    zeige(<ErsteSchritteKnopf />)
    fireEvent.click(knopf(de.ersteSchritte)!)
    expect(film()).not.toBeNull()
  })

  it('wer ihn dort ganz sieht, findet auch die Karte auf Start nicht mehr', () => {
    zeige(<ErsteSchritteKnopf />)
    fireEvent.click(knopf(de.ersteSchritte)!)
    vorspulen(GESAMT + 1)
    expect(localStorage.getItem(WEG_KEY)).toBe('1')
  })
})

describe('Der Film', () => {
  it('läuft von selbst, Szene für Szene — Vorleseprogramme hören die Worte der laufenden', () => {
    zeige(<ErsteSchritteFilm onClose={() => {}} />)
    expect(ansage()).toContain(de.ersteSchritte)
    let gelaufen = 0
    for (const [i, szene] of SZENEN.entries()) {
      if (i === 0) continue
      // Ein Zehntel in die Szene hinein: Der Film rechnet in ganzen Bildern.
      vorspulen(szenenBeginn(i) + 0.1 - gelaufen)
      gelaufen = szenenBeginn(i) + 0.1
      expect(ansage(), szene.id).toContain(worte(szene.id).slice(0, 12))
    }
  })

  it('sagt jeden Schritt mit seiner Nummer an, von 1 bis 4 — Zeile für Zeile, nicht zusammengeklebt', () => {
    zeige(<ErsteSchritteFilm onClose={() => {}} />)
    const schritte = ['link', 'aufgabe', 'installieren', 'erinnern'] as const
    schritte.forEach((id, i) => {
      expect(worte(id)).toContain(fill(de.ersteSchritteSchritt, { n: i + 1, m: 4 }))
    })
    vorspulen(szenenBeginn(1) + 0.1)
    expect(ansage()).toContain(`${fill(de.ersteSchritteSchritt, { n: 1, m: 4 })} ${de.ersteSchritteLinkTitel}`)
  })

  it('hält an und läuft weiter — und am Ende „Nochmal ansehen", das von vorn beginnt', () => {
    const onEnde = vi.fn()
    zeige(<ErsteSchritteFilm onClose={() => {}} onEnde={onEnde} />)
    vorspulen(szenenBeginn(1) + 0.5)
    fireEvent.click(knopf(de.ersteSchrittePause)!)
    const stand = ansage()
    vorspulen(20)
    expect(ansage(), 'angehalten steht der Film').toBe(stand)
    fireEvent.click(knopf(de.ersteSchritteAbspielen)!)
    vorspulen(GESAMT)
    expect(onEnde).toHaveBeenCalledTimes(1)
    fireEvent.click(knopf(de.ersteSchritteNochmal)!)
    expect(knopf(de.ersteSchrittePause)).toBeDefined()
    expect(ansage()).toContain(de.ersteSchritte)
    vorspulen(GESAMT + 1)
    // Das Ende zählt einmal: Die Karte geht, sie geht nicht zweimal.
    expect(onEnde).toHaveBeenCalledTimes(1)
  })

  it('in einem Halt zum Lesen steht die Szene, aber das Bild ruht nicht ganz — das Handy steigt weiter', () => {
    zeige(<ErsteSchritteFilm onClose={() => {}} />)
    const i = SZENEN.findIndex((s) => s.id === 'installieren')
    const [halt] = (SZENEN[i]?.halte ?? []) as ReadonlyArray<readonly [number, number]>
    const handy = () => document.querySelector<HTMLElement>('[data-f="ebene-installieren"] [data-f="handy"]')?.style.transform ?? ''
    const menue = () => document.querySelector<HTMLElement>('[data-f="ebene-installieren"] [data-f="menue"]')?.style.opacity ?? ''
    // Mitten in den ersten Halt der Szene: das Menü des Browsers ist offen.
    vorspulen(szenenBeginn(i) + (halt?.[0] ?? 0) + 0.3)
    const [handyVorher, menueVorher] = [handy(), menue()]
    vorspulen(1)
    expect(menue(), 'die Szene steht').toBe(menueVorher)
    expect(handy(), 'das Handy steigt').not.toBe(handyVorher)
  })

  it('ohne Bewegung läuft nichts von selbst: Schritt für Schritt, am Ende „Fertig"', () => {
    wenigerBewegung = true
    const onEnde = vi.fn()
    const onClose = vi.fn()
    zeige(<ErsteSchritteFilm onClose={onClose} onEnde={onEnde} />)
    expect(knopf(de.ersteSchrittePause)).toBeUndefined()
    expect(knopf(de.ersteSchritteZurueck)?.hasAttribute('disabled')).toBe(true)
    vorspulen(GESAMT + 1)
    expect(ansage(), 'nach der ganzen Länge des Films noch beim Titel').toContain(de.ersteSchritte)
    for (const szene of SZENEN.slice(1)) {
      fireEvent.click(knopf(de.ersteSchritteWeiter)!)
      expect(ansage(), szene.id).toContain(worte(szene.id).slice(0, 12))
    }
    fireEvent.click(knopf(de.ersteSchritteZurueck)!)
    expect(ansage()).toContain(de.ersteSchritteErinnernTitel)
    fireEvent.click(knopf(de.ersteSchritteWeiter)!)
    expect(onEnde).not.toHaveBeenCalled()
    fireEvent.click(knopf(de.fertig)!)
    expect(onEnde).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('schließt wie ein Blatt: mit ✕ und mit Escape (Zurück: film-zurueck.test.tsx)', () => {
    const onClose = vi.fn()
    zeige(<ErsteSchritteFilm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: de.a11yClose }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('der Fokus steht im Film, und das Bild ist für Vorleseprogramme verborgen', () => {
    zeige(<ErsteSchritteFilm onClose={() => {}} />)
    expect(film()?.contains(document.activeElement)).toBe(true)
    expect(document.querySelector('.film-bild')?.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('.film-punkte')?.getAttribute('aria-hidden')).toBe('true')
    // Das ✕ liegt über dem Bild, aber nicht in ihm: Vorleseprogramme finden es.
    expect(screen.getByRole('button', { name: de.a11yClose }).closest('[aria-hidden="true"]')).toBeNull()
    // Im Bild ist kein Knopf echt: nichts, das man antippen oder anspringen könnte.
    expect(document.querySelectorAll('.film-bild button, .film-bild a, .film-bild input')).toHaveLength(0)
  })
})

describe('In jeder Sprache', () => {
  it.each(APP_LANGS.map((l) => l.code))('%s: die Worte zitieren die Knöpfe der App wörtlich', (lang) => {
    const d = dict(lang)
    zeige(<ErsteSchritteFilm onClose={() => {}} />, { lang })
    expect(worte('aufgabe')).toContain(d.bestaetigen)
    expect(worte('aufgabe')).toContain(d.kannNicht)
    expect(worte('installieren')).toContain(d.appInstallieren)
    expect(worte('installieren')).toContain(d.codeEintippen)
    expect(worte('erinnern')).toContain(d.pushAktivieren)
    // … und der Knopf im Bild heißt so, wie der Satz ihn nennt.
    const bild = document.querySelector('[data-szene="aufgabe"] [data-f="bestaetigen"]')
    expect(bild?.textContent).toBe(d.bestaetigen)
    expect(document.querySelector('[data-szene="installieren"] [data-f="wahl"]')?.textContent).toBe(d.appInstallieren)
    expect(document.querySelector('[data-szene="erinnern"] [data-f="aktivieren"]')?.textContent).toBe(d.pushAktivieren)
  })

  it.each(APP_LANGS.map((l) => l.code))('%s: jede Szene steht so lange, wie man ihre Worte liest', (lang) => {
    // Betreiber am 22.10.2026: „das geht etwas zu schnell. bitte langsamer".
    // Gemessen wie bei Untertiteln: 20 Zeichen je Sekunde. Zum Lesen bleibt
    // die Zeit vom ersten Wort bis zum Ende des letzten Halts der Szene — mit
    // den Halten dazwischen, in denen das Bild stillsteht. Der letzte Halt
    // liegt nach allen Worten (film-szenen.test.ts); danach gehen sie.
    const ZEICHEN_JE_SEKUNDE = 20
    zeige(<ErsteSchritteFilm onClose={() => {}} />, { lang })
    for (const szene of SZENEN) {
      const z = WORTE[szene.id]
      const halte = szene.halte as ReadonlyArray<readonly [number, number]>
      const letzter = halte.at(-1)
      if (!letzter) continue // das Ende: Es bleibt stehen, bis man den Film schließt
      const zeit = letzter[0] - z.titel + halte.reduce((s, [, d]) => s + d, 0)
      const zeichen = worte(szene.id).length
      expect(zeit, `${lang} ${szene.id}: ${zeichen} Zeichen`).toBeGreaterThanOrEqual(zeichen / ZEICHEN_JE_SEKUNDE)
    }
  })

  it.each(FREMD)('%s: kein deutsches Wort im Film', (lang) => {
    // Lateinisch dürfen stehen: die erfundenen Namen oben. Gerät und Browser
    // („iPhone", „Safari") erlaubt `deutsch-erkennen.ts` selbst.
    const erlaubt = new Set([VORNAME, VERSAMMLUNG])
    zeige(<ErsteSchritteFilm onClose={() => {}} />, { lang })
    const finde = deutschFinder(lang, erlaubt)
    const reste = sichtbareTexte(film() ?? document.body).flatMap(finde)
    expect(reste).toEqual([])
  })
})
