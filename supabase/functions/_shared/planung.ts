/**
 * Regeln, die Client **und** Edge Functions gleich anwenden müssen.
 *
 * Sie standen bis August 2026 in bis zu drei Fassungen nebeneinander:
 * `meetingDayOffsets` dreimal, `displayName` und `taskDate` je zweimal,
 * `SKIP_ROLE` zweimal. Das ist nicht bloß Doppelarbeit — daraus entstand B8:
 * `send-reminders` rechnete mit dem Array-Index, `substitute` mit `position`,
 * und die Erinnerung zeigte auf eine andere Woche als die Übernahme. Solche
 * Fehler fallen nirgends auf, weil beide Seiten für sich betrachtet stimmen.
 *
 * **Der Ordnername beginnt mit `_`**, damit die Supabase-CLI ihn nicht für
 * eine eigene Function hält; das ist die vorgesehene Ablage für geteilten
 * Code. Der Client bindet dieselbe Datei ein — Vite folgt dem relativen Pfad,
 * und `allowImportingTsExtensions` erlaubt die `.ts`-Endung, die Deno
 * verlangt.
 *
 * **Dass die CLI `_shared/` mitbündelt, ist nachgewiesen** (8.8.2026, erster
 * Deploy nach der Zusammenführung): `send-reminders` antwortet ohne Secret mit
 * einem schlichten `Unauthorized` (401) — und das kommt aus dem Handler selbst
 * (`index.ts`), der erst läuft, wenn das Modul samt dieses Imports geladen ist.
 * Fehlte die Datei im Bündel, käme stattdessen ein Boot-Fehler. Der Unterschied
 * ist am Antwortformat erkennbar: die Plattform meldet JSON
 * (`UNAUTHORIZED_NO_AUTH_HEADER`, so bei `substitute`), der Code Klartext.
 *
 * **Was hier hineingehört:** reine Funktionen ohne Laufzeit-Abhängigkeit —
 * kein `Deno.*`, kein `import.meta`, kein Netz. Sonst bricht eine der beiden
 * Seiten.
 *
 * Die Gegenprobe steht in `src/data/edge-parity.test.ts`: sie vergleicht die
 * Ergebnisse mit den Client-Fassungen, damit ein Auseinanderlaufen auffällt,
 * bevor es jemand im Betrieb merkt.
 */

/**
 * Rollen, die von außen kommen: kein Bestätigungs-Flow, keine Erinnerung,
 * keine Anrechnung auf die Auslastung.
 */
export const SKIP_ROLE = /Gastredner|Kreisaufseher/

/** Ist dieser Slot von außen besetzt? */
export function isGuestRole(rolle: string | undefined): boolean {
  return Boolean(rolle && SKIP_ROLE.test(rolle))
}

/**
 * Der Name einer Person: „Vorname Nachname" — dieselbe Rechnung wie
 * `displayName()` in der App.
 *
 * Bis T110 konnte ein Feld `dn` ihn überschreiben. Es gibt ihn nicht mehr:
 * Vor- und Nachname sind je Versammlung eindeutig (Index
 * `persons_name_eindeutig`), also braucht es keinen zweiten Namen, um zwei
 * Menschen auseinanderzuhalten. Hier zählt das doppelt — die Functions ordnen
 * Konten und Personen **über diesen String** zu, wo ein Platz keine `pid`
 * trägt.
 */
export function personDisplayName(fn: string, ln: string): string {
  return `${fn} ${ln}`.trim()
}

/**
 * Abschnitte, deren Titel den **Block** benennen statt die Aufgabe — kanonisch
 * deutsch wie alle Sektions-Labels in den Wochendaten (LABEL_EROEFFNUNG /
 * LABEL_ABSCHLUSS in src/data/constants.ts).
 */
const BLOCK_LABELS = new Set<string>(['ERÖFFNUNG', 'ABSCHLUSS'])

/**
 * Beschriftung einer Zuteilung — Zweitschrift von `zuteilungsLabel`
 * (src/data/helpers.ts). Dort steht die Begründung; hier steht sie, weil die
 * Edge-Laufzeit nicht auf `src/` zugreifen kann. `edge-parity.test.ts` hält
 * beide Fassungen zusammen.
 */
/**
 * Rolle und Herkunft als ein Text — Spiegelbild von `rolleMitHerkunft` in
 * `src/data/helpers.ts` (gegengeprüft in `edge-parity.test.ts`).
 *
 * Die Heimatversammlung eines auswärtigen Redners steht in ihrem eigenen Feld
 * — über die Rolle entscheiden Regeln, die Herkunft wird nur angezeigt.
 */
export function rolleMitHerkunft(slot: { rolle?: string; herkunft?: string } | undefined): string | undefined {
  const basis = (slot?.rolle ?? '').split(' · ')[0] ?? ''
  if (!basis) return slot?.rolle
  return slot?.herkunft ? `${basis} · ${slot.herkunft}` : basis
}

