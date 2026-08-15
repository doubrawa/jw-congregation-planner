/**
 * Vollständigkeitsprobe: **jede** Funktion, die über „alle Plätze" läuft, muss
 * alle vier Sorten erreichen.
 *
 * Eine Zuteilung kann an vier Orten stehen, und das ist der ganze Punkt dieser
 * Datei:
 *
 *   1. `item.names`      — Hauptsaal
 *   2. `item.aux`        — Zusätzliche Klasse (S-38, Absatz 26)
 *   3. `meeting.auxRatgeber` — Ratgeber der Klasse, einer je Zusammenkunft
 *   4. `meeting.helpers` — Hilfsdienste
 *
 * Der Hauptsaal war zuerst da; die drei anderen kamen später dazu. Seither ist
 * derselbe Fehler viermal passiert: eine Funktion wurde erweitert, die nächste
 * nicht. `partWorkload` zählte die halbe Klasse nicht mit, `mapPersonSlots`
 * benannte sie nicht um (T38), die `used`-Menge der Auto-Zuteilung übersah
 * sie, und `migrateAssignmentPids` gab ihr die Person-Id nie zurück. Jedes
 * Mal war die Wirkung dieselbe und still: der Platz zählte nirgends, und
 * niemand sah es — die Klasse steht in der Ansicht neben dem Hauptsaal, nicht
 * darin.
 *
 * Einzelne Regressionstests haben das nicht verhindert, weil sie je Funktion
 * geschrieben wurden und die nächste Funktion niemandem einfiel. Diese Datei
 * dreht die Richtung um: sie geht von den **Plätzen** aus und fragt jede
 * Funktion, ob sie alle vier sieht. Kommt eine fünfte Platzsorte dazu, gehört
 * sie hier hinein — dann fallen alle Aufrufer auf einmal auf.
 *
 * Beim Anlegen hat die Probe gleich die fünfte Fundstelle geliefert:
 * `migrateAssignmentNames` erreichte nur Hauptsaal und Hilfsdienste.
 *
 * **Eine Stelle bleibt außerhalb:** `pendingOfMeeting` in der Edge Function
 * `send-reminders` läuft ebenfalls über alle vier (Stand heute vollständig),
 * ist aber weder exportiert noch in dieser Laufzeit erreichbar. Wer dort etwas
 * ändert, prüft es in `supabase/functions/_test/send-reminders.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { emptyQualifications, partWorkload, workloadOf } from './helpers'
import {
  assignmentsInMeeting,
  autoAssignMeeting,
  clearAssignments,
  countOpenSlots,
  deriveMyTasks,
  derivePendingIds,
  openSlotLabels,
} from './planning'
import {
  dropPersonPid,
  migrateAssignmentNames,
  migrateAssignmentPids,
  renameInWeeks,
} from '../lib/data'
import type { Meeting, PartItem, Person, Service, Week } from './types'

/* ---- Die Person und die vier Plätze -------------------------------------- */

const ANNA: Person = {
  id: 'p-anna', fn: 'Anna', ln: 'Beispiel', role: 'verkuendiger',
  tel: '', mail: '', priv: emptyQualifications(),
}
const NAME = 'Anna Beispiel'
const SERVICES: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]

/** Die vier Sorten, an ihrem Namen genannt — so lesen sich die Fehlschläge. */
type Platz = 'hauptsaal' | 'klasse' | 'ratgeber' | 'hilfsdienst'
const ALLE: Platz[] = ['hauptsaal', 'klasse', 'ratgeber', 'hilfsdienst']

/**
 * Eine Zusammenkunft, in der derselbe Platz viermal vorkommt — einmal je
 * Sorte. `belegt` steuert, ob die Plätze besetzt sind oder offen.
 */
