/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import type { AppAction, AppState, HydratePayload } from './context'
import { initialState } from './init'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  buildImportWeek,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_NOTIFICATIONS,
  DEMO_PERSONS,
  DEMO_REMINDERS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import { isSong } from '../data/helpers'
import { isoDay } from '../data/meeting-dates'
import type { PartItem, Week } from '../data/types'

/**
 * **Der Reducer ist rein — gemessen statt behauptet.**
 *
 * Die ganze Anwendung hängt daran: `persist.ts` entscheidet allein über den
 * Referenzvergleich `prev` gegen `next`, welche Zeilen geschrieben werden, und
 * die Selektoren (T41) wecken einen Baustein nur, wenn sich *sein* Ausschnitt
 * geändert hat. Wird irgendwo im Zustand an Ort und Stelle geschrieben, bleibt
 * die Referenz gleich — dann wird die Änderung weder gespeichert noch
 * gezeichnet, und beides fällt erst beim nächsten Laden auf.
 *
 * Nachlesen kann man das nicht: Es sind über 90 Aktionen, und der Weg führt
 * durch `planning.ts`, `fs.ts`, `meeting-edit.ts`, `aux-class.ts` und
 * `termine.ts`. Hier wird es deshalb erzwungen — der Zustand geht
 * **tiefgefroren** hinein. Jeder Schreibzugriff auf ein eingefrorenes Objekt
 * wirft im strikten Modus (und ES-Module sind immer strikt), der Test schlägt
 * also mit dem genauen Ort fehl statt mit einem stillen Datenverlust Wochen
 * später.
 */
function tiefFrieren<T>(wert: T, gesehen = new WeakSet<object>()): T {
  if (wert === null || typeof wert !== 'object') return wert
  const o = wert as unknown as object
  if (gesehen.has(o)) return wert
  gesehen.add(o)
  // Ein Datum hat interne Felder, keine Eigenschaften — Einfrieren brächte
  // nichts und nähme nur `setDate` die Wirkung, ohne dass es auffiele.
  if (wert instanceof Date) return wert
  for (const v of Object.values(o)) tiefFrieren(v, gesehen)
  Object.freeze(o)
  return wert
}

function ladung(): HydratePayload {
  return {
    congregationId: 'c1',
    userId: 'u1',
    empty: false,
    congregation: { ...CONGREGATION },
    planner: true,
    personId: DEMO_PERSONS[0]!.id,
    persons: DEMO_PERSONS.map((p) => ({ ...p })),
    services: DEMO_SERVICES.map((s) => ({ ...s })),
    groups: DEMO_GROUPS.map((g) => ({ ...g })),
    weeks: buildDemoWeeks(),
    fsRules: DEMO_FS_RULES.map((r) => ({ ...r })),
    fsWeeks: buildDemoFsWeeks(),
    fsBase: isoDay(FS_BASE),
    absences: DEMO_ABSENCES.map((a) => ({ ...a })),
    notifications: DEMO_NOTIFICATIONS.map((n) => ({ ...n })),
    confirmations: {},
    sentLog: {},
    reminders: { ...DEMO_REMINDERS },
    congLang: 'Deutsch',
    progLangs: [],
    auxClass: true,
    members: [{ userId: 'u1', personId: DEMO_PERSONS[0]!.id, planner: true, email: 'a@b.c' }],
    invites: [],
  }
}

/** Erster zuteilbarer Programmpunkt einer Zusammenkunft. */
function ersterPunkt(week: Week, tab: 'mid' | 'we'): { si: number; ii: number } {
  const sections = week[tab].sections
  for (let si = 0; si < sections.length; si++) {
    const items = sections[si]!.items
    for (let ii = 0; ii < items.length; ii++) {
      const it = items[ii]!
      if (!isSong(it) && (it as PartItem).names.length > 0) return { si, ii }
    }
  }
  throw new Error('kein Programmpunkt gefunden')
}

/**
 * Alle Schreib-Aktionen mit brauchbaren Nutzdaten — abgeleitet aus dem Zustand,
 * damit sie wirklich greifen und nicht am ersten `if` abprallen.
 *
 * Bewusst **nacheinander** auf demselben Faden: So sieht jede Aktion einen
 * Zustand, den eine andere gerade gebaut hat, und nicht nur die Demo-Daten.
 */
