/**
 * **Was ein Planer an einer Woche ändern darf** — die Grenze der Rechte-Stufe
 * „Planer" (4.10.2026).
 *
 * Der Betreiber hat drei Stufen gewünscht: Verkündiger, Planer und Admin.
 * „Planer sollen Zuteilungen machen dürfen, aber nur Admins dürfen auch die
 * Pläne ändern." Zuteilen und Plan ändern schreiben aber **dieselbe Zeile** —
 * die Woche liegt als ein JSONB-Dokument in `weeks.data`. Eine Richtlinie der
 * Datenbank sieht nur „Zeile geändert"; ein ausgeblendeter Knopf sichert
 * nichts. Deshalb schreibt ein Planer seine Wochen über die Edge Function
 * `zuteilen`, und die vergleicht hier alten und neuen Stand.
 *
 * **Verglichen wird das Gerippe:** die Woche ohne alles, was ein Planer setzen
 * darf. Stimmen die Gerippe überein, hat er nur zugeteilt. Erlaubt ist:
 *
 *  - jeder Name auf jedem Platz (`name`, `pid`, `herkunft`) — Programmpunkte,
 *    Zusätzliche Klasse, Ratgeber, Hilfsdienste;
 *  - die Hilfsdienste ganz: Sie tragen nur Zuteilungen, und `assignSlot`
 *    verlängert eine Platzreihe, die kürzer ist als die eingestellte Zahl;
 *  - der Wechsel zwischen eigenem Redner, Gastredner und Kreisaufseher am
 *    Vortragsplatz — das Zuteilungsblatt setzt die Rolle mit dem Namen;
 *  - **die vier Grenzfälle, die der Betreiber dem Planer zugesprochen hat**,
 *    soweit sie die Woche betreffen: das Vortragsthema (`editTalkTheme`), das
 *    Thema der Vorträge des Kreisaufsehers (`setPartThema`), die Lieder am
 *    Wochenende (`setOpeningSong`/`setClosingSong`) und der Partner-Platz eines
 *    Schülerteils (`togglePartner`). Die Themen und Lieder stehen auch in den
 *    Sprachvarianten (`alt`) — die gehen mit.
 *
 * Alles andere — Ablauf, Minuten, Abschnitte, Anlass, Sonderwoche, Termine,
 * die Zusätzliche Klasse an oder aus — bleibt dem Admin.
 *
 * Arbeitet auf rohem JSON und kennt deshalb keine Client-Typen: Die Function
 * bekommt, was die App schickt, und vertraut ihm nicht.
 */

/** Ein JSON-Objekt, wie es aus `JSON.parse` kommt. */
type Objekt = Record<string, unknown>

const istObjekt = (x: unknown): x is Objekt => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * Rollen am Vortragsplatz. Zwischen ihnen wechselt das Zuteilungsblatt beim
 * Zuteilen: eine Person der Versammlung macht den Platz zum eigenen Redner,
 * „Entfernen" setzt ihn auf den Gastredner zurück, der Freitext behält den
 * Kreisaufseher (`AssignSheet`, `clearAssignments`).
 */
const REDNER_ROLLEN: ReadonlySet<string> = new Set(['Redner', 'Gastredner', 'Kreisaufseher'])

/**
 * Die beiden Vorsitz-Bereiche. Die App gleicht sie beim Laden an die
 * Zusammenkunft an (`normalizeChairKeys`); eine ältere Woche bekäme sonst beim
 * ersten Zuteilen einen anderen Bereich und gälte als umgebaut.
 */
const VORSITZ_BEREICHE: ReadonlySet<string> = new Set(['vorsitzMid', 'vorsitzWe'])

/** Die Rolle ohne angehängte Altlast („Gastredner · Vers. X" → „Gastredner"). */
const rolleBasis = (rolle: string): string => rolle.split(' · ')[0] ?? rolle

/** Die Zusammenkünfte einer Woche — und die ihrer Sprachvarianten. */
const ZUSAMMENKUENFTE = ['mid', 'we'] as const
type Zusammenkunft = (typeof ZUSAMMENKUENFTE)[number]

function abschnitte(meeting: unknown): Objekt[] {
  const sections = istObjekt(meeting) ? meeting.sections : undefined
  return Array.isArray(sections) ? sections.filter(istObjekt) : []
}

function punkte(section: Objekt): unknown[] {
  return Array.isArray(section.items) ? section.items : []
}

function plaetze(item: Objekt): Objekt[] {
  const names = Array.isArray(item.names) ? item.names : []
  return names.filter(istObjekt)
}

/**
 * Programmpunkte, deren Titel der Planer setzen darf — als `tab|si|ii`.
 *
 * - **Am Wochenende der öffentliche Vortrag:** sein Thema trägt der Planer mit
 *   dem Redner ein. Erkannt am Abschnitt (`kind: 'vortrag'`) oder am Platz
 *   (Bereich `vortrag`).
 * - **Jeder Punkt mit einem Redner-Platz**, auch unter der Woche: der
 *   Dienstvortrag der Kreisaufseher-Woche (`setPartThema`) — der Platz kann
 *   beim Zuteilen von „Kreisaufseher" zu „Redner" wechseln.
 *
 * Die Sprachvarianten tragen keine Plätze; ihre Punkte stehen an derselben
 * Stelle wie die der kanonischen Woche (`WeekVariant`), deshalb gilt die
 * Stelle für sie mit.
 */
