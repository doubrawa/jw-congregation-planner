/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
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
import type { FsInstance, PartItem, Person, Section, Service, Week } from '../data/types'
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
      items: [{ iid: 'i108', title: 'Lied 12 · Gebet · Einleitende Worte', meta: '', names: [{ name: '', rolle: 'Vorsitz' }] }],
    },
    {
      label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
      items: [
        { iid: 'i107', num: 1, title: 'Schätze', meta: '10 Min.', names: [{ name: 'Wer Anders', pid: 'p-x' }] },
        { iid: 'i106', num: 3, title: 'Bibellesung', meta: '4 Min.', names: [{ name: '', bereichsKey: 'bibellesung' }] },
      ],
    },
    { label: LABEL_ABSCHLUSS, farbe: 'neutral', items: [{ iid: 'i105', title: 'Lied 99 · Gebet', meta: '', names: [{ name: '', rolle: 'Gebet' }] }] },
  ]
}

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07', 
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
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
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

/**
 * Nur die mittlere (aktuelle) Woche des Streifens. Die Nachbarn sind Vorschau
 * (`inert`) und stehen im DOM **vor** ihr — wer einfach den ersten Knopf nimmt,
 * klickt in die vorige Woche. Hier stand bis zum 21.9.2026 ein Selektor auf
 * `.week-page`, den die mittlere Woche gar nicht trägt: Er fiel still auf den
 * ganzen Streifen zurück und ging nur gut, solange kein Test eine Vorwoche hatte.
 */
const seite = (c: HTMLElement): HTMLElement => (c.querySelector('.week-strip > .screen') as HTMLElement) ?? c
const texte = (c: HTMLElement, sel: string) => [...seite(c).querySelectorAll(sel)].map((x) => x.textContent ?? '')
/** Die Einträge der aufgeklappten Druck-Auswahl (T105). */
const optionen = (c: HTMLElement) => [...seite(c).querySelectorAll<HTMLButtonElement>('.druck-menue .druck-option')]

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

  it('eine Abweichung der Woche schlägt den Rhythmus (Gedächtnismahl)', () => {
    const w = woche()
    w.dev = { mid: { wd: 5, time: '19:30' } } // Freitag, 11.9.
    const { container } = zeige({ weeks: [w] })
    const meta = seite(container).querySelector('.prog-meta')?.textContent ?? ''
    expect(meta).toContain('11. September')
    expect(meta).toContain('19:30')
  })

  it('aus dem Anzeigetext im date-Feld wird kein Termin mehr gelesen', () => {
    /*
      Hier stand die Gegenprobe zu einem Formatvertrag: Das `date`-Feld durfte
      einen eigenen Termin tragen, aber nur mit **ausgeschriebenem** Wochentag
      („Freitag"); eine Kurzform („Fr") ergab den Tag aus dem Rhythmus und die
      Uhrzeit aus dem Feld — eine Mischung, die niemand eingetragen hatte.

      Genau diese Rückleserei ist mit T105 weg. Das Feld ist Anzeigetext; was
      abweicht, sagt die `Abweichung`. Der Fall bleibt als Probe stehen: Egal,
      was im Feld steht, gerechnet wird der Rhythmus.
    */
    const w = woche()
    w.mid.date = 'Freitag, 11. September · 19:30'
    const { container } = zeige({ weeks: [w] })
    const meta = seite(container).querySelector('.prog-meta')?.textContent ?? ''
    expect(meta).toContain('8. September') // Dienstag aus dem Rhythmus
    expect(meta).toContain('19:00')
    expect(meta).not.toContain('19:30')
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

  it('„Drucken" → „Diese Woche" ruft den Druck des Browsers', () => {
    const print = vi.fn()
    window.print = print
    const { container } = zeige()
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    fireEvent.click(optionen(container)[0]!)
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

  /*
   * **Der Platz zählt, nicht die Reihenfolge der Einträge.**
   *
   * Gefiltert wurde zuerst („leere Namen weg") und erst danach abgeschnitten.
   * Das rückte die Besetzung nach vorn — und zeigte im schlimmsten Fall einen
   * Namen, den es gar nicht mehr gibt: Reduziert der Planer die Platzzahl,
   * bleiben die Namen dahinter in den Wochendaten stehen (bewusst, siehe
   * `helperWorkload`). Das Programmblatt nannte dann jemanden, den die
   * Aufgabenliste, die Auslastung und der Planen-Screen längst nicht mehr
   * kennen — eine Zuteilung, von der nur dieses eine Blatt weiß.
   */
  it('ein offener erster Platz bleibt an seiner Stelle', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: '' }, { name: 'Anton Alt' }]
    const { container } = zeige({ weeks: [w] })
    expect(seite(container).querySelector('.prog-helper-names')?.textContent).toBe(
      `${t.offenWort} · Anton Alt`,
    )
  })

  it('ein Name hinter der Platzzahl wird nicht nach vorn gezogen', () => {
    // Zwei Plätze auf einen reduziert; besetzt war nur der zweite. Der Dienst
    // hat damit genau einen Platz, und der ist offen.
    const w = woche()
    w.mid.helpers.mik = [{ name: '' }, { name: 'Anton Alt' }]
    const { container } = zeige({
      weeks: [w],
      services: [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }],
    })
    expect(seite(container).querySelector('.prog-helper-names')?.textContent).toBe(t.offenWort)
  })
})

