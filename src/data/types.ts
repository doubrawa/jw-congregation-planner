/**
 * Datenmodell — abgeleitet aus dem Design-Handoff (State-Referenz der
 * Prototyp-Logikklasse, siehe docs/design-handoff/README.md → "State").
 *
 * Verbindlich sind Modell und Regeln; die Demo-Daten (Namen, Wochen) im
 * Prototyp sind Platzhalter. Im Prototyp sind `names` Tupel
 * `[name, rolle, bereichsKey]` — hier als Objekt modelliert (idiomatischer);
 * beim Portieren der Demo-Daten entsprechend umformen.
 */

/**
 * Farbschema (Einstellungen → Profil → Darstellung). 4 helle + 4 dunkle
 * Paletten aus dem Design-Export „Farboptionen Programm" (inzwischen kräftiger
 * abgestimmt), dazu „pastell" (die ursprünglichen, weichen Töne), „grau"
 * (ganz ohne Farbton) und „kontrast" (Barrierefreiheit). Labels/Reihenfolge
 * in THEME_LIST (constants.ts), Paletten in styles/tokens.css. Alte Werte
 * 'light'/'dark' werden beim Laden auf weiss/graphit gemappt.
 */
export type Theme =
  | 'weiss'
  | 'indigo'
  | 'blatt'
  | 'papaya'
  | 'pastell'
  | 'grau'
  | 'kontrast'
  | 'graphit'
  | 'bernstein'
  | 'aubergine'
  | 'koralle'

/**
 * App-Sprache (UI). Programm-Inhalte nutzen separat die Versammlungssprache.
 * ~30 weltweit/in Europa relevante Sprachen; DE ist die Basis, alle anderen
 * überschreiben (fehlt eine Übersetzung, fällt die App auf Englisch zurück).
 * RTL-Sprachen (Arabisch etc.) folgen separat (brauchen dir="rtl"-Layout).
 */
export type Lang =
  | 'de' | 'en' | 'es' | 'fr' | 'it' | 'pt' | 'nl' | 'pl' | 'ru' | 'uk'
  | 'ro' | 'el' | 'cs' | 'sk' | 'hu' | 'hr' | 'sr' | 'bg' | 'sv' | 'da'
  | 'fi' | 'no' | 'tr' | 'zh' | 'ja' | 'ko' | 'id' | 'tl' | 'vi' | 'sw'
  | 'ar' | 'he' | 'fa' | 'ur' // RTL-Sprachen (Rechts-nach-links)

/** Sichtbare Bereiche. Die letzten drei nur für Planer/Koordinatoren. */
export type Screen =
  | 'login'
  | 'start'
  | 'programm'
  | 'aufgaben'
  | 'planen'
  | 'personen'
  | 'einstellungen'
  | 'profil'

/** Tatsächliche Zusammenkunft (Meeting-Daten): unter der Woche | am Wochenende. */
export type MeetingKey = 'mid' | 'we'

/**
 * Ansicht-Tab in Programm/Planen: eine Zusammenkunft (MeetingKey), die
 * „Zusammenkünfte für den Predigtdienst" ('fs', eigene Datenquelle fsWeeks)
 * oder die Bearbeiten-Ansicht der Woche ('edit', nur im Planen und nur für
 * Planer — T64).
 *
 * Zwei der vier Werte sind also **keine** Zusammenkunft. Wer aus einem Tab eine
 * Zusammenkunft braucht, geht durch `mtab()` (app/persist.ts) bzw. verengt
 * selbst — der Compiler erzwingt das, weil `MeetingTab` nicht auf `MeetingKey`
 * zuweisbar ist.
 */
export type MeetingTab = MeetingKey | 'fs' | 'edit'

/* ---- Zusammenkünfte für den Predigtdienst ("Treffpunkte") ---- */

/**
 * Grundplan-Regel eines Treffpunkts (regelmäßige Zeit/Ort). Aus den Regeln
 * werden pro Woche die konkreten Instanzen (FsInstance) erzeugt.
 */
export interface FsRule {
  id: string
  grp: string // '' = Versammlungstreffpunkt (alle); sonst Group.id (Gruppentreffpunkt)
  wd: number // JS-Wochentag 0=So … 6=Sa
  time: string // "09:30"
  place: string
  monthly: number // 0 = jede Woche; 1..4 = N-ter Wochentag im Monat
  skipCong: boolean // Gruppen-Regel entfällt, wenn am selben Tag ein Versammlungstreffpunkt ist
}

