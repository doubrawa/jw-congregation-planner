// =============================================================================
// Supabase Edge Function: kalender — das Kalender-Abo
// =============================================================================
// Je Person ein geheimer Link, den die Kalender-App abonniert: nur lesend, nur
// die eigenen Aufgaben, erst nach „Plan senden" (was in den Kalender gehört,
// steht in `_shared/kalender.ts`). Zwei Wege:
//
//   GET ?t=<token>
//     Der Kalender (text/calendar, RFC 5545), abgerufen von der Kalender-App
//     — ohne Anmeldung, der Link ist der Schlüssel. Gespeichert ist nur seine
//     Prüfsumme (`kalender_abos.token_hash`). Ein unbekannter Link bekommt 404,
//     ohne zu verraten, ob es ihn einmal gab. Jeder Abruf setzt
//     `abgerufen_at` — daran sieht das Profil, ob das Abo trägt.
//
//   POST { aktion } mit Nutzer-JWT (supabase.functions.invoke)
//     'stand'      → { abo: { erstellt_at, abgerufen_at } | null }
//     'ausstellen' → { url } — ein neuer Link, der alte gilt nicht mehr;
//                    `sprache` (die der App) bestimmt die Texte im Kalender.
//     'beenden'    → { ok: true } — der Link gilt nicht mehr.
//     Fehler: unauthorized (401), forbidden (403: kein Mitglied, oder das
//     Konto gehört zu keiner Person), bad-request (400), fehler (500).
//
// Sicherheit: verify_jwt = false (supabase/config.toml) — eine Kalender-App
// schickt keinen Schlüssel mit. Die Function prüft selbst: GET allein über die
// Prüfsumme, POST über die Sitzung (`rest.userId`) vor allem anderen. Person
// und Versammlung kommen aus der Mitgliedszeile, nie aus dem Rumpf; jeder Wert
// geht durch `wert()` in den Pfad.
//
// Ausgerollt wird über die CI, mit dem Push (.github/workflows/ausrollen.yml).
// =============================================================================

import { neuesToken, pruefsumme } from '../_shared/anmeldung.ts'
import {
  eigenePlaetze,
  type KalenderTrolley,
  kalenderTermine,
  kalenderText,
  type Platz,
} from '../_shared/kalender.ts'
import { personDisplayName, ZEITEN_SPALTEN, zeitenAus, type ZeitenRow } from '../_shared/planung.ts'
import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { type FsInstance, type ServiceRow, tagebuchSchluessel, uebersetzerFuer, type Week } from '../_shared/zuteilungen.ts'
import { kalenderNotiz, kalenderTexte } from './texte.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

/**
 * Wie weit der Kalender zurückreicht. Was aus dem Abo fällt, löscht die
 * Kalender-App — vier Wochen Rückblick lassen das Vergangene eine Weile stehen.
 */
const RUECKBLICK_TAGE = 28

/** So sieht ein Link aus: 32 Zufallsbytes in base64url (`neuesToken`). */
const TOKEN_FORM = /^[A-Za-z0-9_-]{43}$/

/** Wie viele Schlüssel eine Abfrage mit `in.(…)` trägt — die Adresse bleibt kurz. */
const SCHLUESSEL_JE_ABFRAGE = 40

/** Ein Tag als „JJJJ-MM-TT", `tage` nach heute (UTC). */
function tagIn(tage: number, jetzt = Date.now()): string {
  return new Date(jetzt + tage * 864e5).toISOString().slice(0, 10)
}

/** Eine Antwort für die Kalender-App, die kein JSON liest. */
function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

/**
 * Zeilen einer `task_key`-Tabelle für genau diese Schlüssel. Die Schlüssel
 * enthalten `|` und `-`, aber kein Komma und kein Anführungszeichen; in
 * Anführungszeichen gesetzt liest PostgREST sie als Ganzes.
 */
