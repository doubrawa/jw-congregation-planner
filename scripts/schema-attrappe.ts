import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

/**
 * Die `create table`-Blöcke von `schema.sql`: Tabellenname → Rumpf, ohne Kopf
 * und schließende Klammer.
 *
 * Die eine Stelle, die sie ausschneidet — auch für `supabase/schema.test.ts`
 * und `versammlung-zuruecksetzen.test.ts`. Dort stand derselbe Ausdruck je
 * einmal abgeschrieben; eine andere Schreibweise in `schema.sql` (etwa ohne
 * `if not exists`) hätte an drei Stellen nachgezogen werden müssen.
 */
export function tabellenRuempfe(schema = SCHEMA_SQL): Map<string, string> {
  const ruempfe = new Map<string, string>()
  for (const [, name, rumpf] of schema.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    ruempfe.set(name!, rumpf!)
  }
  return ruempfe
}

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
  for (const zeile of (tabellenRuempfe(schema).get(tabelle) ?? '').split(/\r?\n/)) aufnehmen(zeile)
  const spaeter = new RegExp(`alter table public\\.${tabelle}\\s+add column if not exists ([^;]+);`, 'g')
  for (const [, definition] of schema.matchAll(spaeter)) aufnehmen(definition!)
  return spalten
}

/**
 * Die Tabellen mit **Stand**: Ihr `updated_at` setzt ein Trigger bei jeder
 * Änderung neu (`touch_updated_at`), und wer schreibt, nennt den Stand, auf dem
 * er beruht — `wocheSchreiben`, `wochen_tauschen`. Ohne ihn fände ein solches
 * Schreiben in der Attrappe nie seine Zeile.
 */
export function standTabellen(schema = SCHEMA_SQL): Set<string> {
  const trigger = /create trigger \w+\s+before update on public\.(\w+)\s+for each row execute function public\.touch_updated_at\(\)/g
  return new Set([...schema.matchAll(trigger)].map((m) => m[1]!))
}

/** Ein Parameter einer Funktion: sein Typ, und ob ihn jeder Aufruf mitbringen muss. */
export interface SchemaParameter {
  typ: string
  /** Ohne `default` — fehlt er, findet PostgREST die Funktion nicht. */
  pflicht: boolean
}

/**
 * Die Parameter einer Funktion aus `schema.sql`, wie PostgREST sie unter
 * `rpc/<name>` annimmt — oder `null`, wenn es die Funktion nicht gibt. Seit dem
 * 3.10.2026 ruft ein Skript eine auf (`notify_planners` in der
 * Mitgliedsrechte-Probe); ein vertippter Parameter wäre dort ein 404 und hieße
 * ohne diese Prüfung bloß „abgewiesen".
 */
