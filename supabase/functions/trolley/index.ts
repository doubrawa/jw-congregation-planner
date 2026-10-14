// =============================================================================
// Supabase Edge Function: trolley — Trolley-Termine (T121, Phase 7)
// =============================================================================
// Vier Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { aktion: 'eintragen', termin: { id, trolleyId, datum, von, bis, partner }, heute? }
//     Die eigene Person trägt sich ein — mit Partner, den sie gleich mit
//     einträgt, oder allein („Partner gesucht", `partner: null`). Der Partner
//     bekommt „Für den Trolley eingetragen".
//
//   { aktion: 'dazukommen', id, heute? }
//     Zu einem Termin, bei dem jemand einen Partner sucht. Wer gesucht hat,
//     bekommt „Partner gefunden".
//
//   { aktion: 'austragen', id, heute? }
//     Sich austragen. Bleibt der andere, sucht er wieder einen Partner
//     (`wasBleibt`) und bekommt „Trolley-Termin abgesagt".
//
//   { aktion: 'entfernen', trolleyId, heute? }
//     Der Admin entfernt einen Trolley — auch ohne eigene Person. Seine Termine
//     gehen mit; wer für einen kommenden eingetragen war, bekommt
//     „Trolley-Termin entfällt".
//
// Antwort: `{ ok: true, termin }` mit dem Termin, wie er jetzt dasteht (`null`:
// er ist weg), sonst `{ error }` — der Grund, den die App nennt:
//   kein-recht          dem Aufrufer fehlt das Trolley-Recht
//   partner-ohne-recht  dem Partner fehlt es
//   vorbei              der Tag ist um
//   belegt              der Trolley ist zu der Zeit schon unterwegs
//   doppelt             der Aufrufer ist zu der Zeit schon eingetragen
//   partner-doppelt     der Partner ist es
//   schon-partner       beim Dazukommen war jemand schneller
//   weg                 Termin oder Trolley gibt es nicht (mehr)
//   stand               die Datenbank hat abgewiesen — zwei zugleich; die
//                       App lädt nach und zeigt, wer schneller war
//
// WARUM EINE FUNCTION und keine Richtlinie: Jede der vier Aktionen sagt einem
// anderen etwas — dem Partner, dem, der gesucht hat, dem, der bleibt. Eine
// Mitteilung, die das Gerät eines Mitglieds selbst auslöste, könnte jeder mit
// beliebigem Inhalt an jeden schicken. Hier steht beides an einem Ort: die
// Änderung und, wem sie gilt. Die Datenbank prüft die Zeiten unter Sperre ein
// zweites Mal (`trolley_termin_pruefen`).
//
// Sicherheit: Aufrufer muss per JWT eingeloggt sein. Die Versammlung und die
// eigene Person kommen aus seiner Mitgliedszeile, nie aus dem Rumpf; jeder Wert
// geht durch `wert()` in den Pfad.
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
//   send-plan), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
//
// Deploy:  npx supabase functions deploy trolley --project-ref <ref>
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { abbestellerFuer, vapidSetzen, type Zustellung, zustellen } from '../_shared/push.ts'
import { heuteUtc, kurzeZeit, personDisplayName } from '../_shared/planung.ts'
import { abosJeKonto, kontoAufloeser } from '../_shared/konten.ts'
import { trolleyRumpf, ueberschneiden, wasBleibt, zeitraumGueltig } from '../_shared/trolley.ts'
import { type SubscriptionRow, uebersetzerFuer } from '../_shared/zuteilungen.ts'
import { type TrolleyTexte, trolleyTexte } from './texte.ts'

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

/** Ein Tipp auf die Nachricht führt zu den eigenen Aufgaben — dort steht der Termin. */
const ZIEL = `${APP_URL}#go=aufgaben`

/** Die Spalten eines Termins, wie die App sie liest. */
const SPALTEN = 'id,trolley_id,datum,von,bis,person_id,partner_id,gemeinsam'

interface TerminRow {
  id: string
  trolley_id: string
  datum: string
  von: string
  bis: string
  person_id: string
  partner_id: string | null
  gemeinsam: boolean
}

interface PersonRow {
  id: string
  fn: string
  ln: string
  priv?: Record<string, boolean> | null
}

/** Die Datenbank liefert `time` mit Sekunden („09:00:00"); App und Rumpf führen „09:00". */
function kurz(t: TerminRow): TerminRow {
  return { ...t, von: kurzeZeit(t.von, t.von), bis: kurzeZeit(t.bis, t.bis) }
}

/** Ein Grund, der zur App zurückgeht. Fachliche Abweisungen sind 409, Rechte 403. */
function nein(grund: string): Response {
  const status = grund === 'kein-recht' || grund === 'forbidden' ? 403 : grund === 'bad-request' ? 400 : 409
  return json({ error: grund }, status)
}

