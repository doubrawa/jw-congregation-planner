/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { fsKey, helferKey, ozKey, punktKey, ratgeberKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { rechteVon } from '../data/rechte'
import type { MyTask, Notification, Week } from '../data/types'
import { NOTIF_TITLE_KEY } from '../i18n/ui'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { AppState } from './context'
import { AN_DIE_PLANER, ERSATZ_GESUCHT, mitteilungsZiel, sichtbareMitteilungen, type ZielLage } from './mitteilungen'
import { reducer } from './reducer'

const zeile = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1', type: 'verhindert', title: 'Verhinderung gemeldet', text: 'Mikrofone — X',
  at: '2026-10-01T10:00:00.000Z', read: false, ...over,
})

describe('sichtbareMitteilungen', () => {
  it('ein Verkündiger sieht seine eigene, lokal entstandene Absage-Meldung nicht', () => {
    // Sie ist für die Admins bestimmt und kommt bei ihm nach dem Laden ohnehin
    // nicht wieder — stand aber bis zum 1.10.2026 als „Neu" in seiner Glocke.
    const lokal = zeile({ id: 'lokal', local: true })
    const geladen = zeile({ id: 'geladen', type: 'erinnerung', title: 'Erinnerung' })
    expect(sichtbareMitteilungen([lokal, geladen], false).map((n) => n.id)).toEqual(['geladen'])
  })

  it('ein Admin sieht alles — die lokale Zeile ist das Echo dessen, was er auch geladen bekäme', () => {
    const lokal = zeile({ id: 'lokal', local: true })
    expect(sichtbareMitteilungen([lokal], true)).toEqual([lokal])
  })
})

/** Zwei geladene Wochen; alles andere liegt außerhalb des Ladefensters. */
const WOCHEN = [{ start: '2026-09-07' }, { start: '2026-09-14' }] as Week[]
const lage = (over: Partial<ZielLage> = {}): ZielLage => ({ zuteilen: false, weeks: WOCHEN, myTasks: [], ...over })
const aufgabe = (id: string): MyTask => ({ id, title: '', date: '', at: null, status: 'offen', s89: null })

const PUNKT = punktKey('2026-09-14', 'mid', 'k3f9x', 0)
const HILFSDIENST = helferKey('2026-09-14', 'we', 'mik', 1)
const TREFFPUNKT = fsKey('2026-09-14', 'i1')
const ZEUGNIS = ozKey('2026-09-14', 'e1')
/** Eine Woche, die nicht geladen ist. */
const FERN = punktKey('2027-03-01', 'mid', 'k1', 0)

