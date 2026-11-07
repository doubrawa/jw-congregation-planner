/**
 * **Fehler, die bei den Nutzern auftreten, sichtbar machen** (T171).
 *
 * Bis zum 7. November 2026 sah sie niemand: `ErrorBoundary` und
 * `NachladeGrenze` schrieben in die Konsole des Geräts, ein `error` oder
 * `unhandledrejection` außerhalb davon verpuffte. Bekannt wurde nur, was der
 * Betreiber selbst bemerkte — bei einer App, die auf fremden Handys läuft, ist
 * das zu wenig.
 *
 * ------------------------------------------------------- Was gemeldet wird --
 *
 * Zeitpunkt, Stand der App, Bildschirm, Fehlerart, Meldung und Stapel (beide
 * gekürzt), der Browser grob, die Versammlung. **Nicht** die Konto- oder
 * Person-Id, **nicht** die Adresse, **keine** Eingaben: Wer gemeldet hat,
 * bleibt offen, und zum Suchen genügt der Stand samt Bildschirm. Die
 * Adressparameter fallen aus dem Stapel heraus — in einem `#go=…` stünde eine
 * Aufgaben-Id.
 *
 * ------------------------------------------------------------ Die Bremsen --
 *
 * 1. **Ohne Versammlung nichts.** Vor der Anmeldung ist `congregationId` leer,
 *    und die Richtlinie in der Datenbank weist einen solchen Schreibversuch
 *    ohnehin ab — stünde die Tabelle auch ohne Anmeldung offen, könnte sie
 *    jeder füllen.
 * 2. **Gleiches einmal je Sitzung.** Ein Fehler, der bei jedem Rendern
 *    auftritt, ist ein Fehler, nicht hundert.
 * 3. **Höchstens zehn je Stunde.** Eine Schleife soll die Tabelle nicht
 *    fluten.
 * 4. **Ohne Netz verwerfen.** Nachträglich gemeldete Fehler wären ohne Bezug;
 *    die App hat dann andere Sorgen.
 *
 * Beide Zähler leben im Speicher des Tabs. Führt ein Fehler zum Neuladen und
 * scheitert die Seite danach wieder, fangen sie von vorn an — deshalb bremst
 * zusätzlich die Datenbank (Trigger `geraete_fehler_bremsen` in `schema.sql`).
 *
 * **Melden darf nie selbst scheitern.** Jeder Weg hier verschluckt seinen
 * Fehler: Eine App, die beim Melden eines Fehlers abstürzt, hat zwei.
 */

import { supabase } from './supabase'

/** Was gemeldet wird — dieselben Werte wie `art` in `geraete_fehler`. */
export type Fehlerart = 'fehler' | 'versprechen' | 'grenze' | 'nachladen'

/**
 * **Längen genau wie die `check`-Bedingungen von `geraete_fehler`.**
 *
 * Hier zu kürzen ist Höflichkeit, dort steht die Grenze. Liefen die beiden
 * auseinander — hier 400, dort 300 —, wiese die Datenbank jede Meldung mit
 * 23514 ab, und zwar **lautlos**: `fehlerMelden` verschluckt jeden Fehler
 * (siehe Kopf). Man merkte es daran, dass nie wieder etwas gemeldet wird.
 * `supabase/geraete-fehler-rechte.test.ts` liest die Zahlen deshalb aus
 * `schema.sql` und hält sie gegen diese hier.
 */
export const MELDUNG_MAX = 300
export const STAPEL_MAX = 1200
export const STAND_MAX = 40
export const BILDSCHIRM_MAX = 40
export const BROWSER_MAX = 60
/** Die Werte von `art` — dieselbe Liste wie die `check`-Bedingung der Spalte. */
export const ARTEN: Fehlerart[] = ['fehler', 'versprechen', 'grenze', 'nachladen']
/** Höchstens so viele Meldungen je Stunde und Gerät. */
export const PRO_STUNDE = 10

/**
 * Was die App gerade tut — gesetzt vom Store, gelesen von den Grenzen.
 *
 * Über ein Modul und nicht über React-Kontext: Die globalen Horcher auf
 * `error` und `unhandledrejection` stehen außerhalb des Baums, und genau dann,
 * wenn ein Fehler zu melden ist, ist der Baum womöglich nicht mehr da.
 */
let kontext: { congregationId: string | null; bildschirm: string } = { congregationId: null, bildschirm: '' }

export function fehlerKontextSetzen(congregationId: string | null, bildschirm: string): void {
  kontext = { congregationId, bildschirm }
}

type Zustand = { gesehen: Set<string>; zeiten: number[] }
const zustand: Zustand = { gesehen: new Set(), zeiten: [] }

/** Nur für Proben: beide Zähler leeren. */
export function fehlerZaehlerLeeren(): void {
  zustand.gesehen.clear()
  zustand.zeiten = []
}

/**
 * Darf diese Meldung hinaus? Verbraucht dabei ihren Platz — wer `true`
 * bekommt, meldet auch.
 */
export function durchlassen(schluessel: string, jetzt: number, z: Zustand = zustand, grenze = PRO_STUNDE): boolean {
  if (z.gesehen.has(schluessel)) return false
  z.zeiten = z.zeiten.filter((t) => jetzt - t < 3_600_000)
  if (z.zeiten.length >= grenze) return false
  z.gesehen.add(schluessel)
  z.zeiten.push(jetzt)
  return true
}

/**
 * Browser-Familie und Hauptversion — nicht die ganze Kennung: Die ist ein
 * Fingerabdruck und sagt über den Fehler nichts mehr aus.
 *
 * **Die Reihenfolge ist der Inhalt dieser Funktion.** Edge und Opera nennen
 * sich auch „Chrome", Chrome nennt sich auch „Safari"; wer der Reihe nach von
 * oben prüft, bekommt den spezifischsten Treffer. Umgekehrt hieße jeder Edge
 * „Chrome".
 */
