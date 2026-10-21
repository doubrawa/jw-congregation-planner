/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase (Fire-and-forget über lib/data). Läuft nur im konfigurierten,
 * hydrierten Zustand. Der Reducer bleibt rein; hier werden `prev`/`next`
 * (Zustand vor/nach der Aktion) ausgewertet.
 */

import { fsTaskKeyWoche } from '../data/fs'
import { entzogeneAller, type EntzogeneZuteilung } from '../data/plan-versand'
import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  deleteGroupRow,
  deleteHouseholdRow,
  deletePersonRow,
  deleteAnmeldeLink,
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
import { kontoGehtMit } from './eigene-person'

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
  /**
   * Jetzt schreiben, nicht erst nach der Ruhe. Wartet derselbe Schlüssel noch,
   * geht er in diesem Schreiben auf: Sonst ginge die ältere Fassung 600 ms
   * später hinterher und schriebe zurück, was eben gespeichert wurde.
   */
  sofort: (key: K, value: V) => void
  cancel: (key: K) => void
  flush: () => void
  /** Alles Wartende fallen lassen, ohne zu schreiben (`hydrate`). */
  verwerfen: () => void
  /** Wartet für diesen Schlüssel eine Fassung auf das gebündelte Schreiben? */
  wartet: (key: K) => boolean
}

/**
 * Alle gebündelten Schreiber — jeder trägt sich bei seiner Erzeugung selbst
 * ein. Beim Verlassen der Ansicht und beim Abmelden gehen sie gemeinsam
 * hinaus, beim Neuladen werden sie gemeinsam verworfen.
 *
 * Bis zum 3.10.2026 stand dort eine Liste von Hand, und ihr fehlten die beiden
 * Schreiber aus T120 (Zeugnis-Termine, Weitere Pläne): Wer binnen 600 ms nach
 * dem Tippen eines Orts oder Plannamens abmeldete, dessen Änderung ging erst
 * nach dem Abmelden hinaus — und scheiterte an der Anmeldung.
 */
const ALLE_SCHREIBER: Array<Pick<DebouncedWriter<unknown, unknown>, 'flush' | 'verwerfen'>> = []

/**
 * **Was gebündelt wartet, jetzt hinaus** — beim Verlassen der Ansicht, beim
 * Abmelden und wenn die App in den Hintergrund geht (`store.tsx`). Wer am
 * Handy einen Namen tippt und gleich in eine andere App wechselt, dessen
 * Änderung wartete sonst auf einen Zeitgeber, den das System im Hintergrund
 * anhält — und mit der App beendet.
 */
export function ausstehendesSchreiben(): void {
  for (const schreiber of ALLE_SCHREIBER) schreiber.flush()
}

/**
 * **Neu geladen: Was gebündelt wartete, fällt weg.** Es beruht auf dem
 * ersetzten Stand. Ginge es danach hinaus, nähme es den frisch geladenen Stand
 * mit (`ladung` in lib/data.ts) und schriebe still zurück, was das Laden eben
 * gebracht hat — eine Woche, die ein anderer Planer inzwischen geändert hat —,
 * oder etwas, das der Bildschirm nicht mehr zeigt. So steht da, was
 * gespeichert ist; was dabei verloren geht, sieht man.
 *
 * Wartendes gibt es dabei nur, wenn während des Ladens getippt wurde — was
 * vorher wartete, schickt `loadAndHydrate` vorab hinaus.
 */