describe('mitteilungsZiel — ein Tipp führt dorthin, wo die Mitteilung herkommt', () => {
  it('die eigene Aufgabe: „Meine Aufgaben" mit ihrem Blatt', () => {
    const n = zeile({ type: 'zuteilung', title: 'Neue Zuteilung', taskId: PUNKT })
    expect(mitteilungsZiel(n, lage({ myTasks: [aufgabe(PUNKT)] }))).toEqual([
      { type: 'navigate', screen: 'aufgaben' },
      { type: 'openMyTask', id: PUNKT },
    ])
  })

  it('„Ersatz gesucht" springt zum Einspringen — wie der Push, auch beim Planer', () => {
    const n = zeile({ type: 'zuteilung', title: ERSATZ_GESUCHT, taskId: HILFSDIENST })
    const ziel = [{ type: 'navigate', screen: 'aufgaben', abschnitt: 'einspringen' }]
    expect(mitteilungsZiel(n, lage())).toEqual(ziel)
    expect(mitteilungsZiel(n, lage({ zuteilen: true }))).toEqual(ziel)
  })

  it('eine Absage führt den Planer in die Woche der Aufgabe, in ihre Zusammenkunft', () => {
    expect(mitteilungsZiel(zeile({ taskId: PUNKT }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'mid' } },
    ])
    expect(mitteilungsZiel(zeile({ taskId: HILFSDIENST }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'we' } },
    ])
    expect(mitteilungsZiel(zeile({ taskId: ratgeberKey('2026-09-07', 'mid') }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', woche: { wi: 0, tab: 'mid' } },
    ])
  })

  it('… auch wenn er selbst abgesagt hat: Als Planer sucht er Ersatz, statt sein Blatt zu sehen', () => {
    const ziel = mitteilungsZiel(zeile({ taskId: PUNKT }), lage({ zuteilen: true, myTasks: [aufgabe(PUNKT)] }))
    expect(ziel).toEqual([{ type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'mid' } }])
  })

  it('… ein Treffpunkt: seine Woche im Predigtdienst, Reiter Treffpunkte', () => {
    expect(mitteilungsZiel(zeile({ taskId: TREFFPUNKT }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'fs' } },
      { type: 'setFsBereich', bereich: 'treffpunkte' },
    ])
  })

  it('… das öffentliche Zeugnisgeben: sein Reiter — es hat keine Wochenleiste', () => {
    expect(mitteilungsZiel(zeile({ taskId: ZEUGNIS }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', thema: 'predigtdienst' },
      { type: 'setFsBereich', bereich: 'zeugnis' },
    ])
  })

  it('… eine Woche außerhalb des Ladefensters: wenigstens ihr Thema', () => {
    expect(mitteilungsZiel(zeile({ taskId: FERN }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' },
    ])
    expect(mitteilungsZiel(zeile({ taskId: fsKey('2027-03-01', 'i1') }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', thema: 'predigtdienst' },
      { type: 'setFsBereich', bereich: 'treffpunkte' },
    ])
  })

  it.each([...AN_DIE_PLANER])('„%s" ohne Schlüssel: Planen › Zusammenkünfte', (title) => {
    // Import, Sammelmeldung, Ersatz gefunden — und Absagen von vor dem 4.10.2026.
    expect(mitteilungsZiel(zeile({ title, taskId: undefined }), lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' },
    ])
  })

  it('„Ersatz gefunden" beim Verkündiger, dem eingesprungen wurde: „Meine Aufgaben", wie der Push', () => {
    const n = zeile({ type: 'zuteilung', title: 'Ersatz gefunden', taskId: undefined })
    expect(mitteilungsZiel(n, lage())).toEqual([{ type: 'navigate', screen: 'aufgaben' }])
  })

  it('eine Aufgabe, die nicht mehr die eigene ist: ihre Woche — beim Verkündiger im Programm', () => {
    // Umgeteilt: Die Zuteilung steht noch in der Glocke, die Aufgabe hat
    // inzwischen ein anderer. Die Woche zeigt, wer.
    const n = zeile({ type: 'zuteilung', title: 'Neue Zuteilung', taskId: PUNKT })
    expect(mitteilungsZiel(n, lage())).toEqual([{ type: 'navigate', screen: 'programm', woche: { wi: 1, tab: 'mid' } }])
    expect(mitteilungsZiel(n, lage({ zuteilen: true }))).toEqual([
      { type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'mid' } },
    ])
  })

  it('ohne Schlüssel: „Meine Aufgaben" — dorthin führt auch der Push dieser Mitteilungen', () => {
    for (const title of ['Neue Zuteilung', 'Zuteilung zurückgezogen', 'Erinnerung: Zuteilung bestätigen']) {
      expect(mitteilungsZiel(zeile({ type: 'zuteilung', title, taskId: undefined }), lage()), title).toEqual([
        { type: 'navigate', screen: 'aufgaben' },
      ])
    }
  })

  it('ein Schlüssel, den es so nicht gibt, zählt wie keiner', () => {
    // Der Demo-Bestand trägt solche („a2"), und eine Spaltenänderung kann sie
    // hinterlassen — kein Sprung ins Leere, sondern der Weg ohne Schlüssel.
    const n = zeile({ type: 'zuteilung', title: 'Neue Zuteilung', taskId: 'a2' })
    expect(mitteilungsZiel(n, lage())).toEqual([{ type: 'navigate', screen: 'aufgaben' }])
  })

  it('jeder Titel, nach dem hier entschieden wird, entsteht wirklich', () => {
    // `NOTIF_TITLE_KEY` hält `mitteilungs-titel.test.ts` mit den Erzeugern
    // gleich. Ein vertippter Titel hier fiele sonst nie auf — die Mitteilung
    // führte bloß woandershin.
    for (const title of [...AN_DIE_PLANER, ERSATZ_GESUCHT]) {
      expect(NOTIF_TITLE_KEY[title], title).toBeTruthy()
    }
  })
})

