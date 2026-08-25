/**
 * Ziffern fremder Schriften — lesen und schreiben.
 *
 * jw.org setzt die Ziffern der jeweiligen Schrift: „٣ دق“ (arabisch-indisch),
 * „३ मि.“ (Devanagari), „๓ นาที“ (thailändisch). Darauf liefert `Number()`
 * NaN und `/\d/` trifft nicht — weshalb die Minuten eines Programmpunkts
 * außerhalb des Deutschen unlesbar waren (T32).
 *
 * Unicode legt jeden Dezimalziffernsatz lückenlos und in derselben Reihenfolge
 * ab, die Null zuerst. Der Wert einer Ziffer ist deshalb ihr Abstand zur Null
 * ihres eigenen Satzes — und den fand man, indem man so weit zurückging, wie
 * das Zeichen davor noch eine Ziffer ist.
 *
 * **Nur endet nicht jeder Satz vor einer Nicht-Ziffer.** Es gibt Sätze, die
 * unmittelbar aneinandergrenzen; die Zählung läuft dann in den Nachbarsatz
 * hinein. Deshalb steht sie jetzt hinter einer aus `Intl` **abgeleiteten**
 * Tabelle — keine Sprachliste von Hand, sondern das, was die Laufzeitumgebung
 * ohnehin weiß (siehe `ziffernTabelle`). Das Schreiben (`zahlWieVorlage`)
 * kommt über denselben Weg an den richtigen Satzanfang.
 *
 * Dieselbe Rechnung steht im Import-Parser
 * (`supabase/functions/import-week/parse.ts`). Sie dort und hier zu haben ist
 * bewusst vorläufig: Client und Edge Function teilen bislang keinen Code —
 * genau das ist T40.
 */

/** Eine Dezimalziffer irgendeiner Schrift. */
const ZIFFER = /\p{Nd}/u
/** Eine zusammenhängende Ziffernfolge. */
const ZIFFERNFOLGE = /\p{Nd}+/u

/**
 * Ziffernwerte, die die Laufzeitumgebung selbst kennt.
 *
 * **Warum es das braucht, obwohl die Rückwärts-Zählung so schön ohne Tabelle
 * auskommt:** Sie setzt voraus, dass vor der Null eines Satzes keine Ziffer
 * steht. Unicode garantiert das nicht — es gibt Sätze, die **unmittelbar
 * aneinandergrenzen**. Nachgemessen an allen 78 Zahlensystemen, die `Intl`
 * führt: fünf sind betroffen, vier davon mathematische Auszeichnungen — und
 * eines eine echte Sprache, das **ostliche Pwo-Karen** (U+116DA, direkt hinter
 * der Neun der Pao-Ziffern). Von dort aus läuft die Zählung in den Nachbarsatz
 * und schlägt an der Zehnerbremse an: `zahl('𑛚')` ergab 10 statt 0.
 *
 * Die Tabelle ist trotzdem keine von Hand gepflegte Liste — sie wird aus
 * `Intl` **abgeleitet**, wie die relativen Zeitangaben (`i18n/zeit.ts`) und die
 * Wochentagsnamen: `format(1234567890)` liefert je System dessen zehn Ziffern
 * in einem Zug, die letzte ist die Null. Was `Intl` nicht kennt, fällt auf die
 * Zählung zurück; für einen Satz, den die Laufzeit noch nicht führt, ist sie
 * weiterhin die beste verfügbare Antwort.
 *
 * Aufgebaut wird erst beim ersten Bedarf: Wer die App auf Deutsch benutzt,
 * zahlt die 77 Formatierungen nie.
 */
let werte: Map<string, number> | null = null

function ziffernTabelle(): Map<string, number> {
  if (werte) return werte
  const map = new Map<string, number>()
  let systeme: string[] = []
  try {
    systeme = Intl.supportedValuesOf('numberingSystem')
  } catch {
    // Ältere Laufzeit ohne `supportedValuesOf` — dann bleibt es bei der Zählung.
  }
  for (const nu of systeme) {
    let ziffern: string
    try {
      ziffern = new Intl.NumberFormat(`en-u-nu-${nu}`, { useGrouping: false }).format(1234567890)
    } catch {
      continue
    }
    const zeichen = [...ziffern]
    // Genau zehn Zeichen und alle Dezimalziffern: algorithmische Systeme
    // (römisch, hebräisch) und Wortschriften (`hanidec`) fallen damit heraus —
    // `ZIFFERNFOLGE` fände sie ohnehin nie.
    if (zeichen.length !== 10 || !zeichen.every((c) => ZIFFER.test(c))) continue
    zeichen.forEach((c, i) => map.set(c, (i + 1) % 10))
  }
  werte = map
  return map
}

