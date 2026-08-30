// =============================================================================
// Supabase Edge Function: send-reminders (Web-Push)
// =============================================================================
// Erinnert Mitglieder mit unbestätigten Zuteilungen per Web-Push (Browser-
// Benachrichtigung, Ende-zu-Ende verschlüsselt — kein E-Mail-Versand) und legt
// In-App-Mitteilungen (Glocke) an. Läuft serverseitig mit Service-Role,
// ausgelöst täglich per Cron (supabase/cron-reminders.sql).
//
// Logik (Einstellungen → ERINNERUNGEN, congregations.settings.reminders):
//  - `first` Tage vor der Zusammenkunft: erste Erinnerung (Push + Glocke)
//  - `last` Tage vorher: letzte Erinnerung (Push + Glocke; 0 = am Tag selbst)
//  - `repeat`: an allen Tagen dazwischen zusätzlich täglich per Push
//  - bestätigte und verhinderte Zuteilungen lösen nichts aus; ebenso externe
//    Slots (Gastredner/Kreisaufseher) und Gruppen-Rotationen (Reinigung).
//  - Der Zusammenkunftstag wird aus congregations.meeting_times abgeleitet
//    ("Di 19:00 · So 10:00"); ohne erkennbare Wochentage gilt Di (mid)/So (we).
//  - Personen mit fälliger letzter Erinnerung, die nicht per Push erreichbar
//    sind (kein App-Konto ODER kein aktiviertes Push-Abo), werden den Planern
//    als Sammel-Push gemeldet, damit sie persönlich erinnern können.
//  - Empfangen kann nur, wer in der App (Profil) Push aktiviert hat
//    (Tabelle push_subscriptions, migration-005). Abgelaufene Abos (404/410)
//    werden automatisch gelöscht.
//  - Wartung: Glocken-Mitteilungen älter als 30 Tage werden im selben Lauf
//    gelöscht (nur im Scharfbetrieb — der Dry-Run schreibt/löscht nichts).
//  - Doppel-Versand-Sperre: pro Empfänger, Art und Tag höchstens eine Sendung
//    (Tabelle reminder_log, migration-011). Ein zweiter Cron-Lauf am selben Tag
//    schickt nichts erneut; ein Neulauf nach Teilfehler holt nur Ausstehende.
//
// SICHERHEIT / STATUS:
//  - **Dry-Run standardmäßig**: ohne Secret `SEND_PUSH=true` wird nichts
//    versendet und nichts geschrieben — die Antwort listet die Vorschau.
//  - Zugriff nur mit korrektem `CRON_SECRET` (Authorization: Bearer <secret>).
//    Fehlt das Secret, antwortet die Function mit 500 statt jeden durchzulassen.
//
// Benötigte Secrets (npx supabase secrets set NAME=wert --project-ref …):
//  - CRON_SECRET        eigenes Geheimnis; Cron schickt es im Authorization-Header
//  - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   Web-Push-Schlüsselpaar (public =
//                       Konstante in src/lib/push.ts)
//  - VAPID_SUBJECT      Kontakt-URI, z. B. "mailto:…"
//  - SEND_PUSH          "true" schaltet echten Versand + Glocken-Mitteilungen frei
//  - APP_URL            optional; Link, den die Benachrichtigung öffnet
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
//
// Deploy:  npx supabase functions deploy send-reminders --no-verify-jwt
// =============================================================================

import { restKlient, wert } from '../_shared/rest.ts'
import { vapidSetzen, type Zustellung, zustellen } from '../_shared/push.ts'
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
  pendingOfFsWeek,
  pendingOfMeeting,
  type Pending,
  type ServiceRow,
  type SubscriptionRow,
  terminText,
  uebersetzerFuer,
  uebersetzt,
  type Week,
} from '../_shared/zuteilungen.ts'
import { bibelbuecherLaden } from '../_shared/i18n/translate.ts'
import { pushTexte, TITEL_UNERREICHBAR } from './texte.ts'

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
const SEND_PUSH = Deno.env.get('SEND_PUSH') === 'true'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

const klient = restKlient(SUPABASE_URL, SERVICE_KEY)

