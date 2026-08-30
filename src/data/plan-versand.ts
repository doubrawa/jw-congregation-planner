/**
 * Was hat „Plan senden" für diese Woche noch zu tun?
 *
 * Der Knopf im Planen-Screen beschriftet sich damit („12 noch nicht gesendet"),
 * und die Liste darunter nennt die Namen. Gesendet wird serverseitig
 * (`supabase/functions/send-plan`) — diese Datei rechnet nur die Vorschau.
 *
 * **Beide Seiten müssen dieselbe Menge treffen.** Weichen sie ab, zeigt der
 * Knopf eine Zahl an, die nach dem Drücken nicht auf null geht: der Planer
 * drückt, bekommt „0 gesendet", und die Zahl steht unverändert da. Deshalb
 * dieselben vier Ausschlüsse wie in `_shared/zuteilungen.ts`:
 *
 *  1. eine ausgefallene Zusammenkunft trägt keine Aufgaben (T30),
 *  2. Gastredner und Kreisaufseher kommen von außen (`isGuestRole`),
 *  3. Dienste mit Gruppen-Rotation gehören keiner Person,
 *  4. wer bestätigt oder abgesagt hat, weiß Bescheid.
 *
 * Die ersten drei erledigt `eachAssignedSlot` — dieselbe Aufzählung, die auch
 * die eigenen Aufgaben und die „…"-Markierung speist. Sie einzeln
 * nachzubauen wäre genau die Fehlerart, gegen die `alle-plaetze.test.ts`
 * steht: eine Platzsorte wird vergessen, und niemand merkt es, weil nichts
 * fehlschlägt — es geht nur eine Nachricht weniger hinaus.
 */
import { fsTag, fsTaskKey, fsWochenStart } from './fs'
import { hatAuxKlasse, istAusgefallen } from './helpers'
import { deutschesDatum } from './meeting-dates'
import { aufgabenBezeichnung, eachAssignedSlot, sentKey, taskKeyWeek } from './planning'
import type {
  ConfirmationMap,
  FsInstance,
  SentLog,
  Service,
  Week,
} from './types'

/** Ein Platz, über den die eingeteilte Person noch nichts erfahren hat. */
export interface OffeneMeldung {
  /** Aufgaben-Schlüssel — dieselbe Form wie in `confirmations`. */
  key: string
  /** Anzeigename der eingeteilten Person. */
  name: string
}

/**
 * Plätze **einer** Woche, die noch niemandem gemeldet wurden.
 *
 * Die Woche wird einzeln durchgereicht (`[week]`), nicht über einen Index
 * gesucht: die Aufgaben-Schlüssel hängen seit T66 an `week.start`, nicht an
 * der Ordnungszahl — die Aufzählung liefert also auch dann die richtigen
 * Schlüssel, wenn sie nur eine Woche zu sehen bekommt.
 */
export function offeneMeldungen(
  week: Week | undefined,
  fsWeek: FsInstance[] | undefined,
  wi: number,
  fsBase: Date | null,
  services: Service[],
  confirmations: ConfirmationMap,
  sentLog: SentLog,
): OffeneMeldung[] {
  const out: OffeneMeldung[] = []
  const nimm = (key: string, name: string): void => {
    // Wer bestätigt oder abgesagt hat, weiß Bescheid. Und was im Tagebuch
    // steht, ist hinaus.
    if (confirmations[key]) return
    if (sentLog[sentKey(key, name)]) return
    out.push({ key, name })
  }

  if (week) {
    eachAssignedSlot([week], services, '', (name, key) => nimm(key, name))
  }

  // Treffpunkte: zweite Datenquelle, eigener Schlüsselraum (`fs|…`). Ein
  // Freitext-Leiter (auswärtig) gehört niemandem und bekommt nichts.
  for (const inst of fsWeek ?? []) {
    if (!inst.leader || inst.lext) continue
    nimm(fsTaskKey(fsKennung(week, fsBase, wi), inst.id), inst.leader)
  }
  return out
}

