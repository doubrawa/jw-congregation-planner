/**
 * Kleine, screenübergreifend genutzte Helfer rund ums Datenmodell.
 * Regeln stammen aus der Prototyp-Logik (docs/design-handoff).
 */

import { BRUDER_BEREICHE, QUALIFICATION_ORDER, ROLE_LABEL, WT_ROLE_ORDER } from './constants'
import type { Group, Meeting, Person, ProgramItem, QualificationKey, Qualifications, Service, SongItem, Week } from './types'

export function isSong(item: ProgramItem): item is SongItem {
  return 'song' in item
}

/**
 * Zerlegt einen zusammengesetzten ERÖFFNUNG/ABSCHLUSS-Titel (` · `-getrennt, z. B.
 * „Lied 138 · Gebet" oder „Schlussworte · Lied 76 · Gebet") in den Lied-Teil und
 * den Rest. Das Lied ist das einzige Atom mit einer Nummer — Gebet/Einleitende
 * Worte/Schlussworte tragen keine (sprachunabhängig, funktioniert auch für
 * übersetzte Titel). Ohne Nummern-Atom: `song` null, `rest` = Titel unverändert.
 * Nur auf ERÖFFNUNG/ABSCHLUSS anwenden (dort ist das Nummern-Atom eindeutig das
 * Lied; bei anderen Punkten könnten Schriftstellen Ziffern enthalten).
 */
export function splitOpeningSong(title: string): { song: string | null; rest: string } {
  const atoms = title.split(' · ')
  const idx = atoms.findIndex((a) => /\d/.test(a))
  if (idx < 0) return { song: null, rest: title }
  return { song: atoms[idx].trim(), rest: atoms.filter((_, i) => i !== idx).join(' · ') }
}

/**
 * Gruppen-Id, deren Aufseher (ov) oder Gehilfe (as) die Person ist — sonst null.
 * Grundlage der Treffpunkt-Planungsrechte für Gruppenaufseher.
 */
export function overseerGroup(groups: readonly Group[], personId: string | null): string | null {
  if (!personId) return null
  return groups.find((g) => g.ov === personId || g.as === personId)?.id ?? null
}

/** Die Vorsitz-Bereiche (fest + Alt-Schlüssel), die je Zusammenkunft umzuschlüsseln sind. */
const CHAIR_KEYS = new Set(['vorsitz', 'vorsitzMid', 'vorsitzWe'])

/**
 * Setzt den Bereichs-Schlüssel des Vorsitz-Slots je nach Zusammenkunft:
 * unter der Woche → `vorsitzMid`, Wochenende → `vorsitzWe`. So verlangt jeder
 * Slot genau die passende Qualifikation. Idempotent und referenz-erhaltend
 * (unveränderte Wochen behalten ihre Referenz). Deckt Alt-Daten mit dem
 * früheren gemeinsamen `vorsitz` beim Laden ab und normalisiert Demo/Vorlagen.
 */
export function normalizeChairKeys(weeks: Week[]): Week[] {
  let anyChanged = false
  const next = weeks.map((week) => {
    const mid = chairMeeting(week.mid, 'vorsitzMid')
    const we = chairMeeting(week.we, 'vorsitzWe')
    if (mid === week.mid && we === week.we) return week
    anyChanged = true
    return { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

function chairMeeting(meeting: Meeting, key: 'vorsitzMid' | 'vorsitzWe'): Meeting {
  let changed = false
  const sections = meeting.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (isSong(item)) return item
      let itemChanged = false
      const names = item.names.map((slot) => {
        const isChair =
          slot.rolle === 'Vorsitz' || (slot.bereichsKey != null && CHAIR_KEYS.has(slot.bereichsKey))
        if (isChair && slot.bereichsKey !== key) {
          itemChanged = true
          return { ...slot, bereichsKey: key }
        }
        return slot
      })
      if (!itemChanged) return item
      changed = true
      return { ...item, names }
    }),
  }))
  return changed ? { ...meeting, sections } : meeting
}

/** Voller Name „Vorname Nachname" (getrimmt); leer, wenn beide Felder leer sind. */
export function fullName(p: Person): string {
  return `${p.fn} ${p.ln}`.trim()
}

