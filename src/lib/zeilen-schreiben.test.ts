import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Tabellen „eine Zeile je …" schreiben — als Ablauf, mit Abweisungen.**
 *
 * `plan-schreiben.test.ts` prüft die Reihenfolge der Weiteren Pläne. Hier geht
 * es um das, was die Datenbank **ablehnt**: Ein Platz ist inzwischen besetzt,
 * der Termin gelöscht, das Recht entzogen — oder das Netz ist weg. Das erste
 * erklärt nur ein veralteter Stand; dann muss nachgeladen werden, sonst steht
 * lokal weiter „Du bist eingetragen" für einen Platz, den es so nicht gibt
 * (bis zum 3.10.2026 lud nur ein voller Platz und eine Dublette nach). Das letzte ist
 * ein Schreibfehler: melden, nicht nachladen.
 *
 * Der Stub antwortet je Tabelle und Vorgang, kann einen Vorgang aufhalten und
 * schreibt mit, was in welcher Reihenfolge ankam — samt Abweisung (`✗code`).
 */
const db = vi.hoisted(() => {
  type Fehler = { message: string; code?: string }
  const protokoll: string[] = []
  const zustand: {
    bremse: Partial<Record<string, Promise<void>>>
    abweisen: (tabelle: string, vorgang: string, ids: string[]) => Fehler | null
  } = { bremse: {}, abweisen: () => null }
  const antwort = async (tabelle: string, vorgang: string, ids: string[]): Promise<{ error: Fehler | null }> => {
    const warten = zustand.bremse[tabelle]
    if (warten) await warten
    const error = zustand.abweisen(tabelle, vorgang, ids)
    protokoll.push(`${vorgang} ${tabelle} ${ids.join(',')}${error ? ` ✗${error.code ?? ''}` : ''}`)
    return { error }
  }
  const ids = (zeilen: unknown): string[] =>
    (Array.isArray(zeilen) ? zeilen : [zeilen]).map((z) => String((z as { id: unknown }).id))
  const client = {
    from(tabelle: string) {
      return {
        delete: () => ({ eq: () => ({ in: (_spalte: string, weg: string[]) => antwort(tabelle, 'delete', weg) }) }),
        upsert: (zeilen: unknown) => antwort(tabelle, 'upsert', ids(zeilen)),
        insert: (zeilen: unknown) => antwort(tabelle, 'insert', ids(zeilen)),
      }
    },
  }
  return { client, protokoll, zustand }
})

vi.mock('./supabase', () => ({ supabase: db.client }))

import {
  saveFsRules,
  saveGruppenbesuche,
  setKonfliktMelder,
  setSchreibfehlerMelder,
} from './data'
import type { FsRule, Gruppenbesuch } from '../data/types'

/** Bis alles Wartende durch die Schlange ist (sie hängt Versprechen aneinander). */
const ruhe = () => new Promise((r) => setTimeout(r, 0))

const konflikt = vi.fn()
const schreibfehler = vi.fn()

beforeEach(async () => {
  await ruhe()
  db.protokoll.length = 0
  db.zustand.bremse = {}
  db.zustand.abweisen = () => null
  konflikt.mockClear()
  schreibfehler.mockClear()
  setKonfliktMelder(konflikt)
  setSchreibfehlerMelder(schreibfehler)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Die übrigen Tabellen „eine Zeile je …"', () => {
  const besuch: Gruppenbesuch = { id: 'b1', woche: '2026-10-05', grp: 'g1', pid: 'p1' }
  const regel = { id: 'r1', grp: null, wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: false } as FsRule

  it('zwei Planer, dieselbe Gruppe in derselben Woche: der zweite lädt nach', async () => {
    db.zustand.abweisen = () => ({ code: '23505', message: 'gruppenbesuche_congregation_id_woche_grp_key' })
    saveGruppenbesuche('c1', [besuch])
    await ruhe()
    expect(konflikt).toHaveBeenCalledTimes(1)
    expect(schreibfehler).not.toHaveBeenCalled()
  })

  it('ein Besucher, den es nicht mehr gibt (23503): nachladen', async () => {
    db.zustand.abweisen = () => ({ code: '23503', message: 'gruppenbesuche_person_fk' })
    saveGruppenbesuche('c1', [besuch])
    await ruhe()
    expect(konflikt).toHaveBeenCalledTimes(1)
  })

  it('ein Netzfehler beim Grundplan: gemeldet, nicht nachgeladen', async () => {
    db.zustand.abweisen = () => ({ code: '', message: 'Failed to fetch' })
    saveFsRules('c1', [regel])
    await ruhe()
    expect(schreibfehler).toHaveBeenCalledTimes(1)
    expect(konflikt).not.toHaveBeenCalled()
  })

  it('ohne Abweisung: weder gemeldet noch nachgeladen', async () => {
    saveGruppenbesuche('c1', [besuch], ['b0'])
    saveFsRules('c1', [regel])
    await ruhe()
    expect(db.protokoll).toEqual(['delete gruppenbesuche b0', 'upsert fs_rules r1', 'upsert gruppenbesuche b1'])
    expect(konflikt).not.toHaveBeenCalled()
    expect(schreibfehler).not.toHaveBeenCalled()
  })
})