/** Eine Zusage, die jemandem wieder genommen wurde. */
export interface EntzogeneZusage {
  key: string
  /** Wer sie hatte — der Anzeigename, unter dem er auch das Konto findet. */
  name: string
  /**
   * Person-Id, wo der Platz eine trug.
   *
   * Sie geht an `send-plan` mit: Am Namen allein bekämen zwei Gleichnamige
   * gegenseitig die Nachricht des anderen — dieselbe Rangfolge, nach der die
   * Function auch beim „Plan senden" zustellt (Id zuerst, Name als Rückfall).
   */
  pid?: string
  /** Bezeichnung des Platzes, kanonisch deutsch. */
  label: string
  /** Termin, kanonisch deutsch („Dienstag, 8. September · 19:00"). */
  datum: string
}

/**
 * **Bestätigte** Zuteilungen, die zwischen zwei Ständen einer Woche
 * verschwunden oder an jemand anderen gegangen sind.
 *
 * Das ist der eine Fall, der nicht auf den „Plan senden"-Knopf warten darf.
 * Wer zugesagt hat, bereitet vor: Er lernt seinen Teil, sucht die Schriftstelle
 * heraus, sagt zu Hause Bescheid. Wird ihm der Platz genommen und erfährt er es
 * erst beim nächsten Öffnen der App — oder gar nicht, weil an seiner Stelle
 * jemand anderes benachrichtigt wird —, übt er weiter für etwas, das ihm nicht
 * mehr gehört. Bisher passierte genau das: Das Umteilen verwarf seine
 * Bestätigung still (`dropConfirmations`), und keine Nachricht ging hinaus.
 *
 * Verglichen wird **die Person je Aufgaben-Schlüssel**, nicht der Slot. Wer
 * seinen Platz behält und nur eine andere Rolle bekommt, hat nichts verloren
 * und bekommt nichts; wer verschwindet oder ersetzt wird, schon.
 *
 * **Wer dieselbe Person ist, entscheidet die Person-Id** — der Name nur, wo
 * keine Id dasteht (Hilfsdienste als reine Zeichenkette, Altdaten). Am Namen
 * allein ging es zweifach schief: Eine berichtigte Schreibweise las sich als
 * Entzug, und zwischen zwei Gleichnamigen umzuteilen las sich als gar nichts.
 * Dieselbe Rangfolge wie `deriveMyTasks` — dort steht sie aus demselben Grund.
 *
 * **Und der Platz muss es noch geben.** Verschwindet er, weil die ganze
 * Zusammenkunft ausfällt oder die Zusätzliche Klasse abgeschaltet wurde, hat
 * niemandem jemand etwas genommen: Die Zuteilungen ruhen, sie sind nicht
 * verwaist (dieselbe Lesart wie in `eachAssignedSlot`). Ohne diese Prüfung
 * schickte eine Kongress-Woche — in der planmäßig **alle** Zusammenkünfte
 * ausfallen — der halben Versammlung „Zuteilung zurückgezogen".
 *
 * Unbestätigte Zuteilungen bleiben außen vor: Sie sind Entwurf. Der Planer darf
 * umsortieren, solange niemand zugesagt hat.
 */