/** Listen-/Kopf-Label: voller Name, sonst Em-Dash-Platzhalter für Namenlose. */
export function personLabel(p: Person): string {
  return fullName(p) || '—'
}

/**
 * Frische Qualifikations-Map mit allen festen Programm-Bereichen auf `false` —
 * einzige Quelle der Standard-Bereiche (neue Person, normalizePriv). Dynamische
 * Hilfsdienst-Bereiche (`svc:<key>`) kommen erst durch Zuweisung hinzu.
 */
export function emptyQualifications(): Qualifications {
  const priv = {} as Qualifications
  for (const key of QUALIFICATION_ORDER) priv[key] = false
  return priv
}

/**
 * Anzeigename: voller Name ("Simon Krüger"); `dn` überschreibt ihn nur noch
 * bei echten Duplikaten (z. B. "Josef Mayer 1"). Zuteilungen in den Wochen
 * hängen an diesem String — Altbestände mit der früheren Kurzform
 * "V. Nachname" werden beim Laden migriert (migrateAssignmentNames in
 * lib/data.ts).
 */
export function displayName(p: Person): string {
  return p.dn || `${p.fn} ${p.ln}`.trim()
}

/** Frühere automatische Kurzform — nur noch für die Lade-Migration. */
export function shortDisplayName(p: Person): string {
  return `${(p.fn[0] ?? '') + '.'} ${p.ln}`.trim()
}

/** Initialen für Avatare: "SK"; leerer Datensatz → "–". */
export function initials(p: Person): string {
  return ((p.fn[0] ?? '') + (p.ln[0] ?? '')).toUpperCase() || '–'
}

/** Alphabetische Personen-Sortierung: Nachname, dann Vorname (deutsch). */
export function personCompare(a: Person, b: Person): number {
  return (
    a.ln.localeCompare(b.ln, 'de', { sensitivity: 'base' }) ||
    a.fn.localeCompare(b.fn, 'de', { sensitivity: 'base' })
  )
}

/**
 * Anzeigenamen, die sich zwei oder mehr Personen teilen. Solche Dubletten sind
 * ein Datenproblem für den Planer: wo ein Slot keine Person-Id trägt
 * (Hilfsdienste, externe Beteiligte, Altdaten) ordnen deriveMyTasks/
 * derivePendingNames/Konfliktprüfung über den Anzeigenamen zu — Namensgleiche
 * teilen sich dann fälschlich Aufgaben. Abhilfe: je Person einen eindeutigen
 * Anzeigenamen (dn) vergeben. Liefert je betroffenem Namen die Personenzahl,
 * alphabetisch sortiert.
 */
