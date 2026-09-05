// =============================================================================
// Supabase Edge Function: substitute — Ersatz für Hilfsdienste
// =============================================================================
// Zwei Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { action: 'seek', congregationId, taskKey }
//     Nach „Ich kann nicht" bei einem Hilfsdienst: benachrichtigt alle
//     qualifizierten Personen (gleicher Dienst, in der Woche nicht abwesend)
//     per In-App-Mitteilung + Web-Push, dass ein Ersatz gesucht wird.
//     Auslösen darf nur, wer in dem Slot steht oder für ihn abgesagt hat.
//
//   { action: 'take', congregationId, taskKey }
//     Jemand springt ein: trägt den Aufrufer in den Hilfsdienst-Slot ein
//     (Woche wird aktualisiert), setzt seine Bestätigung, entfernt die alte
//     Bestätigung und informiert Ursprungsperson + Planer (In-App + Push).
//     Läuft mit Service-Role, weil Wochen/Bestätigungen nur der Planer schreibt.
//     Der Slot wird bedingt geschrieben (409, wenn jemand schneller war).
//
// Beide Aktionen weisen eine **ausgefallene** Zusammenkunft ab (T30, 409
// 'meeting-cancelled'): dort ist nichts zu vertreten. Die App zeigt solche
// Aufgaben gar nicht erst an — hier landet nur, wer den Ausfall noch nicht
// gesehen hat.
//
// Sicherheit: Aufrufer muss per JWT eingeloggtes Mitglied sein; für 'take'
// zusätzlich für den Dienst qualifiziert, und es muss überhaupt ein Ersatz
// gesucht sein. Die **Versammlung kommt aus der eigenen Mitgliedszeile**, nie
// aus dem Rumpf (siehe `congregationId` unten) — alle DB-Zugriffe sind darauf
// gescoped, und jeder Wert geht durch `wert()` in den Pfad.
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
//   send-reminders), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
//
// Deploy:  npx supabase functions deploy substitute
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { abbestellerFuer, vapidSetzen, type Zustellung, zustellen } from '../_shared/push.ts'
import {
  type Abweichungen,
  istAusgefallenFuer,
  meetingDayOffsets,
  meetingTimesOf,
  personDisplayName,
  terminText,
  versatzMitAbweichung,
  zeitMitAbweichung,
} from '../_shared/planung.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { substituteTexte, TITEL_GEFUNDEN, TITEL_GESUCHT } from './texte.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.org'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://doubrawa.github.io/jw-congregation-planner/'
const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

/* ---- Datenmodell (Teilmengen) ---- */
interface Slot {
  name?: string
  pid?: string
}
interface Meeting {
  date?: string
  helpers?: Record<string, Slot[]>
}
interface Week {
  start?: string
  mid?: Meeting
  we?: Meeting
  /**
   * Abweichungen dieser Woche — verlegter Tag, andere Uhrzeit, Ausfall (T30).
   * Ohne sie rechnete die Ersatzsuche am regulären Wochentag und prüfte die
   * Abwesenheit am falschen Datum; `send-reminders` liest sie längst.
   */
  dev?: Abweichungen
}
interface Person {
  id: string
  fn: string
  ln: string
  dn: string
  priv: Record<string, boolean>
}
interface Absence {
  person_id: string | null
  from_date: string
  to_date: string
}

/* `meetingDayOffsets`, `WEEKDAY_OFFSET` und `displayName` stehen jetzt in
   `_shared/planung.ts` — dieselbe Rechnung wie in send-reminders und im
   Client. Getrennte Kopien hatten schon einmal auseinandergefunden (B8/T40). */

/*
 * Der Wochentag-Versatz stand hier als eigene Fassung — und kannte als einzige
 * der drei die Abweichungen nicht (T30). Verlegte der Planer eine
 * Zusammenkunft, prüfte die Ersatzsuche die Abwesenheit am regulären Tag und
 * bot jemanden an, der am echten fehlt. Jetzt gilt `versatzMitAbweichung` aus
 * `_shared/planung.ts`, dieselbe Rangfolge wie im Client und in
 * send-reminders: Abweichung → eigener Termin im `date`-Feld → Rhythmus.
 */

/** ISO-Tag der Zusammenkunft aus dem Wochenstart; null ohne Startdatum. */
function meetingISO(startISO: string | undefined, offset: number): string | null {
  if (!startISO) return null
  const ms = Date.parse(startISO)
  if (Number.isNaN(ms)) return null
  return new Date(ms + offset * 864e5).toISOString().slice(0, 10)
}