/** Konkreter Treffpunkt einer Woche (aus einer Regel materialisiert oder manuell). */
export interface FsInstance {
  id: string // "wi|ruleId" (aus Regel) oder "x<zeit>" (manuell für diese Woche)
  ruleId: string | null
  grp: string // '' = Versammlung; sonst Group.id
  wd: number
  time: string
  place: string
  leader: string // zugeteilter Leiter ("" = offen)
  lpid?: string // Person-Id des Leiters — stabile Identität statt Name-Match.
  //             Wie `SlotAssignment.pid`; fehlt bei Altdaten.
  manual?: boolean // nur für diese Woche hinzugefügt (kein Grundplan)
}

/** Rolle einer Person (steuert Sichtbarkeit/Rechte). `keine` = kein Verkündiger
 * (z. B. inaktive Schüler, die nur Schülerteile haben). */
export type Role = 'aeltester' | 'dienstamtgehilfe' | 'verkuendiger' | 'keine'

/**
 * Aufgabenbereiche einer Person (Toggles im Personen-Detail).
 * true = qualifiziert für diese Art Slot.
 *
 * Zwei Sorten von Bereichen:
 *  - **fest**: die Bereichs-Keys der Programm-Slots (`vorsitz` … `studium`).
 *    `wtLeiter`/`wtVertreter` sind keine Slot-Keys, sondern kennzeichnen den
 *    fixen Wachtturm-Studium-Leiter bzw. seinen Vertreter (siehe planning.ts).
 *  - **dynamisch**: je konfiguriertem Hilfsdienst genau ein Bereich mit dem Key
 *    `svc:<dienstKey>` (siehe `serviceQualKey`). Ein neuer Hilfsdienst bringt so
 *    automatisch einen eigenen Schalter im Personen-Detail mit.
 *
 * Alle Felder sind optional lesbar (`boolean | undefined`), damit Alt-Datensätze
 * ohne die neueren Bereiche gültig bleiben.
 */
export interface Qualifications {
  vorsitzMid: boolean // Vorsitz unter der Woche
  vorsitzWe: boolean // Vorsitz am Wochenende
  vortrag: boolean
  gebet: boolean
  bibellesung: boolean // Bibellesung (Schätze aus Gottes Wort)
  leser: boolean // Leser (Versammlungsbibelstudium / Wachtturm-Studium)
  schulung: boolean // Schulungsaufgaben (Gesprächsführer/Vortrag; auch Schwestern)
  schulungPartner: boolean // nur als Gesprächspartner im Schülerteil (nicht Führer)
  studium: boolean // Studium leiten
  treffpunkt: boolean // Treffpunkte leiten (Zusammenkünfte für den Predigtdienst)
  ratgeber?: boolean // Ratgeber der Zusätzlichen Klasse (nur Brüder)
  wtLeiter?: boolean // fester Wachtturm-Studium-Leiter
  wtVertreter?: boolean // Vertreter, wenn der Leiter abwesend ist
  [serviceKey: string]: boolean | undefined // `svc:<dienstKey>` je Hilfsdienst
}

/**
 * Die **festen** Bereichs-Keys. Hilfsdienst-Bereiche sind dynamisch und daher
 * nicht Teil dieser Union — sie werden als freie Strings (`svc:<key>`) geführt.
 */
export type QualificationKey =
  | 'vorsitzMid'
  | 'vorsitzWe'
  | 'vortrag'
  | 'gebet'
  | 'bibellesung'
  | 'leser'
  | 'schulung'
  | 'schulungPartner'
  | 'studium'
  | 'treffpunkt'
  | 'ratgeber' // Ratgeber der Zusätzlichen Klasse (Anweisungen S-38, Absatz 26)
  | 'wtLeiter'
  | 'wtVertreter'

