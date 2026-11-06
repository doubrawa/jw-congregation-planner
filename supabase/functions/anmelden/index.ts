// =============================================================================
// Supabase Edge Function: anmelden — mit Link oder mit Code
// =============================================================================
// Ein Kennwort gibt es nicht (T121, Phase 8). Wer in die App soll, bekommt vom
// Admin einen Link — per Nachricht oder auf einem Zettel mit QR-Code und einem
// Code zum Eintippen (`send-invite`). Diese Function löst ihn ein. Einen Link
// per E-Mail anfordern (`aktion: 'mail'`) geht nicht — die App speichert keine
// Adressen; die Aktion ist ein `bad-request`.
//
// **Öffentlich**: Wer sich anmelden will, hat noch keine Sitzung. Das Gateway
// lässt den öffentlichen Schlüssel aus dem Bündel durch (`verify_jwt` ist keine
// Mitgliedsprüfung, siehe config.toml); geschützt wird hier selbst — Link und
// Code **sind** der Ausweis, und Raten wird gebremst.
//
// **Mit Sitzung** dazu der eigene Zugang, im Profil: ein Einmal-Code
// fürs nächste Gerät — kurz gültig, einmal einzulösen, im selben Feld wie der
// Code vom Zettel — und „Zugang erneuern": Link und Zettel gelten danach nicht
// mehr, alle übrigen Geräte werden abgemeldet. Die Person kommt dabei allein aus
// der Sitzung, nie aus der Anfrage.
//
// Request (supabase.functions.invoke):
//   { aktion: 'link', token }                  Anmelde-Link (Nachricht)
//   { aktion: 'code', code, pruefen? }         Code vom Zettel oder Einmal-Code (QR
//                                              oder getippt); `pruefen`: nur Name
//                                              und Versammlung
//   { aktion: 'einmalcode' }                   mit Sitzung: ein Code fürs nächste Gerät
//   { aktion: 'erneuern' }                     mit Sitzung: Link und Zettel sperren,
//                                              die übrigen Geräte abmelden
// Response:
//   200 { ok: true, sitzung: { access_token, refresh_token } }   angemeldet
//   200 { ok: true, name, versammlung }                          geprüft
//   200 { ok: true, code, zettelUrl, gueltigBis }                Einmal-Code
//   200 { ok: true }                                             erneuert
//   404 { error: 'ungueltig' } · 410 { error: 'abgelaufen' } · 429 { error: 'zu-viele' }
//   401 { error: 'unauthorized' } · 403 { error: 'forbidden' }   ohne Sitzung, ohne Person
//   400 { error: 'bad-request' }                                 sonst
//   503 { error: 'server-error' }                                Versuch nicht zu buchen
//
// **Das Konto entsteht bei der ersten Anmeldung**, mit der Person-Id als Konto-Id
// und einer internen Adresse (`interneAdresse`), ohne Kennwort. „Angemeldet"
// heißt damit weiter: Es gibt eine `members`-Zeile. Die Rechte kommen aus der
// Vormerkung an der Person (Admin, Planer), wie früher über den Einladungscode.
// Jede weitere Anmeldung eines bestehenden Kontos meldet die Function ihm selbst.
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
// send-reminders), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
// =============================================================================

import { LINK_SPALTEN, type LinkZeile } from '../_shared/anmelde-links.ts'
import {
  codeAnzeige,
  codeNormal,
  codeUrl,
  codeVollstaendig,
  einmalGueltigBis,
  interneAdresse,
  neuerCode,
  pruefsumme,
} from '../_shared/anmeldung.ts'
import { kontoAdmin } from '../_shared/konto-admin.ts'
import { personDisplayName } from '../_shared/planung.ts'
import { abbestellerFuer, type PushAbo, vapidSetzen, zustellen } from '../_shared/push.ts'
import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { anmeldeTexte, TEXT_NEUE_ANMELDUNG, TITEL_NEUE_ANMELDUNG } from './texte.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.org'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)
const konten = kontoAdmin(SUPABASE_URL, SERVICE_KEY)

