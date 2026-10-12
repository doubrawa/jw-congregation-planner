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
import { demoZustand } from '../../tests/testdaten/demo-start'
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
 * - **„Du"** statt des eigenen Namens entscheidet `gehoertZu` — erst die
 *   Person-Id, dann der Name. Der bloße Namensvergleich gab ihn an beide Namensgleichen und an
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
    ...demoZustand(),
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
/**
 * Die Wahl im Blatt „Drucken" (T105; T121 ein Blatt statt einer Liste am
 * Knopf). Das Blatt hängt per Portal am Dokument, nicht im Bildschirm.
 */
const optionen = () => [...document.querySelectorAll<HTMLButtonElement>('.druck-optionen .druck-option')]
const druckKnopf = (c: HTMLElement) => seite(c).querySelector<HTMLButtonElement>('.druck-knopf')!
/** Öffnet das Blatt, wählt die Woche (0) oder den Monat (1) und druckt. */
function drucke(c: HTMLElement, wahl: 0 | 1): void {
  fireEvent.click(druckKnopf(c))
  fireEvent.click(optionen()[wahl]!)
  fireEvent.click(document.querySelector('.druck-fuss .knopf-haupt')!)
}

// jsdom kennt `matchMedia` nicht; das Blatt „Drucken" fragt danach (Herunterwischen).
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Kopf und Navigation', () => {
  it('nennt Wochenbereich und Bibelbuch', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.woche-zeitraum')?.textContent).toBe('7.–13. September')
    expect(seite(container).querySelector('.woche-buch')?.textContent).toBe('JEREMIA 32')
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

  it('zwei Karten: unter der Woche und Wochenende — mit Tag und Uhrzeit (T121)', () => {
    // Die Treffpunkte waren bis T120 ein dritter Reiter; sie sind jetzt das
    // Thema Predigtdienst und stehen im Menü.
    const { container } = zeige()
    expect(texte(container, '.meeting-tab-name')).toEqual(['Dienstag', 'Sonntag'])
    expect(texte(container, '.meeting-tab-wann')).toEqual(['8.9. · 19:00', '13.9. · 10:00'])
  })

  it('der Predigtdienst hat keine Reiter der Zusammenkünfte', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.meeting-tabs')).toBeNull()
  })

  it('der Titel nennt den Bereich — „Planen" daneben sieht nur, wer ihn planen darf (T121)', () => {
    const titel = (c: HTMLElement) => seite(c).querySelector('.bereichstitel .seitentitel')?.textContent
    const planen = (c: HTMLElement) => seite(c).querySelector<HTMLButtonElement>('.bereichstitel .planen-knopf')
    // Verkündiger: nur Ansehen, also kein „Planen".
    const verk = zeige()
    expect(titel(verk.container)).toBe(t.navZusammenkuenfte)
    expect(planen(verk.container)).toBeNull()
    cleanup()
    // Planer: „Planen" führt in den Modus, beim selben Bereich.
    const planer = zeige({ planner: true, tab: 'fs' })
    expect(titel(planer.container)).toBe(t.tabFs)
    expect(planen(planer.container)?.textContent).toBe(t.planen)
    fireEvent.click(planen(planer.container)!)
    expect(planer.dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'predigtdienst' })
  })

  it('der Gruppenaufseher sieht „Planen" nur im Predigtdienst', () => {
    const gruppen = [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-a', assistantId: null }]
    expect(seite(zeige({ groups: gruppen, tab: 'fs' }).container).querySelector('.planen-knopf')).toBeTruthy()
    cleanup()
    expect(seite(zeige({ groups: gruppen, tab: 'mid' }).container).querySelector('.planen-knopf')).toBeNull()
  })

  it('der Reiter-Wechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    const reiter = [...seite(container).querySelectorAll('.meeting-tab')]
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
  it('jeder Bereich wird zu einer Karte in seiner Farbe', () => {
    const { container } = zeige()
    const panels = [...seite(container).querySelectorAll('.prog-abschnitt[data-farbe]')]
    const farben = panels.map((p) => p.getAttribute('data-farbe'))
    expect(farben).toContain('petrol')
    expect(farben).toContain('neutral')
  })

  it('nummerierte Punkte tragen ihre Nummer, unnummerierte nicht', () => {
    const { container } = zeige()
    expect(texte(container, '.prog-num').map((n) => n.trim())).toEqual(['1', '3'])
  })

  it('ein offener Platz steht als solcher da — er fehlt nicht einfach', () => {
    const { container } = zeige()
    expect(texte(container, '.prog-name')).toContain(t.offenDash)
  })

  it('das Lied wird aus dem Eröffnungs-Sammeltitel herausgezogen — es steht rechts im Kopf', () => {
    const { container } = zeige()
    const lieder = texte(container, '.prog-abschnitt-kopf .prog-lied')
    expect(lieder).toContain('Lied 12')
    // Der Rest des Titels bleibt als Punkt stehen.
    expect(texte(container, '.prog-title').join(' | ')).toContain('Gebet · Einleitende Worte')
  })

  it('im Abschluss ebenso — dort steht das Lied vorn im Sammeltitel', () => {
    const { container } = zeige()
    expect(texte(container, '.prog-abschnitt-kopf .prog-lied')).toContain('Lied 99')
  })

  it('die Dauer steht neben dem Titel, der Rahmen darunter (T121)', () => {
    const w = woche()
    Object.assign(w.mid.sections[1]!.items[0]!, { meta: 'Von Haus zu Haus · 3 Min.', mins: 3 })
    const { container } = zeige({ weeks: [w] })
    const zeile = seite(container).querySelector('.prog-abschnitt[data-farbe="petrol"] .prog-row')!
    expect(zeile.querySelector('.prog-dauer')?.textContent).toBe('3 Min.')
    expect(zeile.querySelector('.prog-item-meta')?.textContent).toBe('Von Haus zu Haus')
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
    drucke(container, 0)
    expect(print).toHaveBeenCalled()
  })

  it('der Ausdruck trägt einen eigenen Kopf — Reiter und Navigation fehlen dort', () => {
    const { container } = zeige()
    const kopf = seite(container).querySelector('.prog-print-head')!
    expect(kopf.textContent).toContain('Nordheim')
    expect(kopf.textContent).toContain(t.tabMid)
  })
})