function schreibfolge(s: AppState): AppAction[] {
  const week = s.weeks[0]!
  const p = ersterPunkt(week, 'mid')
  const person = s.persons[0]!
  const zweite = s.persons[1]!
  const svc = s.services[0]!
  const grp = s.groups[0]!
  const inst = s.fsWeeks[0]?.[0]
  const regel = s.fsRules[0]!
  const folge: AppAction[] = [
    { type: 'setTab', tab: 'mid' },
    // Programmpunkte
    { type: 'openSlot', sel: { kind: 'part', wi: 0, tab: 'mid', si: p.si, ii: p.ii, ni: 0, priv: null, groups: false, label: 'x' } },
    { type: 'assign', name: `${person.fn} ${person.ln}`, pid: person.id },
    { type: 'assign', name: '' },
    { type: 'closeSlot' },
    { type: 'togglePartner', si: p.si, ii: p.ii },
    { type: 'togglePartner', si: p.si, ii: p.ii },
    { type: 'setPartThema', tab: 'mid', si: p.si, ii: p.ii, begriff: 'Thema', thema: 'Probe' },
    { type: 'talkEdit', si: p.si, ii: p.ii, title: 'Probevortrag' },
    { type: 'openingSong', song: '12' },
    { type: 'closingSong', song: '34' },
    { type: 'autoAssign', scope: 'all' },
    { type: 'clearAssignments', scope: 'parts' },
    { type: 'clearAssignments', scope: 'helpers' },
    // Ratgeber-Platz der Zusätzlichen Klasse
    { type: 'openSlot', sel: { kind: 'ratgeber', wi: 0, tab: 'mid', priv: null, groups: false, label: 'x' } },
    { type: 'assign', name: `${zweite.fn} ${zweite.ln}`, pid: zweite.id },
    { type: 'closeSlot' },
    { type: 'setAuxClass', on: false },
    { type: 'setAuxClass', on: true },
    // Leben-und-Dienst-Punkte
    { type: 'lacAdd', si: p.si, title: 'Neuer Punkt' },
    { type: 'lacAdjust', si: p.si, ii: p.ii, delta: 1 },
    { type: 'lacMove', si: p.si, ii: p.ii, dir: 1 },
    { type: 'lacRemove', si: p.si, ii: p.ii },
    // Wochen-Sonderfälle
    { type: 'setAbweichung', tab: 'mid', patch: { day: 'Mittwoch', time: '19:30' } },
    { type: 'setAbweichung', tab: 'mid', patch: { cancelled: true, reason: 'Probe' } },
    { type: 'setDienstwoche', on: true },
    { type: 'setAnlass', art: 'co' },
    { type: 'setAnlassTermin', patch: { von: '2026-09-12', bis: '2026-09-13' } },
    { type: 'setAnlass', art: null },
    // Termine
    { type: 'terminAdd' },
    { type: 'terminAdd' },
    // Personen und Stammdaten
    { type: 'updatePerson', id: person.id, patch: { tel: '0123' } },
    { type: 'setFamily', id: person.id, memberId: zweite.id, add: true },
    { type: 'setFamily', id: person.id, memberId: zweite.id, add: false },
    { type: 'changeServiceCount', key: svc.key, delta: 1 },
    { type: 'changeServiceCount', key: svc.key, delta: -1 },
    { type: 'addService', service: { key: 'probe', name: 'Probe', count: 2 } },
    { type: 'removeService', key: 'probe' },
    { type: 'addGroup', group: { id: 'g-probe', name: 'Probe', ov: '', as: '' } },
    { type: 'updateGroup', id: grp.id, patch: { ov: person.id } },
    { type: 'removeGroup', id: 'g-probe' },
    { type: 'updateCongregation', patch: { hall: 'Probesaal' } },
    { type: 'updateCongregation', patch: { meetings: 'Mi 19:30 · So 09:30' } },
    // Treffpunkte
    { type: 'fsAutoAssign', onlyGroup: null },
    { type: 'fsClear', onlyGroup: null },
    { type: 'fsRuleAdd', grp: grp.name },
    { type: 'fsRuleUpdate', id: regel.id, patch: { time: '09:15' } },
    { type: 'fsRuleRemove', id: regel.id },
    // Abwesenheiten, Mitteilungen, Erinnerungen
    { type: 'addAbsence', absence: { id: 'a-probe', personId: person.id, userId: 'u1', from: '2026-10-01', to: '2026-10-05', reason: '' } },
    { type: 'removeAbsence', id: 'a-probe' },
    { type: 'markAllRead' },
    { type: 'changeReminder', key: 'first', delta: 1 },
    { type: 'toggleReminderRepeat' },
    // Sprachen
    { type: 'setCongLang', name: 'Englisch' },
    { type: 'addProgLang', name: 'Französisch' },
    { type: 'removeProgLang', name: 'Französisch' },
    { type: 'setLang', lang: 'en' },
    { type: 'setLang', lang: 'de' },
    // Konten
    { type: 'updateMember', userId: 'u1', patch: { planner: true } },
    { type: 'addInvite', invite: { id: 'i-probe', code: 'ABC123', personId: null, planner: false } },
    { type: 'removeInvite', id: 'i-probe' },
    // Import
    { type: 'addImportedWeek', week: buildImportWeek() },
    { type: 'startImport' },
    { type: 'stopImport' },
    // Zum Schluss: Person entfernen (löst Gruppen-/Konto-Bezüge)
    { type: 'removePerson', id: zweite.id },
  ]
  if (inst) folge.push({ type: 'fsInstUpdate', wi: 0, id: inst.id, patch: { place: 'Probeort' } })
  return folge
}

