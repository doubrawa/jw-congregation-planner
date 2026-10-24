// =============================================================================
// Supabase Edge Function: send-invite — Anmelde-Links ausstellen und mailen
// =============================================================================
// Der Admin gibt Personen ihren Zugang (T121, Phase 8): je Person ein neuer
// Link — er ersetzt den alten sofort, auch dessen Zettel — und, wo eine Adresse
// dasteht, die E-Mail dazu. Für Personen ohne Adresse kommt der Code für den
// Zettel zurück, für den Fall ohne Versand der Link fürs eigene Mail-Programm.
//
// **Gehärtet gegenüber den Einladungscodes:** Den Link erzeugt die Function
// selbst; vom Client kommen nur Personen-Ids. Bis zum Umbau schickte der
// Client den Code mit, und frei wählbar war damit der Text in der Mail. Die
// Empfängeradresse kommt weiter **immer** aus der Personen-Tabelle der eigenen
// Versammlung — kein offenes Mail-Relay.
//
// Request (mit Nutzer-Sitzung, supabase.functions.invoke):
//   { personIds: string[] (höchstens 200), senden: boolean, lang?: string }
//   lang = App-Sprachcode der Versammlung (die E-Mail geht in ihrer Sprache).
// Response 200:
//   { links: [{ personId, url, zettelUrl, code, gueltigBis, gesendet }], mailBereit }
// 401 { error: 'unauthorized' } · 403 { error: 'forbidden' } · 400 { error: 'bad-request' }
//
// Secrets: RESEND_API_KEY und INVITE_FROM (verifizierte Domain) — fehlt eins,
// geht keine Mail hinaus (`mailBereit: false`). **Wer dann senden will, dem
// stellt die Function nichts aus** (`links: []`): Sonst ersetzten neue Links
// die alten, und keiner käme an — bei „Links senden" für alle auf einmal still
// die ganze Versammlung. Für Zettel und das eigene Mail-Programm fragt der
// Client mit `senden: false`.
// =============================================================================

import { alsGesendet, linkAusstellen } from '../_shared/anmelde-links.ts'
import { linkMail, mailBereit, mailSenden } from '../_shared/anmelde-mail.ts'
import { anmeldeUrl, codeAnzeige, codeUrl } from '../_shared/anmeldung.ts'
import { CORS, json, restKlient, wert } from '../_shared/rest.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'
const MAIL = { apiKey: Deno.env.get('RESEND_API_KEY') ?? '', von: Deno.env.get('INVITE_FROM') ?? '' }
/** Abstand zwischen zwei Mails: Resend nimmt je Sekunde nur wenige an. */
const MAIL_ABSTAND_MS = Number(Deno.env.get('MAIL_ABSTAND_MS') ?? '550')

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

const pause = (ms: number): Promise<void> => new Promise((weiter) => setTimeout(weiter, ms))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    // Erst wer fragt — vor allem anderen, auch vor der Auskunft über den Versand.
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    // Nur Admins; alles Weitere ist auf ihre Versammlung beschränkt.
    const membership = await rest.get<{ congregation_id: string; planner: boolean }[]>(
      `members?select=congregation_id,planner&user_id=eq.${wert(userId)}`,
    )
    const member = membership[0]
    if (!member?.planner) return json({ error: 'forbidden' }, 403)

    const payload = (await req.json().catch(() => null)) as { personIds?: unknown; senden?: unknown; lang?: unknown } | null
    const ids = Array.isArray(payload?.personIds)
      ? [...new Set(payload.personIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))]
      : []
    if (ids.length === 0 || ids.length > 200) return json({ error: 'bad-request' }, 400)
    const senden = payload?.senden === true
    const lang = typeof payload?.lang === 'string' ? payload.lang : null
    const cong = member.congregation_id
    const bereit = mailBereit(MAIL)
    if (senden && !bereit) return json({ links: [], mailBereit: false })

    const [persons, versammlung] = await Promise.all([
      rest.get<{ id: string; fn: string; ln: string; mail: string }[]>(
        `persons?select=id,fn,ln,mail&congregation_id=eq.${wert(cong)}&id=in.(${ids.map(wert).join(',')})`,
      ),
      rest.get<{ name: string }[]>(`congregations?select=name&id=eq.${wert(cong)}`),
    ])
    const personById = new Map(persons.map((p) => [p.id, p]))
    const versammlungName = versammlung[0]?.name ?? ''

    const links: Array<{ personId: string; url: string; zettelUrl: string; code: string; gueltigBis: string; gesendet: boolean }> = []
    let ersteMail = true
    for (const id of ids) {
      // Nur Personen der eigenen Versammlung — eine fremde Id fällt still heraus.
      const person = personById.get(id)
      if (!person) continue
      const neu = await linkAusstellen(rest, person.id, cong)
      if (!neu) continue
      const url = anmeldeUrl(APP_URL, neu.token)
      const code = codeAnzeige(neu.code)
      let gesendet = false
      const adresse = person.mail.trim()
      if (senden && adresse) {
        if (!ersteMail) await pause(MAIL_ABSTAND_MS)
        ersteMail = false
        const mail = linkMail(lang, { person, versammlung: versammlungName, url, code, gueltigBis: neu.gueltigBis })
        gesendet = await mailSenden(MAIL, adresse, mail)
        if (gesendet) await alsGesendet(rest, person.id)
      }
      links.push({ personId: person.id, url, zettelUrl: codeUrl(APP_URL, neu.code), code, gueltigBis: neu.gueltigBis, gesendet })
    }
    return json({ links, mailBereit: bereit })
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort: Die REST-Fehler tragen Pfad und
    // rohen PostgREST-Rumpf, verraten also Tabellen und Spalten.
    console.error('send-invite:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