/**
 * **Die Bremse gegen Raten.** Ein Code hat 40 Bit; wer ihn erraten will, muss
 * viele Male fragen. Je Absender 20 Fehlversuche in der Stunde, über alle 500 —
 * damit kommt in einem Jahr keiner auch nur in die Nähe eines Treffers. Der Preis:
 * Wer die Grenze für alle ausschöpft, sperrt eine Stunde lang das Anmelden mit
 * Code; der Link geht weiter.
 */
const GRENZE_JE_ABSENDER = 20
const GRENZE_GESAMT = 500

interface PersonZeile {
  id: string
  fn: string
  ln: string
  planner_vorgemerkt: boolean
  zuteiler_vorgemerkt?: boolean
}

/**
 * Wer anfragt — für die Bremse je Absender. Der erste Eintrag von
 * `x-forwarded-for` ist die echte Adresse: Gemessen am 16.10.2026 mit einer
 * Wegwerf-Function, setzt die Plattform die Kette selbst (`<Aufrufer>,<Aufrufer>,
 * <intern>`) und verwirft, was der Aufrufer dort mitschickt; ein selbst gesetztes
 * `cf-connecting-ip` weist schon Cloudflare ab (403). Fälschen lässt sich der
 * Absender hier also nicht.
 */
function absenderVon(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unbekannt'
}

/**
 * **Den Versuch vorab buchen** — zählen und eintragen in einem Schritt unter
 * einer Sperre (`anmelde_versuch` in `schema.sql`): Erst lesen und danach
 * eintragen ließe gleichzeitig geschickte Codes alle an der Zählung vorbei.
 * War der Code richtig, nimmt `versuchFreigeben` die Zeile wieder heraus.
 * Lässt sich nicht buchen, gilt das als Fehler, nicht als Freibrief — sonst
 * schaltete ein Ausfall der Tabelle die Bremse ab.
 */
async function versuchBuchen(absender: string): Promise<{ id: number } | 'gebremst' | 'fehler'> {
  const zeilen = await rest.zeilenSchreiben<{ id: number }>('POST', 'rpc/anmelde_versuch', {
    p_ip: absender,
    p_je_absender: GRENZE_JE_ABSENDER,
    p_gesamt: GRENZE_GESAMT,
  })
  if (zeilen === null) return 'fehler'
  return zeilen[0] ?? 'gebremst'
}

/** Ein richtiger Code ist kein Fehlversuch. */
async function versuchFreigeben(versuch: { id: number }): Promise<void> {
  await rest.send('DELETE', `anmelde_fehlversuche?id=eq.${wert(versuch.id)}`)
}

/**
 * **Neue Anmeldung melden**: Meldet sich ein Gerät mit dem Zugang
 * eines schon bestehenden Kontos an, erfährt das Konto davon — in der Glocke
 * und per Push an seine übrigen Geräte (das neue hat noch kein Abo). Ein Admin
 * kann für jede Person einen neuen Link ausstellen; ohne die Meldung meldete er
 * sich damit unbemerkt als sie an. Scheitert sie, bleibt die Anmeldung gültig.
 */
async function neueAnmeldungMelden(userId: string, congregationId: string): Promise<void> {
  try {
    await rest.insert('notifications', [
      { congregation_id: congregationId, user_id: userId, type: 'anmeldung', title: TITEL_NEUE_ANMELDUNG, body: TEXT_NEUE_ANMELDUNG },
    ])
    if (!vapidSetzen(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)) return
    const abos = await rest.get<(PushAbo & { lang: string | null })[]>(
      `push_subscriptions?select=id,endpoint,p256dh,auth,lang&user_id=eq.${wert(userId)}`,
    )
    await zustellen(
      abos.map((abo) => {
        const { titel, text } = anmeldeTexte(abo.lang)
        return { abo, titel, body: text, url: `${APP_URL}#go=mitteilungen` }
      }),
      abbestellerFuer(rest),
    )
  } catch (err) {
    console.error('anmelden: Meldung', err instanceof Error ? err.message : String(err))
  }
}