describe('„Du" statt des eigenen Namens: Id vor Name', () => {
  const mitMir = (pid: string | undefined, name = 'Anton Alt') => {
    const w = woche()
    ;(w.mid.sections[1]!.items[0] as PartItem).names[0] = { name, pid }
    return w
  }

  it('steht an der eigenen Zuteilung — gedruckt wird der Name', () => {
    const { container } = zeige({ weeks: [mitMir('p-a')] })
    expect(seite(container).querySelectorAll('.prog-du')).toHaveLength(1)
    // Der Aushang gilt allen: Der Name steht im DOM, nur der Bildschirm zeigt „Du".
    expect(seite(container).querySelector('.prog-person.is-du .prog-name.nur-druck')?.textContent).toBe('Anton Alt')
  })

  it('nicht an der des Namensvetters — die Id entscheidet', () => {
    const { container } = zeige({ weeks: [mitMir('p-z')] })
    expect(seite(container).querySelector('.prog-du')).toBeNull()
  })

  it('ohne Id (Altdaten) zählt weiter der Name', () => {
    const { container } = zeige({ weeks: [mitMir(undefined)] })
    expect(seite(container).querySelectorAll('.prog-du')).toHaveLength(1)
  })

  it('ohne eigene Person steht er nirgends', () => {
    const { container } = zeige({ weeks: [mitMir('p-a')], personId: null })
    expect(seite(container).querySelector('.prog-du')).toBeNull()
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
    const karten = [...seite(container).querySelectorAll('.prog-abschnitt-name')].map((x) => x.textContent)
    expect(karten).toContain(t.auxKlassen)
  })

  it('der Ratgeber-Titel steht in der Sprache des Lesers, nicht der Versammlung', () => {
    // Bei deutscher App und englischer Versammlungssprache stand hier
    // „Counselor" unter der deutschen Überschrift.
    const weeks = mitKlasse()
    weeks[0]!.mid.auxRatgeber = { name: 'Anton Alt', pid: 'p-a' }
    const { container } = zeige({ weeks, auxClass: true })
    const klasse = [...seite(container).querySelectorAll('.prog-abschnitt')].find(
      (p) => p.querySelector('.prog-abschnitt-name')?.textContent === t.auxKlassen,
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
  /** Was in der Zeile des Dienstes steht: „Du", die übrigen Namen, „offen". */
  const dienst = (c: HTMLElement) => {
    const wer = seite(c).querySelector('.prog-dienst-wer')!
    return {
      du: wer.querySelector('.prog-du-pille') !== null,
      namen: wer.querySelector('.prog-dienst-namen')?.textContent ?? '',
      offen: wer.querySelector('.prog-dienst-offen')?.textContent ?? '',
    }
  }

  it('füllt bis zur eingestellten Platzzahl auf — ein freier Platz steht als „offen"', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: 'Wer Anders' }]
    const { container } = zeige({ weeks: [w] })
    expect(dienst(container)).toEqual({ du: false, namen: 'Wer Anders', offen: t.offenWort })
  })

  it('mehr Einträge als Plätze werden abgeschnitten — die Einstellung gilt', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const { container } = zeige({ weeks: [w] })
    expect(dienst(container)).toEqual({ du: false, namen: 'A, B', offen: '' })
  })

  it('der eigene Platz steht als „Du" vorn, nicht als Name (T121)', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: 'Wer Anders' }, { name: 'Anton Alt', pid: 'p-a' }]
    const { container } = zeige({ weeks: [w] })
    expect(dienst(container)).toEqual({ du: true, namen: 'Wer Anders', offen: '' })
  })

  it('der Dienstname steht da, wie er heißt', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.prog-dienst-name')?.textContent).toBe('Mikrofone')
  })

  it('ganz ohne Zuteilung steht der Dienst offen', () => {
    const { container } = zeige()
    expect(dienst(container)).toEqual({ du: false, namen: '', offen: t.offenWort })
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
  it('ein offener erster Platz bleibt offen — der Name dahinter steht trotzdem da', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: '' }, { name: 'Wer Anders' }]
    const { container } = zeige({ weeks: [w] })
    expect(dienst(container)).toEqual({ du: false, namen: 'Wer Anders', offen: t.offenWort })
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
    expect(dienst(container)).toEqual({ du: false, namen: '', offen: t.offenWort })
  })
})

