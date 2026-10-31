/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { syncAuxSlots } from '../data/aux-class'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG, LABEL_LAC, LABEL_VORTRAG } from '../data/constants'
import { emptyQualifications, ROLE_CIRCUIT } from '../data/helpers'
import { TALK_PLACEHOLDER } from '../data/meeting-edit'
import { ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from '../data/helpers'
import { punktKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { PartItem, Person, Section, Week } from '../data/types'
import { MeetingSection } from './MeetingSection'

/**
 * **Der Programm-Abschnitt beim Planen — was der Planer die meiste Zeit sieht.**
 *
 * Hier steht jeder Platz als Chip, und daran hängen mehrere Regeln, die sonst
 * nirgends geprüft sind:
 *
 * - Der **Ampel-Punkt** (grün bestätigt, gelb wartet, rot abgesagt) gilt dem
 *   einzelnen Platz und darf nur stehen, wo jemand bestätigen kann. Beim
 *   Gastredner behauptete er sonst eine Zusage, die es nie gab
 *   (`slot-status-quelle.test.ts` prüft, dass genau vier Aufrufer die Regel
 *   führen — hier wird gemessen, dass dieser sie auch anwendet).
 * - Der **Redner-Platz** muss das Sheet im Freitext-Modus öffnen, und zwar auch
 *   dann, wenn dort gerade ein *eigener* Redner steht — sonst gäbe es keinen
 *   Weg zurück zum Gastredner (T29).
 * - Die **Zusätzliche Klasse** bekommt eine zweite Reihe, aber nur bei
 *   Schülerteilen und nur, wenn es sie gibt. Die Raumnamen stehen nur da, wo
 *   es wirklich zwei Reihen gibt — sonst stünde „Hauptsaal" über dem Gebet.
 * - „**Unser Leben als Christ**" ist der einzige bearbeitbare Abschnitt: nur
 *   dort Minuten, Verschieben, Löschen und Hinzufügen.
 */

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, priv: emptyQualifications(),
})

const PERSONEN = [person('p-a', 'Anton', 'Alt'), person('p-b', 'Bernd', 'Brand')]

function woche(mid: Section[], we: Section[] = []): Week {
  return {
    range: '1.–7. September', book: '', start: '2026-09-07', 
    mid: { date: '', end: '20:45', sections: mid, helpers: {} },
    we: { date: '', end: '11:45', sections: we, helpers: {} },
  }
}

function zeige(
  section: Section,
  over: Partial<AppState> = {},
  props: Partial<{ si: number; mitAux: boolean; sprache: string }> = {},
) {
  const dispatch = vi.fn()
  const tab = over.tab ?? 'mid'
  const weeks = over.weeks ?? [tab === 'we' ? woche([], [section]) : woche([section])]
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN, services: [], groups: [], absences: [],
    confirmations: {}, weeks, fsWeeks: [[]],
    ...over,
    tab,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <MeetingSection
              si={props.si ?? 0}
              section={section}
              rawSection={section}
              mitAux={props.mitAux ?? false}
              tpw={(s) => s}
              sprache={props.sprache ?? 'de'}
            />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const plaetze = (c: HTMLElement) => [...c.querySelectorAll('.platz')]
const namen = (c: HTMLElement) => plaetze(c).map((x) => x.querySelector('.platz-name')?.textContent ?? '')
const rollen = (c: HTMLElement) => plaetze(c).map((x) => x.querySelector('.platz-rolle')?.textContent ?? '')
const knopf = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  )!

/** Die Lage eines Platzes: voll, wartet, Problem oder offen (T121, `GPlanen`). */
function lage(platz: Element | undefined): string | null {
  return ['is-voll', 'is-wartet', 'is-problem', 'is-offen'].find((k) => platz?.classList.contains(k)) ?? null
}

/**
 * Was ein Vorleseprogramm über die Zusage hört — „wartet" steht sichtbar bei
 * der Rolle, die übrigen Stufen verborgen. Ohne Zusage `null`.
 */