const darfTrolley = (p: PersonRow | undefined): boolean => Boolean(p?.priv?.zeugnis)
const istTag = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const istKennung = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 80

/** Wer sich ein- oder austrägt: die Versammlung und die eigene Person. */
interface Aufrufer {
  cong: string
  ich: PersonRow
}

/** Wer einen Trolley entfernt: Admin oder nicht — eine eigene Person braucht es dafür nicht. */
interface Verwalter {
  cong: string
  admin: boolean
  ichId: string | null
}

/* ---- Mitteilungen ---------------------------------------------------------- */

/** Was einer Person gesagt wird: welche Art, über welchen Termin, mit welchem Rumpf (kanonisch deutsch). */
interface Meldung {
  pid: string
  art: keyof TrolleyTexte
  termin: string
  rumpf: string
}

/**
 * **Glocke und Push** an die Betroffenen — die Glocke kanonisch deutsch (sie
 * übersetzt beim Anzeigen, `NOTIF_TITLE_KEY`), der Push je Gerätesprache
 * fertig gebaut. Erst die Glocke, dann der Push: Wer auf die Benachrichtigung
 * tippt, landet in einer App, in der die Zeile schon steht.
 *
 * Wer kein Konto hat, bekommt nichts — ihm sagt es der andere persönlich; die
 * App nennt ihn deshalb beim Eintragen nicht anders als sonst.
 */
async function melden(cong: string, meldungen: readonly Meldung[]): Promise<void> {
  if (meldungen.length === 0) return
  const [members, persons, subs] = await Promise.all([
    rest.get<{ user_id: string; person_id: string | null }[]>(
      `members?select=user_id,person_id&congregation_id=eq.${wert(cong)}`,
    ),
    rest.get<PersonRow[]>(`persons?select=id,fn,ln&congregation_id=eq.${wert(cong)}`),
    rest.get<SubscriptionRow[]>(
      `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${wert(cong)}`,
    ),
  ])
  const kontoFuer = kontoAufloeser(members, persons)
  const abos = abosJeKonto(subs)
  const zustellbar = meldungen.flatMap((m) => {
    const userId = kontoFuer(m.pid, '')
    return userId ? [{ ...m, userId }] : []
  })
  if (zustellbar.length === 0) return

  await rest.insert(
    'notifications',
    zustellbar.map((m) => ({
      congregation_id: cong,
      user_id: m.userId,
      type: 'zuteilung',
      title: trolleyTexte('de')[m.art],
      body: m.rumpf,
    })),
  )
  if (!vapidSetzen(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)) return
  const trFuer = uebersetzerFuer()
  const zustellungen: Zustellung[] = zustellbar.flatMap((m) =>
    (abos.get(m.userId) ?? []).map((abo) => ({
      abo,
      titel: trolleyTexte(abo.lang)[m.art],
      body: trFuer(abo.lang)(m.rumpf),
      url: ZIEL,
      // Jede Meldung gilt für sich: Zwei Termine mit demselben Titel dürfen
      // sich auf dem Sperrbildschirm nicht verdrängen (`Zustellung.tag`).
      tag: `trolley|${m.termin}|${m.art}`,
    })),
  )
  await zustellen(zustellungen, abbestellerFuer(rest))
}

/* ---- Lesen ----------------------------------------------------------------- */

async function terminLesen(cong: string, id: string): Promise<TerminRow | undefined> {
  const rows = await rest.get<TerminRow[]>(
    `trolley_termine?select=${SPALTEN}&id=eq.${wert(id)}&congregation_id=eq.${wert(cong)}`,
  )
  return rows[0] ? kurz(rows[0]) : undefined
}

async function trolleyName(cong: string, id: string): Promise<string | undefined> {
  const rows = await rest.get<{ name: string }[]>(
    `trolleys?select=name&id=eq.${wert(id)}&congregation_id=eq.${wert(cong)}`,
  )
  return rows[0]?.name
}

/** Die Termine eines Tages — für die Prüfung auf Überschneidungen. */
async function termineAm(cong: string, datum: string): Promise<TerminRow[]> {
  const rows = await rest.get<TerminRow[]>(
    `trolley_termine?select=${SPALTEN}&congregation_id=eq.${wert(cong)}&datum=eq.${wert(datum)}`,
  )
  return rows.map(kurz)
}

/** Ist diese Person zu der Zeit schon irgendwo eingetragen (außer im Termin `ausser`)? */
function schonUnterwegs(termine: readonly TerminRow[], pid: string, zeit: TerminRow, ausser?: string): boolean {
  return termine.some(
    (t) => t.id !== ausser && (t.person_id === pid || t.partner_id === pid) && ueberschneiden(t, zeit),
  )
}