export interface Person {
  id: string
  fn: string // Vorname
  ln: string // Nachname
  /**
   * Optionaler Anzeigename (Kurzform). Überschreibt das automatische
   * "V. Nachname" — nötig, wenn zwei Personen sonst denselben Anzeigenamen
   * hätten (z. B. "Jürgen Doubrawa" statt "J. Doubrawa" ×2), denn Zuteilungen
   * hängen am Anzeigenamen.
   */
  dn?: string
  role: Role
  female?: boolean // Schwester — steuert Partner-Zuordnung im Schülerteil und
  //                  die Brüder-Bereiche (Vorsitz, Gebet, Vortrag …)
  tel: string
  mail: string
  priv: Qualifications
  grp?: string | null // Predigtdienstgruppe (Group.id) oder null = keine
  fam?: string | null // Haushalts-/Familien-Id — gleiche Id = Familienangehörige
  /**
   * Planer-Recht (Feste Rollen im Personen-Detail): sieht Planen/Personen/
   * Einstellungen. Wird beim Einladen in den Code übernommen und bei
   * verknüpften Konten in members.planner gespiegelt (store.tsx).
   */
  planner?: boolean
}

/**
 * Predigtdienstgruppe. Jeder Verkündiger gehört zu höchstens einer Gruppe mit
 * einem Aufseher (`ov`) und einem Gehilfen (`as`) — beides Person-IDs oder null.
 * Die Reinigung rotiert über die Gruppen (Wochenindex mod Anzahl); die Wochen
 * speichern weiterhin den Namens-String ("Gruppe N"), damit alte Daten gültig
 * bleiben.
 */
export interface Group {
  id: string
  name: string // z. B. "Gruppe 1"
  ov: string | null // Aufseher (Person.id)
  as: string | null // Gehilfe (Person.id)
}

/** Farb-/Bereichslogik der Panels (wie im Arbeitsheft). */
export type SectionColor =
  | 'neutral' // Eröffnung / Abschluss
  | 'petrol' // Schätze aus Gottes Wort
  | 'gold' // Uns im Dienst verbessern
  | 'wein' // Unser Leben als Christ
  | 'neutral2' // Hilfsdienste

/** Ein zugeteilter Name auf einem Programmpunkt. Leerer Name = offener Slot. */
export interface SlotAssignment {
  name: string // Anzeigename (Cache); bei pid aus der Person abgeleitet/gepflegt
  pid?: string // Person-Id der Zuteilung — stabile Identität (statt Name-Match).
  //            Fehlt bei externen Rednern (Gastredner/Kreisaufseher) und Altdaten.
  rolle?: string // Rollenlabel: Vorsitz, Gebet, Leiter, Leser, Gesprächspartner …
  bereichsKey?: QualificationKey | string // nötige Qualifikation für den Slot
  male?: boolean // Slot nur männlich besetzbar (z. B. Schülerteil-Vortrag)
}

/** Lied zwischen Programmpunkten (zentriert, kursiv) — eigene Zeile. */
export interface SongItem {
  song: string // z. B. "Lied 128"
}

/** Regulärer Programmpunkt. */
export interface PartItem {
  /**
   * Stabile Kennung dieses Programmpunkts (T37).
   *
   * Die Bestätigungen hingen bis August 2026 an der **Position**:
   * `"60|mid|part|2|1|0"` — Woche, Zusammenkunft, Abschnitt, *laufende Nummer
   * im Abschnitt*, Platz. Das ist die Ursache einer ganzen Reihe von Problemen:
   *
   *  - **T16**: ein eingefügter oder gelöschter LAC-Punkt verschiebt alle
   *    folgenden. Die Bestätigungen blieben an der alten Zahl kleben, der
   *    nachfolgende Punkt erbte eine fremde — und der eigentliche galt wieder
   *    als offen und wurde erneut erinnert. Dagegen musste eigens eine
   *    Umbenennungs-Mechanik gebaut werden (`shiftPartConfirmations`,
   *    `swapPartConfirmations`).
   *  - **T35**: der Wochen-Index *ist* die Position in der Datenbank, weil er
   *    im Schlüssel steckt.
   *
   * Mit einer eigenen Kennung folgt die Bestätigung dem **Punkt**, nicht seinem
   * Platz in der Liste. Verschieben, Einfügen und Löschen lassen sie in Ruhe.
   *
   * Optional, weil Wochen aus der Zeit davor sie nicht haben; die Lade-Migration
   * (`migrateItemIds`) trägt sie nach und benennt die Bestätigungen einmalig mit.
   */
  iid?: string
  num?: number // laufende Nummer (kursiv, Bereichsfarbe)
  title: string
  meta?: string // Dauer / Quelle / Rahmen, z. B. "Von Haus zu Haus · 3 Min."
  /**
   * Dauer in Minuten — die *Zahl*, nicht ihre Schreibweise.
   *
   * `meta` ist Anzeigetext in der Sprache der Wochenseite: „3 Min.“, „3 分“,
   * „Dak. 3“, „٣ دق“. Die Minuten daraus zurückzulesen war der Fehler (T32) —
   * die Minuten-Knöpfe im Planen-Screen erschienen dadurch außerhalb des
   * Deutschen gar nicht erst. Der Import legt die Zahl jetzt hier ab.
   *
   * Optional, weil Wochen aus der Zeit davor sie nicht haben; `itemMinutes`
   * fällt für die auf `meta` zurück.
   */
  mins?: number
  names: SlotAssignment[] // Zuteilungen im Hauptsaal
  /**
   * Dieselben Plätze noch einmal für die Zusätzliche Klasse — nur bei
   * Schülerteilen. Struktur identisch zu `names`.
   *
   * Bewusst ein zweites Feld statt weiterer Einträge in `names`: die
   * Bestätigungs-Schlüssel, das S-89-Formular und die Partner-Regeln greifen
   * über den Index in `names` zu. Angehängte Plätze würden all das verschieben.
   *
   * Ob die Klasse gerade besteht, sagt NICHT dieses Feld — es bleibt beim
   * Ausschalten stehen, damit die Planung erhalten bleibt. Die Antwort gibt
   * `hatAuxKlasse(meeting)`.
   */
  aux?: SlotAssignment[]
}