export function zuteilungsLabel(
  sectionLabel: string,
  title: string,
  rolle: string | undefined,
): string {
  const r = rolle ?? ''
  if (!r) return title
  return BLOCK_LABELS.has(sectionLabel) ? r : `${title} · ${r}`
}

/**
 * Termin aus dem `date`-Feld einer Zusammenkunft:
 * „Dienstag, 8. September · 19:00 · Saal" → „Dienstag, 8. September · 19:00".
 */
export function taskDateText(date: string | undefined): string {
  return (date ?? '').split(' · ').slice(0, 2).join(' · ')
}

/**
 * Regeltermin einer Zusammenkunft, wie ihn die Versammlung führt: Wochentag als
 * Zahl (0 = Sonntag … 6 = Samstag) und Uhrzeit. Spiegelbild von `MeetingTime`
 * in `src/data/types.ts`.
 */
export interface MeetingTime {
  wd: number
  time: string
}

/** Beide Regeltermine — die Spalten `mid_wd/mid_time/we_wd/we_time`. */
export type MeetingTimes = Record<'mid' | 'we', MeetingTime>

/**
 * Wochentag (0 = Sonntag … 6 = Samstag) → Tage nach Montag.
 *
 * Hier standen stattdessen zwei Leser für **einen Anzeigetext**: „Di 19:00 · So
 * 10:00" wurde per regulärem Ausdruck in Tage und Uhrzeiten zerlegt, der erste
 * Treffer war die Wochenmitte, der zweite das Wochenende — mit deutschen
 * Kürzeln und einem stillen Rückfall auf Dienstag/Sonntag, wenn nichts passte.
 * Die Versammlung führt beides seit dem 18. September 2026 als Werte.
 */
export function versatzAbMontag(wd: number): number {
  return (wd + 6) % 7
}

/**
 * Regeltermine einer frisch angelegten Versammlung: Dienstag 19:00, Sonntag
 * 10:00 — der verbreitetste Rhythmus.
 *
 * Steht hier, weil **beide Seiten** denselben Rückfall brauchen: der Client für
 * eine Versammlung, die noch keine eigenen Zeiten hat, und die Functions für
 * eine Zeile, die zwischen zwei Abfragen verschwindet. Zwei Fassungen hießen:
 * Die App zeigt einen Tag an, die Erinnerung nennt einen anderen.
 */
export const STANDARD_ZEITEN: MeetingTimes = {
  mid: { wd: 2, time: '19:00' },
  we: { wd: 0, time: '10:00' },
}

/** Die vier Spalten der Regeltermine, wie PostgREST sie liefert. */
export interface ZeitenRow {
  mid_wd: number
  mid_time: string
  we_wd: number
  we_time: string
}

/**
 * Zeile → Werte. `time` kommt aus PostgreSQL als „19:00:00"; geführt wird
 * „19:00". Ohne Zeile gilt der übliche Rhythmus.
 *
 * **Auch je Feld, nicht nur für die ganze Zeile.** Hier stand
 * `row.mid_time.slice(0, 5)` hinter einem bloßen `if (!row)`: Eine Zeile, die
 * es gibt, deren Zeit-Spalten aber fehlen, warf einen TypeError mitten im
 * Ladevorgang — und der läuft an einem `void loadAndHydrate(…)` ohne `catch`
 * hoch, die App blieb also auf „lädt…" stehen. Denkbar ist das an jeder
 * Abfrage, die die Spalten nicht ausdrücklich nennt; `CONG_SPALTEN` in
 * `src/lib/data.ts` verhindert genau das auf der Client-Seite, und hier steht
 * der Gürtel dazu.
 *
 * Der Rückfall ist derselbe wie ohne Zeile: lieber der übliche Rhythmus als
 * ein Absturz. Falsch angezeigt wäre er nur in dem Fall, in dem sonst gar
 * nichts angezeigt würde.
 */
export function zeitenAus(row: ZeitenRow | undefined): MeetingTimes {
  if (!row) return STANDARD_ZEITEN
  return {
    mid: {
      wd: kurzerTag(row.mid_wd, STANDARD_ZEITEN.mid.wd),
      time: kurzeZeit(row.mid_time, STANDARD_ZEITEN.mid.time),
    },
    we: {
      wd: kurzerTag(row.we_wd, STANDARD_ZEITEN.we.wd),
      time: kurzeZeit(row.we_time, STANDARD_ZEITEN.we.time),
    },
  }
}