/** Abgelaufenes Push-Abo entfernen (Push-Dienst meldete 404/410). */
const abbestellen = (id: string): Promise<void> =>
  klient.send('DELETE', `push_subscriptions?id=eq.${wert(id)}`)

/** Heutige Versand-Einträge als Menge "userId|kind" (Doppel-Versand-Sperre). */
async function loadSentToday(todayISO: string): Promise<Set<string>> {
  try {
    const rows = await klient.get<{ user_id: string; kind: string }[]>(
      `reminder_log?select=user_id,kind&sent_on=eq.${todayISO}`,
    )
    return new Set(rows.map((r) => `${r.user_id}|${r.kind}`))
  } catch (err) {
    // Fehlt die Tabelle (Migration nicht eingespielt), lieber senden als crashen.
    console.error(`reminder_log nicht lesbar: ${(err as Error).message}`)
    return new Set()
  }
}

/** Aufbewahrungsfrist der Glocken-Mitteilungen (Tage). */
const NOTIFICATION_RETENTION_DAYS = 30

/**
 * Mitteilungen älter als die Frist löschen — läuft im täglichen Cron mit,
 * damit die Tabelle (und die Glocken-Liste) nicht unbegrenzt wächst.
 */
async function pruneNotifications(): Promise<void> {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 864e5).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?created_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    },
  )
  if (!res.ok) console.error(`REST DELETE notifications ${res.status}: ${await res.text()}`)
}

/*
 * Das Datenmodell der Woche, die Ermittlung der offenen Plätze und die
 * Textbausteine stehen in `_shared/zuteilungen.ts` — dieselbe Datei, aus der
 * `send-plan` liest. Hier bleibt nur, was allein den Erinnerungs-Rhythmus
 * betrifft.
 */
interface Reminders {
  first: number
  last: number
  repeat: boolean
}

/* ---- Terminberechnung ---------------------------------------------------- */

/*
 * Der Wochentag-Versatz stand hier als eigene Fassung. Er wohnt jetzt in
 * `_shared/planung.ts` (`versatzMitAbweichung`) — dieselbe Rangfolge wie
 * `meetingOffset` im Client, und seit T30 mit der Abweichung davor. Zwei
 * Fassungen einer Terminregel waren schon einmal die Ursache von B8.
 */

/** Ganze Tage bis zur Zusammenkunft (UTC-Datumsarithmetik; negativ = vorbei). */
function daysUntil(startISO: string, dayOffset: number, todayUTC: number): number | null {
  const start = Date.parse(startISO)
  if (Number.isNaN(start)) return null
  return Math.round((start + dayOffset * 864e5 - todayUTC) / 864e5)
}

/**
 * Fälligkeit laut Einstellungen: Haupttermin (first/last) oder Wiederholung.
 *
 * **„Letzte Erinnerung" heißt letzte.** Die Wiederholung deckt die Tage
 * *dazwischen* ab — nicht die danach. Geprüft wurde hier nur `days < first`,
 * und damit ging bei `first 7 · last 1 · wiederholen` auch **am Tag der
 * Zusammenkunft selbst** noch eine Erinnerung hinaus (Tag 0 < 7). Wer „letzte
 * Erinnerung: 1 Tag vorher" einstellt, hat ausdrücklich entschieden, am Tag
 * selbst nicht mehr erinnert zu werden; für „am Tag" gibt es den eigenen Wert
 * `last = 0`. Die Einstellung blieb also folgenlos, und niemand sah es — die
 * Erinnerung kam ja an.
 *
 * Die Grenzen werden sortiert genommen, nicht als „first oben, last unten":
 * die Oberfläche lässt `first` 1–21 und `last` 0–7 zu, ein `last > first` ist
 * also einstellbar. Ohne das Sortieren wäre das Fenster dann leer statt
 * umgekehrt.
 */
function dueKind(rem: Reminders, days: number): 'main' | 'repeat' | null {
  if (days < 0) return null
  if (days === rem.first || days === rem.last) return 'main'
  if (!rem.repeat) return null
  const frueh = Math.min(rem.first, rem.last)
  const spaet = Math.max(rem.first, rem.last)
  return days > frueh && days < spaet ? 'repeat' : null
}

