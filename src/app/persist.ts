/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase (Fire-and-forget über lib/data). Läuft nur im konfigurierten,
 * hydrierten Zustand. Der Reducer bleibt rein; hier werden `prev`/`next`
 * (Zustand vor/nach der Aktion) ausgewertet.
 */

import { fsTaskKeyWoche } from '../data/fs'
import { type EntzogeneZusage, entzogeneZusagen } from '../data/plan-versand'
import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  deleteGroupRow,
  deleteHouseholdRow,
  deletePersonRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteServiceRow,
  markNotificationRead,
  markNotificationsRead,
  notifyPlanners,
  persoenlichBescheid,
  saveAbsence,
  saveConfirmation,
  saveCongregationInfo,
  saveFamily,
  saveFsRules,
  saveFsWeek,
  saveGroupRow,
  saveGruppenbesuche,
  saveInvite,
  saveInviteRechte,
  saveMemberRow,
  savePerson,
  savePersonGroup,
  saveService,
  savePlaene,
  savePlanEintraege,
  saveSettings,
  saveTrolleys,
  saveVortraege,
  saveWeek,
  substituteSeek,
  substituteTake,
  substituteWithdraw,
  sendPlanEntzug,
  platzFuellen,
} from '../lib/data'
import { helperKeyParts } from '../data/planning'
import { supabase } from '../lib/supabase'
import type { FsInstance, Person, Trolley, Week } from '../data/types'
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

/**
 * Alle gebündelten Schreiber — jeder trägt sich bei seiner Erzeugung selbst
 * ein. Beim Verlassen der Ansicht und beim Abmelden gehen sie gemeinsam hinaus.
 *
 * Bis zum 3.10.2026 stand dort eine Liste von Hand, und ihr fehlten die beiden
 * Schreiber aus T120 (Zeugnis-Termine, Weitere Pläne): Wer binnen 600 ms nach
 * dem Tippen eines Orts oder Plannamens abmeldete, dessen Änderung ging erst
 * nach dem Abmelden hinaus — und scheiterte an der Anmeldung.
 */
const ALLE_FLUSHES: (() => void)[] = []

/**
 * Was sich an einer Tabelle „eine Zeile je …" geändert hat: `geaendert` sind
 * neue oder geänderte Zeilen (neue Referenz — der Reducer gibt Unberührtem
 * seine Referenz zurück), `neu` nur die mit unbekannter Kennung, `entfernt`
 * die Kennungen, die wegfielen. Stand bis zum 3.10.2026 sechsmal da.
 */
function zeilenAenderung<T extends { id: string }>(vorher: readonly T[], nachher: readonly T[]) {
  const alt = new Map(vorher.map((z) => [z.id, z]))
  const bleibt = new Set(nachher.map((z) => z.id))
  return {
    geaendert: nachher.filter((z) => alt.get(z.id) !== z),
    neu: nachher.filter((z) => !alt.has(z.id)),
    entfernt: vorher.filter((z) => !bleibt.has(z.id)).map((z) => z.id),
  }
}

/**
 * @param merge Wie zwei Fassungen desselben Schlüssels zusammenfallen. Ohne
 *   sie gewinnt die neuere — richtig für alles, was den **Zustand** schreibt
 *   (eine Person, eine Woche). Wer im Wert auch eine **Absicht** mitführt (was
 *   ist zu löschen), braucht sie: Diese Absicht steht nicht mehr im neueren
 *   Wert, und einfach zu überschreiben verlöre sie.
 */
