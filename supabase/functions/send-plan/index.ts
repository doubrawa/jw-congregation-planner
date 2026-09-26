// =============================================================================
// Supabase Edge Function: send-plan — „Plan senden"
// =============================================================================
// Zwei Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { action: 'plan', weekStart, heute? }
//     Der Planer hat eine Woche fertig und gibt sie frei. Jede eingeteilte
//     Person bekommt **eine** Nachricht mit allen ihren Aufgaben dieser Woche
//     (Glocke + Web-Push). Verschickt wird nur, was noch nicht verschickt war —
//     das Versand-Tagebuch `assignment_log` merkt sich das —,
//     und nur, was noch **ansteht**: Über eine Zusammenkunft, die gewesen ist,
//     geht keine Nachricht mehr hinaus. `heute` ist der Kalendertag des
//     Planers („YYYY-MM-DD"), damit Knopf und Versand denselben Tag meinen
//     (`heuteUtc`, _shared/planung.ts).
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
//     **Vergangenes kommt hier gar nicht erst an.** Welche Plätze vorbei sind,
//     weiß der Client, der den alten Stand der Woche in der Hand hat
//     (`entzogeneZusagen`); die Function bekommt nur Schlüssel und fertige
//     Texte. Sie prüft das deshalb nicht noch einmal — dieselbe Arbeitsteilung
//     wie bei Bezeichnung und Termin, die ebenfalls vom Client kommen.
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
// Sicherheit: Aufrufer muss per JWT eingeloggter **Planer** sein — oder, nur für
// den Entzug einer Treffpunkt-Leitung seiner Gruppe, deren Aufseher. Die
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
import { schluesselTeile, wochenPraefixe } from '../_shared/aufgaben-schluessel.ts'
import { abbestellerFuer, vapidSetzen, type Zustellung, zustellen } from '../_shared/push.ts'
import { heuteUtc, personDisplayName, zeitenAus, type ZeitenRow } from '../_shared/planung.ts'
import { abosJeKonto, kontoAufloeser } from '../_shared/konten.ts'
import {
  type Eintrag,
  type FsInstance,
  kanonisch,
  nachSprache,
  offeneDerWoche,
  type Pending,
  type ServiceRow,
  type SubscriptionRow,
  tagebuchSchluessel,
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
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'

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

/* ---- Wer einen Entzug melden darf --------------------------------------- */

/**
 * Die Gruppen, die diese Person leitet — als Aufseher oder Gehilfe, dieselbe
 * Regel wie `is_group_overseer` in `schema.sql`.
 */
async function geleiteteGruppen(cong: string, personId: string | null): Promise<Set<string>> {
  if (!personId) return new Set()
  const gruppen = await rest.get<{ id: string; overseer_id: string | null; assistant_id: string | null }[]>(
    `groups?select=id,overseer_id,assistant_id&congregation_id=eq.${wert(cong)}`,
  )
  return new Set(
    gruppen.filter((g) => g.overseer_id === personId || g.assistant_id === personId).map((g) => g.id),
  )
}

/**
 * Die Entzüge, die ein Gruppenaufseher melden darf: Treffpunkt-Leitungen
 * **seiner** Gruppe. Umbesetzen darf er sie (RLS, `FsPlan` mit `onlyGroup`),
 * und ohne die Meldung erfuhr der verdrängte Leiter nichts.
 *
 * Die Gruppe steht am Treffpunkt der Woche, und ist er gestrichen, an seiner
 * Regel im Grundplan. Was sich keiner seiner Gruppen zuordnen lässt, fällt
 * heraus.
 */
async function nurEigeneTreffpunkte<T extends { taskKey: string }>(
  cong: string,
  entzuege: T[],
  gruppen: ReadonlySet<string>,
): Promise<T[]> {
  const treffpunkte = entzuege.flatMap((e) => {
    const teile = schluesselTeile(e.taskKey)
    return teile?.art === 'fs' ? [{ e, woche: teile.woche, instId: teile.instId }] : []
  })
  if (treffpunkte.length === 0) return []
  const wochen = [...new Set(treffpunkte.map((x) => x.woche))]
  const [fsRows, regeln] = await Promise.all([
    Promise.all(
      wochen.map((w) =>
        rest.get<{ start: string; data: FsInstance[] }[]>(
          `fs_weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=eq.${wert(w)}`,
        ),
      ),
    ).then((r) => r.flat()),
    rest.get<{ id: string; grp: string | null }[]>(`fs_rules?select=id,grp&congregation_id=eq.${wert(cong)}`),
  ])
  const gruppeVon = (woche: string, instId: string): string | null | undefined =>
    fsRows.find((r) => r.start === woche)?.data?.find((i) => i.id === instId)?.grp ??
    regeln.find((r) => r.id === instId)?.grp
  return treffpunkte
    .filter(({ woche, instId }) => {
      const grp = gruppeVon(woche, instId)
      return grp != null && gruppen.has(grp)
    })
    .map((x) => x.e)
}

/* ---- Handler ------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    const payload = (await req.json().catch(() => null)) as
      | ({ action?: string; weekStart?: string; heute?: string; entzuege?: EntzugRumpf[] } & EntzugRumpf)
      | null
    if (payload?.action !== 'plan' && payload?.action !== 'entzug') {
      return json({ error: 'bad-request' }, 400)
    }

    // Die Versammlung stammt aus der Mitgliedszeile des Aufrufers, nie aus dem
    // Rumpf — sonst schickte ein beliebiges Konto Nachrichten in fremde
    // Versammlungen. Und schreiben darf hier nur ein Planer — bis auf den
    // Entzug einer Treffpunkt-Leitung, den auch der Aufseher ihrer Gruppe
    // auslöst (`nurEigeneTreffpunkte`).
    const eigene = await rest.get<MemberRow[]>(
      `members?select=user_id,person_id,planner,congregation_id&user_id=eq.${wert(userId)}`,
    )
    const mich = eigene[0] as (MemberRow & { congregation_id?: string }) | undefined
    const cong = mich?.congregation_id
    if (!cong) return json({ error: 'no-congregation' }, 403)
    const aufseherVon = mich?.planner ? null : await geleiteteGruppen(cong, mich?.person_id ?? null)
    if (aufseherVon && (payload.action !== 'entzug' || aufseherVon.size === 0)) {
      return json({ error: 'forbidden' }, 403)
    }

    const [members, persons, subs] = await Promise.all([
      rest.get<MemberRow[]>(`members?select=user_id,person_id,planner&congregation_id=eq.${wert(cong)}`),
      rest.get<PersonRow[]>(`persons?select=id,fn,ln&congregation_id=eq.${wert(cong)}`),
      rest.get<SubscriptionRow[]>(
        `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${wert(cong)}`,
      ),
    ])

    // Konto einer eingeteilten Person — Id zuerst, Name nur ohne Id (siehe
    // `_shared/konten.ts`).
    const kontoFuer = kontoAufloeser(members, persons)
    const personByName = new Map(persons.map((p) => [personDisplayName(p.fn, p.ln), p.id]))
    const subsByUser = abosJeKonto(subs)
    const empfaengerFuer = (uid: string): Empfaenger => ({
      userId: uid,
      subs: subsByUser.get(uid) ?? [],
    })

    /* ---- Aktion: bestätigte Zuteilungen wurden zurückgezogen ---- */
    if (payload.action === 'entzug') {
      /*
       * **Liste oder Einzelfall.** Neue Clients schicken `entzuege`; die alte
       * Form (taskKey/name/… unmittelbar im Rumpf) bleibt gültig, solange ein
       * Browser-Tab sie noch schickt. Beides mündet in dieselbe Liste — eine
       * zweite Bearbeitung daneben wäre die zweite Buchführung.
       */
      const roh = Array.isArray(payload.entzuege) ? payload.entzuege : [payload]
      const gueltig = roh.filter(
        (e): e is EntzugRumpf & { taskKey: string; name: string } => Boolean(e?.taskKey && e?.name),
      )
      if (gueltig.length === 0) return json({ error: 'bad-request' }, 400)
      const entzuege = aufseherVon ? await nurEigeneTreffpunkte(cong, gueltig, aufseherVon) : gueltig
      if (entzuege.length === 0) return json({ error: 'forbidden' }, 403)

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
        wochenPraefixe(weekStart).map((praefix) =>
          rest.get<T[]>(
            `${tabelle}?select=${spalten}&congregation_id=eq.${wert(cong)}` +
              `&task_key=like.${wert(`${praefix}*`)}`,
          ),
        ),
      )
      return teile.flat()
    }

    const [congRows, weekRows, fsRows, confs, services, log] = await Promise.all([
      rest.get<ZeitenRow[]>(`congregations?select=mid_wd,mid_time,we_wd,we_time&id=eq.${wert(cong)}`),
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
    const conf = new Map(confs.map((c) => [c.task_key, c.status]))
    const schonGemeldet = new Set(log.map((r) => tagebuchSchluessel(r.task_key, r.name)))

    // Alle offenen, noch anstehenden Plätze der Woche — dieselbe Aufzählung, die
    // auch die Erinnerungen benutzt, samt der Ausschlüsse (`offeneDerWoche`).
    const offen: Array<Pending & { eintrag: Eintrag }> = offeneDerWoche(
      weekStart,
      week,
      fsRows[0]?.data ?? [],
      services,
      conf,
      zeitenAus(congRows[0]),
      heuteUtc(payload.heute),
    )

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
