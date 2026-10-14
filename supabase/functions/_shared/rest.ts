// =============================================================================
// Geteilt: CORS, Antwortform und der Zugriff auf PostgREST
// =============================================================================
// Jede Edge Function trug diese fünfzig Zeilen einmal für sich — dieselbe
// CORS-Tabelle, dasselbe `json()`, dieselbe Kodierung, dieselben REST-Hüllen.
// Vier Abschriften, und sie waren bereits auseinandergelaufen: `substitute`
// entfernte ein abgelaufenes Push-Abo über `endpoint`, `send-plan` über `id`,
// `send-reminders` schickte die Id **unkodiert** in den Pfad. Solche
// Unterschiede sieht beim Lesen einer einzelnen Datei niemand, und der
// Testbestand jeder Function vergleicht sie nur mit sich selbst.
//
// **Warum eine Fabrik und keine Modul-Konstanten.** Die Zugangsdaten stehen in
// `Deno.env`. Läse dieses Modul sie selbst, wäre `_shared` nicht mehr rein: Der
// Testlauf importiert es unter Node, wo es kein `Deno` gibt, und schon der
// Import flöge. Jede Function liest ihre Umgebung weiterhin selbst — dorthin
// gehört sie — und reicht sie einmal hier herein.
// =============================================================================

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Antwort mit CORS-Kopfzeilen — die einzige Form, in der eine Function antwortet. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * Wert für einen PostgREST-Filter im Pfad.
 *
 * Ungekodiert **beendet ein `#` die Abfrage**: Der URL-Parser macht alles
 * dahinter zum Fragment, und `fetch` sendet das nie mit. Aus
 * `…&congregation_id=eq.X#&task_key=eq.Y` wird beim Server also
 * `…&congregation_id=eq.X` — der Filter, der die Zeile eingrenzt, fällt weg.
 * Ein DELETE trifft dann die ganze Versammlung statt einer Aufgabe, ein PATCH
 * verliert zusätzlich seine Vergleiche-und-Tausche-Bedingung.
 *
 * Deshalb geht hier kein Wert roh in einen Pfad — auch keiner, der heute aus
 * der eigenen Datenbank kommt und harmlos aussieht (Aufgaben-Schlüssel
 * enthalten `|`, Namen können alles enthalten).
 */
export const wert = (v: string | number): string => encodeURIComponent(String(v))

/**
 * **Die Schlüssel mit Dienstrechten**, wie die Plattform sie jeder gehosteten
 * Function mitgibt: die neuen als JSON-Wörterbuch nach Namen
 * (`SUPABASE_SECRET_KEYS`, etwa `{"default":"sb_secret_…"}`) und der alte
 * Service-Role-Schlüssel. Die Umgebung liest der Aufrufer, dieses Modul bleibt
 * rein (siehe Kopf).
 */
export function dienstSchluessel(secretKeysJson: string | undefined, serviceRoleKey: string | undefined): string[] {
  const out: string[] = []
  if (secretKeysJson) {
    try {
      const woerterbuch: unknown = JSON.parse(secretKeysJson)
      if (woerterbuch && typeof woerterbuch === 'object') {
        for (const schluessel of Object.values(woerterbuch)) {
          if (typeof schluessel === 'string' && schluessel) out.push(schluessel)
        }
      }
    } catch {
      // Kein JSON — dann zählt nur der alte Schlüssel.
    }
  }
  if (serviceRoleKey) out.push(serviceRoleKey)
  return out
}

/**
 * Trägt der Aufruf einen dieser Schlüssel im `apikey`-Kopf? So melden sich die
 * Wartungsskripte (`funktionsKopf` in `scripts/gemeinsam.mjs`) — ohne Sitzung.
 * Verglichen wird der `apikey`, nicht `Authorization`: Dort stehen Sitzungen.
 */
export function mitDienstSchluessel(req: Request, schluessel: readonly string[]): boolean {
  const key = (req.headers.get('apikey') ?? '').trim()
  return key !== '' && schluessel.includes(key)
}