const nameVon = (p: PersonRow): string => personDisplayName(p.fn, p.ln)

/* ---- Aktionen -------------------------------------------------------------- */

interface Eintrag {
  id?: unknown
  trolleyId?: unknown
  datum?: unknown
  von?: unknown
  bis?: unknown
  partner?: unknown
}

async function eintragen(a: Aufrufer, roh: Eintrag | undefined, heute: string): Promise<Response> {
  const { id, trolleyId, datum, von, bis } = roh ?? {}
  const partner = roh?.partner ?? null
  if (!istKennung(id) || !istKennung(trolleyId) || !istTag(datum)) return nein('bad-request')
  if (typeof von !== 'string' || typeof bis !== 'string' || !zeitraumGueltig(von, bis)) return nein('bad-request')
  if (partner !== null && (!istKennung(partner) || partner === a.ich.id)) return nein('bad-request')
  if (!darfTrolley(a.ich)) return nein('kein-recht')
  if (datum < heute) return nein('vorbei')

  const [name, partnerRows, amTag] = await Promise.all([
    trolleyName(a.cong, trolleyId),
    partner
      ? rest.get<PersonRow[]>(`persons?select=id,fn,ln,priv&id=eq.${wert(partner)}&congregation_id=eq.${wert(a.cong)}`)
      : Promise.resolve([] as PersonRow[]),
    termineAm(a.cong, datum),
  ])
  if (name === undefined) return nein('weg')
  if (partner && !partnerRows[0]) return nein('weg')
  if (partner && !darfTrolley(partnerRows[0])) return nein('partner-ohne-recht')

  const neu: TerminRow = {
    id,
    trolley_id: trolleyId,
    datum,
    von,
    bis,
    person_id: a.ich.id,
    partner_id: partner,
    gemeinsam: partner !== null,
  }
  if (amTag.some((t) => t.trolley_id === trolleyId && ueberschneiden(t, neu))) return nein('belegt')
  if (schonUnterwegs(amTag, a.ich.id, neu)) return nein('doppelt')
  if (partner && schonUnterwegs(amTag, partner, neu)) return nein('partner-doppelt')

  const zeilen = await rest.zeilenSchreiben<TerminRow>('POST', `trolley_termine?select=${SPALTEN}`, [
    { ...neu, congregation_id: a.cong },
  ])
  if (!zeilen?.[0]) return nein('stand')

  if (partner) {
    await melden(a.cong, [
      {
        pid: partner,
        art: 'eingetragen',
        termin: id,
        rumpf: trolleyRumpf({ trolley: name, datum, von, bis, person: nameVon(a.ich) }),
      },
    ])
  }
  return json({ ok: true, termin: kurz(zeilen[0]) })
}

async function dazukommen(a: Aufrufer, id: unknown, heute: string): Promise<Response> {
  if (!istKennung(id)) return nein('bad-request')
  if (!darfTrolley(a.ich)) return nein('kein-recht')
  const termin = await terminLesen(a.cong, id)
  if (!termin) return nein('weg')
  if (termin.person_id === a.ich.id) return nein('bad-request')
  if (termin.datum < heute) return nein('vorbei')
  if (termin.partner_id !== null) return nein('schon-partner')
  if (schonUnterwegs(await termineAm(a.cong, termin.datum), a.ich.id, termin, termin.id)) return nein('doppelt')

  // Bedingt: nur, solange noch niemand dazugekommen ist. Zwei zugleich — der
  // Zweite trifft keine Zeile mehr.
  const zeilen = await rest.patchZeilen<TerminRow>(
    `trolley_termine?id=eq.${wert(id)}&congregation_id=eq.${wert(a.cong)}&partner_id=is.null&select=${SPALTEN}`,
    { partner_id: a.ich.id, gemeinsam: false },
  )
  if (zeilen === null) return nein('stand')
  if (!zeilen[0]) return nein('schon-partner')

  const name = (await trolleyName(a.cong, termin.trolley_id)) ?? ''
  await melden(a.cong, [
    {
      pid: termin.person_id,
      art: 'dazu',
      termin: termin.id,
      rumpf: trolleyRumpf({ trolley: name, datum: termin.datum, von: termin.von, bis: termin.bis, person: nameVon(a.ich) }),
    },
  ])
  return json({ ok: true, termin: kurz(zeilen[0]) })
}

