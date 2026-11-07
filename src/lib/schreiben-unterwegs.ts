/**
 * **Was gerade hinausgeht** — jeder Aufruf an die Datenbank, der etwas ändern
 * kann, solange seine Antwort aussteht.
 *
 * Gebraucht vom Nachladen (`loadAndHydrate`): Es ersetzt den Bestand durch
 * das, was es gelesen hat. Las es, bevor ein eigener Schreibvorgang ankam,
 * stand dieser danach nicht mehr auf dem Bildschirm — eine eben gegebene
 * Zusage war wieder offen, eine eben getippte Zeile fort, bis zum nächsten
 * Laden; in der Datenbank stand beides. Das Fenster öffnet jedes stille
 * Nachladen: der Push-Klick (man landet auf „Meine Aufgaben" und bestätigt),
 * „Plan senden", die Mitteilungen mit Neuem, ein Konflikt.
 *
 * Verfolgt wird am `fetch` des Supabase-Clients (`lib/supabase.ts`), nicht an
 * den Schreibwegen: Durch ihn geht alles — Tabellen, RPC, Functions —, und
 * kein künftiger Weg kann vergessen werden. „Ändernd" heißt: weder GET noch
 * HEAD (so liest PostgREST) und nicht die Anmeldung (sie ändert nichts am
 * Bestand und erneuert ihr Token von selbst).
 */

const unterwegs = new Set<Promise<void>>()
let begonnen = 0

function adresseVon(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

/**
 * Tabellen, deren Schreibvorgänge **nicht** zählen, weil sie am geladenen
 * Bestand nichts ändern.
 *
 * `geraete_fehler` (T171): Eine Fehlermeldung geht hinaus, während etwas
 * klemmt — und das Nachladen wartete sonst auf sie. Es wartet, damit eine eben
 * gegebene Zusage nicht von veralteten Daten überschrieben wird; eine Meldung
 * steht in keinem Bildschirm und kann nichts überschreiben. Gezählt hieße
 * hier: Genau wenn das Netz hakt, hängt auch das Nachladen.
 */
const ZAEHLT_NICHT = ['/rest/v1/geraete_fehler']

function aendert(input: RequestInfo | URL, init?: RequestInit): boolean {
  const methode = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (methode === 'GET' || methode === 'HEAD') return false
  const adresse = adresseVon(input)
  return !adresse.includes('/auth/v1/') && !ZAEHLT_NICHT.some((pfad) => adresse.includes(pfad))
}

/** Ein `fetch`, der jeden ändernden Aufruf verfolgt — für den Supabase-Client. */
export function verfolgterFetch(basis?: typeof fetch): typeof fetch {
  return (input, init) => {
    const antwort = (basis ?? globalThis.fetch)(input, init)
    if (aendert(input, init)) mitverfolgen(antwort)
    return antwort
  }
}

/**
 * **Was gleich schreiben wird, schon jetzt als unterwegs führen** — die
 * Schreibwege in `lib/daten/` melden sich hier an, sobald sie losgehen. Am
 * `fetch` allein bliebe eine Lücke, in der das Warten schon vorbei wäre: eine
 * Schreibkette, die noch auf ihren Vorgänger wartet; ein Aufruf, dessen
 * `fetch` erst nach dem Token kommt (supabase-js holt es vorher, nach einer
 * Stunde übers Netz); was erst nach dem Schreiben einer Woche hinausgeht
 * (`nachDemSchreiben` in `persist.ts`).
 */
export function mitverfolgen(arbeit: PromiseLike<unknown>): void {
  begonnen++
  // Ob sie gelingt, ist hier gleich — nur, dass sie angekommen ist.
  const fertig = Promise.resolve(arbeit).then(
    () => undefined,
    () => undefined,
  )
  unterwegs.add(fertig)
  void fertig.then(() => unterwegs.delete(fertig))
}

/** Wie viele ändernde Aufrufe bisher losgingen — das Nachladen vergleicht vorher und nachher. */
export function schreibStand(): number {
  return begonnen
}

/**
 * Warten, bis nichts mehr unterwegs ist — auch, was währenddessen dazukommt.
 * Höchstens `hoechstens` Millisekunden: Ein Aufruf ohne Antwort darf das
 * Nachladen nicht für immer aufhalten.
 */
export async function schreibenAbwarten(hoechstens = 5000): Promise<void> {
  const ende = Date.now() + hoechstens
  while (unterwegs.size > 0) {
    const rest = ende - Date.now()
    if (rest <= 0) return
    let wecker: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.all(unterwegs),
      new Promise<void>((weiter) => {
        wecker = setTimeout(weiter, rest)
      }),
    ])
    clearTimeout(wecker)
  }
}