describe('Der Zustand wird nie an Ort und Stelle geändert', () => {
  it('die Schreib-Aktionen auf einem tiefgefrorenen Zustand', () => {
    let s = tiefFrieren(reducer(initialState(), { type: 'hydrate', payload: tiefFrieren(ladung()) }))
    const folge = schreibfolge(s)
    // Gegenprobe: Eine leere Folge prüfte nichts.
    expect(folge.length).toBeGreaterThan(50)
    /*
     * **Wirkungslose Aktionen zählen nicht.**
     *
     * Eine Nutzlast kann veralten — ein Index zeigt auf einen Platz, den es
     * nicht mehr gibt, eine Id gehört keinem Eintrag mehr. Der Reducer gibt
     * dann denselben Zustand zurück, und ein eingefrorenes Objekt, das nie
     * angefasst wird, beweist gar nichts. Deshalb wird mitgezählt, wie viele
     * Aktionen wirklich einen neuen Zustand gebaut haben.
     */
    let wirksam = 0
    for (const action of folge) {
      // Der Ort steht in der Meldung — sonst sucht man die ganze Folge ab.
      try {
        const vorher = s
        s = tiefFrieren(reducer(s, action))
        if (s !== vorher) wirksam++
      } catch (e) {
        throw new Error(`${action.type}: ${(e as Error).message}`)
      }
    }
    // Gemessen: 65 von 66. Die eine Ausnahme ist `setTab` auf den Reiter, der
    // ohnehin schon steht — sie eröffnet nur die Folge.
    expect(wirksam, 'zu wenige Aktionen wirkten — Nutzlast veraltet?').toBeGreaterThan(
      folge.length - 3,
    )
  })

  it('… auch die eigenen Aufgaben (bestätigen, absagen, einspringen)', () => {
    let s = tiefFrieren(reducer(initialState(), { type: 'hydrate', payload: tiefFrieren(ladung()) }))
    const ids = s.myTasks.map((x) => x.id)
    expect(ids.length, 'keine eigenen Aufgaben — der Test prüfte nichts').toBeGreaterThan(0)
    for (const id of ids) {
      const schritte: AppAction[] = [
        { type: 'openMyTask', id },
        { type: 'confirmTask', id },
        { type: 'declineTask', id },
        { type: 'closeMyTask' },
      ]
      for (const action of schritte) {
        try {
          s = tiefFrieren(reducer(s, action))
        } catch (e) {
          throw new Error(`${action.type} (${id}): ${(e as Error).message}`)
        }
      }
    }
    for (const req of s.substituteReqs) {
      s = tiefFrieren(reducer(s, { type: 'takeSubstitute', key: req.key }))
    }
  })
})
