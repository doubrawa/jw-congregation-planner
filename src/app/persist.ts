/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase (Fire-and-forget über lib/data). Läuft nur im konfigurierten,
 * hydrierten Zustand. Der Reducer bleibt rein; hier werden `prev`/`next`
 * (Zustand vor/nach der Aktion) ausgewertet.
 */

import { changedSlotKeys, partSwapKeyPairs, shiftPartConfirmations } from '../data/planning'
import { itemNameCount, lacAddIndex, lacMoveTarget } from '../data/meeting-edit'
import { type EntzogeneZusage, entzogeneZusagen } from '../data/plan-versand'
import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  renameConfirmationKeys,
  swapConfirmationKeys,
  deleteGroupRow,
  deletePersonRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteNotifications,
  deleteServiceRow,
  insertNotifications,
  markNotificationsRead,
  saveAbsence,
  saveConfirmation,
  saveCongregationInfo,
  saveFsRules,
  saveFsWeek,
  saveGroupRow,
  saveInvite,
  saveInvitePlanner,
  saveMemberRow,
  savePerson,
  savePersonGroup,
  saveService,
  saveSettings,
  saveWeek,
  substituteSeek,
  substituteTake,
  sendPlanEntzug,
} from '../lib/data'
import { helperKeyParts } from '../data/planning'
import { mtab } from '../data/helpers'
import { supabase } from '../lib/supabase'
import type { FsInstance, Person, Week } from '../data/types'
import type { AppAction, AppState } from './context'

/**
 * Auto-Speichern mit Debounce: Tipp-Änderungen (Personen-Felder, Umbenennung
 * betroffener Wochen, Versammlungs-Stammdaten) dispatchen je Tastenanschlag.
 * Statt pro Anschlag zu schreiben, sammelt ein Writer die neueste Fassung je
 * Schlüssel und schreibt sie gebündelt nach kurzer Ruhe — bzw. sofort beim
 * Verlassen der Ansicht (`flush`) oder gar nicht (`cancel`, vor dem Löschen).
 */
const SAVE_DELAY = 600

interface DebouncedWriter<K, V> {
  schedule: (key: K, value: V) => void
  cancel: (key: K) => void
  flush: () => void
}

function createDebouncedWriter<K, V>(
  delayMs: number,
  write: (key: K, value: V) => void,
): DebouncedWriter<K, V> {
  const pending = new Map<K, V>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    for (const [key, value] of pending) write(key, value)
    pending.clear()
  }
  return {
    schedule(key, value) {
      pending.set(key, value)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    cancel(key) {
      pending.delete(key)
    },
    flush,
  }
}

// congId ist über die Sitzung stabil, wird aber je Save mitgeführt, damit der
// Writer keine implizite Abhängigkeit auf App-State hat.
const personSaves = createDebouncedWriter<string, { congId: string; person: Person }>(
  SAVE_DELAY,
  (_id, { congId, person }) => savePerson(congId, person),
)
// Gebündelt wird je **Woche**, nicht je Index (T66): der Schlüssel ist ihre
// Kennung, und der schiebt sich nicht, wenn sich die geladene Menge ändert.
const weekSaves = createDebouncedWriter<string, { congId: string; week: Week }>(
  SAVE_DELAY,
  (_woche, { congId, week }) => saveWeek(congId, week),
)
const congSaves = createDebouncedWriter<'info', { congId: string; info: AppState['congregation'] }>(
  SAVE_DELAY,
  (_key, { congId, info }) => saveCongregationInfo(congId, info),
)
// Treffpunkte: derselbe Weg wie bei den Wochen — gebündelt je Kennung.
const fsWeekSaves = createDebouncedWriter<string, { congId: string; insts: FsInstance[] }>(
  SAVE_DELAY,
  (woche, { congId, insts }) => saveFsWeek(congId, woche, insts),
)
// Der Grundplan hängt an einem Freitextfeld (Ort) und änderte sich deshalb je
// Tastenanschlag — mitsamt jeder daraus erzeugten Woche.
const fsRuleSaves = createDebouncedWriter<'rules', { congId: string; base: string; rules: AppState['fsRules'] }>(
  SAVE_DELAY,
  (_key, { congId, base, rules }) => saveFsRules(congId, base, rules),
)

