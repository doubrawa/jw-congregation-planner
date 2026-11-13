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

/** Was die Regeln unten von einem Abschnitt brauchen — gespeicherte Art und Überschrift. */
interface AbschnittsKopf {
  kind?: string
  label?: string
}

/**
 * Die kanonischen Überschriften der Abschnitte, nach denen die Regeln unten
 * fragen — wie `ART_JE_LABEL` im Client (`constants.ts`), das die Functions
 * nicht einbinden können; den Gleichlauf prüft `edge-parity.test.ts`.
 */
const ART_IM_ALTBESTAND: Record<string, string> = {
  'ERÖFFNUNG': 'eroeffnung',
  'WACHTTURM-STUDIUM': 'wtStudium',
  'ABSCHLUSS': 'abschluss',
}

/**
 * Die Art eines Abschnitts — gespeichert, im Altbestand ohne Art an der
 * kanonischen Überschrift (wie `abschnittsArt` im Client: `kind ?? artVonLabel`).
 */
function artVon(abschnitt: AbschnittsKopf): string | undefined {
  return abschnitt.kind ?? ART_IM_ALTBESTAND[abschnitt.label ?? '']
}

/**
 * **Plätze, die dem Vorsitz folgen** — das Anfangsgebet in der Eröffnung, am
 * Wochenende der Leser des Wachtturm-Studiums und jeder Platz „Vorsitz"
 * außerhalb der Eröffnung: der „Vortrag des Vorsitzenden" (Arbeitsheft ab
 * Januar 2027). Die Automatik setzt dort die Person des Vorsitzes ein
 * (`anVorsitzKoppeln`).
 *
 * Geteilt seit dem 16.10.2026. Bis dahin kannte nur die Automatik die Regel,
 * und alle anderen behandelten die Plätze wie eigene: `bedarf` zählte sie als
 * zweiten Bedarf („Vorsitz: nicht besetzbar 1"), das Zuteilen-Blatt zeigte den
 * Vorsitzenden als „heute schon Vorsitz" weiter unten, und der Vortrag des
 * Vorsitzenden wurde anderen Vorsitzenden als freier Platz angeboten.
 *
 * Der Leser seit dem 19.10.2026 (T131), fest für jede Versammlung — Betreiber:
 * „ja das ist bei uns so"; in NWS las der Vorsitzende an 25 von 26
 * Wochenenden. Der Leser im Versammlungsbibelstudium unter der Woche folgt
 * nicht: Sein Abschnitt ist ein anderer. Leitet der Vorsitzende das Studium
 * selbst, liest ein anderer — das sieht nur, wer die ganze Zusammenkunft kennt:
 * Der Client fragt deshalb `folgtDemVorsitzIn` (`planung/vorsitz.ts`).
 */
export function folgtDemVorsitz(abschnitt: AbschnittsKopf, slot: { rolle?: string } | undefined): boolean {
  switch (artVon(abschnitt)) {
    case 'eroeffnung':
      return slot?.rolle === 'Gebet'
    case 'wtStudium':
      return slot?.rolle === 'Leser'
    default:
      return slot?.rolle === 'Vorsitz'
  }
}

/**
 * **Das Schlussgebet am Wochenende plant niemand** (T133, Betreiber
 * 24.10.2026): „Es spricht in der Regel der Vortragsredner, wenn er bleibt …
 * Ansonsten sucht sich der Wachtturm-Studienleiter jemand aus, der betet, vor
 * der Versammlung spontan." Ein leerer Platz ist deshalb nicht offen: Die
 * Automatik lässt ihn aus, und er zählt nicht als offen. Als freier Platz
 * erscheint er ohnehin nicht: Seit dem 25.10.2026 bietet die App dort nur
 * Hilfsdienste an. Wer es vorher weiß, trägt trotzdem jemanden ein — dann ist
 * es ein Platz wie jeder.
 *
 * Das Wochenende erkennt man am Wachtturm-Studium (`abschnitte`); unter der
 * Woche wird das Schlussgebet geplant. Ohne Abschnitt (die Anzeige fand keinen
 * kanonischen) ist es kein solcher Platz.
 */
export function schlussgebetVorOrt(
  abschnitte: readonly AbschnittsKopf[],
  abschnitt: AbschnittsKopf | undefined,
  slot: { rolle?: string } | undefined,
): boolean {
  return (
    slot?.rolle === 'Gebet' &&
    abschnitt !== undefined &&
    artVon(abschnitt) === 'abschluss' &&
    abschnitte.some((a) => artVon(a) === 'wtStudium')
  )
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

/**
 * Beschriftung einer Zuteilung — Zweitschrift von `zuteilungsLabel`
 * (src/data/helpers.ts). Dort steht die Begründung; hier steht sie, weil die
 * Edge-Laufzeit nicht auf `src/` zugreifen kann. `edge-parity.test.ts` hält
 * beide Fassungen zusammen.
 */
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
  /** Was ab einer späteren Woche gilt (`ZeitWechsel`), nach `ab` aufsteigend. */
  spaeter?: readonly ZeitWechsel[]
}

