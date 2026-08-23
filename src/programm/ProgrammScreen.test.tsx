/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { syncAuxSlots } from '../data/aux-class'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG } from '../data/constants'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { PartItem, Person, Section, Service, Week } from '../data/types'
import { ProgrammScreen } from './ProgrammScreen'

/**
 * **Das Programm — der Bildschirm, den man im Saal aufschlägt.**
 *
 * Er zeigt nichts an, was er nicht aus den Daten rechnet, und genau darin
 * liegen die Regeln:
 *
 * - Der **Termin** wird gerechnet, nicht aus `meeting.date` gelesen:
 *   importierte Wochen tragen dort nur die Wochenspanne („7.–13. September").
 * - Der **DU-Chip** entscheidet über `gehoertZu` — erst die Person-Id, dann der
 *   Name. Der bloße Namensvergleich gab ihn an beide Namensgleichen und an
 *   einen Verkündiger, der zufällig hieß wie der Gastredner.
 * - Ob es eine **Zusätzliche Klasse** gibt, steht in den Wochendaten, nicht am
 *   Schalter: Beim Ausschalten bleiben die Namen in `item.aux` stehen, und das
 *   Programm zeigte danach weiter beide Räume.
 * - **Hilfsdienste** füllen bis zur eingestellten Platzzahl auf — offene Plätze
 *   stehen als „offen" da, statt einfach zu fehlen.
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}
const NAMENSVETTER: Person = { ...ICH, id: 'p-z' }

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

function abschnitte(): Section[] {
  return [
    {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ title: 'Lied 12 · Gebet · Einleitende Worte', meta: '', names: [{ name: '', rolle: 'Vorsitz' }] }],
    },
    {
      label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
      items: [
        { num: 1, title: 'Schätze', meta: '10 Min.', names: [{ name: 'Wer Anders', pid: 'p-x' }] },
        { num: 3, title: 'Bibellesung', meta: '4 Min.', names: [{ name: '', bereichsKey: 'bibellesung' }] },
      ],
    },
    { label: LABEL_ABSCHLUSS, farbe: 'neutral', items: [{ title: 'Lied 99 · Gebet', meta: '', names: [{ name: '', rolle: 'Gebet' }] }] },
  ]
}

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07', current: false,
    mid: { date: '7.–13. September', end: '20:45', sections: abschnitte(), helpers: { mik: [] } },
    we: { date: '7.–13. September', end: '11:45', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'programm', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH, NAMENSVETTER], services: DIENSTE, groups: [], absences: [],
    weeks: [woche()], fsWeeks: [[]], fsRules: [], week: 0,
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <ProgrammScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/** Nur die mittlere (aktuelle) Woche des Streifens — die Nachbarn zeigen dasselbe. */
const seite = (c: HTMLElement): HTMLElement =>
  (c.querySelector('.week-page:not(.week-page--vor):not(.week-page--nach)') as HTMLElement) ?? c
const texte = (c: HTMLElement, sel: string) => [...seite(c).querySelectorAll(sel)].map((x) => x.textContent ?? '')

afterEach(cleanup)

describe('Kopf und Navigation', () => {
  it('nennt Wochenbereich und Bibelbuch', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.prog-week-range')?.textContent).toBe('7.–13. September')
    expect(seite(container).querySelector('.prog-week-book')?.textContent).toBe('JEREMIA 32')
  })

  it('blättert vor und zurück', () => {
    const { container, dispatch } = zeige({ weeks: [woche(), woche()], week: 0 })
    const pfeile = [...seite(container).querySelectorAll('.week-arrow')]
    fireEvent.click(pfeile[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'nextWeek' })
  })

  it('am Rand steht die Navigation still', () => {
    const { container } = zeige()
    const pfeile = [...seite(container).querySelectorAll<HTMLButtonElement>('.week-arrow')]
    expect(pfeile.every((b) => b.disabled)).toBe(true)
  })

  it('drei Reiter: unter der Woche, Wochenende, Treffpunkte', () => {
    const { container } = zeige()
    const reiter = [...seite(container).querySelectorAll('.prog-tabs button')].map((b) => b.textContent)
    expect(reiter).toHaveLength(3)
  })

  it('der Reiter-Wechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    const reiter = [...seite(container).querySelectorAll('.prog-tabs button')]
    fireEvent.click(reiter[1]!)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'setTab')).toBe(true)
  })
})

