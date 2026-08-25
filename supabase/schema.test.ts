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
 *
 * ERWEITERT (T97), weil Namen zu prüfen nicht reicht: Am 23. August 2026 hat
 * ein Suchen-und-Ersetzen `schema.sql` zerrissen — `$$` fiel auf `$` zusammen
 * (die Datei ließ sich nicht mehr ausführen) und der Dateirest wurde sechsmal
 * eingespleißt. Von den sechs Fassungen jeder Richtlinie gewinnt beim Ausführen
 * die LETZTE, und das waren die alten, schwächeren von vor migration-022.
 * Diese Suite blieb dabei grün: `create function public.task_gehoert_mir`
 * stand ja weiterhin da — nur eben in einer Datei, die keine Datenbank je
 * angenommen hätte, und mit einem Rumpf, der die Rechteprüfung nicht enthielt.
 *
 * Die drei Proben unten schließen genau das: vollständige Dollar-Rümpfe, jede
 * Richtlinie genau einmal, und jeder Rumpf so wie in der jüngsten Migration.
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

/**
 * Eine Richtlinie vom Namen bis zum abschließenden `;`. Trägt keine der
 * Richtlinien dieses Projekts ein Semikolon im Rumpf, ist das eindeutig — die
 * Probe „kein `;` im Rumpf" steht als eigener Fall weiter unten.
 */
const RICHTLINIE = /create policy (\w+) on public\.(\w+)([\s\S]*?);/g

/** Eine Funktion samt Kopf (Sprache, Rechte, search_path) und Dollar-Rumpf. */
const FUNKTIONS_RUMPF = /create (?:or replace )?function public\.(\w+)([\s\S]*?)as \$\$([\s\S]*?)\$\$/g

/** Kommentare weg, Leerraum vereinheitlicht — verglichen wird die Regel. */
function normiert(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function richtlinien(sql: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const [, name, tabelle, rumpf] of sql.matchAll(RICHTLINIE)) {
    m.set(name, normiert(`${tabelle} ${rumpf}`))
  }
  return m
}

function funktionsRuempfe(sql: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const [, name, kopf, rumpf] of sql.matchAll(FUNKTIONS_RUMPF)) {
    m.set(name, normiert(`${kopf} § ${rumpf}`))
  }
  return m
}

/** Letzte Fassung je Name über die Migrationskette — die gilt beim Ausführen. */
function juengste(lies: (sql: string) => Map<string, string>): Map<string, { datei: string; rumpf: string }> {
  const out = new Map<string, { datei: string; rumpf: string }>()
  for (const datei of migrationen) {
    const sql = readFileSync(join(dir, datei), 'utf8')
    for (const [name, rumpf] of lies(sql)) out.set(name, { datei, rumpf })
  }
  return out
}

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

describe('schema.sql ist ausführbar und eindeutig', () => {
  it('jede Funktion hat einen vollständigen Dollar-Rumpf', () => {
    // `as $` statt `as $$` ist für PostgreSQL ein Syntaxfehler: Die ganze
    // Datei bricht ab, und zwar VOR jedem `enable row level security`. Eine
    // Neuinstallation nach dieser Anleitung bekäme also gar nichts — der Fehler
    // fällt zwar auf, aber erst dem, der ihn ausbadet.
    const namen = treffer(schema, FUNKTIONEN)
    const mitRumpf = [...funktionsRuempfe(schema).keys()]
    const ohneRumpf = namen.filter((n) => !mitRumpf.includes(n))
    expect(ohneRumpf, 'Funktion ohne geschlossenen $$-Rumpf').toEqual([])
  })

  it('jede Richtlinie steht genau einmal im Schema', () => {
    // Beim Ausführen gewinnt die letzte Fassung: `drop policy if exists` +
    // `create policy` heißt, dass eine zweite Kopie die erste still ersetzt.
    // Zwei Fassungen derselben Richtlinie sind deshalb nie „doppelt gemoppelt",
    // sondern immer eine Frage danach, welche gilt.
    const mehrfach = [...schema.matchAll(/create policy (\w+) on/g)]
      .map((m) => m[1])
      .reduce<Record<string, number>>((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), {})
    expect(Object.entries(mehrfach).filter(([, n]) => n > 1)).toEqual([])
  })

  it('keine Richtlinie trägt ein Semikolon im Rumpf', () => {
    // Sonst zerschneidet das Muster oben die Rümpfe an der falschen Stelle und
    // die Vergleichsproben würden Unfug melden — oder, schlimmer, Unfug
    // durchwinken. Trifft das eines Tages nicht mehr zu, ist dieser Fall der
    // Ort, an dem es auffällt.
    const bloecke = [...schema.matchAll(/create policy \w+ on public\.\w+([\s\S]*?);/g)]
    expect(bloecke.length).toBeGreaterThan(20)
    expect(bloecke.filter((b) => b[1].includes(';')).map((b) => b[0].slice(0, 60))).toEqual([])
  })
})

