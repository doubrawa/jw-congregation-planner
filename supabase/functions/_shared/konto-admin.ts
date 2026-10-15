// =============================================================================
// Geteilt: Konten über die Admin-Schnittstelle von Supabase Auth (T121, Phase 8)
// =============================================================================
// Ein Kennwort gibt es nicht mehr; ein Konto entsteht, wenn sich jemand zum
// ersten Mal mit seinem Link anmeldet, und eine Sitzung bekommt, wer einen
// gültigen Link vorzeigt (`anmelden`). Beides geht nur mit der Dienstrolle.
//
// Eine Fabrik wie `restKlient`: Die Zugangsdaten liest die Function selbst aus
// `Deno.env` und reicht sie herein — so bleibt dieses Modul rein und unter Node
// testbar.
// =============================================================================

/** Eine Sitzung, wie Supabase Auth sie ausgibt — der Client übernimmt sie mit `setSession`. */
export interface Sitzung {
  access_token: string
  refresh_token: string
}

export interface KontoAdmin {
  /** Das Konto mit dieser Id — `null`, wenn es keins gibt. Wirft bei einem Fehler. */
  kontoLesen(id: string): Promise<{ id: string; email: string } | null>
  /** Ein Konto ohne Kennwort anlegen, Adresse bestätigt. `true`, wenn es danach da ist. */
  kontoAnlegen(id: string, email: string): Promise<boolean>
  /**
   * Eine Sitzung für dieses Konto: Supabase stellt einen Anmelde-Link aus, und
   * er wird gleich hier eingelöst — der Link selbst verlässt den Server nie.
   * `null`, wenn es nicht ging.
   */
  sitzungFuer(email: string): Promise<Sitzung | null>
}

export function kontoAdmin(supabaseUrl: string, serviceKey: string): KontoAdmin {
  const KOPF = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
  const auth = (pfad: string): string => `${supabaseUrl}/auth/v1/${pfad}`

  async function einloesen(hash: string, typ: 'magiclink' | 'email'): Promise<Sitzung | null> {
    const res = await fetch(auth('verify'), { method: 'POST', headers: KOPF, body: JSON.stringify({ type: typ, token_hash: hash }) })
    if (!res.ok) {
      console.error(`verify (${typ}) ${res.status}: ${await res.text()}`)
      return null
    }
    const daten = (await res.json()) as Partial<Sitzung>
    return daten.access_token && daten.refresh_token
      ? { access_token: daten.access_token, refresh_token: daten.refresh_token }
      : null
  }

  return {
    async kontoLesen(id) {
      const res = await fetch(auth(`admin/users/${encodeURIComponent(id)}`), { headers: KOPF })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`admin/users ${res.status}: ${await res.text()}`)
      const konto = (await res.json()) as { id?: string; email?: string }
      return konto.id ? { id: konto.id, email: konto.email ?? '' } : null
    },

    async kontoAnlegen(id, email) {
      const res = await fetch(auth('admin/users'), {
        method: 'POST',
        headers: KOPF,
        body: JSON.stringify({ id, email, email_confirm: true }),
      })
      if (res.ok) return true
      console.error(`admin/users anlegen ${res.status}: ${await res.text()}`)
      // Zwei Anmeldungen zugleich: Das andere Mal hat es eben angelegt.
      return (await this.kontoLesen(id)) !== null
    },

    async sitzungFuer(email) {
      const res = await fetch(auth('admin/generate_link'), {
        method: 'POST',
        headers: KOPF,
        body: JSON.stringify({ type: 'magiclink', email }),
      })
      if (!res.ok) {
        console.error(`generate_link ${res.status}: ${await res.text()}`)
        return null
      }
      // Die Antwort trägt das Feld oben (REST) oder unter `properties` (wie supabase-js es formt).
      const daten = (await res.json()) as { hashed_token?: string; properties?: { hashed_token?: string } }
      const hash = daten.hashed_token ?? daten.properties?.hashed_token
      if (!hash) return null
      // „magiclink" ist der Typ, unter dem der Link ausgestellt wurde; neuere
      // Fassungen von Supabase Auth nennen ihn „email".
      return (await einloesen(hash, 'magiclink')) ?? (await einloesen(hash, 'email'))
    },
  }
}