function zusageWort(platz: Element | undefined): string | null {
  const verborgen = platz?.querySelector('.sr-only')?.textContent
  if (verborgen) return verborgen
  return lage(platz) === 'is-wartet' ? t.zusageWartet : null
}

afterEach(cleanup)

describe('Plätze als Zeilen (T121)', () => {
  const mitPlaetzen = (): Section => ({
    label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
    items: [{ iid: 'i99',
      num: 1, title: 'Bibellesung', meta: '4 Min.',
      names: [{ name: 'Anton Alt', pid: 'p-a', bereichsKey: 'bibellesung' }, { name: '', bereichsKey: 'leser' }],
    }],
  })

  it('ein besetzter Platz trägt den Namen, ein offener die Aufforderung', () => {
    const { container } = zeige(mitPlaetzen())
    expect(namen(container)).toEqual(['Anton Alt', t.spurZuteilen])
  })

  it('der offene Platz ist als solcher gekennzeichnet, der besetzte nicht', () => {
    const { container } = zeige(mitPlaetzen())
    expect(plaetze(container).map(lage)).toEqual(['is-wartet', 'is-offen'])
  })

  it('das Schlussgebet am Wochenende fordert nicht zum Zuteilen auf — es sagt, wer es übernimmt (T133)', () => {
    // Erkannt am Wachtturm-Studium der Woche: Unter der Woche heißt derselbe Platz „Zuteilen".
    const wt: Section = { label: 'WACHTTURM-STUDIUM', farbe: 'wein', items: [{ iid: 'w1', title: 'Studium', names: [{ name: '', rolle: 'Leiter', bereichsKey: 'studium' }] }] }
    const schluss: Section = { label: LABEL_ABSCHLUSS, farbe: 'neutral', items: [{ iid: 's1', title: 'Schlussworte · Lied 1 · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] }
    const sonntag = zeige(schluss, { tab: 'we', weeks: [woche([], [wt, schluss])] }).container
    expect(namen(sonntag)).toEqual([t.schlussgebetVorOrt])
    expect(plaetze(sonntag)[0]?.classList.contains('is-vor-ort')).toBe(true)
    cleanup()
    const dienstag = zeige(schluss, { tab: 'mid', weeks: [woche([schluss], [wt])] }).container
    expect(namen(dienstag)).toEqual([t.spurZuteilen])
    expect(plaetze(dienstag)[0]?.classList.contains('is-vor-ort')).toBe(false)
  })

  it('auch der offene Platz nennt seine Rolle', () => {
    /*
      Vorher stand dort nur „— zuteilen". Beim Versammlungsbibelstudium sah
      der Planer damit zwei gleich aussehende Knöpfe und musste antippen, um
      zu erfahren, welcher der Leiter und welcher der Leser ist. Beim
      Schülerteil hängt daran mehr: Die Geschlechterregel gilt für den
      Partner-Platz (`partnerGenderOk`), und welcher das ist, stand nirgends.
    */
    const s = mitPlaetzen()
    ;(s.items[0] as PartItem).names[1]!.rolle = 'Leser'
    const { container } = zeige(s)
    expect(namen(container)[1]).toBe(t.spurZuteilen)
    expect(rollen(container)[1]).toBe('Leser')
    // Offen bleibt er trotzdem — die Beschriftung ist kein Name.
    expect(lage(plaetze(container)[1])).toBe('is-offen')
  })

  it('ohne Rolle bleibt der offene Platz bei der blanken Aufforderung', () => {
    const { container } = zeige(mitPlaetzen())
    expect(plaetze(container)[1]?.querySelector('.platz-rolle')).toBeNull()
  })

  it('die Rolle steht beim Namen, nicht davor', () => {
    const s = mitPlaetzen()
    ;(s.items[0] as PartItem).names[0]!.rolle = 'Leser'
    const { container } = zeige(s)
    expect(namen(container)[0]).toBe('Anton Alt')
    expect(rollen(container)[0]).toContain('Leser')
  })

  it('ein Tipp öffnet das Zuteilungs-Sheet mit Woche, Zusammenkunft, Position und Bereich', () => {
    const { container, dispatch } = zeige(mitPlaetzen(), { week: 0 }, { si: 2 })
    fireEvent.click(plaetze(container)[1]!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({
        kind: 'part', wi: 0, tab: 'mid', si: 2, ii: 0, ni: 1,
        label: 'Bibellesung', priv: 'leser', groups: false,
      }),
    })
  })

  it('die Dauer steht neben dem Titel — erkannt an der Zahl aus den Daten', () => {
    const s = mitPlaetzen()
    ;(s.items[0] as PartItem).mins = 4
    const { container } = zeige(s)
    expect(container.querySelector('.prog-dauer')?.textContent).toBe('4 Min.')
    expect(container.querySelector('.prog-item-meta')).toBeNull()
  })

  it('Abschnitt, Titel und Dauer tragen die Sprache des Programms, die Plätze die des Lesers (T128)', () => {
    // Nach `lang` trennt der Browser: In einer russischen App brach das
    // deutsche „Versammlungsbibelstudium" mitten im Wort.
    const s = mitPlaetzen()
    ;(s.items[0] as PartItem).mins = 4
    const { container } = zeige(s, {}, { sprache: 'es' })
    for (const sel of ['.prog-abschnitt-name', '.prog-title', '.prog-dauer']) {
      expect(container.querySelector(sel)?.getAttribute('lang'), sel).toBe('es')
    }
    expect(plaetze(container)[0]?.closest('[lang]')).toBeNull()
  })

  it('ein Lied ist kein Platz — es steht rechts im Kopf des Abschnitts', () => {
    const s: Section = { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ song: 'Lied 12' }] }
    const { container } = zeige(s)
    expect(plaetze(container)).toHaveLength(0)
    expect(container.querySelector('.prog-abschnitt-kopf .prog-lied')?.textContent).toBe('Lied 12')
  })

  it('das Lied des Wachtturm-Studiums steht im Kopf nur mit Nummer — ohne Liedthema', () => {
    const s: Section = { label: 'WACHTTURM-STUDIUM', kind: 'wtStudium', farbe: 'wein', items: [{ song: 'LIED 129 Demo-Liedthema' }] }
    const { container } = zeige(s)
    expect(container.querySelector('.prog-abschnitt-kopf .prog-lied')?.textContent).toBe('Lied 129')
  })
})

