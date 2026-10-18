import { describe, expect, it } from 'vitest'
import { buildImportWeek } from '../../tests/testdaten/testdaten'
import { buildAbsences } from './absence'
import { emptyQualifications, isSong, istArt, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from './helpers'
import { neueWocheEinordnen } from './neue-woche'
import { autoAssignMeeting, festenWtLeiterEintragen } from './planning'
import type { Absence, PartItem, Person, Qualifications, SlotAssignment, Week } from './types'
import { STANDARD_ZEITEN } from './vorgaben'
import type { VorgemerkterVortrag } from './vortragsplan'

/**
 * **Der feste Leiter des Wachtturm-Studiums steht von selbst in der Woche**
 * (18.10.2026, Wunsch des Betreibers).
 *
 * In der Versammlung leitet das Wachtturm-Studium immer derselbe Bruder; fehlt
 * er, springt sein Vertreter ein (Personen › Aufgabenbereiche › Feste Rollen).
 * Bis hierher setzte ihn nur „Automatisch": Eine mit „Nur übernehmen" geholte
 * Woche, das Skript `wochen-importieren.mjs` und der Wochenplan-Import aus NWS
 * ließen den Platz offen, und Woche für Woche trug jemand denselben Namen von
 * Hand ein.
 *
 * Verteidigt wird, was beim Holen geschieht: wer hineinkommt (der Leiter, sonst
 * der Vertreter), wann keiner (beide fehlen, die Zusammenkunft entfällt, der
 * Platz ist schon besetzt), dass es dieselbe Person ist, die „Automatisch"
 * nähme, und dass die Einordnung den Vortrag vorher einträgt — hält der Leiter
 * ihn, leitet der Vertreter. Eine Abwesenheit, die erst danach kommt, ändert
 * den Plan nicht; dafür gibt es den Konflikt-Hinweis (Betreiber, 18.10.2026).
 *
 * Die Testwoche (`buildImportWeek`) beginnt am Montag, dem 5. Oktober 2026;
 * nach den Standardzeiten ist die Zusammenkunft unter der Woche am Dienstag,
 * dem 6., und die am Wochenende am Sonntag, dem 11.
 */

const DIENSTAG = '2026-10-06'
const SAMSTAG = '2026-10-10'
const SONNTAG = '2026-10-11'

function person(id: string, fn: string, ln: string, rollen: Partial<Qualifications> = {}): Person {
  return { id, fn, ln, role: 'aeltester', tel: '', mail: '', priv: { ...emptyQualifications(), studium: true, ...rollen } }
}
const LEITER = person('p-leiter', 'Lars', 'Leiter', { wtLeiter: true })
const VERTRETER = person('p-vertreter', 'Volker', 'Vertreter', { wtVertreter: true })
/** Darf das Studium leiten, hat aber keine feste Rolle. */
const STUDIUM = person('p-studium', 'Sven', 'Studium')
/** Absichtlich nicht nach Rolle geordnet: Die Rolle entscheidet, nicht die Reihenfolge der Liste. */
const ALLE = [STUDIUM, VERTRETER, LEITER]

function abwesend(p: Person, von: string, bis = von): Absence {
  return { id: `a-${p.id}-${von}`, personId: p.id, userId: null, from: von, to: bis, reason: '' }
}

/** Der Leiter-Platz des Wachtturm-Studiums am Wochenende. */
function leiterPlatz(week: Week): SlotAssignment | undefined {
  const studium = week.we.sections.find((s) => istArt(s, 'wtStudium'))
  return studium?.items.flatMap((i) => (isSong(i) ? [] : i.names)).find((s) => s.rolle === 'Leiter')
}

/** Der Platz des öffentlichen Vortrags — mit einem Redner besetzt. */
function mitRedner(week: Week, redner: SlotAssignment): Week {
  const vortrag = week.we.sections.find((s) => istArt(s, 'vortrag'))?.items[0] as PartItem
  vortrag.names[0] = { ...vortrag.names[0], ...redner }
  return week
}

const eintragen = (week: Week, absences: Absence[] = [], persons: Person[] = ALLE) =>
  festenWtLeiterEintragen(week, persons, absences, STANDARD_ZEITEN)

describe('Beim Holen: der feste Leiter kommt in den Leiter-Platz', () => {
  it('der feste Leiter steht drin — mit seiner Id, nicht nur dem Namen', () => {
    const { week, eingetragen } = eintragen(buildImportWeek())
    expect(leiterPlatz(week)).toMatchObject({ name: 'Lars Leiter', pid: 'p-leiter', rolle: 'Leiter' })
    expect(eingetragen).toEqual([LEITER])
  })

  it('ist er am Sonntag abwesend, leitet sein Vertreter', () => {
    const { week, eingetragen } = eintragen(buildImportWeek(), [abwesend(LEITER, SAMSTAG, SONNTAG)])
    expect(leiterPlatz(week)).toMatchObject({ name: 'Volker Vertreter', pid: 'p-vertreter' })
    expect(eingetragen).toEqual([VERTRETER])
  })

  it('fehlt er nur unter der Woche oder bis Samstag, leitet er am Sonntag trotzdem', () => {
    expect(leiterPlatz(eintragen(buildImportWeek(), [abwesend(LEITER, DIENSTAG)]).week)?.pid).toBe('p-leiter')
    expect(leiterPlatz(eintragen(buildImportWeek(), [abwesend(LEITER, DIENSTAG, SAMSTAG)]).week)?.pid).toBe('p-leiter')
  })

  it('zählt der Tag der Zusammenkunft, nicht der Sonntag: auf Samstag verlegt, leitet er am Samstag', () => {
    // Er ist nur am Sonntag weg — die Zusammenkunft ist diesmal am Samstag.
    const verlegt: Week = { ...buildImportWeek(), dev: { we: { wd: 6 } } }
    expect(leiterPlatz(eintragen(verlegt, [abwesend(LEITER, SONNTAG)]).week)?.pid).toBe('p-leiter')
    expect(leiterPlatz(eintragen(verlegt, [abwesend(LEITER, SAMSTAG)]).week)?.pid).toBe('p-vertreter')
  })

  it('hält er selbst den öffentlichen Vortrag, leitet der Vertreter — niemand zweimal am Sonntag', () => {
    const woche = mitRedner(buildImportWeek(), { name: 'Lars Leiter', pid: 'p-leiter', rolle: ROLE_OWN_SPEAKER })
    expect(leiterPlatz(eintragen(woche).week)?.pid).toBe('p-vertreter')
  })

  it('auch wenn der Vortrag nur seinen Namen trägt (Altbestand ohne Id)', () => {
    const woche = mitRedner(buildImportWeek(), { name: 'Lars Leiter', rolle: ROLE_OWN_SPEAKER })
    expect(leiterPlatz(eintragen(woche).week)?.pid).toBe('p-vertreter')
  })

  it('ein Gastredner, der zufällig so heißt, ist nicht er', () => {
    // Ein Gast ist jemand von außen; sein Name sperrt niemanden der Versammlung.
    const woche = mitRedner(buildImportWeek(), { name: 'Lars Leiter', rolle: ROLE_GUEST_SPEAKER })
    expect(leiterPlatz(eintragen(woche).week)?.pid).toBe('p-leiter')
  })

  it('fehlen beide, bleibt der Platz offen — geraten wird nicht, und die Woche bleibt dieselbe', () => {
    const roh = buildImportWeek()
    const { week, eingetragen } = eintragen(roh, [abwesend(LEITER, SONNTAG), abwesend(VERTRETER, SONNTAG)])
    expect(week).toBe(roh)
    expect(eingetragen).toEqual([])
    // Auch nicht der, der das Studium leiten darf: Wen es dann trifft,
    // entscheidet die Auslastung — und die kennt nur „Automatisch".
    expect(leiterPlatz(week)?.name).toBe('')
  })

  it('ohne feste Rollen in der Versammlung ändert sich nichts', () => {
    const roh = buildImportWeek()
    expect(eintragen(roh, [], [STUDIUM]).week).toBe(roh)
  })

  it('ein schon besetzter Platz bleibt, wie er ist', () => {
    const roh = buildImportWeek()
    Object.assign(leiterPlatz(roh)!, { name: 'Sven Studium', pid: 'p-studium' })
    const { week, eingetragen } = eintragen(roh)
    expect(week).toBe(roh)
    expect(eingetragen).toEqual([])
    expect(leiterPlatz(week)?.pid).toBe('p-studium')
  })

  it('entfällt die Zusammenkunft am Wochenende, bleibt ihr Platz leer', () => {
    const roh: Week = { ...buildImportWeek(), dev: { we: { cancelled: true } } }
    expect(eintragen(roh).week).toBe(roh)
    expect(leiterPlatz(roh)?.name).toBe('')
  })

  it('die übergebene Woche bleibt unangetastet', () => {
    const roh = buildImportWeek()
    const { week } = eintragen(roh)
    expect(week).not.toBe(roh)
    expect(leiterPlatz(roh)).toMatchObject({ name: '' })
    expect(leiterPlatz(roh)?.pid).toBeUndefined()
  })

  it('der Leiter des Versammlungsbibelstudiums ist nicht gemeint — er bleibt leer', () => {
    const { week } = eintragen(buildImportWeek())
    const vbs = week.mid.sections.flatMap((s) => s.items).flatMap((i) => (isSong(i) ? [] : i.names))
    expect(vbs.find((s) => s.rolle === 'Leiter')?.name).toBe('')
  })
})

describe('Dieselbe Wahl wie „Automatisch"', () => {
  /** Wer den Leiter-Platz bekommt, wenn „Automatisch" die Woche besetzt. */
  function automatisch(roh: Week, absences: Absence[]): SlotAssignment | undefined {
    const abw = buildAbsences(absences, [roh], STANDARD_ZEITEN)
    return leiterPlatz(autoAssignMeeting([roh], 0, 'we', ALLE, [], [], 'parts', abw).weeks[0]!)
  }

  const FAELLE: [string, () => Week, Absence[]][] = [
    ['alle da', () => buildImportWeek(), []],
    ['Leiter am Sonntag weg', () => buildImportWeek(), [abwesend(LEITER, SONNTAG)]],
    ['Leiter hält den Vortrag', () => mitRedner(buildImportWeek(), { name: 'Lars Leiter', pid: 'p-leiter', rolle: ROLE_OWN_SPEAKER }), []],
  ]

  it.each(FAELLE)('%s: beim Holen dieselbe Person wie beim Knopf', (_titel, woche, absences) => {
    const geholt = leiterPlatz(eintragen(woche(), absences).week)
    expect(geholt?.pid).toBeTruthy()
    expect(automatisch(woche(), absences)?.pid).toBe(geholt?.pid)
  })

  it('fehlen beide, nimmt erst „Automatisch" jemanden, der das Studium leiten darf', () => {
    const absences = [abwesend(LEITER, SONNTAG), abwesend(VERTRETER, SONNTAG)]
    expect(leiterPlatz(eintragen(buildImportWeek(), absences).week)?.name).toBe('')
    expect(automatisch(buildImportWeek(), absences)?.pid).toBe('p-studium')
  })
})

describe('Über neueWocheEinordnen — dieselbe Einordnung für den Knopf und das Skript', () => {
  const einordnen = (roh: Week, absences: Absence[] = [], vortraege: VorgemerkterVortrag[] = []) =>
    neueWocheEinordnen(roh, {
      zeiten: STANDARD_ZEITEN,
      auxClass: false,
      fsRules: [],
      gruppenbesuche: [],
      vortraege,
      persons: ALLE,
      absences,
    }).week

  it('die geholte Woche bringt den Leiter mit; fehlt er, den Vertreter', () => {
    expect(leiterPlatz(einordnen(buildImportWeek()))?.pid).toBe('p-leiter')
    expect(leiterPlatz(einordnen(buildImportWeek(), [abwesend(LEITER, SONNTAG)]))?.pid).toBe('p-vertreter')
  })

  it('hält der Leiter laut Vortragsplan den Vortrag, leitet der Vertreter — der Vortrag steht vorher', () => {
    const vortrag = {
      id: 'v1', woche: '2026-10-05', redner: 'Lars Leiter', versammlung: '', eigener: true, pid: 'p-leiter', thema: 'Probe-Thema', lied: '',
    }
    const week = einordnen(buildImportWeek(), [], [vortrag])
    expect(week.we.sections.find((s) => istArt(s, 'vortrag'))?.items[0]).toMatchObject({ names: [{ pid: 'p-leiter' }] })
    expect(leiterPlatz(week)?.pid).toBe('p-vertreter')
  })

  it('fällt das Gedächtnismahl auf den Sonntag, bleibt der Platz leer', () => {
    // Die Einordnung streicht die Zusammenkunft (`setAnlassTermin`) — erst danach kommt der Leiter.
    const mahl: Week = { ...buildImportWeek(), anlass: { art: 'mem', von: SONNTAG } }
    expect(leiterPlatz(einordnen(mahl))?.name).toBe('')
  })
})
