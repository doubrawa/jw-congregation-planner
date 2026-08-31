/**
 * Daten-Zugriff auf Supabase (Persistenz). Lädt die Daten einer Versammlung
 * für den eingeloggten Nutzer und schreibt Änderungen zurück. Alle Funktionen
 * setzen einen konfigurierten Client voraus (siehe supabase.ts) — im Demo-Modus
 * werden sie nicht aufgerufen.
 *
 * Persistiert: Versammlung (Stammdaten + Einstellungen), Mitgliedschaft
 * (Rolle), Personen, Dienste, Wochen (als JSONB), eigene Abwesenheiten,
 * Mitteilungen und Aufgaben-Bestätigungen. Nicht persistiert (bewusst,
 * geräteweise in localStorage): App-Sprache und Darstellung.
 */

import { STANDARD_ERINNERUNGEN } from '../data/vorgaben'
import { fsBaseFromWeeks, fsMigrateInstIds, fsMigrateLeaderPids, fsWochenKennungen, fsWochenStart, regenFsWeeks } from '../data/fs'
import { itemTaskKey, partTaskKey, sentKey, taskKeyVorbei } from '../data/planning'
import type { EntzogeneZusage } from '../data/plan-versand'
import {
  displayName,
  eindeutigeNamen,
  emptyQualifications,
  MEETING_TABS,
  neueItemId,
  normalizeChairKeys,
  serviceQualKey,
  shortDisplayName,
} from '../data/helpers'
import type {
  Absence,
  ConfirmationMap,
  FsInstance,
  FsRule,
  Group,
  HelperSlot,
  Invite,
  Member,
  Notification,
  NotificationType,
  Person,
  Qualifications,
  Reminders,
  Role,
  SentLog,
  Service,
  SlotAssignment,
  TaskStatus,
  Week,
} from '../data/types'
import { supabase } from './supabase'

/* ---- Row-Typen (Spalten aus supabase/schema.sql) ------------------------ */

interface PersonRow {
  id: string
  fn: string
  ln: string
  dn: string
  planner: boolean
  role: string
  female: boolean
  tel: string
  mail: string
  priv: Qualifications
  grp: string | null
  fam: string | null
}

interface ServiceRow {
  key: string
  name: string
  count: number
  priv: string | null
  groups: boolean
  position: number
}

interface GroupRow {
  id: string
  name: string
  overseer_id: string | null
  assistant_id: string | null
  position: number
}

interface WeekRow {
  /** Kennung der Woche (T66): ihr Montag. Eigene Spalte, nicht aus `data`. */
  start: string
  data: Week
  /** Stand der Zeile — Grundlage der Konfliktprüfung beim Speichern (T39). */
  updated_at: string
}

interface AbsenceRow {
  id: string
  person_id: string | null
  user_id: string | null // NULL = importiert (migration-021)
  from_date: string
  to_date: string
  reason: string
}

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  /** Aufgabe, um die es geht — seit migration-020; ältere Zeilen tragen null. */
  task_key?: string | null
}

export interface ConfirmationRow {
  task_key: string
  status: string
}

/**
 * Bestätigungs-Zeilen zur Karte `task_key → Status`.
 *
 * Ein Platz kann **zwei** Zeilen haben: Sagt A ab und springt B ein, steht unter
 * demselben `task_key` A mit „verhindert" und B mit „bestätigt". Die Abfrage
 * kommt ungeordnet zurück — wer zuletzt gelesen wurde, gewann. Beim Einspringen
 * hieß das: Nach dem Neuladen stand der Platz mal als besetzt, mal als abgesagt
 * da, und das längst erledigte Ersatzgesuch tauchte wieder auf.
 *
 * **„Bestätigt" gewinnt.** Ein Platz hat genau einen Bearbeiter; hat einer
 * bestätigt, ist er besetzt — gleich wer vorher abgesagt hat. Wer selbst erst
 * zusagt und dann absagt, hat nur **eine** Zeile (dieselbe wird überschrieben);
 * dieser Fall wird also nicht verdeckt.
 */
export function confirmationMap(rows: readonly ConfirmationRow[]): ConfirmationMap {
  const out: ConfirmationMap = {}
  for (const row of rows) {
    if (row.status !== 'bestätigt' && row.status !== 'verhindert') continue
    if (out[row.task_key] === 'bestätigt') continue
    out[row.task_key] = row.status
  }
  return out
}

interface MemberRow {
  user_id: string
  person_id: string | null
  planner: boolean
  email: string
}

interface InviteRow {
  id: string
  code: string
  person_id: string | null
  planner: boolean
}

/** congregations.settings (JSONB) — versammlungsweite Einstellungen. */
interface CongregationSettings {
  reminders?: Partial<Reminders>
  congLang?: string
  progLangs?: string[] // weitere Programmsprachen (deutsche Anzeigenamen)
  auxClass?: boolean // Zusaetzliche Klasse eingerichtet (jw.org S-38, Absatz 26)
}

const ROLES: Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger', 'keine']
const asRole = (r: string): Role => (ROLES.includes(r as Role) ? (r as Role) : 'verkuendiger')

const NOTIF_TYPES: NotificationType[] = ['zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert']
const asNotifType = (t: string): NotificationType =>
  NOTIF_TYPES.includes(t as NotificationType) ? (t as NotificationType) : 'gesendet'

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

/**
 * Migriert gespeicherte Qualifikationen auf das aktuelle Schema: die festen
 * Programm-Bereiche sind immer gesetzt, das frühere kombinierte `lesen` wird auf
 * `bibellesung`+`leser` gespiegelt. Alle übrigen gespeicherten Keys bleiben
 * erhalten — das sind die Hilfsdienst-Bereiche (`svc:<key>`) und die alten
 * festen Dienst-Bereiche, die `migrateServicePrivs` noch braucht.
 */
export function normalizePriv(raw: Qualifications | null | undefined): Qualifications {
  const r = (raw ?? {}) as unknown as Record<string, unknown>
  const priv = emptyQualifications()
  for (const [key, value] of Object.entries(r)) priv[key] = Boolean(value)
  if (r.lesen) {
    priv.bibellesung = true
    priv.leser = true
  }
  // Früher gab es einen gemeinsamen `vorsitz`; heute getrennt nach
  // Zusammenkunft. Bis der echte Split (NWS) gesetzt ist, beide gewähren —
  // so verliert niemand das Vorsitz-Recht.
  if (r.vorsitz) {
    priv.vorsitzMid = true
    priv.vorsitzWe = true
  }
  delete priv['vorsitz']
  return priv
}

/**
 * Hebt Alt-Datensätze auf die dienst-eigenen Bereiche: früher teilten sich
 * mehrere Hilfsdienste einen festen Bereich (Eingangs- und Saalordner beide
 * `ordner`), heute hat jeder Dienst seinen eigenen (`svc:<key>`). Fehlt der
 * neue Bereich bei einer Person, wird er aus dem alten Bereich des Dienstes
 * übernommen. Idempotent: bereits migrierte Bereiche bleiben unangetastet.
 */
export function migrateServicePrivs(persons: Person[], services: Service[]): Person[] {
  const legacy = services.flatMap((s) => (s.legacyPriv ? [[serviceQualKey(s.key), s.legacyPriv] as const] : []))
  if (legacy.length === 0) return persons
  return persons.map((p) => {
    const priv = { ...p.priv }
    for (const [key, old] of legacy) {
      if (priv[key] === undefined) priv[key] = Boolean(priv[old])
    }
    return { ...p, priv }
  })
}

/*
 * Die Umstellung der Bestätigungs-Schlüssel von der Wochen-**Position** auf die
 * Wochen-**Kennung** stand bis T66 Stufe 3 hier: `migrateTaskKeyWeeks` schrieb
 * `"60|mid|part|k3f9x|0"` beim Laden auf `"2026-09-07|mid|…"` um, so wie
 * `migrateItemIds` es darunter mit den Programmpunkten tut.
 *
 * Sie ist **weggefallen, nicht vergessen**: Ihre Brücke war `weeks[60]` — der
 * Array-Index als Datenbank-Position. Genau die gibt es seit Stufe 3 nicht mehr;
 * der Index sagt nur noch, was vor was kommt. Eine Migration, die trotzdem
 * hierbliebe, ordnete Bestätigungen der falschen Woche zu.
 *
 * Was übrig war, hebt **migration-018** in SQL — dort liegen `position` und
 * `start` ein letztes Mal nebeneinander, und zwar für alle Versammlungen, nicht
 * nur für die, deren Planer sich anmeldet.
 */

/**
 * Migriert in den Wochen gespeicherte Zuteilungs-Namen von der früheren
 * Kurzform "V. Nachname" auf den heutigen Anzeigenamen (voller Name bzw.
 * `dn`). Nur eindeutige Treffer werden ersetzt; "Gruppe N" und externe Namen
 * (Gastredner) bleiben unangetastet. Idempotent — aktuelle Namen matchen die
 * Kurzform nicht mehr. Rein im Speicher; persistiert wird beim nächsten
 * Speichern der jeweiligen Woche.
 */
export function migrateAssignmentNames(weeks: Week[], persons: Person[]): Week[] {
  const map = new Map<string, string>()
  const dupes = new Set<string>()
  for (const p of persons) {
    const short = shortDisplayName(p)
    const full = displayName(p)
    if (short === full) continue
    if (map.has(short)) dupes.add(short)
    map.set(short, full)
  }
  for (const d of dupes) map.delete(d) // mehrdeutig → nicht anfassen
  if (map.size === 0) return weeks
  const fix = (name: string): string => map.get(name) ?? name
  return weeks.map((week) => ({
    ...week,
    mid: mapMeetingNames(week.mid, fix),
    we: mapMeetingNames(week.we, fix),
  }))
}

