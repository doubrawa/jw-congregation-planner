import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Weitere Pläne schreiben — als Ablauf, nicht als Aufruf** (T120, Phase 5).
 *
 * `data-save.test.ts` prüft je Schreiber, welche Tabelle er anspricht; sein
 * Stub antwortet sofort. Hier zählt die Reihenfolge über die Zeit: Ein
 * Eintrag zeigt auf seinen Plan (Fremdschlüssel). Ginge er hinaus, während der
 * Plan noch unterwegs ist, wiese die Datenbank ihn ab — „Neuer Plan" und
 * gleich „Reihum verteilen" genügten dafür. Deshalb ein Stub, der einen
 * Schreibvorgang **aufhalten** kann, und ein Protokoll dessen, was in welcher
 * Reihenfolge ankam.
 */
const db = vi.hoisted(() => {
  const protokoll: string[] = []
  // Je Tabelle: Die Schlange ruft `upsert` erst später auf, nicht beim
  // Speichern — eine Bremse, die zur Aufrufzeit gesetzt sein müsste, verpasste
  // ihn (so stand es zuerst hier, und der Test maß nichts).
  const zustand: { bremse: Partial<Record<string, Promise<void>>>; scheitern: string | null } = { bremse: {}, scheitern: null }
  const client = {
    from(tabelle: string) {
      return {
        delete: () => ({
          eq: () => ({
            in: (_spalte: string, ids: string[]) => {
              protokoll.push(`delete ${tabelle} ${ids.join(',')}`)
              return Promise.resolve({ error: null })
            },
          }),
        }),
        upsert: (zeilen: Record<string, unknown>[]) => {
          const warten = zustand.bremse[tabelle]
          return (async () => {
            if (warten) await warten
            if (zustand.scheitern === tabelle) throw new Error(`Netz weg (${tabelle})`)
            protokoll.push(`upsert ${tabelle} ${zeilen.map((z) => String(z.id)).join(',')}`)
            return { error: null, zeilen }
          })()
        },
      }
    },
  }
  return { client, protokoll, zustand }
})

vi.mock('./supabase', () => ({ supabase: db.client }))

import { savePlaene, savePlanEintraege, setSchreibfehlerMelder } from './data'
import type { PlanEintrag, WeitererPlan } from '../data/types'

const plan: WeitererPlan = { id: 'p1', name: 'Grundreinigung', von: '2026-09-21', bis: '2026-10-04', entwurf: true }
const eintrag: PlanEintrag = { id: 'e1', planId: 'p1', datum: '2026-09-21', grp: 'x1' }

/** Bis alles Wartende durch die Schlange ist (sie hängt Versprechen aneinander). */
const ruhe = () => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => {
  await ruhe()
  db.protokoll.length = 0
  db.zustand.bremse = {}
  db.zustand.scheitern = null
})

describe('Pläne und Einträge in einer Schlange', () => {
  it('ein Eintrag wartet, bis sein Plan angekommen ist — auch wenn der Plan auf sich warten lässt', async () => {
    let loslassen!: () => void
    db.zustand.bremse.plaene = new Promise<void>((r) => (loslassen = r)) // nur der Plan ist langsam
    savePlaene('c1', [plan])
    savePlanEintraege('c1', [eintrag])
    await ruhe()
    // Der Plan hängt — und der Eintrag ist nicht an ihm vorbeigegangen.
    expect(db.protokoll).toEqual([])
    loslassen()
    await ruhe()
    expect(db.protokoll).toEqual(['upsert plaene p1', 'upsert plan_eintraege e1'])
  })

  it('erst gelöscht, dann geschrieben — gelöscht nur, was entfernt wurde', async () => {
    savePlanEintraege('c1', [eintrag], ['e9'])
    await ruhe()
    expect(db.protokoll).toEqual(['delete plan_eintraege e9', 'upsert plan_eintraege e1'])
  })

  it('ohne Änderung und ohne Entferntes geht nichts hinaus', async () => {
    savePlaene('c1', [])
    savePlanEintraege('c1', [], [])
    await ruhe()
    expect(db.protokoll).toEqual([])
  })

  it('ein Netzfehler wird gemeldet und hält die Schlange nicht an', async () => {
    const melder = vi.fn()
    const konsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    setSchreibfehlerMelder(melder)
    db.zustand.scheitern = 'plaene'
    savePlaene('c1', [plan])
    savePlanEintraege('c1', [eintrag])
    await ruhe()
    await ruhe()
    expect(melder).toHaveBeenCalledTimes(1)
    expect(konsole).toHaveBeenCalledWith('[persistenz]', 'Netz weg (plaene)')
    // Der Eintrag ging trotzdem hinaus — sonst bliebe nach einem Fehler alles stecken.
    expect(db.protokoll).toEqual(['upsert plan_eintraege e1'])
    setSchreibfehlerMelder(null)
    konsole.mockRestore()
  })
})