/** Rückfall: von der Ziffer aus rückwärts zählen, solange Ziffern kommen. */
function ziffernWertGezaehlt(c: string): number {
  let cp = c.codePointAt(0) ?? 0
  let n = 0
  while (n < 10 && ZIFFER.test(String.fromCodePoint(cp - 1))) {
    cp--
    n++
  }
  return n
}

/** Wert einer einzelnen Ziffer: „٣“ → 3, „7“ → 7. */
function ziffernWert(c: string): number {
  return ziffernTabelle().get(c) ?? ziffernWertGezaehlt(c)
}

/** Codepunkt der Null in dem Ziffernsatz, zu dem `c` gehört. */
function nullPunkt(c: string): number {
  return (c.codePointAt(0) ?? 0) - ziffernWert(c)
}

/** Zahl aus einer Ziffernfolge beliebiger Schrift: „٣٠“ → 30. */
export function zahl(ziffern: string): number {
  let wert = 0
  for (const c of ziffern) wert = wert * 10 + ziffernWert(c)
  return wert
}

/** Erste Zahl in einem Text — `null`, wenn keine darin steht. */
export function ersteZahl(text: string): number | null {
  const treffer = ZIFFERNFOLGE.exec(text)
  return treffer ? zahl(treffer[0]) : null
}

/**
 * `wert` in der Schrift schreiben, die `vorlage` verwendet: (30, „٣“) → „٣٠“.
 * Steht in der Vorlage keine Ziffer, bleibt es bei westlichen.
 */
export function zahlWieVorlage(wert: number, vorlage: string): string {
  const muster = [...vorlage].find((c) => ZIFFER.test(c))
  const basis = muster ? nullPunkt(muster) : 0x30
  return [...String(wert)].map((d) => String.fromCodePoint(basis + Number(d))).join('')
}

/**
 * Erste Zahl im Text durch `wert` ersetzen, in der dort verwendeten Schrift:
 * („٣ دق“, 15) → „١٥ دق“. Ohne Ziffer im Text bleibt er unverändert.
 */
export function ersteZahlErsetzen(text: string, wert: number): string {
  const treffer = ZIFFERNFOLGE.exec(text)
  if (!treffer) return text
  const ende = treffer.index + treffer[0].length
  return text.slice(0, treffer.index) + zahlWieVorlage(wert, treffer[0]) + text.slice(ende)
}

/**
 * **Eine bestimmte** Zahl im Text durch eine andere ersetzen, in der dort
 * verwendeten Schrift: („Studienartikel 28 · 60 Min.", 60, 30) →
 * „Studienartikel 28 · 30 Min.". Kommt `alt` nicht vor, bleibt der Text, wie er
 * ist.
 *
 * Warum nicht `ersteZahlErsetzen`: die Meta-Zeile eines LAC-Punkts beginnt mit
 * der Dauer, die des Wachtturm-Studiums **nicht** — dort steht zuerst die
 * Nummer des Studienartikels. Die erste Zahl zu ersetzen machte aus
 * „Studienartikel 28 · 60 Min." ein „Studienartikel 30 · 60 Min.": die Dauer
 * blieb, der Artikel wurde ein anderer. Genau das hat der Test zu T62 gefunden.
 *
 * Verglichen wird über den **Wert**, nicht über die Zeichen — „٦٠", „60" und
 * „६०" sind dieselbe Zahl. Die alte Dauer weiß der Aufrufer aus `item.mins`
 * (T32), er muss sie also nicht aus dem Text zurücklesen.
 */
export function zahlErsetzen(text: string, alt: number, neu: number): string {
  for (const treffer of text.matchAll(new RegExp(ZIFFERNFOLGE.source, 'gu'))) {
    if (zahl(treffer[0]) !== alt) continue
    const von = treffer.index
    return text.slice(0, von) + zahlWieVorlage(neu, treffer[0]) + text.slice(von + treffer[0].length)
  }
  return text
}