/**
 * **Was die Woche besonders macht, steht unter ihr** (T121, `GWoche`): ihr
 * Anlass — und nur ohne Anlass „Aktuelle Woche". Der Kongress ersetzt das
 * Programm ganz (`GSonderwoche`).
 */
describe('Anlass und Kongress', () => {
  const zweiWochen = (erste: Partial<Week>, zweite: Partial<Week> = {}) => [
    woche(erste),
    woche({ start: '2026-09-14', range: '14.–20. September', ...zweite }),
  ]

  it('ohne Anlass steht in der laufenden Woche „Aktuelle Woche"', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 9, 0))
    try {
      const { container } = zeige()
      expect(seite(container).querySelector('.woche-hinweis')?.textContent).toBe(t.aktuelleWoche)
    } finally {
      vi.useRealTimers()
    }
  })

  it('der Anlass geht vor: Besuch des Kreisaufsehers statt „Aktuelle Woche"', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 9, 0))
    try {
      const { container } = zeige({ weeks: [woche({ anlass: { art: 'co' }, co: true })] })
      expect(texte(container, '.woche-hinweis')).toEqual([t.coWoche])
    } finally {
      vi.useRealTimers()
    }
  })

  it('im Kongress statt der Tage und des Programms die Karte mit den zwei Wegen', () => {
    const { container, dispatch } = zeige({ weeks: zweiWochen({ anlass: { art: 'kongress' } }) })
    const s = seite(container)
    expect(s.querySelector('.kongress-karte')?.textContent).toContain(t.kongressAusfall)
    expect(s.querySelector('.meeting-tabs')).toBeNull()
    expect(s.querySelector('.prog-abschnitt')).toBeNull()
    const [treffpunkte, naechste] = [...s.querySelectorAll<HTMLButtonElement>('.kongress-weg')]
    fireEvent.click(treffpunkte!)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'programm', woche: { wi: 0, tab: 'fs' } })
    fireEvent.click(naechste!)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'programm', woche: { wi: 1, tab: 'mid' } })
  })

  it('„Nächste Zusammenkunft" überspringt, was ausfällt', () => {
    // In der Woche danach fällt die Zusammenkunft unter der Woche aus — die
    // nächste ist dann die am Sonntag, dem 20. September.
    const { container, dispatch } = zeige({
      weeks: zweiWochen({ anlass: { art: 'kongress' } }, { dev: { mid: { cancelled: true } } }),
    })
    const naechste = [...seite(container).querySelectorAll<HTMLButtonElement>('.kongress-weg')][1]!
    expect(naechste.textContent).toContain('20. September')
    fireEvent.click(naechste)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'programm', woche: { wi: 1, tab: 'we' } })
  })

  it('ist keine Woche danach geladen, fehlt der Weg zur nächsten — statt ins Leere zu führen', () => {
    const { container } = zeige({ weeks: [woche({ anlass: { art: 'kongress' } })] })
    expect(seite(container).querySelectorAll('.kongress-weg')).toHaveLength(1)
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
      imDruck.wochen = [...container.querySelectorAll('.monat-woche .woche-zeitraum')].map((e) => e.textContent ?? '')
      imDruck.kopf = container.querySelector('.monat-kopf')?.textContent ?? ''
      imDruck.seitenweise = container.querySelector('.monat-druck')?.classList.contains('monat-druck--seitenweise') ?? false
    })
    drucke(container, 1)
    return imDruck
  }

  it('der Knopf öffnet die Wahl, statt gleich zu drucken — die Woche ist vorgewählt', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    fireEvent.click(druckKnopf(container))
    expect(print).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(t.drucken)
    expect(optionen().map((o) => o.querySelector('.druck-option-titel')?.textContent)).toEqual([
      t.druckWoche,
      t.druckMonat.replace('{monat}', 'September 2026'),
    ])
    expect(optionen().map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false'])
  })

  it('„Diese Woche" druckt ohne Kennzeichen — auch wenn eins stehen geblieben ist', () => {
    // Ein abgebrochener Druck vorher (kein `afterprint`) ließe sonst den
    // Wochen-Ausdruck still als Monat oder Zettelbogen herauskommen.
    document.documentElement.dataset.print = 'monat'
    let kennzeichen: string | undefined = 'nicht gedruckt'
    print.mockImplementation(() => {
      kennzeichen = document.documentElement.dataset.print
    })
    let blattImDruck: boolean | undefined
    print.mockImplementation(() => {
      kennzeichen = document.documentElement.dataset.print
      // Der Druckdialog nimmt auf, was in diesem Moment im DOM steht.
      blattImDruck = document.querySelector('.druck-optionen') !== null
    })
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    drucke(container, 0)
    expect(print).toHaveBeenCalledTimes(1)
    expect(kennzeichen).toBeUndefined()
    expect(blattImDruck, 'das Blatt „Drucken" stand noch im Ausdruck').toBe(false)
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
    const knopf = druckKnopf(container)
    knopf.focus()
    fireEvent.click(knopf)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(optionen()).toHaveLength(0)
    expect(document.activeElement).toBe(knopf)
    expect(print).not.toHaveBeenCalled()
  })

  it('ein Tipp daneben oder „Abbrechen" schließt die Wahl, ohne zu drucken', () => {
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2 })
    fireEvent.click(druckKnopf(container))
    fireEvent.click(document.querySelector('.sheet-backdrop')!)
    expect(optionen()).toHaveLength(0)
    fireEvent.click(druckKnopf(container))
    fireEvent.click([...document.querySelectorAll('.druck-fuss button')].find((b) => b.textContent === t.abbrechen)!)
    expect(optionen()).toHaveLength(0)
    expect(print).not.toHaveBeenCalled()
  })

  it('eine Woche ohne gültiges Datum druckt gleich — eine Wahl mit einem Eintrag wäre ein Tipp zu viel', () => {
    const { container } = zeige({ weeks: [woche({ start: '' })], week: 0 })
    fireEvent.click(druckKnopf(container))
    expect(print).toHaveBeenCalledTimes(1)
    expect(optionen()).toHaveLength(0)
  })

  it('der Monat steht in der Sprache des Lesers', () => {
    const en = dict('en')
    const { container } = zeige({ weeks: wochen(), fsWeeks: leer(), week: 2, lang: 'en' })
    fireEvent.click(druckKnopf(container))
    expect(optionen().map((o) => o.querySelector('.druck-option-titel')?.textContent)).toEqual([
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
    expect(seite(container).querySelector('.druck-knopf')).not.toBeNull()
  })

  it('„Ganzer Monat" druckt die Treffpunkte aller Wochen des Monats — und nur die', () => {
    let orte: string[] = []
    print.mockImplementation(() => {
      orte = [...document.querySelectorAll('.monat-woche .treff-ort')].map((e) => e.textContent ?? '')
    })
    const { container } = zeige({
      tab: 'fs', week: 0,
      weeks: MONTAGE.map((start) => woche({ start })),
      fsWeeks: [[treff('a', 'Saal')], [treff('b', 'Marktplatz')], [treff('c', 'Oktoberort')]],
    })
    drucke(container, 1)
    expect(print).toHaveBeenCalledTimes(1)
    expect(orte).toEqual(['Saal', 'Marktplatz'])
  })
})