/**
 * Trägt jedem Programmpunkt eine **stabile Kennung** nach und benennt die
 * Bestätigungen einmalig mit (T37).
 *
 * Die Bestätigungen hingen an der Position (`"60|mid|part|2|1|0"`). Das ist die
 * Ursache von T16 (ein eingefügter LAC-Punkt verschiebt alle folgenden, die
 * Bestätigungen blieben an der alten Zahl kleben) und der Grund, warum der
 * Wochen-Index die Datenbank-Position sein *muss*.
 *
 * **Idempotent**: ein Punkt, der schon eine Kennung trägt, wird übersprungen.
 * Beim zweiten Laden gibt es also nichts mehr zu tun.
 *
 * **Verlustfrei**: umbenannt wird nur, was es gibt. Ein Punkt ohne Bestätigung
 * bekommt einfach seine Kennung; eine Bestätigung ohne passenden Punkt (Altlast
 * eines gelöschten Slots) bleibt liegen, wo sie ist, und stört niemanden.
 *
 * Beide Räume werden geprüft — Hauptsaal und Zusätzliche Klasse —, und zwar
 * unabhängig davon, ob die Klasse gerade besteht: ihre Bestätigungen bleiben
 * beim Abschalten bewusst stehen, damit ein Wiedereinschalten sie wiederfindet.
 */
export function migrateItemIds(
  weeks: Week[],
  confirmations: ConfirmationMap,
): { weeks: Week[]; confirmations: ConfirmationMap; renames: Array<[string, string]> } {
  const renames: Array<[string, string]> = []
  let anyChanged = false

  const next = weeks.map((week) => {
    let weekChanged = false
    const kopie = { ...week }
    for (const tab of MEETING_TABS) {
      let meetingChanged = false
      const sections = week[tab].sections.map((section, si) => ({
        ...section,
        items: section.items.map((item, ii) => {
          if ('song' in item || item.iid) return item
          meetingChanged = true
          const iid = neueItemId()
          // Positions-Schlüssel → Kennungs-Schlüssel, für beide Räume.
          for (const [raum, slots] of [
            [false, item.names] as const,
            [true, item.aux ?? []] as const,
          ]) {
            slots.forEach((_slot, ni) => {
              const alt = partTaskKey(week.start, tab, si, ii, ni, raum)
              if (!(alt in confirmations)) return
              renames.push([alt, itemTaskKey(week.start, tab, iid, ni, raum)])
            })
          }
          return { ...item, iid }
        }),
      }))
      if (!meetingChanged) continue
      kopie[tab] = { ...week[tab], sections }
      weekChanged = true
    }
    if (!weekChanged) return week
    anyChanged = true
    return kopie
  })

  if (renames.length === 0 && !anyChanged) return { weeks, confirmations, renames }

  const nextConf = { ...confirmations }
  for (const [alt, neu] of renames) {
    const status = nextConf[alt]
    if (status === undefined) continue // umbenannt wird nur, was es gibt
    nextConf[neu] = status
    delete nextConf[alt]
  }
  return { weeks: anyChanged ? next : weeks, confirmations: nextConf, renames }
}

/**
 * Alt-Schlüssel der Treffpunkte auf die stabile Kennung heben (T87):
 * `fs|2026-01-26|3|r1c8…` → `fs|2026-01-26|r1c8…`
 *
 * Die `3` war die **Position der Woche im Ladefenster** — die letzte
 * Ordnungszahl, die T66 übersehen hatte. Sie ändert sich, sobald das Fenster
 * weiterrutscht (es hält die jüngsten 52 Wochen), und nahm die Bestätigung
 * jedes Treffpunkts mit ins Leere.
 *
 * Rein und idempotent: Schlüssel ohne Zahl an dritter Stelle bleiben unberührt,
 * also auch die schon umgestellten und die von Hand angelegten Treffpunkte
 * (`x<uuid>`). Regel-Kennungen sind `r<uuid>` und damit nie eine Zahl — ein
 * Schlüssel kann also nicht versehentlich zweimal gekürzt werden.
 */
export function migrateFsTaskKeys(confirmations: ConfirmationMap): {
  confirmations: ConfirmationMap
  renames: Array<[string, string]>
} {
  const ALT = /^fs\|(\d{4}-\d{2}-\d{2})\|\d+\|(.+)$/
  const renames: Array<[string, string]> = []
  for (const key of Object.keys(confirmations)) {
    const treffer = ALT.exec(key)
    if (treffer) renames.push([key, `fs|${treffer[1]}|${treffer[2]}`])
  }
  if (renames.length === 0) return { confirmations, renames }
  const next = { ...confirmations }
  for (const [alt, neu] of renames) {
    const status = next[alt]
    if (status === undefined) continue
    next[neu] = status
    delete next[alt]
  }
  return { confirmations: next, renames }
}

/**
 * **Treffpunkt-Schlüssel von der Ordnungszahl auf die Wochenkennung** (T100).
 *
 * Bis dahin baute der Client den Montag als `fsBase + wi·7`. Das stimmt nur bei
 * lückenlosem Bestand; fehlt eine Woche, liegt jede spätere sieben Tage daneben
 * — und die Edge Functions nehmen den Montag aus der Datenbankzeile, reden also
 * über eine andere Woche. Bestätigungen aus dieser Zeit tragen den alten
 * Schlüssel und fänden ihren Platz nicht wieder: Der Leiter stünde erneut als
 * unbestätigt da und bekäme Erinnerungen für etwas, das er längst zugesagt hat.
 *
 * Umbenannt wird nur, wo beide Kennungen wirklich auseinandergehen — bei
 * lückenlosem Bestand (der Normalfall) gibt es nichts zu tun.
 *
 * **In einem Zug aus dem Ausgangsstand**, nicht Schritt für Schritt: Bei einer
 * Lücke rutschen die Wochen um eine Stelle, und der alte Schlüssel der einen
 * Woche ist der neue der nächsten. Nacheinander angewandt überschriebe sich die
 * Kette selbst.
 *
 * Ein bereits belegter Zielschlüssel bleibt unangetastet — er ist der
 * authentische Eintrag, der alte daneben der Irrläufer.
 */
export function migrateFsWochenKeys(
  confirmations: ConfirmationMap,
  weeks: ReadonlyArray<{ start?: string }>,
  fsBase: Date | null,
): { confirmations: ConfirmationMap; renames: Array<[string, string]> } {
  /*
   * **Einmal über die Schlüssel, nicht einmal je verschobener Woche.** Genau
   * der Fall, für den diese Funktion geschrieben ist — eine Lücke im Bestand —
   * macht *jede* spätere Woche verschoben: Bei einer Lücke in der Mitte sind
   * das gut zwei Dutzend. Der verschachtelte Weg materialisierte für jede von
   * ihnen die volle Schlüsselliste neu und verglich sie ganz. Das läuft im
   * Ladepfad, blockierend, vor dem ersten Bild.
   *
   * Die Woche steht im Schlüssel an fester Stelle (`fs|<woche>|…`), lässt sich
   * also herausschneiden und nachschlagen, statt jeden Kandidaten
   * durchzuprobieren.
   */
  const ziele = new Map(verschobeneWochen(weeks, fsBase))
  const gefunden: Array<[string, string]> = []
  if (ziele.size > 0) {
    for (const key of Object.keys(confirmations)) {
      if (!key.startsWith('fs|')) continue
      const ende = key.indexOf('|', 3)
      if (ende < 0) continue
      const neu = ziele.get(key.slice(3, ende))
      if (neu === undefined) continue
      gefunden.push([key, `fs|${neu}|${key.slice(ende + 1)}`])
    }
  }
  // Ein besetztes Ziel bleibt stehen — **es sei denn**, es zieht selbst weiter.
  // Bei einer Lücke rutscht die ganze Kette: Der alte Schlüssel der einen Woche
  // ist der neue der nächsten, und ohne diese Ausnahme blockierte jedes Glied
  // seinen Vorgänger. Die Prüfung braucht deshalb erst die volle Liste.
  const zieht = new Set(gefunden.map(([alt]) => alt))
  const renames = gefunden.filter(
    ([, ziel]) => confirmations[ziel] === undefined || zieht.has(ziel),
  )
  if (renames.length === 0) return { confirmations, renames }
  const next = { ...confirmations }
  for (const [alt] of renames) delete next[alt]
  for (const [alt, neu] of renames) {
    const status = confirmations[alt]
    if (status !== undefined) next[neu] = status
  }
  return { confirmations: next, renames }
}

/** Wochen, deren gerechnete Kennung nicht ihrer echten entspricht. */
function verschobeneWochen(
  weeks: ReadonlyArray<{ start?: string }>,
  fsBase: Date | null,
): Array<[string, string]> {
  const out: Array<[string, string]> = []
  weeks.forEach((w, wi) => {
    const gerechnet = fsWochenStart(fsBase, wi)
    if (w.start && gerechnet && gerechnet !== w.start) out.push([gerechnet, w.start])
  })
  return out
}

