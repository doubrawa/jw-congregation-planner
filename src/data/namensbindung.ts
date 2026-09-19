/**
 * **Namen und Ids an ihre Person binden.**
 *
 * Reine Regeln über `Week[]`: eine Umbenennung durchziehen, die Id einer
 * gelöschten Person lösen, Ids aus eindeutigen Namen nachtragen. Kein
 * Datenbank-Wissen, kein Netz — deshalb stehen sie hier in der Domäne und
 * nicht mehr in `lib/data.ts`, wo sie lange wohnten: Der Reducer braucht sie
 * (Person umbenennen, Person löschen) und zog sich über diesen Umweg die
 * ganze Persistenzschicht samt Supabase-Client herein.
 *
 * Das Gegenstück für die zweite Datenquelle — die Treffpunkte — steht in
 * `fs.ts` (`fsRenameLeader`, `fsDropPersonPid`, `fsLeiterBinden`).
 */

import { eindeutigeNamen, emptyQualifications, isGuestRole, privSetzen } from './helpers'
import type { Person, Qualifications, SlotAssignment, Week } from './types'

/**
 * Gespeicherte Qualifikationen auf die feste Form bringen: die
 * Programm-Bereiche sind immer gesetzt, alle übrigen gespeicherten Keys bleiben
 * erhalten — das sind die Hilfsdienst-Bereiche (`svc:<key>`).
 */