/**
 * **Die Treffpunkte der Woche** (T121, `GTreffpunkte`): je Tag eine Karte, die
 * Uhrzeit groß, wer sich trifft und wo, darunter der Leiter. Wo sich die
 * eigene Gruppe trifft, steht „Deine Gruppe".
 */
describe('Die Treffpunkte der Woche (T121)', () => {
  const GRUPPEN = [{ id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }]
  const treffpunkt = (over: Partial<FsInstance>): FsInstance => ({
    id: 'x', ruleId: null, grp: null, wd: 3, time: '09:30', place: 'Königreichssaal', leader: '', ...over,
  })
  const WOCHE = [
    treffpunkt({ id: 'a', leader: 'Wer Anders', lpid: 'p-x' }),
    treffpunkt({ id: 'b', wd: 6, time: '10:00', place: 'Bei Familie A', grp: 'g1' }),
  ]
  const tage = (c: HTMLElement) => [...seite(c).querySelectorAll('.treff-tag')]

  it('je Tag eine Karte: Uhrzeit, wer sich trifft, wo — und der Leiter', () => {
    const { container } = zeige({ tab: 'fs', fsWeeks: [WOCHE], groups: GRUPPEN, persons: [{ ...ICH, grp: 'g1' }] })
    expect(tage(container).map((tag) => tag.querySelector('.treff-tag-name')?.textContent)).toEqual([
      'Mittwoch, 9. September',
      'Samstag, 12. September',
    ])
    expect(texte(container, '.treff-zeit')).toEqual(['09:30', '10:00'])
    expect(texte(container, '.treff-titel')).toEqual([t.fsVers, 'Gruppe 1'])
    expect(texte(container, '.treff-ort')).toEqual(['Königreichssaal', 'Bei Familie A'])
    // Ohne Leiter steht der Platz offen da — er fehlt nicht einfach.
    expect(texte(container, '.treff-leiter .prog-name')).toEqual(['Wer Anders', t.offenDash])
  })

  it('„Deine Gruppe" steht an dem Tag, an dem sich die eigene Gruppe trifft', () => {
    const { container } = zeige({ tab: 'fs', fsWeeks: [WOCHE], groups: GRUPPEN, persons: [{ ...ICH, grp: 'g1' }] })
    expect(tage(container).map((tag) => tag.querySelector('.treff-deine')?.textContent ?? null)).toEqual([
      null,
      t.gbDeineGruppe,
    ])
  })

  it('wer alle Gruppen sieht, liest „Deine Gruppe" am Treffpunkt — am Tag meinte es eine von vielen', () => {
    const zwei = [...GRUPPEN, { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null }]
    const { container } = zeige({
      tab: 'fs',
      planner: true,
      groups: zwei,
      persons: [{ ...ICH, grp: 'g1' }],
      fsWeeks: [[treffpunkt({ id: 'a', wd: 6, grp: 'g2' }), treffpunkt({ id: 'b', wd: 6, grp: 'g1' })]],
    })
    const [samstag] = tage(container)
    expect(samstag!.querySelector('.prog-abschnitt-kopf .treff-deine')).toBeNull()
    expect([...samstag!.querySelectorAll('.treff-punkt')].map((p) => p.querySelector('.treff-deine') !== null)).toEqual([
      false,
      true,
    ])
  })

  it('auch für den, der die Gruppe leitet, ohne in ihr geführt zu sein', () => {
    const geleitet = [{ ...GRUPPEN[0]!, overseerId: 'p-a' }]
    const { container } = zeige({ tab: 'fs', fsWeeks: [WOCHE], groups: geleitet })
    expect(tage(container).map((tag) => tag.querySelector('.treff-deine') !== null)).toEqual([false, true])
  })

  it('der eigene Leiterplatz heißt „Du" — über die Id; ein Leiter als Freitext gehört niemandem', () => {
    const { container } = zeige({
      tab: 'fs',
      fsWeeks: [[
        treffpunkt({ id: 'a', leader: 'Anton Alt', lpid: 'p-a' }),
        treffpunkt({ id: 'b', wd: 4, leader: 'Anton Alt', lext: true }),
      ]],
    })
    expect(tage(container).map((tag) => tag.querySelector('.prog-du') !== null)).toEqual([true, false])
  })
})

