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
 * dieselben fünf Ausschlüsse wie in `_shared/zuteilungen.ts` (`offeneDerWoche`):
 *
 *  1. eine ausgefallene Zusammenkunft trägt keine Aufgaben (T30),
 *  2. Gastredner und Kreisaufseher kommen von außen (`isGuestRole`),
 *  3. Dienste mit Gruppen-Rotation gehören keiner Person,
 *  4. wer bestätigt oder abgesagt hat, weiß Bescheid,
 *  5. **was vorbei ist, braucht keine Nachricht mehr** (T77) — tagesgenau, am
 *     Tag der Zusammenkunft zählt sie noch.
 *
 * Die ersten drei erledigt `eachAssignedSlot` — dieselbe Aufzählung, die auch
 * die eigenen Aufgaben und die „…"-Markierung speist. Sie einzeln
 * nachzubauen wäre genau die Fehlerart, gegen die `alle-plaetze.test.ts`
 * steht: eine Platzsorte wird vergessen, und niemand merkt es, weil nichts
 * fehlschlägt — es geht nur eine Nachricht weniger hinaus.
 *
 * **Zum fünften.** Bis T95 zählte der Knopf am Donnerstag auch die Plätze vom
 * Dienstag, und die Function schickte sie mit: eine Nachricht über eine
 * Zusammenkunft, die gewesen ist. Die Planungs-Karte des Start-Bildschirms ließ
 * sie weg — dieselbe Woche stand dort mit einer anderen Zahl als im Planen, und
 * der Knopf verschickte mehr, als die Karte angekündigt hatte. Jetzt lassen alle
 * drei es weg.
 */
/*
 * **Kein zweites „Treffpunkt-Leiter".** Die Bezeichnung stand hier als eigene
 * Konstante neben der in `_shared/zuteilungen.ts` — und die beiden waren
 * auseinander: Die Function schrieb `Treffpunkt-Leiter · <Ort>` mit ortlosem
 * Termin, der Client `Treffpunkt-Leiter` mit dem Ort im Termin. Dieselbe
 * Auskunft in zwei Reihenfolgen, je nachdem, ob die Nachricht aus der Function
 * oder aus dem Browser kam. Jetzt gibt es die Zeichenkette einmal; der Ort
 * gehört zum Termin (siehe dort).
 */