export type ProgramItem = SongItem | PartItem

/**
 * Ein Hilfsdienst-Platz (Mikrofon, Ton, Ordner …). Wie beim Programm-Slot ist
 * `pid` die stabile Identität; sie fehlt bei der Reinigungs-Rotation (dort steht
 * im Namen „Gruppe N") und bei Altdaten. `{ name: '' }` = offener Platz.
 */
export interface HelperSlot {
  name: string
  pid?: string
}

export interface Section {
  label: string // Caps-Label, z. B. "SCHÄTZE AUS GOTTES WORT"
  farbe: SectionColor
  items: ProgramItem[]
}

export interface Meeting {
  date: string // z. B. "Dienstag, 8. September · 19:00 · Königreichssaal"
  end: string // "Ende ca. 20:45"
  sections: Section[]
  helpers: Record<string, HelperSlot[]> // dienstKey -> Plätze ({ name: '' } = offen)
  /**
   * Ratgeber der Zusätzlichen Klasse (nur Zusammenkunft unter der Woche).
   * Einer je Zusammenkunft, nicht je Programmpunkt: er begleitet die ganze
   * Klasse.
   *
   * Dieses Feld ist zugleich die Marke „hier gibt es eine Zusätzliche Klasse"
   * — ohne Ratgeber keine Klasse (S-38, Absatz 26). Siehe `hatAuxKlasse`.
   */
  auxRatgeber?: SlotAssignment
}

/**
 * Abweichung **einer** Zusammenkunft von der Regel (T30).
 *
 * Der Anlass ist praktisch: mehrere Versammlungen teilen sich oft einen
 * Königreichssaal. Hat eine davon Dienstwoche, muss eine **andere** ihren Tag
 * verlegen, weil man sich abstimmen muss. Eine Sonderwoche verschiebt also
 * Tag und Uhrzeit, sie ändert nicht bloß den Ablauf — und es gibt Gründe, die
 * einen Ausfall rechtfertigen (Kongress, Gedächtnismahl).
 *
 * Deshalb **kein** Satz einzelner Schalter je Sonderfall, sondern eine Aussage:
 * *diese Zusammenkunft weicht ab*. Die bekannten Fälle sind Ausprägungen davon.
 *
 * Bewusst ein eigenes Feld statt eines Eintrags in `Meeting.date`: dort steht
 * **Anzeigetext** in der Sprache der Wochenseite. Aus Anzeigetext Werte
 * zurückzulesen war schon zweimal der Fehler (T32 die Minuten, T33 das Lied).
 * `Meeting.date` bleibt als Quelle bestehen — es trägt die Termine der
 * Alt-Datensätze —, hat aber den niedrigeren Rang.
 */