describe('Gruppenbesuche beim Ansehen (T120, Phase 2)', () => {
  /*
   * Die Gruppe soll wissen, wann der Dienstaufseher kommt — der
   * Gruppenaufseher kündigt den Besuch an (od Kap. 5 Abs. 41). Ohne
   * kommenden Besuch bleibt der Predigtdienst, wie er war: ohne Reiter.
   */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
  })
  afterEach(() => vi.useRealTimers())

  const GRUPPEN = [
    { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
    { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
  ]
  const KONRAD: Person = { ...ICH, id: 'p-k', fn: 'Konrad', ln: 'Sommer' }
  const REGELN = [
    { id: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie A', monthly: 0, skipCong: false },
    { id: 'r2', grp: 'g2', wd: 6, time: '10:00', place: 'Saal', monthly: 0, skipCong: false },
  ]
  const BESUCHE = [
    { id: 'b1', woche: '2026-10-12', grp: 'g1', pid: 'p-k' },
    { id: 'b2', woche: '2026-11-09', grp: 'g2', pid: 'p-k' },
  ]
  const mitBesuchen = (over: Partial<AppState> = {}) =>
    zeige({
      tab: 'fs',
      groups: GRUPPEN,
      fsRules: REGELN,
      persons: [{ ...ICH, grp: 'g1' }, KONRAD],
      gruppenbesuche: BESUCHE,
      ...over,
    })
  const reiter = (c: HTMLElement) => [...c.querySelectorAll('.bereich-tab')].map((b) => b.textContent)

  it('ohne kommenden Besuch keine Reiter — der Predigtdienst sieht aus wie vorher', () => {
    const { container } = mitBesuchen({ gruppenbesuche: [] })
    expect(container.querySelector('.bereich-tabs')).toBeNull()
  })

  it('mit Besuchen: Treffpunkte und Gruppenbesuche — den Grundplan gibt es nur beim Planen', () => {
    const { container, dispatch } = mitBesuchen()
    expect(reiter(seite(container))).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab])
    fireEvent.click([...seite(container).querySelectorAll('.bereich-tab')][1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'gruppenbesuche' })
  })

  it('oben die eigene Gruppe mit Treffpunkt und Besucher, darunter alle Besuche', () => {
    const { container } = mitBesuchen({ fsBereich: 'gruppenbesuche' })
    expect(container.querySelector('.week-strip')).toBeNull()
    const karten = [...container.querySelectorAll('.gb-karte-titel')].map((x) => x.textContent)
    expect(karten).toEqual([`${t.gbDeineGruppe} · Gruppe 1`, t.gbAlle])
    const eigene = container.querySelector('.gb-karte')!
    expect(eigene.textContent).toContain('Bei Familie A')
    expect(eigene.textContent).toContain(t.gbLeitetDann.replace('{name}', 'Konrad Sommer'))
    // Den Treffpunkt einer fremden Gruppe nennt die Ansicht nicht — nur Woche und Gruppe.
    expect(container.textContent).not.toContain('Saal')
    expect(container.querySelectorAll('.gb-liste-zeile')).toHaveLength(2)
  })

  it('unter allen Besuchen ist der der eigenen Gruppe hervorgehoben (T121)', () => {
    const { container } = mitBesuchen({ fsBereich: 'gruppenbesuche' })
    const zeilen = [...container.querySelectorAll('.gb-liste-zeile')]
    expect(zeilen.map((z) => [z.querySelector('.gb-liste-gruppe')?.textContent, z.classList.contains('is-eigen')])).toEqual([
      ['Gruppe 1', true],
      ['Gruppe 2', false],
    ])
  })

  it('der Treffpunkt der besuchten Gruppe trägt in der Besuchswoche die Marke', () => {
    const treffpunkt: FsInstance = { id: 'r1', ruleId: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie A', leader: '' }
    const { container } = mitBesuchen({
      gruppenbesuche: [{ id: 'b0', woche: '2026-09-07', grp: 'g1', pid: 'p-k' }],
      fsWeeks: [[treffpunkt]],
    })
    expect(seite(container).querySelector('.gb-marker')?.textContent).toBe(t.gbMarker)
  })
})

