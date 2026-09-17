import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `schema.sql` ist **die** Quelle des Datenbankschemas (README „Hosting").
 *
 * Bis zum 17. September 2026 lag daneben eine Kette von 25 Migrationen, und
 * jede versicherte in ihrem Kopf „Neuinstallationen brauchen diese Datei nicht
 * — schema.sql enthält alles". Niemand hielt das nach: fs_rules, fs_weeks,
 * is_group_overseer(), reminder_log und persons.fam waren über Monate nur in
 * den Migrationen zu finden. Wer der Anleitung folgte, bekam eine Versammlung,
 * in der die Treffpunkte tot waren und jedes Speichern einer Person
 * fehlschlug. Diese Suite verglich damals beide Seiten.
 *
 * **Die Kette ist gestrichen** — die App war noch nicht ausgerollt, also war
 * eine zweite Quelle nur Last. Damit entfällt der Vergleich; was bleibt, sind
 * die Proben an der Datei selbst, und die sind der eigentliche Grund, warum es
 * diese Suite gibt:
 *
 * Am 23. August 2026 hat ein Suchen-und-Ersetzen `schema.sql` zerrissen — `$$`
 * fiel auf `$` zusammen (die Datei ließ sich nicht mehr ausführen) und der
 * Dateirest wurde sechsmal eingespleißt. Von den sechs Fassungen jeder
 * Richtlinie gewinnt beim Ausführen die LETZTE, und das waren die alten,
 * schwächeren. Die Suite blieb dabei grün: `create function
 * public.task_gehoert_mir` stand ja weiterhin da — nur eben in einer Datei,
 * die keine Datenbank je angenommen hätte, und mit einem Rumpf, der die
 * Rechteprüfung nicht enthielt.
 */

const dir = import.meta.dirname
const schema = readFileSync(join(dir, 'schema.sql'), 'utf8')

/** Alle Vorkommen der ersten Gruppe eines globalen Musters. */
function treffer(sql: string, muster: RegExp): string[] {
  return [...sql.matchAll(muster)].map((m) => m[1].toLowerCase())
}

const TABELLEN = /create table if not exists public\.(\w+)/g
const FUNKTIONEN = /create (?:or replace )?function public\.(\w+)/g

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

describe('schema.sql ist vollständig, ausführbar und eindeutig', () => {
  it('die Proben greifen überhaupt', () => {
    // Gegenprobe zur Gegenprobe: Fänden die Muster nichts, gingen alle Fälle
    // unten leer und damit grün durch — die Zusage wäre wertlos.
    expect(treffer(schema, TABELLEN).length).toBeGreaterThan(10)
    expect(richtlinien(schema).size).toBeGreaterThan(5)
    expect(funktionsRuempfe(schema).size).toBeGreaterThan(3)
  })

  it('jede Tabelle hat Row-Level-Security', () => {
    // Eine Tabelle ohne RLS wäre für jedes angemeldete Konto frei lesbar —
    // die Mandantentrennung hängt vollständig daran.
    const ohne = treffer(schema, TABELLEN).filter(
      (t) => !new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(schema),
    )
    expect(ohne).toEqual([])
  })

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

  it('jede Richtlinie steht genau einmal', () => {
    // Beim Ausführen gewinnt die letzte Fassung: `drop policy if exists` +
    // `create policy` heißt, dass eine zweite Kopie die erste still ersetzt.
    // Zwei Fassungen derselben Richtlinie sind deshalb nie „doppelt gemoppelt",
    // sondern immer eine Frage danach, welche gilt.
    const mehrfach = [...schema.matchAll(/create policy (\w+) on/g)]
      .map((m) => m[1])
      .filter((name, i, alle) => alle.indexOf(name) !== i)
    expect([...new Set(mehrfach)], 'Richtlinie mehrfach angelegt').toEqual([])
  })

  it('jede Funktion steht genau einmal', () => {
    // Dasselbe eine Ebene tiefer: `create or replace` ersetzt still.
    const mehrfach = treffer(schema, FUNKTIONEN).filter(
      (name, i, alle) => alle.indexOf(name) !== i,
    )
    expect([...new Set(mehrfach)], 'Funktion mehrfach angelegt').toEqual([])
  })
})

describe('die Rechteprüfungen stehen im Schema', () => {
  /**
   * Drei Regeln, die je einen gemessenen Missbrauch abstellen. Sie stehen hier
   * einzeln und wörtlich, weil eine Datei, die nur mit sich selbst verglichen
   * wird, jede Abschwächung mitmacht.
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

describe('kein Altbestand mehr im Schema', () => {
  it('der Aufgaben-Schlüssel kennt nur noch die stabile Kennung', () => {
    // Die positionsbasierte Form (`…|part|<si>|<ii>|<ni>`, sechs Felder) fiel
    // mit der Altlasten-Räumung weg: Jeder Programmpunkt trägt seit dem Import
    // seine `iid`. Bliebe der Zweig stehen, akzeptierte die Datenbank weiter
    // Schlüssel, die der Client nie schreibt — eine offene Fläche ohne Nutzen.
    const fn = funktionsRuempfe(schema).get('task_gehoert_mir') ?? ''
    expect(fn).not.toContain('n = 6')
  })

  it('services trägt keine priv-Spalte mehr', () => {
    // Jeder Dienst leitet seinen Bereich aus dem Key ab (`svc:<key>`); die
    // Spalte hielt nur die frühere feste Zuordnung fest.
    const block = schema.match(
      /create table if not exists public\.services\s*\(([\s\S]*?)\n\);/i,
    )
    expect(block?.[1] ?? '').not.toMatch(/^\s*priv\s/m)
  })
})