describe('Ohne geladene Woche', () => {
  it('steht der Hinweis auf den Import statt eines weißen Bildschirms', () => {
    const { container } = zeige({ weeks: [] })
    expect(container.textContent).toContain(t.keineWochenTitel)
    expect(container.textContent).toContain(t.keineWochenHinweis)
  })
})

/**
 * **Drucken: die angezeigte Woche oder der ganze Monat** (T105).
 *
 * Für den Aushang will der Planer den Monat am Stück — wahlweise, nicht statt
 * der Woche. Zum Monat gehört jede Woche, deren **Montag** in ihm liegt (die
 * Woche vom 28. September hängt auf dem September-Blatt, die vom 5. Oktober
 * nicht). Gedruckt wird jede Woche mit demselben Baustein wie die einzelne;
 * welches Regelwerk im Druck gilt, sagt das Kennzeichen `data-print`.
 */
describe('Drucken: diese Woche oder der ganze Monat', () => {
  /** Sechs Wochen um den September 2026: je eine im August und im Oktober. */
  const MONTAGE = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
  const wochen = () => MONTAGE.map((start) => woche({ start, range: `Woche ab ${start}` }))
  const leer = () => MONTAGE.map((): FsInstance[] => [])

  let print = vi.fn()
  beforeEach(() => {
    print = vi.fn()
    window.print = print
  })
  afterEach(() => {
    delete document.documentElement.dataset.print
  })

  type ImDruck = { kennzeichen?: string; wochen: string[]; kopf: string; seitenweise: boolean }

  /** Druckt den Monat und hält fest, was im Moment des Druckens im DOM stand. */
  function monatDrucken(container: HTMLElement): ImDruck {
    const imDruck: ImDruck = { wochen: [], kopf: '', seitenweise: false }
    print.mockImplementation(() => {
      imDruck.kennzeichen = document.documentElement.dataset.print
      imDruck.wochen = [...container.querySelectorAll('.monat-woche .prog-week-range')].map((e) => e.textContent ?? '')
      imDruck.kopf = container.querySelector('.monat-kopf')?.textContent ?? ''
      imDruck.seitenweise = container.querySelector('.monat-druck')?.classList.contains('monat-druck--seitenweise') ?? false
    })
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    fireEvent.click(optionen(container)[1]!)
    return imDruck
  }

  it('der Knopf klappt die Wahl auf, statt gleich zu drucken', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    const knopf = seite(container).querySelector<HTMLButtonElement>('.prog-print-btn')!
    fireEvent.click(knopf)
    expect(print).not.toHaveBeenCalled()
    expect(knopf.getAttribute('aria-expanded')).toBe('true')
    expect(optionen(container).map((o) => o.textContent)).toEqual([
      t.druckWoche,
      t.druckMonat.replace('{monat}', 'September 2026'),
    ])
  })

  it('„Diese Woche" druckt ohne Kennzeichen — auch wenn eins stehen geblieben ist', () => {
    // Ein abgebrochener Druck vorher (kein `afterprint`) ließe sonst den
    // Wochen-Ausdruck still als Monat oder Zettelbogen herauskommen.
    document.documentElement.dataset.print = 'monat'
    let kennzeichen: string | undefined = 'nicht gedruckt'
    print.mockImplementation(() => {
      kennzeichen = document.documentElement.dataset.print
    })
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    fireEvent.click(optionen(container)[0]!)
    expect(print).toHaveBeenCalledTimes(1)
    expect(kennzeichen).toBeUndefined()
    expect(container.querySelector('.monat-druck')).toBeNull()
  })

  it('„Ganzer Monat" druckt jede Woche, deren Montag im Monat liegt — und nur die', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    const imDruck = monatDrucken(container)
    expect(print).toHaveBeenCalledTimes(1)
    expect(imDruck.kennzeichen).toBe('monat')
    expect(imDruck.wochen).toEqual([
      'Woche ab 2026-09-07', 'Woche ab 2026-09-14', 'Woche ab 2026-09-21', 'Woche ab 2026-09-28',
    ])
  })

  it('der Monat ist der der angezeigten Woche — auch wenn sie ins nächste hineinreicht', () => {
    // Die Woche vom 28. September endet am 4. Oktober; gedruckt wird der September.
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 4 })
    expect(monatDrucken(container).wochen).toHaveLength(4)
    cleanup()
    const { container: okt } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 5 })
    expect(monatDrucken(okt).wochen).toEqual(['Woche ab 2026-10-05'])
  })

  it('das Blatt trägt einen Kopf mit Versammlung, Reiter und Monat', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    const { kopf } = monatDrucken(container)
    expect(kopf).toContain('Nordheim')
    expect(kopf).toContain(t.tabMid)
    expect(kopf).toContain('September 2026')
  })

  it('unter der Woche kommt jede Woche auf ein eigenes Blatt, am Wochenende nicht', () => {
    // Die Zusammenkunft unter der Woche füllt allein etwa eine Seite; die vom
    // Wochenende ist kurz, dort passen mehrere Wochen auf ein Blatt.
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2, tab: 'mid' })
    expect(monatDrucken(container).seitenweise).toBe(true)
    cleanup()
    const { container: we } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2, tab: 'we' })
    expect(monatDrucken(we).seitenweise).toBe(false)
  })

  it('nach dem Druckdialog räumt der Monat sich wieder ab', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    monatDrucken(container)
    expect(container.querySelector('.monat-druck')).not.toBeNull()
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(container.querySelector('.monat-druck')).toBeNull()
    expect(document.documentElement.dataset.print).toBeUndefined()
  })

  it('der Monat ist am Bildschirm aus dem Weg: nicht bedienbar, nicht vorgelesen', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    monatDrucken(container)
    const monat = container.querySelector('.monat-druck')!
    expect(monat.getAttribute('aria-hidden')).toBe('true')
    expect(monat.hasAttribute('inert')).toBe(true)
  })

  it('Escape schließt die Wahl, der Fokus geht zurück auf den Knopf', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    const knopf = seite(container).querySelector<HTMLButtonElement>('.prog-print-btn')!
    fireEvent.click(knopf)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(optionen(container)).toHaveLength(0)
    expect(document.activeElement).toBe(knopf)
    expect(print).not.toHaveBeenCalled()
  })

  it('ein Tipp daneben schließt die Wahl, ohne zu drucken', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    fireEvent.pointerDown(document.body)
    expect(optionen(container)).toHaveLength(0)
    expect(print).not.toHaveBeenCalled()
  })

  it('eine Woche ohne gültiges Datum druckt gleich — eine Wahl mit einem Eintrag wäre ein Klick zu viel', () => {
    const { container } = zeige({ weeks: [woche({ start: '' })], week: 0 })
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    expect(print).toHaveBeenCalledTimes(1)
    expect(optionen(container)).toHaveLength(0)
  })

  it('der Monat steht in der Sprache des Lesers', () => {
    const en = dict('en')
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2, lang: 'en' })
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    expect(optionen(container).map((o) => o.textContent)).toEqual([
      en.druckWoche,
      en.druckMonat.replace('{monat}', 'September 2026'),
    ])
  })
})