function freieTitel(woche: unknown): Set<string> {
  const frei = new Set<string>()
  if (!istObjekt(woche)) return frei
  for (const tab of ZUSAMMENKUENFTE) {
    abschnitte(woche[tab]).forEach((section, si) => {
      punkte(section).forEach((item, ii) => {
        if (!istObjekt(item)) return
        const slots = plaetze(item)
        const redner = slots.some((s) => typeof s.rolle === 'string' && REDNER_ROLLEN.has(rolleBasis(s.rolle)))
        const vortrag = tab === 'we' && (section.kind === 'vortrag' || slots.some((s) => s.bereichsKey === 'vortrag'))
        if (redner || vortrag) frei.add(`${tab}|${si}|${ii}`)
      })
    })
  }
  return frei
}

/** „Lied 78 · Gebet" → „Lied · Gebet": die Nummer setzt der Planer (`setSong`). */
function ohneLiednummer(titel: string): string {
  return titel
    .split(' · ')
    .map((atom) => (atom === 'Lied' || atom.startsWith('Lied ') ? 'Lied' : atom))
    .join(' · ')
}

/** Ein Platz ohne seine Besetzung. */
function platzGerippe(slot: Objekt): Objekt {
  delete slot.name
  delete slot.pid
  delete slot.herkunft
  if (typeof slot.rolle === 'string') {
    // Der Vortragsplatz wechselt die Rolle mit dem Namen (siehe oben). Die
    // Beschriftung „Schüler" kommt und geht mit dem Partner (`togglePartner`).
    if (REDNER_ROLLEN.has(rolleBasis(slot.rolle))) slot.rolle = 'Redner'
    else if (slot.rolle === 'Schüler') delete slot.rolle
  }
  if (typeof slot.bereichsKey === 'string' && VORSITZ_BEREICHE.has(slot.bereichsKey)) slot.bereichsKey = 'vorsitz'
  return slot
}

/** Eine Platzreihe ohne Besetzung und ohne Partner-Platz (`togglePartner`). */
function reiheGerippe(reihe: unknown): unknown {
  if (!Array.isArray(reihe)) return reihe
  return reihe
    .filter((s) => !(istObjekt(s) && s.bereichsKey === 'schulungPartner'))
    .map((s) => (istObjekt(s) ? platzGerippe(s) : s))
}

/** Eine Zusammenkunft (kanonisch oder Sprachvariante) ohne das, was der Planer setzen darf. */
function zusammenkunftGerippe(meeting: unknown, tab: Zusammenkunft, frei: ReadonlySet<string>): void {
  if (!istObjekt(meeting)) return
  delete meeting.helpers
  // Jede Themen-Änderung merkt sich als Umbau (`umbauMerken`) — die Marke
  // folgt der Änderung, sie ist selbst keine.
  delete meeting.umgebaut
  if (istObjekt(meeting.auxRatgeber)) platzGerippe(meeting.auxRatgeber)
  abschnitte(meeting).forEach((section, si) => {
    punkte(section).forEach((item, ii) => {
      if (!istObjekt(item)) return
      if (frei.has(`${tab}|${si}|${ii}`)) delete item.title
      else if (tab === 'we' && typeof item.title === 'string') item.title = ohneLiednummer(item.title)
      item.names = reiheGerippe(item.names)
      if ('aux' in item) item.aux = reiheGerippe(item.aux)
    })
  })
}

/**
 * Besetzungen überall sonst — vor allem in `coData`: Die Kreisaufseher-Woche
 * hebt die ersetzten Punkte samt ihren Zuteilungen dort auf.
 */
function ohneBesetzung(x: unknown): void {
  if (Array.isArray(x)) {
    for (const e of x) ohneBesetzung(e)
    return
  }
  if (!istObjekt(x)) return
  delete x.name
  delete x.pid
  delete x.herkunft
  for (const v of Object.values(x)) ohneBesetzung(v)
}

/**
 * Die Woche ohne alles, was ein Planer setzen darf. `frei` nennt die Punkte,
 * deren Titel dazugehören (`freieTitel` beider Stände).
 */
export function wochenGerippe(woche: unknown, frei: ReadonlySet<string> = freieTitel(woche)): unknown {
  const kopie: unknown = structuredClone(woche)
  if (!istObjekt(kopie)) return kopie
  for (const tab of ZUSAMMENKUENFTE) {
    zusammenkunftGerippe(kopie[tab], tab, frei)
    if (istObjekt(kopie.alt)) {
      for (const variante of Object.values(kopie.alt)) {
        if (istObjekt(variante)) zusammenkunftGerippe(variante[tab], tab, frei)
      }
    }
  }
  ohneBesetzung(kopie)
  return kopie
}

/** Tiefer Vergleich zweier JSON-Werte; die Reihenfolge der Schlüssel zählt nicht. */
export function gleich(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => gleich(x, b[i]))
  }
  if (!istObjekt(a) || !istObjekt(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.hasOwn(b, k) && gleich(a[k], b[k]))
}

/**
 * **Hat sich zwischen `vorher` und `nachher` nur geändert, was ein Planer
 * ändern darf?**
 *
 * Die freien Titel kommen aus **beiden** Ständen: Teilt der Planer den
 * Dienstvortrag einem Bruder der Versammlung zu, heißt der Platz danach
 * „Redner" statt „Kreisaufseher" — die Stelle bleibt dieselbe.
 */
export function nurZuteilungen(vorher: unknown, nachher: unknown): boolean {
  const frei = new Set([...freieTitel(vorher), ...freieTitel(nachher)])
  return gleich(wochenGerippe(vorher, frei), wochenGerippe(nachher, frei))
}
