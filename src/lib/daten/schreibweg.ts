/**
 * Der gemeinsame Schreibweg der Datenschicht: Schreibfehler und Konflikte
 * melden, Schreib-Schlangen, „erst löschen, dann schreiben" und eine Zeile nur
 * mit dem schreiben, was sich geändert hat. Die übrigen Module unter `daten/`
 * bauen darauf.
 */

import { geaenderteFelder } from '../../../supabase/functions/_shared/gleicher-inhalt.ts'
import type { supabase } from '../supabase'
import { mitverfolgen } from '../schreiben-unterwegs'

/* ---- Schreiben ----------------------------------------------------------- */

/**
 * Alle `save*`/`delete*`-Funktionen sind fire-and-forget: der Reducer zeigt
 * den Erfolg, **bevor** geschrieben wurde. Schlägt das Schreiben fehl —
 * RLS-Verstoß, abgelaufenes Token, kein Netz, Timeout —, genügt die Konsole
 * nicht: Der Nutzer sähe „Zugeteilt", und die Datenbank hätte nichts.
 *
 * Diese Schicht kennt weder Dispatch noch Sprache. Sie meldet deshalb nur,
 * *dass* etwas schiefging; wer das anzeigt, meldet sich hier an (store.tsx).
 * Die Fehlermeldung selbst bleibt in der Konsole: sie kommt aus der Datenbank
 * und gehört nicht ungefiltert vor den Nutzer.
 */
type Fehlermelder = () => void

let melder: Fehlermelder | null = null

export function setSchreibfehlerMelder(fn: Fehlermelder | null): void {
  melder = fn
}

/** Einen Schreib- oder Lesefehler melden: Konsole für die Ursache, Melder für den Nutzer. */
export function schreibfehler(error: { message: string }): void {
  console.error('[persistenz]', error.message)
  melder?.()
}

/** Ein Schreiben abschicken und weitergehen — einen Fehler meldet es selbst, und bis zur Antwort gilt es als unterwegs. */
export function run(promise: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const arbeit = (async () => {
    const { error } = await promise
    if (error) schreibfehler(error)
  })()
  mitverfolgen(arbeit)
  return arbeit
}

/** Ein Fehler aus PostgREST — `code` ist der SQLSTATE, bei Netzfehlern leer. */
export type Zeilenfehler = { message: string; code?: string }

/**
 * **Abweisungen, die nur ein veralteter Stand erklärt** — bei den Tabellen
 * „eine Zeile je …": eine Dublette (23505), ein Verweis ins Leere (23503: der
 * Termin, der Plan, die Gruppe ist inzwischen gelöscht), eine verletzte Regel
 * (23514: der Platz ist besetzt, der Termin liegt auf einem anderen Wochentag)
 * und eine verweigerte Zeile (42501: das Recht ist entzogen). Ein zweiter
 * Versuch hilft da nicht, nur Nachladen.
 */
const STAND_VERALTET: ReadonlySet<string> = new Set(['23505', '23503', '23514', '42501'])

export function standVeraltet(error: Zeilenfehler): boolean {
  return error.code !== undefined && STAND_VERALTET.has(error.code)
}

/**
 * Wie `run`, für die Tabellen „eine Zeile je …": Hat die Datenbank abgewiesen,
 * weil der Stand hier veraltet ist, wird **nachgeladen** (`konfliktMelder`) statt
 * nur gemeldet — sonst stünde lokal weiter da, was es dort nicht gibt: „Du bist
 * eingetragen" für einen Platz, den ein anderer schon hatte.
 */
export async function zeilenRun(promise: PromiseLike<{ error: Zeilenfehler | null }>): Promise<void> {
  const { error } = await promise
  if (!error) return
  if (!standVeraltet(error)) {
    schreibfehler(error)
    return
  }
  console.error('[persistenz]', error.message)
  konfliktMelder?.()
}

type Schreiben = () => Promise<{ error: Zeilenfehler | null }>

/**
 * **Eine Schreib-Schlange:** Was hineinkommt, geht in dieser Reihenfolge
 * hinaus, eines nach dem anderen. Ein Netzfehler hält sie nicht an — sonst
 * ginge nach ihm gar nichts mehr hinaus.
 *
 * Jede Tabellen-Familie bekommt ihre eigene.
 */