function wartendesVerwerfen(): void {
  for (const schreiber of ALLE_SCHREIBER) schreiber.verwerfen()
  vorgemerktesVerwerfen()
}

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
  const anhalten = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  /** Die neue Fassung mit der wartenden desselben Schlüssels zusammenführen. */
  const mitWartendem = (key: K, value: V): V => {
    const alt = pending.get(key)
    return alt !== undefined && merge ? merge(alt, value) : value
  }
  const schreiber: DebouncedWriter<K, V> = {
    schedule(key, value) {
      pending.set(key, mitWartendem(key, value))
      anhalten()
      timer = setTimeout(schreiber.flush, delayMs)
    },
    sofort(key, value) {
      const fassung = mitWartendem(key, value)
      pending.delete(key)
      write(key, fassung)
    },
    cancel(key) {
      pending.delete(key)
    },
    flush() {
      anhalten()
      for (const [key, value] of pending) write(key, value)
      pending.clear()
    },
    verwerfen() {
      anhalten()
      pending.clear()
    },
    wartet(key) {
      return pending.has(key)
    },
  }
  ALLE_SCHREIBER.push(schreiber)
  return schreiber
}

/*
 * **Was an einer Woche hängt, geschieht erst, wenn sie geschrieben ist**
 * (16.10.2026).
 *
 * Mit einer geänderten Woche gehen zwei Dinge einher: Verfallene Zusagen
 * werden gelöscht, und wer einen Platz verlor, von dem er wusste, erfährt es
 * (`sendPlanEntzug` — die Function löscht dabei auch seinen Tagebuch-Eintrag).
 * Bis dahin gingen beide im selben Augenblick hinaus wie das Schreiben, gleich,
 * ob es gelang. Traf es einen Konflikt — ein anderer Planer, ein eben
 * übernommener freier Platz —, lud die App nach, und der Platz gehörte wieder
 * dem Alten. Nur war seine Zusage gelöscht, und er hatte „Zuteilung
 * zurückgezogen" bekommen.
 *
 * Deshalb wird es je Woche vorgemerkt (`nachDemSchreiben`), bevor sie
 * geschrieben wird; der Bündler gibt es ihrem Schreiben mit
 * (`mitVorgemerktem`). Gelungen: ausführen. Sonst fällt es weg — das
 * Nachladen nach dem Konflikt bringt den Stand, zu dem das passt.
 */
type Danach = (geschrieben: boolean) => void
type WochenTabelle = 'woche' | 'treffpunkte'

const vorgemerkt: Record<WochenTabelle, Map<string, Danach[]>> = { woche: new Map(), treffpunkte: new Map() }
/** Was in diesem `persist`-Aufruf vorgemerkt wurde (`liegenGebliebenesAusfuehren`). */
const dieserAufruf: Array<[WochenTabelle, string]> = []

function nachDemSchreiben(tabelle: WochenTabelle, woche: string, danach: Danach): void {
  const liste = vorgemerkt[tabelle].get(woche) ?? []
  liste.push(danach)
  vorgemerkt[tabelle].set(woche, liste)
  dieserAufruf.push([tabelle, woche])
}

/** Das Vorgemerkte einer Woche nehmen. */
function vorgemerktes(tabelle: WochenTabelle, woche: string): Danach[] {
  const liste = vorgemerkt[tabelle].get(woche) ?? []
  vorgemerkt[tabelle].delete(woche)
  return liste
}

/** Was vorgemerkt war, an dieses Schreiben hängen. */
function mitVorgemerktem(tabelle: WochenTabelle, woche: string, schreiben: Promise<boolean>): void {
  const danach = vorgemerktes(tabelle, woche)
  if (danach.length === 0) return
  void Promise.resolve(schreiben).then((geschrieben) => {
    for (const f of danach) f(geschrieben === true)
  })
}

/** In welcher Woche welcher Tabelle ein Platz liegt — `null`, wo der Schlüssel keine nennt. */
function wocheDesPlatzes(key: string): { tabelle: WochenTabelle; woche: string } | null {
  const teile = schluesselTeile(key)
  if (!teile) return null
  return { tabelle: 'tab' in teile ? 'woche' : 'treffpunkte', woche: teile.woche }
}

