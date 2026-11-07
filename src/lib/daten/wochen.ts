/**
 * Die Wochen der Zusammenkünfte und der Treffpunkte, geschrieben mit Stand:
 * welche Ladung gilt, die Schreibkette je Woche und die Stände nach
 * einem Schreiben der Functions. Dazu die vorgemerkten Vorträge und die
 * Anwesenheit, die an einer Woche hängen.
 */

import type { FsInstance, Week } from '../../data/types'
import { supabase } from '../supabase'
import { mitverfolgen } from '../schreiben-unterwegs'
import { anwesenheitToRow, vortragToRow } from '../zeilen'
import type { VorgemerkterVortrag } from '../../data/vortragsplan'
import type { AnwesendFeld, Anwesenheit } from '../../data/anwesenheit'
import { konfliktMelden, loeschenDannSchreiben, schreibfehler, schreibSchlange, standVeraltet } from './schreibweg'

export interface WeekRow {
  /** Kennung der Woche: ihr Montag. Eigene Spalte, nicht aus `data`. */
  start: string
  data: Week
  /** Stand der Zeile — Grundlage der Konfliktprüfung beim Speichern. */
  updated_at: string
}

/* ---- Schreibkonflikte zwischen Planern ----------------------------------- */

/**
 * **Welcher Ladevorgang gilt** — weitergezählt, sobald ein Laden die Stände
 * ersetzt (`setzen` in `wochenTabelle`).
 *
 * Ein Schreibvorgang beruht auf dem Zustand, aus dem er kommt, und der stammt
 * aus einem bestimmten Ladevorgang. Lädt die App dazwischen neu — nach einem
 * Konflikt, nach „Plan senden", nach einem Push-Klick —, gilt der frisch
 * geladene Stand, und der alte Inhalt passt nicht mehr zu ihm:
 *
 *  - **Wartet er noch in seiner Kette, geht er nicht mehr los.** Er nähme den
 *    frischen Stand und schriebe den alten Inhalt darüber — lautlos genau das,
 *    was der Stand verhindern soll. Stattdessen meldet er einen Konflikt.
 *  - **War er schon unterwegs, setzt seine Antwort den Stand nicht mehr.** Hat
 *    das Laden vor ihm gelesen, zeigt der Bildschirm den Inhalt ohne ihn; mit
 *    seinem Stand daneben nähme die nächste Änderung ihn lautlos zurück. Mit
 *    dem geladenen Stand trifft sie einen Konflikt, und die App lädt nach.
 */
let ladung = 0

/** Die Ladung, aus der ein Aufruf kommt — damit seine Antwort weiß, ob sie noch gilt (`tauschStaendeUebernehmen`). */
export const ladungJetzt = (): number => ladung

/** Den Stand nach einem Schreibvorgang merken — nur, wenn seither nicht neu geladen wurde (`ladung`). */
function standMerken(staende: Map<string, string>, woche: string, stand: string, geladen: number): void {
  if (geladen === ladung) staende.set(woche, stand)
}

/**
 * **Eine Tabelle „eine Zeile je Woche", geschrieben mit Stand** — die
 * Zusammenkünfte (`weeks`) und die Treffpunkte (`fs_weeks`) nach derselben
 * Regel.
 *
 * Ginge die **ganze Woche** ohne Sperre und ohne Versionskennzeichen als
 * Upsert hinaus, gewönne von zweien, die gleichzeitig planen, der Letzte, und
 * seine Fassung überschriebe die des anderen lautlos. Bei den Treffpunkten
 * liegt die Woche als **eine** Liste in einer Zeile; wer mit älterem Stand
 * schriebe, nähme still zurück, was ein Gruppenaufseher inzwischen eingetragen
 * hat.
 *
 * Eine Stelle für beide Tabellen: Als Abschrift liefe die Fehlerbehandlung
 * auseinander — die eine lüde bei jeder Abweisung nach, die nur ein veralteter
 * Stand erklärt, die andere nur bei einer Dublette, und eine entzogene
 * Berechtigung (42501) meldete dort einen Schreibfehler, während der
 * Bildschirm weiter zeigte, was nicht gespeichert ist.
 *
 * Je Woche geführt, über ihre Kennung (`start`, keine Ordnungszahl):
 *
 *  - **der Stand**, wie ihn die Datenbank zuletzt bestätigt hat. Er wird nie
 *    selbst gebildet, nur zurückgereicht: Die Zeichenkette kommt aus PostgREST
 *    und geht unverändert dorthin zurück, Genauigkeit und Zeitzone sind damit
 *    kein Thema;
 *  - **die Schreibkette**: Vorgänge derselben Woche laufen hintereinander.
 *    Sonst gingen zwei rasche Änderungen mit demselben Stand los, und die
 *    zweite meldete einen Konflikt gegen sich selbst.
 */