import { FS_LEITER } from '../../supabase/functions/_shared/zuteilungen.ts'
import { schluesselTeile, wochenPraefixe } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { fsTag, fsTagVorbei, fsTaskKey, fsTerminText } from './fs'
import { dieselbePerson, hatAuxKlasse, istAusgefallen, MEETING_TABS } from './helpers'
import { istVorbei, meetingDateMs } from './meeting-dates'
import { aufgabenBezeichnung, eachAssignedSlot, sentKey, taskKeyWeek } from './planning'
import type {
  ConfirmationMap,
  FsInstance,
  MeetingTimes,
  MyTask,
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

/** Was in der Liste von „Plan senden" zu einem Platz steht — dieselben Felder wie unter „Meine Aufgaben". */
export type MeldungsAufgabe = Pick<MyTask, 'title' | 'rolle' | 'date' | 'lesersprache'>

/** Eine offene Meldung der Woche — samt Aufgabe für die Liste im Blatt „Plan senden" (T121). */
export interface OffeneWochenMeldung extends OffeneMeldung {
  /** Erst auf Abruf: Die Zahl am Knopf braucht sie nicht, nur die Liste. */
  aufgabe: () => MeldungsAufgabe
}

/**
 * Plätze **einer** Woche, die noch niemandem gemeldet wurden.
 *
 * Die Woche wird einzeln durchgereicht (`[week]`), nicht über einen Index
 * gesucht: die Aufgaben-Schlüssel hängen seit T66 an `week.start`, nicht an
 * der Ordnungszahl — die Aufzählung liefert also auch dann die richtigen
 * Schlüssel, wenn sie nur eine Woche zu sehen bekommt.
 *
 * `zeiten` ist Pflicht, nicht vorbelegt: Ohne die Zusammenkunftszeiten der
 * Versammlung fiele „vorbei" still auf Dienstag/Sonntag zurück, und bei einer
 * Versammlung, die donnerstags zusammenkommt, stimmte die Zahl nur an manchen
 * Tagen.
 */
export function offeneMeldungen(
  week: Week | undefined,
  fsWeek: FsInstance[] | undefined,
  services: Service[],
  confirmations: ConfirmationMap,
  sentLog: SentLog,
  zeiten: MeetingTimes,
  heute = new Date(),
): OffeneWochenMeldung[] {
  const out: OffeneWochenMeldung[] = []
  const nimm = (key: string, name: string, aufgabe: () => MeldungsAufgabe): void => {
    if (weissBescheid(confirmations, sentLog, key, name)) return
    out.push({ key, name, aufgabe })
  }

  if (week) {
    // Vorbei ist eine Zusammenkunft als Ganzes — der Schlüssel jedes Platzes
    // trägt sie an zweiter Stelle (`<Montag>|<tab>|…`).
    const vorbei = vergangeneZusammenkuenfte(week, zeiten, heute)
    eachAssignedSlot([week], services, zeiten, (slot, key, task) => {
      const wo = taskKeyWeek(key)
      if (wo && vorbei.has(wo.tab)) return
      nimm(key, slot.name, task)
    })
  }

  // Treffpunkte: zweite Datenquelle, eigener Schlüsselraum (`fs|…`), die
  // Kennung ist der Montag der Programmwoche daneben. Ein Freitext-Leiter
  // (auswärtig) gehört niemandem und bekommt nichts. Vorbei ist jeder
  // Treffpunkt an seinem eigenen Tag. Die Aufgabe steht wie unter „Meine
  // Aufgaben" (`deriveMyFsTasks`): die Rolle, im Termin der Ort.
  const kennung = week?.start ?? ''
  for (const inst of fsWeek ?? []) {
    if (!inst.leader || inst.lext) continue
    if (fsTagVorbei(kennung, inst.wd, heute)) continue
    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({
      title: '',
      rolle: FS_LEITER,
      date: fsTerminText(fsTag(kennung, inst.wd), inst),
    }))
  }
  return out
}

/**
 * **Weiß die Person von ihrem Platz?** Sie hat zugesagt oder abgesagt, oder er
 * ist ihr gemeldet worden — das Versand-Tagebuch führt ihn unter Platz **und**
 * Name, ein neuer Name auf demselben Platz weiß also noch nichts.
 *
 * Für „Plan senden" heißt das: nichts mehr zu melden. Für den Entzug: Sie muss
 * erfahren, wenn der Platz ihr genommen wird (`entzogeneZuteilungen`).
 */
function weissBescheid(confirmations: ConfirmationMap, sentLog: SentLog, key: string, name: string): boolean {
  return Boolean(confirmations[key]) || Boolean(sentLog[sentKey(key, name)])
}

/**
 * Die Zusammenkünfte dieser Woche, deren Tag vorbei ist (T77).
 *
 * Ohne Startdatum (Demo, Vorlagen) liegt die Woche nirgends im Kalender — dann
 * ist nichts vorbei, wie bei `istVorbei` selbst. Auch die Zusagen der Woche
 * lassen sie weg (`zusagenDerWoche`).
 */
export function vergangeneZusammenkuenfte(week: Week, zeiten: MeetingTimes, heute: Date): Set<string> {
  return new Set(MEETING_TABS.filter((tab) => istVorbei(meetingDateMs(week, tab, zeiten), heute)))
}

