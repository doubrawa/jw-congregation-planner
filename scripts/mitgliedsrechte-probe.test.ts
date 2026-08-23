import { describe, expect, it } from 'vitest'
import { bewerteVersuch, fremdeSlots, helferSchluessel, slotSchluessel } from './mitgliedsrechte-probe.mjs'
import { helperTaskKey, slotTaskKey } from '../src/data/planning'
import type { PartItem } from '../src/data/types'

/**
 * Die Probe selbst läuft nur gegen eine echte Datenbank. Geprüft wird hier das,
 * woran sie **still falsch** werden könnte: der Schlüssel.
 *
 * Ein falsch gebauter `task_key` wäre die tückischste Art zu scheitern — die
 * Datenbank nähme ihn anstandslos an, die Probe meldete „durchgelassen", und
 * der Befund wäre trotzdem nicht belegt: Der Schlüssel bezöge sich auf gar
 * keinen Slot. Deshalb wird er gegen `planning.ts` gehalten, nicht gegen eine
 * hier abgeschriebene Erwartung.
 */

const punkt = (iid?: string): PartItem => ({ title: 'Probe', names: [], ...(iid ? { iid } : {}) })

describe('Der Schlüssel ist derselbe wie in der App', () => {
  it('mit stabiler Kennung — fünf Felder', () => {
    const item = punkt('k3f9x')
    expect(slotSchluessel(item, '2026-08-17', 'mid', 2, 1, 0)).toBe(slotTaskKey(item, '2026-08-17', 'mid', 2, 1, 0))
  })

  it('ohne Kennung fällt er auf die Position zurück — sechs Felder', () => {
    const item = punkt()
    expect(slotSchluessel(item, '2026-08-17', 'mid', 2, 1, 0)).toBe(slotTaskKey(item, '2026-08-17', 'mid', 2, 1, 0))
  })

  it('und die Zusätzliche Klasse trägt „aux" statt „part"', () => {
    for (const item of [punkt('k3f9x'), punkt()]) {
      expect(slotSchluessel(item, '2026-08-17', 'we', 0, 0, 1, true)).toBe(slotTaskKey(item, '2026-08-17', 'we', 0, 0, 1, true))
      expect(slotSchluessel(item, '2026-08-17', 'we', 0, 0, 1, true)).toContain('|aux|')
    }
  })

  it('Hilfsdienste ebenso', () => {
    expect(helferSchluessel('2026-08-17', 'mid', 'mik', 1)).toBe(helperTaskKey('2026-08-17', 'mid', 'mik', 1))
  })
})

describe('Fremde Aufgaben finden', () => {
  const week = {
    start: '2026-08-17',
    mid: {
      sections: [
        {
          items: [
            { song: 'Lied 1' },
            { iid: 'a1', title: 'Einleitung', names: [{ name: 'Ich', pid: 'ich' }, { name: 'Anderer', pid: 'fremd' }] },
          ],
        },
      ],
      helpers: { mik: [{ name: 'Ich', pid: 'ich' }, { name: 'Dritter', pid: 'fremd2' }] },
    },
    we: {
      sections: [
        { items: [{ iid: 'b1', title: 'Vortrag', names: [{ name: 'H. Brügger', rolle: 'Gastredner · Vers. Oberau' }] }] },
      ],
      helpers: {},
    },
  }

  it('findet fremde Programmplätze und Hilfsdienste, nicht die eigenen', () => {
    const treffer = fremdeSlots(week, 'ich')
    expect(treffer.map((t) => t.wer).sort()).toEqual(['Anderer', 'Dritter'])
  })

  it('externe Redner bleiben außen vor — sie haben keinen Bestätigungs-Flow', () => {
    // Der Gastredner am Wochenende steht ohne `pid` im Platz.
    expect(fremdeSlots(week, 'ich').some((t) => t.wer === 'H. Brügger')).toBe(false)
  })

  it('die Schlüssel tragen Woche, Zusammenkunft und Art', () => {
    const treffer = fremdeSlots(week, 'ich')
    expect(treffer.find((t) => t.art === 'Programm')?.key).toBe('2026-08-17|mid|part|a1|1')
    expect(treffer.find((t) => t.art.startsWith('Hilfsdienst'))?.key).toBe('2026-08-17|mid|helper|mik|1')
  })

  it('ohne eigene Person gilt alles Besetzte als fremd — bis auf den Gastredner', () => {
    // Vier Plätze mit `pid` (zwei im Programm, zwei im Hilfsdienst); der
    // Gastredner hat keine und bleibt auch hier draußen.
    expect(fremdeSlots(week, null).map((t) => t.wer)).toEqual(['Ich', 'Anderer', 'Ich', 'Dritter'])
  })
})

describe('Einen Schreibversuch bewerten', () => {
  it('angekommen heißt: der Befund ist bestätigt, nicht „bestanden"', () => {
    const e = bewerteVersuch(201, true, true)
    expect(e).toMatchObject({ durch: true, wieErwartet: true })
    expect(e.text).toMatch(/ANGEKOMMEN/)
  })

  it('abgewiesen, wo es abgewiesen gehört', () => {
    expect(bewerteVersuch(403, false, false)).toMatchObject({ durch: false, wieErwartet: true })
  })

  it('und jede Überraschung fällt auf — in beide Richtungen', () => {
    expect(bewerteVersuch(403, false, true).wieErwartet).toBe(false)
    expect(bewerteVersuch(201, true, false).wieErwartet).toBe(false)
  })

  /*
    Der teuer gelernte Fall: Die Mitteilung wurde geschrieben, aber der
    Absender darf sie nicht zurücklesen — PostgreSQL wendet SELECT-Richtlinien
    auf `RETURNING` an, und PostgREST hängt es bei `return=representation` an.
    Die erste Fassung urteilte nach dem Status und hätte S3 fälschlich als
    behoben abgehakt. Seither entscheidet allein, ob die Zeile am Ziel liegt.
  */
  it('ein 403 aus dem RETURNING kippt das Urteil nicht — gezählt wird, was ankam', () => {
    const e = bewerteVersuch(403, true, true)
    expect(e).toMatchObject({ durch: true, wieErwartet: true })
    expect(e.text).toBe('ANGEKOMMEN (HTTP 403)')
  })
})