function wochenTabelle(tabelle: 'weeks' | 'fs_weeks') {
  const staende = new Map<string, string>()
  const kette = new Map<string, Promise<void>>()
  /** Die Datenbank-Funktion, die die Woche samt ihren verfallenen Zusagen in einer Transaktion schreibt (`schema.sql`). */
  const funktion = tabelle === 'weeks' ? 'woche_speichern' : 'treffpunkte_speichern'

  /**
   * Eine Woche schreiben und dabei den Stand prüfen.
   *
   *  1. Kein Stand bekannt → die Zeile gibt es hier noch nicht: anlegen.
   *  2. Stand bekannt → ändern **mit** Bedingung `updated_at = <Stand>`. Eine
   *     getroffene Zeile bringt den neuen Stand zurück; fertig.
   *  3. Keine Zeile getroffen, oder eine Abweisung, die nur ein veralteter Stand
   *     erklärt (`STAND_VERALTET`: angelegt hatte sie schon ein anderer, das
   *     Recht ist weg, der Trigger `fs_weeks_pruefen` weist ab) → melden, die
   *     App lädt nach. Überschrieben wurde nichts.
   *
   * Ohne Bedingung geschrieben wird nie, auch nicht nach einem Nachsehen, das
   * noch den eigenen Stand fand: Was ein anderer zwischen Nachsehen und
   * Schreiben speicherte, ginge lautlos verloren. Die Edge Functions schreiben
   * nach derselben Regel (`_shared/woche-schreiben.ts`).
   *
   * `geladen`: die Ladung, aus der der Inhalt stammt (`ladung`). Wurde seither
   * neu geladen, geht er nicht mehr hinaus.
   *
   * `verfallen`: die Zusagen, die mit dieser Fassung nicht mehr gelten — der
   * Platz hat den Inhaber gewechselt. Sie gehen in derselben Transaktion
   * (`woche_speichern`): Ginge ihr Löschen als zweiter Aufruf verloren, erbte
   * der Neue die Zusage des Alten.
   *
   * `true`: Die Woche steht so in der Datenbank. Erst dann darf geschehen, was
   * sonst an ihr hängt — die Meldung „zurückgezogen" (`persist.ts`).
   */
  async function schreiben(
    congregationId: string,
    woche: string,
    data: unknown,
    verfallen: readonly string[],
    geladen: number,
  ): Promise<boolean> {
    if (!supabase) return false
    if (geladen !== ladung) {
      konfliktMelden()
      return false
    }
    const { data: zeilen, error } = await supabase.rpc(funktion, {
      p_cong: congregationId,
      p_start: woche,
      p_stand: staende.get(woche) ?? null,
      p_data: data,
      p_verfallen: [...verfallen],
    })
    if (error) {
      if (standVeraltet(error)) {
        console.error('[persistenz]', error.message)
        konfliktMelden()
      } else schreibfehler(error)
      return false
    }
    const zeile = (Array.isArray(zeilen) ? zeilen[0] : null) as { stand?: string } | null | undefined
    if (zeile?.stand) {
      standMerken(staende, woche, zeile.stand, geladen)
      return true
    }
    konfliktMelden()
    return false
  }

  return {
    staende,
    kette,
    /** Nach einem Laden: die geladenen Stände übernehmen, Wartendes vergessen. */
    setzen(paare: Array<[string, string]>): void {
      ladung++
      staende.clear()
      kette.clear()
      for (const [woche, stand] of paare) staende.set(woche, stand)
    },
    /**
     * In die Kette der Woche einreihen. Ohne Kennung gibt es keine Zeile, die
     * gemeint sein könnte — nichts schreiben.
     *
     * Die Ladung wird jetzt festgehalten, nicht erst beim Losgehen: Bis dahin
     * kann die Kette ein Laden überdauert haben. Das `catch` steht vor dem
     * Anhängen, sonst risse ein Fehlschlag die Kette ab, und die Woche schriebe
     * nie wieder; gemeldet wird er als Schreibfehler.
     */
    speichern(congregationId: string, woche: string, data: unknown, verfallen: readonly string[] = []): Promise<boolean> {
      if (!supabase || !woche) return Promise.resolve(false)
      const vorher = kette.get(woche) ?? Promise.resolve()
      const geladen = ladung
      const ergebnis = vorher.then(() =>
        schreiben(congregationId, woche, data, verfallen, geladen).catch((err: unknown) => {
          schreibfehler({ message: err instanceof Error ? err.message : String(err) })
          return false
        }),
      )
      kette.set(woche, ergebnis.then(() => {}))
      mitverfolgen(ergebnis)
      return ergebnis
    },
  }
}

export const wochen = wochenTabelle('weeks')
export const fsWochen = wochenTabelle('fs_weeks')

/**
 * Eine Woche speichern. Welche Zeile gemeint ist, sagt ihre eigene Kennung —
 * kein Index von außen. Admin und Planer schreiben sie gleich — unmittelbar in
 * die Tabelle (`weeks_write`).
 */
export function saveWeek(congregationId: string, week: Week, verfallen: readonly string[] = []): Promise<boolean> {
  return wochen.speichern(congregationId, week.start, week, verfallen)
}

