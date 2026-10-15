// =============================================================================
// Supabase Edge Function: anmelden — mit Link, mit Code, oder Link per E-Mail
// =============================================================================
// Ein Kennwort gibt es nicht (T121, Phase 8). Wer in die App soll, bekommt vom
// Admin einen Link — per E-Mail oder auf einem Zettel mit QR-Code und einem
// Code zum Eintippen (`send-invite`). Diese Function löst ihn ein.
//
// **Öffentlich**: Wer sich anmelden will, hat noch keine Sitzung. Das Gateway
// lässt den öffentlichen Schlüssel aus dem Bündel durch (`verify_jwt` ist keine
// Mitgliedsprüfung, siehe config.toml); geschützt wird hier selbst — Link und
// Code **sind** der Ausweis, und Raten wird gebremst.
//
// Request (supabase.functions.invoke, ohne Sitzung):
//   { aktion: 'link', token }                  Link aus der E-Mail
//   { aktion: 'code', code, pruefen? }         Code vom Zettel (QR oder getippt);
//                                              `pruefen`: nur Name und Versammlung
//   { aktion: 'mail', email, lang? }           Selbstbedienung „Link senden"
// Response:
//   200 { ok: true, sitzung: { access_token, refresh_token } }   angemeldet
//   200 { ok: true, name, versammlung }                          geprüft
//   200 { ok: true }                                             Mail (immer gleich)
//   200 { error: 'not-configured' }                              Mail ohne Versand
//   404 { error: 'ungueltig' } · 410 { error: 'abgelaufen' } · 429 { error: 'zu-viele' }
//
// **Das Konto entsteht bei der ersten Anmeldung**, mit der Person-Id als Konto-Id
// und einer internen Adresse (`interneAdresse`), ohne Kennwort. „Angemeldet"
// heißt damit weiter: Es gibt eine `members`-Zeile. Die Rechte kommen aus der
// Vormerkung an der Person (Admin, Planer), wie früher über den Einladungscode.
// =============================================================================

import { alsGesendet, LINK_SPALTEN, linkAusstellen, type LinkZeile, tokenErneuern } from '../_shared/anmelde-links.ts'
import { linkMail, mailBereit, mailSenden } from '../_shared/anmelde-mail.ts'
import { anmeldeUrl, codeNormal, codeVollstaendig, interneAdresse, pruefsumme } from '../_shared/anmeldung.ts'
import { kontoAdmin } from '../_shared/konto-admin.ts'
import { personDisplayName } from '../_shared/planung.ts'
import { CORS, json, restKlient, wert } from '../_shared/rest.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}
/** Arbeit nach der Antwort zu Ende bringen — gibt es auf der Plattform, nicht in den Tests. */
declare const EdgeRuntime: { waitUntil(arbeit: Promise<unknown>): void } | undefined

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'
const MAIL = { apiKey: Deno.env.get('RESEND_API_KEY') ?? '', von: Deno.env.get('INVITE_FROM') ?? '' }

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)
const konten = kontoAdmin(SUPABASE_URL, SERVICE_KEY)

/**
 * **Die Bremse gegen Raten.** Ein Code hat 40 Bit; wer ihn erraten will, muss
 * viele Male fragen. Je Absender 20 Fehlversuche in der Stunde, über alle 500 —
 * damit kommt in einem Jahr keiner auch nur in die Nähe eines Treffers. Der Preis:
 * Wer die Grenze für alle ausschöpft, sperrt eine Stunde lang das Anmelden mit
 * Code; Link und E-Mail gehen weiter.
 */
const GRENZE_JE_ABSENDER = 20
const GRENZE_GESAMT = 500
const STUNDE = 3600e3

/** So oft geht höchstens eine Mail je Person hinaus (Selbstbedienung). */
const MAIL_PAUSE = 10 * 60e3

interface PersonZeile {
  id: string
  fn: string
  ln: string
  planner_vorgemerkt: boolean
  zuteiler_vorgemerkt?: boolean
}

function absenderVon(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unbekannt'
}