export function normalizePriv(raw: Qualifications | null | undefined): Qualifications {
  const r = (raw ?? {}) as unknown as Record<string, unknown>
  const priv = emptyQualifications()
  for (const [key, value] of Object.entries(r)) privSetzen(priv, key, Boolean(value))
  return priv
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
 * Ohne `pid` greift wieder der Namensweg, und beim nächsten Laden wird die
 * Zuteilung erneut zugeordnet (`pidsNachtragen`), sobald es wieder jemanden
 * dieses Namens gibt.
 */
export function dropPersonPid(weeks: Week[], id: string): Week[] {
  return mapPersonSlots(weeks, id, null, (slot) => {
    if (!slot.pid) return slot
    const { pid: _weg, ...ohne } = slot
    return ohne
  })
}

/**
 * **Der eine Durchlauf über alle Plätze — schreibend.**
 *
 * Bildet jeden Platz ab, auf den `passt` zutrifft: Programmpunkte (Hauptsaal
 * **und** Zusätzliche Klasse), den Ratgeber der Klasse und die Hilfsdienste.
 *
 * Lesend tut das `allePlaetze` (plaetze.ts); hier geht es um die andere
 * Richtung, und die braucht eine eigene Fassung: Es entstehen **neue** Wochen,
 * und unberührte Teile müssen ihre Referenz behalten — daran erkennt die
 * Persistenz, welche Woche sie schreiben muss. Ein Generator über die alten
 * Plätze hilft dabei nicht.
 *
 * Hier standen zwei fast gleiche Traversierungen untereinander, je rund 75
 * Zeilen, mit derselben `changed`-Buchführung und demselben Aufbau. Wie teuer
 * das war, steht in beiden Kommentaren: Die Zusätzliche Klasse und ihr Ratgeber
 * fehlten **jeder** von ihnen einmal — erst der einen (T38), dann der anderen.
 * `alle-plaetze.test.ts` hat beide Lücken gefunden, nacheinander.
 *
 * Unveränderte Wochen behalten ihre Referenz. Sprachvarianten (`Week.alt`)
 * tragen keine Namen und werden deshalb nicht angefasst.
 */
function plaetzeMappen(
  weeks: Week[],
  passt: (slot: SlotAssignment) => boolean,
  fix: (slot: SlotAssignment) => SlotAssignment,
): Week[] {
  let anyChanged = false
  const mapMeeting = (m: Week['mid']): Week['mid'] => {
    let changed = false
    /** Eine Platzreihe (Hauptsaal oder Klasse); gibt dieselbe zurück, wenn nichts passt. */
    const mapReihe = <T extends SlotAssignment>(arr: T[] | undefined): T[] | undefined => {
      if (!arr) return arr
      let reiheChanged = false
      const next = arr.map((slot) => {
        if (!passt(slot)) return slot
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
    if (ratgeber && passt(ratgeber)) {
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
          if (!passt(slot)) return slot
          const neu = fix(slot)
          if (neu !== slot) helpersChanged = true
          return { name: neu.name, ...(neu.pid ? { pid: neu.pid } : {}) }
        }),
      ]),
    )
    if (!changed && !helpersChanged) return m
    anyChanged = true
    // `auxRatgeber` nur setzen, wenn es die Zusammenkunft hat — sonst stünde
    // der Schlüssel mit `undefined` da, wo vorher gar keiner war.
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
 * Wie `plaetzeMappen`, nur auf die Plätze **einer Person** beschränkt.
 *
 * Ein Platz gehört zur Person, wenn seine `pid` passt (stabil) — oder, ohne
 * `pid` (Altdaten, Hilfsdienste), sein Name dem angegebenen entspricht.
 * `oldName: null` schaltet den Namensweg ganz ab: beim Lösen einer Id ist nur
 * sie gemeint, nicht jeder Gleichnamige.
 */
function mapPersonSlots(
  weeks: Week[],
  id: string,
  oldName: string | null,
  fix: (slot: SlotAssignment) => SlotAssignment,
): Week[] {
  const meins = (slot: { pid?: string; name: string; rolle?: string }): boolean => {
    if (slot.pid) return slot.pid === id
    /*
     * **Externe Redner sind vom Namensweg ausgenommen** (`isGuestRole`) — die
     * dritte Sorte Platz ohne `pid`.
     *
     * Ein Gastredner steht als Freitext im Slot, häufig in der Kurzform
     * „M. Hartmann" — und genau das ist auch die Schreibweise, in der
     * Zuteilungen einmal gespeichert wurden. Berichtigte der Planer den Namen
     * des gleichnamigen Bruders dieser Versammlung, wurde der Auswärtige mit
     * umbenannt: Auf dem Programmblatt stand danach jemand anderes, als am
     * Sonntag kommt.
     *
     * Dieselbe Grenze zieht `gehoertZu` (die Stelle, an der „gehört dieser
     * Platz dieser Person?" entschieden wird).
     */
    return oldName !== null && !isGuestRole(slot.rolle) && slot.name === oldName
  }
  return plaetzeMappen(weeks, meins, fix)
}

/**
 * **Namen wieder an ihre Person binden.**
 *
 * Trägt die `pid` an allen Plätzen aus dem gespeicherten Anzeigenamen nach.
 * Nur eindeutige Namen werden zugeordnet; mehrdeutige (Dubletten), externe
 * Redner und die Reinigungs-Rotation („Gruppe N") bleiben unangetastet.
 * Idempotent. Rein im Speicher; persistiert beim nächsten Speichern der Woche.
 *
 * **Keine Migration, sondern eine laufende Regel.** Wird eine Person gelöscht,
 * nimmt `dropPersonPid` ihre Id aus den Wochen und lässt den Namen stehen.
 * Legt der Planer sie wieder an, bekommt sie eine neue Id — und ohne diesen
 * Durchlauf bliebe in den Wochen ein Name ohne Person: Die Zuteilung zählte in
 * keiner Auslastung, in keinem Konflikt und in keiner Aufgabenliste mehr.
 */
export function pidsNachtragen(weeks: Week[], persons: Person[]): Week[] {
  const byName = eindeutigeNamen(persons)
  if (byName.size === 0) return weeks
  /**
   * Platz mit `pid` versehen, wenn der Name eindeutig eine Person meint.
   *
   * **Externe Redner sind ausgenommen** (`isGuestRole`). Ein Gastredner steht
   * als Freitext im Slot; heißt er zufällig wie ein Bruder dieser Versammlung,
   * bekäme der Platz dessen Id — und damit gehörte er ihm wirklich:
   * `gehoertZu` entscheidet über die Id, also erschiene der Vortrag eines
   * Auswärtigen unter „Meine Aufgaben" des Namensvetters, verlangte seine
   * Bestätigung, löste Erinnerungen aus und zählte auf seine Auslastung. Und
   * anders als beim bloßen Namens-Rückfall bliebe es stehen: die Id wird beim
   * nächsten Speichern der Woche mitgeschrieben.
   *
   * Der **eigene** Redner (T29, `rolle: 'Redner'`) bekommt seine Id
   * unverändert — er ist eine Person dieser Versammlung.
   */
  const mitPid = (slot: SlotAssignment): SlotAssignment => {
    if (isGuestRole(slot.rolle) || slot.pid || !slot.name) return slot
    const id = byName.get(slot.name)
    return id ? { ...slot, pid: id } : slot
  }
  // Jeder Platz kommt in Frage — welcher wirklich eine Id bekommt, entscheidet
  // `mitPid` selbst.
  return plaetzeMappen(weeks, () => true, mitPid)
}