/**
 * Materialisierte Treffpunkte einer Woche (Kennung → FsInstance[]) — mit Stand,
 * je Woche hintereinander, wie die Wochen der Zusammenkünfte (`wochenTabelle`).
 *
 * Der Trigger ersetzt den Stand nicht: `fs_weeks_pruefen` weist beim
 * Gruppenaufseher eine geänderte fremde Gruppe ab, Admin und Planer prüft er
 * nicht oder nur ohne Leiter. Seine Abweisung (42501: der Gruppenaufseher
 * änderte eine fremde Gruppe, der Planer mehr als den Leiter) entsteht nur auf
 * einem veralteten Stand, die Oberfläche bietet beides nicht an — also wird
 * nachgeladen.
 */
export function saveFsWeek(congregationId: string, woche: string, insts: FsInstance[], verfallen: readonly string[] = []): Promise<boolean> {
  return fsWochen.speichern(congregationId, woche, insts, verfallen)
}

/**
 * **Warten, bis die Woche geschrieben ist** — die Zusammenkünfte und die
 * Treffpunkte, alles, was schon in ihren Ketten steht. Für die Aufrufe, die
 * danach auf dem Server lesen, was hier eben geändert wurde (`wocheDraussen`
 * in `planen/wochen-versand.ts`). Die Ketten fangen ihre Fehler selbst, das
 * Warten scheitert also nie.
 */
export async function wocheGeschrieben(woche: string): Promise<void> {
  await Promise.all([wochen.kette.get(woche), fsWochen.kette.get(woche)])
}

/**
 * **Den Stand nach einem Schreiben der Function übernehmen** — Einspringen und
 * ein freier Platz (`substitute`) schreiben die Woche selbst. Ohne den neuen
 * Stand meldete die nächste eigene Änderung derselben Woche einen Konflikt, den
 * es nicht gibt: Ein Admin, der einspringt und gleich weiterplant, verlöre
 * seine Änderung an ein Nachladen.
 *
 * Übernommen wird nur, was auf dem Stand aufbaut, den diese App kennt
 * (`vorher`): Dann steht dort, was auch hier steht — dieselbe Änderung hat der
 * Reducer gemacht. Hat dazwischen ein anderer geschrieben, bleibt der alte
 * Stand, und die nächste Änderung lädt nach, statt dessen Arbeit zu
 * überschreiben.
 */
export function standDerFunctionUebernehmen(antwort: unknown, geladen: number): void {
  const { woche, vorher, stand } = (antwort ?? {}) as { woche?: unknown; vorher?: unknown; stand?: unknown }
  if (typeof woche !== 'string' || typeof stand !== 'string') return
  if (wochen.staende.get(woche) !== vorher) return
  standMerken(wochen.staende, woche, stand, geladen)
}

/**
 * **Die Stände nach einem Tausch übernehmen** — wie nach dem
 * Einspringen, für jede der bis zu zwei Wochen, die die Function `tauschen`
 * geschrieben hat. `geladen` ist die Ladung, aus der der Aufruf kam.
 */
export function tauschStaendeUebernehmen(staende: readonly unknown[], geladen: number): void {
  for (const s of staende) standDerFunctionUebernehmen(s, geladen)
}

const vortraegeNacheinander = schreibSchlange()

/**
 * Vorgemerkte Vorträge — eine Zeile je Woche, derselbe Weg wie bei den
 * Gruppenbesuchen. Übernehmen zwei Planer zugleich einen Vortragsplan, weist
 * die Datenbank die zweite Vormerkung derselben Woche ab
 * (`unique (congregation_id, woche)`), und der zweite lädt nach.
 */
export function saveVortraege(congregationId: string, vortraege: VorgemerkterVortrag[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  vortraegeNacheinander(() => loeschenDannSchreiben(client, 'vortraege', congregationId, vortraege, entfernt, vortragToRow))
}

const anwesenheitNacheinander = schreibSchlange()

/**
 * **Die Anwesenden einer Zusammenkunft** — eine Zeile je
 * Zusammenkunft, geschrieben über ihren natürlichen Schlüssel, und in ihr nur
 * die genannten Zahlen (`felder`). Den Saal trägt der Saalordner ein, das
 * Video der Zoom-Ordner, oft zur selben Zeit: Ginge die ganze Zeile hinaus,
 * löschte der zweite mit seinem leeren Feld die Zahl des ersten. Berichtigen
 * beide dieselbe Zahl, gilt, was zuletzt kam. Wer eintragen darf, prüft die
 * Datenbank (`darf_anwesenheit`); weist sie ab, lädt die App nach (`zeilenRun`).
 */
export function saveAnwesenheit(congregationId: string, eintrag: Anwesenheit, felder: readonly AnwesendFeld[]): void {
  if (!supabase || felder.length === 0) return
  const client = supabase
  anwesenheitNacheinander(async () => {
    const { error } = await client
      .from('anwesenheit')
      .upsert(anwesenheitToRow(eintrag, congregationId, felder), { onConflict: 'congregation_id,woche,zusammenkunft' })
    return { error }
  })
}
