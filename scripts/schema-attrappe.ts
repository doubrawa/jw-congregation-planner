import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { vi } from 'vitest'

/**
 * **Jeder REST-Aufruf der Wartungsskripte, gehalten an `schema.sql`.**
 *
 * Die Skripte sind JavaScript ohne Typen — der Compiler, der in `src/` jede
 * umbenannte Spalte meldet, sieht sie nicht. Beim Datenmodell-Umbau vom
 * 18.9.2026 (T105) sind genau hier Stellen stehen geblieben: der Grundplan in
 * `testversammlung-anlegen.mjs` als Blob mit `base`, `grp: ''` in
 * `treffpunkte-importieren.mjs`. PostgREST antwortet auf eine Spalte, die es
 * nicht gibt, mit 400. Im Wartungsskript ist das ein Abbruch mitten im Lauf;
 * in den beiden RLS-Proben ist es schlimmer, denn dort gilt eine Abweisung als
 * „die Grenze hält" — eine vertippte Spalte bestünde jede Fremd-Probe.
 *
 * Deshalb fährt `schema-probe.test.ts` jedes Skript einmal gegen die Attrappe
 * hier. Sie hängt als globales `fetch` **unter** dem echten REST-Klienten:
 * Geprüft wird, was tatsächlich über die Leitung ginge, nicht, was ein
 * Skript zu schicken meint.
 *
 * Diese Datei ist kein Test, sondern sein Werkzeug (vitest sammelt nur
 * `*.test.ts`).
 */

export const SCHEMA_SQL = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

/**
 * Nur die Skripte, die wirklich mit der Datenbank reden.
 *
 * Erkannt an ihrer **Abhängigkeit**, nicht mehr an der Zeichenkette
 * `rest/v1`: Seit der Zugriff auf PostgREST in `gemeinsam.mjs` steht
 * (`restKlient`/`pruefKlient`), kommt die Adresse in den Skripten gar nicht
 * mehr vor — und die Probe, die sie danach suchte, sah plötzlich nur noch
 * vier von elf. Genau die Sorte Probe, die still aufhört zu messen.
 *
 * Steht hier, weil zwei Proben danach fragen (`schluessel-einheitlich` und
 * `schema-probe`); zwei Abschriften derselben Erkennung liefen auseinander.
 */