export function entzogeneZusagen(
  vorher: Week | undefined,
  nachher: Week | undefined,
  vorherFs: FsInstance[] | undefined,
  nachherFs: FsInstance[] | undefined,
  wi: number,
  fsBase: Date | null,
  services: Service[],
  meetings: string,
  confirmations: ConfirmationMap,
): EntzogeneZusage[] {
  if (!vorher) return []
  // Gegen eine fehlende Map abgesichert: Diese Funktion läuft in der
  // Nebeneffekt-Schicht (`persist.ts`), und ein Fehler dort risse das
  // **Speichern** mit. Lieber keine Nachricht als eine verlorene Woche.
  const conf = confirmations ?? {}

  /** Wer den Platz vorher hatte — die Bezeichnung erst, wenn sie gebraucht wird. */
  interface Vorher {
    name: string
    pid?: string
    beschreiben: () => { label: string; datum: string }
  }
  const alt = new Map<string, Vorher>()
  eachAssignedSlot([vorher], services, meetings, (name, key, task, pid) => {
    // `task()` bleibt ungerufen: Es baut den ganzen S-89-Bogen mit auf, und von
    // gut 35 Plätzen sind am Ende ein bis drei bestätigt. Erst unten, für die,
    // die wirklich hinausgehen.
    alt.set(key, {
      name,
      pid,
      beschreiben: () => {
        const t = task()
        return { label: aufgabenBezeichnung(t), datum: t.date }
      },
    })
  })
  for (const inst of vorherFs ?? []) {
    if (!inst.leader || inst.lext) continue
    const key = fsTaskKey(fsKennung(vorher, fsBase, wi), inst.id)
    alt.set(key, {
      name: inst.leader,
      pid: inst.lpid,
      // Termin kanonisch deutsch wie überall sonst („Dienstag, 8. September ·
      // 19:00 · Bahnhof"). Aus Zeit und Ort allein ging der **Tag** nicht
      // hervor: Wer einen wöchentlichen Treffpunkt leitet, las „10:00 ·
      // Bahnhof" und wusste nicht, welche Woche gemeint war. Gebaut wie in
      // `deriveMyFsTasks` — dieselbe Datenlage, dieselbe Zeichenkette.
      beschreiben: () => ({ label: FS_LEITER, datum: fsTermin(fsKennung(vorher, fsBase, wi), inst) }),
    })
  }

  const neu = new Map<string, { name: string; pid?: string }>()
  if (nachher) {
    eachAssignedSlot([nachher], services, meetings, (name, key, _task, pid) =>
      neu.set(key, { name, pid }),
    )
  }
  for (const inst of nachherFs ?? []) {
    if (!inst.leader || inst.lext) continue
    neu.set(fsTaskKey(fsKennung(vorher, fsBase, wi), inst.id), {
      name: inst.leader,
      pid: inst.lpid,
    })
  }
  const fsLeer = (nachherFs ?? []).length === 0

  const out: EntzogeneZusage[] = []
  for (const [key, war] of alt) {
    if (conf[key] !== 'bestätigt') continue
    if (!platzNochDa(nachher, key, fsLeer)) continue
    const jetzt = neu.get(key)
    if (jetzt && dieselbePerson(war, jetzt)) continue // unverändert
    const { label, datum } = war.beschreiben()
    out.push({ key, name: war.name, ...(war.pid ? { pid: war.pid } : {}), label, datum })
  }
  return out
}

/**
 * Zwei Besetzungen desselben Platzes — dieselbe Person?
 *
 * Die Id entscheidet, sobald **beide** Seiten eine tragen; sonst der Name. Ein
 * halbseitiger Vergleich (eine Seite mit Id, die andere ohne) fiele sonst auf
 * „ungleich" und meldete einen Entzug, wo nur eine Id nachgetragen wurde.
 */
function dieselbePerson(a: { name: string; pid?: string }, b: { name: string; pid?: string }): boolean {
  return a.pid && b.pid ? a.pid === b.pid : a.name === b.name
}

/**
 * Gibt es den Platz im neuen Stand überhaupt noch — unabhängig davon, wer
 * darauf steht?
 *
 * Nur wenn ja, ist „niemand mehr darauf" ein Entzug. Fällt die Zusammenkunft
 * aus oder ist die Zusätzliche Klasse abgeschaltet, zählt `eachAssignedSlot`
 * den Platz gar nicht mehr auf — er ist dann nicht leer, sondern abwesend.
 *
 * Ein einzeln **gelöschter** Programmpunkt ist etwas anderes und bleibt ein
 * Entzug: Den Teil gibt es nicht mehr, und wer ihn vorbereitet hat, muss das
 * erfahren. Ebenso ein einzeln gelöschter Treffpunkt — nur ein Wochenblatt,
 * das im Ganzen leer wird, gilt als Strukturwechsel und schweigt.
 */