export interface Abweichung {
  /**
   * Ausgeschriebener Wochentag, kanonisch deutsch („Donnerstag") — wie überall
   * in den Wochendaten; übersetzt wird erst bei der Anzeige.
   */
  day?: string
  /** Abweichende Uhrzeit, „19:00". */
  time?: string
  /** Die Zusammenkunft entfällt in dieser Woche. */
  cancelled?: boolean
  /**
   * Grund, vom Planer frei formuliert („Kongress in Nürnberg", „Saal belegt —
   * Dienstwoche der Nachbarversammlung").
   *
   * Bleibt unübersetzt: es sind die Worte des Planers, wie ein Name oder ein
   * Vortragsthema. Genau deshalb ist er zugleich der einzige Text im Banner,
   * für den nichts erfunden werden musste.
   */
  reason?: string
}

/**
 * Was der Besuch des Kreisaufsehers am Programm verändert hat (T62).
 *
 * Der Ablauf wird beim Einschalten **in den Daten umgebaut**, nicht bei der
 * Anzeige abgeleitet. Der Grund ist die Reichweite: an einer abgeleiteten Woche
 * müssten `countOpenSlots`, `weekConflicts`, `deriveMyTasks`, die
 * Auto-Zuteilung, das S-89-Formular **und die Edge Functions** vorbeikommen —
 * letztere lesen rohes JSONB und müssten die Ableitung ein zweites Mal
 * enthalten. Genau daraus entstand B8. Umgebaute Daten sehen dagegen alle
 * gleich.
 *
 * Umbauen heißt aber nicht wegwerfen: was ersetzt wurde, steht hier, damit das
 * Zurücknehmen es wiederfindet — samt seiner Zuteilungen.
 */
export interface Dienstwoche {
  /** Das ersetzte Versammlungsbibelstudium (unter der Woche). */
  midOrig?: PartItem
  /** Das ungekürzte Wachtturm-Studium (60 Min., mit Leser). */
  weOrig?: PartItem
  /** Kennung des eingefügten Schlussvortrags — damit er beim Zurücknehmen verschwindet. */
  weVortragIid?: string
  /**
   * Titel des ersetzten Bibelstudiums **je Sprachvariante**, und die Meta-Zeile
   * des ungekürzten Studiums ebenso.
   *
   * Die Varianten tragen ihre eigenen Texte; `localizedWeek` übernimmt sie bei
   * der Anzeige. Ohne diese beiden Ablagen käme der Punkt beim Zurücknehmen nur
   * kanonisch-deutsch wieder, und die englische Fassung zeigte weiter „60 Min."
   * für ein Studium, das längst wieder 60 dauert — beides hat der Test gefunden.
   */
  midOrigAlt?: Record<string, string>
  weOrigAlt?: Record<string, string>
}

/**
 * Anlässe, die eine ganze Woche prägen (T64).
 *
 * Alle drei sind Aussagen über die **Woche**, nicht über eine Zusammenkunft —
 * das ist das Aufnahmekriterium. „Saal belegt", „Kongress der
 * Nachbarversammlung" und alles Übrige sind keine Anlässe, sondern Gründe: sie
 * stehen als Freitext bei der betroffenen Zusammenkunft (`Abweichung.reason`).
 */
export type AnlassArt = 'co' | 'mem' | 'kongress'

/** Anlass der Woche samt Termin (T64). */
export interface Anlass {
  art: AnlassArt
  /**
   * Beginn, ISO-Datum. Beim Gedächtnismahl der Abend, beim Kongress der erste
   * Tag. Beim Kreisaufseher-Besuch ohne Bedeutung (er füllt die ganze Woche).
   */
  von?: string
  /**
   * Ende, ISO-Datum — nur beim Kongress. Wird beim Eintragen von `von` mit
   * demselben Wert **vorbelegt**, damit der eintägige Kreiskongress keine
   * zweite Eingabe braucht und trotzdem beide Werte gefüllt sind: so gibt es
   * nirgends den Sonderfall „kein Ende".
   */
  bis?: string
  /** Uhrzeit „19:30" — nur beim Gedächtnismahl (es beginnt nach Sonnenuntergang). */
  zeit?: string
}

