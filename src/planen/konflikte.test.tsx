/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import { bibelbuecherLaden, makeTr } from '../i18n/translate'
import { dict } from '../i18n/ui'
import { KEINE_ABWESENHEIT } from '../data/absence'
import { type Conflict, weekConflicts } from '../data/planung/konflikte'
import { punktKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { besetzung } from '../data/saal'
import type { Meeting, Person, Service, Week } from '../data/types'
import { BesetzungKarte } from './WochenStand'
import { HelpersPanel } from './HelpersPanel'
import { konflikteVon, machKonfliktVon } from './useKonflikte'
import { problemGrund } from './platz-anzeige'

/**
 * Die Konflikte unter „Zu klären" und der Plan darunter.
 *
 * **T76:** Die betroffenen Zuteilungen sahen im Programm aus wie alle anderen —
 * den genannten Namen musste man darunter erst suchen. Seit T121 steht der
 * Platz rot da, mit dem Grund am Ende der Zeile.
 *
 * **T81:** Die Serie („3 Wochen in Folge") ist ganz weggefallen, und mit ihr
 * der Aufklapper, der einzig sie kürzte.
 *
 * Die Wochen hier sind mit Absicht selbst gebaut und nicht die Demo-Daten: die
 * bringen eigene Konflikte mit, und dann prüfte der Test die Demo statt die
 * Regel.
 */

const t = dict('de')

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

afterEach(cleanup)

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'ton', name: 'Tonanlage', count: 1, groups: false },
]

const person = (id: string, name: string): Person => ({
  id, fn: name, ln: '', role: 'verkuendiger', priv: emptyQualifications(),
})

/** Zusammenkunft mit einem Programmpunkt (die genannten Namen) und Hilfsdiensten. */
function zusammenkunft(namen: Array<{ name: string; pid?: string }>, helpers: Meeting['helpers'] = {}): Meeting {
  return {
    date: '', end: '',
    sections: [
      { label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: [{ iid: 'i76', title: 'Punkt', meta: '', names: namen }] },
    ],
    helpers,
  }
}

/** Aufeinanderfolgende Montage — sonst zählt keine Serie (T36). */
const MONTAGE = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']

