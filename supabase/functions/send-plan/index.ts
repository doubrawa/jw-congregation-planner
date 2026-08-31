// =============================================================================
// Supabase Edge Function: send-plan — „Plan senden"
// =============================================================================
// Zwei Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { action: 'plan', weekStart }
//     Der Planer hat eine Woche fertig und gibt sie frei. Jede eingeteilte
//     Person bekommt **eine** Nachricht mit allen ihren Aufgaben dieser Woche
//     (Glocke + Web-Push). Verschickt wird nur, was noch nicht verschickt war —
//     das Versand-Tagebuch `assignment_log` (migration-024) merkt sich das.
//
//   { action: 'entzug', entzuege: [{ taskKey, name, pid?, label?, datum? }, …] }
//     Eine oder mehrere bereits **bestätigte** Zuteilungen wurden zurückgezogen
//     oder verlegt. Die Betroffenen erfahren es sofort. Ohne diesen Weg
//     bereitete jemand weiter etwas vor, das ihm längst genommen war.
//
//     **Eine Liste, kein Einzelfall.** Der Client schickte je Entzug einen
//     eigenen Aufruf, und jeder wiederholte davor dieselben fünf REST-Runden
//     über alle Mitglieder, Personen und Push-Abos. Wer eine ganze
//     Zusammenkunft neu besetzt, löste damit ein Dutzend voller Aufrufe aus.
//     Die alte Einzelform (taskKey/name/… im Rumpf) wird weiter angenommen —
//     ein Browser-Tab, der seit Tagen offen liegt, schickt noch sie.
//
// WARUM ES DIESE FUNCTION GIBT. Bis hierher erfuhr die eingeteilte Person von
// ihrer Zuteilung überhaupt nichts: die Mitteilung „Zuteilung gesendet" ging an
// die **Planer**, nicht an sie (in T74 gemessen und vertagt). Sie erfuhr es
// frühestens über die zeitliche Erinnerung, also `first` Tage vor der
// Zusammenkunft. Wer drei Wochen im Voraus plante, dessen Leute wussten zwei
// Wochen lang nichts — außer sie öffneten die App von sich aus.
//
// WARUM AUF KNOPFDRUCK und nicht bei jedem Klick: Planen ist eine Sitzung, kein
// Einzelakt. Eine Woche hat gut 35 Plätze; bei sofortigem Versand ginge für
// jedes Umsortieren eine Nachricht hinaus. Der Planer entscheidet, wann der
// Plan steht.
//
// Sicherheit: Aufrufer muss per JWT eingeloggter **Planer** sein. Die
// Versammlung kommt aus seiner Mitgliedszeile, nie aus dem Rumpf; jeder Wert
// geht durch `wert()` in den Pfad (sonst beendet ein `#` die Abfrage still).
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
//   send-reminders), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
//
// Deploy:  npx supabase functions deploy send-plan
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { abbestellerFuer, vapidSetzen, type Zustellung, zustellen } from '../_shared/push.ts'
import {
  istAusgefallenFuer,
  meetingDayOffsets,
  meetingTimesOf,
  personDisplayName,
  versatzMitAbweichung,
  zeitMitAbweichung,
} from '../_shared/planung.ts'
import {
  type Eintrag,
  type FsInstance,
  kanonisch,
  nachSprache,
  type Pending,
  pendingOfFsWeek,
  pendingOfMeeting,
  type ServiceRow,
  type SubscriptionRow,
  tagebuchSchluessel,
  terminText,
  uebersetzerFuer,
  uebersetzt,
  type Week,
} from '../_shared/zuteilungen.ts'
import { bibelbuecherLaden } from '../_shared/i18n/translate.ts'
import { type PlanTexte, planTexte } from './texte.ts'

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

interface MemberRow {
  user_id: string
  person_id: string | null
  planner: boolean
}
interface PersonRow {
  id: string
  fn: string
  ln: string
  dn: string
}

/**
 * Ein zurückgezogener Platz, wie der Client ihn meldet.
 *
 * Bezeichnung und Termin kommen von dort und nicht aus der Datenbank: Der
 * Client hat den Platz gerade in der Hand, die Function könnte ihn nach dem
 * Überschreiben nicht mehr nachschlagen. Beides kanonisch deutsch, wie jeder
 * Mitteilungsrumpf; übersetzt wird beim Anzeigen bzw. je Gerät.
 */
interface EntzugRumpf {
  taskKey?: string
  name?: string
  /** Person-Id des Betroffenen, wo der Platz eine trug. */
  pid?: string
  label?: string
  datum?: string
}

/* ---- Versand ------------------------------------------------------------- */

