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

/**
 * HTML-Entities in Zeichen zurückverwandeln (numerisch, hex und benannt).
 *
 * **`&amp;` steht zuletzt**, und das ist keine Kosmetik: Es stand einmal vor
 * `&lt;`, und damit lief `&amp;lt;` durch zwei Runden — erst zu `&lt;`, dann zu
 * `<`. Aus dem Text „&lt;" wurde so ein Zeichen, das keiner geschrieben hat.
 * Dieselbe Regel gilt in jedem Entity-Dekodierer: Das Und-Zeichen kommt
 * zurück, wenn alle anderen fertig sind, sonst dekodiert man sein Ergebnis
 * gleich noch einmal mit.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&shy;/g, '') // Soft Hyphen als Entity
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '„')
    .replace(/&rdquo;/g, '“')
    .replace(/&amp;/g, '&')
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