function woche(i: number, mid: Meeting): Week {
  return {
    range: '', book: '', start: MONTAGE[i]!,
    mid,
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

/**
 * `anzahl` Personen, jede in den Wochen 0–2 auf demselben Programmpunkt (Woche
 * 3 bleibt frei, sonst ist es keine auffällige Serie, sondern Dauerbetrieb).
 */
function mitSerien(anzahl: number): { weeks: Week[]; persons: Person[] } {
  const persons = Array.from({ length: anzahl }, (_, n) => person(`p${n}`, `Serie ${n}`))
  const namen = persons.map((p) => ({ name: p.fn, pid: p.id }))
  const weeks = [
    woche(0, zusammenkunft(namen)),
    woche(1, zusammenkunft(namen)),
    woche(2, zusammenkunft(namen)),
    woche(3, zusammenkunft([{ name: '' }])),
  ]
  return { weeks, persons }
}

const basis = (over: Partial<AppState>): AppState => ({
  ...demoZustand(),
  week: 1, // mittlere Woche der Serie
  admin: true,
  services: DIENSTE,
  absences: [],
  ...over,
})

/** Die Konflikte unter „Zu klären" (ohne die Engpässe daneben). */
const probleme = (c: HTMLElement) =>
  [...c.querySelectorAll('.klaeren-zeile[data-art="konflikt"]')].map((x) => x.textContent ?? '')

describe('T81 — Serien sind kein Konflikt mehr', () => {
  it('drei Wochen in Folge ergeben keine Zeile unter „Zu klären"', () => {
    /*
     * Der Fall, der das Banner früher füllte: drei Personen, jede drei Wochen
     * am Stück auf demselben Programmpunkt. Das war der Normalfall einer
     * kleinen Versammlung — und stand deshalb fast immer da.
     */
    const { weeks, persons } = mitSerien(6)
    const { container } = render(
      <Buehne state={basis({ weeks, persons })}>
        <BesetzungKarte tab="mid" tpw={(s) => s} sprache="de" />
      </Buehne>,
    )
    expect(probleme(container)).toEqual([])
  })
})

describe('T76 — die betroffene Zuteilung hebt sich im Plan ab', () => {
  const plaetze = (c: HTMLElement) => [...c.querySelectorAll('.platz')]
  const markiert = (c: HTMLElement) => plaetze(c).filter((el) => el.classList.contains('is-problem'))

  /** Eine Woche, in der Anna Programmpunkt UND Hilfsdienst hat (helperTask). */
  const mitHelferKonflikt = (): { state: AppState; meeting: Meeting } => {
    const anna = person('p-anna', 'Anna')
    const bernd = person('p-bernd', 'Bernd')
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna.id }], {
      ton: [{ name: 'Anna', pid: anna.id }],
      mik: [{ name: 'Bernd', pid: bernd.id }, { name: '' }],
    })
    return {
      state: basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna, bernd] }),
      meeting,
    }
  }

  it('markiert den Platz der betroffenen Person — und nur ihn', () => {
    const { state, meeting } = mitHelferKonflikt()
    const { container } = render(
      <Buehne state={state}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(1)
    expect(markiert(container)[0]?.querySelector('.platz-name')?.textContent).toBe('Anna')
    // Bernd steht nur einmal da und bleibt unberührt.
    const bernd = plaetze(container).find((el) => el.textContent?.includes('Bernd'))
    expect(bernd?.classList.contains('is-problem')).toBe(false)
  })

  it('der rote Platz nennt den Grund am Ende der Zeile', () => {
    // Hilfsdienst und Aufgabe am selben Tag: Die Person ist schon eingeteilt.
    const { state, meeting } = mitHelferKonflikt()
    const { container } = render(
      <Buehne state={state}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)[0]?.querySelector('.platz-hinweis')?.textContent).toBe(t.sheetSchonHeute)
  })

  it('ohne Konflikt bleibt kein Platz markiert', () => {
    const anna = person('p-anna', 'Anna')
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna.id }], { ton: [{ name: '' }], mik: [] })
    const { container } = render(
      <Buehne state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna] })}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(0)
  })

  it('markiert auch Plätze ohne Person-Id — über den Anzeigenamen', () => {
    /*
     * Am laufenden Demo-Stand aufgefallen, nicht am Reißbrett: dort tragen die
     * Hilfsdienst-Plätze **keine** `pid`. Die Konfliktprüfung löst den Namen
     * über die Personenliste zu einer Id auf, die Markierung verglich aber
     * `pid`/Name direkt — der abwesende Ordner stand im Banner, sein Platz blieb
     * unmarkiert. Beide Seiten müssen dieselbe Auflösung benutzen.
     */
    const anna = person('p-anna', 'Anna')
    const meeting = zusammenkunft([{ name: 'Anna' }], { ton: [{ name: 'Anna' }] }) // ohne pid
    const { container } = render(
      <Buehne state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna] })}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(1)
  })

  it('die Markierung folgt der Person-Id, nicht dem Namen', () => {
    // Zwei Personen desselben Anzeigenamens: im Konflikt ist nur die eine.
    // Über den Namen gesucht leuchtete auch die andere auf (T57).
    const anna1 = person('p-anna-1', 'Anna')
    const anna2 = person('p-anna-2', 'Anna')
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna1.id }], {
      ton: [{ name: 'Anna', pid: anna1.id }],
      mik: [{ name: 'Anna', pid: anna2.id }, { name: '' }],
    })
    const { container } = render(
      <Buehne state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna1, anna2] })}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(markiert(container)).toHaveLength(1)
  })

  it('die Gruppen-Rotation ist keine Person und wird nie markiert', () => {
    const anna = person('p-anna', 'Anna')
    const dienste: Service[] = [...DIENSTE, { key: 'rein', name: 'Reinigung', count: 1, groups: true }]
    const meeting = zusammenkunft([{ name: 'Anna', pid: anna.id }], {
      ton: [{ name: 'Anna', pid: anna.id }],
      rein: [{ name: 'Gruppe 1' }],
    })
    const { container } = render(
      <Buehne
        state={basis({ weeks: [woche(0, meeting)], week: 0, persons: [anna], services: dienste })}
      >
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    const gruppe = plaetze(container).find((el) => el.textContent?.includes('Gruppe 1'))
    expect(gruppe?.classList.contains('is-problem')).toBe(false)
  })
})

