/**
 * Die Konfliktprüfung des Planens: wer trotz Abwesenheit eingeteilt ist, wer
 * zur selben Zeit zweimal steht und welche Gesprächspaare nicht zueinander
 * passen.
 */

import { istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from '../absence'
import { allePlaetze, platzKey, type ProgrammPlatz } from '../plaetze'
import { istSchuelerteil, programmPlaetze, slotsOf } from '../aux-class'
import {
  gehoertZu,
  isGuestRole,
  istAusgefallen,
  istVorsitz,
  MEETING_TABS,
  passtZumPaar,
  idAufloeser,
  type Zuteilung,
} from '../helpers'
import type { Meeting, MeetingKey, Person, Service, SlotAssignment, Week } from '../types'

/* ---- Konfliktprüfungen (Planen) ------------------------------------------
 * Warnungen für den Planer, aus den Wochen abgeleitet: jemand ist trotz
 * Abwesenheit eingeteilt oder mehrfach in derselben Zusammenkunft. Reine
 * Ableitung, keine Persistenz.
 *
 * **Eine Serie ist kein Konflikt.** „X ist 3 Wochen in Folge eingeteilt"
 * wäre der häufigste Eintrag des Banners — in einer kleinen Versammlung ist
 * das der Normalfall, kein Missstand. Eine Warnung, die fast immer steht,
 * bringt der Planer sich ab und übersieht daneben die, auf die es ankommt.
 * Was hier steht, nennt nur Dinge, die so nicht bleiben können. Die
 * Auslastung selbst ist damit nicht aus dem Blick:
 * die Auto-Zuteilung rechnet sie (`partLoad`/`anyDist`), und das Personen-Sheet
 * zeigt sie in den Quadraten.
 */

/**
 * Kennung einer Person in einer Zuteilung — für die Konfliktprüfung.
 *
 * Die Person-Id, wo vorhanden — sonst der Anzeigename mit Präfix, damit ein
 * Name nie versehentlich wie eine Id aussieht. Zwei Personen desselben Namens
 * bleiben so auseinander, und ein Umbenennen ändert nichts.
 */
export function kennungVon(name: string, pid?: string): string {
  return pid ?? `name:${name}`
}

export type ConflictKind = 'absent' | 'double' | 'helperTask' | 'partner' | 'fsAbsent' | 'fsDouble'

export interface Conflict {
  kind: ConflictKind
  name: string // Anzeigename der Person
  /** partner: der Gesprächsführer, zu dem sie nicht passt. */
  zu?: string
  /**
   * Nur diesen Platz trifft der Konflikt — sein `task_key` (`platzKey`), beim
   * Paar der Platz des Partners. Ohne Angabe jeden Platz der Person in der
   * Zusammenkunft: Wer abwesend ist oder doppelt steht, fehlt überall.
   *
   * Der Platz, nicht sein Bereich: Wer an einem Abend in zwei Schülerteilen
   * Partner ist, passt vielleicht nur zu einem der beiden Gesprächsführer.
   */
  platz?: string
  /**
   * Wen es betrifft — Person-Id, sonst `name:<Anzeigename>` (`kennungVon`).
   *
   * Der Anzeigename allein reichte nicht: das Banner nennt den Konflikt, die
   * Zuteilung darunter wird danach markiert, und bei zwei Personen desselben
   * Namens leuchtete sonst auch die falsche auf — dieselbe Verwechslung wie
   * beim Zählen (`Belegung`).
   */
  kennung: string
  tab?: MeetingKey // betroffene Zusammenkunft (absent/double/helperTask)
  count?: number // double: Hilfsdienste in der Zusammenkunft
  // Treffpunkte haben keine Zusammenkunft, sondern einen eigenen Wochentag —
  // an ihm hängt, welche Treffpunkte der Konflikt trifft (`fsKonfliktVon`).
  wd?: number // fsAbsent/fsDouble: Wochentag (0=So … 6=Sa)
}

/**
 * Die belegten Plätze einer Zusammenkunft, nach Art getrennt — **ein**
 * Durchlauf über `allePlaetze` für alle Fragen der Konfliktprüfung.
 *
 * Ohne Lieder, ohne externe Slots (Gastredner/Kreisaufseher) und ohne die
 * Gruppen-Rotation — die sind keine zuteilbaren Personen.
 */
interface Belegungen {
  /** Programmpunkte beider Räume samt Ratgeber (mit Duplikaten). Wer im
   * Hauptsaal UND in der Zusätzlichen Klasse steht, ist zur selben Zeit an zwei
   * Orten — genau das soll die Prüfung finden. */
  programm: Belegung[]
  /** Hilfsdienste. */
  helper: Belegung[]
  /**
   * Belegte Kennungen **je Raum, zur Zeit der Klasse** — Hauptsaal,
   * Zusätzliche Klasse und der Ratgeber-Platz getrennt, für die Doppelungen
   * unter den Programmpunkten, die wirklich unmöglich sind. Zwei Punkte **im
   * selben** Raum sind es nicht (Vorsitz und Anfangsgebet) — deshalb reicht
   * eine einzige Menge nicht aus.
   *
   * Die Klasse läuft nur neben den Schülerteilen (S-38, Absatz 27). Vom
   * Hauptsaal zählt deshalb nur, wer dort zur selben Zeit gebraucht wird: wer
   * einen Schülerteil hat, und der Vorsitz, der durch sie führt. Wer danach
   * einen Vortrag hält, steht nicht zur selben Zeit in zwei Räumen.
   *
   * Der Ratgeber steht für sich, obwohl er in der Klasse sitzt: Er begleitet
   * **die ganze Reihe**, ist also die einzige Zuteilung, die jede andere im
   * selben Raum ausschließt. Ein Schüler seiner Klasse kann nicht zugleich
   * sein eigener Ratgeber sein.
   */
  haupt: Map<string, string>
  klasse: Map<string, string>
  ratgeber: Belegung | null
  /**
   * Wer in einem Punkt desselben Raums zweimal steht — Führer und Partner,
   * Leiter und Leser zugleich. Ausgenommen der Vorsitz mit dem Gebet.
   */
  zweimalImPunkt: Set<string>
}

function belegungen(meeting: Meeting, services: Service[], wer: IdVon): Belegungen {
  const out: Belegungen = {
    programm: [],
    helper: [],
    haupt: new Map(),
    klasse: new Map(),
    ratgeber: null,
    zweimalImPunkt: new Set(),
  }
  const imPunkt = new Map<string, Set<string>>()
  for (const platz of allePlaetze(meeting, services)) {
    const slot = platz.slot
    if (!slot?.name || isGuestRole(slot.rolle)) continue
    if (platz.art === 'helper') {
      if (!platz.svc.groups) out.helper.push(belegung(slot, wer))
      continue
    }
    const b = belegung(slot, wer)
    out.programm.push(b)
    if (platz.art === 'ratgeber') {
      out.ratgeber = b
      continue
    }
    // Der Vorsitz zählt im Punkt nicht mit: Er darf das Gebet desselben Punkts
    // sprechen („Lied · Gebet · Einleitende Worte").
    if (!istVorsitz(slot)) {
      const punkt = `${platz.si}|${platz.ii}|${platz.aux}`
      const schon = imPunkt.get(punkt) ?? new Set<string>()
      if (schon.has(b.kennung)) out.zweimalImPunkt.add(b.kennung)
      imPunkt.set(punkt, schon.add(b.kennung))
    }
    if (platz.aux) out.klasse.set(b.kennung, b.name)
    else if (istSchuelerteil(platz.item) || istVorsitz(slot)) out.haupt.set(b.kennung, b.name)
  }
  return out
}

/**
 * **Gesprächsführer und -partner, die nicht zueinander passen** — gleiches
 * Geschlecht oder derselbe Haushalt (`partnerGenderOk`). Die Auswahl bietet
 * ein solches Paar nicht an (`passtZumPaar`); stehen kann es trotzdem, aus
 * älteren Daten oder nachdem sich eine Person geändert hat. Je Punkt und Raum.
 */
function unpassendePaare(meeting: Meeting, persons: Person[]): Array<{ partner: ProgrammPlatz; fuehrer: SlotAssignment }> {
  const out: Array<{ partner: ProgrammPlatz; fuehrer: SlotAssignment }> = []
  for (const platz of programmPlaetze(meeting)) {
    const { slot, item, aux } = platz
    if (slot.bereichsKey !== 'schulungPartner' || !slot.name) continue
    const plaetze = slotsOf(item, aux)
    const fuehrer = plaetze.find((n) => n.bereichsKey === 'schulung')
    const partner = persons.find((p) => gehoertZu(slot, p))
    if (fuehrer?.name && partner && !passtZumPaar(plaetze, slot, persons)(partner)) out.push({ partner: platz, fuehrer })
  }
  return out
}

/**
 * Eine belegte Stelle mit ihrer **Kennung**: die Person-Id, wo auflösbar, sonst
 * ein Namensschlüssel. Gezählt wird über die Kennung, angezeigt der Name.
 *
 * Ohne diese Trennung zählte die Konfliktprüfung über den Anzeigenamen: zwei
 * Personen desselben Namens galten als eine und lösten füreinander „doppelt
 * eingeteilt" aus. Der Namensschlüssel trägt ein Präfix, damit er nie
 * versehentlich mit einer echten Id zusammenfällt.
 */
interface Belegung {
  kennung: string
  name: string
}
type IdVon = (z: Zuteilung | undefined) => string | undefined

function belegung(z: Zuteilung, wer: IdVon): Belegung {
  const name = z.name ?? ''
  return { kennung: wer(z) ?? `name:${name}`, name }
}

/**
 * Konflikte der Woche `wi`: Abwesende trotz Zuteilung und Mehrfach-Zuteilung in
 * einer Zusammenkunft. Reihenfolge: absent, double/helperTask.
 *
 * `tab` grenzt die Prüfung auf eine Zusammenkunft ein (das Planen zeigt Konflikte
 * je Reiter). Ohne `tab` werden beide Zusammenkünfte geprüft (Wochen-Gesamtzahl
 * fürs Dashboard).
 */
export function weekConflicts(
  weeks: Week[],
  wi: number,
  persons: Person[],
  services: Service[],
  tab?: MeetingKey,
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): Conflict[] {
  const week = weeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const werIst = idAufloeser(persons)
  const nachId = new Set(persons.map((p) => p.id))
  // Entfallene Zusammenkünfte fallen heraus: wer an einem Tag nicht
  // drankommt, ist dort weder doppelt eingeteilt noch abwesend-und-eingeteilt.
  // Ein Warnbanner über eine Zusammenkunft, die gar nicht stattfindet, wäre
  // Lärm — und verdeckt die echten Konflikte daneben.
  const tabs = (tab ? [tab] : MEETING_TABS).filter((tb) => !istAusgefallen(week, tb))
  const belegt = new Map(tabs.map((tb) => [tb, belegungen(week[tb], services, werIst)] as const))

  // absent: in dieser Woche abwesend, aber eingeteilt
  for (const [tb, { programm, helper }] of belegt) {
    const gesehen = new Set<string>()
    for (const b of [...programm, ...helper]) {
      if (gesehen.has(b.kennung)) continue
      gesehen.add(b.kennung)
      if (nachId.has(b.kennung) && istAbwesend(abwesend, b.kennung, wi, tb)) {
        conflicts.push({ kind: 'absent', name: b.name, kennung: b.kennung, tab: tb })
      }
    }
  }

  // helperTask / double: gleiche Person mehrfach in einer Zusammenkunft.
  // helperTask = Hilfsdienst UND Programmpunkt am selben Tag (die vom Nutzer
  // vorgegebene Regel — bei manueller Zuteilung nicht automatisch verhindert);
  // double = mehrere Hilfsdienste am selben Tag. Zwei Programmpunkte (z. B.
  // Vorsitz + Anfangsgebet) sind bewusst KEIN Konflikt.
  for (const [tb, { programm, helper, haupt, klasse, ratgeber, zweimalImPunkt }] of belegt) {
    // Gezählt wird über die Kennung, angezeigt der Name — zwei Personen
    // desselben Namens sind zwei Einträge, nicht einer mit doppelter Zahl.
    const namen = new Map<string, string>()
    const zaehle = (aus: Belegung[]): Map<string, number> => {
      const m = new Map<string, number>()
      for (const b of aus) {
        m.set(b.kennung, (m.get(b.kennung) ?? 0) + 1)
        namen.set(b.kennung, b.name)
      }
      return m
    }
    const partCounts = zaehle(programm)
    const helperCounts = zaehle(helper)
    /*
     * **Zwei Räume zur selben Zeit.**
     *
     * `programm` zählt Hauptsaal und Klasse zusammen — genau der Fall, den die
     * Prüfung finden soll. Nach dieser Zahl allein fände sie ihn nicht: Zwei
     * Programmpunkte sind bewusst kein Konflikt (Vorsitz und Anfangsgebet), und
     * damit fiele auch der Mensch durch, der zugleich im Hauptsaal und in der
     * Zusätzlichen Klasse steht.
     *
     * Die Automatik verhindert es (`autoassign.klasse.test.ts`: „Niemand steht
     * zur selben Zeit in zwei Räumen"); von Hand bleibt es möglich.
     *
     * Gemeldet als `double`: Der Satz dazu — „{name} ist {n}× in einer
     * Zusammenkunft" — trifft es, und ein eigener Schlüssel hieße 34
     * Übersetzungen für eine Aussage, die schon dasteht.
     */
    /**
     * Zwei Plätze, die einander ausschließen?
     *
     *  - **Beide Räume zur Zeit der Klasse**: zur selben Zeit an zwei Orten
     *    (`haupt` zählt nur, wer im Hauptsaal dann gebraucht wird).
     *  - **Ratgeber und ein Programmpunkt zur Zeit der Klasse**: Er begleitet
     *    die ganze Reihe seiner Klasse. Im Hauptsaal wäre er dann gar nicht
     *    da; in seiner eigenen Klasse wäre er sein eigener Ratgeber. Die
     *    Automatik verhindert beides (`used` kennt den Ratgeber-Platz),
     *    von Hand bleibt es möglich — und der Ratgeber steht in der Ansicht
     *    neben dem Programm, nicht darin.
     *  - **Zweimal im selben Punkt**: Führer und Partner, Leiter und Leser
     *    zugleich ist niemand.
     */
    const unmoeglich = (kennung: string): boolean => {
      if (zweimalImPunkt.has(kennung)) return true
      if (klasse.has(kennung) && haupt.has(kennung)) return true
      if (ratgeber?.kennung !== kennung) return false
      return haupt.has(kennung) || klasse.has(kennung)
    }
    for (const kennung of new Set([...partCounts.keys(), ...helperCounts.keys()])) {
      const pc = partCounts.get(kennung) ?? 0
      const hc = helperCounts.get(kennung) ?? 0
      const name = namen.get(kennung) ?? ''
      /*
       * Die beiden Meldungen schließen einander **nicht** aus, und das ist der
       * Punkt: Sie sagen Verschiedenes. „Ist n× in einer Zusammenkunft" nennt
       * die Menge, „Aufgabe und Hilfsdienst zugleich" die Art — der Planer
       * löst beides unterschiedlich auf.
       *
       * Wer im Hauptsaal stand, in der Klasse stand und zusätzlich als Ordner
       * eingetragen war, bekommt deshalb beide zu sehen.
       */
      const doppelt = unmoeglich(kennung)
      if (doppelt) conflicts.push({ kind: 'double', name, kennung, tab: tb, count: pc + hc })
      if (pc >= 1 && hc >= 1) conflicts.push({ kind: 'helperTask', name, kennung, tab: tb })
      // Zwei Hilfsdienste sind ihre eigene Doppelung — es sei denn, die Zeile
      // darüber hat sie schon mitgezählt. Kein `else` zur Aufgabe: Mit ihr fiele
      // die Doppelung sonst weg.
      if (!doppelt && hc >= 2) conflicts.push({ kind: 'double', name, kennung, tab: tb, count: hc })
    }
  }

  // partner: Gesprächsführer und -partner, die nicht zueinander passen.
  for (const tb of tabs) {
    for (const { partner, fuehrer } of unpassendePaare(week[tb], persons)) {
      const b = belegung(partner.slot, werIst)
      const platz = platzKey({ art: 'programm', ...partner }, week.start, tb)
      conflicts.push({ kind: 'partner', name: b.name, kennung: b.kennung, tab: tb, zu: fuehrer.name, platz })
    }
  }

  return conflicts
}
