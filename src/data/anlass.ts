/**
 * Anlass der Woche (T64) — Kreisaufseher-Besuch, Gedächtnismahl oder Kongress.
 *
 * Entstanden aus einem Befund: Der Kreisaufseher-Schalter stand im Panel **einer**
 * Zusammenkunft, änderte aber beide. Daraus die Regel, die dieses Modul umsetzt:
 *
 * > Ein Bedienelement gehört auf die Ebene, die es verändert. Ein Schalter
 * > existiert genau dort, wo sich **das Programm selbst** ändert; alles andere
 * > ist Dokumentation — Freitext, der nichts steuert.
 *
 * Deshalb sind es genau diese drei: Jeder von ihnen baut den Ablauf um oder
 * streicht Zusammenkünfte. „Saal belegt", „Urlaub des Redners", „Kongress der
 * Nachbarversammlung" tun das nicht — sie bleiben Grund im Freitext.
 *
 * **Der Anlass schlägt vor, die Zusammenkunft entscheidet.** Ein Kongress
 * streicht beim Setzen beide Zusammenkünfte; die Schalter je Zusammenkunft
 * bleiben danach bedienbar. Sonst ließe sich der Fall nicht abbilden, in dem
 * der Kongress nur das Wochenende frisst.
 */

import { setAbweichung, setDienstwoche } from './meeting-edit'
import type { Anlass, AnlassArt, MeetingKey, Week } from './types'

/** Beide Zusammenkünfte — in dieser Reihenfolge. */
const BEIDE: readonly MeetingKey[] = ['mid', 'we']

/**
 * Welcher Anlass gilt in dieser Woche?
 *
 * Liest das neue Feld, fällt aber auf die alten Flags zurück. Wochen, die vor
 * T64 gespeichert wurden, tragen `anlass` nicht — sie liefern hier trotzdem das
 * richtige Ergebnis, und genau deshalb braucht es keine Datenwanderung.
 */
export function anlassArt(week: Week | undefined): AnlassArt | undefined {
  if (!week) return undefined
  if (week.anlass) return week.anlass.art
  if (week.co) return 'co'
  if (week.mem) return 'mem'
  return undefined
}

/**
 * Anlass setzen oder aufheben (`art === null`).
 *
 * Die Wirkungen des **alten** Anlasses werden zurückgenommen, die des neuen
 * gesetzt. Zurücknehmen heißt nicht wegwerfen: `setDienstwoche(false)` holt das
 * Versammlungsbibelstudium samt seiner Zuteilungen zurück (T62), und beim
 * Kongress wird nur `cancelled` gelöscht — ein verlegter Tag oder ein
 * eingetragener Grund bleiben stehen, denn die hat der Planer selbst gesetzt.
 */
export function setAnlass(weeks: Week[], wi: number, art: AnlassArt | null): Week[] {
  const week = weeks[wi]
  if (!week) return weeks
  const vorher = anlassArt(week)
  if (vorher === art || (vorher === undefined && art === null)) return weeks

  let next = zuruecknehmen(weeks, wi, vorher)
  if (art === 'co') next = setDienstwoche(next, wi, true)
  if (art === 'kongress') next = beideStreichen(next, wi, true)

  const w = next[wi]
  if (!w) return weeks
  const kopie = [...next]
  kopie[wi] = art === null ? ohneAnlass(w) : { ...w, anlass: { art }, ...(art === 'mem' ? { mem: true } : {}) }
  return kopie
}

/**
 * Termin des Anlasses ändern.
 *
 * **Vorbelegung:** Wird `von` gesetzt und steht noch kein `bis` (oder läge es
 * davor), übernimmt `bis` denselben Wert. Der eintägige Kreiskongress braucht
 * damit keine zweite Eingabe — und trotzdem sind beide Werte gefüllt, sodass es
 * nirgends den Sonderfall „kein Ende" gibt. Ein bereits eingetragenes späteres
 * Ende bleibt unangetastet: eine Korrektur des Anfangs darf es nicht
 * überschreiben.
 */
export function setAnlassTermin(
  weeks: Week[],
  wi: number,
  patch: Partial<Anlass>,
): Week[] {
  const week = weeks[wi]
  const art = anlassArt(week)
  if (!week || !art) return weeks

  const zusammen: Anlass = { ...week.anlass, ...patch, art }
  if (patch.von && (!zusammen.bis || zusammen.bis < patch.von)) zusammen.bis = patch.von

  const bereinigt: Anlass = { art }
  if (zusammen.von) bereinigt.von = zusammen.von
  if (zusammen.bis) bereinigt.bis = zusammen.bis
  if (zusammen.zeit) bereinigt.zeit = zusammen.zeit

  const next = [...weeks]
  next[wi] = { ...week, anlass: bereinigt }
  return art === 'mem' && bereinigt.von ? memAusfall(next, wi, bereinigt.von) : next
}

