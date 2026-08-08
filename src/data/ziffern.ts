/**
 * Ziffern fremder Schriften — lesen und schreiben.
 *
 * jw.org setzt die Ziffern der jeweiligen Schrift: „٣ دق“ (arabisch-indisch),
 * „३ मि.“ (Devanagari), „๓ นาที“ (thailändisch). Darauf liefert `Number()`
 * NaN und `/\d/` trifft nicht — weshalb die Minuten eines Programmpunkts
 * außerhalb des Deutschen unlesbar waren (T32).
 *
 * Eine Tabelle braucht es dafür nicht. Unicode legt jeden Dezimalziffernsatz
 * lückenlos und in derselben Reihenfolge ab, die Null zuerst. Der Wert einer
 * Ziffer ist deshalb ihr Abstand zur Null ihres eigenen Satzes — und den findet
 * man, indem man so weit zurückgeht, wie das Zeichen davor noch eine Ziffer
 * ist. Rückwärts gilt dasselbe; auch das Schreiben kommt ohne Sprachliste aus.
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

/** Wert einer einzelnen Ziffer: „٣“ → 3, „7“ → 7. */
function ziffernWert(c: string): number {
  let cp = c.codePointAt(0) ?? 0
  let n = 0
  while (n < 10 && ZIFFER.test(String.fromCodePoint(cp - 1))) {
    cp--
    n++
  }
  return n
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