describe('schema.sql trägt die jüngste Fassung jeder Regel', () => {
  /**
   * Die Namensproben oben sagen nur, DASS es etwas gibt. Hier geht es darum,
   * WAS darin steht: Eine Migration, die eine Richtlinie verschärft, muss auch
   * im Schema ankommen — sonst bekommt jede Neuinstallation die alte, laxe
   * Fassung, und niemand merkt es, weil der Name ja stimmt.
   */
  it('jede Richtlinie aus der Kette steht im Schema — mit demselben Rumpf', () => {
    const imSchema = richtlinien(schema)
    const abweichend: string[] = []
    for (const [name, { datei, rumpf }] of juengste(richtlinien)) {
      const hier = imSchema.get(name)
      if (hier === undefined) abweichend.push(`${name} fehlt im Schema (${datei})`)
      else if (hier !== rumpf) abweichend.push(`${name} weicht von ${datei} ab`)
    }
    expect(abweichend).toEqual([])
  })

  it('jede Funktion aus der Kette steht im Schema — mit demselben Rumpf', () => {
    const imSchema = funktionsRuempfe(schema)
    const abweichend: string[] = []
    for (const [name, { datei, rumpf }] of juengste(funktionsRuempfe)) {
      const hier = imSchema.get(name)
      if (hier === undefined) abweichend.push(`${name}() fehlt im Schema (${datei})`)
      else if (hier !== rumpf) abweichend.push(`${name}() weicht von ${datei} ab`)
    }
    expect(abweichend).toEqual([])
  })

  it('die Proben greifen überhaupt', () => {
    // Gegenprobe zur Gegenprobe: Fände `juengste()` nichts, gingen beide Fälle
    // oben leer und damit grün durch — die Zusage wäre wertlos.
    expect(juengste(richtlinien).size).toBeGreaterThan(5)
    expect(juengste(funktionsRuempfe).size).toBeGreaterThan(3)
  })
})

describe('die Rechteprüfungen stehen im Schema', () => {
  /**
   * Drei Regeln, die je einen gemessenen Missbrauch abstellen. Sie stehen hier
   * einzeln, weil die Vergleichsproben oben nur „Schema = jüngste Migration"
   * sichern: Verschwände die Bedingung aus BEIDEN, bliebe das unbemerkt.
   */
  it('bestätigen darf nur, wem die Aufgabe gehört (T89)', () => {
    const rumpf = richtlinien(schema).get('confirmations_write') ?? ''
    expect(rumpf).toContain('task_gehoert_mir(task_key)')
  })

  it('eine Verhinderungs-Meldung geht nur an Planer (T89)', () => {
    const rumpf = richtlinien(schema).get('notifications_insert') ?? ''
    expect(rumpf).toContain('m.planner')
  })

  it('eine Abwesenheit gilt nur der eigenen Person (T97)', () => {
    // Der Zweig „die Zeile gehört mir" sagt nichts über `person_id` — genau
    // darüber ließ sich eine Abwesenheit auf einen Fremden eintragen. Im
    // `with check` muss er deshalb an die eigene Person gebunden sein.
    const rumpf = richtlinien(schema).get('absences_write') ?? ''
    const check = rumpf.slice(rumpf.indexOf('with check'))
    expect(check).toContain('person_id is null or person_id = public.my_person_id()')
  })
})