function createDebouncedWriter<K, V>(
  delayMs: number,
  write: (key: K, value: V) => void,
  merge?: (alt: V, neu: V) => V,
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
  ALLE_FLUSHES.push(flush)
  return {
    schedule(key, value) {
      const alt = pending.get(key)
      pending.set(key, alt !== undefined && merge ? merge(alt, value) : value)
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
const weekSaves = createDebouncedWriter<string, { congId: string; week: Week; nurZuteilen: boolean }>(
  SAVE_DELAY,
  (_woche, { congId, week, nurZuteilen }) => saveWeek(congId, week, nurZuteilen),
)
// Nur die geänderten Felder (`geaenderteFelder`) — gesammelt über die
// Tastenanschläge, die neueste Fassung je Feld.
const congSaves = createDebouncedWriter<'info', { congId: string; info: Partial<AppState['congregation']> }>(
  SAVE_DELAY,
  (_key, { congId, info }) => saveCongregationInfo(congId, info),
  (alt, neu) => ({ ...neu, info: { ...alt.info, ...neu.info } }),
)

/** Die Felder, die sich zwischen zwei Ständen geändert haben (Referenzvergleich, eine Ebene). */
function geaenderteFelder<T extends object>(vorher: T, nachher: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(nachher).filter(([k, v]) => vorher[k as keyof T] !== v),
  ) as Partial<T>
}

/**
 * Die Einstellungen der Versammlung — nur, was diese Aktion geändert hat
 * (siehe `saveSettings`). Hat sie nichts geändert, geht nichts hinaus.
 */
function einstellungenSpeichern(congId: string, prev: AppState, next: AppState): void {
  const aenderung = geaenderteFelder(
    { reminders: prev.reminders, congLang: prev.congLang, progLangs: prev.progLangs, auxClass: prev.auxClass },
    { reminders: next.reminders, congLang: next.congLang, progLangs: next.progLangs, auxClass: next.auxClass },
  )
  if (Object.keys(aenderung).length > 0) saveSettings(congId, aenderung)
}
/*
 * Treffpunkt-Zusagen, deren Löschen auf das gebündelte Schreiben ihrer Woche
 * wartet — je Woche (Kennung).
 *
 * **Nie vor der Woche.** Eine Grundplan-Änderung entfernt oder besetzt
 * Treffpunkte in vielen Wochen, geschrieben werden die Wochen aber erst nach
 * kurzer Ruhe (`fsWeekSaves`). Bis zum 15. September 2026 ging das Löschen der
 * alten Zusagen sofort hinaus. Wurde die App in diesen 600 ms geschlossen,
 * stand in der Datenbank der alte Leiter — ohne seine Zusage: Er galt als
 * unbestätigt und bekam erneut Erinnerungen. Jetzt geht beides gemeinsam oder
 * gar nicht.
 */
const ausstehendeFsLoeschungen = new Map<string, Set<string>>()

// Treffpunkte: derselbe Weg wie bei den Wochen — gebündelt je Kennung.
const fsWeekSaves = createDebouncedWriter<string, { congId: string; insts: FsInstance[] }>(
  SAVE_DELAY,
  (woche, { congId, insts }) => {
    saveFsWeek(congId, woche, insts)
    const keys = ausstehendeFsLoeschungen.get(woche)
    ausstehendeFsLoeschungen.delete(woche)
    if (keys?.size) deleteConfirmationRows(congId, [...keys])
  },
)
/*
 * **Tabellen „eine Zeile je …", gebündelt geschrieben** — der Grundplan der
 * Treffpunkte, die Trolleys, die Weiteren Pläne. Alle drei hängen an
 * Freitextfeldern (Ort, Name), und der Grundplan und die Pläne ändern sich je
 * Tastenanschlag.
 *
 * Mitgeführt wird nur, **was dieser Planer geändert oder entfernt hat** —
 * geschrieben wird genau das, gelöscht genau das (siehe `saveFsRules`). Bis
 * zum 3.10.2026 ging stattdessen die ganze Liste als Upsert hinaus: Hatte ein
 * zweiter Planer inzwischen einen Termin gelöscht oder einen Plan
 * veröffentlicht, stellte das nächste Tippen hier den Termin leer wieder her
 * und den Plan zurück auf Entwurf — ohne Fehler, auf beiden Bildschirmen
 * unbemerkt.
 */
interface ZeilenBuendel<T extends { id: string }> {
  congId: string
  /** Neue oder geänderte Zeilen. */
  zeilen: T[]
  /** Kennungen der entfernten Zeilen. */
  entfernt: string[]
}

/**
 * Zwei Bündel derselben Tabelle zu einem: Je Kennung gewinnt die neuere
 * Fassung, Löschungen sammeln sich — sonst verlöre „Regel A löschen, dann
 * Regel B löschen" das A. Was die neuere Änderung entfernt, geht nicht mehr
 * als Zeile mit (das Schreiben nach dem Löschen holte es zurück); was sie
 * wieder schreibt, nicht mehr als Löschung.
 */
function zeilenSammeln<T extends { id: string }>(alt: ZeilenBuendel<T>, neu: ZeilenBuendel<T>): ZeilenBuendel<T> {
  const weg = new Set(neu.entfernt)
  const nachId = new Map(alt.zeilen.filter((z) => !weg.has(z.id)).map((z) => [z.id, z]))
  for (const z of neu.zeilen) nachId.set(z.id, z)
  return {
    ...neu,
    zeilen: [...nachId.values()],
    entfernt: [...new Set([...alt.entfernt.filter((id) => !nachId.has(id)), ...neu.entfernt])],
  }
}

type ZeilenSchreiber<T extends { id: string }> = DebouncedWriter<'zeilen', ZeilenBuendel<T>>

function zeilenSchreiber<T extends { id: string }>(
  speichern: (congId: string, zeilen: T[], entfernt: string[]) => void,
): ZeilenSchreiber<T> {
  return createDebouncedWriter(SAVE_DELAY, (_key, { congId, zeilen, entfernt }) => speichern(congId, zeilen, entfernt), zeilenSammeln)
}

const fsRuleSaves = zeilenSchreiber(saveFsRules)
// Trolleys schreibt dieser Weg nur an — entfernt werden sie über die Function
// `trolley`, die den Eingetragenen Bescheid sagt (`saveTrolleys`).
const trolleySaves = zeilenSchreiber<Trolley>((congId, zeilen) => saveTrolleys(congId, zeilen))
const planSaves = zeilenSchreiber(savePlaene)

/** Was sich zwischen zwei Ständen einer Tabelle geändert hat, ins Bündel — nichts, wenn nichts. */
function zeilenPlanen<T extends { id: string }>(
  schreiber: ZeilenSchreiber<T>,
  congId: string,
  vorher: readonly T[],
  nachher: readonly T[],
): void {
  if (vorher === nachher) return
  const { geaendert, entfernt } = zeilenAenderung(vorher, nachher)
  if (geaendert.length || entfernt.length) schreiber.schedule('zeilen', { congId, zeilen: geaendert, entfernt })
}

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
function wocheSpeichern(congId: string, vorher: Week[], weeks: Week[], wi: number, nurZuteilen: boolean): void {
  const week = weeks[wi]
  if (!week || vorher[wi] === week) return
  saveWeek(congId, week, nurZuteilen)
}

/**
 * **Jede geänderte Woche wird geschrieben — abgelesen, nicht aufgezählt.**
 *
 * Nach demselben Grundsatz wie die Mitteilungen und die entzogenen Zusagen am
 * Ende dieser Datei. Vorher stand hier eine Aufzählung der auslösenden
 * Aktionen: siebzehn `case`-Marken, die nichts taten als „schreib die Woche".
 * Wer eine neue wochenändernde Aktion baute und sich nicht eintrug, verlor die
 * Änderung beim nächsten Laden — und **nichts schlug fehl**. Genau davor warnt
 * `kein-leerlauf-schreiben.test.ts`.
 *
 * Der Vergleich trägt auch das, was keine Aktion je aufgezählt hätte: Eine
 * geänderte Zusammenkunftszeit zieht die Endzeiten **aller** geladenen Wochen
 * nach (`endenNachziehen`), und die Zusätzliche Klasse setzt bzw. entfernt in
 * jeder Woche die Marke `auxRatgeber` samt zweiter Platzreihe (`syncAuxSlots`).
 * Beides steht in den Wochenzeilen, nicht in den Einstellungen.
 *
 * Geschrieben wird nur, was sich wirklich geändert hat — der Reducer gibt
 * unberührte Wochen identisch zurück; darauf baut die ganze Persistenzschicht.
 *
 * `gebuendelt` verzögert das Schreiben (siehe `wochePlanen`). Diese Liste darf
 * unvollständig sein: Wer dort fehlt, wird sofort geschrieben — mehr Anfragen,
 * aber nichts geht verloren. Die Frage **ob** geschrieben wird, hängt dagegen
 * an keiner Liste mehr.
 *
 * `nurZuteilen`: Wer nicht Admin ist, schreibt Wochen nur über die Edge
 * Function `zuteilen` (Rechte-Stufe „Planer", 4.10.2026). Gefragt wird am
 * Recht, nicht an der Aktion — dieselbe Abwägung wie oben.
 */
function geaenderteWochenSpeichern(
  congId: string,
  vorher: Week[],
  nachher: Week[],
  gebuendelt: boolean,
  nurZuteilen: boolean,
): void {
  if (vorher === nachher) return
  for (let wi = 0; wi < nachher.length; wi++) {
    if (nachher[wi] === vorher[wi]) continue
    if (gebuendelt) wochePlanen(congId, nachher, wi, nurZuteilen)
    else wocheSpeichern(congId, vorher, nachher, wi, nurZuteilen)
  }
}

/**
 * Aktionen, deren Wochen-Änderungen **gebündelt** hinausgehen: Das
 * Personen-Formular löst je Tastenanschlag aus, und eine Umbenennung zieht
 * durch jede geplante Woche (`renameInWeeks`) — einzeln geschrieben wären das
 * Dutzende Anfragen je Buchstabe. `flush()` beim Verlassen der Ansicht holt sie
 * ein (`selectPerson`/`navigate`/`logout`).
 *
 * `updateCongregation` gehört dazu, seit die Zusammenkunftszeit die Endzeit
 * **jeder** geladenen Woche nachzieht (`endenNachziehen`): Stunde und Minute
 * sind zwei Auswahlfelder, also zwei Aktionen kurz nacheinander — sofort
 * geschrieben wären das zweimal bis zu 52 Anfragen, gebündelt geht jede Woche
 * einmal hinaus, mit dem letzten Stand (T118).
 */
const GEBUENDELT: readonly AppAction['type'][] = [
  'updatePerson',
  'removePerson',
  'removeService',
  'updateCongregation',
]

/**
 * Aktionen, deren geänderte Wochen und verfallene Zusagen **nicht** von hier
 * geschrieben werden — je mit einem Grund, nicht als Buchhaltung:
 *
 * - `hydrate` ersetzt den ganzen Bestand. Geschrieben würde alles, was gerade
 *   gelesen wurde — und weil Wochen mit Vergleiche-und-Tausche gespeichert
 *   werden (T39), bekäme der nächste Planer Konflikte für Wochen, die niemand
 *   angefasst hat; und jede Zusage, die der frische Bestand nicht mehr kennt,
 *   würde gelöscht.
 * - `takeSubstitute` schreibt die Edge Function: Wochen und Bestätigungen sind
 *   planer-only, der Einspringende dürfte es selbst gar nicht.
 * - `platzUebernehmen` aus demselben Grund (4.10.2026): Einen offenen Platz
 *   trägt die Edge Function ein, nicht der Verkündiger selbst.
 */
const OHNE_WOCHENSCHREIBEN: readonly AppAction['type'][] = ['hydrate', 'takeSubstitute', 'platzUebernehmen']

/**
 * **Was sich in einer Liste geändert hat, in die Datenbank** — jeder Eintrag,
 * der an seiner Stelle nicht mehr derselbe ist, mit seinem Index als Position.
 *
 * Der Reducer bildet Listen ab oder filtert sie; unberührte Einträge behalten
 * ihre Referenz. Steht an Index `i` ein anderes Objekt als vorher, ist es
 * verschoben oder geändert — beides muss hinaus, sonst nichts.
 *
 * Verschoben wird nach einem Löschen: `position` ist der Index in der Liste
 * (Dienste wie Gruppen). Wird aus der Mitte gelöscht, rutscht alles dahinter
 * eine Stelle vor — bleiben die alten Nummern stehen, entsteht eine Lücke, und
 * die nächste **neu angelegte** Zeile bekommt `Länge − 1`, also eine Nummer,
 * die es schon gibt. `.order('position')` ist dann für zwei Zeilen
 * unentschieden: Die Liste kann beim nächsten Laden kippen, und mit ihr die
 * Reinigungs-Rotation, die über die Gruppenreihenfolge läuft
 * (`groups[weekIndex % groups.length]` in `autoAssignMeeting`).
 *
 * Geändert wird nebenbei: die Bereiche der Personen, wenn ein Dienst geht; das
 * Amt in der alten Gruppe, wenn jemand die Gruppe wechselt.
 */
function geaenderteSchreiben<T>(
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
function wochePlanen(congId: string, weeks: Week[], wi: number, nurZuteilen: boolean): void {
  const week = weeks[wi]
  if (week) weekSaves.schedule(week.start, { congId, week, nurZuteilen })
}

/**
 * Zusagen, die der Reducer bei dieser Aktion abgeräumt hat — die der
 * Zusammenkünfte als Liste, die der Treffpunkte je Woche (Kennung).
 *
 * **Abgelesen, nicht nachgerechnet.** Welche Zusage verfällt, entscheidet der
 * Reducer (`dropConfirmations`, `ohneVerwaisteTreffpunktZusagen`); hier gilt,
 * was im Zustand fehlt. Bis zum 25. September 2026 rechneten vier Zweige die
 * Zusammenkunfts-Schlüssel ein zweites Mal nach (`changedSlotKeys` bei
 * assign, autoAssign und clearAssignments, `dienstZusagenKeys` bei
 * removeService), nur `lacRemove` las ab. Eine künftige Ausnahme im Reducer
 * kommt so von selbst in der Datenbank an.
 *
 * Die Zusammenkunfts-Schlüssel gehen sofort hinaus (Block unter dem Switch).
 * Die Treffpunkt-Schlüssel gehen **erst mit dem Schreiben ihrer Woche**
 * (`fsWocheSpeichern`, `fsWochePlanen`): Fehlt die Woche, behält die
 * Datenbank den alten Leiter, also gehört ihm auch weiter seine Zusage.
 *
 * Löschen dürfen Planer und Gruppenaufseher, die ihre Treffpunkte selbst
 * besetzen.
 */
function verfalleneZusagen(prev: AppState, next: AppState): { meeting: string[]; fs: Map<string, string[]> } {
  const meeting: string[] = []
  const fs = new Map<string, string[]>()
  if (prev.confirmations === next.confirmations) return { meeting, fs }
  for (const key of Object.keys(prev.confirmations)) {
    if (key in next.confirmations) continue
    const woche = fsTaskKeyWoche(key)
    if (woche === null) meeting.push(key)
    else fs.set(woche, [...(fs.get(woche) ?? []), key])
  }
  return { meeting, fs }
}

/**
 * Treffpunkt-Woche an `wi` speichern, falls es sie gibt — und mit ihr die
 * Zusagen löschen, die in dieser Woche verfallen sind (`verwaist`).
 *
 * Die Kennung steht bei der **Woche**, nicht bei den Treffpunkten — deshalb
 * liegen hier beide Listen. Fehlt die Woche, gibt es nichts zu bezeichnen, und
 * dann bleiben auch die Zusagen stehen: Die Datenbank behält den alten Leiter,
 * also gehört ihm auch weiter seine Zusage.
 */
function fsWocheSpeichern(
  congId: string,
  weeks: Week[],
  fsWeeks: FsInstance[][],
  wi: number,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  const week = weeks[wi]
  const fsWeek = fsWeeks[wi]
  if (!week || !fsWeek) return
  saveFsWeek(congId, week.start, fsWeek)
  const keys = verwaist.get(week.start)
  if (keys) deleteConfirmationRows(congId, keys)
}

/**
 * Wie `fsWocheSpeichern`, nur gebündelt — für Änderungen je Tastenanschlag.
 * Die verfallenen Zusagen warten mit der Woche (`ausstehendeFsLoeschungen`).
 */
function fsWochePlanen(
  congId: string,
  weeks: Week[],
  fsWeeks: FsInstance[][],
  wi: number,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  const week = weeks[wi]
  const fsWeek = fsWeeks[wi]
  if (!week || !fsWeek) return
  const keys = verwaist.get(week.start)
  if (keys) {
    const warten = ausstehendeFsLoeschungen.get(week.start) ?? new Set<string>()
    for (const key of keys) warten.add(key)
    ausstehendeFsLoeschungen.set(week.start, warten)
  }
  fsWeekSaves.schedule(week.start, { congId, insts: fsWeek })
}

/**
 * Eine Person ist aus dem Zustand verschwunden (`ohnePerson` im Reducer) — die
 * Datenbank zieht nach (`removePerson`). Die Treffpunkte, aus denen ihre Id
 * genommen wurde, schreibt der Aufrufer.
 */
function personEntfernt(prev: AppState, next: AppState, id: string): void {
  // Kein ausstehender Save darf sie danach wiederbeleben.
  personSaves.cancel(id)
  // Die Verweise auf die Person räumt die Datenbank selbst
  // (`on delete set null`): Gruppen, Einladungen, das Versand-Tagebuch —
  // und seit T105 auch `members.person_id`. Genau die stand hier bis dahin
  // von Hand, weil sie als einzige ohne Fremdschlüssel auskommen musste;
  // wer eine Person per Skript löschte, hinterließ eine Mitgliedschaft,
  // deren `my_person_id()` ins Leere zeigt.
  deletePersonRow(id)
  // Ihre Abwesenheiten gehen mit. Auch dort nullt die Datenbank nur die
  // Person (`absences_person_fk`): Die Zeilen blieben liegen, gehörten
  // niemandem mehr und kamen bei jedem Laden wieder mit — der Zustand hielt
  // sie bis zum 25.9.2026 sogar mit toter `personId` (T118).
  for (const a of prev.absences) if (a.personId === id) deleteAbsenceRow(a.id)
  // War sie die Letzte ihres Haushalts, geht der mit: Die Datenbank nullt
  // zwar `persons.fam`, die leere Zeile bliebe aber stehen und käme beim
  // nächsten Neuaufbau wieder mit.
  const haus = prev.persons.find((p) => p.id === id)?.fam
  if (haus && !next.persons.some((p) => p.fam === haus)) deleteHouseholdRow(haus)
}

/**
 * Grundplan-Blob und die Treffpunkt-Wochen, die sich dadurch geändert haben.
 *
 * Beides gebündelt: Der Ort einer Regel ist ein Freitextfeld, und ohne
 * Bündelung ging je Tastenanschlag der Grundplan **und** jede Woche einzeln an
 * die Datenbank. Geschrieben wird nur, was sich wirklich geändert hat —
 * `regenFsWeeks` und `fsGruppeEntfernen` lassen Unberührtem seine Referenz.
 *
 * Auch das Löschen einer Gruppe geht hier durch, obwohl es kein Tastenanschlag
 * ist: Steht vom Tippen davor noch ein gebündelter Grundplan aus, schriebe ein
 * Schreiben am Bündel vorbei zuerst den neuen und 600 ms später den **alten**
 * Stand — samt der Regeln der gerade gelöschten Gruppe. Über denselben Writer
 * ersetzt der neue Stand den ausstehenden.
 */
function treffpunkteSpeichern(
  congId: string,
  prev: AppState,
  next: AppState,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  // Was dieser Planer geändert oder entfernt hat — nicht „alles, was ich kenne".
  zeilenPlanen(fsRuleSaves, congId, prev.fsRules, next.fsRules)
  for (let i = 0; i < next.fsWeeks.length; i++) {
    if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWochePlanen(congId, next.weeks, next.fsWeeks, i, verwaist)
  }
}

/**
 * Gruppenbesuche (T120) und die Treffpunkt-Wochen, in die sie eingetragen oder
 * aus denen sie ausgetragen wurden.
 *
 * Geschrieben wird je Besuch nur, was sich geändert hat (neue Referenz), und
 * gelöscht nur, was dieser Planer entfernt hat — wie beim Grundplan. Die Wochen
 * gehen einzeln und sofort hinaus, nicht gebündelt: Hier wird geklickt, nicht
 * getippt, und mit der Woche gehen die Zusagen, die dabei verfallen.
 */
function besucheSpeichern(
  congId: string,
  prev: AppState,
  next: AppState,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  if (next.gruppenbesuche !== prev.gruppenbesuche) {
    const { geaendert, entfernt } = zeilenAenderung(prev.gruppenbesuche, next.gruppenbesuche)
    if (geaendert.length || entfernt.length) saveGruppenbesuche(congId, geaendert, entfernt)
  }
  for (let i = 0; i < next.fsWeeks.length; i++) {
    if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWocheSpeichern(congId, next.weeks, next.fsWeeks, i, verwaist)
  }
}

/**
 * Vorgemerkte Vorträge (T122) — wie die Gruppenbesuche: je Zeile nur, was sich
 * geändert hat, gelöscht nur, was hier entfiel. Die Wochen, in die der
 * Vortragsplan schrieb, gehen über den allgemeinen Block unter dem Switch
 * hinaus, mit dem Entzug für einen eigenen Redner, der seinen Vortrag verliert.
 */
function vortraegeSpeichern(congId: string, prev: AppState, next: AppState): void {
  if (next.vortraege === prev.vortraege) return
  const { geaendert, entfernt } = zeilenAenderung(prev.vortraege, next.vortraege)
  if (geaendert.length || entfernt.length) saveVortraege(congId, geaendert, entfernt)
}

/**
 * Weitere Pläne (T120, Phase 5): Pläne gebündelt, Einträge sofort — und vor
 * einem Eintrag immer erst der Plan, auf den er zeigt (die Schreibschicht hält
 * die Reihenfolge in `planNacheinander`).
 *
 * Geschrieben wird je Eintrag nur, was neu oder geändert ist (neue Referenz),
 * gelöscht nur, was hier entfernt wurde.
 */
function plaeneSpeichern(congId: string, prev: AppState, next: AppState): void {
  zeilenPlanen(planSaves, congId, prev.plaene, next.plaene)
  if (next.planEintraege === prev.planEintraege) return
  const { geaendert, entfernt } = zeilenAenderung(prev.planEintraege, next.planEintraege)
  if (!geaendert.length && !entfernt.length) return
  planSaves.flush()
  savePlanEintraege(congId, geaendert, entfernt)
}

export function persist(prev: AppState, next: AppState, action: AppAction): void {
  const congId = next.congregationId
  const userId = next.userId
  if (!supabase || !congId || !userId) return
  // Offline-Momentaufnahme: nichts schreiben. Der Provider weist Schreib-
  // Aktionen bereits ab (readonly.ts) — hier als zweite Absicherung, damit ein
  // übersehener Pfad nicht in einen Schreibversuch auf veraltetem Stand läuft.
  if (next.staleAt) return

  // Welche Zusagen mit dieser Aktion verfallen. Die der Treffpunkte werden
  // erst mit dem Schreiben ihrer Woche gelöscht (`fsWocheSpeichern`,
  // `fsWochePlanen`), die der Zusammenkünfte unter dem Switch.
  const verfallen = verfalleneZusagen(prev, next)
  const fsVerwaist = verfallen.fs

  switch (action.type) {
    case 'assign': {
      // Treffpunkt-Leiter (fs): eigene Wochen-Tabelle. Die Zusammenkunfts-Woche
      // und ihre verfallenen Zusagen schreibt der Block unter dem Switch.
      const sel = prev.slotSel
      if (sel && sel.kind === 'fs') fsWocheSpeichern(congId, next.weeks, next.fsWeeks, sel.wi, fsVerwaist)
      break
    }
    case 'fsInstUpdate':
    case 'fsInstRemove':
      // Ein gestrichener Grundplan-Treffpunkt ist in seiner Regel vermerkt
      // (`FsRule.aus`) — ohne sie käme er beim nächsten Laden wieder.
      zeilenPlanen(fsRuleSaves, congId, prev.fsRules, next.fsRules)
      fsWocheSpeichern(congId, next.weeks, next.fsWeeks, action.wi, fsVerwaist)
      break
    case 'fsInstAdd':
    case 'fsAutoAssign':
    case 'fsClear':
      fsWocheSpeichern(congId, next.weeks, next.fsWeeks, prev.week, fsVerwaist)
      break
    case 'addImportedWeek':
      // Die neue Woche bringt ihre Treffpunkte aus dem Grundplan mit; die Woche
      // selbst schreibt der Block unter dem Switch.
      if (next.fsWeeks !== prev.fsWeeks) {
        fsWocheSpeichern(congId, next.weeks, next.fsWeeks, next.weeks.length - 1, fsVerwaist)
      }
      break
    case 'fsRuleAdd':
    case 'fsRuleUpdate':
    case 'fsRuleRemove':
      // Grundplan-Blob + die neu materialisierten Wochen (gebündelt).
      treffpunkteSpeichern(congId, prev, next, fsVerwaist)
      break
    case 'besuchHinzufuegen':
    case 'besuchEntfernen':
    case 'besuchAendern':
    case 'besuchBesucher':
    case 'besuchUebernehmen':
      // Die Besuche und die Treffpunkte, in die sie eingetragen wurden.
      besucheSpeichern(congId, prev, next, fsVerwaist)
      break
    case 'vortragsplanUebernehmen':
      vortraegeSpeichern(congId, prev, next)
      break
    case 'trolleyAnlegen':
    case 'trolleyAendern':
      // Wie der Grundplan: Was sich geändert hat, geht gebündelt als Upsert hinaus.
      zeilenPlanen(trolleySaves, congId, prev.trolleys, next.trolleys)
      break
    case 'wpPlanAnlegen':
    case 'wpPlanAendern':
    case 'wpPlanLoeschen':
    case 'wpGruppenVerteilen':
    case 'wpEintragSetzen':
      plaeneSpeichern(congId, prev, next)
      break
    case 'persoenlichBescheid':
      // Nur, wenn der Reducer die Zeile kannte — sonst gäbe es nichts abzuhaken.
      if (next.persoenlich !== prev.persoenlich) persoenlichBescheid(action.key, action.name, action.ja)
      break
    case 'addPerson':
      savePerson(congId, action.person)
      break
    case 'updatePerson': {
      // Auto-Speichern mit Debounce: Tipp-Änderungen werden gebündelt
      const p = next.persons.find((x) => x.id === action.id)
      // Einen doppelten oder leeren Namen nimmt „Person bearbeiten" gar nicht
      // erst an (T110, seit T121 Phase 6b) — was hier ankommt, darf hinaus.
      if (p) personSaves.schedule(p.id, { congId, person: p })
      // Ein Gruppenwechsel beendet das Amt in der alten Gruppe (`aemterBeenden`)
      // — die Gruppe ist eine eigene Zeile. Ohne sie stünde er nach dem
      // nächsten Laden wieder als ihr Aufseher da und plante sie weiter.
      geaenderteSchreiben(prev.groups, next.groups, (grp, pos) => saveGroupRow(congId, grp, pos))
      // Die Namensänderung in den Wochen (renameInWeeks) schreibt der Block
      // unter dem Switch — hier bleiben die Treffpunkte (fsRenameLeader):
      // eigene Tabelle, eigener Schreibweg. Ohne dies hielte der neue Name nur
      // bis zum nächsten Laden.
      //
      // **Gebündelt wie die Wochen daneben.** Ein Nachname mit zwölf Buchstaben
      // schrieb sonst zwölfmal jede Woche, in der die Person einen Treffpunkt
      // leitet — bei zwanzig geleiteten Wochen 240 Anfragen für eine
      // berichtigte Schreibweise. `flush()` beim Verlassen der Ansicht holt sie
      // ein (`selectPerson`/`navigate`/`logout`).
      for (let i = 0; i < next.fsWeeks.length; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWochePlanen(congId, next.weeks, next.fsWeeks, i, fsVerwaist)
      }
      // Admin- und Planer-Recht sofort in gespiegelte Konten und offene Codes
      // schreiben — beide Rechte stehen in derselben Zeile.
      if ('plannerVorgemerkt' in action.patch || 'zuteilerVorgemerkt' in action.patch) {
        for (const m of next.members) {
          if (m.personId === action.id && m.userId !== next.userId) saveMemberRow(m)
        }
        for (const i of next.invites) {
          if (i.personId === action.id) saveInviteRechte(i)
        }
      }
      break
    }
    case 'selectPerson':
    case 'navigate':
    case 'logout': {
      // Ansicht verlassen → alle ausstehenden Debounce-Saves sofort schreiben
      for (const flush of ALLE_FLUSHES) flush()
      break
    }
    case 'removePerson': {
      personEntfernt(prev, next, action.id)
      // Die gelösten Verweise (T38) müssen auch in der Datenbank landen —
      // sonst zeigt der Fremdschlüssel dort weiter ins Leere. Die
      // Zusammenkunfts-Wochen übernimmt der Block unter dem Switch.
      for (let i = 0; i < next.fsWeeks.length; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWocheSpeichern(congId, next.weeks, next.fsWeeks, i, fsVerwaist)
      }
      break
    }
    case 'setFamily': {
      // Die Haushalts-Id wurde bei beiden (bzw. mehreren) Beteiligten geändert.
      const geaendert = next.persons.filter(
        (p) => prev.persons.find((q) => q.id === p.id)?.fam !== p.fam,
      )
      if (geaendert.length === 0) break
      // Der Haushalt ist eine eigene Zeile, auf die `persons.fam` zeigt — er
      // muss also **vor** den Personen dastehen. `saveFamily` hält diese
      // Reihenfolge ein; sie ist der einzige Grund, warum es die Funktion gibt.
      const haushalt = geaendert.find((p) => p.fam)?.fam
      if (haushalt) saveFamily(congId, haushalt, geaendert)
      else for (const p of geaendert) savePerson(congId, p)
      // Der letzte Haushalt, den niemand mehr trägt, verschwindet. Ohne das
      // bliebe eine leere Zeile stehen, an der nie wieder jemand hängt.
      const verwaist = new Set(
        geaendert
          .map((p) => prev.persons.find((q) => q.id === p.id)?.fam)
          .filter((f): f is string => Boolean(f)),
      )
      for (const alt of verwaist) {
        if (!next.persons.some((p) => p.fam === alt)) deleteHouseholdRow(alt)
      }
      break
    }
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
    case 'moveService':
      // Zwei Dienste tauschen die Plätze — beide bekommen ihre neue Position.
      geaenderteSchreiben(prev.services, next.services, (svc, pos) => saveService(congId, svc, pos))
      break
    case 'removeService': {
      deleteServiceRow(congId, action.key)
      geaenderteSchreiben(prev.services, next.services, (svc, pos) => saveService(congId, svc, pos))
      // Die drei Spuren des Dienstes (data/dienste.ts) hat der Reducer aus dem
      // Zustand genommen — die Bereiche gehen hier an die Datenbank, die
      // Platzreihen und Zusagen im Block unter dem Switch. Nur die wirklich
      // geänderten Personen: unveränderte behalten ihre Referenz, und die
      // Listen sind indexgleich (`dienstBereichEntfernen` bildet der Reihe
      // nach ab).
      geaenderteSchreiben(prev.persons, next.persons, (p) => savePerson(congId, p))
      break
    }
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
      geaenderteSchreiben(prev.groups, next.groups, (grp, pos) => saveGroupRow(congId, grp, pos))
      // Mitglieder der Gruppe haben grp=null bekommen → mitschreiben
      for (const p of next.persons) {
        if (prev.persons.find((q) => q.id === p.id)?.grp === action.id) savePersonGroup(p)
      }
      // Ihre Treffpunkte sind mit ihr gegangen. Die Datenbank räumt das seit
      // T105 selbst — `fs_rules.grp` zeigt per Fremdschlüssel auf `groups` und
      // ist `on delete cascade`. Geschrieben wird trotzdem: Die Regeln stehen
      // auch im Zustand, die daraus erzeugten Wochen (`fs_weeks`) hängen an
      // keinem Fremdschlüssel, und der Löschauftrag über die Kennung ist
      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.
      treffpunkteSpeichern(congId, prev, next, fsVerwaist)
      break
    case 'markAllRead':
      markNotificationsRead(congId, userId)
      break
    case 'mitteilungGelesen': {
      // Nur, was der Reducer wirklich umgestellt hat. Eine hier entstandene
      // Zeile (`local`) steht unter ihrer Kennung gar nicht in der Datenbank —
      // die Planer haben dort je eine eigene Abschrift (`notify_planners`).
      const vorher = prev.notifs.find((n) => n.id === action.id)
      if (vorher && !vorher.read && !vorher.local) markNotificationRead(congId, userId, action.id)
      break
    }
    case 'confirmTask':
      saveConfirmation(congId, userId, action.id, 'bestätigt')
      // „Doch bestätigen" nach der Absage eines Hilfsdienstes: Das Gesuch ist
      // erledigt, die Zeilen „Ersatz gesucht" bei den Angepingten müssen weg —
      // fremde Glocken, das kann nur der Server. Bis zum 25.9.2026 räumte sie
      // allein das Einspringen (T86); der Absagende ließ sie stehen (T118).
      if (helperKeyParts(action.id) && prev.confirmations[action.id] === 'verhindert') {
        substituteWithdraw(action.id)
      }
      break
    case 'confirmAll':
      // Dieselbe Zusage wie einzeln, für jede Aufgabe, die gerade offen stand.
      for (const task of prev.myTasks) {
        if (task.status === 'offen') saveConfirmation(congId, userId, task.id, 'bestätigt')
      }
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
    case 'platzUebernehmen':
      // Ebenso: Den offenen Platz trägt die Edge Function ein, samt Zusage.
      platzFuellen(action.key)
      break
    case 'changeReminder':
    case 'setReminder':
    case 'toggleReminderRepeat':
    case 'setAuxClass':
    case 'setCongLang':
    case 'addProgLang':
    case 'removeProgLang':
      einstellungenSpeichern(congId, prev, next)
      break
    case 'updateCongregation': {
      const info = geaenderteFelder(prev.congregation, next.congregation)
      if (Object.keys(info).length > 0) congSaves.schedule('info', { congId, info })
      break
    }
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

  // Jede Woche, die sich geändert hat — siehe `geaenderteWochenSpeichern`.
  if (!OHNE_WOCHENSCHREIBEN.includes(action.type)) {
    geaenderteWochenSpeichern(congId, prev.weeks, next.weeks, GEBUENDELT.includes(action.type), !next.planner)
  }
  // Jede Zusammenkunfts-Zusage, die verfallen ist — siehe `verfalleneZusagen`.
  if (!OHNE_WOCHENSCHREIBEN.includes(action.type) && verfallen.meeting.length > 0) {
    deleteConfirmationRows(congId, verfallen.meeting)
  }

  /*
   * Eine hier entstandene Mitteilung (Import, „Plan gesendet", Verhinderung)
   * an die Planer der Versammlung schicken — je Empfänger eine eigene Zeile mit
   * eigenem Gelesen-/Lösch-Status. Erinnerungen erzeugt die Edge Function
   * selbst (adressiert an die betroffene Person).
   *
   * Erkannt am `local`-Kennzeichen, das der Reducer beim Erzeugen setzt — nicht
   * daran, dass die Liste länger geworden ist. Auf `hydrate` träfe das nämlich
   * ebenfalls zu: es lädt die gespeicherten Mitteilungen, und aus jedem Laden
   * wurde so eine neue, die beim nächsten Laden wieder mitkam. Eine Aufzählung
   * der auslösenden Aktionen wäre die zweite Buchführung gewesen — wer eine
   * vergisst, merkt es nie, weil nichts fehlschlägt.
   *
   * **Die Empfänger sucht die Datenbank** (`notify_planners`), nicht der
   * Client. Ein Verkündiger sieht in `members` nur die eigene Zeile (RLS);
   * `next.members` enthält für ihn keinen einzigen Planer. Bis zum 24.9.2026
   * stand hier `members.filter((m) => m.planner)` — für jede Verhinderung eine
   * leere Empfängerliste, und der Schreiber brach über ihr still ab. Kein
   * Planer hat je eine Verhinderung erhalten; dem Test-Fixture lag ein Planer
   * bei, deshalb blieb es grün.
   *
   * Der Aufgaben-Schlüssel geht seit dem 4.10.2026 mit: Ein Tipp auf die
   * Absage führt den Planer in ihre Woche (`mitteilungsZiel`).
   */
  const neu = next.notifs[0]
  if (neu?.local && neu !== prev.notifs[0]) notifyPlanners(neu.type, neu.title, neu.text, neu.taskId)

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
  if (action.type !== 'hydrate') {
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
    if (prev.weeks !== next.weeks || prev.fsWeeks !== next.fsWeeks) {
      for (let wi = 0; wi < prev.weeks.length; wi++) {
        // Unberührte Wochen behalten ihre Referenz — der Vergleich kostet nichts.
        if (prev.weeks[wi] === next.weeks[wi] && prev.fsWeeks[wi] === next.fsWeeks[wi]) continue
        entzogen.push(
          ...entzogeneZusagen(
            prev.weeks[wi],
            next.weeks[wi],
            prev.fsWeeks[wi],
            next.fsWeeks[wi],
            prev.services,
            prev.congregation.times,
            prev.confirmations,
          ),
        )
      }
    }
    // Der Regelfall: nichts verloren, nichts zu schicken.
    if (entzogen.length > 0) sendPlanEntzug(entzogen)
  }
}