export function browserGrob(ua: string): string {
  // `Edg/`, `EdgA/` (Android), `EdgiOS/`, `OPR/`, `OPiOS/` — die Namen auf den
  // Handys sind andere als auf dem Schreibtisch, und ein Edge auf dem iPhone
  // hieße sonst „Safari".
  const muster: [string, RegExp][] = [
    ['Edge', /Edg[A-Za-z]*\/(\d+)/],
    ['Opera', /OP(?:R|iOS)\/(\d+)/],
    ['Samsung', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ]
  for (const [name, re] of muster) {
    const t = re.exec(ua)
    if (t) return `${name} ${t[1]}`
  }
  return ''
}

/**
 * Der Stapel, gekürzt und **ohne Adressparameter**: Aus
 * `…/assets/index-ab12.js?t=1:3:4` wird `…/assets/index-ab12.js:3:4`, aus
 * einem `#go=<aufgabe>` nichts.
 *
 * Geschnitten wird je Adresse, nicht über den ganzen Text: Ein `?` oder `#`
 * steckt auch in Funktionsnamen, und ein grobes Muster nähme die Zeilennummer
 * mit — ohne die ist ein Stapel wertlos.
 */
export function stapelKuerzen(stapel: string | undefined, max = STAPEL_MAX): string {
  if (!stapel) return ''
  return stapel.replace(/https?:\/\/[^\s)]+/g, (adresse) => adresse.replace(/[?#][^:]*/, '')).slice(0, max)
}

/** Ein geworfenes Objekt als Text — und wenn es sich nicht schreiben lässt, seine Art. */
function alsText(fehler: object): string {
  try {
    return JSON.stringify(fehler) ?? ''
  } catch {
    // Ein Zyklus oder ein werfender Getter — genau an der Stelle, für die das
    // Melden da ist, dürfte es nicht selbst scheitern.
    return Object.prototype.toString.call(fehler)
  }
}

/** Die Meldung eines Fehlers — was auch immer geworfen wurde, als kurzer Text. */
export function meldungKuerzen(fehler: unknown, max = MELDUNG_MAX): string {
  const roh =
    fehler instanceof Error ? fehler.message
    : typeof fehler === 'string' ? fehler
    : fehler === null || fehler === undefined ? ''
    : typeof fehler === 'object' ? alsText(fehler)
    : String(fehler)
  return roh.slice(0, max) || '(ohne Meldung)'
}

/**
 * Die Zeile, wie sie in die Tabelle geht — rein, damit die Probe sie lesen
 * kann. Die Versammlung ist Pflicht: Ohne sie meldet `fehlerMelden` gar nicht,
 * und eine Zeile mit leerer Kennung wäre keine gültige Uuid.
 */
export function fehlerZeile(
  art: Fehlerart,
  fehler: unknown,
  k: { congregationId: string; bildschirm: string },
  stand: string,
  ua: string,
): Record<string, string> {
  return {
    congregation_id: k.congregationId,
    stand: stand.slice(0, STAND_MAX),
    bildschirm: k.bildschirm.slice(0, BILDSCHIRM_MAX),
    art,
    meldung: meldungKuerzen(fehler),
    stapel: stapelKuerzen(fehler instanceof Error ? fehler.stack : undefined),
    browser: browserGrob(ua).slice(0, BROWSER_MAX),
  }
}

/**
 * Einen Fehler melden — oder eben nicht. Wirft nie, wartet auf nichts, was
 * den Nutzer betrifft.
 *
 * `zusatz` hängt an der Meldung, wo die Stelle mehr weiß als der Fehler selbst
 * (der Komponentenpfad einer Grenze).
 */
export async function fehlerMelden(art: Fehlerart, fehler: unknown, zusatz = ''): Promise<void> {
  try {
    const { congregationId, bildschirm } = kontext
    if (!supabase || !congregationId) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const zeile = fehlerZeile(
      art,
      fehler,
      { congregationId, bildschirm },
      __BUILD_ID__,
      typeof navigator === 'undefined' ? '' : navigator.userAgent,
    )
    if (zusatz) zeile.meldung = `${zeile.meldung} — ${zusatz}`.slice(0, MELDUNG_MAX)
    if (!durchlassen(`${art}|${zeile.bildschirm}|${zeile.meldung}`, Date.now())) return
    await supabase.from('geraete_fehler').insert(zeile)
  } catch {
    /* Melden darf nie selbst scheitern — siehe Kopf. */
  }
}

/**
 * Die beiden globalen Horcher einhängen: ein Fehler, den niemand gefangen hat,
 * und ein Versprechen, das niemand abgelehnt hat.
 *
 * Gibt eine Funktion zurück, die sie wieder aushängt — die Proben brauchen das,
 * und ohne sie hingen nach jedem Lauf welche nach.
 */
export function fehlerGrenzenEinhaengen(ziel: EventTarget = window): () => void {
  const beiFehler = (e: Event): void => {
    void fehlerMelden('fehler', (e as ErrorEvent).error ?? (e as ErrorEvent).message)
  }
  const beiVersprechen = (e: Event): void => {
    void fehlerMelden('versprechen', (e as PromiseRejectionEvent).reason)
  }
  ziel.addEventListener('error', beiFehler)
  ziel.addEventListener('unhandledrejection', beiVersprechen)
  return () => {
    ziel.removeEventListener('error', beiFehler)
    ziel.removeEventListener('unhandledrejection', beiVersprechen)
  }
}