/** Eine Zuteilung, die jemandem wieder genommen wurde, der von ihr wusste. */
export interface EntzogeneZuteilung {
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

/** Zwei Stände einer Woche und was es braucht, um sie zu vergleichen (`entzogeneZuteilungen`). */
export interface WochenVergleich {
  vorher: Week | undefined
  nachher: Week | undefined
  vorherFs?: readonly FsInstance[]
  nachherFs?: readonly FsInstance[]
  services: Service[]
  zeiten: MeetingTimes
  /** Wer zugesagt oder abgesagt hat. */
  confirmations: ConfirmationMap
  /** Wem was gemeldet wurde („Plan senden"). */
  sentLog: SentLog
  heute?: Date
}

/**
 * Zuteilungen, **von denen jemand weiß**, die zwischen zwei Ständen einer Woche
 * verschwunden oder an jemand anderen gegangen sind.
 *
 * Das ist der eine Fall, der nicht auf den „Plan senden"-Knopf warten darf.
 * Wer von seinem Platz weiß, bereitet vor: Er lernt seinen Teil, sucht die
 * Schriftstelle heraus, sagt zu Hause Bescheid. Wird ihm der Platz genommen und
 * erfährt er es erst beim nächsten Öffnen der App — oder gar nicht, weil an
 * seiner Stelle jemand anderes benachrichtigt wird —, übt er weiter für etwas,
 * das ihm nicht mehr gehört. Bis T99 passierte genau das: Das Umteilen verwarf
 * seine Bestätigung still (`dropConfirmations`), und keine Nachricht ging
 * hinaus.
 *
 * **Wer davon weiß** (`weissBescheid`): wer zugesagt hat, und seit dem
 * 15.10.2026 auch, wem der Platz gemeldet wurde („Plan senden") — er kennt ihn,
 * auch wenn er noch nicht geantwortet hat (Entscheid des Betreibers). Wer
 * abgesagt hat, hat ihn selbst abgegeben und bekommt nichts. Vor dem Senden ist
 * der Plan Entwurf: Der Planer darf umsortieren, ohne dass jemand etwas erfährt.
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
 * **Und Vergangenes nicht** — dieselbe Regel wie beim „Plan senden". Wer die
 * Woche von gestern nachträgt (wer wirklich am Mikrofon stand), nimmt niemandem
 * etwas, das er noch vorbereiten müsste. Eine Nachricht „Zuteilung
 * zurückgezogen" über einen Termin, der gewesen ist, erschreckt nur. Gemessen
 * wird am **alten** Stand: Es geht um den Termin, den die Person hatte.
 */
export function entzogeneZuteilungen(v: WochenVergleich): EntzogeneZuteilung[] {
  const { vorher, nachher, vorherFs, nachherFs, services, zeiten, heute = new Date() } = v
  if (!vorher) return []
  // Gegen fehlende Maps abgesichert: Diese Funktion läuft auch in der
  // Nebeneffekt-Schicht (`persist.ts`), und ein Fehler dort risse das
  // **Speichern** mit. Lieber keine Nachricht als eine verlorene Woche.
  const conf = v.confirmations ?? {}
  const gemeldet = v.sentLog ?? {}
  /** Erfährt es, wer den Platz verliert? Wer von ihm weiß — außer er hat selbst abgesagt. */
  const betroffen = (key: string, name: string): boolean =>
    conf[key] !== 'verhindert' && weissBescheid(conf, gemeldet, key, name)
  const kennung = vorher.start

  /** Wer den Platz vorher hatte — die Bezeichnung erst, wenn sie gebraucht wird. */
  interface Vorher {
    name: string
    pid?: string
    beschreiben: () => { label: string; datum: string }
  }
  const alt = new Map<string, Vorher>()
  const vorbei = vergangeneZusammenkuenfte(vorher, zeiten, heute)
  eachAssignedSlot([vorher], services, zeiten, (slot, key, task) => {
    // Wovon niemand weiß, gar nicht erst aufnehmen — es fiele unten ohnehin
    // heraus. Diese Funktion läuft bei jeder Wochenänderung; `fsRuleAdd` und
    // `setAuxClass` setzen alle 52 Wochen auf einmal neu.
    if (!betroffen(key, slot.name)) return
    const wo = taskKeyWeek(key)
    if (wo && vorbei.has(wo.tab)) return
    // `task()` bleibt ungerufen: Es baut den ganzen S-89-Bogen mit auf. Erst
    // unten, für die, die wirklich hinausgehen.
    alt.set(key, {
      name: slot.name,
      pid: slot.pid,
      beschreiben: () => {
        const t = task()
        return { label: aufgabenBezeichnung(t), datum: t.date }
      },
    })
  })
  for (const inst of vorherFs ?? []) {
    if (!inst.leader || inst.lext) continue
    const key = fsTaskKey(kennung, inst.id)
    if (!betroffen(key, inst.leader)) continue
    if (fsTagVorbei(kennung, inst.wd, heute)) continue
    alt.set(key, {
      name: inst.leader,
      pid: inst.lpid,
      // Termin kanonisch deutsch wie überall sonst („Dienstag, 8. September ·
      // 19:00 · Bahnhof"). Aus Zeit und Ort allein ging der **Tag** nicht
      // hervor: Wer einen wöchentlichen Treffpunkt leitet, las „10:00 ·
      // Bahnhof" und wusste nicht, welche Woche gemeint war. `fsTerminText`
      // baut ihn — dieselbe Zeichenkette, die auch in „Meine Aufgaben" steht.
      beschreiben: () => ({ label: FS_LEITER, datum: fsTerminText(fsTag(kennung, inst.wd), inst) }),
    })
  }

  if (alt.size === 0) return []

  const neu = new Map<string, { name: string; pid?: string }>()
  if (nachher) {
    eachAssignedSlot([nachher], services, zeiten, (slot, key) =>
      neu.set(key, { name: slot.name, pid: slot.pid }),
    )
  }
  for (const inst of nachherFs ?? []) {
    if (!inst.leader || inst.lext) continue
    neu.set(fsTaskKey(kennung, inst.id), {
      name: inst.leader,
      pid: inst.lpid,
    })
  }
  const fsLeer = (nachherFs ?? []).length === 0

  const out: EntzogeneZuteilung[] = []
  for (const [key, war] of alt) {
    if (!platzNochDa(nachher, key, fsLeer)) continue
    const jetzt = neu.get(key)
    if (jetzt && dieselbePerson(war, jetzt)) continue // unverändert
    const { label, datum } = war.beschreiben()
    out.push({ key, name: war.name, ...(war.pid ? { pid: war.pid } : {}), label, datum })
  }
  return out
}

/** Was `entzogeneAller` aus einem Stand liest — Felder des App-Zustands. */
export interface EntzugsStand {
  weeks: Week[]
  fsWeeks: FsInstance[][]
  services: Service[]
  congregation: { times: MeetingTimes }
  confirmations: ConfirmationMap
  sentLog: SentLog
}

/**
 * `entzogeneZuteilungen` über alle Wochen, die sich zwischen zwei Ständen
 * geändert haben — dem Reducer zum Abräumen, `persist.ts` zum Benachrichtigen.
 *
 * Unberührte Wochen behalten ihre Referenz (darauf baut die ganze
 * Persistenzschicht); ihr Vergleich kostet nichts. Gezählt wird am **alten**
 * Stand: Seine Wochen, Zusagen und Meldungen sagen, wer was wusste. Neue Wochen
 * (Import, hinten angehängt) hatten noch keinen Inhaber.
 */
export function entzogeneAller(
  vorher: EntzugsStand,
  nachher: Pick<EntzugsStand, 'weeks' | 'fsWeeks'>,
  heute = new Date(),
): EntzogeneZuteilung[] {
  if (vorher.weeks === nachher.weeks && vorher.fsWeeks === nachher.fsWeeks) return []
  const out: EntzogeneZuteilung[] = []
  for (let wi = 0; wi < vorher.weeks.length; wi++) {
    if (vorher.weeks[wi] === nachher.weeks[wi] && vorher.fsWeeks[wi] === nachher.fsWeeks[wi]) continue
    out.push(
      ...entzogeneZuteilungen({
        vorher: vorher.weeks[wi],
        nachher: nachher.weeks[wi],
        vorherFs: vorher.fsWeeks[wi],
        nachherFs: nachher.fsWeeks[wi],
        services: vorher.services,
        zeiten: vorher.congregation.times,
        confirmations: vorher.confirmations,
        sentLog: vorher.sentLog,
        heute,
      }),
    )
  }
  return out
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
  const teile = schluesselTeile(key)
  // Fremdformat: nicht wegfiltern. Wer den Schlüssel nicht deuten kann, hält
  // die Nachricht lieber zurück als sie fälschlich zu unterdrücken.
  if (!teile) return true
  if (teile.art === 'fs') return !fsLeer
  if (!nachher) return false
  if (istAusgefallen(nachher, teile.tab)) return false
  // Zusätzliche Klasse: die Plätze der zweiten Reihe und ihr Ratgeber hängen
  // beide an `auxRatgeber` — ist die Marke weg, zählt `raeume()` den Raum nicht
  // mehr auf. Die Namen bleiben dabei absichtlich in den Daten stehen.
  if (teile.art === 'aux' || teile.art === 'ratgeber') return hatAuxKlasse(nachher[teile.tab])
  return true
}

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
  // Der Tagebuch-Schlüssel beginnt mit dem Aufgaben-Schlüssel; ein Präfix-
  // Vergleich genügt und kommt ohne Zerlegen aus (Namen dürfen Leerzeichen
  // enthalten, ein Aufgaben-Schlüssel theoretisch auch).
  const praefixe = wochenPraefixe(weekStart)
  return neuesterVersand(sentLog, (schluessel) => praefixe.some((p) => schluessel.startsWith(p)))
}

