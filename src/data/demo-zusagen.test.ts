import { describe, expect, it } from 'vitest'
import { buildDemoConfirmations } from './demo-zusagen'
import { deriveMyFsTasks } from './fs'
import { deriveMyTasks, helferKey } from './planning'
import { buildDemoFsWeeks, buildDemoWeeks, DEMO_SERVICES, DEMO_UNBESTAETIGT } from './testdaten'
import { STANDARD_ZEITEN } from './vorgaben'

/**
 * **Die Demo zeigt, was die Ampel kann** — alle drei Stufen, in jeder Woche.
 *
 * Die Handbuch-Aufnahmen und jeder Blick in die Demo leben davon. Stünde alles
 * auf Gelb, verriete keine Aufnahme, wie ein bestätigter oder abgesagter Platz
 * aussieht. Und weil die Zusagen mit den Schlüsseln des Betriebs gebaut werden,
 * prüft diese Datei zugleich, dass sie auf echte Plätze zeigen: gezählt wird an
 * den Aufgaben, die die Personen selbst bestätigen würden.
 */

const weeks = buildDemoWeeks()
const fsWeeks = buildDemoFsWeeks()
const zusagen = buildDemoConfirmations(weeks, DEMO_SERVICES, fsWeeks, DEMO_UNBESTAETIGT)

const aufgabenVon = (name: string) => [
  ...deriveMyTasks(weeks, DEMO_SERVICES, name, {}, STANDARD_ZEITEN),
  ...deriveMyFsTasks(fsWeeks, weeks.map((w) => w.start), name, {}, undefined, 'Leiter'),
]

describe('Zusagen im Demo-Modus', () => {
  it('wer als unbestätigt geführt ist, hat nirgends zugesagt — aber abgesagt haben kann er', () => {
    for (const name of DEMO_UNBESTAETIGT) {
      const stufen = aufgabenVon(name).map((a) => zusagen[a.id])
      expect(stufen.length, `${name} hat keine Aufgaben — die Vorgabe prüft nichts`).toBeGreaterThan(0)
      expect(stufen.filter((s) => s === 'bestätigt'), name).toEqual([])
    }
  })

  it('alle anderen haben ihre Plätze bestätigt — auch Treffpunkte', () => {
    const manfred = aufgabenVon('Manfred Albrecht')
    expect(manfred.length).toBeGreaterThan(0)
    expect(manfred.every((a) => zusagen[a.id] === 'bestätigt')).toBe(true)
    expect(Object.keys(zusagen).some((k) => k.startsWith('fs|'))).toBe(true)
  })

  it('jede Woche hat eine Absage — am zweiten Mikrofon unter der Woche', () => {
    for (const w of weeks) {
      expect(zusagen[helferKey(w.start, 'mid', 'mik', 1)], w.range).toBe('verhindert')
    }
  })

  it('jede Zusage gehört einem echten Platz', () => {
    // Gegenprobe zu den Schlüsseln: Eine Zusage, die keine Aufgabe trifft, wäre
    // in der Demo unsichtbar — und ein Hinweis, dass die Schlüssel auseinanderlaufen.
    const alleNamen = new Set<string>()
    for (const w of weeks) {
      for (const tab of ['mid', 'we'] as const) {
        for (const arr of Object.values(w[tab].helpers)) for (const s of arr) if (s.name) alleNamen.add(s.name)
        for (const sec of w[tab].sections)
          for (const it of sec.items) if ('names' in it) for (const s of it.names) if (s.name) alleNamen.add(s.name)
      }
    }
    for (const inst of fsWeeks.flat()) if (inst.leader) alleNamen.add(inst.leader)
    const getroffen = new Set([...alleNamen].flatMap((n) => aufgabenVon(n).map((a) => a.id)))
    expect(Object.keys(zusagen).filter((k) => !getroffen.has(k))).toEqual([])
  })
})