/**
 * Zieht eine Personen-Umbenennung durch bereits geplante Wochen: ersetzt exakt
 * den alten Anzeigenamen durch den neuen in allen Zuteilungen (Programmpunkte +
 * Hilfsdienste) der kanonischen Wochen. Unveränderte Wochen behalten ihre
 * Referenz (der Aufrufer erkennt daran, welche Wochen neu gespeichert werden
 * müssen). Sprachvarianten (Week.alt) tragen keine Namen — nur die kanonische
 * Woche wird angefasst.
 */
export function renameInWeeks(weeks: Week[], id: string, oldName: string, newName: string): Week[] {
  // Leerer alter Name: nichts tun (sonst würden offene Slots mit leerem Namen
  // versehentlich mit-umbenannt). Ein zugeteilter Slot trägt immer einen Namen.
  if (!oldName || oldName === newName) return weeks
  return mapPersonSlots(weeks, id, oldName, (slot) =>
    slot.name === newName ? slot : { ...slot, name: newName },
  )
}

/**
 * Löst die Verweise auf eine gelöschte Person aus den Wochen: die `pid`
 * verschwindet, **der Name bleibt als Text stehen** (so war es immer
 * dokumentiert — eine geplante Woche soll nicht plötzlich Lücken zeigen).
 *
 * Ohne das bliebe ein Fremdschlüssel ins Leere zeigen. Die Folgen sind still
 * und unangenehm: `gehoertZu` entscheidet über die Id, findet niemanden mehr,
 * und der Slot zählt nirgends — nicht in der Auslastung, nicht in den
 * Konflikten, nicht in den Aufgaben. Legt der Planer dieselbe Person neu an,
 * bekommt sie eine neue Id, und der alte Verweis passt nie wieder.
 *
 * Ohne `pid` greift wieder der Namensweg: die Zuteilung verhält sich wie ein
 * Altdatensatz und wird beim nächsten Laden erneut zugeordnet
 * (`migrateAssignmentPids`), sobald es wieder jemanden dieses Namens gibt.
 */
export function dropPersonPid(weeks: Week[], id: string): Week[] {
  return mapPersonSlots(weeks, id, null, (slot) => {
    if (!slot.pid) return slot
    const { pid: _weg, ...ohne } = slot
    return ohne
  })
}

/**
 * Bildet jeden Slot einer Person über `fix` ab — Programmpunkte (Hauptsaal
 * **und** Zusätzliche Klasse), den Ratgeber der Klasse und die Hilfsdienste.
 *
 * Ein Slot gehört zur Person, wenn seine `pid` passt (stabil) — oder, ohne
 * `pid` (Altdaten, Hilfsdienste), sein Name dem angegebenen entspricht.
 * `oldName: null` schaltet den Namensweg ab: beim Lösen einer Id ist nur sie
 * gemeint, nicht jeder Gleichnamige.
 *
 * **Klasse und Ratgeber waren hier lange nicht dabei** (bei T38 aufgefallen).
 * Beide tragen `pid`, funktional stimmte also alles — aber der Anzeigename
 * blieb nach einer Umbenennung der alte. Auf dem Programmblatt der Klasse stand
 * dann ein Name, den es nicht mehr gibt.
 *
 * Unveränderte Wochen behalten ihre Referenz; daran erkennt der Aufrufer, welche
 * er speichern muss. Sprachvarianten (`Week.alt`) tragen keine Namen.
 */
function mapPersonSlots(
  weeks: Week[],
  id: string,
  oldName: string | null,
  fix: (slot: SlotAssignment) => SlotAssignment,
): Week[] {
  const meins = (slot: { pid?: string; name: string }): boolean =>
    slot.pid ? slot.pid === id : oldName !== null && slot.name === oldName

  let anyChanged = false
  const mapMeeting = (m: Week['mid']): Week['mid'] => {
    let changed = false
    /** Eine Platzreihe (Hauptsaal oder Klasse); gibt dieselbe zurück, wenn nichts passt. */
    const mapReihe = <T extends SlotAssignment>(arr: T[] | undefined): T[] | undefined => {
      if (!arr) return arr
      let reiheChanged = false
      const next = arr.map((slot) => {
        if (!meins(slot)) return slot
        const neu = fix(slot) as T
        if (neu !== slot) reiheChanged = true
        return neu
      })
      if (!reiheChanged) return arr
      changed = true
      return next
    }

    const sections = m.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if ('song' in item) return item
        const names = mapReihe(item.names) ?? item.names
        const aux = mapReihe(item.aux)
        if (names === item.names && aux === item.aux) return item
        return { ...item, names, ...(aux ? { aux } : {}) }
      }),
    }))

    // Ratgeber der Zusätzlichen Klasse: eine Zuteilung je Zusammenkunft.
    let ratgeber = m.auxRatgeber
    if (ratgeber && meins(ratgeber)) {
      const neu = fix(ratgeber)
      if (neu !== ratgeber) {
        ratgeber = neu
        changed = true
      }
    }

    // Hilfsdienste tragen keine Rolle und keinen Bereich, sonst dieselbe Regel;
    // die Reinigungs-Rotation („Gruppe N") hat weder pid noch Personennamen.
    let helpersChanged = false
    const helpers = Object.fromEntries(
      Object.entries(m.helpers).map(([key, arr]) => [
        key,
        arr.map((slot) => {
          if (!meins(slot)) return slot
          const neu = fix(slot)
          if (neu !== slot) helpersChanged = true
          return { name: neu.name, ...(neu.pid ? { pid: neu.pid } : {}) }
        }),
      ]),
    )
    if (!changed && !helpersChanged) return m
    anyChanged = true
    return { ...m, sections, helpers, ...(ratgeber ? { auxRatgeber: ratgeber } : {}) }
  }

  const next = weeks.map((week) => {
    const mid = mapMeeting(week.mid)
    const we = mapMeeting(week.we)
    return mid === week.mid && we === week.we ? week : { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

/**
 * Bildet **alle** zugeteilten Namen einer Zusammenkunft über `fix` ab und
 * liefert eine neue Zusammenkunft. Lieder tragen keine Namen und bleiben
 * unangetastet. Basis der Lade-Migration (migrateAssignmentNames).
 *
 * „Alle" heißt vier Sorten: Hauptsaal, Zusätzliche Klasse, Ratgeber und
 * Hilfsdienste. Die mittleren beiden fehlten hier — dieselbe Lücke wie
 * seinerzeit in `mapPersonSlots` (T38) und in `migrateAssignmentPids`.
 * `alle-plaetze.test.ts` fragt seither jede solche Funktion nach allen vieren.
 */
function mapMeetingNames(meeting: Week['mid'], fix: (n: string) => string): Week['mid'] {
  const platz = <T extends { name: string }>(slot: T): T => ({ ...slot, name: fix(slot.name) })
  return {
    ...meeting,
    sections: meeting.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        'song' in item
          ? item
          : {
              ...item,
              names: item.names.map(platz),
              ...(item.aux ? { aux: item.aux.map(platz) } : {}),
            },
      ),
    })),
    ...(meeting.auxRatgeber ? { auxRatgeber: platz(meeting.auxRatgeber) } : {}),
    helpers: Object.fromEntries(
      Object.entries(meeting.helpers).map(([key, arr]) => [key, arr.map(platz)]),
    ),
  }
}

/**
 * Backfill der Person-Id (pid) an Programmpunkt- UND Hilfsdienst-Slots aus dem
 * gespeicherten Anzeigenamen — für Bestandsdaten ohne pid. Nur eindeutige Namen
 * werden zugeordnet; mehrdeutige (Dubletten), externe Redner und die
 * Reinigungs-Rotation („Gruppe N") bleiben unangetastet. Idempotent. Rein im
 * Speicher; persistiert beim nächsten Speichern der Woche.
 */