/** Verfallene Zusagen der Zusammenkünfte: je Woche gelöscht, sobald sie geschrieben ist. */
function zusagenNachDemSchreiben(congId: string, keys: readonly string[]): void {
  const jeWoche = new Map<string, string[]>()
  for (const key of keys) {
    const woche = wocheDesPlatzes(key)?.woche ?? ''
    jeWoche.set(woche, [...(jeWoche.get(woche) ?? []), key])
  }
  for (const [woche, liste] of jeWoche) {
    // Ohne Woche im Schlüssel gibt es kein Schreiben, auf das zu warten wäre.
    if (!woche) deleteConfirmationRows(congId, liste)
    else nachDemSchreiben('woche', woche, (geschrieben) => geschrieben && deleteConfirmationRows(congId, liste))
  }
}

/**
 * **„Zurückgezogen" nach dem Schreiben — und weiter in einem Aufruf.** Je Woche
 * vorgemerkt, gesammelt, und hinaus geht, was zu geschriebenen Wochen gehört,
 * sobald jede Woche Bescheid gegeben hat. Warum einer und nicht einer je
 * Woche, steht unten in `persist` („Erst sammeln, dann einmal schicken").
 */
function entzugNachDemSchreiben(entzogen: readonly EntzogeneZuteilung[]): void {
  if (entzogen.length === 0) return
  const jeWoche = new Map<string, { tabelle: WochenTabelle; woche: string; liste: EntzogeneZuteilung[] }>()
  const gelungen: EntzogeneZuteilung[] = []
  for (const z of entzogen) {
    const ort = wocheDesPlatzes(z.key)
    if (!ort) {
      gelungen.push(z)
      continue
    }
    const k = `${ort.tabelle}|${ort.woche}`
    const gruppe = jeWoche.get(k) ?? { ...ort, liste: [] }
    gruppe.liste.push(z)
    jeWoche.set(k, gruppe)
  }
  let offen = jeWoche.size
  const fertig = (): void => {
    if (offen === 0 && gelungen.length > 0) sendPlanEntzug(gelungen)
  }
  for (const { tabelle, woche, liste } of jeWoche.values()) {
    nachDemSchreiben(tabelle, woche, (geschrieben) => {
      if (geschrieben) gelungen.push(...liste)
      offen--
      fertig()
    })
  }
  fertig()
}

/** Verworfen (`hydrate`): Was vorgemerkt war, geschieht nicht — die Sammler erfahren es. */
function vorgemerktesVerwerfen(): void {
  for (const tabelle of ['woche', 'treffpunkte'] as const) {
    for (const liste of vorgemerkt[tabelle].values()) for (const f of liste) f(false)
    vorgemerkt[tabelle].clear()
  }
}

// congId ist über die Sitzung stabil, wird aber je Save mitgeführt, damit der
// Writer keine implizite Abhängigkeit auf App-State hat.
const personSaves = createDebouncedWriter<string, { congId: string; person: Person }>(
  SAVE_DELAY,
  (_id, { congId, person }) => savePerson(congId, person),
)

/**
 * Eine Person **sofort** schreiben — über den Bündler, wie die Wochen
 * (`sofort`): Wartete von ihr noch eine ältere Fassung (die Telefonnummer, eben
 * getippt), ginge sie sonst hinterher und nähme zurück, was jetzt dazukam (den
 * Haushalt, gleich danach gewählt).
 */