/**
 * Der jüngste Zeitstempel im Versand-Tagebuch unter den Schlüsseln, die
 * `gehoert` annimmt — für die Woche wie für eine einzelne Zusammenkunft
 * (`offene-plaetze.ts`). Stand bis zum 3.10.2026 dreimal als eigene Schleife da.
 */
export function neuesterVersand(sentLog: SentLog, gehoert: (schluessel: string) => boolean): string | null {
  let neuster: string | null = null
  for (const [schluessel, wann] of Object.entries(sentLog)) {
    if (!gehoert(schluessel)) continue
    if (neuster === null || wann > neuster) neuster = wann
  }
  return neuster
}

/**
 * Wann ging für **diese** Plätze zuletzt etwas hinaus? — eine Auswahl statt der
 * ganzen Woche, etwa die Treffpunkte einer Gruppe. Das Tagebuch führt jeden
 * Platz einzeln (`sentKey`), die Zeit ist also so genau wie die der Woche.
 * Verglichen wird mit dem Leerzeichen dahinter: `…|f1` ist nicht `…|f10`.
 */
export function zuletztGesendetFuer(sentLog: SentLog, taskKeys: Iterable<string>): string | null {
  const praefixe = [...taskKeys].map((k) => sentKey(k, ''))
  return neuesterVersand(sentLog, (schluessel) => praefixe.some((p) => schluessel.startsWith(p)))
}

/**
 * Was von den offenen Aufgaben noch nicht im Versand-Tagebuch steht — die
 * Meldungen für „Plan senden" ohne Woche. Gerechnet werden die offenen mit
 * derselben Funktion wie in `send-plan`; hier fällt nur weg, was schon hinaus ist.
 */
export function nochNichtGemeldet(offen: readonly { key: string; name: string }[], sentLog: SentLog): OffeneMeldung[] {
  return offen.filter((p) => !sentLog[sentKey(p.key, p.name)]).map((p) => ({ key: p.key, name: p.name }))
}