/*
 * ---- Speichern mit Blick auf den Index (T42) -------------------------------
 *
 * Fast jeder Zweig unten schreibt „die Woche zu diesem Index". Der Index kommt
 * aus der Aktion oder aus dem vorigen Zustand — und muss dort nicht mehr
 * stehen: eine Lücke im geladenen Fenster (T35), eine Woche, die zwischen
 * Auswahl und Speichern aus dem Fenster gerutscht ist. `weeks[wi]` ist dann
 * `undefined`, und ohne Prüfung ginge genau das an die Schreibschicht — die
 * eine volle Zeile mit einer leeren überschriebe. Kein Index, kein Schreiben.
 */

/**
 * Woche an `wi` speichern — falls es sie gibt und falls sie sich geändert hat.
 *
 * **Die zweite Bedingung ist die wichtigere.** Dieser Zweig entscheidet über
 * die *Aktion*, nicht über einen Vergleich: `case 'talkEdit': wocheSpeichern(…)`
 * schreibt, ob am Thema etwas anders ist oder nicht. Und mehrere Aktionen
 * kommen im Betrieb regelmäßig ohne Änderung an — die Freitextfelder schicken
 * bei **jedem** Verlassen (`onBlur`), auch wenn niemand getippt hat; die
 * Minuten-Knöpfe schicken auch am Anschlag (5 bzw. 45); ein schon gesetzter
 * Anlass lässt sich noch einmal auswählen.
 *
 * Ohne den Vergleich ging jedes Hineinklicken in ein Feld als Schreibvorgang
 * hinaus. Das ist nicht bloß Verschwendung: Die Wochen werden mit
 * Vergleiche-und-Tausche gespeichert (T39), ein Schreibvorgang hebt also den
 * Zeitstempel — und der nächste Planer bekommt einen Konflikt für eine Woche
 * gemeldet, die niemand angefasst hat, samt neu geladener Ansicht.
 *
 * Der Reducer gibt unberührte Wochen **identisch** zurück; darauf baut die
 * ganze Persistenzschicht auf (siehe `geaenderteWochenSpeichern` darunter, das
 * dieselbe Prüfung schon länger macht). Hier fehlte sie nur.
 */
function wocheSpeichern(congId: string, vorher: Week[], weeks: Week[], wi: number): void {
  const week = weeks[wi]
  if (!week || vorher[wi] === week) return
  saveWeek(congId, week)
}

/**
 * Jede Woche speichern, die sich zwischen zwei Ständen geändert hat.
 *
 * Zwei Einstellungen greifen in die Wochendaten selbst: die
 * Zusammenkunftszeit zieht die Endzeiten nach, und die Zusätzliche Klasse
 * setzt bzw. entfernt in jeder Woche die Marke `auxRatgeber` samt zweiter
 * Platzreihe. Beides steht in den Wochenzeilen, nicht in den Einstellungen.
 *
 * Geschrieben wird nur, was sich wirklich geändert hat — der Reducer gibt
 * unberührte Wochen identisch zurück, und `syncAuxSlots` tut das ebenso.
 */
function geaenderteWochenSpeichern(congId: string, vorher: Week[], nachher: Week[]): void {
  if (vorher === nachher) return
  for (let wi = 0; wi < nachher.length; wi++) {
    if (nachher[wi] !== vorher[wi]) wocheSpeichern(congId, vorher, nachher, wi)
  }
}

/**
 * Nach einem Löschen die **Nachrücker** neu nummerieren.
 *
 * `position` ist der Index in der Liste (Dienste wie Gruppen). Wird aus der
 * Mitte gelöscht, rutscht alles dahinter eine Stelle vor — bleiben die alten
 * Nummern stehen, entsteht eine Lücke, und die nächste **neu angelegte** Zeile
 * bekommt `Länge − 1`, also eine Nummer, die es schon gibt. `.order('position')`
 * ist dann für zwei Zeilen unentschieden: Die Liste kann beim nächsten Laden
 * kippen, und mit ihr die Reinigungs-Rotation, die über die Gruppenreihenfolge
 * läuft (`groups[weekIndex % groups.length]` in `autoAssignMeeting`).
 *
 * Geschrieben wird nur, was wirklich verrutscht ist: Der Reducer filtert die
 * Liste, unberührte Einträge behalten also ihre Referenz — steht an Index `i`
 * ein anderes Objekt als vorher, ist es verschoben.
 */