describe('Was die Gruppe über ihren Besuch liest, stimmt (T120)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('leitet dort noch ein anderer, verspricht die Ansicht den Besucher nicht', () => {
    const gruppen = [{ id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }]
    const konrad: Person = { ...ICH, id: 'p-k', fn: 'Konrad', ln: 'Sommer' }
    const treffpunkt: FsInstance = {
      id: 'r1', ruleId: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei A', leader: 'Anton Alt', lpid: 'p-a',
    }
    const { container } = zeige({
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      groups: gruppen,
      persons: [{ ...ICH, grp: 'g1' }, konrad],
      fsWeeks: [[treffpunkt]],
      gruppenbesuche: [{ id: 'b0', woche: '2026-09-07', grp: 'g1', pid: 'p-k' }],
    })
    expect(container.textContent).toContain('Bei A')
    expect(container.textContent).not.toContain('Konrad Sommer')
  })
})

/**
 * **Drucken für die Pläne ohne Woche** (5.10.2026): Gruppenbesuche,
 * Zeugnisgeben und Weitere Pläne hatten keinen Druckknopf — dabei gehören der
 * Reinigungsplan und die Zeugnis-Schichten genauso an den Aushang wie das
 * Programm. Gedruckt wird die Ansicht samt einer Kopfzeile, die das Blatt
 * zuordnet; das Zeugnisgeben klappt vorher alle Wochen auf.
 */
describe('Drucken: Pläne ohne Woche', () => {
  let print = vi.fn()
  beforeEach(() => {
    print = vi.fn()
    window.print = print
  })
  afterEach(() => {
    delete document.documentElement.dataset.print
  })

  const GRUPPE = { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }
  /** Fern genug, dass die Uhr den Test nie überholt. */
  const BESUCH = { id: 'b1', woche: '2099-01-05', grp: 'g1', pid: null }
  const TERMIN = { id: 't1', wd: 6, von: '10:00', bis: '12:00', ort: 'Testplatz', plaetze: 2 }
  const PLAN = { id: 'pl1', name: 'Saalreinigung', von: '2099-01-05', bis: '2099-03-29', entwurf: false }

  const kopf = (c: HTMLElement) => [...c.querySelectorAll('.prog-print-head span')].map((s) => s.textContent)
  const knopf = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.druck-zeile .druck-knopf')!

  it('Gruppenbesuche: Knopf druckt, die Kopfzeile nennt Versammlung und Plan', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche', groups: [GRUPPE], gruppenbesuche: [BESUCH] })
    expect(kopf(container)).toEqual(['Nordheim', t.gbTitel])
    fireEvent.click(knopf(container))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('Weitere Pläne: Knopf druckt, die Kopfzeile nennt Versammlung und Plan', () => {
    const { container } = zeige({ tab: 'wp', plaene: [PLAN], planEintraege: [] })
    expect(kopf(container)).toEqual(['Nordheim', t.navWeiterePlaene])
    fireEvent.click(knopf(container))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('Zeugnisgeben: gedruckt wird der ganze Plan, nicht nur die ersten vier Wochen', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'zeugnis', ozTermine: [TERMIN], ozEintraege: [] })
    const wochen = () => container.querySelectorAll('.panel[data-farbe="gold"]').length
    expect(wochen()).toBe(4)
    let imDruck = 0
    print.mockImplementation(() => {
      imDruck = wochen()
    })
    expect(kopf(container)).toEqual(['Nordheim', t.privZeugnis])
    fireEvent.click(knopf(container))
    expect(print).toHaveBeenCalledTimes(1)
    expect(imDruck).toBeGreaterThan(4)
  })

  it('räumt ein stehengebliebenes Kennzeichen ab — sonst käme das Blatt als Monat heraus', () => {
    document.documentElement.dataset.print = 'monat'
    let kennzeichen: string | undefined = 'nicht gedruckt'
    print.mockImplementation(() => {
      kennzeichen = document.documentElement.dataset.print
    })
    const { container } = zeige({ tab: 'wp', plaene: [PLAN], planEintraege: [] })
    fireEvent.click(knopf(container))
    expect(kennzeichen).toBeUndefined()
  })
})

/** Ein Fenster dieser Breite: Jede Abfrage `(min-width: …px)` gilt, wenn das Fenster so breit ist. */
function fensterBreite(px: number): void {
  window.matchMedia = vi.fn((abfrage: string) => ({
    matches: px >= Number(/min-width:\s*(\d+)px/.exec(abfrage)?.[1] ?? Infinity),
  })) as unknown as typeof window.matchMedia
}

/**
 * **Ab dem Tablet trägt „Drucken" sein Wort** (T121, `GTabletWoche`) und steht
 * rechts neben der Wochenwahl — über beiden Themen mit Woche. Neben dem
 * Termin bleibt dann nur der Termin.
 */
describe('Ab dem Tablet', () => {
  beforeEach(() => fensterBreite(900))

  it('„Drucken" steht mit Wort neben der Wochenwahl, nicht neben dem Termin', () => {
    const { container } = zeige()
    const s = seite(container)
    expect(s.querySelector('.wochenwahl .druck-knopf--text')?.textContent).toBe(t.drucken)
    expect(s.querySelector('.prog-meta-row .druck-knopf')).toBeNull()
    expect(s.querySelector('.prog-meta')?.textContent).toContain('8. September')
  })

  it('ebenso über den Treffpunkten', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.wochenwahl .druck-knopf--text')).not.toBeNull()
    expect(seite(container).querySelector('.druck-zeile')).toBeNull()
  })

  it('die Tage bleiben Karten — nebeneinander stehen sie erst am Desktop', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.meeting-tabs')).not.toBeNull()
    expect(seite(container).querySelector('.prog-tage')).toBeNull()
  })

  it('in der Kongresswoche gibt es nichts zu drucken', () => {
    const { container } = zeige({ weeks: [woche({ anlass: { art: 'kongress' } })] })
    expect(seite(container).querySelector('.druck-knopf')).toBeNull()
  })

  it('auch der Druckknopf der Pläne ohne Woche trägt sein Wort', () => {
    const { container } = zeige({
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      groups: [{ id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }],
      gruppenbesuche: [{ id: 'b1', woche: '2099-01-05', grp: 'g1', pid: null }],
    })
    expect(container.querySelector('.druck-zeile .druck-knopf--text')?.textContent).toBe(t.drucken)
  })
})