/**
 * Beim Gedächtnismahl entfällt **eine** Zusammenkunft — die unter der Woche,
 * wenn das Mahl auf Montag bis Freitag fällt, sonst die am Wochenende.
 *
 * **Nicht die, deren Tag mit dem Mahl zusammenfällt.** Genau das stand hier
 * zuerst, und es ist falsch: Das Arbeitsheft lässt die Woche des Mahls
 * vollständig aus, sobald es auf einen Werktag fällt — nachgemessen an der
 * Ausgabe März/April 2026 (Mahl Donnerstag, 2. April; die Wochenseite
 * 30. März – 5. April fehlt) gegen März/April 2024 (Mahl Sonntag, 24. März;
 * alle Seiten da). Diese Entscheidung trifft der Herausgeber **für alle
 * Versammlungen zugleich**, ohne ihre Zusammenkunftstage zu kennen. Eine
 * Versammlung, die dienstags zusammenkommt, hat für den 2. April kein
 * Programm — sie kommt also auch nicht zusammen.
 *
 * Die jeweils andere wird ausdrücklich **ent**strichen: Korrigiert der Planer
 * das Datum von einem Dienstag auf einen Sonntag, stünden sonst beide
 * durchgestrichen da.
 */
function memAusfall(weeks: Week[], wi: number, iso: string): Week[] {
  const versatz = wochentagVersatz(iso)
  if (versatz === null) return weeks
  const faelltAus: MeetingKey = versatz <= 4 ? 'mid' : 'we' // 0 = Montag … 6 = Sonntag
  let next = weeks
  for (const tab of BEIDE) {
    next = setAbweichung(next, wi, tab, { cancelled: tab === faelltAus ? true : undefined })
  }
  return next
}

/**
 * Tage nach Montag (0–6) für ein ISO-Datum — `null`, wenn es keines ist.
 *
 * **Gerechnet, nicht über `Date` gelesen.** `new Date('2026-03-31')` ist
 * Mitternacht UTC; in westlichen Zeitzonen ist das lokal noch der Vortag, und
 * `getDay()` läge um eins daneben — es entfiele die falsche Zusammenkunft.
 * Der Fehler wäre in Mitteleuropa nie aufgefallen: Ein Test dagegen bleibt hier
 * grün, gleich ob die Absicherung dasteht oder nicht (nachgestellt am
 * 8.8.2026). Etwas, das die Gegenprobe nicht fassen kann, gehört nicht
 * abgesichert, sondern beseitigt — die Formel (nach Sakamoto) kennt keine
 * Zeitzone.
 */
function wochentagVersatz(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const jahr = Number(m[1])
  const monat = Number(m[2])
  const tag = Number(m[3])
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null
  const versatzImJahr = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const j = monat < 3 ? jahr - 1 : jahr
  const sonntagBasiert =
    (j + Math.floor(j / 4) - Math.floor(j / 100) + Math.floor(j / 400) + (versatzImJahr[monat - 1] ?? 0) + tag) % 7
  return (sonntagBasiert + 6) % 7 // 0 = Montag, wie WEEKDAY_OFFSET
}

/*
 * **Der Ausfall beim Gedächtnismahl hängt am Datum** — deshalb setzt ihn nicht
 * `setAnlass`, sondern `setAnlassTermin` (siehe `memAusfall`). Beim bloßen
 * Anhaken steht das Datum noch gar nicht fest; erst mit ihm ist bekannt, welche
 * Zusammenkunft verdrängt wird.
 *
 * `memCancel` bleibt dabei unangetastet. Es ist die Marke „auf diesem Reiter
 * steht das Programm des Mahls" und gehört zu den Datensätzen, die ein solches
 * mitbringen — ein Programm erzeugt dieses Modul nicht.
 */

/** Wirkungen eines Anlasses zurücknehmen. */
function zuruecknehmen(weeks: Week[], wi: number, art: AnlassArt | undefined): Week[] {
  if (art === 'co') return setDienstwoche(weeks, wi, false)
  // Kongress wie Gedächtnismahl: beide entstrichen. Was der Planer selbst
  // gesetzt hat (Tag, Uhrzeit, Grund), bleibt stehen — nur der Strich geht.
  if (art === 'kongress' || art === 'mem') {
    const entstrichen = beideStreichen(weeks, wi, false)
    const week = entstrichen[wi]
    if (!week) return entstrichen
    const next = [...entstrichen]
    next[wi] = { ...week, mem: undefined, memCancel: undefined }
    return next
  }
  return weeks
}

/** Beide Zusammenkünfte streichen bzw. den Strich wieder aufheben. */
function beideStreichen(weeks: Week[], wi: number, aus: boolean): Week[] {
  let next = weeks
  for (const tab of BEIDE) {
    next = setAbweichung(next, wi, tab, { cancelled: aus ? true : undefined })
  }
  return next
}

/** Woche ohne Anlass — die Felder werden entfernt, nicht auf `false` gesetzt. */
function ohneAnlass(week: Week): Week {
  const { anlass: _anlass, ...rest } = week
  return { ...rest, mem: undefined, memCancel: undefined }
}