function positionenNachziehen<T>(
  vorher: readonly T[],
  nachher: readonly T[],
  schreiben: (eintrag: T, position: number) => void,
): void {
  for (let i = 0; i < nachher.length; i++) {
    const eintrag = nachher[i]
    if (eintrag !== undefined && vorher[i] !== eintrag) schreiben(eintrag, i)
  }
}

/** Wie `wocheSpeichern`, nur gebündelt — für Änderungen je Tastenanschlag. */
function wochePlanen(congId: string, weeks: Week[], wi: number): void {
  const week = weeks[wi]
  if (week) weekSaves.schedule(week.start, { congId, week })
}

/**
 * Treffpunkt-Woche an `wi` speichern, falls es sie gibt.
 *
 * Die Kennung steht bei der **Woche**, nicht bei den Treffpunkten — deshalb
 * liegen hier beide Listen. Fehlt die Woche, gibt es nichts zu bezeichnen.
 */
function fsWocheSpeichern(congId: string, weeks: Week[], fsWeeks: FsInstance[][], wi: number): void {
  const week = weeks[wi]
  const fsWeek = fsWeeks[wi]
  if (week && fsWeek) saveFsWeek(congId, week.start, fsWeek)
}

/** Wie `fsWocheSpeichern`, nur gebündelt — für Änderungen je Tastenanschlag. */
function fsWochePlanen(congId: string, weeks: Week[], fsWeeks: FsInstance[][], wi: number): void {
  const week = weeks[wi]
  const fsWeek = fsWeeks[wi]
  if (week && fsWeek) fsWeekSaves.schedule(week.start, { congId, insts: fsWeek })
}