export interface Week {
  range: string // z. B. "7.–13. September"
  book: string // Bibelbuch (kursiv)
  /**
   * **Die Kennung der Woche** (T66): ihr Montag als ISO-Datum, „2026-09-07".
   *
   * Nicht die Position im Array — die war bis T66 zugleich Kennung, mit allem,
   * was daran hing (`task_key`, Platzhalter für nicht geladene Wochen, jede
   * Einfügung in der Mitte). Eine Woche *ist* ihre Kalenderwoche; der Index
   * sagt seither nur noch, was vor was kommt.
   *
   * **Immer Montag**, und das ist keine gewählte Konvention: jw.org definiert
   * die Programmwoche selbst als Montag bis Sonntag — „2.–8. März 2026", und
   * der 2. März ist ein Montag —, in jeder Sprache. Wo der Wochenanfang aus der
   * Sprache abgeleitet wird (`Intl.Locale#getWeekInfo()`), gehört das in die
   * Anzeige eines Kalenders, nie in die Bildung eines Schlüssels.
   */
  start: string
  lang?: string // jw.org-Sprachcode, in dem der Import geholt wurde (Herkunft)
  current: boolean // aktuelle Woche (Chip "AKTUELLE WOCHE")
  co?: boolean // Besuch des Kreisaufsehers (Chip, Dienstvortrag statt VBS)
  /**
   * Was der Kreisaufseher-Besuch am Programm verändert hat (T62) — nur
   * gesetzt, solange `co` gilt. Gefragt wird nie direkt danach; `setDienstwoche`
   * baut um und wieder zurück.
   */
  coData?: Dienstwoche
  mem?: boolean // Gedächtnismahl-Woche (Chip + Banner)
  memCancel?: MeetingKey // ausfallende Zusammenkunft (deren Tab zeigt das Gedächtnismahl)
  /**
   * **Anlass der Woche** (T64) — was diese Woche besonders macht, samt Termin.
   *
   * Er ist die *Ursache*; `co`, `mem`/`memCancel` und `dev[…].cancelled` sind
   * seine *Wirkungen* und bleiben eigene Felder. Das hat zwei Gründe, und beide
   * sind hart:
   *
   * 1. **Die Edge Functions lesen rohes JSONB.** Würde der Anlass die
   *    Wirkungen ersetzen, müssten `send-reminders` und `substitute` die
   *    Ableitung ein zweites Mal enthalten — genau daraus entstand B8, und
   *    genau deshalb baut T62 den Ablauf in den Daten um statt ihn abzuleiten.
   * 2. **Nicht jeder Ausfall hat einen Anlass.** „Saal belegt" streicht eine
   *    einzelne Zusammenkunft, ist aber kein Anlass der Woche (siehe
   *    `AnlassArt`): solche Gründe stehen als Freitext bei der betroffenen
   *    Zusammenkunft. Ohne eigenes `cancelled` wäre der Fall nicht abbildbar.
   *
   * Alte Wochen tragen das Feld nicht: `anlassArt()` liest dann `co`/`mem` und
   * liefert dasselbe Ergebnis. Es braucht deshalb **keine Datenwanderung**.
   */
  anlass?: Anlass
  /**
   * Abweichungen je Zusammenkunft (T30) — verlegter Tag, andere Uhrzeit,
   * Ausfall, Grund. Fehlt bei allen Wochen, die der Regel folgen.
   *
   * `mem`/`memCancel` bleiben daneben bestehen und werden weiterhin gelesen:
   * eine Gedächtnismahl-Woche ist ein Ausfall mit bekanntem Grund. Gefragt
   * wird nie direkt, sondern über `istAusgefallen(week, tab)` — die eine
   * Stelle, die beide Quellen kennt.
   */
  dev?: Partial<Record<MeetingKey, Abweichung>>
  mid: Meeting // Unter der Woche
  we: Meeting // Wochenende
  /**
   * Sprachvarianten derselben Woche (jw.org-Sprachcode → strukturgleiche Woche
   * ohne Zuteilungen). Beim Import mitgeholt („Weitere Programmsprachen");
   * die Anzeige übernimmt daraus nur die Texte — Zuteilungen, Flags und
   * Struktur bleiben kanonisch (siehe localizedWeek in data/localize.ts).
   */
  alt?: Record<string, Week>
}

/**
 * Hilfsdienst (Einstellungen). Konfiguriert Anzahl der Slots.
 *
 * Jeder Dienst besitzt genau einen Aufgabenbereich — abgeleitet aus `key`
 * (`serviceQualKey`), nicht gespeichert. Ausnahme: Dienste mit `groups`
 * rotieren Gruppen statt Personen und brauchen daher keinen Bereich.
 */