/**
 * **Ein Wechsel der Regelzeit**: Ab der Woche mit diesem Montag gilt für die
 * Zusammenkunft ein anderer Wochentag oder eine andere Uhrzeit.
 *
 * Bis zum 13.11.2026 kannte die Versammlung je Zusammenkunft genau eine Zeit,
 * und die galt für jede Woche zugleich — eine Änderung datierte auch die
 * vergangenen Wochen um, und ein Wechsel zum Jahresanfang ließ sich nicht
 * vorbereiten: Entweder zeigten die Wochen davor schon die neue Zeit oder die
 * danach noch die alte. Jetzt gilt die Grundzeit (`wd`, `time`), bis ein
 * Wechsel sie ablöst, und der bis zum nächsten.
 */
export interface ZeitWechsel {
  /** Der Montag der ersten Woche, in der es gilt (`Week.start`). */
  ab: string
  wd: number
  time: string
}

/** Beide Regeltermine — die Spalten `mid_wd/mid_time/we_wd/we_time`, die Wechsel aus `zeiten_ab`. */
export type MeetingTimes = Record<'mid' | 'we', MeetingTime>

/**
 * **Wochentag und Uhrzeit, die in dieser Woche gelten** — die eine Stelle, an
 * der App und Functions es fragen. Der jüngste Wechsel, dessen Montag nicht
 * nach dem der Woche liegt; ohne einen solchen die Grundzeit.
 *
 * Ohne Woche (ein Aufrufer, der keine kennt) gilt die Grundzeit.
 */
export function zeitDerWoche(zeit: MeetingTime, woche: string | undefined): { wd: number; time: string } {
  let gilt: { wd: number; time: string } = zeit
  if (woche) {
    for (const wechsel of zeit.spaeter ?? []) {
      if (wechsel.ab > woche) break
      gilt = wechsel
    }
  }
  return { wd: gilt.wd, time: gilt.time }
}

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

/** Die Spalten der Regeltermine, wie PostgREST sie liefert (`ZEITEN_SPALTEN`). */
export interface ZeitenRow {
  mid_wd: number
  mid_time: string
  we_wd: number
  we_time: string
  /**
   * Die Wechsel beider Zusammenkünfte: `[{ ab, tab, wd, time }]` (jsonb).
   * Fehlt sie — ein Aufrufer, der die Spalte nicht liest —, gilt die Grundzeit
   * für jede Woche.
   */
  zeiten_ab?: unknown
}

/**
 * Was eine Abfrage an `congregations` nennen muss, damit `zeitenAus` die Zeit
 * jeder Woche kennt. Als eine Konstante: Wer die Wechsel nicht mitliest,
 * rechnet nach einem Wechsel mit dem falschen Tag — und nichts schlägt fehl.
 */
export const ZEITEN_SPALTEN = 'mid_wd,mid_time,we_wd,we_time,zeiten_ab'

/** Die Wechsel einer Zusammenkunft aus der Spalte — nur, was sich lesen lässt, nach `ab` geordnet. */
function wechselAus(roh: unknown, tab: 'mid' | 'we'): ZeitWechsel[] {
  if (!Array.isArray(roh)) return []
  // Je Montag einer: Der spätere Eintrag derselben Woche gilt.
  const jeWoche = new Map<string, ZeitWechsel>()
  for (const eintrag of roh as unknown[]) {
    if (!eintrag || typeof eintrag !== 'object') continue
    const { ab, tab: welche, wd, time } = eintrag as Record<string, unknown>
    if (welche !== tab || typeof ab !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ab)) continue
    if (typeof wd !== 'number' || !Number.isInteger(wd) || wd < 0 || wd > 6) continue
    if (typeof time !== 'string' || !/^\d{2}:\d{2}/.test(time)) continue
    jeWoche.set(ab, { ab, wd, time: time.slice(0, 5) })
  }
  return [...jeWoche.values()].sort((a, b) => a.ab.localeCompare(b.ab))
}

/** Ein Wechsel, wie er in `zeiten_ab` steht: mit der Zusammenkunft, für die er gilt. */
export interface ZeitWechselZeile extends ZeitWechsel {
  tab: 'mid' | 'we'
}