/**
 * Wer an diesem Tag fehlt — einmal je Anfrage, nicht je Person.
 *
 * Abwesenheiten sammeln sich unbegrenzt an; die Frage gilt aber genau einem
 * Tag. Ein Durchgang baut die Menge, danach ist die Auskunft ein Nachschlagen.
 * Ohne Tag (Vorlagenwoche) fehlt niemand.
 */
function abwesendeAm(absences: Absence[], tagISO: string | null): ReadonlySet<string> {
  if (!tagISO) return new Set()
  const out = new Set<string>()
  for (const a of absences) {
    // Ohne Person gehört die Abwesenheit niemandem: Sie kam von einem Konto
    // ohne verknüpfte Person, oder die Person wurde gelöscht (`on delete set
    // null`). Der Client zieht dieselbe Grenze (`absence.ts`); hier landete
    // stattdessen ein `null` in einer Menge von Kennungen — wirkungslos, weil
    // keine Id darauf passt, aber eben auch nur zufällig.
    if (!a.person_id) continue
    if (a.from_date <= tagISO && tagISO <= a.to_date) out.add(a.person_id)
  }
  return out
}
interface Member {
  user_id: string
  person_id: string | null
  planner: boolean
}
interface Sub {
  /** Primärschlüssel — darüber wird ein abgelaufenes Abo abbestellt. */
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  /** App-Sprache dieses Geraets (migration-014); null = Deutsch. */
  lang: string | null
}

const displayName = (p: Person): string => personDisplayName(p.fn, p.ln, p.dn)

/**
 * Zerlegt einen Hilfsdienst-Schluessel.
 *
 * Vorn steht seit T66 der **Montag der Woche** ("2026-09-07"). Die frueheren
 * Positions-Schluessel wurden eine Zeit lang mitgelesen; seit Stufe 3 nicht
 * mehr -- migration-018 hat sie umgeschrieben und `weeks.position` geloescht,
 * die Spalte, ueber die sie ueberhaupt zu finden waren. Ein Schluessel ohne
 * Kennung bezeichnet damit keine Woche und wird abgewiesen.
 */
function parseKey(
  key: string,
): { woche: string; tab: 'mid' | 'we'; svc: string; pos: number } | null {
  const p = key.split('|')
  if (p.length !== 5 || p[2] !== 'helper' || (p[1] !== 'mid' && p[1] !== 'we')) return null
  const woche = p[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(woche)) return null
  return { woche, tab: p[1], svc: p[3], pos: Number(p[4]) }
}

/**
 * Push an eine Menge von Abos — Titel je **Gerätesprache**, nicht je Nutzer:
 * Die Sprache hängt am Abo. Der Anfragende wartet auf diesen Versand, deshalb
 * gebündelt statt nacheinander (das übernimmt `zustellen`).
 */
async function pushTo(
  subs: Sub[],
  titel: (lang: string | null) => string,
  body: string,
  url: string,
  tag?: string,
): Promise<void> {
  if (!vapidSetzen(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)) return
  const zustellungen: Zustellung[] = subs.map((s) => ({
    abo: s,
    titel: titel(s.lang),
    body,
    url,
    ...(tag ? { tag } : {}),
  }))
  await zustellen(zustellungen, abbestellerFuer(rest))
}