function platzNochDa(nachher: Week | undefined, key: string, fsLeer: boolean): boolean {
  if (key.startsWith('fs|')) return !fsLeer
  const wo = taskKeyWeek(key)
  // Fremdformat: nicht wegfiltern. Wer den Schlüssel nicht deuten kann, hält
  // die Nachricht lieber zurück als sie fälschlich zu unterdrücken.
  if (!wo) return true
  if (!nachher) return false
  if (istAusgefallen(nachher, wo.tab)) return false
  const abschnitt = key.split('|')[2]
  // Zusätzliche Klasse: die Plätze der zweiten Reihe und ihr Ratgeber hängen
  // beide an `auxRatgeber` — ist die Marke weg, zählt `raeume()` den Raum nicht
  // mehr auf. Die Namen bleiben dabei absichtlich in den Daten stehen.
  if (abschnitt === 'aux' || abschnitt === 'ratgeber') return hatAuxKlasse(nachher[wo.tab])
  return true
}

/**
 * Termin eines Treffpunkts, kanonisch deutsch — dieselbe Zeichenkette, die
 * `deriveMyFsTasks` für „Meine Aufgaben" bildet.
 *
 * Ohne Datumsbasis (Vorlagen, Tests) bleibt es bei Zeit und Ort: einen Tag zu
 * erfinden wäre schlimmer, als keinen zu nennen.
 */
function fsTermin(wochenStart: string, inst: FsInstance): string {
  const tag = fsTag(wochenStart, inst.wd)
  return [tag ? deutschesDatum(tag) : '', inst.time, inst.place].filter(Boolean).join(' · ')
}

/**
 * Der Montag dieser Woche — die Kennung, an der die Treffpunkt-Schlüssel hängen.
 *
 * Aus der Woche selbst, nicht aus `fsBase + wi·7`: Fehlt im Bestand eine Woche,
 * liegen die beiden sieben Tage auseinander — und die Edge Function nimmt den
 * Montag aus der **Datenbankzeile**. Sie schriebe dann Tagebuch-Einträge unter
 * einem Schlüssel, den diese Datei nie sucht: Der Knopf zeigte „12 noch nicht
 * gesendet", der Druck meldete „0 gesendet", und die Zahl bliebe stehen.
 * `fsWochenStart` bleibt der Rückfall für Wochen ohne Kennung.
 */
function fsKennung(week: Week | undefined, fsBase: Date | null, wi: number): string {
  return week?.start || fsWochenStart(fsBase, wi)
}

/**
 * „Treffpunkt-Leiter" kanonisch deutsch — dieselbe Zeichenkette, die
 * `_shared/zuteilungen.ts` für die Erinnerungen bildet. Sie steht als
 * Programm-Fragment in allen Sprachen und wird beim Anzeigen übersetzt.
 */
const FS_LEITER = 'Treffpunkt-Leiter'

/**
 * Wann ging für diese Woche zuletzt etwas hinaus? (ISO-Zeitpunkt, sonst null.)
 *
 * Gelesen wird aus demselben Tagebuch, gegen das oben gefiltert wird — der
 * jüngste Eintrag, der zu einem Platz dieser Woche gehört. Die Schlüssel
 * beginnen mit der Wochenkennung (`<montag>|…`) bzw. tragen sie an zweiter
 * Stelle (`fs|<montag>|…`), sodass sich die Woche am Schlüssel erkennen lässt,
 * ohne die Plätze noch einmal aufzuzählen.
 */
export function zuletztGesendet(sentLog: SentLog, weekStart: string): string | null {
  if (!weekStart) return null
  let neuster: string | null = null
  for (const [schluessel, wann] of Object.entries(sentLog)) {
    // Der Tagebuch-Schlüssel beginnt mit dem Aufgaben-Schlüssel; ein Präfix-
    // Vergleich genügt und kommt ohne Zerlegen aus (Namen dürfen Leerzeichen
    // enthalten, ein Aufgaben-Schlüssel theoretisch auch).
    const gehoert =
      schluessel.startsWith(`${weekStart}|`) || schluessel.startsWith(`fs|${weekStart}|`)
    if (!gehoert) continue
    if (neuster === null || wann > neuster) neuster = wann
  }
  return neuster
}