export function schreibSchlange(): (schreiben: Schreiben) => void {
  let schlange: Promise<void> = Promise.resolve()
  return (schreiben) => {
    schlange = schlange
      .then(() => zeilenRun(schreiben()))
      .catch((err: unknown) => schreibfehler({ message: err instanceof Error ? err.message : String(err) }))
    mitverfolgen(schlange)
  }
}

/**
 * **Erst löschen, was dieser Planer entfernt hat, dann schreiben, was er
 * angelegt oder geändert hat** — der gemeinsame Weg der Tabellen mit einer
 * Zeile je Regel, Besuch, Termin, Vortrag, Plan oder Eintrag. Gelöscht wird
 * nur über die Kennungen in `entfernt`, nie „alles, was fehlt" (warum, steht
 * bei `saveFsRules`).
 */
export async function loeschenDannSchreiben<T>(
  client: NonNullable<typeof supabase>,
  tabelle: string,
  congregationId: string,
  zeilen: T[],
  entfernt: string[],
  zuZeile: (zeile: T, congregationId: string) => object,
): Promise<{ error: Zeilenfehler | null }> {
  if (entfernt.length) {
    const { error } = await client.from(tabelle).delete().eq('congregation_id', congregationId).in('id', entfernt)
    if (error) return { error }
  }
  if (!zeilen.length) return { error: null }
  return await client.from(tabelle).upsert(zeilen.map((z) => zuZeile(z, congregationId)))
}

/**
 * **Warum der Server ein Übernehmen abwies**, soweit es der Nutzer erfahren
 * soll — beim Einspringen und beim freien Platz (`substitute`). Ohne Grund
 * bleibt es beim allgemeinen Hinweis.
 *
 *  - `nicht-gesucht`: Für den Platz sucht niemand mehr Ersatz — der Absagende
 *    kann doch, oder ein anderer ist schon eingesprungen (`not-sought`).
 *  - `vergeben`: Den freien Platz hat schon ein anderer (`slot-taken`).
 */
export type Abweisung = 'nicht-gesucht' | 'vergeben'

/**
 * Meldung „ein anderer Planer war schneller". Wie beim Schreibfehler kennt
 * diese Schicht weder Dispatch noch Sprache — sie meldet nur, *dass* es
 * passiert ist und, wo der Server es sagt, warum; wer neu lädt und es
 * anzeigt, meldet sich hier an (store.tsx).
 */
type Konfliktmelder = (grund?: Abweisung) => void

let konfliktMelder: Konfliktmelder | null = null

export function setKonfliktMelder(fn: Konfliktmelder | null): void {
  konfliktMelder = fn
}

/**
 * Den Konfliktmelder auslösen — für die Module neben diesem (`wochen.ts`,
 * `zusagen.ts`): Sie erreichen ihn nur über diese Funktion, nicht über die
 * Variable. Die Argumente gehen unverändert weiter.
 */
export function konfliktMelden(...grund: Parameters<Konfliktmelder>): void {
  konfliktMelder?.(...grund)
}

/** Was vorher in der Zeile eines Eintrags stand, der eine Position hat (Gruppe, Dienst). */
export interface Zeilenstand<T> {
  eintrag: T
  position: number
}

type Schreibantwort = PromiseLike<{ error: { message: string } | null }>

/**
 * **Eine Zeile schreiben: ohne `vorher` ganz, sonst nur, was sich geändert
 * hat** (`geaenderteFelder`) — und gar nichts, wenn sich nichts geändert hat.
 *
 * Ganz geschrieben, nähme jede Spalte mit, was nur auf diesem Bildschirm noch
 * alt ist: Ändern zwei zugleich verschiedene Felder derselben Zeile, nähme der
 * Spätere dem Früheren seine Änderung still zurück. Und hat ein anderer die
 * Zeile inzwischen gelöscht, trifft das Ändern nichts, statt sie wie ein
 * Upsert wieder anzulegen.
 */
export function zeileSchreiben<Z extends object>(
  zeile: Z,
  vorher: Z | undefined,
  schreiben: { ganz: (zeile: Z) => Schreibantwort; spalten: (spalten: Partial<Z>) => Schreibantwort },
): void {
  if (!vorher) {
    void run(schreiben.ganz(zeile))
    return
  }
  const spalten = geaenderteFelder(vorher, zeile)
  if (Object.keys(spalten).length > 0) void run(schreiben.spalten(spalten))
}
