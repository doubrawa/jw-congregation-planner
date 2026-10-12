/**
 * **Die Datei des Planungsprogramms lesen** (T122) — Format „Vortragsplan",
 * Version 1, beschrieben in `docs/vortragsplan-import.md`:
 *
 *     <vortragsplan version="1" von="2026-10-01" bis="2027-03-31">
 *       <vortrag datum="2026-11-08">
 *         <redner eigener="true">…</redner>
 *         <versammlung>…</versammlung>
 *         <thema>…</thema>
 *         <lied>151</lied>
 *       </vortrag>
 *     </vortragsplan>
 *
 * Gelesen wird **auf dem Gerät**, und weiter geht nur, was die App braucht.
 * Was das Programm sonst noch ausgibt — eine Telefonnummer, eine E-Mail-Adresse
 * —, wird hier übergangen und mit Namen gemeldet (`ignoriert`), damit der
 * Planer in der Vorschau sieht, dass es das Gerät nicht verlässt. Von
 * auswärtigen Rednern dürfen nur Name und Versammlung in die Cloud.
 */

import { fromIso, isoDay, montagVon } from '../data/meeting-dates'
import type { PlanVortrag, Vortragsplan } from '../data/vortragsplan'

/** Warum ein einzelner Vortrag nicht übernommen wird. */
export type LeseFehlerGrund = 'datum' | 'redner' | 'versammlung' | 'lied' | 'doppelt'

export interface LeseFehler {
  /** Das Datum, wie es in der Datei steht (kann selbst der Fehler sein). */
  datum: string
  grund: LeseFehlerGrund
}

/** Warum die ganze Datei nicht gelesen werden kann. */
export type DateiFehler = 'keinXml' | 'wurzel' | 'version' | 'zeitraum'

export type LeseErgebnis =
  | { ok: true; plan: Vortragsplan; fehler: LeseFehler[]; ignoriert: string[] }
  | { ok: false; grund: DateiFehler }

/** Bekannte Namen je Element — alles andere landet in `ignoriert`. */
const BEKANNT = {
  wurzel: new Set(['version', 'von', 'bis']),
  vortrag: new Set(['datum']),
  kinder: new Set(['redner', 'versammlung', 'thema', 'lied']),
  redner: new Set(['eigener']),
}

/**
 * Bytes als Text, in der Kodierung, die die Datei selbst angibt: zuerst die
 * Bytefolge am Anfang (BOM), dann die XML-Deklaration, sonst UTF-8. Ein
 * Programm unter Windows schreibt gern `windows-1252` — als UTF-8 gelesen
 * würden daraus die Umlaute der Namen zerbrechen.
 */