/* ---- Versand ------------------------------------------------------------- */

interface Push {
  userId: string
  title: string
  body: string
  url?: string // Deep-Link-Ziel (#go=…); Klick öffnet den passenden Screen
}

Deno.serve(async (req: Request) => {
  // Ohne Secret gar nicht erst arbeiten. Die Function ist mit --no-verify-jwt
  // deployt, die Plattform prüft also nichts — `if (CRON_SECRET && …)` hätte
  // bei fehlendem Secret jeden durchgelassen, und der Dry-Run gibt die
  // Vorschau ALLER Versammlungen zurück. Fehlt die Konfiguration, ist das ein
  // Fehler des Betreibers und keine Erlaubnis.
  if (!CRON_SECRET) {
    console.error('[send-reminders] CRON_SECRET ist nicht gesetzt — Abbruch')
    return new Response('Server misconfigured', { status: 500 })
  }
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    // Die VAPID-Schlüssel setzt `vapidSetzen` erst unmittelbar vor dem Versand
    // — hier stand der Aufruf ungeprüft und flog bei leerem Schlüssel, obwohl
    // ein Lauf ohne Push (`SEND_PUSH` aus) völlig in Ordnung ist.
    const now = new Date()
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const todayISO = new Date(todayUTC).toISOString().slice(0, 10)
    // Wer heute schon benachrichtigt wurde ("userId|kind") → nicht erneut senden.
    const sentToday = await loadSentToday(todayISO)

    const congs = await klient.get<
      {
        id: string
        meeting_times: string
        settings: { reminders?: Partial<Reminders> } | null
      }[]
    >('congregations?select=id,meeting_times,settings')

    let sent = 0
    let expired = 0
    let skipped = 0 // heute bereits benachrichtigt (Doppel-Versand-Sperre)
    const preview: Push[] = []
    const notifRows: unknown[] = []
    const sendQueue: Array<{ push: Push; subs: SubscriptionRow[] }> = []
    // Was in diesem Lauf gesendet wird → nach echtem Versand ins reminder_log.
    const logRows: { congregation_id: string; user_id: string; kind: string }[] = []
    const uebersetzer = uebersetzerFuer()
    /*
     * Die Bibelbuch-Tabellen nachladen, bevor irgendein Rumpf entsteht.
     *
     * Im Client sind sie ein eigener, spät geholter Brocken — wer die App auf
     * Deutsch benutzt, braucht sie nie. Hier gilt das nicht: Ein Lauf erinnert
     * an die Bibellesung, und deren Bezeichnung ist eine Schriftstelle
     * („Bibellesung · Jer 44:24-30"). Ohne die Tabellen bliebe der Buchname als
     * einziges Stück deutsch stehen — mitten in einem sonst übersetzten Satz.
     */
    await bibelbuecherLaden()

    for (const cong of congs) {
      const rem: Reminders = {
        first: cong.settings?.reminders?.first ?? 7,
        last: cong.settings?.reminders?.last ?? 1,
        // Ohne eigene Einstellung: **keine** Wiederholung (T99). Der Rückfall
        // muss derselbe sein wie `STANDARD_ERINNERUNGEN` im Client — sonst
        // zeigt die App „aus" und der Versand erinnert trotzdem täglich.
        repeat: cong.settings?.reminders?.repeat ?? false,
      }
      const offsets = meetingDayOffsets(cong.meeting_times)
      const zeiten = meetingTimesOf(cong.meeting_times)

      const [weeks, fsWeeks, confs, members, persons, services, subs] = await Promise.all([
        // Die Kennung kommt aus der Spalte, nicht aus dem Blob: `data->>'start'`
        // fehlt bei Wochen, die vor migration-017 geschrieben wurden.
        klient.get<{ start: string; data: Week }[]>(
          `weeks?select=start,data&congregation_id=eq.${cong.id}&order=start.asc`,
        ),
        // Treffpunkte: eigene Tabelle, dieselbe Kennung wie `weeks`.
        klient.get<{ start: string; data: FsInstance[] }[]>(
          `fs_weeks?select=start,data&congregation_id=eq.${cong.id}&order=start.asc`,
        ).catch((err) => {
          // Fehlt die Tabelle (Migration nicht eingespielt), lieber die
          // Zusammenkünfte erinnern als den ganzen Lauf verlieren.
          console.error(`fs_weeks nicht lesbar: ${(err as Error).message}`)
          return [] as { start: string; data: FsInstance[] }[]
        }),
        klient.get<{ task_key: string; status: string }[]>(
          `confirmations?select=task_key,status&congregation_id=eq.${cong.id}`,
        ),
        klient.get<{ user_id: string; person_id: string | null; planner: boolean }[]>(
          `members?select=user_id,person_id,planner&congregation_id=eq.${cong.id}`,
        ),
        klient.get<{ id: string; fn: string; ln: string; dn: string }[]>(
          `persons?select=id,fn,ln,dn&congregation_id=eq.${cong.id}`,
        ),
        klient.get<ServiceRow[]>(
          `services?select=key,name,count,groups&congregation_id=eq.${cong.id}&order=position.asc`,
        ),
        klient.get<SubscriptionRow[]>(
          `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${cong.id}`,
        ),
      ])

      const conf = new Map(confs.map((c) => [c.task_key, c.status]))
      const personById = new Map(persons.map((p) => [p.id, p]))
      const userByName = new Map<string, string>()
      // Zuordnung bevorzugt über die Person-Id: zwei Personen desselben Namens
      // bekamen über `userByName` gegenseitig die Erinnerungen des anderen.
      // Der Namensweg bleibt als Rückfall für Altdaten ohne Id.
      const userByPerson = new Map<string, string>()
      for (const m of members) {
        const p = m.person_id ? personById.get(m.person_id) : undefined
        if (!p) continue
        userByName.set(personDisplayName(p.fn, p.ln, p.dn), m.user_id)
        userByPerson.set(p.id, m.user_id)
      }
      const userOf = (pend: Pending): string | undefined =>
        (pend.pid ? userByPerson.get(pend.pid) : undefined) ?? userByName.get(pend.name)
      const subsByUser = new Map<string, SubscriptionRow[]>()
      for (const s of subs) {
        subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
      }

      /*
       * Der Aufgaben-Schlüssel reist mit. Er wird für die Glocke gebraucht:
       * `notifications.task_key` macht aus der Mitteilung eine, auf der man
       * gleich bestätigen kann (`notif.taskId` → Knopf im Panel). Ausgerechnet
       * die Erinnerung „Zuteilung bestätigen" hatte ihn bisher nicht — der
       * Knopf war im Betrieb also nie zu sehen.
       */
      type MitKey = Eintrag & { key: string }
      const entriesByUser = new Map<string, MitKey[]>()
      const mainByUser = new Map<string, MitKey[]>() // Glocke nur an first/last-Tagen
      const unreachable: Array<{ name: string; eintrag: Eintrag }> = []

      weeks.forEach((row) => {
        const week = row.data
        const start = row.start
        if (!week || !start) return
        for (const tab of ['mid', 'we'] as const) {
          const meeting = week[tab]
          if (!meeting) continue
          // Entfällt die Zusammenkunft, gibt es nichts zu erinnern (T30). Ein
          // Ausfall ohne diese Zeile schickte Erinnerungen an einen Abend, an
          // dem niemand kommt — und die Planer-Meldung „nicht erreichbar"
          // gleich hinterher.
          if (istAusgefallenFuer(week.dev, tab)) continue
          // Verlegter Tag/Uhrzeit schlagen den Rhythmus aus den Einstellungen:
          // sonst erinnert der Versand am regulären Abend, während Anzeige und
          // Abwesenheitsprüfung den echten nennen.
          const offset = versatzMitAbweichung(week.dev, tab, meeting.date, offsets[tab])
          const zeit = zeitMitAbweichung(week.dev, tab, meeting.date, zeiten[tab])
          const days = daysUntil(start, offset, todayUTC)
          if (days === null) continue
          const kind = dueKind(rem, days)
          if (!kind) continue
          for (const pend of pendingOfMeeting(start, tab, meeting, services, conf)) {
            const entry: MitKey = {
              datum: terminText(start, offset, meeting, zeit, week.dev, tab),
              label: pend.label,
              key: pend.key,
            }
            const userId = userOf(pend)
            // „Wirklich erreichbar" = App-Konto UND mindestens ein aktives
            // Push-Abo. Wer ein Konto hat, bekommt trotzdem die persönliche
            // Erinnerung (Push an evtl. Abos + Glocke); ohne Abo bleibt das aber
            // faktisch ungesehen — daher zusätzlich die Planer-Meldung unten.
            const reachable = userId != null && (subsByUser.get(userId)?.length ?? 0) > 0
            if (userId) {
              entriesByUser.set(userId, [...(entriesByUser.get(userId) ?? []), entry])
              if (kind === 'main') {
                mainByUser.set(userId, [...(mainByUser.get(userId) ?? []), entry])
              }
            }
            // Nicht per Push erreichbar (kein Konto ODER kein Abo) → am letzten
            // Erinnerungstag den Planern melden, damit sie persönlich erinnern.
            if (!reachable && days === rem.last) {
              unreachable.push({ name: pend.name, eintrag: entry })
            }
          }
        }
      })

      // Treffpunkte: eigene Tabelle, eigener Wochentag je Eintrag. Das Datum
      // steht seit T66 an der Zeile selbst — bis dahin musste es über die
      // gleiche Positionsnummer aus `weeks` geholt werden.
      for (const row of fsWeeks) {
        const start = row.start
        if (!start) continue
        for (const pend of pendingOfFsWeek(start, row.data ?? [], conf)) {
          const days = daysUntil(start, pend.offset, todayUTC)
          if (days === null) continue
          const kind = dueKind(rem, days)
          if (!kind) continue
          const entry: MitKey = {
            datum: terminText(start, pend.offset, {}, pend.zeit),
            label: pend.label,
            key: pend.key,
          }
          const userId = userOf(pend)
          const reachable = userId != null && (subsByUser.get(userId)?.length ?? 0) > 0
          if (userId) {
            entriesByUser.set(userId, [...(entriesByUser.get(userId) ?? []), entry])
            if (kind === 'main') {
              mainByUser.set(userId, [...(mainByUser.get(userId) ?? []), entry])
            }
          }
          if (!reachable && days === rem.last) {
            unreachable.push({ name: pend.name, eintrag: entry })
          }
        }
      }

      for (const [userId, entries] of entriesByUser) {
        // Doppel-Versand-Sperre: heute schon persönlich erinnert → überspringen
        // (gilt auch für die Glocke, die untrennbar zur selben Erinnerung gehört).
        if (sentToday.has(`${userId}|self`)) {
          skipped++
          continue
        }
        // Je Sprache ein eigener Versand: der Text steht fest, sobald die
        // Nachricht das Gerät erreicht. Wer Geräte in zwei Sprachen hat,
        // bekommt auf jedem die passende.
        for (const [lang, subs] of nachSprache(subsByUser.get(userId) ?? [])) {
          const tr = uebersetzer(lang)
          const push: Push = {
            userId,
            title: pushTexte(lang).erinnerung,
            body: entries.map((e) => uebersetzt(e, tr)).join(' · '),
            url: `${APP_URL}#go=aufgaben`,
          }
          preview.push(push)
          sendQueue.push({ push, subs })
        }
        // Glocke nur an first/last-Tagen (mainByUser ⊆ entriesByUser). Sie wird
        // bewusst NICHT hier übersetzt: Mitteilungen stehen kanonisch deutsch
        // in der Datenbank und werden beim Anzeigen in die Sprache des Lesers
        // gebracht (NOTIF_TITLE_KEY in i18n/ui.ts).
        const mainEntries = mainByUser.get(userId)
        if (mainEntries) {
          notifRows.push({
            congregation_id: cong.id,
            user_id: userId,
            type: 'erinnerung',
            title: 'Erinnerung: Zuteilung bestätigen',
            body: mainEntries.map(kanonisch).join(' · '),
            // Nur bei **einer** offenen Aufgabe: dann trägt die Glocke den
            // Bestätigen-Knopf, und die Erinnerung lässt sich an Ort und Stelle
            // erledigen. Bei mehreren zeigte ein einzelner Knopf auf eine
            // willkürliche davon — dafür gibt es das Bestätigungsblatt.
            ...(mainEntries.length === 1 ? { task_key: mainEntries[0].key } : {}),
          })
        }
        logRows.push({ congregation_id: cong.id, user_id: userId, kind: 'self' })
      }
      if (unreachable.length > 0) {
        for (const m of members) {
          if (!m.planner) continue
          if (sentToday.has(`${m.user_id}|planner`)) {
            skipped++
            continue
          }
          for (const [lang, subs] of nachSprache(subsByUser.get(m.user_id) ?? [])) {
            // Auch die Sammelmeldung an die Planer: derselbe Rumpf, je Sprache
            // eigens gebaut. Der Name bleibt, was er ist — Eigennamen werden
            // nicht übersetzt.
            const tr = uebersetzer(lang)
            const p: Push = {
              userId: m.user_id,
              title: pushTexte(lang).unerreichbar,
              body: unreachable.map((u) => `${u.name} — ${uebersetzt(u.eintrag, tr)}`).join(' · '),
              url: `${APP_URL}#go=planen`,
            }
            preview.push(p)
            sendQueue.push({ push: p, subs })
          }
          /*
           * **Auch in die Glocke, nicht nur als Push.**
           *
           * Diese Meldung ging bis dahin ausschließlich per Push hinaus — und
           * die Schleife darüber läuft je Push-Abo. Ein Planer ohne Abo bekam
           * also gar nichts, wurde aber unten trotzdem als benachrichtigt
           * verbucht. Genau die Auskunft, die er braucht, um jemanden
           * persönlich zu erinnern, erreichte ihn damit nie.
           *
           * Kanonisch deutsch wie jede Glocken-Zeile; übersetzt wird beim
           * Anzeigen. Kein `task_key`: die Aufgabe gehört einem anderen, der
           * Planer hat hier nichts zu bestätigen.
           */
          notifRows.push({
            congregation_id: cong.id,
            user_id: m.user_id,
            type: 'erinnerung',
            title: TITEL_UNERREICHBAR,
            body: unreachable.map((u) => `${u.name} — ${kanonisch(u.eintrag)}`).join(' · '),
          })
          logRows.push({ congregation_id: cong.id, user_id: m.user_id, kind: 'planner' })
        }
      }
    }

    if (SEND_PUSH) {
      // Jede Zustellung ist eine eigene HTTPS-Fahrt zu FCM/Mozilla/Apple und
      // hängt an keiner anderen — gebündelt wird deshalb über den **ganzen**
      // Lauf, nicht je Empfänger (`_shared/push.ts`).
      vapidSetzen(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
      const zustellungen: Zustellung[] = sendQueue.flatMap(({ push, subs }) =>
        subs.map((abo) => ({
          abo,
          titel: push.title,
          body: push.body,
          url: push.url ?? APP_URL,
        })),
      )
      const erg = await zustellen(zustellungen, abbestellen)
      sent += erg.gesendet
      expired += erg.abgelaufen
      await klient.insert('notifications', notifRows)
      // Versand-Tagebuch schreiben, damit ein zweiter Lauf heute nicht doppelt
      // sendet. Nach dem eigentlichen Versand — scheitert das Schreiben, wurde
      // immerhin gesendet (schlimmstenfalls eine Wiederholung, nie Verlust).
      await klient.insert('reminder_log', logRows)
      // Wartung im selben Lauf: alte Mitteilungen nach Aufbewahrungsfrist löschen
      await pruneNotifications()
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun: !SEND_PUSH,
        pushes: SEND_PUSH ? sent : preview.length,
        skipped, // heute bereits benachrichtigt (Doppel-Versand-Sperre)
        expired,
        notifications: notifRows.length,
        // Vorschau nur im Dry-Run — zum gefahrlosen Testen per curl
        preview: SEND_PUSH ? undefined : preview,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