export function persist(prev: AppState, next: AppState, action: AppAction): void {
  const congId = next.congregationId
  const userId = next.userId
  if (!supabase || !congId || !userId) return
  // Offline-Momentaufnahme: nichts schreiben. Der Provider weist Schreib-
  // Aktionen bereits ab (readonly.ts) — hier als zweite Absicherung, damit ein
  // übersehener Pfad nicht in einen Schreibversuch auf veraltetem Stand läuft.
  if (next.staleAt) return

  switch (action.type) {
    case 'assign': {
      const sel = prev.slotSel
      // Treffpunkt-Leiter (fs): eigene Wochen-Tabelle.
      if (sel && sel.kind === 'fs') {
        fsWocheSpeichern(congId, next.weeks, next.fsWeeks, sel.wi)
        break
      }
      if (sel) {
        wocheSpeichern(congId, prev.weeks, next.weeks, sel.wi)
        // Bestätigungs-Einträge geänderter Slots abräumen (migration-007)
        const vorher = prev.weeks[sel.wi]?.[sel.tab]
        const nachher = next.weeks[sel.wi]?.[sel.tab]
        if (vorher && nachher) {
          deleteConfirmationRows(
            congId,
            changedSlotKeys(vorher, nachher, prev.services, next.weeks[sel.wi]?.start ?? '', sel.tab),
          )
        }
      }
      break
    }
    case 'autoAssign': {
      const before = prev.weeks[prev.week]?.[mtab(prev.tab)]
      const after = next.weeks[prev.week]?.[mtab(prev.tab)]
      if (before && after) {
        // Bestätigungs-Einträge geänderter Slots abräumen (migration-007)
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, next.weeks[prev.week]?.start ?? '', mtab(prev.tab)),
        )
        wocheSpeichern(congId, prev.weeks, next.weeks, prev.week)
      }
      break
    }
    case 'clearAssignments': {
      const before = prev.weeks[prev.week]?.[mtab(prev.tab)]
      const after = next.weeks[prev.week]?.[mtab(prev.tab)]
      if (before && after && next.weeks !== prev.weeks) {
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, next.weeks[prev.week]?.start ?? '', mtab(prev.tab)),
        )
        wocheSpeichern(congId, prev.weeks, next.weeks, prev.week)
      }
      break
    }
    case 'fsInstUpdate':
    case 'fsInstRemove':
      fsWocheSpeichern(congId, next.weeks, next.fsWeeks, action.wi)
      break
    case 'fsInstAdd':
    case 'fsAutoAssign':
    case 'fsClear':
      fsWocheSpeichern(congId, next.weeks, next.fsWeeks, prev.week)
      break
    case 'fsRuleAdd':
    case 'fsRuleUpdate':
    case 'fsRuleRemove': {
      // Grundplan-Blob + die neu materialisierten Wochen. Beides gebündelt:
      // der Ort ist ein Freitextfeld, und ohne Bündelung ging je Tastenanschlag
      // der Grundplan **und** jede Woche einzeln an die Datenbank. Geschrieben
      // wird zudem nur, was sich wirklich geändert hat — `regenFsWeeks` lässt
      // unberührten Wochen ihre Referenz.
      fsRuleSaves.schedule('rules', {
        congId,
        base: next.fsBase.toISOString().slice(0, 10),
        rules: next.fsRules,
      })
      for (let i = 0; i < next.fsWeeks.length; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWochePlanen(congId, next.weeks, next.fsWeeks, i)
      }
      break
    }
    case 'lacMove': {
      if (next.weeks === prev.weeks) break // Rand: kein Tausch
      wocheSpeichern(congId, prev.weeks, next.weeks, prev.week)
      // Bestätigungen der getauschten Positionen in der DB mittauschen
      const items = prev.weeks[prev.week]?.[mtab(prev.tab)].sections[action.si]?.items
      const b = items ? lacMoveTarget(items, action.ii, action.dir) : null
      const a = items?.[action.ii]
      const bItem = b == null ? undefined : items?.[b]
      if (b != null && a && bItem) {
        const count = Math.max(itemNameCount(a), itemNameCount(bItem))
        void swapConfirmationKeys(
          congId,
          partSwapKeyPairs(prev.weeks[prev.week]?.start ?? '', mtab(prev.tab), action.si, action.ii, b, count),
        )
      }
      break
    }
    case 'lacRemove':
    case 'lacAdd': {
      wocheSpeichern(congId, prev.weeks, next.weeks, prev.week)
      // Die folgenden Punkte rutschen um eine Position; task_keys sind
      // positionsbasiert, die Bestätigungen müssen also mit umbenannt werden.
      // Dieselbe Rechnung wie im Reducer, damit beide Seiten übereinstimmen.
      const tab = mtab(prev.tab)
      const items = prev.weeks[prev.week]?.[tab].sections[action.si]?.items
      if (!items) break
      const ab = action.type === 'lacRemove' ? action.ii : lacAddIndex(items)
      const delta = action.type === 'lacRemove' ? -1 : 1
      const { renames, removed } = shiftPartConfirmations(
        prev.confirmations,
        prev.weeks[prev.week]?.start ?? '',
        tab,
        action.si,
        ab,
        delta,
      )
      deleteConfirmationRows(congId, removed)
      void renameConfirmationKeys(congId, renames)
      break
    }
    case 'lacAdjust':
    case 'togglePartner':
    case 'talkEdit':
    case 'openingSong':
    case 'closingSong':
    case 'setAbweichung': // Sonderwoche: Verlegung, Ausfall, Grund (T30)
    case 'setDienstwoche': // Kreisaufseher-Woche: Ablauf umgebaut (T62)
    case 'setAnlass': // Anlass der Woche samt seinen Wirkungen (T64)
    case 'setAnlassTermin':
    case 'terminAdd': // Weitere Termine der Woche (T63)
    case 'terminUpdate':
    case 'terminRemove':
    case 'setPartThema': // Thema eines Vortragspunkts (T62)
      wocheSpeichern(congId, prev.weeks, next.weeks, prev.week)
      break
    case 'finishImport':
    case 'addImportedWeek':
      wocheSpeichern(congId, prev.weeks, next.weeks, next.weeks.length - 1)
      break
    case 'mergeWeekAlt':
      wocheSpeichern(congId, prev.weeks, next.weeks, action.wi)
      break
    case 'addPerson':
      savePerson(congId, action.person)
      break
    case 'updatePerson': {
      // Auto-Speichern mit Debounce: Tipp-Änderungen werden gebündelt
      const p = next.persons.find((x) => x.id === action.id)
      if (p) personSaves.schedule(p.id, { congId, person: p })
      // Namensänderung hat Wochen umgeschrieben (renameInWeeks) → betroffene
      // Wochen ebenfalls (gebündelt) speichern; unveränderte behalten ihre Ref.
      for (let i = 0; i < next.weeks.length; i++) {
        if (next.weeks[i] !== prev.weeks[i]) wochePlanen(congId, next.weeks, i)
      }
      // Dasselbe für die Treffpunkte (fsRenameLeader) — eigene Tabelle, eigener
      // Schreibweg. Ohne dies hielte der neue Name nur bis zum nächsten Laden.
      for (let i = 0; i < next.fsWeeks.length; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWocheSpeichern(congId, next.weeks, next.fsWeeks, i)
      }
      // Planer-Recht sofort in gespiegelte Konten und offene Codes schreiben
      if ('planner' in action.patch) {
        for (const m of next.members) {
          if (m.personId === action.id && m.userId !== next.userId) saveMemberRow(m)
        }
        for (const i of next.invites) {
          if (i.personId === action.id) saveInvitePlanner(i.id, i.planner)
        }
      }
      break
    }
    case 'selectPerson':
    case 'navigate':
    case 'logout': {
      // Namenlose (abgebrochene) Person wurde im Reducer entfernt → auch in
      // der DB löschen, ohne dass ein ausstehender Save sie wiederbelebt.
      const sel = prev.selectedPersonId
      if (sel && prev.persons.some((p) => p.id === sel) && !next.persons.some((p) => p.id === sel)) {
        personSaves.cancel(sel)
        deletePersonRow(sel)
      }
      // Ansicht verlassen → ausstehende Debounce-Saves sofort schreiben
      personSaves.flush()
      weekSaves.flush()
      congSaves.flush()
      fsWeekSaves.flush()
      fsRuleSaves.flush()
      break
    }
    case 'removePerson': {
      personSaves.cancel(action.id)
      deletePersonRow(action.id) // groups/invites-FKs räumt die DB (set null)
      for (const m of prev.members) {
        if (m.personId === action.id) saveMemberRow({ ...m, personId: null })
      }
      // Die gelösten Verweise (T38) müssen auch in der Datenbank landet sein —
      // sonst zeigt der Fremdschlüssel dort weiter ins Leere. Nur die wirklich
      // geänderten Wochen: unveränderte behalten ihre Referenz.
      for (let i = 0; i < next.weeks.length; i++) {
        if (next.weeks[i] !== prev.weeks[i]) wochePlanen(congId, next.weeks, i)
      }
      for (let i = 0; i < next.fsWeeks.length; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWocheSpeichern(congId, next.weeks, next.fsWeeks, i)
      }
      break
    }
    case 'setFamily':
      // Familien-Id wurde bei beiden (bzw. mehreren) Beteiligten geändert.
      for (const p of next.persons) {
        if (prev.persons.find((q) => q.id === p.id)?.fam !== p.fam) savePerson(congId, p)
      }
      break
    case 'addAbsence':
      // Person und Ersteller stehen im Datensatz — der Planer trägt hier auch
      // für andere ein, und `next.personId` wäre dann seine eigene Person.
      saveAbsence(congId, action.absence)
      break
    case 'removeAbsence':
      deleteAbsenceRow(action.id)
      break
    case 'addService': {
      const pos = next.services.length - 1
      if (pos >= 0) saveService(congId, action.service, pos)
      break
    }
    case 'changeServiceCount': {
      const idx = next.services.findIndex((s) => s.key === action.key)
      const svc = next.services[idx]
      if (svc) saveService(congId, svc, idx)
      break
    }
    case 'removeService':
      deleteServiceRow(congId, action.key)
      positionenNachziehen(prev.services, next.services, (svc, pos) => saveService(congId, svc, pos))
      break
    case 'addGroup':
      // Die Position ist der Index in der Liste — sie hängt sich hinten an.
      // Ohne sie stünden alle Gruppen auf 0, und die Ladereihenfolge wäre die
      // Ablage der Datenbank (siehe `saveGroupRow`).
      saveGroupRow(congId, action.group, next.groups.length - 1)
      break
    case 'updateGroup': {
      const idx = next.groups.findIndex((g) => g.id === action.id)
      const group = next.groups[idx]
      if (group) saveGroupRow(congId, group, idx)
      break
    }
    case 'removeGroup':
      deleteGroupRow(action.id)
      positionenNachziehen(prev.groups, next.groups, (grp, pos) => saveGroupRow(congId, grp, pos))
      // Mitglieder der Gruppe haben grp=null bekommen → mitschreiben
      for (const p of next.persons) {
        if (prev.persons.find((q) => q.id === p.id)?.grp === action.id) savePersonGroup(p)
      }
      break
    case 'markAllRead':
      markNotificationsRead(congId, userId)
      break
    case 'clearNotifs':
      deleteNotifications(congId, userId)
      break
    case 'confirmTask':
      saveConfirmation(congId, userId, action.id, 'bestätigt')
      break
    case 'declineTask':
      saveConfirmation(congId, userId, action.id, 'verhindert')
      // Hilfsdienst: automatisch Ersatz suchen (qualifizierte Personen anpingen).
      if (helperKeyParts(action.id)) substituteSeek(action.id)
      break
    case 'takeSubstitute':
      // Nicht clientseitig speichern (Wochen/Bestätigungen sind planer-only) —
      // die Edge Function trägt ein und benachrichtigt Ursprungsperson + Planer.
      substituteTake(action.key)
      break
    case 'changeReminder':
    case 'toggleReminderRepeat':
    case 'setAuxClass':
    case 'setCongLang':
    case 'addProgLang':
    case 'removeProgLang':
      saveSettings(congId, {
        reminders: next.reminders,
        congLang: next.congLang,
        progLangs: next.progLangs,
        auxClass: next.auxClass,
      })
      /*
       * **Der Schalter allein genügt nicht.** `setAuxClass` baut über
       * `syncAuxSlots` jede geladene Woche um: Ein- und Ausschalten setzt bzw.
       * entfernt dort die Marke `auxRatgeber` und die zweite Platzreihe.
       *
       * Genau an dieser Marke erkennen die Edge Functions, ob es die
       * Zusätzliche Klasse gibt (`_shared/zuteilungen.ts`) — die Einstellung
       * selbst lesen sie nicht. Blieb sie in der Datenbank stehen, hielten sie
       * die Klasse für eingerichtet und schickten Erinnerungen und
       * „Plan senden" weiter an einen Raum, den der Planer abgeschaltet hatte,
       * und an einen Ratgeber, den die App nirgends mehr zeigte. Beim nächsten
       * Laden war er dann auch wieder da.
       *
       * Die übrigen Aktionen dieser Gruppe fassen keine Woche an; für sie ist
       * der Aufruf ein Nichts.
       */
      geaenderteWochenSpeichern(congId, prev.weeks, next.weeks)
      break
    case 'updateCongregation':
      congSaves.schedule('info', { congId, info: next.congregation })
      // Eine geänderte Zusammenkunftszeit verschiebt die Endzeiten aller
      // geladenen Wochen (siehe `endenNachziehen`). Die stehen in den
      // Wochenzeilen, nicht in den Einstellungen — also müssen sie mit
      // gespeichert werden, sonst steht die alte Endzeit nach dem nächsten
      // Laden wieder da. Gespeichert wird nur, was sich wirklich geändert hat:
      // der Reducer gibt unveränderte Wochen identisch zurück.
      geaenderteWochenSpeichern(congId, prev.weeks, next.weeks)
      break
    case 'updateMember': {
      const member = next.members.find((m) => m.userId === action.userId)
      if (member) saveMemberRow(member)
      break
    }
    case 'removeMember':
      deleteMemberRow(action.userId)
      break
    case 'addInvite':
      saveInvite(congId, action.invite)
      break
    case 'removeInvite':
      deleteInviteRow(action.id)
      break
  }

  /*
   * Eine hier entstandene Mitteilung (Zuteilung, Import, Verhinderung) an die
   * Planer der Versammlung schicken — je Empfänger eine eigene Zeile mit
   * eigenem Gelesen-/Lösch-Status. Erinnerungen erzeugt die Edge Function
   * selbst (adressiert an die betroffene Person).
   *
   * Erkannt am `local`-Kennzeichen, das der Reducer beim Erzeugen setzt — nicht
   * daran, dass die Liste länger geworden ist. Auf `hydrate` träfe das nämlich
   * ebenfalls zu: es lädt die gespeicherten Mitteilungen, und aus jedem Laden
   * wurde so eine neue, die beim nächsten Laden wieder mitkam. Eine Aufzählung
   * der auslösenden Aktionen wäre die zweite Buchführung gewesen — wer eine
   * vergisst, merkt es nie, weil nichts fehlschlägt.
   */
  const neu = next.notifs[0]
  if (neu?.local && neu !== prev.notifs[0]) {
    const planners = next.members.filter((m) => m.planner).map((m) => m.userId)
    insertNotifications(congId, planners, neu.type, neu.title, neu.text)
  }

  /*
   * **Wem eine bestätigte Zusage genommen wurde, erfährt es sofort** (T99).
   *
   * Nach demselben Grundsatz wie oben an **einer** Stelle für alle Wege:
   * einzeln zuteilen, umteilen, leeren, Auto-Zuteilung, Treffpunkt-Leiter,
   * Treffpunkt-Auto — und alles, was künftig dazukommt. Eine Aufzählung der
   * auslösenden Aktionen wäre die zweite Buchführung: wer eine vergisst, merkt
   * es nie, weil nichts fehlschlägt — es geht nur eine Nachricht weniger
   * hinaus, und der Betroffene übt weiter für einen Platz, den er nicht mehr
   * hat.
   *
   * Verglichen wird gegen `prev.confirmations`: Der Reducer hat den Eintrag zu
   * diesem Zeitpunkt schon verworfen (`dropConfirmations`), im vorigen Stand
   * steht er noch.
   *
   * `hydrate` ist ausgenommen, und nur das: Dort wird der ganze Bestand
   * ersetzt, und ein Neuladen nach einem Schreibkonflikt brächte sonst Wochen
   * voller vermeintlicher Entzüge hervor.
   */
  if (action.type !== 'hydrate' && (prev.weeks !== next.weeks || prev.fsWeeks !== next.fsWeeks)) {
    /*
     * **Erst sammeln, dann einmal schicken.** Je Entzug ein eigener Aufruf
     * hieß: Die Function las für jeden davon aufs Neue alle Mitglieder, alle
     * Personen und alle Push-Abos der Versammlung. Eine Auto-Zuteilung fasst
     * aber eine ganze Zusammenkunft an, und `setAuxClass` oder `fsRuleAdd`
     * fassen alle 52 Wochen auf einmal an — aus einer Handlung wurden Dutzende
     * Aufrufe. Gesammelt ist es einer, und wer zwei Plätze verliert, bekommt
     * eine Nachricht statt zweier.
     */
    const entzogen: EntzogeneZusage[] = []
    for (let wi = 0; wi < prev.weeks.length; wi++) {
      // Unberührte Wochen behalten ihre Referenz — der Vergleich kostet nichts.
      if (prev.weeks[wi] === next.weeks[wi] && prev.fsWeeks[wi] === next.fsWeeks[wi]) continue
      entzogen.push(
        ...entzogeneZusagen(
          prev.weeks[wi],
          next.weeks[wi],
          prev.fsWeeks[wi],
          next.fsWeeks[wi],
          wi,
          prev.fsBase,
          prev.services,
          prev.congregation.meetings,
          prev.confirmations,
        ),
      )
    }
    // Der Regelfall: nichts verloren, nichts zu schicken.
    if (entzogen.length > 0) sendPlanEntzug(entzogen)
  }
}