export function duplicateDisplayNames(persons: Person[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const p of persons) {
    const name = displayName(p)
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/**
 * Feste Rollen, die mehr als eine Person trägt.
 *
 * „Fester Wachtturm-Studium-Leiter; der Vertreter springt bei Abwesenheit ein"
 * — beides ist der Sache nach **eine** Person. Zwei gesetzte Schalter blieben
 * bisher folgenlos und unbemerkt (F7): die Auto-Zuteilung greift sich dann
 * irgendeinen, und der Planer sieht nirgends, dass die Rolle doppelt vergeben
 * ist. Liefert je betroffener Rolle die Personenzahl.
 */
export function doppelteFesteRollen(persons: Person[]): Array<{ key: QualificationKey; count: number }> {
  return WT_ROLE_ORDER.map((key) => ({
    key,
    count: persons.filter((p) => p.priv[key]).length,
  })).filter(({ count }) => count >= 2)
}

/** Rollenlabel, für Frauen in weiblicher Form ("Verkündigerin"). */
export function roleLabel(p: Person): string {
  const label = ROLE_LABEL[p.role]
  return p.female && p.role === 'verkuendiger' ? `${label}in` : label
}

/**
 * Bereichs-Key eines Hilfsdienstes. Jeder Dienst hat genau einen Bereich, der
 * aus seinem Key abgeleitet wird — so entsteht mit jedem neuen Dienst
 * automatisch ein Schalter im Personen-Detail. Der Präfix hält die dynamischen
 * Dienst-Bereiche von den festen Programm-Bereichen getrennt.
 */
export function serviceQualKey(serviceKey: string): string {
  return `svc:${serviceKey}`
}

/**
 * Qualifikationsprüfung; unbekannte Bereichs-Keys gelten als nicht erfüllt.
 * Bewusst KEINE Geschlechts-Sperre: welche Bereiche eine Schwester übernimmt
 * (z. B. wenn Brüder fehlen), entscheiden allein die Schalter im
 * Personen-Detail.
 */
export function isQualified(p: Person, priv: string): boolean {
  // Ein Gesprächsführer (schulung) darf auch als Partner einspringen — daher
  // deckt der Partner-Slot beide Bereiche ab.
  if (priv === 'schulungPartner') return Boolean(p.priv.schulungPartner || p.priv.schulung)
  return Boolean(p.priv[priv])
}

/**
 * Ist dieser Bereich bei dieser Person auffällig — also einer, der fachlich
 * Brüdern vorbehalten ist, gesetzt bei einer Schwester?
 *
 * Nur ein Hinweis, keine Sperre: `isQualified` prüft weiterhin allein die
 * Schalter (siehe dort). Der Hinweis existiert, weil ein versehentlich
 * gesetzter Schalter sonst stumm bleibt — die Auto-Zuteilung nimmt ihn ernst
 * und teilt zum Gebet oder Vorsitz ein, ohne dass irgendwo etwas aufgefallen
 * wäre (F4).
 */
export function istBruderBereichBeiSchwester(person: Person, priv: string): boolean {
  return Boolean(person.female) && BRUDER_BEREICHE.has(priv as QualificationKey)
}

/** Die gesetzten Brüder-Bereiche einer Schwester — leer bei Brüdern. */
export function bruderBereicheEinerSchwester(person: Person): QualificationKey[] {
  if (!person.female) return []
  return [...QUALIFICATION_ORDER, ...WT_ROLE_ORDER].filter(
    (key) => BRUDER_BEREICHE.has(key) && person.priv[key],
  )
}

/**
 * Darf `cand` als Gesprächspartner zu `lead` eingeteilt werden? Die Anweisungen
 * verlangen dasselbe Geschlecht **oder** Familienangehörige — beides prüft
 * diese Funktion (die Haushalte stehen in `Person.fam`). Die Regel ist hier
 * gekapselt, damit sie nur an EINER Stelle steht. Ohne zugeteilten Führer
 * (leer) keine Einschränkung.
 */
export function partnerGenderOk(lead: Person | undefined, cand: Person): boolean {
  if (!lead) return true
  if (Boolean(lead.female) === Boolean(cand.female)) return true
  // Familienangehörige (gleicher Haushalt) dürfen auch geschlechtsübergreifend
  // Partner sein (z. B. Ehepaar, Vater/Tochter) — jw.org-Anweisung.
  return Boolean(lead.fam) && lead.fam === cand.fam
}

/** Andere Personen im selben Haushalt (Familienangehörige). */
export function familyMembers(persons: Person[], person: Person): Person[] {
  if (!person.fam) return []
  return persons.filter((p) => p.id !== person.id && p.fam === person.fam)
}

/**
 * `memberId` in den Haushalt von `id` aufnehmen: beide teilen sich danach
 * dieselbe Familien-Id (bestehende bevorzugt, sonst neu). Symmetrisch — die
 * Familienzugehörigkeit ist damit von beiden Seiten sichtbar.
 */
export function linkFamily(persons: Person[], id: string, memberId: string): Person[] {
  if (id === memberId) return persons
  const a = persons.find((p) => p.id === id)
  const b = persons.find((p) => p.id === memberId)
  if (!a || !b) return persons
  const hid = a.fam || b.fam || crypto.randomUUID()
  return persons.map((p) => (p.id === id || p.id === memberId ? { ...p, fam: hid } : p))
}

/** `memberId` aus dem Haushalt lösen; bleibt nur eine Person übrig, wird auch die gelöst. */
export function unlinkFamily(persons: Person[], memberId: string): Person[] {
  const m = persons.find((p) => p.id === memberId)
  if (!m?.fam) return persons
  const hid = m.fam
  const next = persons.map((p) => (p.id === memberId ? { ...p, fam: null } : p))
  const rest = next.filter((p) => p.fam === hid)
  return rest.length <= 1 ? next.map((p) => (p.fam === hid ? { ...p, fam: null } : p)) : next
}

/** Nur-Verkündiger (kein Ältester/Dienstamtgehilfe) — Pool für Gesprächsteile. */
export function isPlainPublisher(p: Person): boolean {
  return p.role === 'verkuendiger'
}

/**
 * Hat diese Zusammenkunft eine Zusätzliche Klasse?
 *
 * Erkennungsmerkmal ist der Ratgeber-Platz: „Für jede zusätzliche Klasse muss
 * ein befähigter Ratgeber zur Verfügung stehen" (S-38, Absatz 26) — ohne
 * Ratgeber keine Klasse. Damit steht die Antwort in den Wochendaten selbst,
 * und jeder Leser (Planen, Programm, Ausdruck, Zählung, Auto-Zuteilung,
 * Erinnerungen) kommt zum selben Ergebnis.
 *
 * Der Versammlungsschalter `state.auxClass` ist die Eingabe, nicht die
 * Wahrheit: er schreibt diese Marke über `syncAuxSlots` in die Wochen. Wer ihn
 * daneben selbst auswertet, bekommt eine zweite Antwort — genau daran hing der
 * Fehler, dass das Programm nach dem Ausschalten weiter beide Räume zeigte.
 *
 * Steht hier und nicht in aux-class.ts, weil `partWorkload` sie braucht und
 * helpers.ts jenes Modul nicht importieren darf (Zyklus); aux-class.ts
 * exportiert sie weiter.
 */
export function hatAuxKlasse(meeting: Meeting): boolean {
  return meeting.auxRatgeber != null
}

/** Zeichen, das noch zu einem Namen gehört (Buchstabe oder Ziffer, jede Schrift). */
const WORTZEICHEN = /[\p{L}\p{N}]/u

/**
 * Steht `name` als eigenständiger Name im Rollentext („mit A. Hoffmann")?
 *
 * Bewusst kein blankes `rolle.includes(name)`: „Anna" steckt auch in „mit
 * Annalena Berg", und dann zählte Anna eine Aufgabe mit, die einer anderen
 * gehört — bei der Auto-Zuteilung genügt eine solche Phantom-Last, um jemanden
 * dauerhaft hinten anzustellen. Geprüft wird deshalb auf Wortgrenzen; ein
 * regulärer Ausdruck verbietet sich, weil Namen Sonderzeichen enthalten dürfen
 * („O'Brien", „Müller-Lüdenscheidt") und dann als Muster verstanden würden.
 */
export function rolleNennt(rolle: string | undefined, name: string): boolean {
  if (!rolle || !name) return false
  for (let von = rolle.indexOf(name); von !== -1; von = rolle.indexOf(name, von + 1)) {
    const davor = rolle[von - 1]
    const danach = rolle[von + name.length]
    if (!(davor && WORTZEICHEN.test(davor)) && !(danach && WORTZEICHEN.test(danach))) return true
  }
  return false
}

/** Was eine Zuteilung über ihren Inhaber verrät — Slot, Ratgeber, Hilfsdienst. */
export interface Zuteilung {
  name?: string
  pid?: string
}

/**
 * Gehört diese Zuteilung dieser Person?
 *
 * **Die einzige Stelle, an der das entschieden wird.** Vorher verglich jede
 * Zähl-, Konflikt- und Anzeigefunktion für sich selbst — die einen über die
 * Person-Id, die anderen über den Anzeigenamen. Zwei Personen desselben Namens
 * teilten sich dadurch eine Auslastung, sahen gegenseitig ihre Aufgaben und
 * lösten füreinander Konflikte aus.
 *
 * Rangfolge: die **Id** entscheidet, sobald die Zuteilung eine trägt. Nur
 * Altdaten (vor `pid` gespeichert), externe Redner und Gruppen-Rotationen haben
 * keine — dort bleibt der Anzeigename der einzige Anhalt.
 *
 * Wichtig ist die Richtung: hat die Zuteilung eine Id, wird **nicht** auf den
 * Namen zurückgefallen. Sonst zählte eine Zuteilung, die ausdrücklich Person A
 * meint, auch für die gleichnamige Person B mit.
 */
export function gehoertZu(zuteilung: Zuteilung | undefined, person: Person): boolean {
  if (!zuteilung?.name) return false
  return zuteilung.pid ? zuteilung.pid === person.id : zuteilung.name === displayName(person)
}

/**
 * Auflöser Zuteilung → Person-Id.
 *
 * Die Strichlisten der Auto-Zuteilung zählen je Person, nicht je Name. Damit
 * eine Person nicht unter zwei Schlüsseln auftaucht — einmal als Id aus neuen
 * Zuteilungen, einmal als Name aus Altdaten —, werden beide Formen hier auf
 * **eine** Id gebracht.
 *
 * Wen keine Person trägt (externer Redner, Gruppen-Rotation, gelöschte
 * Person), bekommt `undefined` und fällt aus der Rechnung — richtig so: eine
 * Auslastung hat nur, wer zugeteilt werden kann.
 *
 * Bei doppelten Anzeigenamen und Altdaten ohne Id bleibt eine Zweideutigkeit,
 * die keine Auflösung beheben kann; deshalb warnt die App vor Dubletten
 * (`duplicateDisplayNames`).
 */
export function idAufloeser(persons: Person[]): (z: Zuteilung | undefined) => string | undefined {
  const nachId = new Set(persons.map((p) => p.id))
  const nachName = new Map(persons.map((p) => [displayName(p), p.id]))
  return (z) => {
    if (!z?.name) return undefined
    if (z.pid) return nachId.has(z.pid) ? z.pid : undefined
    return nachName.get(z.name)
  }
}

/**
 * Auslastung nur aus **Programmpunkten** (Aufgaben) über die gegebenen Wochen.
 * Zählt wie der Prototyp auch Begleiter-Erwähnungen im Rollenlabel
 * ("mit A. Hoffmann") — wer begleitet, hat ebenfalls eine Aufgabe.
 *
 * Die Begleiter-Erwähnung ist die eine Stelle, die zwangsläufig über den Namen
 * geht: im Rollentext steht ein Name, keine Id. Namensgleiche sind dort nicht
 * unterscheidbar — deshalb warnt die App vor doppelten Anzeigenamen
 * (`duplicateDisplayNames`).
 *
 * Beide Räume zählen: ein Schülerteil in der Zusätzlichen Klasse (`item.aux`)
 * ist dieselbe Aufgabe wie im Hauptsaal, und der Ratgeber der Klasse ist
 * ebenfalls eingeteilt. Wurden sie nicht mitgezählt, galt genau die Hälfte
 * aller Schulungsaufgaben als „frei" — wer in der Klasse dran war, stand in der
 * Strichliste weiter bei null und wurde gleich wieder gewählt.
 *
 * Beides aber nur, **solange die Klasse besteht**: beim Abschalten bleiben die
 * Namen absichtlich stehen, damit ein Wiedereinschalten sie wiederfindet.
 *
 * Die Begleiter-Erwähnung wird nur im Hauptsaal gezählt: `angleichen` kopiert
 * die Rollenbeschriftung in die Klasse ("Regeln folgen immer dem Hauptsaal"),
 * sie dort erneut zu zählen verdoppelte dieselbe Begleitung.
 */
export function partWorkload(weeks: Week[], person: Person): number {
  const name = displayName(person)
  let count = 0
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      const mitKlasse = hatAuxKlasse(meeting)
      if (mitKlasse && gehoertZu(meeting.auxRatgeber, person)) count++
      for (const section of meeting.sections) {
        for (const item of section.items) {
          if (isSong(item)) continue
          for (const slot of item.names) {
            if (gehoertZu(slot, person)) count++
            if (rolleNennt(slot.rolle, name)) count++
          }
          // Nur zählen, solange die Klasse besteht: beim Abschalten bleiben die
          // Namen bewusst stehen (damit ein Wiedereinschalten sie hat). Ohne
          // diese Prüfung schleppte die Auto-Zuteilung eine Last mit, die es
          // gar nicht mehr gibt, und bevorzugte dauerhaft die Falschen.
          if (mitKlasse) for (const slot of item.aux ?? []) if (gehoertZu(slot, person)) count++
        }
      }
    }
  }
  return count
}