/**
 * Eine `time`-Spalte als „19:00" — die Schreibweise, die die App führt und die
 * `<input type="time">` liefert und erwartet.
 *
 * **Die eine Stelle dafür.** Sie stand zweimal da: hier und als `kurzeZeit` in
 * `src/lib/data.ts` für `fs_rules.time` — und die beiden waren sich über den
 * leeren String uneins. Die eine gab ihn durch (`('' ?? vorgabe).slice(0, 5)`
 * ist `''`), die andere nahm die Vorgabe. Aus einer leeren Uhrzeit wurde so
 * je nach Tabelle ein leeres Feld oder ein Termin.
 */
export function kurzeZeit(wert: string | undefined | null, vorgabe: string): string {
  return typeof wert === 'string' && wert ? wert.slice(0, 5) : vorgabe
}

/** Gegenstück für die Wochentag-Spalte: eine Zahl oder die Vorgabe. */
function kurzerTag(wert: number | undefined, vorgabe: number): number {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : vorgabe
}

/**
 * Kanonisch deutsche Namen — das Format, in dem Programmdaten gespeichert
 * werden; übersetzt wird erst bei der Anzeige.
 */
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/**
 * „Dienstag, 8. September" — die Schreibweise der Wochendaten.
 *
 * `utc` wählt die Zeitzone der Felder: der Client rechnet in Ortszeit
 * (`deutschesDatum`), die Edge Function auf einem UTC-Zeitstempel. Dieselben
 * Tabellen, dieselbe Zusammensetzung — nur die Ablesung unterscheidet sich.
 */
export function deutschesDatum(d: Date, utc = false): string {
  const tag = utc ? d.getUTCDay() : d.getDay()
  const datum = utc ? d.getUTCDate() : d.getDate()
  const monat = utc ? d.getUTCMonth() : d.getMonth()
  return `${WOCHENTAGE[(tag + 6) % 7]}, ${datum}. ${MONATE[monat]}`
}

/* ---- Sonderwochen (T30) --------------------------------------------------- */

/**
 * Abweichung **einer** Zusammenkunft von der Regel — verlegter Tag, andere
 * Uhrzeit, Ausfall, Grund. Spiegelbild von `Abweichung` in
 * `src/data/types.ts`.
 *
 * Warum das hier stehen muss: eine verlegte Woche verschiebt **auch die
 * Erinnerungen**. `send-reminders` rechnete mit dem regulären Wochentag aus den
 * Einstellungen; die Erinnerung nannte dann einen Abend, an dem niemand kommt.
 * Und eine ausgefallene Zusammenkunft darf gar nicht erst erinnern.
 */
export interface Abweichung {
  /** Verlegter Wochentag als Zahl (0 = Sonntag … 6 = Samstag). */
  wd?: number
  time?: string
  cancelled?: boolean
  reason?: string
}

/** Abweichungen einer Woche, je Zusammenkunft. */
export type Abweichungen = Partial<Record<'mid' | 'we', Abweichung>>

/** Abweichung dieser einen Zusammenkunft, falls es eine gibt. */
function abweichungFuer(
  dev: Abweichungen | undefined,
  tab: 'mid' | 'we',
): Abweichung | undefined {
  return dev?.[tab]
}

/**
 * Findet diese Zusammenkunft gar nicht statt?
 *
 * Eng gemeint: **es kommt niemand zusammen** (Kongresswoche, abgesagte
 * Zusammenkunft). Die Gedächtnismahl-Woche gehört ausdrücklich nicht dazu —
 * dort wird der reguläre Ablauf *ersetzt*, und das Mahl hat eigene
 * Zuteilungen, die sehr wohl erinnert werden wollen.
 */
export function istAusgefallenFuer(dev: Abweichungen | undefined, tab: 'mid' | 'we'): boolean {
  return abweichungFuer(dev, tab)?.cancelled === true
}

/**
 * Wochentag-Versatz mit Abweichung. Rangfolge wie im Client
 * (`meetingOffset`, src/data/meeting-dates.ts): Abweichung vor Rhythmus.
 *
 * Dazwischen stand eine dritte Quelle — der Wochentag, den das `date`-Feld der
 * Zusammenkunft **anzeigt**. Sie galt Alt-Datensätzen; seit T30 sagt eine
 * `Abweichung` dasselbe als Wert.
 *
 * `?? `, nicht `||`: der Sonntag ist die 0.
 */
export function versatzMitAbweichung(
  dev: Abweichungen | undefined,
  tab: 'mid' | 'we',
  regel: number,
): number {
  return versatzAbMontag(abweichungFuer(dev, tab)?.wd ?? regel)
}