async function gebremst(absender: string, jetzt: number): Promise<boolean> {
  const seit = wert(new Date(jetzt - STUNDE).toISOString())
  const [eigene, alle] = await Promise.all([
    rest.get<unknown[]>(`anmelde_fehlversuche?select=id&ip=eq.${wert(absender)}&at=gte.${seit}&limit=${GRENZE_JE_ABSENDER}`),
    rest.get<unknown[]>(`anmelde_fehlversuche?select=id&at=gte.${seit}&limit=${GRENZE_GESAMT}`),
  ])
  return eigene.length >= GRENZE_JE_ABSENDER || alle.length >= GRENZE_GESAMT
}

async function fehlversuch(absender: string, jetzt: number): Promise<void> {
  await rest.insert('anmelde_fehlversuche', [{ ip: absender }])
  // Was älter als ein Tag ist, zählt nirgends mehr.
  await rest.send('DELETE', `anmelde_fehlversuche?at=lt.${wert(new Date(jetzt - 24 * STUNDE).toISOString())}`)
}

/** Der Link zu einer Prüfsumme — Token oder Code. */
async function linkZu(spalte: 'token_hash' | 'code_hash', klartext: string): Promise<LinkZeile | undefined> {
  const zeilen = await rest.get<LinkZeile[]>(`anmelde_links?select=${LINK_SPALTEN}&${spalte}=eq.${await pruefsumme(klartext)}`)
  return zeilen[0]
}

const abgelaufen = (link: Pick<LinkZeile, 'gueltig_bis'>, jetzt: number): boolean => new Date(link.gueltig_bis).getTime() <= jetzt

async function personZu(link: LinkZeile): Promise<PersonZeile | undefined> {
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
 * `null`, wenn es nicht ging (die Person ist dann nicht angemeldet).
 */
async function kontoDer(person: PersonZeile, congregationId: string): Promise<{ email: string } | null> {
  const vorhanden = await kontoIdDer(person.id, congregationId)
  if (vorhanden) {
    const konto = await konten.kontoLesen(vorhanden)
    return konto ? { email: konto.email } : null
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
  if (angelegt && angelegt.length > 0) return { email: konto.email }
  // Zwei erste Anmeldungen zugleich (Doppeltipp, Handy und Tablet): Die andere
  // hat die Zeile eben geschrieben, diese prallt daran ab — angemeldet ist sie
  // trotzdem.
  return (await kontoIdDer(person.id, congregationId)) === konto.id ? { email: konto.email } : null
}

/** Mit einem gültigen Link anmelden: Konto sicherstellen, Sitzung ausstellen. */
async function anmelden(link: LinkZeile, jetzt: number): Promise<Response> {
  const person = await personZu(link)
  if (!person) return json({ error: 'ungueltig' }, 404)
  const konto = await kontoDer(person, link.congregation_id)
  if (!konto) return json({ error: 'server-error' }, 500)
  const sitzung = await konten.sitzungFuer(konto.email)
  if (!sitzung) return json({ error: 'server-error' }, 500)
  await rest.send('PATCH', `anmelde_links?person_id=eq.${wert(person.id)}`, { benutzt_at: new Date(jetzt).toISOString() })
  return json({ ok: true, sitzung })
}

async function mitToken(token: unknown, jetzt: number): Promise<Response> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return json({ error: 'ungueltig' }, 404)
  const link = await linkZu('token_hash', token)
  if (!link) return json({ error: 'ungueltig' }, 404)
  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)
  return anmelden(link, jetzt)
}

async function mitCode(req: Request, roh: unknown, pruefen: boolean, jetzt: number): Promise<Response> {
  if (typeof roh !== 'string' || !codeVollstaendig(roh)) return json({ error: 'ungueltig' }, 404)
  const absender = absenderVon(req)
  if (await gebremst(absender, jetzt)) return json({ error: 'zu-viele' }, 429)
  const link = await linkZu('code_hash', codeNormal(roh))
  if (!link) {
    await fehlversuch(absender, jetzt)
    return json({ error: 'ungueltig' }, 404)
  }
  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)
  if (!pruefen) return anmelden(link, jetzt)
  const person = await personZu(link)
  if (!person) return json({ error: 'ungueltig' }, 404)
  return json({ ok: true, name: personDisplayName(person.fn, person.ln), versammlung: await versammlungsName(link.congregation_id) })
}