/**
 * Auslastung nur aus **Hilfsdiensten** über die gegebenen Wochen.
 *
 * Gezählt wird nur bis zur eingestellten Platzzahl (`svc.count`) — genau wie
 * `deriveMyTasks` Aufgaben ableitet. Reduziert der Planer die Plätze, bleiben
 * die Namen dahinter in den Wochendaten stehen; sie verschwanden dann aus
 * „Meine Aufgaben", zählten hier aber weiter als Last. Ohne `services` (nicht
 * jeder Aufrufer hat sie) zählt wie bisher alles.
 */
export function helperWorkload(weeks: Week[], person: Person, services?: Service[]): number {
  const grenze = services ? new Map(services.map((s) => [s.key, s.count])) : null
  let count = 0
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      for (const [key, assigned] of Object.entries(meeting.helpers)) {
        const bis = grenze ? (grenze.get(key) ?? 0) : assigned.length
        for (let pos = 0; pos < Math.min(bis, assigned.length); pos++) {
          if (gehoertZu(assigned[pos], person)) count++
        }
      }
    }
  }
  return count
}

/** Gesamt-Auslastung (Programmpunkte + Hilfsdienste) über die gegebenen Wochen. */
export function workloadOf(weeks: Week[], person: Person, services?: Service[]): number {
  return partWorkload(weeks, person) + helperWorkload(weeks, person, services)
}