/**
 * **Auch die Treffpunkte lassen sich drucken** (T105) — dieselbe Wahl wie bei
 * den Zusammenkünften. Vorher hatte der Reiter Predigtdienst gar keinen Knopf.
 */
describe('Drucken im Reiter Predigtdienst', () => {
  const MONTAGE = ['2026-09-07', '2026-09-14', '2026-10-05']
  const treff = (id: string, place: string): FsInstance => ({
    id, ruleId: null, grp: null, wd: 6, time: '09:30', place, leader: 'Anton Alt', lpid: 'p-a',
  })

  let print = vi.fn()
  beforeEach(() => {
    print = vi.fn()
    window.print = print
  })
  afterEach(() => {
    delete document.documentElement.dataset.print
  })

  it('der Knopf steht da — auch in einer Woche ohne Treffpunkte, der Monat hat vielleicht welche', () => {
    const { container } = zeige({
      tab: 'fs', week: 0,
      weeks: MONTAGE.map((start) => woche({ start })),
      fsWeeks: [[], [treff('a', 'Marktplatz')], []],
    })
    expect(seite(container).textContent).toContain(t.fsKeine)
    expect(seite(container).querySelector('.prog-print-btn')).not.toBeNull()
  })

  it('„Ganzer Monat" druckt die Treffpunkte aller Wochen des Monats — und nur die', () => {
    let orte: string[] = []
    print.mockImplementation(() => {
      orte = [...document.querySelectorAll('.monat-woche .fs-place')].map((e) => e.textContent ?? '')
    })
    const { container } = zeige({
      tab: 'fs', week: 0,
      weeks: MONTAGE.map((start) => woche({ start })),
      fsWeeks: [[treff('a', 'Saal')], [treff('b', 'Marktplatz')], [treff('c', 'Oktoberort')]],
    })
    fireEvent.click(seite(container).querySelector('.prog-print-btn')!)
    fireEvent.click(optionen(container)[1]!)
    expect(print).toHaveBeenCalledTimes(1)
    expect(orte).toEqual(['Saal', 'Marktplatz'])
  })
})