/**
 * **Der Termin einer Zusammenkunft als Text** — „Dienstag, 8. September · 19:00".
 *
 * Die eine Stelle, an der aus Wochenkennung, Wochentag und Uhrzeit ein Datum
 * wird; Gegenstück zu `meetingDateText` im Client, und dieselbe Rangfolge:
 * eigener Termin im `date`-Feld vor gerechnetem Datum, eine Abweichung vor
 * beidem.
 *
 * **Warum das Feld allein nicht reicht.** Importierte Wochen tragen im `date`
 * nur die Wochenspanne („7.–13. September") — die jw.org-Überschrift nennt
 * weder Wochentag noch Uhrzeit. Wer es ungeprüft nimmt, schreibt eine Woche,
 * wo ein Termin stehen müsste (B4). Genau das tat `substitute` bis hierher als
 * einzige der drei Functions: Seine Ersatzsuche nannte die Spanne, während die
 * App daneben den Tag zeigte — dieselbe Auskunft in zwei Fassungen, je
 * nachdem, ob sie aus dem Push oder aus dem Aufgaben-Blatt kam.
 *
 * Steht hier und nicht in `zuteilungen.ts`, wo sie herkommt: Dieses Modul ist
 * die untere, abhängigkeitsfreie Schicht. `zuteilungen.ts` zieht den
 * Fragment-Übersetzer samt seiner Wörterbücher nach — ein Preis, den eine
 * Function zahlen soll, die auch übersetzt, nicht eine, die nur ein Datum
 * braucht.
 *
 * `dateFeld` statt der ganzen Zusammenkunft: Gebraucht wurde davon immer nur
 * dieses eine Feld, und die Treffpunkte haben gar keine Zusammenkunft.
 */
export function terminText(
  startISO: string,
  offset: number,
  dateFeld: string | undefined,
  zeit: string,
): string {
  const ms = Date.parse(startISO)
  if (Number.isNaN(ms)) return taskDateText(dateFeld)
  const d = new Date(ms + offset * 864e5)
  const text = deutschesDatum(d, true)
  return zeit ? `${text} · ${zeit}` : text
}

/* ---- Heute und „vorbei" --------------------------------------------------- */

/**
 * Ganze Tage von heute bis zu einem Termin — negativ, wenn er vorbei ist; null
 * bei unlesbarem Startdatum.
 *
 * `heuteUTC` ist der Kalendertag als UTC-Mitternacht, dieselbe Kodierung wie
 * `kalendertagMs` im Client. Stand in `send-reminders` als eigene Fassung
 * (`daysUntil`); seit „Plan senden" dieselbe Frage stellt, steht die Rechnung
 * hier — zwei Fassungen einer Terminregel waren schon einmal die Ursache von B8.
 */
export function tageBisTermin(startISO: string, offset: number, heuteUTC: number): number | null {
  const start = Date.parse(startISO)
  if (Number.isNaN(start)) return null
  return Math.round((start + offset * 864e5 - heuteUTC) / 864e5)
}

/**
 * Ist dieser Termin vorbei? **Tagesgenau** wie `istVorbei` im Client: am Tag
 * selbst zählt er noch. Ein unlesbares Datum ist nicht vorbei — wer nichts über
 * den Termin weiß, hält ihn lieber für anstehend.
 */
export function terminVorbei(startISO: string, offset: number, heuteUTC: number): boolean {
  const tage = tageBisTermin(startISO, offset, heuteUTC)
  return tage !== null && tage < 0
}

/**
 * **„Heute" für eine Function** — als UTC-Mitternacht des Kalendertags.
 *
 * Der Client schickt seinen **örtlichen** Tag mit. Der Server kennt nur UTC, und
 * in Mitteleuropa ist zwischen Mitternacht und 02:00 der UTC-Tag noch der
 * gestrige: Die Vorschau am Knopf („3 noch nicht gesendet") und der Versand
 * meinten dann verschiedene Tage, und die Zahl ginge nach dem Drücken nicht auf
 * null — genau der Fehler, gegen den `offeneMeldungen` gebaut ist.
 *
 * Geglaubt wird der mitgeschickte Tag nur, wenn er höchstens einen Tag neben dem
 * des Servers liegt — so weit reichen die Zeitzonen der Erde auseinander. Ein
 * Gerät mit falsch gestellter Uhr soll nicht bestimmen, was als vergangen gilt.
 * Fehlt er (ein älterer Client), gilt der UTC-Tag.
 */
export function heuteUtc(clientTag: string | undefined, jetzt = Date.now()): number {
  const d = new Date(jetzt)
  const server = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  if (!clientTag || !/^\d{4}-\d{2}-\d{2}$/.test(clientTag)) return server
  const client = Date.parse(clientTag)
  if (Number.isNaN(client) || Math.abs(client - server) > 864e5) return server
  return client
}

/** Uhrzeit mit Abweichung — gleiche Rangfolge wie beim Tag. */
export function zeitMitAbweichung(
  dev: Abweichungen | undefined,
  tab: 'mid' | 'we',
  regel: string,
): string {
  return abweichungFuer(dev, tab)?.time ?? regel
}