/** Belegungsart einer Person in EINER Woche (für die Mini-Quadrate). */
export type WeekLoad = 'void' | 'none' | 'task' | 'helper'

/**
 * Radius des Auslastungs-Fensters: so viele Wochen vor und nach der geplanten
 * zählen mit.
 *
 * Einzige Quelle dieser Zahl — für die **Anzeige** (Mini-Quadrate und „… in 5
 * Wochen" im Zuteilungs-Sheet) und für die **Entscheidung** der automatischen
 * Zuteilung. Das waren lange zwei verschiedene Zahlen: gezeigt wurden 5 Wochen,
 * sortiert wurde nach 7. Der Planer las also unter dem Namen eine Zahl, nach der
 * gar nicht sortiert worden war. Gemessen macht die Weite keinen Unterschied
 * mehr (30 Schwestern über ein Jahr: 10–11 Aufgaben bei ±2 wie bei ±3, ein
 * 4er-Ton-Pool jeweils exakt 26/26/26/26), seit die Wartezeit die Fairness
 * trägt — also gilt die Zahl, die man auch sieht.
 *
 * Sie stand früher dreifach da: als Literal beim Ausschneiden der Wochen, als
 * Literal beim Aufruf und ausgeschrieben in 34 Übersetzungen („… in 5 Wochen").
 * Beim letzten Wechsel von 4 auf 5 blieben drei Sprachen bei der alten Zahl
 * stehen; deshalb wird sie in den Text eingesetzt statt hineingeschrieben.
 */