/**
 * **Am Desktop beide Tage nebeneinander** (T121, `GDesktopWoche`): je Tag
 * eine Spalte mit Datum und Uhrzeit, die Hilfsdienste beider Tage als eine
 * Tabelle. Eine Wahl des Tages gibt es nicht mehr — gedruckt werden beide.
 */
describe('Am Desktop', () => {
  beforeEach(() => fensterBreite(1440))
  afterEach(() => {
    delete document.documentElement.dataset.print
  })

  it('beide Tage mit Datum und Uhrzeit — statt der Karten, zwischen denen man wählt', () => {
    const { container } = zeige()
    const s = seite(container)
    expect(texte(container, '.prog-tag-datum')).toEqual(['Dienstag, 8. September', 'Sonntag, 13. September'])
    expect(texte(container, '.prog-tag-kopf .prog-meta')).toEqual(['19:00 · 20:45', '10:00 · 11:45'])
    expect(s.querySelector('.meeting-tabs')).toBeNull()
    // Zwei Programme brauchen die Breite neben dem Menü.
    expect(s.classList.contains('prog--beide-tage')).toBe(true)
  })

  it('in der Kongresswoche bleibt die Karte in der gewohnten Spalte', () => {
    const { container } = zeige({ weeks: [woche({ anlass: { art: 'kongress' } })] })
    expect(seite(container).querySelector('.kongress-karte')).not.toBeNull()
    expect(seite(container).classList.contains('prog--beide-tage')).toBe(false)
  })

  it('jeder Tag mit seinem Programm — die Abschnitte unter der Überschrift des Tages', () => {
    const w = woche()
    w.we.sections = [{ label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ iid: 'v1', title: 'Thema', meta: '30 Min.', mins: 30, names: [{ name: 'Gast Redner' }] }] }]
    const { container } = zeige({ weeks: [w] })
    const [dienstag, sonntag] = [...seite(container).querySelectorAll('.prog-tag')]
    expect(dienstag!.querySelectorAll('h3.prog-abschnitt-name')).toHaveLength(3)
    expect(sonntag!.querySelector('h3.prog-abschnitt-name')?.textContent).toBe('ÖFFENTLICHER VORTRAG')
    expect(sonntag!.querySelector('.prog-name')?.textContent).toBe('Gast Redner')
    expect(sonntag!.querySelector('.prog-dauer')?.textContent).toBe('30 Min.')
  })

  it('die Hilfsdienste beider Tage als eine Tabelle — „Du" in der Spalte des eigenen Tages', () => {
    const w = woche()
    w.mid.helpers.mik = [{ name: 'Wer Anders' }]
    w.we.helpers.mik = [{ name: 'Anton Alt', pid: 'p-a' }, { name: 'Noch Einer' }]
    const { container } = zeige({ weeks: [w] })
    const tabelle = seite(container).querySelector('table.prog-dienste')!
    expect([...tabelle.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Dienstag 8.9.', 'Sonntag 13.9.'])
    const zeile = tabelle.querySelector('tbody tr')!
    expect(zeile.querySelector('th')?.textContent).toBe('Mikrofone')
    const [dienstag, sonntag] = [...zeile.querySelectorAll('td')]
    expect(dienstag!.querySelector('.prog-du-pille')).toBeNull()
    expect(dienstag!.querySelector('.prog-dienst-namen')?.textContent).toBe('Wer Anders')
    expect(dienstag!.querySelector('.prog-dienst-offen')?.textContent).toBe(t.offenWort)
    expect(sonntag!.querySelector('.prog-du-pille')?.textContent).toBe(t.chipDu)
    expect(sonntag!.querySelector('.prog-dienst-namen')?.textContent).toBe('Noch Einer')
    expect(sonntag!.querySelector('.prog-dienst-offen')).toBeNull()
    // Eine Tabelle für beide Tage, nicht je Tag eine Liste.
    expect(seite(container).querySelectorAll('.prog-helpers')).toHaveLength(1)
  })

  it('fällt ein Tag aus, steht er im Kopf der Tabelle durchgestrichen', () => {
    const { container } = zeige({ weeks: [woche({ dev: { we: { cancelled: true } } })] })
    const kopf = [...seite(container).querySelectorAll('table.prog-dienste thead th')]
    expect(kopf.map((th) => th.querySelector('s') !== null)).toEqual([false, true])
    const tage = [...seite(container).querySelectorAll('.prog-tag')]
    expect(tage.map((tag) => tag.querySelector('.ausfall-banner') !== null)).toEqual([false, true])
  })

  it('„Drucken" steht mit Wort neben der Wochenwahl, und das Blatt nennt die Zusammenkünfte', () => {
    const { container } = zeige()
    expect(seite(container).querySelector('.wochenwahl .druck-knopf--text')).not.toBeNull()
    expect(seite(container).querySelector('.prog-print-head')?.textContent).toContain(t.navZusammenkuenfte)
  })

  it('der Monat nimmt beide Tage mit — Kopf „Zusammenkünfte", jede Woche ein eigenes Blatt', () => {
    let imDruck = { kopf: '', seitenweise: false, tage: 0 }
    window.print = vi.fn(() => {
      imDruck = {
        kopf: container.querySelector('.monat-kopf')?.textContent ?? '',
        seitenweise: container.querySelector('.monat-druck')?.classList.contains('monat-druck--seitenweise') ?? false,
        tage: container.querySelectorAll('.monat-woche .prog-tag').length,
      }
    })
    // Gewählt war zuletzt das Wochenende — am Desktop zählt das nicht mehr.
    const { container } = zeige({ tab: 'we', weeks: [woche(), woche({ start: '2026-09-14' })], week: 0 })
    drucke(container, 1)
    expect(imDruck.kopf).toContain(t.navZusammenkuenfte)
    expect(imDruck.kopf).not.toContain(t.tabWe)
    expect(imDruck.seitenweise).toBe(true)
    expect(imDruck.tage).toBe(4)
  })

  it('im Predigtdienst bleibt es beim Plan der Treffpunkte', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.prog-tage')).toBeNull()
    expect(seite(container).querySelector('.prog-print-head')?.textContent).toContain(t.fsShort)
  })
})

