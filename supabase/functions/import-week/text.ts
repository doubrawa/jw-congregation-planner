// =============================================================================
// Text aus jw.org-HTML — gemeinsam für Arbeitsheft- und Studienausgabe-Parser
// =============================================================================
// Beide Parser holen ihre Felder aus derselben Seitensorte und stolperten
// deshalb über dieselben Dinge. Sie hatten trotzdem **je eine eigene**
// Aufbereitung: `study.ts` konnte Ruby und CJK-Zwischenräume, kannte aber nur
// vier Entities; `parse.ts` dekodierte alle Entities, ließ dafür die
// Lesehilfe (Furigana/Pinyin) mitten im Titel stehen.
//
// Ergebnis: der Wachtturm-Artikel kam auf Japanisch sauber an, das Programm
// derselben Woche nicht. Deshalb eine Stelle für beide.
// =============================================================================

/** Benannte Entities, die auf jw.org-Seiten vorkommen. */
const BENANNT: Record<string, string> = {
  nbsp: ' ',
  shy: '', // Soft Hyphen als Entity
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '„',
  rdquo: '“',
}

/**
 * HTML-Entities in Zeichen zurückverwandeln (numerisch, hex und benannt).
 *
 * **Ein einziger Durchlauf**, und das ist keine Kosmetik. Hier standen elf
 * `replace` hintereinander, jedes über das Ergebnis des vorigen — und drei
 * davon erzeugen ein Und-Zeichen: `&amp;`, `&#38;` und `&#x26;`. Was eines von
 * ihnen hinterließ, las das nächste als Auftakt einer neuen Entity: Aus dem
 * **Text** „&lt;" wurde ein `<`, das niemand geschrieben hat, aus „&#39;" ein
 * Apostroph.
 *
 * Der letzte Anlauf schob nur `&amp;` ans Ende und ließ die beiden numerischen
 * Zweige vorn stehen — `&#38;lt;` lief weiter durch zwei Runden. Ein Durchlauf
 * kann die Falle gar nicht erst stellen: Was er einsetzt, sieht er nicht wieder
 * an. Unbekanntes bleibt unverändert stehen, wie zuvor.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (ganz, kern: string) => {
    if (kern[0] !== '#') return BENANNT[kern] ?? ganz
    const code = kern[1] === 'x' || kern[1] === 'X'
      ? parseInt(kern.slice(2), 16)
      : Number(kern.slice(1))
    // Außerhalb des Unicode-Bereichs wirft `fromCodePoint`. Eine kaputte
    // Zahlenangabe darf keinen Import zum Absturz bringen — sie bleibt stehen.
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return ganz
    return String.fromCodePoint(code)
  })
}

/**
 * Ruby-Auszeichnung: die japanische und die chinesische Ausgabe hinterlegen
 * jedes Schriftzeichen mit seiner Lesung
 * (`<ruby><rb>従</rb><rt>したが</rt></ruby>`). Die Lesung (`rt`, ersatzweise
 * `rp`) fliegt raus, der Grundtext bleibt.
 */
const RUBY_LESUNG = /<(r[tp])\b[^>]*>[\s\S]*?<\/\1>/gi

/**
 * Auszeichnungen **im Fluss** eines Satzes. Sie trennen keine Wörter — genau
 * das sagt auch HTML: `<b>Wort</b><i>zwei</i>` liest sich „Wortzwei“. Deshalb
 * fallen sie ersatzlos weg, während alles Übrige (`<p>`, `<br>`, `<li>`) eine
 * Leerstelle hinterlässt, weil es einen Absatz oder Punkt beendet.
 *
 * Vorher wurde **jedes** Tag zur Leerstelle. Im Deutschen fiel das nicht auf,
 * weil dort ohnehin Zwischenräume stehen. Im Chinesischen und Japanischen, die
 * keine kennen, zerlegte es jede Überschrift in Einzelteile: „上帝 话语 的
 * 宝藏“ statt „上帝话语的宝藏“ — denn dort steckt jedes Wort in
 * `<ruby><rb><strong>…`.
 */
const INLINE_TAGS =
  /<\/?(?:a|b|i|u|s|q|em|strong|span|sup|sub|small|cite|abbr|wbr|mark|var|code|kbd|samp|time|bdi|bdo|font|ruby|rb)\b[^>]*>/gi

/**
 * Unechte Zwischenräume in CJK-Läufen wieder zusammenziehen — nur
 * Japanisch-Kana und CJK-Ideogramme, **kein** Hangul (Koreanisch schreibt mit
 * Wortzwischenräumen wie das Lateinische).
 *
 * Das Auflösen der Inline-Auszeichnung nimmt die meisten dieser Lücken schon
 * vorweg. Übrig bleiben die, die wörtlich im Quelltext stehen (jw.org setzt
 * z. B. zwischen Liedlink und Folgewort eine Leerstelle) — dort ist sie im
 * Chinesischen und Japanischen genauso falsch.
 */
const CJK_SPACE =
  /([぀-ヿ㐀-䶿一-鿿ｦ-ﾟ])\s+(?=[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ\d])|(\d)\s+(?=[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ])/g

/** Tags entfernen, Entities dekodieren, Weichzeichen und Fugen bereinigen. */
export function cleanText(html: string): string {
  return decodeEntities(html.replace(RUBY_LESUNG, '').replace(INLINE_TAGS, '').replace(/<[^>]+>/g, ' '))
    .replace(/­/g, '') // Soft Hyphen (z. B. "Versammlungs­bibelstudium")
    .replace(/​/g, '') // Zero Width Space
    .replace(/\s+/g, ' ')
    .replace(CJK_SPACE, '$1$2')
    .trim()
}