function alsText(daten: ArrayBuffer): string {
  const bytes = new Uint8Array(daten)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  const kopf = new TextDecoder('windows-1252').decode(bytes.subarray(0, 256))
  const kodierung = /^<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(kopf.trimStart())?.[1]
  try {
    return new TextDecoder(kodierung ?? 'utf-8').decode(bytes)
  } catch {
    // Eine Kodierung, die der Browser nicht kennt: lieber UTF-8 als gar nichts.
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Text eines Elements, Leerraum zusammengezogen (Zeilenumbrüche aus eingerücktem XML). */
function text(el: Element | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Ein gültiges ISO-Datum — auch der Kalender muss stimmen (kein 31. Februar). */
function istDatum(wert: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) && isoDay(fromIso(wert)) === wert
}

/** `eigener="true"` — auch `1` und `ja` gelten, ohne Groß-/Kleinschreibung. */
function wahr(wert: string | null): boolean {
  return ['true', '1', 'ja'].includes((wert ?? '').trim().toLowerCase())
}

function attributeMerken(el: Element, bekannt: ReadonlySet<string>, ignoriert: Set<string>): void {
  for (const attr of Array.from(el.attributes)) {
    // Namensraum-Angaben gehören zum XML, nicht zum Inhalt.
    if (attr.name.startsWith('xmlns') || attr.name.startsWith('xsi:')) continue
    if (!bekannt.has(attr.name)) ignoriert.add(attr.name)
  }
}

/**
 * Die Datei lesen. Eine Datei, die nicht als Ganzes stimmt (kein XML, falsche
 * Wurzel, unbekannte Version, ungültiger Zeitraum), wird abgewiesen; einzelne
 * fehlerhafte Vorträge werden übergangen und als `fehler` gemeldet.
 */
export function vortragsplanLesen(daten: ArrayBuffer | string): LeseErgebnis {
  const quelle = typeof daten === 'string' ? daten : alsText(daten)
  const doc = new DOMParser().parseFromString(quelle, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return { ok: false, grund: 'keinXml' }
  const wurzel = doc.documentElement
  if (wurzel.localName !== 'vortragsplan') return { ok: false, grund: 'wurzel' }
  if (wurzel.getAttribute('version')?.trim() !== '1') return { ok: false, grund: 'version' }

  const von = wurzel.getAttribute('von')?.trim() ?? ''
  const bis = wurzel.getAttribute('bis')?.trim() ?? ''
  if ((von && !istDatum(von)) || (bis && !istDatum(bis)) || (von && bis && von > bis)) {
    return { ok: false, grund: 'zeitraum' }
  }

  const ignoriert = new Set<string>()
  const fehler: LeseFehler[] = []
  const gelesen: PlanVortrag[] = []
  attributeMerken(wurzel, BEKANNT.wurzel, ignoriert)

  for (const el of Array.from(wurzel.children)) {
    if (el.localName !== 'vortrag') {
      ignoriert.add(el.localName)
      continue
    }
    attributeMerken(el, BEKANNT.vortrag, ignoriert)
    const kinder = new Map<string, Element>()
    for (const kind of Array.from(el.children)) {
      if (!BEKANNT.kinder.has(kind.localName)) ignoriert.add(kind.localName)
      else if (!kinder.has(kind.localName)) kinder.set(kind.localName, kind)
    }
    const rednerEl = kinder.get('redner')
    if (rednerEl) attributeMerken(rednerEl, BEKANNT.redner, ignoriert)

    const datum = el.getAttribute('datum')?.trim() ?? ''
    const redner = text(rednerEl)
    const eigener = wahr(rednerEl?.getAttribute('eigener') ?? null)
    const versammlung = eigener ? '' : text(kinder.get('versammlung'))
    const lied = text(kinder.get('lied'))
    const grund: LeseFehlerGrund | null = !istDatum(datum)
      ? 'datum'
      : !redner
        ? 'redner'
        : !eigener && !versammlung
          ? 'versammlung'
          : lied && !/^\d{1,3}$/.test(lied)
            ? 'lied'
            : null
    if (grund) {
      fehler.push({ datum, grund })
      continue
    }
    gelesen.push({
      datum,
      redner,
      versammlung,
      eigener,
      thema: text(kinder.get('thema')),
      // „007" ist das Lied 7 — gespeichert wird die Zahl, wie beim Eingabefeld.
      lied: lied && Number(lied) > 0 ? String(Number(lied)) : '',
    })
  }

  // Zwei Vorträge in derselben Woche: Welcher gilt, kann die App nicht wissen —
  // beide bleiben draußen, und die Vorschau nennt sie.
  const wochen = gelesen.map((v) => montagVon(v.datum))
  const jeWoche = new Map<string, number>()
  for (const woche of wochen) jeWoche.set(woche, (jeWoche.get(woche) ?? 0) + 1)
  const vortraege: PlanVortrag[] = []
  gelesen.forEach((v, i) => {
    if ((jeWoche.get(wochen[i] ?? '') ?? 0) > 1) fehler.push({ datum: v.datum, grund: 'doppelt' })
    else vortraege.push(v)
  })
  vortraege.sort((a, b) => a.datum.localeCompare(b.datum))
  fehler.sort((a, b) => a.datum.localeCompare(b.datum))

  // Ohne Angabe gilt der Zeitraum der Vorträge selbst; ein Vortrag außerhalb
  // einer Angabe erweitert ihn, statt verloren zu gehen.
  const tage = [von, bis, ...vortraege.map((v) => v.datum)].filter(Boolean).sort()
  const erster = tage[0] ?? ''
  const letzter = tage[tage.length - 1] ?? ''
  // Wo die Datei etwas sagen wollte, das nicht lesbar war, bleibt die Woche,
  // wie sie ist — sonst entfiele dort ein Vortrag, nur weil die Datei Fehler hat.
  const fehlerWochen = [...new Set(fehler.filter((f) => istDatum(f.datum)).map((f) => montagVon(f.datum)))].sort()
  return {
    ok: true,
    plan: { von: erster, bis: letzter, vortraege, fehlerWochen },
    fehler,
    ignoriert: [...ignoriert].sort(),
  }
}
