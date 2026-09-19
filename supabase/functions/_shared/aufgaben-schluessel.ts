/**
 * **Der `task_key` — gebaut und zerlegt an einer Stelle.**
 *
 * Jeder besetzbare Platz der App hat einen stabilen Schlüssel. Er steht in
 * `confirmations.task_key` (wer hat zugesagt), in `notifications.task_key`
 * (worum geht es), im Versand-Tagebuch (`sent_log`) und in den Push-Nachrichten
 * — und die **Datenbank** zerlegt ihn ebenfalls (`task_gehoert_mir` in
 * `supabase/schema.sql` entscheidet damit, ob eine Bestätigung zur eigenen
 * Aufgabe gehört).
 *
 * Vier Formen, fünf Erzeuger:
 *
 * | Form       | Aufbau                                     |
 * | ---------- | ------------------------------------------ |
 * | Punkt      | `<montag>\|<mid\|we>\|<part\|aux>\|<iid>\|<ni>` |
 * | Ratgeber   | `<montag>\|<mid\|we>\|ratgeber`              |
 * | Hilfsdienst| `<montag>\|<mid\|we>\|helper\|<dienst>\|<pos>` |
 * | Treffpunkt | `fs\|<montag>\|<instanzId>`                  |
 *
 * Gebaut wurde das bis September 2026 an **fünf** Stellen und zerlegt an
 * **sechs**, verteilt über drei Laufzeiten: die App (`planning.ts`, `fs.ts`,
 * `plan-versand.ts`), die Edge Functions (`zuteilungen.ts`, `substitute`,
 * `send-plan`) und ein Wartungsskript. Eine Formatänderung — T66 war eine —
 * hieß: elf Stellen finden, ohne dass der Übersetzer hilft. Vier davon
 * zerlegten von Hand mit `key.split('|')[2]`.
 *
 * Deshalb steht beides hier, und zwar **im geteilten Edge-Ordner**: Die
 * Functions können nicht aus `src/` lesen, die App aber sehr wohl von hier —
 * denselben Weg gehen `zeitenAus`, `neueItemId`, `FS_LEITER` und
 * `STANDARD_ZEITEN` bereits. `planning.ts` und `fs.ts` reichen die Erzeuger
 * unter ihren gewohnten Namen weiter.
 *
 * **Die Kennung der Woche ist ihr Montag** (T66), nicht mehr ihre Position.
 */

/** Zusammenkunft — dieselben beiden Werte wie `MeetingKey` im Client. */
export type Tab = 'mid' | 'we'

/** Ein zerlegter Schlüssel. `art` sagt, welche Felder es gibt. */
export type SchluesselTeile =
  | { art: 'part' | 'aux'; woche: string; tab: Tab; iid: string; ni: number }
  | { art: 'ratgeber'; woche: string; tab: Tab }
  | { art: 'helper'; woche: string; tab: Tab; svc: string; pos: number }
  | { art: 'fs'; woche: string; instId: string }

/**
 * Ist das eine Wochen-Kennung (T66)?
 *
 * Seit T66 steht dort das **Startdatum** der Woche („2026-09-07"), vorher ihre
 * **Position** („60"). Beide sind auf einen Blick unterscheidbar, und genau das
 * braucht die Lade-Migration: Sie erkennt daran, was sie schon umgestellt hat.
 *
 * Geprüft wird nur die Form, nicht die Gültigkeit des Datums — ein „2026-13-45"
 * käme aus keiner Quelle, die wir schreiben, und ein zu strenger Test hier
 * verwürfe im Zweifel echte Schlüssel.
 */
export function istWochenKennung(feld: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(feld)
}

/**
 * Der Schlüssel **aller** Plätze eines Punkts, ohne die Platznummer — die
 * gemeinsame Wurzel von `punktKey` und `itemZusagenKeys`.
 *
 * Der Abschnitt „part" wird für die Zusätzliche Klasse zu „aux" — an derselben
 * Stelle statt als Anhang, damit beide Räume gleich aussehende Schlüssel haben.
 */