/**
 * **Weitere Pläne ansehen** (T121, `GPlaene`): Gibt es mehrere, wählt man oben
 * einen; gezeigt — und gedruckt — wird der gewählte. Die Zeile der eigenen
 * Gruppe ist hervorgehoben, „Deine Gruppe ist dran" nennt ihre Wochen.
 */
describe('Weitere Pläne ansehen (T121)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
  })
  afterEach(() => vi.useRealTimers())

  const GRUPPEN = [
    { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
    { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
  ]
  const REINIGUNG = { id: 'pl1', name: 'Reinigung', von: '2026-09-07', bis: '2026-10-04', entwurf: false }
  const WINTER = { id: 'pl2', name: 'Winterdienst', von: '2026-11-30', bis: '2027-02-28', entwurf: false }
  const EINTRAEGE = [
    { id: 'e1', planId: 'pl1', datum: '2026-09-07', grp: 'g2' },
    { id: 'e2', planId: 'pl1', datum: '2026-09-14', grp: 'g1' },
    { id: 'e3', planId: 'pl2', datum: '2026-11-30', grp: 'g1' },
  ]
  const plaene = (over: Partial<AppState> = {}) =>
    zeige({
      tab: 'wp',
      plaene: [REINIGUNG, WINTER],
      planEintraege: EINTRAEGE,
      groups: GRUPPEN,
      persons: [{ ...ICH, grp: 'g1' }],
      ...over,
    })

  it('mehrere Pläne: oben die Wahl, gezeigt wird einer — der erste, bis man einen anderen wählt', () => {
    const { container } = plaene()
    const knoepfe = [...container.querySelectorAll('.wp-wahl-knopf')]
    expect(knoepfe.map((k) => [k.textContent, k.getAttribute('aria-pressed')])).toEqual([
      ['Reinigung', 'true'],
      ['Winterdienst', 'false'],
    ])
    expect(container.querySelector('.wp-name')?.textContent).toBe('Reinigung')
    fireEvent.click(knoepfe[1]!)
    expect(container.querySelector('.wp-name')?.textContent).toBe('Winterdienst')
    expect(container.querySelectorAll('.wp-plan')).toHaveLength(1)
  })

  it('die Zeile der eigenen Gruppe ist hervorgehoben, „Deine Gruppe ist dran" nennt ihre Wochen', () => {
    const { container } = plaene()
    const zeilen = [...container.querySelectorAll('.wp-liste-zeile')]
    expect(zeilen.map((z) => [z.querySelector('.wp-liste-wer')?.textContent, z.classList.contains('is-eigen')])).toEqual([
      ['Gruppe 2', false],
      ['Gruppe 1', true],
    ])
    expect(container.querySelectorAll('.wp-dran .wp-chip')).toHaveLength(1)
  })

  it('ohne eigene Gruppe ist keine Zeile hervorgehoben — auch die noch offene nicht', () => {
    // Keine Gruppe heißt `null`, ein offener Eintrag ebenso: Gleich sind die
    // beiden trotzdem nicht.
    const { container } = plaene({
      persons: [{ ...ICH, grp: null }],
      planEintraege: [...EINTRAEGE, { id: 'e4', planId: 'pl1', datum: '2026-09-21', grp: null }],
    })
    expect(container.querySelectorAll('.wp-liste-zeile')).toHaveLength(3)
    expect(container.querySelector('.wp-liste-zeile.is-eigen')).toBeNull()
    expect(container.querySelector('.wp-dran')).toBeNull()
  })

  it('ein einziger Plan braucht keine Wahl', () => {
    const { container } = plaene({ plaene: [REINIGUNG] })
    expect(container.querySelector('.wp-wahl')).toBeNull()
    expect(container.querySelector('.wp-name')?.textContent).toBe('Reinigung')
  })
})