/** Der Link zu einer Prüfsumme — Token oder Code. */
async function linkZu(spalte: 'token_hash' | 'code_hash', klartext: string): Promise<LinkZeile | undefined> {
  const zeilen = await rest.get<LinkZeile[]>(`anmelde_links?select=${LINK_SPALTEN}&${spalte}=eq.${await pruefsumme(klartext)}`)
  return zeilen[0]
}

/** Wem ein Zugang gehört und bis wann er gilt — ein Link oder ein Einmal-Code. */
type Zugang = Pick<LinkZeile, 'person_id' | 'congregation_id' | 'gueltig_bis'>

const EINMAL_SPALTEN = 'person_id,congregation_id,gueltig_bis'

/** Der Einmal-Code zu diesem Code — gelesen, nicht eingelöst (`pruefen`). */
async function einmalZu(code: string): Promise<Zugang | undefined> {
  const zeilen = await rest.get<Zugang[]>(`anmelde_einmalcodes?select=${EINMAL_SPALTEN}&code_hash=eq.${await pruefsumme(code)}`)
  return zeilen[0]
}

/**
 * **Einen Einmal-Code einlösen**: löschen, solange er gilt, und nur, was dabei
 * wirklich verschwand, meldet an. Zwei Geräte mit demselben Code kommen so nicht
 * beide hinein — das Löschen ist das Einlösen. `undefined`: schon fort oder
 * abgelaufen; `'fehler'`: die Datenbank hat nicht geantwortet — dann gilt er
 * weiter.
 */
async function einmalEinloesen(code: string, jetzt: number): Promise<Zugang | undefined | 'fehler'> {
  const zeilen = await rest.zeilenSchreiben<Zugang>(
    'DELETE',
    `anmelde_einmalcodes?select=${EINMAL_SPALTEN}&code_hash=eq.${await pruefsumme(code)}&gueltig_bis=gt.${wert(new Date(jetzt).toISOString())}`,
  )
  return zeilen === null ? 'fehler' : zeilen[0]
}

const abgelaufen = (zugang: Pick<Zugang, 'gueltig_bis'>, jetzt: number): boolean => new Date(zugang.gueltig_bis).getTime() <= jetzt

async function personZu(link: Zugang): Promise<PersonZeile | undefined> {
  const zeilen = await rest.get<PersonZeile[]>(
    `persons?select=id,fn,ln,planner_vorgemerkt,zuteiler_vorgemerkt&id=eq.${wert(link.person_id)}&congregation_id=eq.${wert(link.congregation_id)}`,
  )
  return zeilen[0]
}

async function versammlungsName(congregationId: string): Promise<string> {
  const zeilen = await rest.get<{ name: string }[]>(`congregations?select=name&id=eq.${wert(congregationId)}`)
  return zeilen[0]?.name ?? ''
}

/** Die Konto-Id der Person in ihrer Versammlung — `undefined`, wenn sie noch keins hat. */
async function kontoIdDer(personId: string, congregationId: string): Promise<string | undefined> {
  const mitglied = await rest.get<{ user_id: string }[]>(
    `members?select=user_id&person_id=eq.${wert(personId)}&congregation_id=eq.${wert(congregationId)}`,
  )
  return mitglied[0]?.user_id
}

/**
 * Das Konto der Person — vorhanden oder jetzt angelegt — und seine Adresse.
 * `null`, wenn es nicht ging (die Person ist dann nicht angemeldet). `neu`
 * sagt, ob es eben erst entstand: Dann ist dies sein erstes Gerät.
 */