/** In-App-Mitteilung + Push (mit Deep-Link-Ziel) an eine Menge von Nutzern. */
async function notifyUsers(
  cong: string,
  userIds: string[],
  subsByUser: Map<string, Sub[]>,
  /** Kanonisch deutscher Titel — Schluessel, unter dem die Glocke uebersetzt. */
  titel: string,
  /** Titel je Geraetesprache fuer den Push. */
  pushTitel: (lang: string | null) => string,
  body: string,
  url: string,
  /**
   * Aufgabe, um die es geht (migration-020). Damit laesst sich die Zeile
   * spaeter wiederfinden — „Ersatz gesucht" blieb sonst in der Glocke aller
   * Qualifizierten stehen, auch wenn laengst jemand eingesprungen war (T86).
   */
  taskKey?: string,
  /**
   * Bündelung auf dem Sperrbildschirm (`Zustellung.tag`).
   *
   * Ohne Angabe bündelt der Service Worker nach dem **Titel** — und der ist bei
   * beiden Meldungen dieser Function für jede Aufgabe derselbe. Zwei offene
   * Ersatzgesuche verdrängten sich dadurch gegenseitig: Wer beide betreuen
   * könnte, sah nur das jüngere. Deshalb je Aufgabe ein eigener Schlüssel.
   */
  pushTag?: string,
): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  // In der Glocke steht der kanonisch deutsche Titel; NOTIF_TITLE_KEY bringt
  // ihn beim Anzeigen in die Sprache des Lesers. Der Rumpf besteht aus
  // ' · '-Atomen (Dienst, Termin, Name), die der Fragment-Uebersetzer erledigt.
  await rest.send(
    'POST',
    'notifications',
    ids.map((user_id) => ({
      congregation_id: cong,
      user_id,
      type: 'zuteilung',
      title: titel,
      body,
      ...(taskKey ? { task_key: taskKey } : {}),
    })),
  )
  await pushTo(ids.flatMap((u) => subsByUser.get(u) ?? []), pushTitel, body, url, pushTag)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    const payload = (await req.json().catch(() => null)) as {
      action?: string
      /**
       * Wird **nicht ausgewertet** — die Versammlung stammt aus der
       * Mitgliedszeile des Aufrufers (unten).
       *
       * Vorher hing daran alles: Der Rumpfwert ging ungeprüft in jeden
       * REST-Pfad, und ein angehängtes `#` schnitt die nachfolgenden Filter ab
       * (siehe `wert()`). Ein einfaches Mitglied konnte damit die Wochen der
       * ganzen Versammlung überschreiben und sämtliche Bestätigungen und
       * Mitteilungen löschen — alles mit Service-Role, also an RLS vorbei.
       * Ein zweiter Weg zur selben Auskunft ist immer der schwächere: Der
       * Aufrufer hat ohnehin genau eine Versammlung, also wird sie gelesen,
       * nicht geglaubt. So macht es `send-invite` seit jeher.
       *
       * Das Feld steht hier nur noch als **Duldung**: Der Client schickt es
       * seit dem 24.8.2026 nicht mehr, aber eine App, die als PWA installiert
       * ist, kann eine ältere Fassung im Cache haben. Ihr Aufruf soll
       * funktionieren, nicht an einem überzähligen Feld scheitern.
       */
      congregationId?: string
      taskKey?: string
    } | null
    const parts = parseKey(payload?.taskKey ?? '')
    if (!parts || (payload?.action !== 'seek' && payload?.action !== 'take')) {
      return json({ error: 'bad-request' }, 400)
    }

    const eigene = await rest.get<(Member & { congregation_id: string })[]>(
      `members?select=user_id,person_id,planner,congregation_id&user_id=eq.${wert(userId)}`,
    )
    const caller = eigene[0]
    if (!caller) return json({ error: 'forbidden' }, 403)
    const cong = caller.congregation_id

    const [members, weekRows, services, persons, subsRows, congRows, absences] = await Promise.all([
      rest.get<Member[]>(
        `members?select=user_id,person_id,planner&congregation_id=eq.${wert(cong)}`,
      ),
      // `start` aus der **Spalte**, nicht aus dem Blob (T66): die Kennung steht
      // dort, `data.start` ist nur noch Beifang und könnte jederzeit wegfallen.
      rest.get<{ start: string; data: Week }[]>(
        `weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=eq.${wert(parts.woche)}`,
      ),
      rest.get<{ key: string; name: string }[]>(
        `services?select=key,name&congregation_id=eq.${wert(cong)}`,
      ),
      rest.get<Person[]>(`persons?select=id,fn,ln,dn,priv&congregation_id=eq.${wert(cong)}`),
      rest.get<Sub[]>(
        `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${wert(cong)}`,
      ),
      rest.get<{ meeting_times: string }[]>(
        `congregations?select=meeting_times&id=eq.${wert(cong)}`,
      ),
      rest.get<Absence[]>(
        `absences?select=person_id,from_date,to_date&congregation_id=eq.${wert(cong)}`,
      ),
    ])
    const week = weekRows[0]?.data
    const meeting = week?.[parts.tab]
    const slot = meeting?.helpers?.[parts.svc]?.[parts.pos]
    if (!week || !meeting || !slot) return json({ error: 'slot-not-found' }, 404)
    // Entfällt die Zusammenkunft, gibt es nichts zu vertreten (T30): weder
    // jemanden zu suchen noch einzutragen. Die App zeigt solche Aufgaben gar
    // nicht erst an (`istAusgefallen` in deriveMyTasks) — hier landet also nur,
    // wer den Ausfall noch nicht gesehen hat. Genau dafür ist der Server da.
    if (istAusgefallenFuer(week.dev, parts.tab)) {
      return json({ error: 'meeting-cancelled' }, 409)
    }

    const svcName = services.find((s) => s.key === parts.svc)?.name ?? parts.svc
    // Wochentag und Uhrzeit dieser einen Zusammenkunft — einmal gerechnet und
    // zweimal gebraucht: für die Abwesenheitsprüfung (welcher Kalendertag?)
    // und für den Termin im Nachrichtentext (welcher Tag steht da?).
    const zusammenkunftszeiten = congRows[0]?.meeting_times ?? ''
    const versatz = versatzMitAbweichung(
      week.dev,
      parts.tab,
      meeting.date,
      meetingDayOffsets(zusammenkunftszeiten)[parts.tab],
    )
    /*
     * **Der Termin, nicht die Wochenspanne.**
     *
     * Hier stand `taskDateText(meeting.date)` — das rohe `date`-Feld. Bei einer
     * importierten Woche trägt das aber nur „7.–13. September": Die
     * jw.org-Überschrift nennt weder Wochentag noch Uhrzeit (B4). „Ersatz
     * gesucht" nannte damit eine ganze Woche, und wer die Meldung bekam, wusste
     * nicht, ob es um die Zusammenkunft unter der Woche oder die am Wochenende
     * geht. Die App daneben zeigte längst den Tag (`meetingDateText` über
     * `deriveSubstituteReqs`) — dieselbe Auskunft in zwei Fassungen, je nachdem,
     * ob sie aus dem Push oder aus dem Aufgaben-Blatt kam.
     *
     * `terminText` ist die Regel, nach der auch `send-reminders` und
     * `send-plan` rechnen: eigener Termin im `date`-Feld vor gerechnetem Datum,
     * eine Abweichung vor beidem.
     */
    const date = terminText(
      weekRows[0]?.start ?? '',
      versatz,
      meeting.date,
      zeitMitAbweichung(week.dev, parts.tab, meeting.date, meetingTimesOf(zusammenkunftszeiten)[parts.tab]),
      week.dev,
      parts.tab,
    )
    // Kalendertag dieser Zusammenkunft — Grundlage der Abwesenheitsprüfung.
    // Ohne ISO-Startdatum (Vorlagenwochen) bleibt sie aus, statt zu raten.
    const tagISO = meetingISO(weekRows[0]?.start, versatz)
    const qualKey = `svc:${parts.svc}`
    const personById = new Map(persons.map((p) => [p.id, p]))
    const userByPerson = new Map<string, string>()
    for (const m of members) if (m.person_id) userByPerson.set(m.person_id, m.user_id)
    const subsByUser = new Map<string, Sub[]>()
    for (const s of subsRows) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])

    const callerPerson = caller.person_id ? personById.get(caller.person_id) : undefined
    const taskKeyEnc = wert(payload.taskKey!)

    if (payload.action === 'seek') {
      // Eine Ersatzsuche verschickt an alle Qualifizierten die Aussage
      // „<Name> kann nicht". Bisher genügte dafür die blosse Mitgliedschaft —
      // jedes Konto konnte das für jeden beliebigen Slot auslösen. Erlaubt ist
      // es dem, der eingeteilt ist, oder wer für genau diesen Slot bereits
      // abgesagt hat (der Slot behält den Namen, kann aber inzwischen neu
      // besetzt sein).
      //
      // **Id vor Name** — dieselbe Rangfolge wie in `gehoertZu` (helpers.ts)
      // und wie in `istAbsager` ein paar Zeilen tiefer. Hier stand ein Oder,
      // und damit kam der Namensvetter durch: Er konnte für einen fremden Platz
      // an alle Qualifizierten schicken lassen, „<Name> kann nicht". Trägt der
      // Platz eine Id, ist entschieden, wem er gehört; der Name ist nur dort
      // ein Anhalt, wo es keine Id gibt (Altbestand).
      const istEingeteilt =
        callerPerson !== undefined &&
        (slot.pid ? slot.pid === callerPerson.id : slot.name === displayName(callerPerson))
      if (!istEingeteilt) {
        const eigeneAbsage = await rest.get<{ user_id: string }[]>(
          `confirmations?select=user_id&congregation_id=eq.${wert(cong)}` +
            `&task_key=eq.${taskKeyEnc}&status=eq.verhindert&user_id=eq.${wert(userId)}`,
        )
        if (eigeneAbsage.length === 0) return json({ error: 'forbidden' }, 403)
      }

      const declinedBy = slot.name ?? ''
      const abwesende = abwesendeAm(absences, tagISO)
      /*
       * Der Absagende selbst wird nicht gefragt — **über die Id**, wo der Platz
       * eine trägt.
       *
       * Über den Namen fiel auch sein Namensvetter heraus: ausgerechnet der,
       * der ihn am ehesten vertreten könnte (gleiche Qualifikation, gleiche
       * Versammlung). Der Client zeigt ihm das Gesuch (`deriveSubstituteReqs`
       * fragt `gehoertZu`) — dann muss es ihn auch erreichen, sonst sieht er in
       * der App etwas, wovon er nie erfahren hat.
       */
      const istAbsager = (p: Person): boolean =>
        slot.pid ? p.id === slot.pid : displayName(p) === declinedBy
      const peers = persons
        .filter((p) => p.priv?.[qualKey] && !abwesende.has(p.id) && !istAbsager(p))
        .map((p) => userByPerson.get(p.id))
        .filter((u): u is string => Boolean(u) && u !== userId)
      await notifyUsers(
        cong,
        peers,
        subsByUser,
        TITEL_GESUCHT,
        (lang) => substituteTexte(lang).gesucht,
        // Nur Atome: Dienst, Termin, Name. Der feste Satz („… kann nicht. Wer
        // springt ein?") steckte früher im Rumpf und stand deshalb in allen
        // 33 Sprachen deutsch da — dynamischer Text kommt durch keinen
        // Wörterbuch-Schlüssel.
        //
        // Der Name geht als gekennzeichneter Freitext hinaus: Er ist das eine
        // Atom, das kein Übersetzer anfassen darf (`_shared/i18n/freitext.ts`).
        [svcName, date, alsFreitext(declinedBy)].filter(Boolean).join(' · '),
        `${APP_URL}#go=aufgaben`,
        payload.taskKey,
        payload.taskKey, // je Gesuch eine eigene Meldung, siehe `pushTag`
      )
      return json({ ok: true, notified: [...new Set(peers)].length })
    }

    // action === 'take'
    if (!callerPerson || !callerPerson.priv?.[qualKey]) return json({ error: 'not-qualified' }, 403)
    const callerName = displayName(callerPerson)
    const originalName = slot.name ?? ''
    /*
     * **Die Id des Eingeteilten festhalten, bevor der Slot umgeschrieben wird.**
     * Ein paar Zeilen tiefer steht dort der Aufrufer — und ganz unten soll der
     * Verdrängte erfahren, dass sein Platz weg ist.
     */
    const originalPid = slot.pid
    if (originalName === callerName) return json({ ok: true, already: true }) // idempotent

    // Einspringen setzt voraus, dass jemand da war und abgesagt hat.
    //
    // Bisher genügten Mitgliedschaft und Qualifikation. Damit konnte sich jeder,
    // der einen Hilfsdienst kann, in JEDEN Platz dieses Dienstes schreiben — den
    // Eingeteilten verdrängen, dessen Bestätigung löschen und ihm und allen
    // Planern „Ersatz gefunden" schicken, ohne dass je ein Ersatz gesucht war.
    // Der Knopf dafür steht in der App zwar nur bei offenen Gesuchen
    // (`deriveSubstituteReqs`), aber ein Knopf ist keine Rechteprüfung.
    //
    // Dieselbe Überlegung wie bei 'seek' oben, dieselbe Quelle: die Absage.
    // Der leere Platz fällt damit von selbst weg — für ihn gibt es keine.
    if (!originalName) return json({ error: 'not-sought' }, 409)
    const absagen = await rest.get<{ user_id: string }[]>(
      `confirmations?select=user_id&congregation_id=eq.${wert(cong)}` +
        `&task_key=eq.${taskKeyEnc}&status=eq.verhindert`,
    )
    if (absagen.length === 0) return json({ error: 'not-sought' }, 409)

    // Slot auf den Aufrufer umschreiben — aber nur, solange dort noch der
    // Name steht, den wir gelesen haben. Sonst war jemand schneller; ohne
    // diese Bedingung überschrieben sich zwei Übernahmen gegenseitig und der
    // Zweite löschte danach die Bestätigung des Ersten.
    slot.name = callerName
    slot.pid = callerPerson.id
    // `originalName` ist hier nie leer (oben abgewiesen), der Filter also immer
    // ein Namensvergleich.
    const nameFilter = `data->${parts.tab}->helpers->${wert(parts.svc)}->${parts.pos}->>name`
    const bedingung = `${nameFilter}=eq.${wert(`"${originalName}"`)}`
    const geschrieben = await rest.patchIf(
      `weeks?congregation_id=eq.${wert(cong)}&start=eq.${wert(parts.woche)}&${bedingung}`,
      { data: week },
    )
    if (!geschrieben) return json({ error: 'slot-taken' }, 409)

    // Die Suche ist beendet: Die Zeilen „Ersatz gesucht" in den Glocken ALLER
    // Qualifizierten weg (T86). Sie standen dort sonst weiter, obwohl es nichts
    // mehr zu übernehmen gab — und wer darauf tippte, fand nichts. Nur die
    // Mitteilungen zu genau diesem Platz; „Ersatz gefunden" entsteht erst
    // danach und bleibt.
    // Vor migration-020 gibt es die Spalte nicht: Dann trifft der Filter keine
    // Zeile und der Aufruf bleibt folgenlos (restSend meldet einen Fehler in
    // die Logs, bricht die Übernahme aber nicht ab).
    await rest.send(
      'DELETE',
      `notifications?congregation_id=eq.${wert(cong)}&task_key=eq.${taskKeyEnc}` +
        `&title=eq.${wert(TITEL_GESUCHT)}`,
    )

    // Alte Bestätigung(en) dieses Slots weg, eigene „bestätigt" setzen.
    // Ungefährlich, weil oben nur ein einziger Aufruf durchkommt.
    await rest.send(
      'DELETE',
      `confirmations?congregation_id=eq.${wert(cong)}&task_key=eq.${taskKeyEnc}`,
    )
    await rest.insert('confirmations', [
      { congregation_id: cong, user_id: userId, task_key: payload.taskKey, status: 'bestätigt' },
    ])

    /*
     * Ursprungsperson + Planer informieren — die Ursprungsperson **über ihre
     * Id**, wo der Platz eine trägt.
     *
     * Hier stand allein `persons.find((p) => displayName(p) === originalName)`.
     * Bei zwei Gleichnamigen entschied damit die Reihenfolge der Personenliste,
     * wer die Nachricht bekommt; hatte der zuerst gefundene kein Konto, bekam
     * sie **niemand** — der Eingeteilte verlor seinen Platz, ohne es zu
     * erfahren, und im Planen stand er als abgesagt.
     *
     * Dieselbe Grenze wie in `send-plan`, `send-reminders` und `idAufloeser`:
     * Trägt die Zuteilung eine Id, gilt sie. Der Name bleibt der Weg für
     * Altdaten und Hilfsdienste ohne Id.
     */
    const originalPerson = originalPid
      ? personById.get(originalPid)
      : persons.find((p) => displayName(p) === originalName)
    const recipients = [
      ...(originalPerson ? [userByPerson.get(originalPerson.id)].filter(Boolean) as string[] : []),
      ...members.filter((m) => m.planner).map((m) => m.user_id),
    ]
    await notifyUsers(
      cong,
      recipients,
      subsByUser,
      TITEL_GEFUNDEN,
      (lang) => substituteTexte(lang).gefunden,
      [svcName, date, alsFreitext(callerName)].filter(Boolean).join(' · '),
      `${APP_URL}#go=aufgaben`,
      undefined, // die Glocken-Zeile trägt hier keinen Aufgabenschlüssel …
      payload.taskKey, // … der Push bündelt trotzdem je Aufgabe
    )
    return json({ ok: true, taken: true })
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort: `restGet` hängt bei einem Fehler
    // Pfad und rohen PostgREST-Rumpf an die Meldung. Das ist beim Suchen
    // nützlich und beim Angreifen genauso — es verriet Tabellen, Spalten und
    // die Bedingung, an der ein Versuch scheiterte.
    console.error('substitute:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