export function schemaFunktion(name: string, schema = SCHEMA_SQL): Map<string, SchemaParameter> | null {
  const kopf = new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)`, 'i').exec(schema)
  if (!kopf) return null
  const parameter = new Map<string, SchemaParameter>()
  for (const teil of kopf[1]!.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [pname = '', typ = ''] = teil.split(/\s+/)
    parameter.set(pname, { typ: typ.toLowerCase(), pflicht: !/\bdefault\b/i.test(teil) })
  }
  return parameter
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
  /** Der `Prefer`-Kopf, etwa `return=minimal` — ob mit oder ohne `RETURNING` geschrieben wurde. */
  prefer?: string
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
  if (tabelle.startsWith('rpc/')) return funktionsFehler(tabelle, method, body, schema)
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
      const falsch = s && wert !== null ? typFehler(s.typ, wert) : null
      if (!s) nenne(k, 'gibt es nicht')
      else if (wert === null) {
        if (!s.nullbar) nenne(k, 'null in einer not-null-Spalte')
      } else if (falsch) nenne(k, falsch)
    }
    if (method !== 'POST') continue
    for (const [name, s] of spalten) if (s.pflicht && !(name in zeile)) nenne(name, 'Pflichtspalte fehlt')
  }
  return fehler
}

/**
 * Ein Funktionsaufruf (`rpc/<name>`): Gibt es die Funktion, und bringt der
 * Rumpf ihre Parameter mit, im passenden Typ? Fehlen darf nur einer mit
 * Vorgabe (`default`, seit dem 4.10.2026 `task` von `notify_planners`) —
 * fehlt ein anderer, fände PostgREST sie nicht.
 */
function funktionsFehler(tabelle: string, method: string, body: unknown, schema: string): string[] {
  const parameter = schemaFunktion(tabelle.slice('rpc/'.length), schema)
  if (!parameter) return [`${method} ${tabelle}: keine Funktion in schema.sql`]
  const rumpf = (body ?? {}) as Record<string, unknown>
  const fehler: string[] = []
  for (const [k, wert] of Object.entries(rumpf)) {
    const p = parameter.get(k)
    const falsch = p ? typFehler(p.typ, wert) : 'keinen solchen Parameter'
    if (falsch) fehler.push(`${method} ${tabelle}.${k}: ${falsch}`)
  }
  for (const [k, p] of parameter) if (p.pflicht && !(k in rumpf)) fehler.push(`${method} ${tabelle}.${k}: Parameter fehlt`)
  return fehler
}

/** Passt ein Wert zum Typ einer Spalte oder eines Parameters? Sonst der Grund — `null` heißt: passt. */
function typFehler(typ: string, wert: unknown): string | null {
  const passt = PASST[typ]
  if (!passt) return `Typ ${typ} kennt die Probe nicht — PASST ergänzen`
  return passt(wert) ? null : `${String(JSON.stringify(wert)).slice(0, 60)} ist kein ${typ}`
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

/**
 * Was eine nachgestellte Edge Function außer dem Rumpf sieht: die Tabellen —
 * eine Function schreibt mit Service-Role, also an jeder Richtlinie vorbei —
 * und das Konto, mit dessen Anmeldung sie gerufen wurde. Eine echte Function
 * liest das Token selbst aus den Kopfzeilen (`kopf`) und fragt nach, wem es
 * gehört (`/auth/v1/user`).
 */
export interface FunktionsKontext {
  tabellen: Bestand
  wer?: Konto
  kopf: Headers
}

export interface Umgebung {
  /** Die Tabellen, wie sie vor dem Lauf in der Datenbank stünden. */
  bestand?: Bestand
  /** Konten für die Auth-API und die Anmeldung per Kennwort. */
  konten?: Konto[]
  /** Edge Functions nach Name — nachgestellt oder echt (dann mit Promise). */
  funktionen?: Record<string, (rumpf: Record<string, unknown>, kontext: FunktionsKontext) => FunktionsAntwort | Promise<FunktionsAntwort>>
  /** Weitere Umgebungsvariablen (die RLS-Proben lesen ihre Konten daraus). */
  env?: Record<string, string>
  /**
   * Eine Antwort, die PostgREST statt der normalen gibt — um einen Fehler der
   * Datenbank nachzustellen (etwa den 400 auf eine vertippte Spalte).
   */
  stoerung?: (aufruf: Aufruf) => FunktionsAntwort | undefined
}

/** Mehr Zeilen gibt PostgREST je Abfrage nicht heraus — die Vorgabe von Supabase („Max rows"). */
export const MAX_ZEILEN = 1000

/**
 * Ein Filter aus der Adresse: `eq.x`, `neq.x`, `is.null`, `in.(a,b)`, `like.a*`,
 * `gt`/`gte`/`lt`/`lte` (seit 16.10.2026). Verglichen wird als Text — für
 * ISO-Daten und gleich lange Zahlen ist das die Ordnung der Datenbank; `null`
 * trifft nie, wie in SQL.
 */
function passtFilter(wert: unknown, ausdruck: string): boolean {
  const punkt = ausdruck.indexOf('.')
  const op = ausdruck.slice(0, punkt)
  const v = ausdruck.slice(punkt + 1)
  switch (op) {
    case 'eq': return String(wert) === v
    case 'neq': return String(wert) !== v
    case 'gt': return wert != null && String(wert) > v
    case 'gte': return wert != null && String(wert) >= v
    case 'lt': return wert != null && String(wert) < v
    case 'lte': return wert != null && String(wert) <= v
    case 'is': return v === 'null' ? wert == null : String(wert) === v
    // Ein Wert in Anführungszeichen steht für sich, wie bei PostgREST (seit
    // 16.10.2026: `zusagenLoeschen` quotet jeden Schlüssel).
    case 'in': return v.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"(.*)"$/, '$1')).includes(String(wert))
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
 * Konto die eigene Zeile und dem Admin die seiner ganzen Versammlung — wie
 * `members_select`. Daran erkennen die RLS-Proben, wer sie sind. Bis zum
 * 4.10.2026 sah hier auch der Admin nur sich selbst; dass die Probe ihre
 * eigene Zeile ungefiltert las und beim Admin damit irgendeine erwischen
 * konnte, fiel deshalb nur in der echten Datenbank auf — oder eben nicht.
 * Alles andere sieht jeder — die Proben laufen damit auch in ihre
 * Aufräum-Zweige, und deren Aufrufe stehen dann ebenfalls unter Prüfung.
 *
 * Ein Upsert (`Prefer: resolution=merge-duplicates`) führt wie PostgREST mit
 * der bestehenden Zeile zusammen — über `on_conflict` oder den Schlüssel `id`.
 *
 * **Was die Datenbank selbst tut**, steht hier nur, wo eine Probe darauf baut
 * (seit dem Tauschen, 31.10.2026, das die echten Functions fährt): der Stand
 * der Tabellen aus `standTabellen`, die Funktion `wochen_tauschen` und der
 * Trigger `tausch_glocke_loeschen` — jedes so streng wie in `schema.sql`.
 */
export function attrappe({ bestand = {}, konten = [], funktionen = {}, stoerung }: Umgebung = {}) {
  const tabellen: Bestand = structuredClone(bestand)
  const alleKonten = [...konten]
  const aufrufe: Aufruf[] = []
  const angemeldet = new Map<string, Konto>()
  // Der Stand einer Zeile: beim Anlegen gesetzt (`default now()`), bei jeder
  // Änderung neu. Jede Änderung bekommt einen eigenen Zeitpunkt, auch unter
  // einer angehaltenen Uhr — sonst sähe sie aus wie keine.
  const mitStand = standTabellen()
  let uhr = 0
  const neuerStand = (): string => new Date(Date.now() + ++uhr).toISOString()

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
    const meineZeile = wer ? (tabellen.members ?? []).find((m) => m.user_id === wer.id) : undefined
    const siehtMitglied = (z: Zeile): boolean =>
      !wer || z.user_id === wer.id || (Boolean(meineZeile?.planner) && z.congregation_id === meineZeile?.congregation_id)
    const trifft = (z: Zeile): boolean =>
      filter.every(([k, v]) => passtFilter(z[k], v)) && (tabelle !== 'members' || siehtMitglied(z))
    const vorgabe = kopf.get('Prefer') ?? ''
    const zeigen = vorgabe.includes('return=representation')

    if (tabelle.startsWith('rpc/')) {
      // Die eine Funktion, die ein Skript aufruft, so weit nachgestellt, dass
      // die Probe ihr Ergebnis sieht: je Admin und Planer der Versammlung eine
      // Mitteilung (seit 4.10.2026 auch an `zuteiler`, wie in `schema.sql`).
      // Ihre Prüfung (nur Verhinderungen) bleibt außen vor — wie alle Richtlinien.
      if (tabelle === 'rpc/notify_planners' && wer) {
        const { kind, subject, message, task } = rumpf as { kind: string; subject: string; message: string; task?: string }
        const mitglieder = tabellen.members ?? []
        const cong = mitglieder.find((m) => m.user_id === wer.id)?.congregation_id
        for (const m of mitglieder.filter((x) => (x.planner || x.zuteiler) && x.congregation_id === cong)) {
          ;(tabellen.notifications ??= []).push({
            id: randomUUID(), congregation_id: cong, user_id: m.user_id, type: kind, title: subject, body: message,
            task_key: task || null,
          })
        }
      }
      // Zwei Wochen auf einmal (T153), wie `wochen_tauschen`: jede nur auf dem
      // genannten Stand, und trifft eine nicht, ist keine geändert. Welcher
      // Status, fragt die Function nicht — nur, ob es glückte.
      if (tabelle === 'rpc/wochen_tauschen') {
        const r = rumpf as Record<string, unknown>
        if (r.p_woche_a === r.p_woche_b) return antwort(400, { code: '22023', message: 'wochen_tauschen: zwei verschiedene Wochen erwartet' })
        const woche = (start: unknown, stand: unknown): Zeile | undefined =>
          (tabellen.weeks ?? []).find((w) => w.congregation_id === r.p_congregation && w.start === start && w.updated_at === stand)
        const a = woche(r.p_woche_a, r.p_stand_a)
        const b = woche(r.p_woche_b, r.p_stand_b)
        if (!a || !b) return antwort(400, { code: '40001', message: 'wochen_tauschen: Stand verfehlt' })
        Object.assign(a, { data: r.p_data_a, updated_at: neuerStand() })
        Object.assign(b, { data: r.p_data_b, updated_at: neuerStand() })
        return antwort(200, [a, b].map((w) => ({ woche: w.start, stand: w.updated_at })))
      }
      // Adressen und Gründe (29.10.2026): was die Funktion aus der eigenen
      // Versammlung liefert — ohne ihre Prüfung, wem sie es liefert.
      const lieferung = { 'rpc/personen_mails': ['persons', 'mail'], 'rpc/abwesenheit_gruende': ['absences', 'reason'] }[tabelle]
      if (lieferung && wer) {
        const [quelle = '', spalte = ''] = lieferung
        const cong = (tabellen.members ?? []).find((m) => m.user_id === wer.id)?.congregation_id
        const zeilen = (tabellen[quelle] ?? []).filter((z) => z.congregation_id === cong && z[spalte])
        return antwort(200, zeilen.map((z) => ({ id: z.id, [spalte]: z[spalte] })))
      }
      return antwort(204)
    }

    if (method === 'GET') {
      let treffer = zeilen.filter(trifft)
      const ordnung = abfrage.get('order')
      if (ordnung) {
        const [spalte = '', richtung] = ordnung.split('.')
        const vorzeichen = richtung === 'desc' ? -1 : 1
        treffer = [...treffer].sort((a, b) => vorzeichen * String(a[spalte]).localeCompare(String(b[spalte])))
      }
      const versatz = abfrage.get('offset')
      if (versatz) treffer = treffer.slice(Number(versatz))
      const grenze = abfrage.get('limit')
      if (grenze) treffer = treffer.slice(0, Number(grenze))
      // Wie das Projekt: Mehr als `MAX_ZEILEN` gibt PostgREST nicht heraus, still
      // (Supabase „Max rows"). Ein Skript, das alles zu lesen glaubt, sieht dann
      // nur den Anfang — die Attrappe zeigt ihm dasselbe.
      treffer = treffer.slice(0, MAX_ZEILEN)
      return antwort(200, treffer.map((z) => projiziere(z, abfrage.get('select'))))
    }
    if (method === 'POST') {
      const mitId = schemaSpalten(tabelle).has('id')
      const zusammenfuehren = vorgabe.includes('resolution=merge-duplicates')
      const konflikt = (abfrage.get('on_conflict') ?? 'id').split(',')
      // Zusammengeführt wird nur über Werte, die die Zeile mitbringt — eine
      // ohne Kennung träfe sonst die erste andere ohne. Eine neue Kennung
      // bekommt nur eine neue Zeile, wie unter dem `default` der Datenbank.
      const bestehend = (z: Zeile): Zeile | undefined =>
        zusammenfuehren ? zeilen.find((x) => konflikt.every((s) => z[s] !== undefined && x[s] === z[s])) : undefined
      const stand = (): Zeile => (mitStand.has(tabelle) ? { updated_at: neuerStand() } : {})
      const neu: Zeile[] = (Array.isArray(rumpf) ? rumpf : [rumpf]).map((roh) => {
        const z = roh as Zeile
        const da = bestehend(z)
        if (da) return Object.assign(da, z, stand())
        const zeile = { ...(mitId ? { id: randomUUID() } : {}), ...stand(), ...z }
        zeilen.push(zeile)
        return zeile
      })
      return zeigen ? antwort(201, neu) : antwort(201)
    }
    if (method === 'PATCH') {
      const getroffen = zeilen.filter(trifft)
      for (const z of getroffen) Object.assign(z, rumpf, mitStand.has(tabelle) ? { updated_at: neuerStand() } : {})
      return zeigen ? antwort(200, getroffen) : antwort(204)
    }
    if (method === 'DELETE') {
      const weg = zeilen.filter(trifft)
      tabellen[tabelle] = zeilen.filter((z) => !trifft(z))
      // `tausch_glocke_loeschen` (T153): Mit einer Tausch-Anfrage geht ihre
      // Glocken-Zeile beim Gefragten — gleich, wer die Anfrage löscht.
      if (tabelle === 'tausch_anfragen') {
        const glocken = new Set(weg.map((z) => `${String(z.congregation_id)} tausch|${String(z.id)}`))
        tabellen.notifications = (tabellen.notifications ?? []).filter((n) => !glocken.has(`${String(n.congregation_id)} ${String(n.task_key)}`))
      }
      return zeigen ? antwort(200, weg) : antwort(204)
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
      const aufruf = { pfad: `${tabelle}${url.search}`, method, body: rumpf, prefer: kopf.get('Prefer') ?? undefined }
      aufrufe.push(aufruf)
      const gestoert = stoerung?.(aufruf)
      if (gestoert) return antwort(gestoert.status ?? 400, gestoert.json ?? {})
      return postgrest(tabelle, url.searchParams, method, rumpf, kopf)
    }
    if (url.pathname === '/auth/v1/token') {
      const konto = alleKonten.find((k) => k.email === (rumpf as { email?: string })?.email)
      if (!konto) return antwort(400, { error: 'invalid_grant' })
      const token = `token-${konto.id}`
      angemeldet.set(token, konto)
      return antwort(200, { access_token: token, user: { id: konto.id, email: konto.email } })
    }
    // Wem ein Token gehört — so prüft eine Function ihren Aufrufer
    // (`rest.userId`). Ohne Anmeldung, etwa mit dem öffentlichen Schlüssel als
    // Token, gehört es niemandem.
    if (url.pathname === '/auth/v1/user') {
      const konto = angemeldet.get((kopf.get('Authorization') ?? '').replace(/^Bearer /, ''))
      return konto ? antwort(200, { id: konto.id, email: konto.email }) : antwort(401, { msg: 'invalid JWT' })
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
      const wer = angemeldet.get((kopf.get('Authorization') ?? '').replace(/^Bearer /, ''))
      const { status = 200, json = {} } = await funktion((rumpf ?? {}) as Record<string, unknown>, { tabellen, wer, kopf })
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
  const ausgabe: string[] = []
  const meldungen: string[] = []
  vi.stubGlobal('fetch', a.holen)
  vi.stubEnv('SUPABASE_URL', ATTRAPPE_URL)
  vi.stubEnv('SUPABASE_SECRET_KEY', ATTRAPPE_SCHLUESSEL)
  // Die Kontendatei der Testversammlung (`PROBE_DATEI` in gemeinsam.mjs) liegt
  // im Projekt — mit echten Kennwörtern, wenn gerade eine Testversammlung
  // steht. Kein Lauf soll sie lesen oder überschreiben: Jeder bekommt eine
  // eigene, die es noch nicht gibt. Ein Lauf, der sie braucht, nennt sie in
  // `env` selbst.
  const kontendatei = path.join(os.tmpdir(), `probe-konten-${randomUUID()}.env`)
  vi.stubEnv('PROBE_KONTEN_DATEI', kontendatei)
  for (const [k, v] of Object.entries(umgebung.env ?? {})) vi.stubEnv(k, v)
  const still = vi.spyOn(console, 'log').mockImplementation((...teile: unknown[]) => {
    ausgabe.push(teile.map(String).join(' '))
  })
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
    fs.rmSync(kontendatei, { force: true })
  }
  return { aufrufe: a.aufrufe, tabellen: a.tabellen, ausgabe, meldungen }
}