function zusammenkunft(belegt: boolean): Meeting {
  const wer = belegt ? { name: NAME, pid: ANNA.id } : { name: '' }
  return {
    date: '', end: '',
    sections: [
      {
        label: 'UNS IM DIENST VERBESSERN',
        farbe: 'gold',
        items: [
          {
            title: 'Gespräche beginnen',
            meta: '',
            names: [{ ...wer, bereichsKey: 'schulung' }],
            aux: [{ ...wer, bereichsKey: 'schulung' }],
          },
        ],
      },
    ],
    // Die Marke „hier gibt es eine Klasse" ist der Ratgeber-Platz selbst.
    auxRatgeber: { ...wer, rolle: 'Ratgeber', bereichsKey: 'ratgeber' },
    helpers: { mik: [{ ...wer }] },
  }
}

function woche(belegt = true): Week {
  return {
    range: '', book: '', start: '2026-09-07', current: false,
    mid: zusammenkunft(belegt),
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

/**
 * An welchen der vier Sorten steht diese Person?
 *
 * Nimmt `Week | undefined`, weil jeder Aufrufer das Ergebnis einer Funktion
 * indiziert (`next[0]`). Die fehlende Woche wäre ein Fehler in der geprüften
 * Funktion und soll als solcher benannt werden — nicht als „undefined ist
 * nicht zuweisbar" an der Aufrufstelle.
 */
function besetzt(
  week: Week | undefined,
  pruefe: (slot: { name: string; pid?: string }) => boolean,
): Platz[] {
  if (!week) throw new Error('keine Woche zurückbekommen')
  const m = week.mid
  const item = m.sections[0]!.items[0] as PartItem
  const out: Platz[] = []
  if (item.names.some(pruefe)) out.push('hauptsaal')
  if ((item.aux ?? []).some(pruefe)) out.push('klasse')
  if (m.auxRatgeber && pruefe(m.auxRatgeber)) out.push('ratgeber')
  if ((m.helpers.mik ?? []).some(pruefe)) out.push('hilfsdienst')
  return out
}

const istAnna = (s: { name: string; pid?: string }): boolean => s.pid === ANNA.id || s.name === NAME

/* ---- Die Probe ----------------------------------------------------------- */

describe('Vollständigkeitsprobe: die Vorgabe selbst', () => {
  it('die Beispielwoche belegt wirklich alle vier Plätze', () => {
    // Ohne diese Zeile prüften alle folgenden Tests womöglich nichts.
    expect(besetzt(woche(), istAnna)).toEqual(ALLE)
  })
})

describe('Wer zählt eine Zuteilung mit?', () => {
  it('workloadOf zählt alle vier', () => {
    expect(workloadOf([woche()], ANNA, SERVICES)).toBe(ALLE.length)
  })

  it('partWorkload zählt die drei Programm-Plätze (Hilfsdienst gehört nicht dazu)', () => {
    expect(partWorkload([woche()], ANNA)).toBe(3)
  })

  it('assignmentsInMeeting nennt alle vier', () => {
    expect(assignmentsInMeeting(woche().mid, ANNA, SERVICES)).toHaveLength(ALLE.length)
  })

  it('deriveMyTasks liefert für jeden Platz eine Aufgabe', () => {
    expect(deriveMyTasks([woche()], SERVICES, NAME, {}, '', ANNA.id)).toHaveLength(ALLE.length)
  })

  it('derivePendingIds kennt die Person', () => {
    expect(derivePendingIds([woche()], SERVICES, {})).toContain(ANNA.id)
  })
})

describe('Wer schreibt eine Zuteilung um?', () => {
  it('renameInWeeks trifft alle vier', () => {
    const next = renameInWeeks([woche()], ANNA.id, NAME, 'Anna Neumann')
    expect(besetzt(next[0], (s) => s.name === 'Anna Neumann')).toEqual(ALLE)
  })

  it('migrateAssignmentNames trifft alle vier', () => {
    // Alt-Bestand in der früheren Kurzform „A. Beispiel".
    const alt = woche()
    const kurz = (s: { name: string }): void => { s.name = 'A. Beispiel' }
    const item = alt.mid.sections[0]!.items[0] as PartItem
    item.names.forEach(kurz)
    ;(item.aux ?? []).forEach(kurz)
    if (alt.mid.auxRatgeber) kurz(alt.mid.auxRatgeber)
    alt.mid.helpers.mik!.forEach(kurz)

    const next = migrateAssignmentNames([alt], [ANNA])
    expect(besetzt(next[0], (s) => s.name === NAME)).toEqual(ALLE)
  })

  it('dropPersonPid löst die Id an allen vier', () => {
    const next = dropPersonPid([woche()], ANNA.id)
    expect(besetzt(next[0], (s) => s.pid !== undefined)).toEqual([])
  })

  it('migrateAssignmentPids bindet alle vier wieder', () => {
    const ohne = dropPersonPid([woche()], ANNA.id)
    const next = migrateAssignmentPids(ohne, [ANNA])
    expect(besetzt(next[0], (s) => s.pid === ANNA.id)).toEqual(ALLE)
  })
})

describe('Wer sieht einen offenen Platz?', () => {
  it('countOpenSlots zählt alle vier', () => {
    expect(countOpenSlots(woche(false).mid, SERVICES)).toBe(ALLE.length)
  })

  it('openSlotLabels nennt alle vier', () => {
    const offen = openSlotLabels(woche(false).mid, SERVICES)
    expect(offen.reduce((n, o) => n + o.n, 0)).toBe(ALLE.length)
  })
})

describe('Wer weiß, dass die Person schon eingeteilt ist?', () => {
  it('die Auto-Zuteilung sperrt eine Person, die auf irgendeinem der vier steht', () => {
    // Anna steht auf allen vieren. Ein weiterer offener Platz, für den sie
    // qualifiziert wäre, muss **offen bleiben** — sie kann nicht zweimal.
    // Übersähe die `used`-Menge auch nur eine Sorte, bekäme sie ihn.
    const qualifiziert: Person = {
      ...ANNA,
      priv: { ...emptyQualifications(), schulung: true, vortrag: true },
    }
    const w = woche()
    w.mid.sections[0]!.items.push({
      title: 'Noch ein Punkt', meta: '', names: [{ name: '', bereichsKey: 'vortrag' }],
    })

    const { weeks } = autoAssignMeeting([w], 0, 'mid', [qualifiziert], SERVICES)
    const zweiter = weeks[0]!.mid.sections[0]!.items[1] as PartItem
    expect(zweiter.names[0]!.name, 'Anna wurde ein zweites Mal eingeteilt').toBe('')
  })

  it('… und lässt einen anderen ran', () => {
    // Gegenprobe: ohne sie bliebe offen, ob der Platz nur deshalb leer ist,
    // weil die Auto-Zuteilung ihn gar nicht erst sieht.
    const bernd: Person = {
      id: 'p-bernd', fn: 'Bernd', ln: 'Anders', role: 'verkuendiger', tel: '', mail: '',
      priv: { ...emptyQualifications(), vortrag: true },
    }
    const w = woche()
    w.mid.sections[0]!.items.push({
      title: 'Noch ein Punkt', meta: '', names: [{ name: '', bereichsKey: 'vortrag' }],
    })

    const { weeks } = autoAssignMeeting([w], 0, 'mid', [bernd], SERVICES)
    const zweiter = weeks[0]!.mid.sections[0]!.items[1] as PartItem
    expect(zweiter.names[0]!.name).toBe('Bernd Anders')
  })
})

describe('Wer leert eine Zuteilung?', () => {
  it('„Aufgaben leeren" räumt Hauptsaal, Klasse und Ratgeber — nicht die Hilfsdienste', () => {
    const { weeks, count } = clearAssignments([woche()], 0, 'mid', 'parts')
    expect(besetzt(weeks[0], istAnna)).toEqual(['hilfsdienst'])
    expect(count).toBe(3)
  })

  it('„Hilfsdienste leeren" räumt nur diese', () => {
    const { weeks } = clearAssignments([woche()], 0, 'mid', 'helpers')
    expect(besetzt(weeks[0], istAnna)).toEqual(['hauptsaal', 'klasse', 'ratgeber'])
  })
})