export function punktStamm(woche: string, tab: Tab, iid: string, aux = false): string {
  return `${woche}|${tab}|${aux ? 'aux' : 'part'}|${iid}|`
}

/**
 * Schlüssel eines Programmpunkt-Slots über die **stabile Kennung** des Punkts
 * (T37) — `"2026-09-07|mid|part|k3f9x|0"`.
 *
 * Weder Abschnitt noch laufende Nummer stehen darin: Eine Bestätigung folgt
 * damit dem Punkt, nicht seinem Platz in der Liste. Genau daran scheiterte T16
 * — ein eingefügter LAC-Punkt verschob alle folgenden, und die Bestätigungen
 * blieben an der alten Zahl kleben. Einfügen, Löschen und Verschieben lassen
 * die Schlüssel seither in Ruhe.
 */
export function punktKey(woche: string, tab: Tab, iid: string, ni: number, aux = false): string {
  return `${punktStamm(woche, tab, iid, aux)}${ni}`
}

/** Stabiler Schlüssel des Ratgebers einer Zusammenkunft. */
export function ratgeberKey(woche: string, tab: Tab): string {
  return `${woche}|${tab}|ratgeber`
}

/** Stabiler Schlüssel eines Hilfsdienst-Slots. */
export function helferKey(woche: string, tab: Tab, svc: string, pos: number): string {
  return `${woche}|${tab}|helper|${svc}|${pos}`
}

/** Stabiler Schlüssel eines Treffpunkt-Leiters. */
export function fsKey(woche: string, instId: string): string {
  return `fs|${woche}|${instId}`
}

/**
 * Die beiden Präfixe, mit denen **jeder** Schlüssel einer Woche beginnt:
 * `<montag>|` für die Zusammenkünfte, `fs|<montag>|` für die Treffpunkte.
 *
 * Damit lässt sich das Versand-Tagebuch nach einer Woche durchsuchen, ohne ihre
 * Plätze noch einmal aufzuzählen — `send-plan` macht daraus zwei
 * `like`-Abfragen, `zuletztGesendet` im Client einen Präfix-Vergleich.
 */
export function wochenPraefixe(woche: string): [string, string] {
  return [`${woche}|`, `fs|${woche}|`]
}

/**
 * Einen Schlüssel zerlegen — `null` bei jeder Form, die hier nicht steht.
 *
 * **Null heißt „kenne ich nicht", nicht „ungültig".** Wer den Schlüssel nicht
 * deuten kann, soll die Zeile stehen lassen statt sie wegzuwerfen: Dieselbe
 * Zurückhaltung übt die SQL-Fassung in `schema.sql`, die unbekannte Formen
 * bewusst durchlässt — eine zu strenge Richtlinie bräche das Bestätigen fast
 * lautlos.
 *
 * Die Wochen-Kennung wird bei **allen** Formen geprüft, auch bei `fs|`. Dort
 * geschah das früher nicht; einen Schlüssel mit leerer Woche (`fs||x`) gibt es
 * nur, wenn gar keine Treffpunkt-Wochen bestehen, und schon damals lief er ins
 * Leere.
 */
export function schluesselTeile(key: string): SchluesselTeile | null {
  const p = String(key ?? '').split('|')
  if (p[0] === 'fs') {
    const woche = p[1] ?? ''
    return p.length === 3 && istWochenKennung(woche) && p[2]
      ? { art: 'fs', woche, instId: p[2] }
      : null
  }
  const woche = p[0] ?? ''
  const tab = p[1]
  if (!istWochenKennung(woche) || (tab !== 'mid' && tab !== 'we')) return null
  if (p.length === 3 && p[2] === 'ratgeber') return { art: 'ratgeber', woche, tab }
  if (p.length !== 5) return null
  if (p[2] === 'helper') return { art: 'helper', woche, tab, svc: p[3] ?? '', pos: Number(p[4]) }
  if (p[2] === 'part' || p[2] === 'aux') {
    return { art: p[2], woche, tab, iid: p[3] ?? '', ni: Number(p[4]) }
  }
  return null
}