function personSofort(congId: string, person: Person): void {
  personSaves.sofort(person.id, { congId, person })
}
// Gebündelt wird je **Woche**, nicht je Index (T66): der Schlüssel ist ihre
// Kennung, und der schiebt sich nicht, wenn sich die geladene Menge ändert.
const weekSaves = createDebouncedWriter<string, { congId: string; week: Week }>(SAVE_DELAY, (woche, { congId, week }) =>
  mitVorgemerktem('woche', woche, saveWeek(congId, week)),
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
 * Treffpunkte: derselbe Weg wie bei den Wochen — gebündelt je Kennung, und was
 * an der Woche hängt, geschieht erst mit ihrem gelungenen Schreiben
 * (`nachDemSchreiben`).
 *
 * **Nie vor der Woche.** Eine Grundplan-Änderung entfernt oder besetzt
 * Treffpunkte in vielen Wochen, geschrieben werden die Wochen aber erst nach
 * kurzer Ruhe. Bis zum 15. September 2026 ging das Löschen der alten Zusagen
 * sofort hinaus. Wurde die App in diesen 600 ms geschlossen, stand in der
 * Datenbank der alte Leiter — ohne seine Zusage: Er galt als unbestätigt und
 * bekam erneut Erinnerungen. Bis zum 16.10.2026 ging das Löschen dann mit dem
 * Schreiben hinaus, aber auch, wenn es scheiterte.
 */
const fsWeekSaves = createDebouncedWriter<string, { congId: string; insts: FsInstance[] }>(
  SAVE_DELAY,
  (woche, { congId, insts }) => mitVorgemerktem('treffpunkte', woche, saveFsWeek(congId, woche, insts)),
)

/** Welcher Bündler eine Woche dieser Tabelle schreibt. */
const WOCHEN_SCHREIBER: Record<WochenTabelle, Pick<DebouncedWriter<string, unknown>, 'wartet'>> = {
  woche: weekSaves,
  treffpunkte: fsWeekSaves,
}

/**
 * Vorgemerktes, das kein Schreiben in diesem Aufruf aufgenommen hat und auch
 * auf keines wartet: Die Woche hat sich nicht geändert. Dann geschieht es
 * gleich, wie vor dem 16.10.2026 — verloren gehen soll es nicht.
 */
function liegenGebliebenesAusfuehren(): void {
  for (const [tabelle, woche] of dieserAufruf.splice(0)) {
    if (!vorgemerkt[tabelle].has(woche) || WOCHEN_SCHREIBER[tabelle].wartet(woche)) continue
    for (const f of vorgemerktes(tabelle, woche)) f(true)
  }
}
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
// `trolley`, die den Eingetragenen Bescheid sagt (`saveTrolleys`). Bleibt nach
// einem Entfernen nichts zu schreiben, geht nichts hinaus.
const trolleySaves = zeilenSchreiber<Trolley>((congId, zeilen) => {
  if (zeilen.length > 0) saveTrolleys(congId, zeilen)
})
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
function wocheSpeichern(congId: string, vorher: Week[], weeks: Week[], wi: number): void {
  const week = weeks[wi]
  if (!week || vorher[wi] === week) return
  // Über den Bündler, nicht an ihm vorbei: Wartet dort eine ältere Fassung
  // derselben Woche (eine Umbenennung, eine neue Zusammenkunftszeit), ginge
  // sie sonst hinter dieser hinaus und nähme sie zurück.
  weekSaves.sofort(week.start, { congId, week })
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
 */
function geaenderteWochenSpeichern(
  congId: string,
  vorher: Week[],
  nachher: Week[],
  gebuendelt: boolean,
): void {
  if (vorher === nachher) return
  for (let wi = 0; wi < nachher.length; wi++) {
    if (nachher[wi] === vorher[wi]) continue
    if (gebuendelt) wochePlanen(congId, nachher, wi)
    else wocheSpeichern(congId, vorher, nachher, wi)
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
 *
 * `setAbweichung` und `terminUpdate` seit dem 15.10.2026: Der Grund einer
 * Sonderwoche, Titel und Ort eines weiteren Termins kommen je Tastenanschlag —
 * bis dahin ging dafür jedes Mal die ganze Woche hinaus, eine nach der anderen.
 */
const GEBUENDELT: readonly AppAction['type'][] = [
  'updatePerson',
  'removePerson',
  'removeService',
  'updateCongregation',
  'setAbweichung',
  'terminUpdate',
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
function wochePlanen(congId: string, weeks: Week[], wi: number): void {
  const week = weeks[wi]
  if (week) weekSaves.schedule(week.start, { congId, week })
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
 * (`geaenderteTreffpunktWochenSpeichern`): Fehlt die Woche, behält die
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
 * **Jede geänderte Treffpunkt-Woche wird geschrieben — abgelesen, nicht
 * aufgezählt** (16.10.2026), nach demselben Grundsatz wie die Wochen der
 * Zusammenkünfte (`geaenderteWochenSpeichern`).
 *
 * Bis dahin schrieb jede Aktion ihre Treffpunkt-Woche selbst: 18 Aktionen an
 * zehn Stellen, teils über einen festen Index (`sel.wi`, `prev.week`,
 * `weeks.length - 1`). Eine neue Aktion, die Treffpunkte ändert und dort
 * fehlte, verlor ihre Änderung beim nächsten Laden — und nichts schlug fehl.
 *
 * **Nur, was sich geändert hat.** Der Reducer gibt Unberührtem seine Referenz
 * zurück, und eine neue Woche hängt er hinten an (`addImportedWeek`), wie bei
 * den Wochen der Zusammenkünfte. Jedes Schreiben hebt den Stand
 * (`updated_at`), und die nächste Änderung eines anderen Planers an dieser
 * Woche gälte sonst als Konflikt.
 *
 * Die Kennung steht bei der Woche der Zusammenkünfte an derselben Stelle.
 * Fehlt sie, gibt es nichts zu bezeichnen, und dann bleiben auch die Zusagen
 * stehen: Die Datenbank behält den alten Leiter, also gehört ihm auch weiter
 * seine Zusage. Sonst gehen die in der Woche verfallenen Zusagen (`verwaist`)
 * mit ihr — gelöscht, wenn sie geschrieben ist.
 *
 * Geschrieben wird immer über den Bündler. `gebuendelt` wartet ab (Ort,
 * Grundplan, Umbenennen kommen je Tastenanschlag), sonst geht es `sofort`. Auch
 * dann über den Bündler: Wartet dort eine ältere Fassung derselben Woche — ein
 * eben getippter Ort, noch ohne den Leiter, der jetzt zugeteilt wurde —, ginge
 * sie sonst hinter dieser hinaus und nähme den Leiter zurück.
 */
function geaenderteTreffpunktWochenSpeichern(
  congId: string,
  prev: AppState,
  next: AppState,
  gebuendelt: boolean,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  if (next.fsWeeks === prev.fsWeeks) return
  for (let wi = 0; wi < next.fsWeeks.length; wi++) {
    const week = next.weeks[wi]
    const fsWeek = next.fsWeeks[wi]
    if (!week || !fsWeek || prev.fsWeeks[wi] === fsWeek) continue
    fsZusagenVormerken(congId, week.start, verwaist)
    if (gebuendelt) fsWeekSaves.schedule(week.start, { congId, insts: fsWeek })
    else fsWeekSaves.sofort(week.start, { congId, insts: fsWeek })
  }
}

/**
 * Aktionen, deren Treffpunkt-Wochen **gebündelt** hinausgehen — wie
 * `GEBUENDELT` bei den Wochen. Der Ort eines Treffpunkts oder einer Regel kommt
 * je Tastenanschlag, eine Umbenennung zieht durch jede geleitete Woche. Das
 * Löschen einer Gruppe geht mit, obwohl es kein Tastenanschlag ist: Ihre
 * Regeln laufen über denselben gebündelten Weg (`grundplanSpeichern`).
 *
 * Wer hier fehlt, wird sofort geschrieben — mehr Anfragen, aber nichts geht
 * verloren. **Ob** geschrieben wird, hängt an keiner Liste.
 */
const FS_GEBUENDELT: readonly AppAction['type'][] = [
  'fsInstUpdate',
  'fsRuleAdd',
  'fsRuleUpdate',
  'fsRuleRemove',
  'removeGroup',
  'updatePerson',
]

/** Die in einer Woche verfallenen Zusagen vormerken — gelöscht wird erst, wenn die Woche geschrieben ist. */
function fsZusagenVormerken(congId: string, woche: string, verwaist: ReadonlyMap<string, string[]>): void {
  const keys = verwaist.get(woche)
  if (!keys?.length) return
  nachDemSchreiben('treffpunkte', woche, (geschrieben) => {
    if (geschrieben) deleteConfirmationRows(congId, keys)
  })
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
  // (`on delete set null`): Gruppen, das Versand-Tagebuch — und seit T105
  // auch `members.person_id`; ihren Anmelde-Link löscht sie mit
  // (`on delete cascade`). `members.person_id` stand hier bis dahin
  // von Hand, weil sie als einzige ohne Fremdschlüssel auskommen musste;
  // wer eine Person per Skript löschte, hinterließ eine Mitgliedschaft,
  // deren `my_person_id()` ins Leere zeigt.
  deletePersonRow(id)
  // Ihr Konto geht mit (21.10.2026, `kontoGehtMit`): die Mitgliedschaft hier,
  // das Konto löscht die Datenbank mit ihr (`members_konto_loeschen`).
  for (const m of prev.members) if (kontoGehtMit(m, id, prev.userId)) deleteMemberRow(m.userId)
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
 * Der Grundplan der Treffpunkte, eine Zeile je Regel — gebündelt: Der Ort einer
 * Regel ist ein Freitextfeld, und ohne Bündelung ging je Tastenanschlag der
 * Grundplan einzeln an die Datenbank. Die Wochen, die sich dadurch geändert
 * haben, schreibt der Block unter dem Switch (`FS_GEBUENDELT`); `regenFsWeeks`
 * und `fsGruppeEntfernen` lassen Unberührtem seine Referenz.
 *
 * Auch das Löschen einer Gruppe geht hier durch, obwohl es kein Tastenanschlag
 * ist: Steht vom Tippen davor noch ein gebündelter Grundplan aus, schriebe ein
 * Schreiben am Bündel vorbei zuerst den neuen und 600 ms später den **alten**
 * Stand — samt der Regeln der gerade gelöschten Gruppe. Über denselben Writer
 * ersetzt der neue Stand den ausstehenden.
 */
function grundplanSpeichern(congId: string, prev: AppState, next: AppState): void {
  // Was dieser Planer geändert oder entfernt hat — nicht „alles, was ich kenne".
  zeilenPlanen(fsRuleSaves, congId, prev.fsRules, next.fsRules)
}

/**
 * Gruppenbesuche (T120): je Besuch nur, was sich geändert hat (neue Referenz),
 * gelöscht nur, was dieser Planer entfernt hat — wie beim Grundplan. Die
 * Treffpunkt-Wochen, in die sie eingetragen oder aus denen sie ausgetragen
 * wurden, schreibt der Block unter dem Switch, sofort: Hier wird geklickt,
 * nicht getippt, und mit der Woche gehen die Zusagen, die dabei verfallen.
 */
function besucheSpeichern(congId: string, prev: AppState, next: AppState): void {
  if (next.gruppenbesuche === prev.gruppenbesuche) return
  const { geaendert, entfernt } = zeilenAenderung(prev.gruppenbesuche, next.gruppenbesuche)
  if (geaendert.length || entfernt.length) saveGruppenbesuche(congId, geaendert, entfernt)
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
  if (action.type === 'hydrate') wartendesVerwerfen()
  /*
   * **Abmelden: Was gebündelt wartet, geht noch hinaus** — vor der Frage nach
   * der Versammlung, denn `logout` hat den Bestand schon geleert (16.10.2026).
   * Die wartenden Fassungen tragen ihre Versammlung selbst; die Sitzung endet
   * erst danach (`lib/abmelden.ts`).
   */
  if (action.type === 'logout') {
    ausstehendesSchreiben()
    return
  }
  const congId = next.congregationId
  const userId = next.userId
  if (!supabase || !congId || !userId) return
  // Offline-Momentaufnahme: nichts schreiben. Der Provider weist Schreib-
  // Aktionen bereits ab (readonly.ts) — hier als zweite Absicherung, damit ein
  // übersehener Pfad nicht in einen Schreibversuch auf veraltetem Stand läuft.
  if (next.staleAt) return

  // Welche Zusagen mit dieser Aktion verfallen — gelöscht wird jede erst, wenn
  // ihre Woche geschrieben ist: die der Treffpunkte mit ihrer Woche
  // (`geaenderteTreffpunktWochenSpeichern`), die der Zusammenkünfte gleich hier
  // vorgemerkt.
  const verfallen = verfalleneZusagen(prev, next)
  const fsVerwaist = verfallen.fs
  const wochenSchreiben = !OHNE_WOCHENSCHREIBEN.includes(action.type)
  // Vor jedem Schreiben vormerken, was an den Wochen hängt (`nachDemSchreiben`)
  // — das Schreiben einer Woche nimmt mit, was bis dahin vorgemerkt ist.
  if (wochenSchreiben) zusagenNachDemSchreiben(congId, verfallen.meeting)
  // `hydrate` ersetzt den ganzen Bestand: Ein Neuladen nach einem Konflikt
  // brächte sonst Wochen voller vermeintlicher Entzüge hervor (siehe unten).
  if (action.type !== 'hydrate') entzugNachDemSchreiben(entzogeneAller(prev, next))

  // Die Treffpunkt-Wochen schreibt keiner dieser Fälle selbst — das tut der
  // Block unter dem Switch, für jede, die sich geändert hat.
  switch (action.type) {
    case 'fsInstRemove':
      // Ein gestrichener Grundplan-Treffpunkt ist in seiner Regel vermerkt
      // (`FsRule.aus`) — ohne sie käme er beim nächsten Laden wieder.
      zeilenPlanen(fsRuleSaves, congId, prev.fsRules, next.fsRules)
      break
    case 'fsRuleAdd':
    case 'fsRuleUpdate':
    case 'fsRuleRemove':
      grundplanSpeichern(congId, prev, next)
      break
    case 'besuchHinzufuegen':
    case 'besuchEntfernen':
    case 'besuchAendern':
    case 'besuchBesucher':
    case 'besuchUebernehmen':
      besucheSpeichern(congId, prev, next)
      break
    case 'vortragsplanUebernehmen':
      vortraegeSpeichern(congId, prev, next)
      break
    case 'trolleyAnlegen':
    case 'trolleyAendern':
    case 'trolleyEntfernt':
      // Wie der Grundplan: Was sich geändert hat, geht gebündelt als Upsert hinaus.
      // Ein entfernter Trolley (die Function hat ihn gelöscht) fällt dabei aus
      // dem Bündel — wartete er dort noch, legte ihn das Schreiben wieder an,
      // wie eine Person, die ihr eigenes Speichern wiederbelebt (`personEntfernt`).
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
      personSofort(congId, action.person)
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
      // Die Namensänderung in den Wochen (renameInWeeks) und in den
      // Treffpunkten (fsRenameLeader) schreibt der Block unter dem Switch,
      // **gebündelt** (`GEBUENDELT`, `FS_GEBUENDELT`). Ein Nachname mit zwölf
      // Buchstaben schrieb sonst zwölfmal jede Woche, in der die Person einen
      // Treffpunkt leitet — bei zwanzig geleiteten Wochen 240 Anfragen für eine
      // berichtigte Schreibweise. `flush()` beim Verlassen der Ansicht holt sie
      // ein (`selectPerson`/`navigate`/`logout`).
      //
      // Admin- und Planer-Recht sofort in gespiegelte Konten schreiben — beide
      // Rechte stehen in derselben Zeile.
      if ('plannerVorgemerkt' in action.patch || 'zuteilerVorgemerkt' in action.patch) {
        for (const m of next.members) {
          if (m.personId === action.id && m.userId !== next.userId) saveMemberRow(m)
        }
      }
      break
    }
    case 'selectPerson':
    case 'navigate': {
      // Ansicht verlassen → alle ausstehenden Debounce-Saves sofort schreiben
      // (das Abmelden steht oben, vor der Frage nach der Versammlung)
      ausstehendesSchreiben()
      break
    }
    case 'removePerson': {
      personEntfernt(prev, next, action.id)
      // Die gelösten Verweise (T38) müssen auch in der Datenbank landen —
      // sonst zeigt der Fremdschlüssel dort weiter ins Leere. Die Wochen der
      // Zusammenkünfte und der Treffpunkte übernimmt der Block unter dem Switch.
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
      if (haushalt) {
        // Was von ihnen gebündelt wartet, steckt in diesem Stand schon — und
        // ginge hinterher mit dem alten Haushalt hinaus (`personSofort`).
        for (const p of geaendert) personSaves.cancel(p.id)
        saveFamily(congId, haushalt, geaendert)
      } else for (const p of geaendert) personSofort(congId, p)
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
      geaenderteSchreiben(prev.persons, next.persons, (p) => personSofort(congId, p))
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
      grundplanSpeichern(congId, prev, next)
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
    case 'removeMember': {
      deleteMemberRow(action.userId)
      // Den Link der Person mit — siehe Reducer.
      const personId = prev.members.find((m) => m.userId === action.userId)?.personId
      if (personId) deleteAnmeldeLink(personId)
      break
    }
  }

  // Jede Woche, die sich geändert hat — siehe `geaenderteWochenSpeichern`. Die
  // verfallenen Zusagen ihrer Plätze gehen mit, wenn sie geschrieben ist (oben).
  // Ebenso jede Treffpunkt-Woche mit den Zusagen, die in ihr verfallen sind.
  if (wochenSchreiben) {
    geaenderteWochenSpeichern(congId, prev.weeks, next.weeks, GEBUENDELT.includes(action.type))
    geaenderteTreffpunktWochenSpeichern(congId, prev, next, FS_GEBUENDELT.includes(action.type), fsVerwaist)
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
   * **Wem ein Platz genommen wurde, von dem er wusste, erfährt es** — sobald
   * die Woche geschrieben ist, vorgemerkt am Anfang dieser Funktion
   * (`entzugNachDemSchreiben`, 16.10.2026). T99; seit dem 15.10.2026 nicht nur,
   * wer zugesagt hat, sondern auch, wem er gemeldet wurde
   * (`entzogeneZuteilungen`).
   *
   * Nach demselben Grundsatz wie oben an **einer** Stelle für alle Wege:
   * einzeln zuteilen, umteilen, leeren, Auto-Zuteilung, Treffpunkt-Leiter,
   * Treffpunkt-Auto — und alles, was künftig dazukommt. Eine Aufzählung der
   * auslösenden Aktionen wäre die zweite Buchführung: wer eine vergisst, merkt
   * es nie, weil nichts fehlschlägt — es geht nur eine Nachricht weniger
   * hinaus, und der Betroffene übt weiter für einen Platz, den er nicht mehr
   * hat.
   *
   * Gezählt wird am vorigen Stand: Der Reducer hat Zusage und Tagebuch-Eintrag
   * zu diesem Zeitpunkt schon abgeräumt (`ohneEntzogene`), dort stehen sie noch.
   *
   * `hydrate` ist ausgenommen, und nur das: Dort wird der ganze Bestand
   * ersetzt, und ein Neuladen nach einem Schreibkonflikt brächte sonst Wochen
   * voller vermeintlicher Entzüge hervor.
   *
   * **Erst sammeln, dann einmal schicken.** Je Entzug ein eigener Aufruf hieß:
   * Die Function las für jeden davon aufs Neue alle Mitglieder, alle Personen
   * und alle Push-Abos der Versammlung. Eine Auto-Zuteilung fasst aber eine
   * ganze Zusammenkunft an, und `setAuxClass` oder `fsRuleAdd` fassen alle 52
   * Wochen auf einmal an — aus einer Handlung wurden Dutzende Aufrufe.
   * Gesammelt ist es einer, und wer zwei Plätze verliert, bekommt eine
   * Nachricht statt zweier.
   *
   * Was vorgemerkt ist und von keinem Schreiben aufgenommen wurde, geschieht
   * jetzt (`liegenGebliebenesAusfuehren`) — die Woche hat sich dann nicht
   * geändert, oder sie schreibt eine Function (`OHNE_WOCHENSCHREIBEN`).
   */
  liegenGebliebenesAusfuehren()
}