async function zeilenFuer<T>(tabelle: string, spalten: string, cong: string, schluessel: readonly string[]): Promise<T[]> {
  const stuecke: string[][] = []
  for (let i = 0; i < schluessel.length; i += SCHLUESSEL_JE_ABFRAGE) stuecke.push(schluessel.slice(i, i + SCHLUESSEL_JE_ABFRAGE))
  const teile = await Promise.all(
    stuecke.map((s) =>
      rest.get<T[]>(`${tabelle}?select=${spalten}&congregation_id=eq.${wert(cong)}&task_key=in.${wert(`(${s.map((k) => `"${k}"`).join(',')})`)}`),
    ),
  )
  return teile.flat()
}

interface Abo {
  person_id: string
  congregation_id: string
  sprache: string
}

/** GET: der Kalender zum Link. */
async function kalenderLiefern(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!TOKEN_FORM.test(token)) return text('Not found', 404)
  const abo = (
    await rest.get<Abo[]>(`kalender_abos?select=person_id,congregation_id,sprache&token_hash=eq.${wert(await pruefsumme(token))}`)
  )[0]
  if (!abo) return text('Not found', 404)

  const cong = abo.congregation_id
  const p = abo.person_id
  const ab = tagIn(-RUECKBLICK_TAGE)
  // Die Woche, in der `ab` liegt, beginnt bis zu sechs Tage davor.
  const wochenAb = tagIn(-RUECKBLICK_TAGE - 6)
  const [personen, versammlung, wochen, treffpunkte, dienste, schichten, trolleys] = await Promise.all([
    rest.get<{ id: string; fn: string; ln: string }[]>(`persons?select=id,fn,ln&id=eq.${wert(p)}&congregation_id=eq.${wert(cong)}`),
    rest.get<(ZeitenRow & { hall: string })[]>(`congregations?select=${ZEITEN_SPALTEN},hall&id=eq.${wert(cong)}`),
    rest.get<{ start: string; data: Week }[]>(`weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=gte.${wert(wochenAb)}&order=start.asc`),
    rest.get<{ start: string; data: FsInstance[] }[]>(
      `fs_weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=gte.${wert(wochenAb)}&order=start.asc`,
    ),
    rest.get<ServiceRow[]>(`services?select=key,name,count,groups&congregation_id=eq.${wert(cong)}&order=position.asc`),
    rest.get<{ id: string; trolley_id: string; datum: string; von: string; bis: string }[]>(
      `trolley_termine?select=id,trolley_id,datum,von,bis&congregation_id=eq.${wert(cong)}&datum=gte.${wert(ab)}&or=${wert(`(person_id.eq.${p},partner_id.eq.${p})`)}`,
    ),
    rest.get<{ id: string; name: string; ort: string; hinweis: string }[]>(`trolleys?select=id,name,ort,hinweis&congregation_id=eq.${wert(cong)}`),
  ])
  const person = personen[0]
  if (!person) return text('Not found', 404)

  const plaetze: Platz[] = eigenePlaetze({
    person: { id: person.id, name: personDisplayName(person.fn, person.ln) },
    wochen,
    treffpunkte,
    dienste,
    zeiten: zeitenAus(versammlung[0]),
    saal: versammlung[0]?.hall ?? '',
    ab,
  })
  // Zusagen und Tagebuch nur für diese Plätze — beide Tabellen wachsen mit der
  // ganzen Versammlung. Ohne Plätze fragt `zeilenFuer` gar nicht.
  const schluessel = [...new Set(plaetze.map((pl) => pl.key))]
  const [zusagen, tagebuch] = await Promise.all([
    zeilenFuer<{ task_key: string; status: string }>('confirmations', 'task_key,status', cong, schluessel),
    zeilenFuer<{ task_key: string; name: string }>('assignment_log', 'task_key,name', cong, schluessel),
  ])
  const trolleyVon = new Map(trolleys.map((t) => [t.id, t]))
  const eigeneSchichten: KalenderTrolley[] = schichten.map((s) => {
    const t = trolleyVon.get(s.trolley_id)
    return { id: s.id, datum: s.datum, von: s.von, bis: s.bis, name: t?.name ?? '', ort: t?.ort ?? '', hinweis: t?.hinweis ?? '' }
  })
  const termine = kalenderTermine(
    plaetze,
    { zusagen: new Map(zusagen.map((z) => [z.task_key, z.status])), gesendet: new Set(tagebuch.map((z) => tagebuchSchluessel(z.task_key, z.name))) },
    eigeneSchichten,
    ab,
  )

  const tr = uebersetzerFuer()(abo.sprache)
  const t = kalenderTexte(abo.sprache)
  const body = kalenderText(termine, {
    name: `Versammlung.app · ${t.meineAufgaben}`,
    titel: (termin) => (termin.art === 'trolley' ? termin.titel : tr(termin.titel)),
    notiz: (termin) => kalenderNotiz(termin, abo.sprache),
    url: `${APP_URL}#go=aufgaben`,
  })
  // Der Vermerk ist nur ein Hinweis fürs Profil: Scheitert er, bekommt die
  // Kalender-App ihren Kalender trotzdem.
  await rest
    .send('PATCH', `kalender_abos?person_id=eq.${wert(p)}`, { abgerufen_at: new Date().toISOString() })
    .catch((err: unknown) => console.error('[kalender] abgerufen_at', err instanceof Error ? err.message : String(err)))
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="versammlung-app.ics"',
      'Cache-Control': 'private, max-age=0',
    },
  })
}