describe('Die Zusage gehört dem Platz, nicht der Person', () => {
  /*
   * Bis zum 14. September 2026 stand hier eine Personen-Markierung: „…" an
   * jedem Platz einer Person, solange sie irgendwo etwas offen hatte. Robert
   * sagt den Vorsitz zu, das Gebet noch nicht — und beide Plätze standen auf
   * „…". Der Planer las daraus, der Vorsitz sei unbestätigt.
   */
  const eroeffnung = (): Section => ({
    label: LABEL_EROEFFNUNG, farbe: 'neutral',
    items: [{ iid: 'i98',
      title: 'Lied 74 · Gebet · Einleitende Worte', meta: '1 Min.',
      names: [
        { name: 'Anton Alt', pid: 'p-a', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
        { name: 'Anton Alt', pid: 'p-a', rolle: 'Gebet', bereichsKey: 'gebet' },
      ],
    }],
  })
  const schluessel = (s: Section, ni: number) =>
    punktKey('2026-09-07', 'mid', (s.items[0] as PartItem).iid, ni)

  it('Vorsitz bestätigt, Gebet noch offen: voll und blass nebeneinander', () => {
    const s = eroeffnung()
    const { container } = zeige(s, { confirmations: { [schluessel(s, 0)]: 'bestätigt' } })
    expect(plaetze(container).map(lage)).toEqual(['is-voll', 'is-wartet'])
  })

  it('eine Absage ist ein Problem — nicht blass wie eine ausstehende Antwort', () => {
    const s = eroeffnung()
    const { container } = zeige(s, { confirmations: { [schluessel(s, 1)]: 'verhindert' } })
    expect(plaetze(container).map(lage)).toEqual(['is-wartet', 'is-problem'])
    expect(plaetze(container)[1]?.querySelector('.platz-hinweis')?.textContent).toBe(t.zusageAbgesagt)
    // Einmal gesagt genügt: Steht die Absage sichtbar da, hört der
    // Screenreader sie nicht ein zweites Mal („abgesagt abgesagt").
    expect(plaetze(container)[1]?.querySelector('.sr-only')).toBeNull()
  })

  it('der Screenreader hört die Stufe als Wort — „wartet" steht sichtbar bei der Rolle', () => {
    // Die Farbe allein sagt einem blinden Planer nichts.
    const s = eroeffnung()
    const { container } = zeige(s, { confirmations: { [schluessel(s, 0)]: 'bestätigt' } })
    expect(plaetze(container).map(zusageWort)).toEqual([t.zusageBestaetigt, t.zusageWartet])
    expect(rollen(container)[1]).toBe(`Gebet · ${t.zusageWartet}`)
    expect(plaetze(container)[0]!.querySelector('.platz-punkt')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('die Zusage einer anderen Woche färbt diesen Platz nicht', () => {
    // Gegenprobe zum Schlüssel: dieselbe Position eine Woche später ist ein
    // anderer Platz.
    const s = eroeffnung()
    const andereWoche = punktKey('2026-09-14', 'mid', (s.items[0] as PartItem).iid, 0)
    const { container } = zeige(s, { confirmations: { [andereWoche]: 'bestätigt' } })
    expect(plaetze(container).map(lage)).toEqual(['is-wartet', 'is-wartet'])
  })
})

describe('Eine Zusage gibt es nur, wo jemand bestätigen kann', () => {
  const rednerAbschnitt = (rolle: string): Section => ({
    label: LABEL_VORTRAG, farbe: 'petrol',
    items: [{ iid: 'i97', num: 1, title: 'Öffentlicher Vortrag', meta: '', names: [{ name: 'Gustav Gast', rolle }] }],
  })

  it('ein offener Platz trägt keine — es gibt noch nichts zu bestätigen', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i96', num: 1, title: 'Punkt', meta: '', names: [{ name: '' }] }],
    }
    const platz = plaetze(zeige(s).container)[0]
    expect(lage(platz)).toBe('is-offen')
    expect(zusageWort(platz)).toBeNull()
  })

  it('ein Gastredner bekommt keine — er hat weder Aufgabe noch App; er steht besetzt da', () => {
    const { container } = zeige(rednerAbschnitt(`${ROLE_GUEST_SPEAKER} · Nordheim`), { tab: 'we' })
    expect(lage(plaetze(container)[0])).toBe('is-voll')
    expect(zusageWort(plaetze(container)[0])).toBeNull()
  })

  it('der Kreisaufseher ebenso wenig', () => {
    const { container } = zeige(rednerAbschnitt(ROLE_CIRCUIT), { tab: 'we' })
    expect(zusageWort(plaetze(container)[0])).toBeNull()
  })

  it('ein eigener Redner dagegen schon — für ihn gibt es den Flow', () => {
    const { container } = zeige(rednerAbschnitt(ROLE_OWN_SPEAKER), { tab: 'we' })
    expect(lage(plaetze(container)[0])).toBe('is-wartet')
  })

  it('eine ausgefallene Zusammenkunft trägt keine — auch nicht mit einer Zusage von vorher (T30)', () => {
    // Die Namen bleiben stehen, die Zusammenkunft findet nicht statt: keine
    // Aufgabe, keine Erinnerung, nichts zu bestätigen. Ein blasser Platz
    // wartete dort für immer, ein voller meldete eine Zusage für einen leeren
    // Abend.
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i95', num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const ausgefallen = woche([s])
    ausgefallen.dev = { mid: { cancelled: true } }
    const key = punktKey('2026-09-07', 'mid', (s.items[0] as PartItem).iid, 0)
    const { container } = zeige(s, { weeks: [ausgefallen], confirmations: { [key]: 'bestätigt' } })
    expect(namen(container)[0]).toBe('Anton Alt')
    expect(zusageWort(plaetze(container)[0])).toBeNull()
  })

  it('… die andere Zusammenkunft derselben Woche zeigt sie weiter', () => {
    // Gegenprobe: Der Ausfall gilt der einen Zusammenkunft, nicht der Woche.
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i94', num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const nurMitteAus = woche([], [s])
    nurMitteAus.dev = { mid: { cancelled: true } }
    const { container } = zeige(s, { tab: 'we', weeks: [nurMitteAus] })
    expect(lage(plaetze(container)[0])).toBe('is-wartet')
  })
})

describe('Der Redner-Platz öffnet immer den Freitext-Weg (T29)', () => {
  const abschnitt = (rolle: string): Section => ({
    label: LABEL_VORTRAG, farbe: 'petrol',
    items: [{ iid: 'i93', num: 1, title: 'Öffentlicher Vortrag', meta: '', names: [{ name: 'X', rolle }] }],
  })

  it('beim Gastredner', () => {
    const { container, dispatch } = zeige(abschnitt(ROLE_GUEST_SPEAKER), { tab: 'we' })
    fireEvent.click(plaetze(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.guest).toBe(true)
  })

  it('und auch beim eigenen Redner — sonst gäbe es keinen Weg zurück', () => {
    const { container, dispatch } = zeige(abschnitt(ROLE_OWN_SPEAKER), { tab: 'we' })
    fireEvent.click(plaetze(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.guest).toBe(true)
  })

  it('an einem gewöhnlichen Platz nicht', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i92', num: 1, title: 'Punkt', meta: '', names: [{ name: '', rolle: 'Leser' }] }],
    }
    const { container, dispatch } = zeige(s)
    fireEvent.click(plaetze(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.guest).toBeFalsy()
  })
})

describe('Die Zusätzliche Klasse als zweite Reihe', () => {
  const schuelerWoche = () => {
    const item: PartItem = { iid: 'i91',
      num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
      names: [{ name: 'Anton Alt', pid: 'p-a', bereichsKey: 'schulung' }],
    }
    return syncAuxSlots([woche([{ label: 'UNS IM DIENST VERBESSERN', farbe: 'gold', items: [item] }])], true)
  }

  it('ohne eingerichtete Klasse bleibt es bei einer Reihe — ohne Raumnamen', () => {
    const weeks = schuelerWoche()
    const { container } = zeige(weeks[0]!.mid.sections[0]!, { weeks }, { mitAux: false })
    expect(plaetze(container)).toHaveLength(1)
    expect(container.querySelector('.prog-raum')).toBeNull()
  })

  it('mit Klasse stehen zwei Reihen da, jede mit ihrem Raumnamen', () => {
    const weeks = schuelerWoche()
    const { container } = zeige(weeks[0]!.mid.sections[0]!, { weeks, auxClass: true }, { mitAux: true })
    expect(plaetze(container)).toHaveLength(2)
    expect([...container.querySelectorAll('.prog-raum')].map((x) => x.textContent)).toEqual([
      t.auxHauptsaal, t.auxKlasse,
    ])
  })

  it('nur Schülerteile bekommen die zweite Reihe — Gebet und Vorsitz nicht', () => {
    const s: Section = {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ iid: 'i90', title: 'Lied 12 · Gebet', meta: '', names: [{ name: '', rolle: 'Gebet' }] }],
    }
    const { container } = zeige(s, { auxClass: true }, { mitAux: true })
    expect(plaetze(container)).toHaveLength(1)
    expect(container.querySelector('.prog-raum')).toBeNull()
  })

  it('der Platz der Klasse öffnet das Sheet mit dem Raum im Titel', () => {
    const weeks = schuelerWoche()
    const { container, dispatch } = zeige(
      weeks[0]!.mid.sections[0]!, { weeks, auxClass: true }, { mitAux: true },
    )
    fireEvent.click(plaetze(container).at(-1)!)
    const sel = dispatch.mock.calls[0]![0].sel
    expect(sel.aux).toBe(true)
    expect(sel.labelRolle).toContain(t.auxKlasse)
  })

  it('der Hauptsaal-Platz trägt kein aux-Kennzeichen', () => {
    const weeks = schuelerWoche()
    const { container, dispatch } = zeige(
      weeks[0]!.mid.sections[0]!, { weeks, auxClass: true }, { mitAux: true },
    )
    fireEvent.click(plaetze(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.aux).toBeUndefined()
  })
})

describe('Den Ablauf ändert man nicht beim Zuteilen (T121, Phase 5b)', () => {
  /*
   * Minuten, Reihenfolge, Entfernen und eigene Punkte standen bis Phase 5b
   * mitten im Plan, an jedem Punkt von „Unser Leben als Christ". Seitdem
   * stehen sie im Blatt hinter „Woche einrichten" (`ProgrammBlatt.test.tsx`);
   * hier wird nur noch zugeteilt — auch beim Admin.
   */
  const lac = (): Section => ({
    label: LABEL_LAC, farbe: 'wein',
    items: [
      { iid: 'i89', num: 8, title: 'Örtliche Hinweise', meta: '5 Min.', mins: 5, names: [{ name: '' }] },
      { iid: 'i88', num: 9, title: 'Versammlungsbibelstudium', meta: '30 Min.', mins: 30, names: [{ name: '', rolle: 'Leiter' }, { name: '', rolle: 'Leser' }] },
    ],
  })

  it('weder Minuten noch Verschieben, Entfernen oder Einfügen — die Plätze aber schon', () => {
    const { container } = zeige(lac())
    expect(container.querySelector('.plus-minus')).toBeNull()
    expect(container.querySelector('.lac-move-btn')).toBeNull()
    expect(container.querySelector('.knopf-entfernen')).toBeNull()
    expect(container.querySelector('input:not(.talk-title-input)')).toBeNull()
    expect(plaetze(container)).toHaveLength(3)
  })
})

describe('Der Gesprächspartner-Platz lässt sich an- und abschalten', () => {
  const gespraech = (mitPartner: boolean): Section => ({
    label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
    items: [{ iid: 'i84',
      num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
      names: [
        { name: '', bereichsKey: 'schulung' },
        ...(mitPartner ? [{ name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' }] : []),
      ],
    }],
  })

  it('ohne Partner bietet er das Hinzufügen an', () => {
    const { container, dispatch } = zeige(gespraech(false))
    const b = knopf(container, t.partnerHinzu)
    fireEvent.click(b)
    expect(dispatch).toHaveBeenCalledWith({ type: 'togglePartner', si: 0, ii: 0 })
  })

  it('mit Partner das Entfernen — erst nach der Rückfrage, denn mit dem Platz geht, wer dort steht', () => {
    const { container, dispatch } = zeige(gespraech(true))
    fireEvent.click(knopf(container, t.partnerEntfernen))
    expect(dispatch).not.toHaveBeenCalled()
    bestaetigen(knopf(container, t.entfernenSicher))
    expect(dispatch).toHaveBeenCalledWith({ type: 'togglePartner', si: 0, ii: 0 })
  })

  it('an einem Punkt ohne Schulungs-Platz gibt es den Schalter gar nicht', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i83', num: 1, title: 'Punkt', meta: '', names: [{ name: '', bereichsKey: 'leser' }] }],
    }
    const { container } = zeige(s)
    expect(container.querySelector('.partner-toggle')).toBeNull()
  })
})

describe('Am Wochenende: Vortragsthema und Lieder', () => {
  const vortrag = (titel: string): Section => ({
    label: LABEL_VORTRAG, farbe: 'petrol',
    items: [{ iid: 'i82', num: 1, title: titel, meta: '', names: [{ name: '', rolle: ROLE_GUEST_SPEAKER }] }],
  })

  it('der Platzhalter erscheint als leeres Feld, nicht als Text', () => {
    const { container } = zeige(vortrag(TALK_PLACEHOLDER), { tab: 'we' })
    const feld = container.querySelector<HTMLInputElement>('.talk-title-input')!
    expect(feld.value).toBe('')
    expect(feld.placeholder).toBe(t.vortragThemaPh)
  })

  it('ein eingetragenes Thema steht im Feld und wird beim Verlassen gespeichert', () => {
    const { container, dispatch } = zeige(vortrag('Wer ist wirklich glücklich?'), { tab: 'we' })
    const feld = container.querySelector<HTMLInputElement>('.talk-title-input')!
    expect(feld.value).toBe('Wer ist wirklich glücklich?')
    fireEvent.blur(feld, { target: { value: 'Neues Thema' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'talkEdit', si: 0, ii: 0, title: 'Neues Thema' })
  })

  it('Enter übernimmt ebenfalls — man muss nicht wegtippen', () => {
    const { container, dispatch } = zeige(vortrag('Alt'), { tab: 'we' })
    const feld = container.querySelector<HTMLInputElement>('.talk-title-input')!
    document.body.append(container) // damit `focus()` in jsdom greift
    feld.focus()
    fireEvent.change(feld, { target: { value: 'Neu' } })
    fireEvent.keyDown(feld, { key: 'Enter' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'talkEdit', si: 0, ii: 0, title: 'Neu' })
  })

  /** Eröffnung/Abschluss, wie der Import sie anlegt: das Lied als Atom im Sammeltitel. */
  const liedBlock = (label: string, title: string): Section => ({
    label, farbe: 'neutral',
    items: [{ iid: 'i90', title, names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
  })

  it('das Anfangslied ist ein Nummernfeld — Buchstaben kommen nicht hinein', () => {
    const s = liedBlock(LABEL_EROEFFNUNG, 'Lied 44 · Gebet')
    const { container, dispatch } = zeige(s, { tab: 'we', weeks: [woche([], [s])] })
    const feld = container.querySelector<HTMLInputElement>('.talk-song-input')!
    expect(container.querySelector('.plan-helper-label')?.textContent).toBe(t.anfangsliedLbl)
    feld.value = '4a4'
    fireEvent.input(feld)
    expect(feld.value).toBe('44')
    fireEvent.blur(feld, { target: { value: '44' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'openingSong', song: '44' })
  })

  it('das Schlusslied schreibt in seine eigene Aktion', () => {
    const s = liedBlock(LABEL_ABSCHLUSS, 'Schlussworte · Lied 100 · Gebet')
    const { container, dispatch } = zeige(s, { tab: 'we', weeks: [woche([], [s])] })
    fireEvent.blur(container.querySelector('.talk-song-input')!, { target: { value: '100' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'closingSong', song: '100' })
  })

  it('unter der Woche gibt es die Lied-Nummernfelder nicht — sie stehen im Arbeitsheft', () => {
    const s = liedBlock(LABEL_EROEFFNUNG, 'Lied 44 · Gebet · Einleitende Worte')
    const { container } = zeige(s, { tab: 'mid' })
    expect(container.querySelector('.talk-song-input')).toBeNull()
  })

  it('ohne Platz für die Nummer steht auch kein Feld da (V7)', () => {
    /*
      `setSong` schreibt die Zahl in das Lied-Atom des Sammeltitels. Trägt der
      Abschnitt keins, hätte es nichts, wohin — und gab stumm dieselbe Woche
      zurück: Der Planer tippte eine Nummer ein und sah nichts. Was nicht
      wirken kann, wird nicht angeboten.
    */
    const ohneLied: Section = {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ iid: 'i81', num: null as unknown as number, title: 'Gebet', meta: '', names: [{ name: '' }] }],
    }
    const { container } = zeige(ohneLied, { tab: 'we', weeks: [woche([], [ohneLied])] })
    expect(container.querySelector('.talk-song-input')).toBeNull()
  })

  it('… mit Lied-Atom im Sammeltitel dagegen schon', () => {
    // Gegenprobe: So legt der Import die Wochenend-Eröffnung an.
    const mitAtom: Section = {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ iid: 'i80', title: 'Lied · Gebet', meta: '', names: [{ name: '' }] }],
    }
    const { container } = zeige(mitAtom, { tab: 'we', weeks: [woche([], [mitAtom])] })
    expect(container.querySelector('.talk-song-input')).not.toBeNull()
  })
})

describe('Die Kreisaufseher-Woche: fester Begriff, freies Thema (T62)', () => {
  const coPunkt = (): Section => ({
    label: LABEL_LAC, farbe: 'wein',
    items: [{ iid: 'i79',
      num: 8, title: 'Dienstvortrag · Bleiben wir wachsam', meta: '30 Min.', mins: 30,
      names: [{ name: 'Kreisaufseher', rolle: ROLE_CIRCUIT }],
    }],
  })

  it('der Begriff steht fest davor, das Thema im Feld dahinter', () => {
    const { container } = zeige(coPunkt())
    expect(container.querySelector('.co-begriff')?.textContent).toBe('Dienstvortrag')
    expect(container.querySelector<HTMLInputElement>('.talk-title-input')?.value).toBe(
      'Bleiben wir wachsam',
    )
  })

  it('das Thema wird unter seinem Begriff gespeichert — der Begriff bleibt', () => {
    const { container, dispatch } = zeige(coPunkt())
    fireEvent.blur(container.querySelector('.talk-title-input')!, { target: { value: 'Neu' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setPartThema', tab: 'mid', si: 0, ii: 0, begriff: 'Dienstvortrag', thema: 'Neu',
    })
  })
})

describe('Ändert sich ein Titel von außen, zeigt das Feld den neuen', () => {
  /*
    Thema- und Liedfelder sind ungesteuert (`defaultValue`). Steht der
    gespeicherte Wert nicht im Schlüssel, bleibt nach einer Änderung von außen —
    Vortragsplan (T122), Nachladen — der alte Text stehen, und das Verlassen des
    Felds schriebe ihn zurück. Dasselbe Bauteil, nur neu gezeichnet.
  */
  function Buehne({ section, tab }: { section: Section; tab: 'mid' | 'we' }) {
    const state: AppState = {
      ...demoZustand(),
      dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
      persons: PERSONEN, services: [], groups: [], absences: [], confirmations: {},
      weeks: [tab === 'we' ? woche([], [section]) : woche([section])], fsWeeks: [[]], tab,
    }
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <MeetingSection si={0} section={section} rawSection={section} mitAux={false} tpw={(s) => s} sprache="de" />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }

  const punkt = (label: string, title: string, rolle: string): Section => ({
    label, farbe: 'neutral', items: [{ iid: 'i70', title, meta: '', names: [{ name: '', rolle }] }],
  })

  it.each([
    ['Vortragsthema', 'we', LABEL_VORTRAG, ROLE_GUEST_SPEAKER, 'Altes Thema', 'Neues Thema', '.talk-title-input', 'Neues Thema'],
    ['Anfangslied', 'we', LABEL_EROEFFNUNG, 'Gebet', 'Lied 44 · Gebet', 'Lied 12 · Gebet', '.talk-song-input', '12'],
    ['Thema der Kreisaufseher-Woche', 'mid', LABEL_LAC, ROLE_CIRCUIT, 'Dienstvortrag · Alt', 'Dienstvortrag · Neu', '.talk-title-input', 'Neu'],
  ] as const)('%s', (_name, tab, label, rolle, vorher, nachher, feld, erwartet) => {
    const { container, rerender } = render(<Buehne section={punkt(label, vorher, rolle)} tab={tab} />)
    rerender(<Buehne section={punkt(label, nachher, rolle)} tab={tab} />)
    expect(container.querySelector<HTMLInputElement>(feld)?.value).toBe(erwartet)
  })
})

describe('Konflikte heben sich im Plan ab', () => {
  it('wer abwesend und trotzdem eingeteilt ist, steht rot da — mit dem Grund', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i78', num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const { container } = zeige(s, {
      weeks: [woche([s])],
      absences: [{ id: 'a1', personId: 'p-a', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' }],
      congregation: { name: '', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    })
    expect(lage(plaetze(container)[0])).toBe('is-problem')
    expect(plaetze(container)[0]!.querySelector('.platz-hinweis')?.textContent).toBe(t.abwesendChip)
  })

  it('ohne Konflikt bleibt der Platz, wie seine Zusage steht', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ iid: 'i77', num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const { container } = zeige(s, { weeks: [woche([s])] })
    expect(lage(plaetze(container)[0])).toBe('is-wartet')
    expect(plaetze(container)[0]!.querySelector('.platz-hinweis')).toBeNull()
  })
})
