/**
 * Kleine, screenübergreifend genutzte Helfer rund ums Datenmodell.
 * Regeln stammen aus der Prototyp-Logik (docs/design-handoff).
 */

import { BRUDER_BEREICHE, QUALIFICATION_ORDER, WT_ROLE_ORDER } from './constants'
import type { Abweichung, Group, Meeting, MeetingKey,
  MeetingTab, Person, ProgramItem, QualificationKey, Qualifications, Service, SongItem, Week } from './types'

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
  const treffer = idx < 0 ? undefined : atoms[idx]
  if (treffer === undefined) return { song: null, rest: title }
  return { song: treffer.trim(), rest: atoms.filter((_, i) => i !== idx).join(' · ') }
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

/**
 * Kein Ältester/Dienstamtgehilfe — Pool für Gesprächsteile.
 *
 * Bewusst negativ formuliert: `verkuendiger` und `keine` gehören beide dazu
 * (die Rolle `keine` gerade deshalb, weil sie für Schüler ohne
 * Verkündiger-Status gedacht ist), und eine künftige Rolle fällt nicht
 * stillschweigend aus dem Pool.
 */
export function isPlainPublisher(p: Person): boolean {
  return p.role !== 'aeltester' && p.role !== 'dienstamtgehilfe'
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

/**
 * Neue stabile Kennung für einen Programmpunkt (`PartItem.iid`, T37).
 *
 * Kurz und ohne `|`, weil der Aufgaben-Schlüssel daran zerlegt wird.
 * `crypto.randomUUID` gäbe es auch, wäre aber 36 Zeichen lang für eine Kennung,
 * die nur innerhalb **einer** Zusammenkunft eindeutig sein muss — Woche und
 * Zusammenkunft stehen im Schlüssel ohnehin davor.
 */
export function neueItemId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/* ---- Sonderwochen: wenn eine Zusammenkunft von der Regel abweicht (T30) ---- */

/**
 * Die beiden Zusammenkünfte einer Woche, in fester Reihenfolge.
 *
 * Bis hierher stand vielerorts `[week.mid, week.we]` — eine Liste von
 * Zusammenkünften ohne ihre Kennung. Wer wissen will, ob eine davon entfällt,
 * braucht aber die Kennung. Deshalb wird jetzt über die Kennungen gelaufen und
 * die Zusammenkunft daraus geholt.
 */
export const MEETING_TABS: readonly MeetingKey[] = ['mid', 'we']

/**
 * Abweichung dieser einen Zusammenkunft, falls es eine gibt.
 *
 * **`mem`/`memCancel` gehören ausdrücklich NICHT hierher.** Sie sehen aus wie
 * ein Ausfall, sind aber eine *Ersetzung*: der Tab der betroffenen
 * Zusammenkunft zeigt dann das Gedächtnismahl, und das hat ein eigenes
 * Programm mit eigenen Zuteilungen — Vortrag, Gebete, Symbole herumreichen.
 * Wer sie als Ausfall behandelt, streicht genau diese Aufgaben aus der
 * Auslastung, aus „Meine Aufgaben" und aus den Erinnerungen. Der Abend findet
 * statt; nur der reguläre Ablauf tut es nicht.
 *
 * `cancelled` meint deshalb das Engere: **es kommt niemand zusammen**
 * (Kongresswoche, abgesagte Zusammenkunft).
 */
export function abweichung(week: Week | undefined, tab: MeetingKey): Abweichung | undefined {
  return week?.dev?.[tab]
}

/**
 * View-Tab auf eine Zusammenkunft eingrenzen.
 *
 * Zwei der vier Tabs sind keine: „Treffpunkte" ('fs', eigene Datenquelle) und
 * „Bearbeiten" ('edit', die Wochen-Ansicht aus T64). Beide fallen auf die
 * Zusammenkunft unter der Woche zurück — die Meeting-Aktionen werden dort ohnehin
 * nie ausgelöst, aber der Rückfall muss irgendwo stehen.
 *
 * Diese eine Stelle löst drei Abschriften ab (reducer, persist, Bausteine). Sie
 * waren alle als `tab === 'fs' ? 'mid' : tab` geschrieben — ein Muster, das beim
 * vierten Tab still falsch geworden wäre, hätte `MeetingTab` es nicht erzwungen.
 */
export function mtab(tab: MeetingTab): MeetingKey {
  return tab === 'mid' || tab === 'we' ? tab : 'mid'
}

/**
 * Entfällt diese Zusammenkunft in dieser Woche — findet also gar nichts statt?
 *
 * Eine ausgefallene Zusammenkunft trägt **nirgends** etwas bei: keine offenen
 * Plätze, keine Aufgaben, keine Erinnerungen, keine Auslastung, keine
 * Konflikte. Die Zuteilungen bleiben trotzdem stehen — wird der Ausfall
 * zurückgenommen, ist die Planung wieder da. Verwaist ist dabei nichts: sie
 * zählt nur so lange nicht, wie die Zusammenkunft nicht stattfindet.
 *
 * Nicht zu verwechseln mit der Gedächtnismahl-Woche: dort wird der reguläre
 * Ablauf **ersetzt**, nicht gestrichen (siehe `abweichung`).
 */
export function istAusgefallen(week: Week | undefined, tab: MeetingKey): boolean {
  return abweichung(week, tab)?.cancelled === true
}

/** Grund der Abweichung, in den Worten des Planers ("" = keiner genannt). */
export function abweichungsGrund(week: Week | undefined, tab: MeetingKey): string {
  return abweichung(week, tab)?.reason ?? ''
}

/** Weicht diese Zusammenkunft überhaupt ab — Tag, Uhrzeit oder Ausfall? */
export function weichtAb(week: Week | undefined, tab: MeetingKey): boolean {
  const a = abweichung(week, tab)
  return Boolean(a && (a.cancelled || a.day || a.time))
}

/* ---- Wer den öffentlichen Vortrag hält (Rollen-Vokabular) ---- */

/**
 * Rollen, die von **außen** kommen: kein Bestätigungs-Flow, keine Erinnerung,
 * keine Anrechnung auf die Auslastung, und die Auto-Zuteilung lässt sie stehen.
 */
const SKIP_ROLE = /Gastredner|Kreisaufseher/

/** Externer Redner-Slot (Gastredner/Kreisaufseher) — Freitext statt Person. */
export function isGuestRole(rolle: string | undefined): boolean {
  return Boolean(rolle && SKIP_ROLE.test(rolle))
}

/**
 * Der öffentliche Vortrag, gehalten von einem Bruder der **eigenen**
 * Versammlung (T29). Steht mit Absicht nicht in `SKIP_ROLE`: dadurch bekommt er
 * ohne jede weitere Sonderregel `pid`, Aufgabe, Bestätigung, Erinnerung und
 * Anrechnung — all das hängt bereits an `isGuestRole`.
 *
 * Kein erfundener Begriff: `translate-data.ts` übersetzt „Redner" seit jeher in
 * allen 33 Fremdsprachen.
 */
export const ROLE_OWN_SPEAKER = 'Redner'

/** Voreinstellung des Vortragsplatzes aus dem Import: auswärtiger Redner. */
export const ROLE_GUEST_SPEAKER = 'Gastredner'

/**
 * Der Kreisaufseher (T62) — oder die Begleitung, die er schult.
 *
 * Steht wie `Gastredner` in `SKIP_ROLE`: kein Bestätigungs-Flow, keine
 * Erinnerung, keine Anrechnung auf die Auslastung, keine Auto-Zuteilung. Der
 * Platz nimmt Freitext, denn **wer** die Aufgabe hält, steht nicht fest: der
 * Kreisaufseher bringt manchmal jemanden mit, den er schult, und die
 * Begleitung kann jede der drei Aufgaben übernehmen (Dienstvortrag,
 * öffentlicher Vortrag, Schlussvortrag). Ein Haken, der die Woche mit seinem
 * Namen füllt, wäre deshalb regelmäßig falsch.
 */
export const ROLE_CIRCUIT = 'Kreisaufseher'

/**
 * Titel des Dienstvortrags in der Kreisaufseher-Woche. Fester Begriff, in
 * `translate-data.ts` in allen 34 Sprachen gemessen; das Thema kommt als
 * zweites Atom dahinter („Dienstvortrag · <Thema>"), wie bei
 * „Bibellesung · Jer 32:6-18".
 */
export const TITEL_DIENSTVORTRAG = 'Dienstvortrag'

/**
 * Titel des Schlussvortrags am Wochenende (T64).
 *
 * **Bis T64 stand hier nur „Vortrag"**, und das aus gutem Grund: Nachgesehen
 * worden war in zwei jw.org-Artikeln, die das Wort auf Deutsch verwenden
 * (g20010608, g20020608), in allen dort verfügbaren 47 bzw. 48 Sprachen — dort
 * wird es umschrieben („discorso conclusivo", „the day's final discourse",
 * „Końcowy punkt programu"), und zwar in derselben Sprache zwischen beiden
 * Artikeln verschieden. In *jenem* Zusammenhang ist es deutsche
 * Fließtext-Prosa, kein Programmbegriff.
 *
 * **Der Betreiber hat am 8.8.2026 eine bessere Quelle beigebracht**, und sie
 * zeigt, warum die alte Suche leer ausging: Sie hat am falschen Ort gesucht.
 * Gemeint ist nicht „der letzte Vortrag eines Kongresstages", sondern der
 * **abschließende Dienstvortrag des Kreisaufsehers** — und der hat sehr wohl
 * einen festen Begriff: „Concluding Service Talk", „Discurso de servicio
 * final", „Końcowe przemówienie służbowe". 18 Sprachen sind damit gemessen.
 *
 * Die übrigen 15 tragen in `translate-data.ts` ihr eigenes, gemessenes
 * „Vortrag" — dort einzeln als Rückfall markiert und in
 * `translate-data.test.ts` als geschlossene Liste festgehalten, damit auffällt,
 * wenn jw.org nachliefert.
 */
export const TITEL_SCHLUSSVORTRAG = 'Schlussvortrag'

/**
 * Überschrift des Abschnitts, in dem der Schlussvortrag am Wochenende steht.
 *
 * Er bekam bis T64 keinen: `setDienstwoche` hängte ihn an die Punkte des
 * Wachtturm-Studiums, sodass unter dessen Überschrift ein zweiter Punkt stand,
 * der keiner ist. Der v3-Prototyp hatte dafür längst eine eigene Sektion in
 * **Gold** vorgesehen — die Farbe ist am Wochenende frei (dort nur neutral,
 * petrol, wein), in allen elf Schemata tokenisiert und inhaltlich richtig: Gold
 * ist unter der Woche die Farbe von „Uns im Dienst verbessern", und ein
 * Dienstvortrag ist dieselbe Tonart.
 *
 * Das Etikett steht in `translate-data.ts` in allen 33 Sprachen gemessen
 * bereit — vorbereitet für genau diese Sektion, nur nie benutzt.
 */
export const LABEL_DIENSTVORTRAG = 'DIENSTVORTRAG'

/**
 * Basis-Rolle ohne angehängte Herkunft: `"Gastredner · Vers. Nordheim"` →
 * `"Gastredner"`. Die Herkunftsversammlung hat kein eigenes Feld und wird als
 * weiteres Atom der Rolle geführt (siehe `AssignSheet`).
 */
export function rolleBasis(rolle: string | undefined): string {
  // `split` liefert immer mindestens ein Element; der Index-Zugriff weiß das nicht.
  return (rolle ?? '').split(' · ')[0] ?? ''
}

/**
 * Ist das der Redner-Platz des öffentlichen Vortrags — gleich ob eigener oder
 * auswärtiger?
 *
 * Nicht dasselbe wie `isGuestRole`: **dieser** Test öffnet im Zuteilungs-Sheet
 * die Freitext-Felder und muss deshalb auch beim eigenen Redner zutreffen.
 * Sonst gäbe es keinen Weg zurück — einmal auf „eigener Redner" gestellt,
 * bliebe der Platz es für immer.
 */
export function isSpeakerRole(rolle: string | undefined): boolean {
  return isGuestRole(rolle) || rolleBasis(rolle) === ROLE_OWN_SPEAKER
}

/** Was eine Zuteilung über ihren Inhaber verrät — Slot, Ratgeber, Hilfsdienst. */
export interface Zuteilung {
  name?: string
  pid?: string
  /** Nur Programmpunkt-Slots; entscheidet über den Namens-Rückfall (s. u.). */
  rolle?: string
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
 * Altdaten (vor `pid` gespeichert) und Gruppen-Rotationen haben keine — dort
 * bleibt der Anzeigename der einzige Anhalt.
 *
 * Wichtig ist die Richtung: hat die Zuteilung eine Id, wird **nicht** auf den
 * Namen zurückgefallen. Sonst zählte eine Zuteilung, die ausdrücklich Person A
 * meint, auch für die gleichnamige Person B mit.
 *
 * **Externe Redner sind vom Namens-Rückfall ausgenommen** (bei T29 aufgefallen).
 * Ein Gastredner steht als Freitext im Slot und hat naturgemäß keine `pid` —
 * heißt er zufällig wie ein Bruder der eigenen Versammlung, zählte dessen
 * Auslastung mit und er galt als „heute schon zugeteilt". Die Warnung vor
 * doppelten Anzeigenamen greift hier nicht: der Gast steht in keiner
 * Personenliste. Für ihn ist der Name kein schwächerer Anhalt, sondern gar
 * keiner — er meint jemanden, den diese Versammlung nicht kennt.
 */
export function gehoertZu(zuteilung: Zuteilung | undefined, person: Person): boolean {
  if (!zuteilung?.name) return false
  if (zuteilung.pid) return zuteilung.pid === person.id
  return !isGuestRole(zuteilung.rolle) && zuteilung.name === displayName(person)
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
    for (const tab of MEETING_TABS) {
      // Eine entfallene Zusammenkunft zählt nicht (T30). Die Zuteilungen
      // bleiben stehen, damit die Planung beim Zurücknehmen wieder da ist —
      // aber wer nicht drankommt, ist auch nicht ausgelastet. Sonst gälte er
      // wochenlang als beschäftigt und die Auto-Zuteilung überginge ihn.
      if (istAusgefallen(week, tab)) continue
      const meeting = week[tab]
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
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue // entfällt → kein Hilfsdienst (T30)
      const meeting = week[tab]
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
