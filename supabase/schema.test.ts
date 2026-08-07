import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `schema.sql` ist der Einstieg für Neuinstallationen (README „Hosting"), und
 * jede Migration behauptet in ihrem Kopf „Neuinstallationen brauchen diese
 * Datei nicht — schema.sql enthält alles". Diese Zusage hielt niemand nach:
 * fs_rules, fs_weeks, is_group_overseer(), reminder_log und persons.fam waren
 * über Monate nur in den Migrationen zu finden. Wer der Anleitung folgte,
 * bekam eine Versammlung, in der die Treffpunkte tot waren und jedes Speichern
 * einer Person fehlschlug.
 *
 * Der Test liest beide Seiten und vergleicht die erzeugten Objekte. Er kennt
 * kein SQL — er sucht die Muster, mit denen dieses Projekt Objekte anlegt.
 */

const dir = import.meta.dirname
const schema = readFileSync(join(dir, 'schema.sql'), 'utf8')
const migrationen = readdirSync(dir)
  .filter((f) => /^migration-\d+.*\.sql$/.test(f))
  .sort()

/** Alle Vorkommen der ersten Gruppe eines globalen Musters. */
function treffer(sql: string, muster: RegExp): string[] {
  return [...sql.matchAll(muster)].map((m) => m[1].toLowerCase())
}

const TABELLEN = /create table if not exists public\.(\w+)/g
const FUNKTIONEN = /create (?:or replace )?function public\.(\w+)/g
const SPALTEN = /alter table public\.(\w+)\s+add column if not exists (\w+)/g

describe('schema.sql deckt die Migrationskette ab', () => {
  it('überhaupt Migrationen gefunden', () => {
    // Sonst ginge der Test grün durch, ohne etwas zu prüfen.
    expect(migrationen.length).toBeGreaterThan(10)
  })

  it('jede in einer Migration angelegte Tabelle steht auch im Schema', () => {
    const imSchema = new Set(treffer(schema, TABELLEN))
    const fehlend: string[] = []
    for (const datei of migrationen) {
      const sql = readFileSync(join(dir, datei), 'utf8')
      for (const tabelle of treffer(sql, TABELLEN)) {
        if (!imSchema.has(tabelle)) fehlend.push(`${tabelle} (${datei})`)
      }
    }
    expect(fehlend).toEqual([])
  })

  it('jede in einer Migration angelegte Funktion steht auch im Schema', () => {
    const imSchema = new Set(treffer(schema, FUNKTIONEN))
    const fehlend: string[] = []
    for (const datei of migrationen) {
      const sql = readFileSync(join(dir, datei), 'utf8')
      for (const fn of treffer(sql, FUNKTIONEN)) {
        if (!imSchema.has(fn)) fehlend.push(`${fn}() (${datei})`)
      }
    }
    expect(fehlend).toEqual([])
  })

  it('jede nachträglich ergänzte Spalte steht im Schema — in der Tabelle oder als alter', () => {
    const fehlend: string[] = []
    for (const datei of migrationen) {
      const sql = readFileSync(join(dir, datei), 'utf8')
      for (const [, tabelle, spalte] of sql.matchAll(SPALTEN)) {
        // Der Spaltenname muss im Schema vorkommen — entweder direkt in der
        // create-table-Anweisung oder als gleichlautendes alter.
        const block = schema.match(
          new RegExp(`create table if not exists public\\.${tabelle}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'),
        )
        const alterDa = new RegExp(
          `alter table public\\.${tabelle}[\\s\\S]{0,80}?add column if not exists ${spalte}\\b`,
          'i',
        ).test(schema)
        const inTabelle = block ? new RegExp(`^\\s*${spalte}\\s`, 'im').test(block[1]) : false
        if (!alterDa && !inTabelle) fehlend.push(`${tabelle}.${spalte} (${datei})`)
      }
    }
    expect(fehlend).toEqual([])
  })

  it('jede Tabelle im Schema hat Row-Level-Security', () => {
    // Eine Tabelle ohne RLS wäre für jedes angemeldete Konto frei lesbar —
    // die Mandantentrennung hängt vollständig daran.
    const ohne = treffer(schema, TABELLEN).filter(
      (t) => !new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(schema),
    )
    expect(ohne).toEqual([])
  })
})