/**
 * Werte → Spalten, das Gegenstück zu `zeitenAus`: die Grundzeit in ihre vier
 * Spalten, die Wechsel beider Zusammenkünfte nach `zeiten_ab`.
 *
 * **Immer alle fünf.** Grundzeit und Wechsel ergeben nur zusammen, was in
 * einer Woche gilt — wer die eine ohne die anderen schriebe, setzte den Stand
 * eines zweiten Admins halb zurück.
 */
export function zeitenSpalten(zeiten: MeetingTimes): Omit<ZeitenRow, 'zeiten_ab'> & { zeiten_ab: ZeitWechselZeile[] } {
  return {
    mid_wd: zeiten.mid.wd,
    mid_time: zeiten.mid.time,
    we_wd: zeiten.we.wd,
    we_time: zeiten.we.time,
    zeiten_ab: (['mid', 'we'] as const).flatMap((tab) =>
      (zeiten[tab].spaeter ?? []).map(({ ab, wd, time }) => ({ ab, tab, wd, time })),
    ),
  }
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
 * `src/lib/daten/versammlung.ts` verhindert genau das auf der Client-Seite, und hier steht
 * der Gürtel dazu.
 *
 * Der Rückfall ist derselbe wie ohne Zeile: lieber der übliche Rhythmus als
 * ein Absturz. Falsch angezeigt wäre er nur in dem Fall, in dem sonst gar
 * nichts angezeigt würde.
 */
export function zeitenAus(row: ZeitenRow | undefined): MeetingTimes {
  if (!row) return STANDARD_ZEITEN
  // Ohne Wechsel bleibt das Feld weg: So sieht eine Versammlung aus, die nie
  // einen hatte, und so vergleicht sie sich mit dem Stand davor.
  const mit = (zeit: { wd: number; time: string }, tab: 'mid' | 'we'): MeetingTime => {
    const spaeter = wechselAus(row.zeiten_ab, tab)
    return spaeter.length > 0 ? { ...zeit, spaeter } : zeit
  }
  return {
    mid: mit(
      { wd: kurzerTag(row.mid_wd, STANDARD_ZEITEN.mid.wd), time: kurzeZeit(row.mid_time, STANDARD_ZEITEN.mid.time) },
      'mid',
    ),
    we: mit(
      { wd: kurzerTag(row.we_wd, STANDARD_ZEITEN.we.wd), time: kurzeZeit(row.we_time, STANDARD_ZEITEN.we.time) },
      'we',
    ),
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
 * wird; Gegenstück zu `meetingDateText` im Client und wie dort **immer
 * gerechnet** — den Versatz samt Abweichung bringt der Aufrufer mit
 * (`versatzMitAbweichung`). Das `date`-Feld zählt nur, wo es kein lesbares
 * Startdatum gibt.
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

/**
 * **Der Kalendertag eines Termins** („JJJJ-MM-TT") aus Wochenstart und
 * Versatz — `null` bei unlesbarem Startdatum (Vorlagenwochen). Daran messen die
 * Functions „vorbei" und „abwesend": beim Einspringen, beim Übernehmen eines
 * freien Platzes und beim Tauschen. Bis zum 31.10.2026 stand die Rechnung dort
 * dreimal, je mit eigenem Namen.
 */
export function terminTag(startISO: string, offset: number): string | null {
  const ms = Date.parse(startISO)
  return Number.isNaN(ms) ? null : new Date(ms + offset * 864e5).toISOString().slice(0, 10)
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

/**
 * **Tag und Uhrzeit einer Zusammenkunft in ihrer Woche**: die Abweichung der
 * Woche vor dem Rhythmus — und der Rhythmus ist der, der in dieser Woche gilt
 * (`zeitDerWoche`). Das Gegenstück zu `meetingOffset` und `meetingTime` im
 * Client, für die Functions die eine Stelle dafür.
 *
 * Bis zum 13.11.2026 holte jede Function Versatz und Uhrzeit einzeln und gab
 * die Regelzeit selbst mit (`zeiten[tab].wd`). Seit die Regelzeit zu einem
 * Montag wechseln kann, hinge an jedem dieser Aufrufe, ob er die Woche nennt —
 * hier nennt sie einer.
 */
export function terminDerWoche(
  zeiten: MeetingTimes,
  tab: 'mid' | 'we',
  woche: string,
  dev: Abweichungen | undefined,
): { versatz: number; zeit: string } {
  const regel = zeitDerWoche(zeiten[tab], woche)
  return { versatz: versatzMitAbweichung(dev, tab, regel.wd), zeit: zeitMitAbweichung(dev, tab, regel.time) }
}