export interface Rest {
  /** Lesen. Wirft bei einem Fehler — der Aufrufer entscheidet, ob er ihn fängt. */
  get<T>(path: string): Promise<T>
  /**
   * Zeilen anlegen.
   *
   * `ignoreDuplicates`: Bei einem Eindeutigkeits-Konflikt sollen die **übrigen**
   * Zeilen trotzdem stehen. Ein INSERT ist in Postgres ganz oder gar nicht —
   * eine einzige Dublette verwirft sonst den ganzen Stapel, und der Fehler geht
   * bloß in die Logs. `resolution=ignore-duplicates` bittet PostgREST um
   * `ON CONFLICT DO NOTHING`: Was schon dasteht, bleibt; was fehlt, kommt hinzu.
   */
  insert(path: string, rows: unknown[], opts?: { ignoreDuplicates?: boolean }): Promise<void>
  /** Schreiben ohne Rückgabe (DELETE, PATCH, POST) — Fehler nur in die Logs. */
  send(method: string, path: string, body?: unknown): Promise<void>
  /**
   * Bedingtes PATCH: schreibt nur, wenn der Filter im Pfad noch zutrifft, und
   * liefert die getroffenen Zeilen — `[]` bei verfehltem Filter, `null` bei
   * einem Fehler. Das ist ein Vergleiche-und-Tausche in einer einzigen
   * Anweisung (`_shared/woche-schreiben.ts`); welche Spalten zurückkommen,
   * sagt ein `select=` im Pfad.
   *
   * `return=representation` ist der Weg, die Trefferzahl zu erfahren:
   * PostgREST liefert die geänderten Zeilen zurück, bei verfehltem Filter ein
   * leeres Array.
   */
  patchZeilen<T>(path: string, body: unknown): Promise<T[] | null>
  /**
   * Anlegen oder Löschen mit Rückmeldung: die getroffenen Zeilen, `[]` bei
   * verfehltem Filter, `null` bei einem Fehler — wie `patchZeilen`. Gebraucht,
   * wo ein Trigger abweisen darf und der Aufrufer es erfahren muss
   * (`trolley`: zwei wollten zugleich dieselbe Zeit).
   */
  zeilenSchreiben<T>(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<T[] | null>
  /** Eingeloggten Nutzer aus dem mitgeschickten JWT auflösen. */
  userId(req: Request): Promise<string | null>
}

export function restKlient(supabaseUrl: string, serviceKey: string): Rest {
  const AUTH = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const ziel = (path: string): string => `${supabaseUrl}/rest/v1/${path}`

  // Eine Funktion für alle Wege mit Rückmeldung, nicht über `this`:
  // `patchZeilen` stünde sonst ohne seinen Bezug da, sobald jemand es aus dem
  // Klienten herausnimmt (`rest.patchZeilen` als Rückruf weitergereicht).
  async function zeilenSchreiben<T>(method: string, path: string, body?: unknown): Promise<T[] | null> {
    const res = await fetch(ziel(path), {
      method,
      headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      console.error(`${method} ${path} ${res.status}: ${await res.text()}`)
      return null
    }
    const rows = (await res.json().catch(() => [])) as unknown
    return Array.isArray(rows) ? (rows as T[]) : []
  }
  const patchZeilen = <T>(path: string, body: unknown): Promise<T[] | null> => zeilenSchreiben<T>('PATCH', path, body)

  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetch(ziel(path), { headers: AUTH })
      if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
      return res.json() as Promise<T>
    },

    async insert(path, rows, opts): Promise<void> {
      if (rows.length === 0) return
      const prefer = ['return=minimal']
      if (opts?.ignoreDuplicates) prefer.push('resolution=ignore-duplicates')
      const res = await fetch(ziel(path), {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: prefer.join(',') },
        body: JSON.stringify(rows),
      })
      if (!res.ok) console.error(`POST ${path} ${res.status}: ${await res.text()}`)
    },

    async send(method, path, body): Promise<void> {
      const res = await fetch(ziel(path), {
        method,
        headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!res.ok) console.error(`${method} ${path} ${res.status}: ${await res.text()}`)
    },

    patchZeilen,
    zeilenSchreiben,

    async userId(req): Promise<string | null> {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: serviceKey, Authorization: req.headers.get('Authorization') ?? '' },
      })
      if (!res.ok) return null
      const user = (await res.json()) as { id?: string }
      return user.id ?? null
    },
  }
}

/**
 * **Zeilen einer `task_key`-Tabelle** (`confirmations`, `assignment_log`),
 * deren Schlüssel mit einem der Präfixe beginnt — nur, was gebraucht wird.
 *
 * Beide Tabellen wachsen ohne Grenze (gut 35 Plätze je Woche, aufgeräumt wird
 * nie), gebraucht werden immer nur ein paar Wochen. Ganz gelesen holte eine
 * Abfrage nach ein paar Jahren Zehntausende Zeilen — und schon nach gut einem
 * halben Jahr mehr, als PostgREST je Abfrage überhaupt liefert (`max-rows`,
 * gehostet 1000). Der Rest fällt dann still weg: kein Fehler, nur fehlende
 * Zeilen, und ein bestätigter Platz gilt als offen.
 *
 * Je Präfix eine einfache `like`-Abfrage, parallel, statt eines `or=`: Ihre
 * Bedeutung ist ohne Nachschlagen in der PostgREST-Grammatik zu erkennen. Die
 * Präfixe tragen nur Montage (`YYYY-MM-DD`, `wochenPraefixe`), also weder `%`
 * noch `_`, die als Muster wirkten.
 */
export async function zeilenJePraefix<T>(
  rest: Rest,
  cong: string,
  tabelle: string,
  spalten: string,
  praefixe: readonly string[],
): Promise<T[]> {
  const teile = await Promise.all(
    praefixe.map((praefix) =>
      rest.get<T[]>(
        `${tabelle}?select=${spalten}&congregation_id=eq.${wert(cong)}&task_key=like.${wert(`${praefix}*`)}`,
      ),
    ),
  )
  return teile.flat()
}