/**
 * **Was unter „Zu klären" steht, wenn es etwas zu sagen gibt.**
 *
 * Darauf handelt der Planer: Er liest einen Namen und eine Aussage und geht
 * dann in den Plan. Steht dort die falsche Aussage, sucht er den falschen
 * Fehler.
 *
 * Drei Arten, drei Sätze, feste Reihenfolge: Abwesenheit zuerst (sie ist die
 * schwerste, denn die Person kommt gar nicht), dann Doppelbelegung, dann
 * Hilfsdienst-und-Aufgabe.
 */
describe('Die Konflikt-Sätze', () => {
  const KAI = person('p-k', 'Kai')

  const zeigeKonflikt = (over: Partial<AppState>, tab: 'mid' | 'we' = 'mid') =>
    render(
      <Buehne state={basis({ persons: [KAI], week: 0, ...over })}>
        <BesetzungKarte tab={tab} tpw={(s) => s} sprache="de" />
      </Buehne>,
    )

  it('abwesend und trotzdem eingeteilt — mit Namen und Zusammenkunft', () => {
    const { container } = zeigeKonflikt({
      weeks: [woche(0, zusammenkunft([{ name: 'Kai', pid: 'p-k' }]))],
      absences: [{ id: 'a1', personId: 'p-k', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' }],
      congregation: { name: '', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    })
    expect(probleme(container)).toEqual(['Kai ist abwesend, aber eingeteilt · Zusammenkunft unter der Woche'])
  })

  it('zweimal Hilfsdienst am selben Tag — mit der Anzahl', () => {
    const { container } = zeigeKonflikt({
      weeks: [woche(0, zusammenkunft([{ name: '' }], {
        mik: [{ name: 'Kai', pid: 'p-k' }],
        ton: [{ name: 'Kai', pid: 'p-k' }],
      }))],
    })
    expect(probleme(container)).toEqual(['Kai ist 2× in einer Zusammenkunft · Zusammenkunft unter der Woche'])
  })

  it('Hilfsdienst und Programmpunkt am selben Tag — der eigene Satz', () => {
    const { container } = zeigeKonflikt({
      weeks: [woche(0, zusammenkunft([{ name: 'Kai', pid: 'p-k' }], {
        mik: [{ name: 'Kai', pid: 'p-k' }],
      }))],
    })
    expect(probleme(container)).toEqual([
      'Kai hat Hilfsdienst und Aufgabe am selben Tag · Zusammenkunft unter der Woche',
    ])
  })

  it('mehrere Arten stehen in fester Reihenfolge: abwesend, doppelt, Hilfsdienst+Aufgabe', () => {
    // Sonst wandert die schwerste Meldung je nach Datenlage an eine andere
    // Stelle, und der Planer sucht sie jedes Mal neu.
    const LEA = person('p-l', 'Lea')
    const MIA = person('p-m', 'Mia')
    const { container } = zeigeKonflikt({
      persons: [KAI, LEA, MIA],
      weeks: [woche(0, zusammenkunft([{ name: 'Kai', pid: 'p-k' }, { name: 'Mia', pid: 'p-m' }], {
        mik: [{ name: 'Lea', pid: 'p-l' }, { name: 'Lea', pid: 'p-l' }],
        ton: [{ name: 'Mia', pid: 'p-m' }],
      }))],
      absences: [{ id: 'a1', personId: 'p-k', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' }],
      congregation: { name: '', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    })
    expect(probleme(container).map((z) => z.split(' ')[0])).toEqual(['Kai', 'Lea', 'Mia'])
    expect(probleme(container)[0]).toContain('abwesend')
  })

  it('am Wochenende nennt derselbe Satz die andere Zusammenkunft', () => {
    const w = woche(0, zusammenkunft([{ name: '' }]))
    w.we = zusammenkunft([{ name: 'Kai', pid: 'p-k' }], { mik: [{ name: 'Kai', pid: 'p-k' }] })
    const { container } = zeigeKonflikt({ weeks: [w] }, 'we')
    expect(probleme(container)[0]).toContain('Zusammenkunft am Wochenende')
  })

  it('ein Paar, das nicht zueinander passt — mit beiden Namen', () => {
    const anna: Person = { ...person('p-a', 'Anna'), female: true }
    const bernd = person('p-b', 'Bernd')
    const meeting: Meeting = {
      date: '', end: '', helpers: {},
      sections: [{
        label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
        items: [{
          iid: 'g1', title: 'Gespräche beginnen', meta: '',
          names: [
            { name: 'Anna', pid: anna.id, bereichsKey: 'schulung' },
            { name: 'Bernd', pid: bernd.id, rolle: 'Partner', bereichsKey: 'schulungPartner' },
          ],
        }],
      }],
    }
    const { container } = zeigeKonflikt({ persons: [anna, bernd], weeks: [woche(0, meeting)] })
    expect(probleme(container)).toEqual([
      'Bernd passt nicht als Partner zu Anna — gleiches Geschlecht oder Familie · Zusammenkunft unter der Woche',
    ])
  })
})

describe('Der Grund am Platz: die Abwesenheit vor der Doppelbelegung', () => {
  it('steht eine Person in mehreren Konflikten, gilt die Abwesenheit — gleich, in welcher Reihenfolge', () => {
    // Sie sagt, warum der Platz so nicht bleiben kann: Die Person kommt gar
    // nicht. `weekConflicts` liefert sie heute zuerst; darauf verlässt sich die
    // Zuordnung nicht.
    const anna = person('p-anna', 'Anna')
    const doppelt: Conflict = { kind: 'double', name: 'Anna', kennung: anna.id, tab: 'mid', count: 2 }
    const weg: Conflict = { kind: 'absent', name: 'Anna', kennung: anna.id, tab: 'mid' }
    const platz = { name: 'Anna', pid: anna.id }
    expect(machKonfliktVon([anna], [doppelt, weg])(platz, 'k')?.kind).toBe('absent')
    expect(machKonfliktVon([anna], [weg, doppelt])(platz, 'k')?.kind).toBe('absent')
  })

  it('ein unpassendes Paar sagt es am Platz selbst — nicht „An diesem Tag schon"', () => {
    const paar: Conflict = { kind: 'partner', name: 'Bernd', kennung: 'p-b', tab: 'mid', zu: 'Anna' }
    expect(problemGrund(paar, t)).toBe(t.paarPasstNicht)
    expect(problemGrund({ ...paar, kind: 'double', count: 2 }, t)).toBe(t.sheetSchonHeute)
  })

  it('das unpassende Paar trifft nur den Platz des Partners — sein Schlussgebet am selben Abend nicht', () => {
    // Wer abwesend ist oder doppelt steht, fehlt überall; wer nicht zum
    // Gesprächsführer passt, passt nur dort nicht. Zwei Programmpunkte am
    // selben Abend sind kein Konflikt — das Gebet bleibt, wie es ist.
    const anna = { ...person('p-anna', 'Anna'), female: true }
    const bernd = person('p-bernd', 'Bernd')
    const partner = { name: 'Bernd', pid: bernd.id, rolle: 'Partner', bereichsKey: 'schulungPartner' }
    const gebet = { name: 'Bernd', pid: bernd.id, rolle: 'Gebet', bereichsKey: 'gebet' }
    const meeting: Meeting = {
      date: '', end: '', helpers: {},
      sections: [
        {
          label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
          items: [{
            iid: 'g1', title: 'Gespräche beginnen', meta: '',
            names: [{ name: 'Anna', pid: anna.id, bereichsKey: 'schulung' }, partner],
          }],
        },
        { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ iid: 'e1', title: 'Schlussworte · Gebet', meta: '', names: [gebet] }] },
      ],
    }
    const liste = weekConflicts([woche(0, meeting)], 0, [anna, bernd], DIENSTE, 'mid', KEINE_ABWESENHEIT)
    const von = machKonfliktVon([anna, bernd], liste)
    const woche0 = MONTAGE[0]!
    expect(von(partner, punktKey(woche0, 'mid', 'g1', 1, false))?.kind).toBe('partner')
    expect(von(gebet, punktKey(woche0, 'mid', 'e1', 0, false)), 'das Gebet steht nicht in Frage').toBeUndefined()
  })

  it('Partner in zwei Schülerteilen: rot nur dort, wo er nicht zum Gesprächsführer passt', () => {
    // Bernd begleitet Anna (eine Schwester, nicht aus seinem Haushalt: passt
    // nicht) und Carl (passt). Derselbe Bereich, zwei Plätze — nur der erste
    // steht in Frage, im Plan wie im Balken der Planungs-Karte.
    const anna = { ...person('p-anna', 'Anna'), female: true }
    const bernd = person('p-bernd', 'Bernd')
    const carl = person('p-carl', 'Carl')
    const partner = { name: 'Bernd', pid: bernd.id, rolle: 'Partner', bereichsKey: 'schulungPartner' }
    const meeting: Meeting = {
      date: '', end: '', helpers: {},
      sections: [{
        label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
        items: [
          { iid: 'g1', title: 'Gespräche beginnen', meta: '', names: [{ name: 'Anna', pid: anna.id, bereichsKey: 'schulung' }, partner] },
          { iid: 'g2', title: 'Interesse fördern', meta: '', names: [{ name: 'Carl', pid: carl.id, bereichsKey: 'schulung' }, partner] },
        ],
      }],
    }
    const personen = [anna, bernd, carl]
    const woche0 = MONTAGE[0]!
    const k = konflikteVon([woche(0, meeting)], 0, personen, DIENSTE, 'mid', KEINE_ABWESENHEIT)
    expect(k.von(partner, punktKey(woche0, 'mid', 'g1', 1, false))?.kind).toBe('partner')
    expect(k.von(partner, punktKey(woche0, 'mid', 'g2', 1, false)), 'bei Carl passt er').toBeUndefined()
    expect(besetzung(meeting, DIENSTE, {}, {}, woche0, 'mid', null, k.betrifft).problem).toBe(1)
  })
})

/*
 * **Der Name am Platz** (15.10.2026): Eine Person steht da, wie sie heißt —
 * der Übersetzer erkennt Bibelstellen und machte auf Englisch aus dem Zusatz
 * gegen Namensgleichheit ein Bibelbuch („Mark 2 Weber"). Nur der Name einer
 * Gruppe (Reinigung) steht kanonisch deutsch im Platz und wird übersetzt.
 */
describe('Der Name am Hilfsdienst-Platz', () => {
  const namen = (c: HTMLElement) => [...c.querySelectorAll('.platz-name')].map((x) => x.textContent ?? '')

  it('in fremder Oberfläche: die Person, wie sie heißt — die Gruppe übersetzt', async () => {
    // Die Buchtabellen kommen nachgeladen; ohne sie griffe die Buch-Regel gar
    // nicht, und der Test prüfte nichts — deshalb erst die Gegenprobe.
    await bibelbuecherLaden()
    expect(makeTr('en')('Markus 2 Weber')).toBe('Mark 2 Weber')
    const markus = person('p-m', 'Markus 2 Weber')
    const meeting = zusammenkunft([{ name: '' }], {
      mik: [{ name: 'Markus 2 Weber', pid: markus.id }],
      rein: [{ name: 'Gruppe 1' }],
    })
    const state = basis({
      weeks: [woche(0, meeting)],
      week: 0,
      persons: [markus],
      lang: 'en',
      services: [
        { key: 'mik', name: 'Mikrofone', count: 1, groups: false },
        { key: 'rein', name: 'Reinigung', count: 1, groups: true },
      ],
    })
    const { container } = render(
      <Buehne state={state}>
        <HelpersPanel meeting={meeting} />
      </Buehne>,
    )
    expect(makeTr('en')('Gruppe 1')).not.toBe('Gruppe 1')
    expect(namen(container)).toEqual(['Markus 2 Weber', makeTr('en')('Gruppe 1')])
  })
})