describe('Der Termin wird gerechnet, nicht abgelesen', () => {
  it('aus der bloßen Wochenspanne wird der echte Termin', () => {
    // Importierte Wochen tragen im date-Feld nur „7.–13. September".
    const { container } = zeige()
    const meta = seite(container).querySelector('.prog-meta')?.textContent ?? ''
    expect(meta).not.toBe('7.–13. September')
    expect(meta).toContain('8. September') // Dienstag der Woche
    expect(meta).toContain('19:00')
  })

  it('ein eigener Termin der Woche schlägt den Rhythmus (Gedächtnismahl)', () => {
    const w = woche()
    w.mid.date = 'Freitag, 11. September · 19:30'
    const { container } = zeige({ weeks: [w] })
    const meta = seite(container).querySelector('.prog-meta')?.textContent ?? ''
    expect(meta).toContain('11. September')
    expect(meta).toContain('19:30')
  })

  it('der Wochentag muss dabei ausgeschrieben sein — die Kurzform gilt nicht als Termin', () => {
    // Der Formatvertrag der Wochendaten (`meetingDateParts`) kennt nur
    // ausgeschriebene Tage. Stünde dort „Fr", übernähme die Anzeige die
    // Uhrzeit, den Tag aber weiter aus dem Rhythmus — Dienstag, 19:30. Alles,
    // was die App selbst schreibt, ist ausgeschrieben (`WOCHENTAGE`); der Fall
    // steht hier, damit ein von Hand oder aus fremder Quelle gefülltes Feld
    // nicht unbemerkt einen falschen Tag anzeigt.
    const w = woche()
    w.mid.date = 'Fr, 11. September · 19:30'
    const { container } = zeige({ weeks: [w] })
    const meta = seite(container).querySelector('.prog-meta')?.textContent ?? ''
    expect(meta).toContain('8. September') // Dienstag aus den Einstellungen
    expect(meta).toContain('19:30') // die Uhrzeit wird sehr wohl übernommen
  })

  it('am Wochenende gilt dessen Wochentag', () => {
    const { container } = zeige({ tab: 'we' })
    const meta = seite(container).querySelector('.prog-meta')?.textContent ?? ''
    expect(meta).toContain('13. September') // Sonntag der Woche
    expect(meta).toContain('10:00')
  })
})

describe('Das Programm selbst', () => {
  it('jeder Bereich wird zu einem Panel in seiner Farbe', () => {
    const { container } = zeige()
    const panels = [...seite(container).querySelectorAll('.panel[data-farbe]')]
    const farben = panels.map((p) => p.getAttribute('data-farbe'))
    expect(farben).toContain('petrol')
    expect(farben).toContain('neutral')
  })

  it('nummerierte Punkte tragen ihre Nummer, unnummerierte nicht', () => {
    const { container } = zeige()
    expect(texte(container, '.prog-num')).toEqual(['1.', '3.'])
  })

  it('ein offener Platz steht als solcher da — er fehlt nicht einfach', () => {
    const { container } = zeige()
    expect(texte(container, '.prog-name')).toContain(t.offenDash)
  })

  it('das Lied wird aus dem Eröffnungs-Sammeltitel herausgezogen', () => {
    const { container } = zeige()
    const lieder = texte(container, '.panel-song')
    expect(lieder).toContain('Lied 12')
    // Der Rest des Titels bleibt als Punkt stehen.
    expect(texte(container, '.prog-title').join(' | ')).toContain('Gebet · Einleitende Worte')
  })

  it('im Abschluss ebenso — dort steht das Lied vorn im Sammeltitel', () => {
    const { container } = zeige()
    expect(texte(container, '.panel-song')).toContain('Lied 99')
  })

  it('die Fußzeile nennt das Ende und den Stand von heute', () => {
    const { container } = zeige()
    const fuss = texte(container, '.prog-footer span')
    expect(fuss[0]).toBe('20:45')
    expect(fuss[1]).toContain('Stand:')
  })

  it('„Drucken" ruft den Druck des Browsers', () => {
    const print = vi.fn()
    window.print = print
    const { container } = zeige()
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    expect(print).toHaveBeenCalled()
  })

  it('der Ausdruck trägt einen eigenen Kopf — Reiter und Navigation fehlen dort', () => {
    const { container } = zeige()
    const kopf = seite(container).querySelector('.prog-print-head')!
    expect(kopf.textContent).toContain('Nordheim')
    expect(kopf.textContent).toContain(t.tabMid)
  })
})

