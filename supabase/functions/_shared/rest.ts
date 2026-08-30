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
   * meldet zurück, ob dabei eine Zeile getroffen wurde.
   *
   * Das ist ein Vergleiche-und-Tausche in einer einzigen Anweisung — genau das
   * fehlte beim Einspringen. Zwischen Lesen und Schreiben lag nichts: zwei
   * gleichzeitige Übernahmen überschrieben sich, und der zweite Aufruf löschte
   * anschließend sogar die Bestätigung des ersten.
   *
   * `return=representation` ist der Weg, die Trefferzahl zu erfahren:
   * PostgREST liefert die geänderten Zeilen zurück, bei verfehltem Filter ein
   * leeres Array.
   */
  patchIf(path: string, body: unknown): Promise<boolean>
  /** Eingeloggten Nutzer aus dem mitgeschickten JWT auflösen. */
  userId(req: Request): Promise<string | null>
}

export function restKlient(supabaseUrl: string, serviceKey: string): Rest {
  const AUTH = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const ziel = (path: string): string => `${supabaseUrl}/rest/v1/${path}`

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

    async patchIf(path, body): Promise<boolean> {
      const res = await fetch(ziel(path), {
        method: 'PATCH',
        headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        console.error(`PATCH ${path} ${res.status}: ${await res.text()}`)
        return false
      }
      const rows = (await res.json().catch(() => [])) as unknown[]
      return Array.isArray(rows) && rows.length > 0
    },

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