export interface Service {
  key: string
  name: string
  count: number // 1..6
  groups?: boolean // Gruppen-Rotation (Reinigung: "Gruppe 1–3")
  /**
   * Nur Alt-Datensätze: der früher fest zugeordnete Bereichs-Key (z. B. teilten
   * sich Eingangs- und Saalordner den Bereich `ordner`). Dient ausschließlich der
   * Migration auf `svc:<key>` beim Laden — neue Dienste setzen das Feld nie.
   */
  legacyPriv?: string | null
}

/**
 * Abwesenheit einer Person (Von–Bis als Datum).
 *
 * Wird versammlungsweit geladen, nicht nur die eigene: die Planung muss wissen,
 * wer fehlt. `userId` bleibt daneben stehen, damit „Deine Einträge" im
 * persönlichen Bereich auch dann die eigenen zeigt, wenn das Konto noch keiner
 * Person zugeordnet ist (`personId` null).
 */
export interface Absence {
  id: string
  personId: string | null // verknüpfte Person — nur damit zählt sie für die Planung
  userId: string // Ersteller
  from: string // ISO-Datum
  to: string // ISO-Datum
  reason: string // optional
}

/* ---- Mitglieder & Einladungen (Produktionsmodus) ---- */

/** Mitglied der Versammlung (Konto ↔ Person); Planer sehen alle. */
export interface Member {
  userId: string
  email: string
  personId: string | null
  planner: boolean
}

/** Offener Einladungscode (nur Planer sichtbar). */
export interface Invite {
  id: string
  code: string
  personId: string | null
  planner: boolean
}

/* ---- Persönliche Aufgaben & Bestätigungs-Flow ---- */

/** Status einer dem Nutzer zugeteilten Aufgabe. */
export type TaskStatus = 'offen' | 'bestätigt' | 'verhindert'

/** Ausgefülltes S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“). */
export interface S89Payload {
  name: string
  partner: string // Gesprächspartner/in (leer = kein Partner)
  date: string // "Di, 8. September · 19:00"
  type: string // Aufgabe inkl. Rahmen ("Gespräche beginnen · Informell")
  point: string // Schulungspunkt ("lmd Lektion 1" / "th Lektion 10"), leer möglich
  /** Durchzuführen in der Zusätzlichen Klasse statt im Hauptsaal. */
  aux?: boolean
}

/** Eine dem eingeloggten Nutzer zugeteilte Aufgabe (persönlicher Bereich). */
export interface MyTask {
  id: string
  /**
   * Titel des Programmpunkts, **Versammlungssprache** („Gespräche beginnen") —
   * leer, wo die Rolle allein trägt (Eröffnung/Abschluss, Ratgeber,
   * Hilfsdienste).
   */
  title: string
  /**
   * Rolle, Ratgeber-Bezeichnung oder Dienstname — **App-Sprache**, also die des
   * Lesers, und deshalb ein eigenes Feld.
   *
   * Beides in einen String zu fügen ging lange gut und war trotzdem falsch: die
   * Aufgabenliste schickte den ganzen Titel durch `tp` (Versammlungssprache),
   * und „Vorsitz" stand damit in der Sprache der Versammlung, während der Rest
   * des Bildschirms in der des Lesers war. `useT` sagt es ausdrücklich:
   * „tu(name) … Namen/Rollen/Zeiten in App-Sprache". Zusammengesetzt wird erst
   * beim Anzeigen (`aufgabenLabel`).
   */
  rolle?: string
  date: string // "Di, 8. September · ca. 19:35"
  chip: string // Countdown-Text NUR im Demo-Modus (z. B. "in 4 Tagen")
  at?: number | null // UTC-ms des Zusammenkunftstags → Live-Countdown (Intl); null = keiner
  status: TaskStatus
  s89: S89Payload | null // Schulungsaufgabe → S-89 anzeigbar
}

/**
 * Offenes Ersatzgesuch für einen Hilfsdienst: Der Bearbeiter hat „verhindert"
 * gemeldet; qualifizierte Personen (gleicher Dienst) können einspringen. Rein
 * abgeleitet (planning.ts deriveSubstituteReqs), nicht gespeichert.
 */
export interface SubstituteReq {
  key: string // Hilfsdienst-task_key
  svc: string // Dienst-Key
  title: string // Dienstname (Anzeige über tu)
  date: string
  at?: number | null // UTC-ms des Zusammenkunftstags → Countdown
  declinedBy: string // Anzeigename der Person, die nicht kann
}