async function kontoDer(person: PersonZeile, congregationId: string): Promise<{ id: string; email: string; neu: boolean } | null> {
  const vorhanden = await kontoIdDer(person.id, congregationId)
  if (vorhanden) {
    const konto = await konten.kontoLesen(vorhanden)
    return konto ? { id: konto.id, email: konto.email, neu: false } : null
  }
  // Erste Anmeldung: Konto-Id = Person-Id, eine interne Adresse, kein Kennwort.
  const konto = (await konten.kontoLesen(person.id)) ?? ((await konten.kontoAnlegen(person.id, interneAdresse(person.id))) ? await konten.kontoLesen(person.id) : null)
  if (!konto) return null
  const angelegt = await rest.zeilenSchreiben('POST', 'members?select=user_id', {
    user_id: konto.id,
    congregation_id: congregationId,
    person_id: person.id,
    planner: Boolean(person.planner_vorgemerkt),
    zuteiler: Boolean(person.zuteiler_vorgemerkt),
    email: '',
  })
  if (angelegt && angelegt.length > 0) return { id: konto.id, email: konto.email, neu: true }
  // Zwei erste Anmeldungen zugleich (Doppeltipp, Handy und Tablet): Die andere
  // hat die Zeile eben geschrieben, diese prallt daran ab — angemeldet ist sie
  // trotzdem.
  return (await kontoIdDer(person.id, congregationId)) === konto.id ? { id: konto.id, email: konto.email, neu: true } : null
}

/**
 * Mit einem gültigen Zugang anmelden: Konto sicherstellen, Sitzung ausstellen.
 * Bei einem Link vermerkt, wann er benutzt wurde — ein Einmal-Code ist danach
 * fort und berührt den Link nicht.
 */
async function anmelden(zugang: Zugang, jetzt: number, { linkVermerken }: { linkVermerken: boolean }): Promise<Response> {
  const person = await personZu(zugang)
  if (!person) return json({ error: 'ungueltig' }, 404)
  const konto = await kontoDer(person, zugang.congregation_id)
  if (!konto) return json({ error: 'server-error' }, 500)
  const sitzung = await konten.sitzungFuer(konto.email)
  if (!sitzung) return json({ error: 'server-error' }, 500)
  if (linkVermerken) await rest.send('PATCH', `anmelde_links?person_id=eq.${wert(person.id)}`, { benutzt_at: new Date(jetzt).toISOString() })
  if (!konto.neu) await neueAnmeldungMelden(konto.id, zugang.congregation_id)
  return json({ ok: true, sitzung })
}

async function mitToken(token: unknown, jetzt: number): Promise<Response> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return json({ error: 'ungueltig' }, 404)
  const link = await linkZu('token_hash', token)
  if (!link) return json({ error: 'ungueltig' }, 404)
  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)
  return anmelden(link, jetzt, { linkVermerken: true })
}

/**
 * Mit einem Code anmelden — vom Zettel oder ein Einmal-Code aus dem Profil.
 * Beide haben dieselbe Form und dasselbe Feld; gesucht wird erst unter den
 * Links, dann unter den Einmal-Codes.
 */
async function mitCode(req: Request, roh: unknown, pruefen: boolean, jetzt: number): Promise<Response> {
  if (typeof roh !== 'string' || !codeVollstaendig(roh)) return json({ error: 'ungueltig' }, 404)
  const versuch = await versuchBuchen(absenderVon(req))
  if (versuch === 'fehler') return json({ error: 'server-error' }, 503)
  if (versuch === 'gebremst') return json({ error: 'zu-viele' }, 429)
  const code = codeNormal(roh)
  const link = await linkZu('code_hash', code)
  const zugang = link ?? (await einmalZu(code))
  // Unbekannt: Die gebuchte Zeile bleibt stehen — sie ist der Fehlversuch.
  if (!zugang) return json({ error: 'ungueltig' }, 404)
  // Richtig, auch wenn abgelaufen: kein Raten.
  await versuchFreigeben(versuch)
  if (abgelaufen(zugang, jetzt)) return json({ error: 'abgelaufen' }, 410)
  if (pruefen) {
    const person = await personZu(zugang)
    if (!person) return json({ error: 'ungueltig' }, 404)
    return json({ ok: true, name: personDisplayName(person.fn, person.ln), versammlung: await versammlungsName(zugang.congregation_id) })
  }
  if (link) return anmelden(link, jetzt, { linkVermerken: true })
  const eingeloest = await einmalEinloesen(code, jetzt)
  if (eingeloest === 'fehler') return json({ error: 'server-error' }, 500)
  // Zwischen Lesen und Einlösen eben von einem anderen Gerät verbraucht — oder abgelaufen.
  return eingeloest ? anmelden(eingeloest, jetzt, { linkVermerken: false }) : json({ error: 'abgelaufen' }, 410)
}

