/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppState } from '../../src/app/context'
import { reducer } from '../../src/app/reducer'
import { deriveMyTasks } from '../../src/data/planning'
import type { Person } from '../../src/data/types'
import { demoZustand, entwicklerStart, parseDebugHash } from './demo-start'
import { DEMO_PERSONS, DEMO_PLANNER } from './testdaten'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-shot')
})

describe('demoZustand – der Bestand der Tests und der Entwicklerseite', () => {
  it('liefert die erfundenen Daten, ohne Datenbank', () => {
    const s = demoZustand()
    expect(s.dataStatus).toBe('demo')
    expect(s.persons).toBe(DEMO_PERSONS)
    expect(s.weeks.length).toBeGreaterThan(0)
    expect(s.planner).toBe(DEMO_PLANNER)
    expect(s.congregationId).toBeNull()
  })

  it('bindet die Namen an Personen wie der echte Ladevorgang — ein Namensvetter auf Zeit nimmt niemandem etwas', () => {
    /*
     * Gemessen am 1.10.2026 im Demo-Modus: „Manfred Albrecht" Feld für Feld auf
     * „Thomas Lindner" umbenannt und zurück — danach standen alle Aufgaben
     * Lindners bei Albrecht. Die Demo-Wochen trugen nur Namen, und eine
     * Umbenennung traf dann jeden Platz dieses Namens. Im Betrieb bindet
     * `pidsNachtragen` beim Laden; der Demo-Bestand tut es beim Start.
     */
    const s0 = demoZustand()
    const finde = (fn: string, ln: string) => s0.persons.find((p) => p.fn === fn && p.ln === ln)!
    const lindner = finde('Thomas', 'Lindner')
    const albrecht = finde('Manfred', 'Albrecht')
    const aufgaben = (s: AppState, p: Person) =>
      deriveMyTasks(s.weeks, s.services, `${p.fn} ${p.ln}`, {}, s.congregation.times, p.id).length
    const leitet = (s: AppState, name: string) => s.fsWeeks.flat().filter((i) => i.leader === name).length
    const vorher = {
      lindner: aufgaben(s0, lindner),
      albrecht: aufgaben(s0, albrecht),
      lindnerTreffpunkte: leitet(s0, 'Thomas Lindner'),
    }
    expect(vorher.lindner, 'Lindner hat im Bestand gar keine Aufgabe — der Fall prüft nichts').toBeGreaterThan(0)
    expect(vorher.lindnerTreffpunkte, 'Lindner leitet keinen Treffpunkt — der Fall prüft nichts').toBeGreaterThan(0)

    let s = s0
    for (const patch of [{ fn: 'Thomas' }, { ln: 'Lindner' }, { fn: 'Manfred' }, { ln: 'Albrecht' }]) {
      s = reducer(s, { type: 'updatePerson', id: albrecht.id, patch })
    }
    expect(aufgaben(s, lindner)).toBe(vorher.lindner)
    expect(aufgaben(s, albrecht)).toBe(vorher.albrecht)
    expect(leitet(s, 'Thomas Lindner')).toBe(vorher.lindnerTreffpunkte)
  })
})

describe('entwicklerStart – was der Hash der Entwicklerseite verlangt', () => {
  it('ohne Hash: Start-Bildschirm, angemeldet ist niemand', () => {
    const s = entwicklerStart('')
    expect(s.dataStatus).toBe('demo')
    expect(s.screen).toBe('start')
    expect(s.personId).toBeNull()
    expect(s.terminGewaehlt).toBe(false)
  })

  it('liest s/l/c/t/p aus dem Hash', () => {
    // `c=` darf den deutschen Namen tragen — geführt wird der jw.org-Code.
    const s = entwicklerStart('#s=programm&l=en&c=Englisch&t=graphit&p=p9')
    expect(s.screen).toBe('programm')
    expect(s.lang).toBe('en')
    expect(s.congLang).toBe('en')
    expect(s.theme).toBe('graphit')
    expect(s.selectedPersonId).toBe('p9')
  })

  it('me=<Person> meldet jemanden an — p= wählt nur aus', () => {
    /*
     * Zwei verschiedene Dinge, die sich leicht verwechseln: `p` ist die im
     * Personen-Screen **ausgewählte** Person, `me` die **angemeldete**. Nur an
     * `me` hängt, was persönlich ist — der DU-Chip, „Deine Einträge" und die
     * Treffpunkte der eigenen Predigtdienstgruppe.
     */
    const s = entwicklerStart('#s=programm&p=p1&me=p9')
    expect(s.personId).toBe('p9')
    expect(s.selectedPersonId).toBe('p1')
    expect(entwicklerStart('#s=programm&p=p1').personId).toBeNull()
  })

  it('tab und pl (Rechte) steuern Reiter und Rolle für Doku-Screenshots', () => {
    const s = entwicklerStart('#s=planen&tab=fs&pl=0')
    expect(s.tab).toBe('fs')
    expect(s.planner).toBe(false) // pl=0 → Verkündiger-Ansicht
    // Ein gewählter Reiter springt beim ersten Navigieren nicht weg.
    expect(s.terminGewaehlt).toBe(true)
    expect(entwicklerStart('#s=planen&pl=1').planner).toBe(true)
  })

  it('fs=<Faktor> setzt die Schriftgröße — nur Stufen der Skala', () => {
    expect(entwicklerStart('#s=profil&fs=1.45').fontScale).toBe(1.45)
    expect(entwicklerStart('#s=profil&fs=1.1').fontScale).toBe(1) // nicht auf der Skala
  })

  it('shot=1 schaltet den Screenshot-Modus ein (data-shot am <html>)', () => {
    entwicklerStart('#s=start&shot=1')
    expect(document.documentElement.dataset.shot).toBe('1')
  })
})

describe('parseDebugHash', () => {
  it('stale=<Stunden> täuscht einen so alten Offline-Stand vor', () => {
    const jetzt = Date.UTC(2026, 9, 2, 12)
    expect(parseDebugHash('#s=programm&stale=5', jetzt)?.staleAt).toBe(jetzt - 5 * 3600_000)
  })

  it('ohne stale bleibt der Stand aktuell, ein leerer Hash ist gar keiner', () => {
    expect(parseDebugHash('#s=programm')?.staleAt).toBeUndefined()
    expect(parseDebugHash('')).toBeNull()
    expect(parseDebugHash('#')).toBeNull()
  })
})