/**
 * **Und der Reducer kommt dort auch an.** Die Regeln oben liefern Aktionen;
 * ob die Glocke danach zu ist und die richtige Ansicht offen, entscheidet
 * `navigate` mit seiner Rechteprüfung. Deshalb der ganze Weg einmal durch.
 */
describe('Ablauf: Glocke offen → Tipp → angekommen', () => {
  const offen = (over: Partial<AppState> = {}): AppState => ({
    ...demoZustand(),
    screen: 'start',
    notifOpen: true,
    ...over,
  })
  const tippen = (s: AppState, n: Notification): AppState =>
    mitteilungsZiel(n, { zuteilen: rechteVon(s).zuteilen, weeks: s.weeks, myTasks: s.myTasks }).reduce<AppState>(
      (z, aktion) => reducer(z, aktion),
      s,
    )

  it('der Planer landet bei der Absage in ihrer Woche', () => {
    const s = offen({ planner: true })
    const woche = s.weeks[1]!
    const nach = tippen(s, zeile({ taskId: punktKey(woche.start, 'we', 'x', 0) }))
    expect(nach).toMatchObject({ screen: 'planen', week: 1, tab: 'we', notifOpen: false, terminGewaehlt: true })
  })

  it('… bei einem Treffpunkt im Predigtdienst, Reiter Treffpunkte', () => {
    const s = offen({ planner: true, fsBereich: 'grundplan' })
    const nach = tippen(s, zeile({ taskId: fsKey(s.weeks[0]!.start, 'i1') }))
    expect(nach).toMatchObject({ screen: 'planen', week: 0, tab: 'fs', fsBereich: 'treffpunkte', notifOpen: false })
  })

  it('… beim Zeugnisgeben in dessen Reiter', () => {
    const s = offen({ planner: true })
    const nach = tippen(s, zeile({ taskId: ozKey(s.weeks[0]!.start, 'e1') }))
    expect(nach).toMatchObject({ screen: 'planen', tab: 'fs', fsBereich: 'zeugnis', notifOpen: false })
  })

  it('der Verkündiger landet bei seiner Aufgabe — das Blatt ist offen, die Glocke zu', () => {
    const s = offen({ planner: false, myTasks: [aufgabe('a1')] })
    const nach = tippen(s, zeile({ type: 'zuteilung', title: 'Neue Zuteilung', taskId: 'a1' }))
    expect(nach).toMatchObject({ screen: 'aufgaben', myTaskId: 'a1', notifOpen: false })
  })

  it('… beim Ersatzgesuch am Einspringen', () => {
    const nach = tippen(offen({ planner: false }), zeile({ type: 'zuteilung', title: ERSATZ_GESUCHT }))
    expect(nach).toMatchObject({ screen: 'aufgaben', sprungZiel: 'einspringen', notifOpen: false })
  })

  it('… und eine Woche, die er nur ansehen darf, im Programm — nie im Planen', () => {
    const s = offen({ planner: false })
    const nach = tippen(s, zeile({ type: 'zuteilung', title: 'Neue Zuteilung', taskId: punktKey(s.weeks[1]!.start, 'mid', 'x', 0) }))
    expect(nach).toMatchObject({ screen: 'programm', week: 1, tab: 'mid', notifOpen: false })
  })
})