export function migrateAssignmentPids(weeks: Week[], persons: Person[]): Week[] {
  const byName = eindeutigeNamen(persons)
  if (byName.size === 0) return weeks
  let anyChanged = false
  /** Platz mit `pid` versehen, wenn der Name eindeutig eine Person meint. */
  const mitPid = <T extends { name: string; pid?: string }>(slot: T): T => {
    if (slot.pid || !slot.name) return slot
    const id = byName.get(slot.name)
    return id ? { ...slot, pid: id } : slot
  }
  const fixMeeting = (m: Week['mid']): Week['mid'] => {
    let changed = false
    const sections = m.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if ('song' in item) return item
        let itemChanged = false
        const names = item.names.map((slot) => {
          const neu = mitPid(slot)
          if (neu !== slot) itemChanged = true
          return neu
        })
        // Die Zusätzliche Klasse gehört dazu — dieselbe Lücke, die T38 an
        // `mapPersonSlots` geschlossen hat. Ohne sie bekam ein Platz der Klasse
        // seine Id nie zurück: beim Löschen einer Person wird sie überall
        // entfernt (`dropPersonPid`), beim Wiederanlegen aber nur im Hauptsaal
        // wiederhergestellt. Der Platz zählte dann nirgends mehr.
        const aux = item.aux?.map((slot) => {
          const neu = mitPid(slot)
          if (neu !== slot) itemChanged = true
          return neu
        })
        if (!itemChanged) return item
        changed = true
        return aux ? { ...item, names, aux } : { ...item, names }
      }),
    }))
    // Der Ratgeber der Klasse, aus demselben Grund.
    const auxRatgeber = m.auxRatgeber ? mitPid(m.auxRatgeber) : m.auxRatgeber
    if (auxRatgeber !== m.auxRatgeber) changed = true
    // Hilfsdienste ebenso (Gruppen-Namen matchen keine Person → bleiben ohne pid).
    const helpers = Object.fromEntries(
      Object.entries(m.helpers).map(([key, arr]) => [
        key,
        arr.map((slot) => {
          const neu = mitPid(slot)
          if (neu !== slot) changed = true
          return neu
        }),
      ]),
    )
    if (!changed) return m
    anyChanged = true
    // `auxRatgeber` nur setzen, wenn es die Zusammenkunft hat — sonst stünde
    // der Schlüssel mit `undefined` da, wo vorher gar keiner war.
    return auxRatgeber ? { ...m, sections, helpers, auxRatgeber } : { ...m, sections, helpers }
  }
  const next = weeks.map((week) => {
    const mid = fixMeeting(week.mid)
    const we = fixMeeting(week.we)
    return mid === week.mid && we === week.we ? week : { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

/**
 * Alt-Format der Hilfsdienste (reine Namens-Strings) auf das Slot-Objekt
 * { name, pid? } heben. Bestandsdaten in der DB haben helpers als string[];
 * muss vor allen weiteren Wochen-Transformationen laufen. Idempotent.
 */
export function normalizeWeekHelpers(weeks: Week[]): Week[] {
  const fix = (m: Week['mid']): Week['mid'] => {
    let changed = false
    const helpers = Object.fromEntries(
      Object.entries(m.helpers).map(([key, arr]) => [
        key,
        (arr as unknown[]).map((e) => {
          if (typeof e === 'string') {
            changed = true
            return { name: e }
          }
          return e as HelperSlot
        }),
      ]),
    )
    return changed ? { ...m, helpers } : m
  }
  let anyChanged = false
  const next = weeks.map((week) => {
    const mid = fix(week.mid)
    const we = fix(week.we)
    if (mid === week.mid && we === week.we) return week
    anyChanged = true
    return { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fn: r.fn,
    ln: r.ln,
    dn: r.dn || undefined,
    planner: r.planner || undefined,
    role: asRole(r.role),
    female: r.female || undefined,
    tel: r.tel,
    mail: r.mail,
    priv: normalizePriv(r.priv),
    grp: r.grp ?? null,
    fam: r.fam ?? null,
  }
}

function personToRow(p: Person, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    fn: p.fn,
    ln: p.ln,
    dn: p.dn ?? '',
    planner: Boolean(p.planner),
    role: p.role,
    female: Boolean(p.female),
    tel: p.tel,
    mail: p.mail,
    priv: p.priv,
    grp: p.grp ?? null,
    fam: p.fam ?? null,
  }
}

function groupFromRow(r: GroupRow): Group {
  return { id: r.id, name: r.name, ov: r.overseer_id, as: r.assistant_id }
}

function groupToRow(g: Group, congregationId: string, position: number) {
  return {
    id: g.id,
    congregation_id: congregationId,
    name: g.name,
    overseer_id: g.ov,
    assistant_id: g.as,
    position,
  }
}

function serviceFromRow(r: ServiceRow): Service {
  return {
    key: r.key,
    name: r.name,
    count: r.count,
    groups: r.groups,
    legacyPriv: r.priv,
  }
}

// Die Spalte `priv` ist Altbestand: neue Dienste leiten ihren Bereich aus dem
// Key ab. Der gespeicherte Wert wird unverändert durchgereicht, damit
// `migrateServicePrivs` bei jedem Laden dieselbe Zuordnung findet.
function serviceToRow(s: Service, congregationId: string, position: number) {
  return {
    congregation_id: congregationId,
    key: s.key,
    name: s.name,
    count: s.count,
    priv: s.legacyPriv ?? null,
    groups: Boolean(s.groups),
    position,
  }
}

function absenceFromRow(r: AbsenceRow): Absence {
  return {
    id: r.id,
    personId: r.person_id,
    userId: r.user_id,
    from: r.from_date,
    to: r.to_date,
    reason: r.reason,
  }
}

/*
 * Hier stand `relativeTime()` und baute aus dem Zeitstempel einen **deutschen
 * Satz** („vor 3 Std."), der als `Notification.time` mitgeführt wurde.
 * Übersetzen ließ er sich danach nur noch über eine feste Liste von
 * Zeichenketten — und die deckte, wie am 13.8.2026 nachgemessen, ausgerechnet
 * die Stundenzahl ab, die zufällig in den Testdaten stand. Jede andere blieb
 * deutsch, in allen 33 Sprachen.
 *
 * Die Zeile trägt jetzt ihren Zeitstempel (`at`), und die Form entsteht beim
 * Anzeigen — `relativeZeit` in i18n/zeit.ts, über `Intl.RelativeTimeFormat`.
 */

function notificationFromRow(r: NotificationRow): Notification {
  return {
    id: r.id,
    type: asNotifType(r.type),
    title: r.title,
    text: r.body,
    at: r.created_at,
    read: r.read,
    ...(r.task_key ? { taskId: r.task_key } : {}),
  }
}

/**
 * Wie viele Glocken-Zeilen ein Ladevorgang mitnimmt. Älteres räumt
 * `send-reminders` serverseitig ab (30 Tage).
 */
const NOTIF_LIMIT = 50

/**
 * Die Glocken-Abfrage — **eine** Fassung für den vollen Ladevorgang und für das
 * Nachladen beim Öffnen der Glocke. Liefe sie auseinander (andere Grenze,
 * andere Sortierung), zeigte die Glocke nach dem Nachladen etwas anderes als
 * nach einem Neustart, und niemand fände den Grund.
 *
 * Auf die eigene `user_id` filtert die Abfrage nicht: Der Feed ist seit
 * migration-009 personalisiert, und RLS lässt ohnehin nur die eigenen Zeilen
 * durch.
 */
function notifAbfrage(client: NonNullable<typeof supabase>, congregationId: string) {
  return client
    .from('notifications')
    .select('*')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
    .limit(NOTIF_LIMIT)
}

/**
 * Rohzeilen → Glocken-Zeilen.
 *
 * Abgelaufenes fällt heraus (T77): Eine Mitteilung über einen Platz, dessen Tag
 * vorbei ist, interessiert niemanden mehr — „Ersatz gesucht" für letzten
 * Dienstag am wenigsten. Möglich erst, seit die Zeile weiß, worum es geht
 * (migration-020); ältere Zeilen tragen keinen Schlüssel und bleiben stehen,
 * sie laufen ohnehin über die Grenze aus.
 */
function notificationsAus(
  rows: NotificationRow[],
  weeks: Week[],
  meetings: string,
): Notification[] {
  return rows
    .map(notificationFromRow)
    .filter((n) => !n.taskId || !taskKeyVorbei(n.taskId, weeks, meetings))
}

/**
 * Nur die Glocken-Zeilen nachladen — der leichte Teil eines Ladevorgangs.
 *
 * Beim Öffnen der Glocke lief bis hierher der **volle** Ladevorgang: dreizehn
 * Abfragen, darunter 52 Wochen als JSONB und das ganze Versand-Tagebuch, um
 * fünfzig Zeilen anzuzeigen. Wer die App als PWA offen liegen hat und
 * gelegentlich nachsieht, lud damit jedes Mal die ganze Versammlung neu.
 *
 * `null` heißt „nicht gelesen" (kein Client, Fehler) — dann bleibt der
 * bisherige Stand stehen, wie bei jedem stillen Nachladen.
 */
export async function loadNotifications(
  congregationId: string,
  weeks: Week[],
  meetings: string,
): Promise<Notification[] | null> {
  if (!supabase) return null
  const { data, error } = await notifAbfrage(supabase, congregationId)
  if (error) {
    console.error('[notifications]', error.message)
    return null
  }
  return notificationsAus((data ?? []) as NotificationRow[], weeks, meetings)
}

/* ---- Laden --------------------------------------------------------------- */

/**
 * Wie viele Wochen höchstens geladen werden. Ein Jahr reicht für alles, was die
 * App mit Wochen tut: die Auslastung schaut ±3 Wochen weit, die Wartezeit-
 * Reihenfolge braucht nur „länger her als die anderen", und weiter zurück
 * schaut niemand. Ältere Wochen bleiben in der Datenbank stehen.
 */
export const WEEK_LIMIT = 52

/**
 * Wie viele Tagebuch-Zeilen ein Ladevorgang mitnimmt.
 *
 * Reichlich bemessen auf das Ladefenster: Eine Woche hat gut 35 Plätze, und
 * jedes Umteilen legt eine weitere Zeile an. Sechzig je Woche lassen dafür Luft
 * und decken damit alles ab, was für die geladenen Wochen je gebraucht wird.
 */
export const SENT_LOG_LIMIT = WEEK_LIMIT * 60

/**
 * Anfang des Ladefensters: der Montag `WEEK_LIMIT - 1` Wochen vor der jüngsten
 * Woche. Gerechnet wird in UTC, damit keine Zeitzone einen Tag verschiebt.
 *
 * Gibt es noch keine Woche, ist die Grenze gegenstandslos — dann liefert jede
 * Abfrage ohnehin nichts, und die Aufrufer lassen den Filter weg.
 */
function fensterAnfang(juengste: string | undefined): string {
  if (!juengste) return ''
  const d = new Date(`${juengste}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - (WEEK_LIMIT - 1) * 7)
  return d.toISOString().slice(0, 10)
}

export interface CongregationData {
  congregation: { name: string; hall: string; meetings: string }
  planner: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  groups: Group[]
  /** Die geladenen Wochen, aufsteigend nach ihrer Kennung (`start`). */
  weeks: Week[]
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  fsBase: string | null // ISO-Datum (Montag der Woche 0) oder null
  absences: Absence[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
  progLangs: string[] // weitere Programmsprachen (deutsche Anzeigenamen)
  auxClass: boolean // Zusaetzliche Klasse eingerichtet
  members: Member[]
  invites: Invite[]
  /** Wer wurde wann über welchen Platz benachrichtigt (migration-024). */
  sentLog: SentLog
}

export type LoadResult =
  | { ok: true; empty: boolean; data: CongregationData; congregationId: string; userId: string }
  | { ok: false; reason: 'no-membership' | 'error'; message?: string }

/**
 * Lädt alle Daten der Versammlung des eingeloggten Nutzers. Liefert
 * `no-membership`, wenn das Konto keiner Versammlung zugeordnet ist,
 * und `empty`, wenn die Versammlung noch keine Personen/Wochen hat.
 */
export async function loadCongregationData(userId: string): Promise<LoadResult> {
  if (!supabase) return { ok: false, reason: 'error', message: 'kein Client' }

  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('congregation_id, person_id, planner')
    .eq('user_id', userId)
    .maybeSingle()
  if (memberErr) return { ok: false, reason: 'error', message: memberErr.message }
  if (!member) return { ok: false, reason: 'no-membership' }

  const congregationId = member.congregation_id as string

  // Ladefenster: nur die jüngsten WEEK_LIMIT Wochen. Gemessen wird seit T66 am
  // Datum, nicht an einer Ordnungszahl — eine Lücke im Bestand (T65: die Woche
  // des Gedächtnismahls fehlt im Arbeitsheft) verschiebt damit nichts mehr.
  //
  // Der Anker dafür (`max(start)`) stand bis hierher in einer **eigenen
  // Abfrage vor allen anderen**: eine volle Netzrunde auf dem kritischen Pfad
  // jeder Anmeldung, jedes SIGNED_IN und jedes Konflikt-Neuladens, nur um eine
  // Datumsgrenze zu erfahren. Die Grenze steckt aber im Ergebnis selbst — die
  // jüngste Woche ist die erste Zeile. Also absteigend holen und die Grenze
  // danach anlegen; beide Wochen-Tabellen fahren im selben Zug mit.
  const wochenAbfrage = supabase
    .from('weeks')
    .select('start, data, updated_at')
    .eq('congregation_id', congregationId)
    .order('start', { ascending: false })
    .limit(WEEK_LIMIT)
  const fsWochenAbfrage = supabase
    .from('fs_weeks')
    .select('start, data')
    .eq('congregation_id', congregationId)
    .order('start', { ascending: false })
    .limit(WEEK_LIMIT)

  const [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites, fsRulesRow, fsWeeksRows, sentLogRows] = await Promise.all([
    supabase.from('congregations').select('name, hall, meeting_times, settings').eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select('*').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('groups').select('*').eq('congregation_id', congregationId).order('position'),
    wochenAbfrage,
    // Versammlungsweit, nicht nur die eigenen: die Planung muss wissen, wer
    // fehlt (RLS erlaubt der Versammlung ohnehin das Lesen). „Deine Einträge"
    // im persönlichen Bereich filtert selbst auf die eigene user_id.
    supabase.from('absences').select('*').eq('congregation_id', congregationId).order('from_date'),
    // Dieselbe Abfrage, die auch das Nachladen beim Öffnen der Glocke benutzt.
    notifAbfrage(supabase, congregationId),
    supabase.from('confirmations').select('task_key, status').eq('congregation_id', congregationId),
    // Nicht-Planer sehen per RLS nur die eigene Zeile bzw. keine Einladungen
    supabase.from('members').select('user_id, person_id, planner, email').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('invites').select('id, code, person_id, planner').eq('congregation_id', congregationId).is('redeemed_by', null).order('created_at'),
    supabase.from('fs_rules').select('base, rules').eq('congregation_id', congregationId).maybeSingle(),
    fsWochenAbfrage,
    // Versand-Tagebuch: welcher Platz wurde wann gemeldet (migration-024). Der
    // Planen-Screen zeigt es an, und der „Plan senden"-Knopf zählt daraus, was
    // noch aussteht.
    //
    // **Jüngste zuerst, und begrenzt.** Die Tabelle wächst und wird nie
    // aufgeräumt: rund 35 Plätze je Woche, ein Jahr sind gegen 1800 Zeilen, und
    // dabei bleibt es nicht. Ungebremst holte jeder Kaltstart nach ein paar
    // Jahren den ganzen Bestand — in den Zustand, von dort in die
    // Momentaufnahme im Browser-Speicher, und deren Platz ist knapp. Absteigend
    // sortiert kann die Grenze nichts Gebrauchtes abschneiden: Was für die
    // geladenen Wochen zählt, wurde zuletzt gemeldet und steht damit vorn.
    supabase
      .from('assignment_log')
      .select('task_key, name, sent_at')
      .eq('congregation_id', congregationId)
      .order('sent_at', { ascending: false })
      .limit(SENT_LOG_LIMIT),
  ])

  // Alle dreizehn Abfragen prüfen, nicht zehn: fehlten fs_rules/fs_weeks in der
  // Liste, blieb ein Ladefehler dort stumm und die Treffpunkte kamen einfach
  // leer an — genau der Fall bei einer Instanz ohne Migration 010.
  //
  // Das Versand-Tagebuch steht **nicht** in dieser Liste, und zwar mit Absicht:
  // Wer migration-024 noch nicht eingespielt hat, soll die App weiter benutzen
  // können. Fehlt die Tabelle, bleibt die Anzeige „benachrichtigt am" leer —
  // das ist eine fehlende Auskunft, kein fehlender Datenbestand.
  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites, fsRulesRow, fsWeeksRows]
    .find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }
  if (sentLogRows.error) console.error('[assignment_log]', sentLogRows.error.message)

  const serviceList = (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow))
  const personList = migrateServicePrivs(
    (persons.data ?? []).map((r) => personFromRow(r as PersonRow)),
    serviceList,
  )
  // Absteigend geholt, aufsteigend gebraucht (`CongregationData.weeks`).
  const wochenAbsteigend = (weeks.data ?? []) as WeekRow[]
  const ab = fensterAnfang(wochenAbsteigend[0]?.start)
  // Die Grenze bleibt dieselbe Rechnung wie zuvor. Sie schneidet hier nichts
  // mehr weg, was die Abfrage nicht ohnehin ausgelassen hätte: die Kennung ist
  // ein Montag (T66) und je Versammlung eindeutig, in ein Fenster von
  // WEEK_LIMIT Wochen passen also nie mehr als WEEK_LIMIT Wochen. Sie steht
  // trotzdem da — als das, was das Fenster ausmacht, und als Halt, falls je
  // eine Kennung auf einen anderen Wochentag fiele.
  const imFenster = <T extends { start: string }>(rows: T[]): T[] =>
    (ab ? rows.filter((r) => r.start >= ab) : rows).slice().reverse()
  const weekRows = imFenster(wochenAbsteigend)
  // Stände merken: jeder spätere Schreibvorgang nennt den Stand, auf dem er
  // beruht (T39). Vor dem Füllen leeren — ein zweiter Ladevorgang (Neuanmeldung,
  // Konflikt-Nachladen) darf keine Stände einer anderen Versammlung erben.
  staendeSetzen(weekRows.map((r) => [r.start, r.updated_at]))
  // Die Kennung kommt aus der **Spalte**, nicht aus dem Blob: migration-017 hat
  // sie dort nachgetragen, im JSONB kann sie bei Altbestand noch fehlen. Damit
  // trägt jede geladene Woche ihr Datum, auch die älteste.
  //
  // Hier wurde bis T66 ein Array der Länge `höchstePosition + 1` aufgespannt
  // und jede Zeile an ihren Index gesetzt, mit Platzhaltern in den Lücken —
  // weil der Index die Position war und in jedem `task_key` steckte. Jetzt
  // reihen sich die Zeilen einfach nach Datum: eine fehlende Woche ist eine
  // fehlende Woche und verschiebt nichts.
  const roh = weekRows.map((r) => ({ ...r.data, start: r.start }))
  const gemigriert = normalizeChairKeys(
    migrateAssignmentPids(migrateAssignmentNames(normalizeWeekHelpers(roh), personList), personList),
  )

  const rohConf = confirmationMap((confs.data ?? []) as ConfirmationRow[])

  // Stabile Kennungen nachtragen und die Bestätigungen einmalig mit umbenennen
  // (T37). Idempotent — beim zweiten Laden gibt es nichts mehr zu tun.
  const umgestellt = migrateItemIds(gemigriert, rohConf)
  const weekList = umgestellt.weeks
  // Und dasselbe für die Treffpunkte (T87) — dieselbe Ursache, andere Tabelle.
  const fsUmgestellt = migrateFsTaskKeys(umgestellt.confirmations)
  // Die Datumsbasis steht schon hier, weil die Wochen-Migration darunter sie
  // braucht: Sie rechnet aus, welche Kennung eine Woche **hatte**, solange sie
  // aus der Ordnungszahl kam.
  const fsBaseDate = fsBaseFromWeeks(weekList, new Date())
  // Und die dritte aus derselben Wurzel (T100): Der Montag einer
  // Treffpunkt-Woche kam aus `fsBase + wi·7` statt aus der Woche selbst.
  const fsWochen = migrateFsWochenKeys(fsUmgestellt.confirmations, weekList, fsBaseDate)
  const confirmations = fsWochen.confirmations
  const alleRenames = [...umgestellt.renames, ...fsUmgestellt.renames, ...fsWochen.renames]
  /** Nur die Wochen, die wirklich Kennungen bekommen haben. */
  const speichereUmgestellte = (): void => {
    for (let i = 0; i < weekList.length; i++) {
      const woche = weekList[i]
      if (woche && woche !== gemigriert[i]) saveWeek(congregationId, woche)
    }
  }
  if (alleRenames.length > 0) {
    // Erst die Datenbank, dann die Wochen: bricht das Umbenennen ab, bleiben
    // die Wochen ohne Kennung und der nächste Ladevorgang versucht es erneut.
    // Andersherum wären die Bestätigungen verwaist.
    void renameConfirmationKeys(congregationId, alleRenames).then(speichereUmgestellte)
  } else {
    speichereUmgestellte()
  }

  const settings = ((cong.data?.settings as CongregationSettings | null) ?? {})
  const reminders: Reminders = {
    first: settings.reminders?.first ?? STANDARD_ERINNERUNGEN.first,
    last: settings.reminders?.last ?? STANDARD_ERINNERUNGEN.last,
    repeat: settings.reminders?.repeat ?? STANDARD_ERINNERUNGEN.repeat,
    // `onAssign` stand hier bis T99. Der Schalter steuerte die Mitteilung
    // „Zuteilung gesendet" an die Planer, und die gibt es nicht mehr — an ihre
    // Stelle ist „Plan senden" getreten. In `congregations.settings` bleibt das
    // Feld bei bestehenden Versammlungen stehen; gelesen wird es nirgends, und
    // eine Migration dafür wäre Aufwand ohne Wirkung.
  }

  // Treffpunkte: Grundplan-Blob + je Woche gespeicherte Instanzen (Kennung → Daten).
  // Die Basis wird aus dem echten ISO-Startdatum der Wochen (`week.start`,
  // jw.org-Import) abgeleitet — unabhängig von der gespeicherten Basis und vom
  // `current`-Flag, die beide veralten können; anschließend werden die Wochen neu
  // ausgerichtet — Leiter und wochenspezifische Zeit/Ort bleiben erhalten, nur die
  // Regel→Woche-Zuordnung (z. B. „1. Samstag im Monat") wird anhand der korrekten
  // Datumsbasis neu bestimmt.
  const fsRules = (fsRulesRow.data?.rules as FsRule[] | undefined) ?? []
  const fsBase = fsBaseDate.toISOString().slice(0, 10)
  // Zugeordnet wird über das Datum, nicht über die Zeilenfolge: beide Tabellen
  // führen dieselbe Kennung, und nur so bleiben Treffpunkte an ihrer Woche,
  // wenn im Bestand eine fehlt.
  const fsNachWoche = new Map<string, FsInstance[]>()
  for (const row of imFenster((fsWeeksRows.data ?? []) as { start: string; data: FsInstance[] }[])) {
    fsNachWoche.set(row.start, row.data)
  }
  // Erst die Kennungen heben (T87), dann ausrichten: `regenFsWeeks` findet die
  // gespeicherte Leitung über die Kennung wieder — trüge sie noch die alte
  // Wochennummer, ginge sie beim Ausrichten verloren.
  const storedFsWeeks: FsInstance[][] = fsMigrateInstIds(
    weekList.map((w) => fsNachWoche.get(w.start) ?? []),
  )
  const ausgerichtet = fsRules.length
    ? regenFsWeeks(fsWochenKennungen(weekList, fsBaseDate), storedFsWeeks, fsRules, true)
    : storedFsWeeks
  // Leiter ohne `lpid` an ihre Person binden — dasselbe, was
  // `migrateAssignmentPids` eine Bildschirmhöhe weiter oben für die
  // Zusammenkünfte tut. Ohne das blieb eine gelöschte und neu angelegte Person
  // in ihren Treffpunkten für immer ein bloßer Name.
  const fsWeeks = fsMigrateLeaderPids(ausgerichtet, personList)

  const data: CongregationData = {
    congregation: {
      name: cong.data?.name ?? '',
      hall: cong.data?.hall ?? '',
      meetings: cong.data?.meeting_times ?? '',
    },
    planner: Boolean(member.planner),
    personId: (member.person_id as string | null) ?? null,
    persons: personList,
    services: serviceList,
    groups: (groups.data ?? []).map((r) => groupFromRow(r as GroupRow)),
    weeks: weekList,
    fsRules,
    fsWeeks,
    fsBase,
    absences: (absences.data ?? []).map((r) => absenceFromRow(r as AbsenceRow)),
    notifications: notificationsAus(
      (notifs.data ?? []) as NotificationRow[],
      weekList,
      cong.data?.meeting_times ?? '',
    ),
    confirmations,
    reminders,
    auxClass: settings.auxClass ?? false,
    congLang: settings.congLang ?? 'Deutsch',
    progLangs: settings.progLangs ?? [],
    members: ((members.data ?? []) as MemberRow[]).map((r) => ({
      userId: r.user_id,
      email: r.email,
      personId: r.person_id,
      planner: r.planner,
    })),
    invites: ((invites.data ?? []) as InviteRow[]).map((r) => ({
      id: r.id,
      code: r.code,
      personId: r.person_id,
      planner: r.planner,
    })),
    sentLog: Object.fromEntries(
      ((sentLogRows.data ?? []) as { task_key: string; name: string; sent_at: string }[]).map(
        (r) => [sentKey(r.task_key, r.name), r.sent_at],
      ),
    ),
  }

  const empty = personList.length === 0 && weekList.length === 0
  return { ok: true, empty, data, congregationId, userId }
}

/* ---- Schreiben ----------------------------------------------------------- */

/**
 * Alle `save*`/`delete*`-Funktionen sind fire-and-forget: der Reducer zeigt
 * den Erfolg, **bevor** geschrieben wurde. Schlug das Schreiben fehl —
 * RLS-Verstoß, abgelaufenes Token, kein Netz, Timeout —, stand das bislang nur
 * in der Konsole. Der Nutzer sah „Zugeteilt", die Datenbank hatte nichts.
 *
 * Diese Schicht kennt weder Dispatch noch Sprache. Sie meldet deshalb nur,
 * *dass* etwas schiefging; wer das anzeigt, meldet sich hier an (store.tsx).
 * Die Fehlermeldung selbst bleibt in der Konsole: sie kommt aus der Datenbank
 * und gehört nicht ungefiltert vor den Nutzer.
 */
type Fehlermelder = () => void

let melder: Fehlermelder | null = null

export function setSchreibfehlerMelder(fn: Fehlermelder | null): void {
  melder = fn
}

async function run(promise: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await promise
  if (!error) return
  console.error('[persistenz]', error.message)
  melder?.()
}

/* ---- Schreibkonflikte zwischen Planern (T39) ----------------------------- */

/**
 * Stand je Woche, wie ihn die Datenbank zuletzt bestätigt hat — geführt über
 * ihre Kennung (`start`), seit T66 nicht mehr über eine Ordnungszahl.
 *
 * `saveWeek` schrieb die **komplette Woche** als Upsert — ohne Sperre und ohne
 * Versionskennzeichen. Planen zwei Koordinatoren gleichzeitig, gewinnt der
 * Letzte: seine Fassung überschreibt die des anderen vollständig und lautlos.
 *
 * Die Werte werden nie selbst gebildet, sondern immer nur zurückgereicht — die
 * Zeichenkette kommt aus PostgREST und geht unverändert dorthin zurück. Damit
 * sind Genauigkeit und Zeitzone kein Thema.
 */
const wochenStand = new Map<string, string>()

/**
 * Schreibvorgänge je Woche hintereinander.
 *
 * Ohne das kämpfte man gegen sich selbst: zwei rasch aufeinanderfolgende
 * Änderungen derselben Woche gingen beide mit demselben Stand los, und die
 * zweite meldete einen Konflikt, den es nicht gab.
 */
const wochenKette = new Map<string, Promise<void>>()

function staendeSetzen(paare: Array<[string, string]>): void {
  wochenStand.clear()
  wochenKette.clear()
  for (const [woche, stand] of paare) wochenStand.set(woche, stand)
}

/**
 * Meldung „ein anderer Planer war schneller". Wie beim Schreibfehler kennt
 * diese Schicht weder Dispatch noch Sprache — sie meldet nur, *dass* es
 * passiert ist; wer neu lädt und es anzeigt, meldet sich hier an (store.tsx).
 */
type Konfliktmelder = () => void

let konfliktMelder: Konfliktmelder | null = null

export function setKonfliktMelder(fn: Konfliktmelder | null): void {
  konfliktMelder = fn
}

/**
 * Eine Woche schreiben und dabei den Stand prüfen.
 *
 * Ablauf:
 *  1. Kein Stand bekannt → die Zeile gibt es hier noch nicht: einfügen.
 *  2. Stand bekannt → Update **mit** Bedingung `updated_at = <Stand>`.
 *     Eine getroffene Zeile bringt den neuen Stand zurück; fertig.
 *  3. Keine Zeile getroffen → nachsehen, warum. Steht dort noch immer unser
 *     Stand, war es kein Konflikt, sondern eine Eigenheit des Vergleichs —
 *     dann ungeschützt schreiben. Steht ein anderer da, war jemand schneller.
 *
 * Schritt 3 ist der Grund, warum hier überhaupt nachgefragt wird: ein
 * **falscher** Konfliktalarm würde die Arbeit des Nutzers verwerfen. Der
 * zusätzliche Umlauf kostet nur in dem Fall etwas, in dem sonst etwas
 * verlorenginge.
 */
async function schreibeWoche(congregationId: string, woche: string, week: Week): Promise<void> {
  if (!supabase) return
  const stand = wochenStand.get(woche)

  if (stand === undefined) {
    const { data, error } = await supabase
      .from('weeks')
      .insert({ congregation_id: congregationId, start: woche, data: week })
      .select('updated_at')
      .maybeSingle()
    if (error) {
      // Verstoß gegen unique(congregation_id, start): die Zeile existiert
      // längst, wir kannten sie nur nicht — also hat sie ein anderer angelegt.
      if (error.code === '23505') konfliktMelder?.()
      else {
        console.error('[persistenz]', error.message)
        melder?.()
      }
      return
    }
    if (data) wochenStand.set(woche, data.updated_at as string)
    return
  }

  const { data, error } = await supabase
    .from('weeks')
    .update({ data: week })
    .eq('congregation_id', congregationId)
    .eq('start', woche)
    .eq('updated_at', stand)
    .select('updated_at')
    .maybeSingle()
  if (error) {
    console.error('[persistenz]', error.message)
    melder?.()
    return
  }
  if (data) {
    wochenStand.set(woche, data.updated_at as string)
    return
  }

  const { data: jetzt, error: leseFehler } = await supabase
    .from('weeks')
    .select('updated_at')
    .eq('congregation_id', congregationId)
    .eq('start', woche)
    .maybeSingle()
  if (leseFehler) {
    console.error('[persistenz]', leseFehler.message)
    melder?.()
    return
  }
  if (jetzt && jetzt.updated_at === stand) {
    // Der Stand ist unverändert — niemand war schneller. Der Filter hat die
    // Zeile aus einem anderen Grund nicht getroffen; ohne diesen zweiten Anlauf
    // ginge die Änderung verloren, obwohl nichts kollidiert ist.
    const { data: erneut, error: schreibFehler } = await supabase
      .from('weeks')
      .update({ data: week })
      .eq('congregation_id', congregationId)
      .eq('start', woche)
      .select('updated_at')
      .maybeSingle()
    if (schreibFehler) {
      console.error('[persistenz]', schreibFehler.message)
      melder?.()
      return
    }
    if (erneut) wochenStand.set(woche, erneut.updated_at as string)
    return
  }
  konfliktMelder?.()
}

/**
 * Eine Woche speichern. Welche Zeile gemeint ist, sagt ihre eigene Kennung —
 * kein Index von außen mehr (T66).
 */
export function saveWeek(congregationId: string, week: Week): void {
  if (!supabase) return
  // Ohne Kennung gibt es keine Zeile, die gemeint sein könnte. Hier stand bis
  // T66 die Platzhalter-Prüfung; sie hatte denselben Zweck — nichts schreiben,
  // was keine Woche bezeichnet.
  const woche = week.start
  if (!woche) return
  const vorher = wochenKette.get(woche) ?? Promise.resolve()
  // `catch` vor dem Anhängen: ein Fehlschlag darf die Kette nicht abreißen
  // lassen, sonst schriebe diese Woche nie wieder.
  const naechster = vorher.then(() => schreibeWoche(congregationId, woche, week).catch(() => {}))
  wochenKette.set(woche, naechster)
}

export function savePerson(congregationId: string, person: Person): void {
  if (!supabase) return
  void run(supabase.from('persons').upsert(personToRow(person, congregationId)))
}

/** Grundplan der Treffpunkte (ein Blob je Versammlung) + Basis-Datum. */
export function saveFsRules(congregationId: string, base: string, rules: FsRule[]): void {
  if (!supabase) return
  void run(
    supabase
      .from('fs_rules')
      .upsert({ congregation_id: congregationId, base, rules }, { onConflict: 'congregation_id' }),
  )
}

/** Materialisierte Treffpunkte einer Woche (Kennung → FsInstance[]). */
export function saveFsWeek(congregationId: string, woche: string, insts: FsInstance[]): void {
  if (!supabase || !woche) return
  void run(
    supabase
      .from('fs_weeks')
      .upsert(
        { congregation_id: congregationId, start: woche, data: insts },
        { onConflict: 'congregation_id,start' },
      ),
  )
}

export function deletePersonRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('persons').delete().eq('id', id))
}

export function saveService(congregationId: string, service: Service, position: number): void {
  if (!supabase) return
  void run(
    supabase
      .from('services')
      .upsert(serviceToRow(service, congregationId, position), { onConflict: 'congregation_id,key' }),
  )
}

export function deleteServiceRow(congregationId: string, key: string): void {
  if (!supabase) return
  void run(supabase.from('services').delete().eq('congregation_id', congregationId).eq('key', key))
}

export function saveGroupRow(congregationId: string, group: Group): void {
  if (!supabase) return
  void run(supabase.from('groups').upsert(groupToRow(group, congregationId, 0)))
}

export function deleteGroupRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('groups').delete().eq('id', id))
}

/** Schreibt nur die Gruppen-Zuordnung (grp) einer Person zurück. */
export function savePersonGroup(person: Person): void {
  if (!supabase) return
  void run(supabase.from('persons').update({ grp: person.grp ?? null }).eq('id', person.id))
}

/**
 * Push-Abo dieses Geräts speichern (Endpoint ist eindeutig → Upsert).
 *
 * `lang` ist die App-Sprache dieses Geräts: der Text einer Push-Nachricht
 * entsteht beim Versand und lässt sich danach nicht mehr übersetzen.
 */
export function savePushSubscription(
  congregationId: string,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  lang: string,
): void {
  if (!supabase) return
  void run(
    supabase.from('push_subscriptions').upsert(
      {
        congregation_id: congregationId,
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        lang,
      },
      { onConflict: 'endpoint' },
    ),
  )
}

/**
 * Sprache eines bestehenden Abos nachziehen. Ohne das bekäme jemand, der die
 * Sprache nach dem Aktivieren wechselt, weiter Erinnerungen in der alten.
 */
export function savePushLanguage(endpoint: string, lang: string): void {
  if (!supabase) return
  void run(supabase.from('push_subscriptions').update({ lang }).eq('endpoint', endpoint))
}

export function deletePushSubscription(endpoint: string): void {
  if (!supabase) return
  void run(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))
}

/**
 * Abwesenheit anlegen.
 *
 * Ersteller und betroffene Person kommen **aus dem Datensatz**, nicht von
 * außen. Sie standen bis August 2026 als eigene Parameter daneben, und der
 * einzige Aufrufer füllte sie aus dem angemeldeten Konto — was stimmte, solange
 * jeder nur seine eigenen erfassen konnte. Seit der Planer sie im Personen-
 * Detail für **andere** einträgt, wäre das falsch: Die Zeile landete auf seiner
 * Person statt auf der gemeinten, und niemand sähe es. Ein Datensatz, der beide
 * Angaben schon trägt, darf sie nicht ein zweites Mal übergeben bekommen.
 */
export function saveAbsence(congregationId: string, absence: Absence): void {
  if (!supabase) return
  void run(
    supabase.from('absences').insert({
      id: absence.id,
      congregation_id: congregationId,
      user_id: absence.userId,
      person_id: absence.personId,
      from_date: absence.from,
      to_date: absence.to,
      reason: absence.reason,
    }),
  )
}

export function deleteAbsenceRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('absences').delete().eq('id', id))
}

/**
 * Mitteilung an bestimmte Empfänger (je user_id eine eigene Zeile → eigener
 * Gelesen-/Lösch-Status). Leere Empfängerliste = kein Schreiben. Erinnerungen
 * erzeugt die Edge Function selbst; Client-Mitteilungen (Zuteilung, Import,
 * Verhinderung) richten sich an die Planer der Versammlung.
 */
export function insertNotifications(
  congregationId: string,
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
): void {
  if (!supabase || userIds.length === 0) return
  const rows = userIds.map((user_id) => ({ congregation_id: congregationId, user_id, type, title, body }))
  void run(supabase.from('notifications').insert(rows))
}

/**
 * Ersatzgesuch: qualifizierte Personen (gleicher Hilfsdienst) benachrichtigen
 * (Sofort-Push + In-App). Läuft serverseitig (Edge Function `substitute`), weil
 * Push nur mit dem privaten VAPID-Schlüssel geht. Fire-and-forget.
 */
/*
 * **Ohne `congregationId`.** Das Feld stand hier, seit es die Function gab, und
 * war der Angriffsweg aus S10: Der Server nahm die Versammlung aus dem Rumpf,
 * statt sie zu lesen. Seit dem Ausrollen am 24.8.2026 wertet er es nicht mehr
 * aus — und ein Feld, das niemand auswertet, ist genau die offene Fläche, die
 * bei `import-week` zu S12 geführt hat. Also weg damit.
 */
export function substituteSeek(taskKey: string): void {
  if (!supabase) return
  void run(supabase.functions.invoke('substitute', { body: { action: 'seek', taskKey } }))
}

/**
 * Hilfsdienst-Ersatz übernehmen: trägt den Aufrufer serverseitig in den Slot ein,
 * setzt die Bestätigung und informiert Ursprungsperson + Planer. Nötig, weil
 * Wochen/Bestätigungen nur der Planer schreiben darf (RLS). Fire-and-forget —
 * der Client aktualisiert seinen Stand optimistisch.
 */
export function substituteTake(taskKey: string): void {
  if (!supabase) return
  // Über run(): scheitert die Übernahme, hat der Aufrufer sonst „Übernommen"
  // gesehen, während der Slot serverseitig unverändert blieb.
  void run(supabase.functions.invoke('substitute', { body: { action: 'take', taskKey } }))
}

/** Ergebnis eines „Plan senden"-Laufs (Edge Function `send-plan`). */
export interface PlanVersand {
  /** Wie viele Personen eine Nachricht bekommen haben. */
  personen: number
  /** Namen ohne App-Konto — die muss der Planer persönlich ansprechen. */
  ohneKonto: string[]
}

/**
 * „Plan senden": jede eingeteilte Person bekommt **eine** Nachricht mit allen
 * ihren Aufgaben dieser Woche.
 *
 * Läuft serverseitig, weil Web-Push den privaten VAPID-Schlüssel braucht und
 * weil das Versand-Tagebuch (`assignment_log`) nur die Service-Role schreiben
 * darf — ein Client, der sich selbst als „informiert" einträgt, könnte damit
 * Nachrichten unterdrücken.
 *
 * **Nicht** fire-and-forget wie die übrigen Aufrufe: Der Planer hat den Knopf
 * bewusst gedrückt und muss erfahren, was daraus wurde — vor allem, wen er
 * mangels Konto selbst ansprechen muss.
 */
export async function sendPlan(weekStart: string): Promise<PlanVersand | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('send-plan', {
    body: { action: 'plan', weekStart },
  })
  if (error) {
    console.error('[send-plan]', error.message)
    return null
  }
  const res = data as Partial<PlanVersand> | null
  return {
    personen: res?.personen ?? 0,
    ohneKonto: res?.ohneKonto ?? [],
  }
}

/**
 * **Bestätigte** Zuteilungen wurden zurückgezogen oder verlegt — die
 * betroffenen Personen erfahren es sofort.
 *
 * Das ist der einzige Fall, in dem eine Zuteilungs-Nachricht nicht auf den
 * Knopf wartet: Wer zugesagt hat, bereitet vor. Bliebe es beim nächsten „Plan
 * senden", übte jemand tagelang für einen Platz, den er nicht mehr hat.
 *
 * **Ein Aufruf für alle Entzüge einer Änderung.** Hier ging je Entzug ein
 * eigener `invoke` hinaus, und die Function wiederholte für jeden davor
 * dieselben fünf REST-Runden über Mitglieder, Personen und Push-Abos. Eine
 * Auto-Zuteilung, die eine Zusammenkunft neu besetzt, löste damit ein Dutzend
 * voller Aufrufe aus — für Nachrichten, die ohnehin alle aus demselben Bestand
 * zugestellt werden. Als Liste sind es fünf Runden, einmal.
 *
 * Bezeichnung und Termin gehen kanonisch deutsch mit — der Client hat den Platz
 * gerade in der Hand, die Function könnte ihn nach dem Überschreiben nicht mehr
 * nachschlagen.
 *
 * **Reihenfolge beim Ausrollen:** Die Function muss die Listenform kennen,
 * bevor ein Client sie schickt (`npx supabase functions deploy send-plan`).
 * Umgekehrt ist es unkritisch — die alte Einzelform nimmt sie weiter an.
 */
export function sendPlanEntzug(entzuege: EntzogeneZusage[]): void {
  if (!supabase || entzuege.length === 0) return
  // **Kein `run()`**: Dessen Fehlerweg meldet „Änderung konnte nicht gespeichert
  // werden" — hier ist aber nichts zu speichern, sondern eine Nachricht zu
  // schicken. Der Planer bekäme eine Warnung über einen Verlust, den es nicht
  // gab, während seine Änderung längst in der Datenbank steht.
  void supabase.functions
    .invoke('send-plan', {
      body: {
        action: 'entzug',
        entzuege: entzuege.map((z) => ({
          taskKey: z.key,
          name: z.name,
          pid: z.pid,
          label: z.label,
          datum: z.datum,
        })),
      },
    })
    .then(({ error }) => {
      if (error) console.error('[send-plan/entzug]', error.message)
    })
}

export function markNotificationsRead(congregationId: string, userId: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('congregation_id', congregationId)
      .eq('user_id', userId),
  )
}

export function deleteNotifications(congregationId: string, userId: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .delete()
      .eq('congregation_id', congregationId)
      .eq('user_id', userId),
  )
}

export function saveCongregationInfo(
  congregationId: string,
  info: { name: string; hall: string; meetings: string },
): void {
  if (!supabase) return
  void run(
    supabase
      .from('congregations')
      .update({ name: info.name, hall: info.hall, meeting_times: info.meetings })
      .eq('id', congregationId),
  )
}

/** Versammlungsweite Einstellungen (Erinnerungen, Versammlungssprache). */
export function saveSettings(
  congregationId: string,
  settings: { reminders: Reminders; congLang: string; progLangs: string[]; auxClass: boolean },
): void {
  if (!supabase) return
  void run(supabase.from('congregations').update({ settings }).eq('id', congregationId))
}

/** Bestätigung/Verhinderung einer Aufgabe (eigene Zeile je Nutzer+Slot). */
export function saveConfirmation(
  congregationId: string,
  userId: string,
  taskKey: string,
  status: Exclude<TaskStatus, 'offen'>,
): void {
  if (!supabase) return
  void run(
    supabase.from('confirmations').upsert(
      { congregation_id: congregationId, user_id: userId, task_key: taskKey, status },
      { onConflict: 'congregation_id,task_key,user_id' },
    ),
  )
}

/**
 * Bestätigungs-Einträge (alle Nutzer) der angegebenen Slots löschen — beim
 * Neu-Zuteilen, damit kein fremder Status am Slot kleben bleibt
 * (RLS-Policy confirmations_delete_planner, migration-007).
 */
export function deleteConfirmationRows(congregationId: string, taskKeys: string[]): void {
  if (!supabase || taskKeys.length === 0) return
  void run(
    supabase
      .from('confirmations')
      .delete()
      .eq('congregation_id', congregationId)
      .in('task_key', taskKeys),
  )
}

/**
 * Vertauscht die task_keys von Bestätigungen paarweise — für das Verschieben
 * eines LAC-Punkts, damit die Bestätigung beim Programmpunkt bleibt statt an
 * der Position zu haften. Über einen Zwischenschlüssel, um die Eindeutigkeit
 * (congregation_id, task_key, user_id) beim Tausch nicht zu verletzen.
 */
/**
 * Benennt task_keys der Reihe nach um — für das Einfügen/Löschen eines
 * Programmpunkts, nach dem alle folgenden Positionen um eine rutschen.
 *
 * Die Reihenfolge der Paare kommt aus `shiftPartConfirmations` und ist
 * bindend: falsch herum kollidiert eine Umbenennung mit einem noch belegten
 * Schlüssel (unique auf congregation_id, task_key, user_id). Deshalb hier —
 * anders als beim Tausch — kein Zwischenschlüssel: die Zielposition ist
 * garantiert frei.
 */
export async function renameConfirmationKeys(
  congregationId: string,
  pairs: Array<[string, string]>,
): Promise<void> {
  if (!supabase) return
  for (const [from, to] of pairs) {
    await run(
      supabase
        .from('confirmations')
        .update({ task_key: to })
        .eq('congregation_id', congregationId)
        .eq('task_key', from),
    )
  }
}

export async function swapConfirmationKeys(
  congregationId: string,
  pairs: Array<[string, string]>,
): Promise<void> {
  if (!supabase) return
  const move = (from: string, to: string) =>
    run(
      supabase!
        .from('confirmations')
        .update({ task_key: to })
        .eq('congregation_id', congregationId)
        .eq('task_key', from),
    )
  for (const [a, b] of pairs) {
    const tmp = `${a}~swap`
    await move(a, tmp)
    await move(b, a)
    await move(tmp, b)
  }
}

/* ---- Mitglieder & Einladungen (nur Planer, RLS-geschützt) ---------------- */

export function saveMemberRow(member: Member): void {
  if (!supabase) return
  void run(
    supabase
      .from('members')
      .update({ person_id: member.personId, planner: member.planner })
      .eq('user_id', member.userId),
  )
}

export function deleteMemberRow(userId: string): void {
  if (!supabase) return
  void run(supabase.from('members').delete().eq('user_id', userId))
}

/** Planer-Flag eines offenen Codes nachziehen (Person-Recht geändert). */
export function saveInvitePlanner(id: string, planner: boolean): void {
  if (!supabase) return
  void run(supabase.from('invites').update({ planner }).eq('id', id))
}

export function saveInvite(congregationId: string, invite: Invite): void {
  if (!supabase) return
  void run(
    supabase.from('invites').insert({
      id: invite.id,
      congregation_id: congregationId,
      code: invite.code,
      person_id: invite.personId,
      planner: invite.planner,
    }),
  )
}

export function deleteInviteRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('invites').delete().eq('id', id))
}

/**
 * Einladungscode einlösen (redeem_invite, security definer). Liefert null bei
 * Erfolg, sonst den Fehlercode 'already-member' | 'invalid-code' | Meldung.
 */
export async function redeemInvite(code: string): Promise<string | null> {
  if (!supabase) return 'invalid-code'
  // Leerer/nur-Leerzeichen-Code gar nicht erst an den Server schicken.
  if (!code.trim()) return 'invalid-code'
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code })
  if (error) return error.message
  return (data as string | null) ?? null
}

/**
 * Gut lesbarer Einladungscode: 8 Zeichen ohne 0/O/1/I (32er-Alphabet). Da 32
 * die 256 möglichen Byte-Werte glatt teilt, ist die Verteilung ohne Modulo-Bias.
 */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}