interface Empfaenger {
  userId: string
  subs: SubscriptionRow[]
}

/** Wohin ein Tipp auf die Nachricht führt — beide Arten meinen dieselbe Liste. */
const ZIEL = `${APP_URL}#go=aufgaben`

/**
 * Eine Nachricht an einen Empfänger: Glocke (kanonisch deutsch) und Push (je
 * Gerätesprache eigens gebaut).
 *
 * **Die Art bestimmt den Titel, nicht der Aufrufer.** Hier standen einmal drei
 * Felder nebeneinander — der deutsche Titel, eine Funktion für den übersetzten
 * und das Ziel —, die an beiden Bauplätzen fest zusammengehörten. Der deutsche
 * Titel ist per Konstruktion `planTexte('de')[art]`; ihn getrennt mitzugeben
 * hieß, denselben Text zweimal zu führen und beim Hinzufügen einer dritten Art
 * an drei Stellen daran zu denken.
 *
 * `taskKey` wird nur gesetzt, wenn die Nachricht **genau eine** Aufgabe
 * betrifft — dann macht die Glocke daraus eine, auf der man gleich bestätigen
 * kann (`notif.taskId` in NotificationsPanel). Bei mehreren Aufgaben zeigte ein
 * einzelner Knopf auf eine willkürliche davon.
 */
interface Nachricht {
  empfaenger: Empfaenger
  art: keyof PlanTexte
  eintraege: Eintrag[]
  taskKey?: string
}

/**
 * Glocken-Zeilen und Push-Nachrichten hinausschicken.
 *
 * Die Glocke geht **gesammelt** in einem Insert hinaus, der Push je Empfänger
 * und Sprache. Reihenfolge mit Absicht: erst die Glocke, dann der Push. Wer auf
 * die Benachrichtigung tippt, landet in einer App, in der die Zeile schon
 * steht — andersherum käme er auf einen leeren Stand.
 */