export const LOAD_RADIUS = 2

/** Wie viele Wochen das Auslastungs-Fenster umfasst (aktuelle + beide Seiten). */
export const LOAD_WEEKS = LOAD_RADIUS * 2 + 1

const WOCHE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Abstand zweier Wochen in **Wochen** — nicht in Einträgen.
 *
 * `LOAD_RADIUS = 2` hieß bisher „±2 Einträge". Das ist dasselbe, solange die
 * Wochen lückenlos aufeinanderfolgen. Fehlt eine (Kongress, Urlaub, eine
 * Woche, die nie importiert wurde), rechnet die Fairness-Logik über einen
 * anderen Zeitraum als den, den das Sheet daneben behauptet („2 Aufgaben in
 * 5 Wochen").
 *
 * Grundlage ist `week.start`, das ISO-Datum aus dem jw.org-Import. Fehlt es
 * bei einer der beiden — Demo-Daten, Platzhalter, von Hand angelegte Wochen —,
 * bleibt es beim Indexabstand: die alte Näherung ist besser als gar keine
 * Ordnung.
 */
export function wochenAbstand(a: Week | undefined, b: Week | undefined, ia: number, ib: number): number {
  const ta = a?.start ? Date.parse(a.start) : NaN
  const tb = b?.start ? Date.parse(b.start) : NaN
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Math.abs(ia - ib)
  return Math.round(Math.abs(ta - tb) / WOCHE_MS)
}

/**
 * Die Woche, die `versatz` Wochen von `weeks[wi]` entfernt liegt — nach Datum,
 * nicht nach Index. Ohne Datum (Demo, Platzhalter) der schlichte Nachbar.
 */
function wocheBeiVersatz(weeks: Week[], wi: number, versatz: number): Week | undefined {
  const hier = weeks[wi]
  if (!hier?.start) return weeks[wi + versatz]
  const ziel = new Date(Date.parse(hier.start) + versatz * WOCHE_MS).toISOString().slice(0, 10)
  return weeks.find((w) => w?.start === ziel)
}

/**
 * Belegung je Woche im ±`radius`-Fenster um `wi` (Standard LOAD_RADIUS).
 * `void` = keine solche Woche geladen, `none` = frei, `task` = Programmpunkt
 * (Aufgabe), `helper` = nur Hilfsdienst (Aufgabe hat Vorrang, falls beides in
 * derselben Woche).
 *
 * `services` gehört hierher, obwohl die Quadrate nur eine Farbe zeigen: die
 * Zahl daneben („2 Aufgaben in 5 Wochen") kommt aus `workloadOf` und zählt
 * Hilfsdienste nur bis `svc.count`. Ohne dieselbe Grenze zeigte dieselbe Zeile
 * „frei" und daneben ein belegtes Quadrat — die Platzzahl war reduziert, der
 * Name stand aber noch dahinter in den Wochendaten.
 */
export function loadWindow(
  weeks: Week[],
  person: Person,
  wi: number,
  services?: Service[],
  radius = LOAD_RADIUS,
): WeekLoad[] {
  const out: WeekLoad[] = []
  // Nach Datum, nicht nach Index (T36): fehlt eine Woche, zeigen die Quadrate
  // sonst eine, die drei Wochen zurückliegt, als „vor zwei Wochen".
  for (let versatz = -radius; versatz <= radius; versatz++) {
    const week = wocheBeiVersatz(weeks, wi, versatz)
    if (!week) out.push('void')
    else if (partWorkload([week], person) > 0) out.push('task')
    else if (helperWorkload([week], person, services) > 0) out.push('helper')
    else out.push('none')
  }
  return out
}

/**
 * Kleiner, stabiler String-Hash für faire, deterministische Tie-Breaks.
 *
 * Die Nachmischung (Avalanche) ist entscheidend, nicht Zierrat: `h*31 + zeichen`
 * allein schreibt die zuletzt angehängten Zeichen nur in die niedrigsten Stellen.
 * Der Schlüssel „Name|Woche|Zusammenkunft" ergab damit Werte, die sich von Woche
 * zu Woche um 0,02 % des Wertebereichs unterschieden, während der Name die hohen
 * Bits bestimmte — die Reihenfolge bei Gleichstand war also in JEDER Woche
 * dieselbe feste Rangliste nach Namen. Wer darin hinten stand, kam nie dran,
 * solange irgendjemand anders dieselbe (meist: null) Last hatte. Der Mixer sorgt
 * dafür, dass jedes Eingabe-Bit alle Ausgabe-Bits erreicht, die Reihenfolge also
 * pro Woche wirklich wechselt.
 *
 * Steht hier und nicht in `planning.ts`, weil die Treffpunkt-Zuteilung
 * (`fs.ts`) dieselbe Fairness braucht und lange eine eigene, ungemischte Kopie
 * mitschleppte — also genau den Fehler, den dieser Kommentar beschreibt.
 */
export function tieHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}