export const REDET_MIT_DB = /rest\/v1|supabase\.co|\brestKlient\(|\bpruefKlient\(|\bzugangsdaten\(/

/* ===================== Das Schema lesen =================================== */

export interface Spalte {
  typ: string
  nullbar: boolean
  pflicht: boolean
}

/**
 * Die Spalten einer Tabelle, wie `schema.sql` sie anlegt: Name → Typ, ob `null`
 * erlaubt ist, und ob eine neue Zeile sie **mitbringen muss** (`not null` oder
 * Primärschlüssel, ohne `default`).
 *
 * Gelesen wird der `create table`-Block Zeile für Zeile, dazu jedes spätere
 * `alter table … add column` — im Schema allein `persons.grp`, der Kreis
 * zwischen Personen und Gruppen; ohne diesen Zweig wäre jede Person „fremd".
 * Tabellenweite Zeilen (`constraint`, `unique`, die Fortsetzung eines
 * Fremdschlüssels oder einer Prüfung) beginnen mit einem Schlüsselwort und
 * fallen heraus.
 */
export function schemaSpalten(tabelle: string, schema = SCHEMA_SQL): Map<string, Spalte> {
  const spalten = new Map<string, Spalte>()
  const aufnehmen = (zeile: string): void => {
    const m = /^\s*(\w+)\s+(\w+(?:\[\])?)(.*)$/.exec(zeile.replace(/--.*$/, ''))
    if (!m || /^(constraint|unique|primary|foreign|check|references|exclude)$/i.test(m[1]!)) return
    const rest = m[3]!.toLowerCase()
    const nullbar = !/\bnot null\b|\bprimary key\b/.test(rest)
    spalten.set(m[1]!, { typ: m[2]!.toLowerCase(), nullbar, pflicht: !nullbar && !/\bdefault\b/.test(rest) })
  }
  const block = new RegExp(`create table if not exists public\\.${tabelle}\\s*\\(([\\s\\S]*?)\\n\\);`).exec(schema)
  for (const zeile of (block?.[1] ?? '').split(/\r?\n/)) aufnehmen(zeile)
  const spaeter = new RegExp(`alter table public\\.${tabelle}\\s+add column if not exists ([^;]+);`, 'g')
  for (const [, definition] of schema.matchAll(spaeter)) aufnehmen(definition!)
  return spalten
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATUM = /^\d{4}-\d{2}-\d{2}$/

/**
 * Passt ein Wert in eine Spalte dieses Typs? Nur die Typen, die die Skripte
 * schreiben — kommt eine Spalte anderen Typs dazu, meldet die Probe das, statt
 * sie stillschweigend durchzuwinken.
 */
export const PASST: Record<string, (wert: unknown) => boolean> = {
  text: (w) => typeof w === 'string',
  uuid: (w) => typeof w === 'string' && UUID.test(w),
  smallint: (w) => Number.isInteger(w),
  integer: (w) => Number.isInteger(w),
  boolean: (w) => typeof w === 'boolean',
  time: (w) => typeof w === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(w),
  date: (w) => typeof w === 'string' && DATUM.test(w),
  timestamptz: (w) => typeof w === 'string' && !Number.isNaN(Date.parse(w)),
  'date[]': (w) => Array.isArray(w) && w.every((d) => typeof d === 'string' && DATUM.test(d)),
  'text[]': (w) => Array.isArray(w) && w.every((s) => typeof s === 'string'),
  // Ein Objekt, kein vorab serialisierter Text: `JSON.stringify(week)` stünde
  // in `jsonb` als String da und wäre für die App keine Woche mehr.
  jsonb: (w) => typeof w === 'object',
}

/* ===================== Einen Aufruf prüfen ================================ */

/** Ein REST-Aufruf, wie er bei PostgREST ankäme: `tabelle?abfrage`, Methode, Rumpf. */
export interface Aufruf {
  pfad: string
  method: string
  body?: unknown
}

/** Parameter in der Adresse, die keine Spalte nennen. */
const KEINE_SPALTE = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

/** Die Tabelle eines Aufrufs. */
export const tabelleVon = (a: Aufruf): string => a.pfad.split('?')[0] ?? ''

/**
 * Was an einem Aufruf nicht zu `schema.sql` passt — leer heißt: in Ordnung.
 *
 * Gefragt werden die Tabelle aus dem Pfad, jede Spalte in Filter, `select` und
 * `order`, und bei jeder mitgeschickten Zeile Feld, Typ und `null` — beim
 * Anlegen (POST) dazu die Pflichtspalten. Eine Änderung (PATCH) bringt nur
 * mit, was sie ändert.
 */
export function schemaFehler({ pfad, method, body }: Aufruf, schema = SCHEMA_SQL): string[] {
  const [tabelle = '', abfrage = ''] = pfad.split('?')
  const spalten = schemaSpalten(tabelle, schema)
  if (!spalten.size) return [`${method} ${tabelle}: keine Tabelle in schema.sql`]
  const fehler: string[] = []
  const nenne = (spalte: string, was: string): void => {
    fehler.push(`${method} ${tabelle}.${spalte}: ${was}`)
  }
  for (const [k, v] of new URLSearchParams(abfrage)) {
    const genannt =
      k === 'select' ? v.split(',').filter((s) => s !== '*')
      : k === 'order' ? v.split(',').map((s) => s.split('.')[0] ?? '')
      : KEINE_SPALTE.has(k) ? []
      : [k]
    for (const s of genannt) if (!spalten.has(s)) nenne(s, 'gibt es nicht')
  }
  const zeilen = (body === undefined ? [] : Array.isArray(body) ? body : [body]) as Record<string, unknown>[]
  for (const zeile of zeilen) {
    for (const [k, wert] of Object.entries(zeile)) {
      const s = spalten.get(k)
      const passt = s && PASST[s.typ]
      if (!s) nenne(k, 'gibt es nicht')
      else if (wert === null) {
        if (!s.nullbar) nenne(k, 'null in einer not-null-Spalte')
      } else if (!passt) nenne(k, `Typ ${s.typ} kennt die Probe nicht — PASST ergänzen`)
      else if (!passt(wert)) nenne(k, `${String(JSON.stringify(wert)).slice(0, 60)} ist kein ${s.typ}`)
    }
    if (method !== 'POST') continue
    for (const [name, s] of spalten) if (s.pflicht && !(name in zeile)) nenne(name, 'Pflichtspalte fehlt')
  }
  return fehler
}

/** Jeder Befund einmal: Eine Spalte, die 30 Zeilen verfehlen, ist ein Fehler, nicht dreißig. */
export function befunde(aufrufe: Aufruf[], schema = SCHEMA_SQL): string[] {
  return [...new Set(aufrufe.flatMap((a) => schemaFehler(a, schema)))]
}

/* ===================== Die Attrappe ======================================= */

export type Zeile = Record<string, unknown>
export type Bestand = Record<string, Zeile[]>

export interface Konto {
  id: string
  email: string
}

/** Antwort einer Edge Function: Status (Vorgabe 200) und JSON-Rumpf. */
export interface FunktionsAntwort {
  status?: number
  json?: unknown
}

export interface Umgebung {
  /** Die Tabellen, wie sie vor dem Lauf in der Datenbank stünden. */
  bestand?: Bestand
  /** Konten für die Auth-API und die Anmeldung per Kennwort. */
  konten?: Konto[]
  /** Edge Functions nach Name. */
  funktionen?: Record<string, (rumpf: Record<string, unknown>) => FunktionsAntwort>
  /** Weitere Umgebungsvariablen (die RLS-Proben lesen ihre Konten daraus). */
  env?: Record<string, string>
}

/** Ein Filter aus der Adresse: `eq.x`, `neq.x`, `is.null`, `in.(a,b)`, `like.a*`. */
function passtFilter(wert: unknown, ausdruck: string): boolean {
  const punkt = ausdruck.indexOf('.')
  const op = ausdruck.slice(0, punkt)
  const v = ausdruck.slice(punkt + 1)
  switch (op) {
    case 'eq': return String(wert) === v
    case 'neq': return String(wert) !== v
    case 'is': return v === 'null' ? wert == null : String(wert) === v
    case 'in': return v.replace(/^\(|\)$/g, '').split(',').includes(String(wert))
    case 'like': {
      const muster = v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      return new RegExp(`^${muster}$`).test(String(wert))
    }
    default: throw new Error(`Attrappe: Filter ${ausdruck} kennt sie nicht`)
  }
}

/**
 * Ein PostgREST im Speicher, dazu Anmeldung, Konten-API und Edge Functions —
 * gerade so viel, dass jedes Skript bis zu seinen Schreibaufrufen kommt.
 *
 * **Keine Richtlinien**, bis auf eine: `members` zeigt einem angemeldeten
 * Konto nur die eigene Zeile, denn daran erkennen die RLS-Proben, wer sie
 * sind. Alles andere sieht jeder — die Proben laufen damit auch in ihre
 * Aufräum-Zweige, und deren Aufrufe stehen dann ebenfalls unter Prüfung.
 */
export function attrappe({ bestand = {}, konten = [], funktionen = {} }: Umgebung = {}) {
  const tabellen: Bestand = structuredClone(bestand)
  const alleKonten = [...konten]
  const aufrufe: Aufruf[] = []
  const angemeldet = new Map<string, Konto>()

  const antwort = (status: number, json?: unknown): Response =>
    new Response(json === undefined ? null : JSON.stringify(json), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const projiziere = (z: Zeile, auswahl: string | null): Zeile =>
    !auswahl || auswahl === '*' ? { ...z } : Object.fromEntries(auswahl.split(',').map((s) => [s, z[s]]))

  function postgrest(tabelle: string, abfrage: URLSearchParams, method: string, rumpf: unknown, kopf: Headers): Response {
    const zeilen = (tabellen[tabelle] ??= [])
    const filter = [...abfrage].filter(([k]) => !KEINE_SPALTE.has(k))
    const wer = angemeldet.get((kopf.get('Authorization') ?? '').replace(/^Bearer /, ''))
    const trifft = (z: Zeile): boolean =>
      filter.every(([k, v]) => passtFilter(z[k], v)) && (tabelle !== 'members' || !wer || z.user_id === wer.id)
    const zeigen = (kopf.get('Prefer') ?? '').includes('return=representation')

    if (method === 'GET') {
      let treffer = zeilen.filter(trifft)
      const ordnung = abfrage.get('order')
      if (ordnung) {
        const [spalte = '', richtung] = ordnung.split('.')
        const vorzeichen = richtung === 'desc' ? -1 : 1
        treffer = [...treffer].sort((a, b) => vorzeichen * String(a[spalte]).localeCompare(String(b[spalte])))
      }
      const grenze = abfrage.get('limit')
      if (grenze) treffer = treffer.slice(0, Number(grenze))
      return antwort(200, treffer.map((z) => projiziere(z, abfrage.get('select'))))
    }
    if (method === 'POST') {
      const mitId = schemaSpalten(tabelle).has('id')
      const neu = (Array.isArray(rumpf) ? rumpf : [rumpf]).map((z) => ({
        ...(mitId ? { id: randomUUID() } : {}),
        ...(z as Zeile),
      }))
      zeilen.push(...neu)
      return zeigen ? antwort(201, neu) : antwort(201)
    }
    if (method === 'PATCH') {
      const getroffen = zeilen.filter(trifft)
      for (const z of getroffen) Object.assign(z, rumpf)
      return zeigen ? antwort(200, getroffen) : antwort(204)
    }
    if (method === 'DELETE') {
      tabellen[tabelle] = zeilen.filter((z) => !trifft(z))
      return antwort(204)
    }
    throw new Error(`Attrappe: Methode ${method} kennt sie nicht`)
  }

  const holen = async (adresse: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(adresse))
    const method = (init.method ?? 'GET').toUpperCase()
    const kopf = new Headers(init.headers)
    const rumpf: unknown = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined

    if (url.pathname.startsWith('/rest/v1/')) {
      const tabelle = decodeURIComponent(url.pathname.slice('/rest/v1/'.length))
      aufrufe.push({ pfad: `${tabelle}${url.search}`, method, body: rumpf })
      return postgrest(tabelle, url.searchParams, method, rumpf, kopf)
    }
    if (url.pathname === '/auth/v1/token') {
      const konto = alleKonten.find((k) => k.email === (rumpf as { email?: string })?.email)
      if (!konto) return antwort(400, { error: 'invalid_grant' })
      const token = `token-${konto.id}`
      angemeldet.set(token, konto)
      return antwort(200, { access_token: token, user: { id: konto.id, email: konto.email } })
    }
    if (url.pathname.startsWith('/auth/v1/admin/users')) {
      if (method === 'GET') return antwort(200, { users: alleKonten })
      if (method === 'POST') {
        const konto = { id: randomUUID(), email: String((rumpf as { email?: string })?.email ?? '') }
        alleKonten.push(konto)
        return antwort(200, konto)
      }
      return antwort(200, {})
    }
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.slice('/functions/v1/'.length)
      const funktion = funktionen[name]
      if (!funktion) throw new Error(`Attrappe: keine Function ${name}`)
      const { status = 200, json = {} } = funktion((rumpf ?? {}) as Record<string, unknown>)
      return antwort(status, json)
    }
    throw new Error(`Attrappe: unbekannte Adresse ${method} ${url.pathname}`)
  }

  return { aufrufe, tabellen, holen }
}

/* ===================== Ein Skript fahren ================================== */

/** Adresse und Schlüssel der Attrappe. `.invalid` löst nie auf (RFC 2606). */
export const ATTRAPPE_URL = 'https://attrappe.invalid'
export const ATTRAPPE_SCHLUESSEL = 'sb_secret_attrappe_ohne_netz_000000'

/**
 * Einen Lauf gegen die Attrappe fahren — stumm, ohne Netz, ohne Schlüssel.
 *
 * `zugangsdaten()` findet URL und Schlüssel in der Umgebung und fragt nicht.
 * Ein `process.exit` wird zum Fehler samt der letzten Meldungen des Skripts,
 * statt den Testlauf zu beenden; `process.exitCode`, das die Proben am Ende
 * setzen, steht danach wieder, wie es war.
 */
export async function fahre(lauf: () => Promise<unknown>, umgebung: Umgebung = {}) {
  const a = attrappe(umgebung)
  const meldungen: string[] = []
  vi.stubGlobal('fetch', a.holen)
  vi.stubEnv('SUPABASE_URL', ATTRAPPE_URL)
  vi.stubEnv('SUPABASE_SECRET_KEY', ATTRAPPE_SCHLUESSEL)
  for (const [k, v] of Object.entries(umgebung.env ?? {})) vi.stubEnv(k, v)
  const still = vi.spyOn(console, 'log').mockImplementation(() => {})
  const fehler = vi.spyOn(console, 'error').mockImplementation((...teile: unknown[]) => {
    meldungen.push(teile.map(String).join(' '))
  })
  const ende = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code}) — ${meldungen.slice(-3).join(' | ')}`)
  }) as never)
  const exitCode = process.exitCode
  try {
    await lauf()
  } finally {
    process.exitCode = exitCode
    ende.mockRestore()
    fehler.mockRestore()
    still.mockRestore()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  }
  return { aufrufe: a.aufrufe, tabellen: a.tabellen, meldungen }
}