async function verschicken(
  cong: string,
  nachrichten: Nachricht[],
): Promise<{ personen: number; push: number }> {
  const notifRows = nachrichten.map((n) => ({
    congregation_id: cong,
    user_id: n.empfaenger.userId,
    type: 'zuteilung',
    title: planTexte('de')[n.art],
    body: n.eintraege.map(kanonisch).join(' · '),
    ...(n.taskKey ? { task_key: n.taskKey } : {}),
  }))
  await rest.insert('notifications', notifRows)

  const kannSenden = vapidSetzen(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const uebersetzer = uebersetzerFuer()
  // Erst alle Texte bilden, dann in einem Zug zustellen.
  const zustellungen: Zustellung[] = []
  for (const n of nachrichten) {
    // Je Sprache ein eigener Text: Er steht fest, sobald die Nachricht das Gerät
    // erreicht. Wer Geräte in zwei Sprachen hat, bekommt auf jedem die passende.
    for (const [lang, subs] of nachSprache(n.empfaenger.subs)) {
      if (subs.length === 0) continue
      const tr = uebersetzer(lang)
      const titel = planTexte(lang)[n.art]
      const body = n.eintraege.map((e) => uebersetzt(e, tr)).join(' · ')
      for (const abo of subs) zustellungen.push({ abo, titel, body, url: ZIEL })
    }
  }
  // Ohne VAPID-Schlüssel bleibt es bei der Glocke — kein Grund abzubrechen.
  const { gesendet } = kannSenden
    ? await zustellen(zustellungen, abbestellerFuer(rest))
    : { gesendet: 0 }
  return { personen: notifRows.length, push: gesendet }
}

/* ---- Handler ------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    const payload = (await req.json().catch(() => null)) as
      | ({ action?: string; weekStart?: string; entzuege?: EntzugRumpf[] } & EntzugRumpf)
      | null
    if (payload?.action !== 'plan' && payload?.action !== 'entzug') {
      return json({ error: 'bad-request' }, 400)
    }

    // Die Versammlung stammt aus der Mitgliedszeile des Aufrufers, nie aus dem
    // Rumpf — sonst schickte ein beliebiges Konto Nachrichten in fremde
    // Versammlungen. Und schreiben darf hier nur ein Planer.
    const eigene = await rest.get<MemberRow[]>(
      `members?select=user_id,person_id,planner,congregation_id&user_id=eq.${wert(userId)}`,
    )
    const mich = eigene[0] as (MemberRow & { congregation_id?: string }) | undefined
    const cong = mich?.congregation_id
    if (!cong) return json({ error: 'no-congregation' }, 403)
    if (!mich?.planner) return json({ error: 'forbidden' }, 403)

    const [members, persons, subs] = await Promise.all([
      rest.get<MemberRow[]>(`members?select=user_id,person_id,planner&congregation_id=eq.${wert(cong)}`),
      rest.get<PersonRow[]>(`persons?select=id,fn,ln,dn&congregation_id=eq.${wert(cong)}`),
      rest.get<SubscriptionRow[]>(
        `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${wert(cong)}`,
      ),
    ])

    const personById = new Map(persons.map((p) => [p.id, p]))
    // Zuordnung bevorzugt über die Person-Id; der Namensweg bleibt als Rückfall
    // für Plätze ohne `pid` (Altdaten, Hilfsdienste als reine Zeichenkette).
    // Zwei Personen desselben Namens bekämen sonst gegenseitig die Nachrichten
    // des anderen — dagegen warnt die App den Planer eigens (T-Dubletten).
    const userByPerson = new Map<string, string>()
    const userByName = new Map<string, string>()
    const personByName = new Map<string, string>()
    for (const m of members) {
      const p = m.person_id ? personById.get(m.person_id) : undefined
      if (!p) continue
      userByPerson.set(p.id, m.user_id)
      userByName.set(personDisplayName(p.fn, p.ln, p.dn), m.user_id)
    }
    for (const p of persons) personByName.set(personDisplayName(p.fn, p.ln, p.dn), p.id)
    const subsByUser = new Map<string, SubscriptionRow[]>()
    for (const s of subs) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
    const empfaengerFuer = (uid: string): Empfaenger => ({
      userId: uid,
      subs: subsByUser.get(uid) ?? [],
    })
    /**
     * Konto einer eingeteilten Person: **Id zuerst, Name als Rückfall.**
     *
     * Am Namen allein bekämen zwei Gleichnamige gegenseitig die Nachricht des
     * anderen — der eine übt weiter für einen Platz, den er nicht mehr hat,
     * und der andere erschrickt über einen Entzug, den es nie gab. Die Regel
     * stand hier dreimal wörtlich; `send-reminders` trägt ihre eigene vierte
     * Abschrift.
     */
    const kontoFuer = (pid: string | undefined, name: string): string | undefined =>
      (pid ? userByPerson.get(pid) : undefined) ?? userByName.get(name)

    /* ---- Aktion: bestätigte Zuteilungen wurden zurückgezogen ---- */
    if (payload.action === 'entzug') {
      /*
       * **Liste oder Einzelfall.** Neue Clients schicken `entzuege`; die alte
       * Form (taskKey/name/… unmittelbar im Rumpf) bleibt gültig, solange ein
       * Browser-Tab sie noch schickt. Beides mündet in dieselbe Liste — eine
       * zweite Bearbeitung daneben wäre die zweite Buchführung.
       */
      const roh = Array.isArray(payload.entzuege) ? payload.entzuege : [payload]
      const entzuege = roh.filter(
        (e): e is EntzugRumpf & { taskKey: string; name: string } => Boolean(e?.taskKey && e?.name),
      )
      if (entzuege.length === 0) return json({ error: 'bad-request' }, 400)

      /*
       * Die Einträge im Tagebuch müssen weg, **bevor** irgendetwas anderes
       * passiert. Sie sagen „diese Person weiß von diesem Platz"; das gilt
       * nicht mehr. Blieben sie stehen, bekäme sie bei einer erneuten
       * Zuteilung auf denselben Platz keine Nachricht mehr — der Platz zählte
       * als gemeldet. **Jeder** der Liste, nicht nur der erste.
       */
      await Promise.all(
        entzuege.map((e) =>
          rest.send(
            'DELETE',
            `assignment_log?congregation_id=eq.${wert(cong)}` +
              `&task_key=eq.${wert(e.taskKey)}&name=eq.${wert(e.name)}`,
          ),
        ),
      )

      // Je Person **eine** Nachricht, wie beim „Plan senden": Wer beim
      // Umbesetzen einer Zusammenkunft zwei Plätze verliert, soll einmal
      // hinsehen müssen und nicht zweimal erschrecken.
      const jeEntzug = new Map<string, Eintrag[]>()
      const ohneKonto = new Set<string>()
      for (const e of entzuege) {
        const uid = kontoFuer(e.pid, e.name)
        // Kein Konto → nichts zuzustellen. Kein Fehler: der Planer sagt es
        // persönlich, und die Antwort nennt ihm den Namen.
        if (!uid) {
          ohneKonto.add(e.name)
          continue
        }
        const eintrag: Eintrag = { datum: e.datum ?? '', label: e.label ?? '' }
        jeEntzug.set(uid, [...(jeEntzug.get(uid) ?? []), eintrag])
      }
      if (jeEntzug.size === 0) {
        return json({ ok: true, personen: 0, push: 0, ohneKonto: [...ohneKonto] })
      }

      await bibelbuecherLaden()
      const { personen, push } = await verschicken(
        cong,
        [...jeEntzug].map(([uid, eintraege]) => ({
          empfaenger: empfaengerFuer(uid),
          art: 'entzug' as const,
          eintraege,
        })),
      )
      return json({ ok: true, personen, push, ohneKonto: [...ohneKonto] })
    }

    /* ---- Aktion: Plan einer Woche senden ---- */
    const weekStart = payload.weekStart ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'bad-request' }, 400)

    /**
     * Zeilen einer `task_key`-Tabelle, **nur für diese Woche**.
     *
     * `confirmations` und `assignment_log` wurden hier je Knopfdruck ganz
     * gelesen — beide wachsen mit der Zeit (gut 35 Plätze je Woche, und das
     * Tagebuch wird nie aufgeräumt), gebraucht wird davon aber immer nur eine
     * Woche. Nach ein paar Jahren holte ein Druck Zehntausende Zeilen, um in
     * dreißig davon nachzusehen.
     *
     * Die Woche steht im Schlüssel selbst, in genau zwei Formen: `<Montag>|…`
     * für die Zusammenkünfte und `fs|<Montag>|…` für die Treffpunkte (T66).
     * Fehlt die zweite, gilt jede Treffpunkt-Leitung als noch nicht gemeldet
     * und der Leiter bekommt bei jedem Druck dieselbe Nachricht erneut.
     *
     * Zwei einfache `like`-Abfragen statt eines `or=`: Sie laufen parallel, und
     * ihre Bedeutung ist ohne Nachschlagen in der PostgREST-Grammatik zu
     * erkennen. `weekStart` ist oben auf `YYYY-MM-DD` geprüft, enthält also
     * weder `%` noch `_`, die als Muster wirkten.
     */
    const jeWoche = async <T>(tabelle: string, spalten: string): Promise<T[]> => {
      const teile = await Promise.all(
        [`${weekStart}|*`, `fs|${weekStart}|*`].map((muster) =>
          rest.get<T[]>(
            `${tabelle}?select=${spalten}&congregation_id=eq.${wert(cong)}` +
              `&task_key=like.${wert(muster)}`,
          ),
        ),
      )
      return teile.flat()
    }

    const [congRows, weekRows, fsRows, confs, services, log] = await Promise.all([
      rest.get<{ meeting_times: string }[]>(
        `congregations?select=meeting_times&id=eq.${wert(cong)}`,
      ),
      rest.get<{ start: string; data: Week }[]>(
        `weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=eq.${wert(weekStart)}`,
      ),
      rest.get<{ start: string; data: FsInstance[] }[]>(
        `fs_weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=eq.${wert(weekStart)}`,
      ).catch((err) => {
        // Fehlt die Tabelle, lieber die Zusammenkünfte melden als gar nichts.
        console.error(`fs_weeks nicht lesbar: ${(err as Error).message}`)
        return [] as { start: string; data: FsInstance[] }[]
      }),
      jeWoche<{ task_key: string; status: string }>('confirmations', 'task_key,status'),
      rest.get<ServiceRow[]>(
        `services?select=key,name,count,groups&congregation_id=eq.${wert(cong)}&order=position.asc`,
      ),
      jeWoche<{ task_key: string; name: string }>('assignment_log', 'task_key,name').catch((err) => {
        // Fehlt das Tagebuch (Migration nicht eingespielt), würde ohne diesen
        // Fang gar nichts hinausgehen. Lieber senden — schlimmstenfalls eine
        // Wiederholung, nie ein Ausfall.
        console.error(`assignment_log nicht lesbar: ${(err as Error).message}`)
        return [] as { task_key: string; name: string }[]
      }),
    ])

    const week = weekRows[0]?.data
    if (!week) return json({ error: 'no-week' }, 404)
    const offsets = meetingDayOffsets(congRows[0]?.meeting_times ?? '')
    const zeiten = meetingTimesOf(congRows[0]?.meeting_times ?? '')
    const conf = new Map(confs.map((c) => [c.task_key, c.status]))
    const schonGemeldet = new Set(log.map((r) => tagebuchSchluessel(r.task_key, r.name)))

    // Alle offenen Plätze der Woche einsammeln — dieselbe Aufzählung, die auch
    // die Erinnerungen benutzt (`_shared/zuteilungen.ts`).
    const offen: Array<Pending & { eintrag: Eintrag }> = []
    for (const tab of ['mid', 'we'] as const) {
      const meeting = week[tab]
      if (!meeting) continue
      // Entfällt die Zusammenkunft, gibt es nichts mitzuteilen (T30).
      if (istAusgefallenFuer(week.dev, tab)) continue
      const offset = versatzMitAbweichung(week.dev, tab, meeting.date, offsets[tab])
      const zeit = zeitMitAbweichung(week.dev, tab, meeting.date, zeiten[tab])
      // Der Termin trägt die Verlegung bereits in sich: steht sie zur Planzeit
      // fest, nennt die Nachricht von vornherein den richtigen Tag.
      const datum = terminText(weekStart, offset, meeting, zeit, week.dev, tab)
      for (const pend of pendingOfMeeting(weekStart, tab, meeting, services, conf)) {
        offen.push({ ...pend, eintrag: { datum, label: pend.label } })
      }
    }
    for (const pend of pendingOfFsWeek(weekStart, fsRows[0]?.data ?? [], conf)) {
      offen.push({
        ...pend,
        // Termin und Bezeichnung stehen fertig in der Aufzählung — beim Treffpunkt
        // trägt der Termin den Ort (siehe `FS_LEITER`).
        eintrag: { datum: pend.datum, label: pend.label },
      })
    }

    // Was schon gemeldet wurde, bleibt liegen. Sonst schickte ein zweiter Druck
    // nach einer kleinen Nachbesserung allen dieselbe Nachricht erneut.
    const neu = offen.filter((p) => !schonGemeldet.has(tagebuchSchluessel(p.key, p.name)))
    if (neu.length === 0) return json({ ok: true, personen: 0, aufgaben: 0, ohneKonto: [] })

    await bibelbuecherLaden()

    // Je Person **eine** Nachricht mit allen ihren Aufgaben — nicht je Aufgabe
    // eine. Wer an einem Wochenende drei Plätze hat, soll einmal hinsehen.
    //
    // Zwei getrennte Behälter statt eines mit Kennzeichen: Wer kein Konto hat,
    // gehört gar nicht in die Zustell-Liste. Hier stand einmal ein Schlüssel
    // der Form „ ohne:<Name>", der unten wieder zerlegt wurde — und ein Name,
    // der zufällig so begann, wäre still aus dem Versand gefallen, während das
    // Tagebuch ihn als gemeldet führte.
    const jePerson = new Map<string, Array<Pending & { eintrag: Eintrag }>>()
    const ohneKonto = new Set<string>()
    for (const p of neu) {
      const uid = kontoFuer(p.pid, p.name)
      // Ohne Konto ist niemand zu erreichen — gemerkt wird der Name, damit der
      // Planer unten erfährt, wen er persönlich ansprechen muss.
      if (!uid) {
        ohneKonto.add(p.name)
        continue
      }
      jePerson.set(uid, [...(jePerson.get(uid) ?? []), p])
    }

    const nachrichten: Nachricht[] = []
    for (const [uid, eintraege] of jePerson) {
      nachrichten.push({
        empfaenger: empfaengerFuer(uid),
        art: 'zuteilung',
        eintraege: eintraege.map((e) => e.eintrag),
        // Nur bei genau einer Aufgabe: dann trägt die Glocke den
        // Bestätigen-Knopf. Bei mehreren zeigte er auf eine willkürliche davon.
        ...(eintraege.length === 1 ? { taskKey: eintraege[0].key } : {}),
      })
    }

    const { push } = await verschicken(cong, nachrichten)

    // Tagebuch **nach** dem Versand — scheitert das Schreiben, wurde immerhin
    // gesendet (schlimmstenfalls eine Wiederholung, nie ein Ausfall). Auch die
    // ohne Konto werden eingetragen: sonst zeigte der Knopf für sie auf ewig
    // „noch nicht benachrichtigt", obwohl niemand sie erreichen kann.
    await rest.insert(
      'assignment_log',
      neu.map((p) => ({
        congregation_id: cong,
        task_key: p.key,
        name: p.name,
        person_id: p.pid ?? personByName.get(p.name) ?? null,
        user_id: kontoFuer(p.pid, p.name) ?? null,
      })),
      // Was schon dasteht, bleibt stehen; der Rest kommt hinzu. Ohne das
      // verwirft eine einzige Dublette den ganzen Stapel — siehe `restInsert`.
      { ignoreDuplicates: true },
    )

    return json({
      ok: true,
      personen: nachrichten.length,
      aufgaben: neu.length,
      push,
      ohneKonto: [...ohneKonto],
    })
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort: die REST-Fehler tragen Pfad und
    // rohen PostgREST-Rumpf — beim Suchen nützlich und beim Angreifen genauso.
    console.error('send-plan:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
