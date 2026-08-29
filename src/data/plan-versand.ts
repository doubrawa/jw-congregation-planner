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
import { fsTaskKey, fsWochenStart } from './fs'
import { aufgabenBezeichnung, eachAssignedSlot, sentKey } from './planning'
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
    nimm(fsTaskKey(fsWochenStart(fsBase, wi), inst.id), inst.leader)
  }
  return out
}

/** Eine Zusage, die jemandem wieder genommen wurde. */
export interface EntzogeneZusage {
  key: string
  /** Wer sie hatte — der Anzeigename, unter dem er auch das Konto findet. */
  name: string
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
 * Verglichen werden die **Namen je Aufgaben-Schlüssel**, nicht die Slots. Wer
 * seinen Platz behält und nur eine andere Rolle bekommt, hat nichts verloren
 * und bekommt nichts; wer verschwindet oder ersetzt wird, schon.
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

  const alt = new Map<string, EntzogeneZusage>()
  eachAssignedSlot([vorher], services, meetings, (name, key, task) => {
    const t = task()
    alt.set(key, { key, name, label: aufgabenBezeichnung(t), datum: t.date })
  })
  for (const inst of vorherFs ?? []) {
    if (!inst.leader || inst.lext) continue
    const key = fsTaskKey(fsWochenStart(fsBase, wi), inst.id)
    alt.set(key, {
      key,
      name: inst.leader,
      label: FS_LEITER,
      datum: [inst.time, inst.place].filter(Boolean).join(' · '),
    })
  }

  const neu = new Map<string, string>()
  if (nachher) eachAssignedSlot([nachher], services, meetings, (name, key) => neu.set(key, name))
  for (const inst of nachherFs ?? []) {
    if (!inst.leader || inst.lext) continue
    neu.set(fsTaskKey(fsWochenStart(fsBase, wi), inst.id), inst.leader)
  }

  const out: EntzogeneZusage[] = []
  // Gegen eine fehlende Map abgesichert: Diese Funktion läuft in der
  // Nebeneffekt-Schicht (`persist.ts`), und ein Fehler dort risse das
  // **Speichern** mit. Lieber keine Nachricht als eine verlorene Woche.
  const conf = confirmations ?? {}
  for (const [key, eintrag] of alt) {
    if (conf[key] !== 'bestätigt') continue
    if (neu.get(key) === eintrag.name) continue // unverändert
    out.push(eintrag)
  }
  return out
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