/** Eine Adresse, wie sie in `persons.mail` steht — nur in der Form geprüft. */
function adresseVon(roh: unknown): string | null {
  if (typeof roh !== 'string') return null
  const adresse = roh.trim().toLowerCase()
  // `*` und `%` wären Platzhalter in der Abfrage unten — keine Adresse enthält sie.
  return adresse.length <= 254 && /^[^\s@*%]+@[^\s@*%]+\.[^\s@*%]+$/.test(adresse) ? adresse : null
}

/**
 * **„Link senden" auf der Anmeldeseite.** Jede Person mit dieser Adresse, die
 * schon ein Konto oder einen Link hat, bekommt ihren eigenen Link — zwei, die
 * sich eine Adresse teilen, also zwei Mails. Wen der Admin noch nicht
 * hereingelassen hat, der bekommt nichts: Den ersten Link stellt er aus.
 *
 * Die Antwort ist immer dieselbe, gleich ob es die Adresse gibt — sonst ließe
 * sich hier nachsehen, wer zu einer Versammlung gehört. **Und sie kommt gleich
 * schnell:** Gesucht und gesendet wird erst nach der Antwort
 * (`EdgeRuntime.waitUntil`). Bis zum 15.10.2026 wartete sie auf beides, und
 * eine Adresse, an die eine Mail hinausging, brauchte merklich länger als eine
 * unbekannte — die Dauer verriet, was der Text verschwieg.
 */
async function perMail(roh: unknown, lang: unknown, jetzt: number): Promise<Response> {
  if (!mailBereit(MAIL)) return json({ error: 'not-configured' })
  const adresse = adresseVon(roh)
  if (!adresse) return json({ error: 'bad-request' }, 400)
  const arbeit = linksPerMail(adresse, typeof lang === 'string' ? lang : null, jetzt).catch((err: unknown) => {
    console.error('anmelden (mail):', err instanceof Error ? err.message : String(err))
  })
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(arbeit)
  else await arbeit
  return json({ ok: true })
}

/** Die Links der Personen mit dieser Adresse erneuern und schicken (siehe `perMail`). */
async function linksPerMail(adresse: string, sprache: string | null, jetzt: number): Promise<void> {
  // Groß und klein egal (`ilike`), sonst genau diese Adresse: `_` ist im Muster
  // ein Platzhalter für ein Zeichen und wird deshalb maskiert; `%` und `*`
  // lässt `adresseVon` gar nicht erst durch.
  const muster = adresse.replace(/_/g, '\\_')
  const kandidaten = await rest.get<{ id: string; fn: string; mail: string; congregation_id: string }[]>(
    `persons?select=id,fn,mail,congregation_id&mail=ilike.${wert(muster)}&limit=10`,
  )
  if (kandidaten.length === 0) return

  const ids = kandidaten.map((p) => wert(p.id)).join(',')
  const [links, mitglieder] = await Promise.all([
    rest.get<LinkZeile[]>(`anmelde_links?select=${LINK_SPALTEN}&person_id=in.(${ids})`),
    rest.get<{ person_id: string }[]>(`members?select=person_id&person_id=in.(${ids})`),
  ])
  const linkVon = new Map(links.map((l) => [l.person_id, l]))
  const mitKonto = new Set(mitglieder.map((m) => m.person_id))
  // Teilen sich zwei eine Adresse, sind sie meist in derselben Versammlung — ihr Name einmal geholt.
  const namen = new Map<string, Promise<string>>()
  const versammlungVon = (id: string): Promise<string> => {
    const name = namen.get(id) ?? versammlungsName(id)
    namen.set(id, name)
    return name
  }

  for (const person of kandidaten) {
    const link = linkVon.get(person.id)
    if (!link && !mitKonto.has(person.id)) continue
    if (link?.gesendet_at && jetzt - new Date(link.gesendet_at).getTime() < MAIL_PAUSE) continue
    const neu = link ? await tokenErneuern(rest, link, new Date(jetzt)) : await linkAusstellen(rest, person.id, person.congregation_id, new Date(jetzt))
    if (!neu) continue
    const mail = linkMail(sprache, {
      name: person.fn,
      versammlung: await versammlungVon(person.congregation_id),
      url: anmeldeUrl(APP_URL, neu.token),
      gueltigBis: neu.gueltigBis,
    })
    if (await mailSenden(MAIL, adresse, mail)) await alsGesendet(rest, person.id, new Date(jetzt))
  }
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
      case 'mail':
        return await perMail(anfrage.email, anfrage.lang, jetzt)
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