describe('Der DU-Chip: Id vor Name', () => {
  const mitMir = (pid: string | undefined, name = 'Anton Alt') => {
    const w = woche()
    ;(w.mid.sections[1]!.items[0] as PartItem).names[0] = { name, pid }
    return w
  }

  it('steht an der eigenen Zuteilung', () => {
    const { container } = zeige({ weeks: [mitMir('p-a')] })
    expect(seite(container).querySelectorAll('.chip-du')).toHaveLength(1)
  })

  it('nicht an der des Namensvetters — die Id entscheidet', () => {
    const { container } = zeige({ weeks: [mitMir('p-z')] })
    expect(seite(container).querySelector('.chip-du')).toBeNull()
  })

  it('ohne Id (Altdaten) zählt weiter der Name', () => {
    const { container } = zeige({ weeks: [mitMir(undefined)] })
    expect(seite(container).querySelectorAll('.chip-du')).toHaveLength(1)
  })

  it('ohne eigene Person steht er nirgends', () => {
    const { container } = zeige({ weeks: [mitMir('p-a')], personId: null })
    expect(seite(container).querySelector('.chip-du')).toBeNull()
  })
})

describe('Die Zusätzliche Klasse steht als zweiter Raum darunter', () => {
  const mitKlasse = () => {
    const w = woche()
    ;(w.mid.sections[1]!.items[1] as PartItem).names[0]!.bereichsKey = 'bibellesung'
    return syncAuxSlots([w], true)
  }

  it('beide Räume mit ihrer Überschrift', () => {
    const { container } = zeige({ weeks: mitKlasse(), auxClass: true })
    expect(texte(container, '.prog-raum')).toEqual([t.auxHauptsaal, t.auxKlasse])
  })

  it('der Ratgeber bekommt eine eigene Zeile hinter dem Programm', () => {
    const weeks = mitKlasse()
    weeks[0]!.mid.auxRatgeber = { name: 'Anton Alt', pid: 'p-a' }
    const { container } = zeige({ weeks, auxClass: true })
    const panels = [...seite(container).querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(panels).toContain(t.auxKlassen)
  })

  it('der Ratgeber-Titel steht in der Sprache des Lesers, nicht der Versammlung', () => {
    // Bei deutscher App und englischer Versammlungssprache stand hier
    // „Counselor" unter der deutschen Überschrift.
    const weeks = mitKlasse()
    weeks[0]!.mid.auxRatgeber = { name: 'Anton Alt', pid: 'p-a' }
    const { container } = zeige({ weeks, auxClass: true })
    const klasse = [...seite(container).querySelectorAll('.panel')].find(
      (p) => p.querySelector('.panel-label')?.textContent === t.auxKlassen,
    )!
    expect(klasse.querySelector('.prog-title')?.textContent).toBe(t.auxRatgeber)
  })

  it('nach dem Ausschalten steht nur noch der Hauptsaal da — obwohl die Namen bleiben', () => {
    // Entschieden wird über die Wochendaten, nicht über den Schalter.
    const aus = syncAuxSlots(mitKlasse(), false)
    const { container } = zeige({ weeks: aus, auxClass: false })
    expect(texte(container, '.prog-raum')).toEqual([])
  })
})

describe('Die Hilfsdienst-Übersicht', () => {
  it('füllt bis zur eingestellten Platzzahl auf — der Rest steht als „offen"', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: 'Anton Alt' }]
    const { container } = zeige({ weeks: [w] })
    expect(seite(container).querySelector('.prog-helper-names')?.textContent).toBe(
      `Anton Alt · ${t.offenWort}`,
    )
  })

  it('mehr Einträge als Plätze werden abgeschnitten — die Einstellung gilt', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const { container } = zeige({ weeks: [w] })
    expect(seite(container).querySelector('.prog-helper-names')?.textContent).toBe('A · B')
  })

  it('der Dienstname steht in Großbuchstaben — wie im Arbeitsheft', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.prog-helper-label')?.textContent).toBe('MIKROFONE')
  })

  it('ganz ohne Zuteilung stehen alle Plätze offen', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.prog-helper-names')?.textContent).toBe(
      `${t.offenWort} · ${t.offenWort}`,
    )
  })
})

describe('Ohne geladene Woche', () => {
  it('steht der Hinweis auf den Import statt eines weißen Bildschirms', () => {
    const { container } = zeige({ weeks: [] })
    expect(container.textContent).toContain(t.keineWochenTitel)
    expect(container.textContent).toContain(t.keineWochenHinweis)
  })
})