/** POST: Stand, Ausstellen, Beenden — mit der Sitzung des Kontos. */
async function verwalten(req: Request): Promise<Response> {
  const userId = await rest.userId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => null)) as { aktion?: unknown; sprache?: unknown } | null
  const aktion = body?.aktion
  if (aktion !== 'stand' && aktion !== 'ausstellen' && aktion !== 'beenden') return json({ error: 'bad-request' }, 400)

  const mitglied = (
    await rest.get<{ person_id: string | null; congregation_id: string }[]>(`members?select=person_id,congregation_id&user_id=eq.${wert(userId)}`)
  )[0]
  if (!mitglied?.person_id) return json({ error: 'forbidden' }, 403)
  const p = mitglied.person_id

  if (aktion === 'stand') {
    const abo = await rest.get<{ erstellt_at: string; abgerufen_at: string | null }[]>(
      `kalender_abos?select=erstellt_at,abgerufen_at&person_id=eq.${wert(p)}`,
    )
    return json({ abo: abo[0] ?? null })
  }
  if (aktion === 'beenden') {
    // „ok" nur, wenn die Zeile wirklich weg ist — sonst hielte jemand einen
    // weitergegebenen Link für gesperrt, der noch gilt.
    const weg = await rest.zeilenSchreiben('DELETE', `kalender_abos?person_id=eq.${wert(p)}`)
    return weg ? json({ ok: true }) : json({ error: 'fehler' }, 500)
  }
  const token = neuesToken()
  const sprache = typeof body?.sprache === 'string' && /^[a-z]{2}$/.test(body.sprache) ? body.sprache : 'de'
  const gespeichert = await rest.upsert('kalender_abos?on_conflict=person_id', [
    {
      person_id: p,
      congregation_id: mitglied.congregation_id,
      token_hash: await pruefsumme(token),
      sprache,
      erstellt_at: new Date().toISOString(),
      abgerufen_at: null,
    },
  ])
  if (!gespeichert) return json({ error: 'fehler' }, 500)
  return json({ url: `${SUPABASE_URL}/functions/v1/kalender?t=${token}` })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (req.method === 'GET') return await kalenderLiefern(req)
    if (req.method === 'POST') return await verwalten(req)
    return text('Method not allowed', 405)
  } catch (err) {
    console.error('[kalender]', err instanceof Error ? err.message : String(err))
    return req.method === 'GET' ? text('Error', 500) : json({ error: 'fehler' }, 500)
  }
})