/** Wer im Profil fragt: das Konto aus der Sitzung und seine Person. */
type Eigene = { personId: string; congregationId: string }

async function eigenePerson(req: Request): Promise<Eigene | Response> {
  const userId = await rest.userId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const mitglied = await rest.get<{ person_id: string | null; congregation_id: string }[]>(
    `members?select=person_id,congregation_id&user_id=eq.${wert(userId)}`,
  )
  const m = mitglied[0]
  // Ein Konto ohne Person (der Betreiber) hat keinen Zettel und keinen Code.
  if (!m?.person_id) return json({ error: 'forbidden' }, 403)
  return { personId: m.person_id, congregationId: m.congregation_id }
}

/**
 * Ein neuer Code, den kein Link trägt — sonst meldete er dessen Person an
 * (gesucht wird erst unter den Links). Bei 40 Bit trifft das kaum je; die
 * Abfrage sichert es trotzdem zu.
 */
async function freierCode(): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    const code = neuerCode()
    if (!(await linkZu('code_hash', code))) return code
  }
  return null
}

/** **Ein Einmal-Code fürs nächste Gerät** — er ersetzt einen noch offenen derselben Person. */
async function einmalCode(req: Request, jetzt: number): Promise<Response> {
  const wer = await eigenePerson(req)
  if (wer instanceof Response) return wer
  const code = await freierCode()
  if (!code) return json({ error: 'server-error' }, 500)
  const gueltigBis = einmalGueltigBis(jetzt)
  const gespeichert = await rest.upsert('anmelde_einmalcodes?on_conflict=person_id', [
    { person_id: wer.personId, congregation_id: wer.congregationId, code_hash: await pruefsumme(code), gueltig_bis: gueltigBis },
  ])
  if (!gespeichert) return json({ error: 'server-error' }, 500)
  return json({ ok: true, code: codeAnzeige(code), zettelUrl: codeUrl(APP_URL, code), gueltigBis })
}

/**
 * **Zugang erneuern**: Link und Zettel (und ein offener Einmal-Code) gelten
 * danach nicht mehr, und die übrigen Geräte werden abgemeldet; dieses bleibt.
 * Erst sperren, dann abmelden — andersherum könnte sich mit dem alten Code
 * dazwischen noch ein Gerät anmelden. Scheitert ein Schritt, sagt es die
 * Antwort; ein zweiter Versuch macht beides noch einmal.
 */
async function erneuern(req: Request): Promise<Response> {
  const wer = await eigenePerson(req)
  if (wer instanceof Response) return wer
  const gesperrt = await Promise.all([
    rest.zeilenSchreiben('DELETE', `anmelde_links?person_id=eq.${wert(wer.personId)}`),
    rest.zeilenSchreiben('DELETE', `anmelde_einmalcodes?person_id=eq.${wert(wer.personId)}`),
  ])
  if (gesperrt.includes(null)) return json({ error: 'server-error' }, 500)
  if (!(await konten.andereAbmelden(req.headers.get('Authorization') ?? ''))) return json({ error: 'server-error' }, 500)
  return json({ ok: true })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const anfrage = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const jetzt = Date.now()
    switch (anfrage?.aktion) {
      case 'link':
        return await mitToken(anfrage.token, jetzt)
      case 'code':
        return await mitCode(req, anfrage.code, anfrage.pruefen === true, jetzt)
      case 'einmalcode':
        return await einmalCode(req, jetzt)
      case 'erneuern':
        return await erneuern(req)
      default:
        return json({ error: 'bad-request' }, 400)
    }
  } catch (err) {
    // Nur in die Logs: Die Meldungen von PostgREST und Auth tragen Pfade und
    // Spalten — dieselbe Linie wie in den übrigen Functions.
    console.error('anmelden:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