/**
 * Bestätigungs-Status je Aufgabe (Produktionsmodus). Schlüssel = stabiler
 * Slot-Pfad (siehe taskKey in planning.ts); nur bestätigt/verhindert werden
 * gespeichert — fehlender Eintrag bedeutet „offen“.
 */
export type ConfirmationMap = Record<string, TaskStatus>

/** Erinnerungs-Einstellungen (Einstellungen → ERINNERUNGEN). */
export interface Reminders {
  first: number // erste Erinnerung: N Tage vorher (1..21)
  last: number // letzte Erinnerung: N Tage vorher (0..7, 0 = am Tag)
  repeat: boolean // täglich wiederholen, bis bestätigt
}

/* ---- Zuteilungs-Sheet (Planen) ---- */

interface SlotSelectionBase {
  wi: number // Wochenindex
  tab: MeetingKey
  label: string // Sheet-Titel, z. B. "Bibellesung · Jer 32:6-18 · Leser"
  priv: QualificationKey | string | null // nötige Qualifikation (null = alle)
  groups: boolean // Gruppen-Rotation (Reinigung): Kandidaten sind Gruppe 1–3
}

/** Slot eines Programmpunkts (Section/Item/Name-Index). */
export interface PartSlotSelection extends SlotSelectionBase {
  kind: 'part'
  si: number
  ii: number
  ni: number
  guest?: boolean // externer Redner (Gastredner/Kreisaufseher): Freitext statt Personenliste
  /**
   * Platz in der Zusätzlichen Klasse statt im Hauptsaal (PartItem.aux).
   * Bewusst ein Zusatz zur bestehenden Auswahl statt einer eigenen Art: das
   * Zuteilungs-Sheet, die Konfliktprüfung und das S-89-Formular arbeiten
   * dadurch unverändert weiter.
   */
  aux?: boolean
}

/** Slot eines Hilfsdienstes (Dienst-Key + Position). */
export interface HelperSlotSelection extends SlotSelectionBase {
  kind: 'helper'
  svc: string
  pos: number
}

/** Leiter-Slot eines Treffpunkts (Zusammenkunft für den Predigtdienst). */
export interface FsSlotSelection {
  kind: 'fs'
  wi: number // Wochenindex
  instId: string // FsInstance.id
  label: string
  priv: QualificationKey | string | null
  groups: boolean
}

/**
 * Ratgeber-Platz der Zusätzlichen Klasse. Eigene Art, weil er an der
 * Zusammenkunft hängt und nicht an einem Programmpunkt — er hat also weder
 * Sektions- noch Punkt-Index.
 */
export interface RatgeberSlotSelection extends SlotSelectionBase {
  kind: 'ratgeber'
  tab: MeetingKey
}

export type SlotSelection =
  | PartSlotSelection
  | HelperSlotSelection
  | FsSlotSelection
  | RatgeberSlotSelection

/** Slot einer echten Zusammenkunft (Programmpunkt, Hilfsdienst oder Ratgeber). */
export type MeetingSlotSelection =
  | PartSlotSelection
  | HelperSlotSelection
  | RatgeberSlotSelection

export type NotificationType =
  | 'zuteilung' // Neue Zuteilung
  | 'erinnerung' // Erinnerung
  | 'gesendet' // Zuteilung(en) gesendet
  | 'import' // Programm importiert
  | 'verhindert' // Verhinderung gemeldet (an Koordinator)

export interface Notification {
  id: string
  type: NotificationType
  title: string
  text: string
  /**
   * Zeitpunkt der Entstehung, ISO. **Kein fertiger Satz.**
   *
   * Hier stand bis zum 13. August 2026 `time: string` mit einem beim Laden
   * gebauten deutschen Text („vor 2 Std."). Übersetzt werden konnte der nur
   * über eine feste Liste von Zeichenketten — und die deckte genau die
   * Stundenzahl ab, die zufällig in den Testdaten stand. Die Form wird jetzt
   * beim Anzeigen gebildet (`relativeZeit` in i18n/zeit.ts).
   */
  at: string
  read: boolean
  taskId?: string // verknüpfte MyTask → Inline-„Bestätigen“ in der Mitteilung
  /**
   * In dieser App gerade entstanden und noch nicht verteilt. Aus der Datenbank
   * geladene Mitteilungen tragen das Kennzeichen nie — daran erkennt persist.ts,
   * was an die Planer zu schicken ist, ohne eine Liste von Aktionen zu pflegen.
   */
  local?: true
}