async function austragen(a: Aufrufer, id: unknown, heute: string): Promise<Response> {
  if (!istKennung(id)) return nein('bad-request')
  const termin = await terminLesen(a.cong, id)
  if (!termin) return nein('weg')
  const bleibt = wasBleibt(termin.person_id, termin.partner_id, a.ich.id)
  if (bleibt === undefined) return nein('forbidden')
  if (termin.datum < heute) return nein('vorbei')

  // Bedingt auf den gelesenen Stand: Hat sich inzwischen etwas geändert (der
  // andere hat sich auch ausgetragen, jemand ist dazugekommen), trifft der
  // Filter nichts, und die App lädt nach.
  const stand =
    `trolley_termine?id=eq.${wert(id)}&congregation_id=eq.${wert(a.cong)}` +
    `&person_id=eq.${wert(termin.person_id)}` +
    (termin.partner_id ? `&partner_id=eq.${wert(termin.partner_id)}` : '&partner_id=is.null') +
    `&select=${SPALTEN}`
  const zeilen = bleibt
    ? await rest.patchZeilen<TerminRow>(stand, { person_id: bleibt.person, partner_id: null, gemeinsam: false })
    : await rest.zeilenSchreiben<TerminRow>('DELETE', stand)
  if (!zeilen?.[0]) return nein('stand')

  if (bleibt) {
    const name = (await trolleyName(a.cong, termin.trolley_id)) ?? ''
    await melden(a.cong, [
      {
        pid: bleibt.person,
        art: 'abgesagt',
        termin: termin.id,
        rumpf: trolleyRumpf({ trolley: name, datum: termin.datum, von: termin.von, bis: termin.bis, person: nameVon(a.ich) }),
      },
    ])
  }
  return json({ ok: true, termin: bleibt ? kurz(zeilen[0]) : null })
}

async function entfernen(a: Verwalter, trolleyId: unknown, heute: string): Promise<Response> {
  if (!istKennung(trolleyId)) return nein('bad-request')
  if (!a.admin) return nein('forbidden')
  const name = await trolleyName(a.cong, trolleyId)
  if (name === undefined) return nein('weg')
  const kommende = (
    await rest.get<TerminRow[]>(
      `trolley_termine?select=${SPALTEN}&congregation_id=eq.${wert(a.cong)}` +
        `&trolley_id=eq.${wert(trolleyId)}&datum=gte.${wert(heute)}`,
    )
  ).map(kurz)

  const weg = await rest.zeilenSchreiben<{ id: string }>(
    'DELETE',
    `trolleys?id=eq.${wert(trolleyId)}&congregation_id=eq.${wert(a.cong)}&select=id`,
  )
  if (!weg?.[0]) return nein('stand')

  // Wer selbst entfernt, weiß es schon.
  await melden(
    a.cong,
    kommende.flatMap((t) =>
      [t.person_id, t.partner_id]
        .filter((pid): pid is string => pid !== null && pid !== a.ichId)
        .map((pid) => ({
          pid,
          art: 'entfaellt' as const,
          termin: t.id,
          rumpf: trolleyRumpf({ trolley: name, datum: t.datum, von: t.von, bis: t.bis }),
        })),
    ),
  )
  return json({ ok: true, termine: kommende.length })
}

/* ---- Handler --------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    const payload = (await req.json().catch(() => null)) as {
      aktion?: string
      termin?: Eintrag
      id?: unknown
      trolleyId?: unknown
      heute?: string
    } | null
    if (!payload?.aktion) return nein('bad-request')

    // Versammlung und eigene Person aus der eigenen Mitgliedszeile.
    const eigene = await rest.get<{ person_id: string | null; planner: boolean; congregation_id: string }[]>(
      `members?select=person_id,planner,congregation_id&user_id=eq.${wert(userId)}`,
    )
    const mich = eigene[0]
    if (!mich?.congregation_id) return json({ error: 'no-congregation' }, 403)
    // Der Kalendertag des Geräts, wenn er zum Server passt (`heuteUtc`).
    const heute = new Date(heuteUtc(payload.heute)).toISOString().slice(0, 10)
    // Einen Trolley entfernt der Admin auch ohne eigene Person.
    if (payload.aktion === 'entfernen') {
      return await entfernen({ cong: mich.congregation_id, admin: mich.planner, ichId: mich.person_id }, payload.trolleyId, heute)
    }

    if (!mich.person_id) return json({ error: 'no-person' }, 403)
    const personen = await rest.get<PersonRow[]>(
      `persons?select=id,fn,ln,priv&id=eq.${wert(mich.person_id)}&congregation_id=eq.${wert(mich.congregation_id)}`,
    )
    if (!personen[0]) return json({ error: 'no-person' }, 403)
    const a: Aufrufer = { cong: mich.congregation_id, ich: personen[0] }
    switch (payload.aktion) {
      case 'eintragen':
        return await eintragen(a, payload.termin, heute)
      case 'dazukommen':
        return await dazukommen(a, payload.id, heute)
      case 'austragen':
        return await austragen(a, payload.id, heute)
      default:
        return nein('bad-request')
    }
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort — wie in den übrigen Functions.
    console.error('trolley:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
