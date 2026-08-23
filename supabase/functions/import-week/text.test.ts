import { describe, expect, it } from 'vitest'
import { cleanText, decodeEntities } from './text'

/**
 * **Text aus jw.org-HTML — eine Stelle für beide Parser.**
 *
 * Vorher hatte jeder seine eigene Aufbereitung, und beide stolperten über
 * verschiedene Dinge: `study.ts` konnte Ruby und CJK-Zwischenräume, kannte aber
 * nur vier Entities; `parse.ts` dekodierte alle Entities, ließ dafür die
 * Lesehilfe mitten im Titel stehen. Auf Japanisch kam der Wachtturm-Artikel
 * sauber an, das Programm derselben Woche nicht.
 *
 * `study.test.ts` prüft `cleanText` an den CJK-Fällen. Hier steht der Rest —
 * vor allem die **Entities**: jw.org liefert sie in drei Schreibweisen, und die
 * numerische kommt bei jedem Sonderzeichen vor, das der Seitengenerator nicht
 * benannt kennt. Bleibt sie stehen, liest der Planer „Gespr&#228;che
 * beginnen" im Programm.
 */

describe('Entities in allen drei Schreibweisen', () => {
  it('numerisch — die Form, die jw.org für Sonderzeichen benutzt', () => {
    expect(decodeEntities('Gespr&#228;che beginnen')).toBe('Gespräche beginnen')
    expect(decodeEntities('&#8222;Sch&#228;tze&#8220;')).toBe('„Schätze“')
  })

  it('hexadezimal — dieselbe Zahl, andere Basis', () => {
    expect(decodeEntities('Gespr&#xE4;che')).toBe('Gespräche')
    expect(decodeEntities('Gespr&#Xe4;che')).toBe('Gespräche') // Groß/klein egal
  })

  it('benannt — die geläufigen', () => {
    expect(decodeEntities('a &amp; b')).toBe('a & b')
    expect(decodeEntities('&lt;p&gt;')).toBe('<p>')
    expect(decodeEntities('&quot;x&quot;')).toBe('"x"')
    expect(decodeEntities('&rsquo;s')).toBe('’s')
    expect(decodeEntities('&lsquo;x&rsquo;')).toBe('‘x’')
    expect(decodeEntities('&ldquo;x&rdquo;')).toBe('„x“')
  })

  it('auch außerhalb der Grundebene (Emoji, seltene Zeichen)', () => {
    expect(decodeEntities('&#128077;')).toBe('👍')
  })

  it('das geschützte Leerzeichen wird ein gewöhnliches', () => {
    // Sonst steht in „10 Min." ein Zeichen, das keine Zahl-Regel trifft.
    expect(decodeEntities('10&nbsp;Min.')).toBe('10 Min.')
  })

  it('das weiche Trennzeichen fällt weg — auch als Entity', () => {
    // „Versammlungs&shy;bibelstudium" ist derselbe Punkt wie ohne Trennung;
    // stünde es drin, träfe keine Label-Regel mehr.
    expect(decodeEntities('Versammlungs&shy;bibelstudium')).toBe('Versammlungsbibelstudium')
  })

  it('was keine Entity ist, bleibt stehen', () => {
    expect(decodeEntities('5 & 3 < 4')).toBe('5 & 3 < 4')
    expect(decodeEntities('&nichtsda;')).toBe('&nichtsda;')
  })

  it('leerer Text bleibt leer', () => {
    expect(decodeEntities('')).toBe('')
  })
})

describe('cleanText: Auszeichnung raus, Sinn bleibt', () => {
  it('Auszeichnung im Satzfluss trennt keine Wörter', () => {
    // HTML liest `<b>Wort</b><i>zwei</i>` als „Wortzwei" — genau so hier.
    expect(cleanText('<b>Wort</b><i>zwei</i>')).toBe('Wortzwei')
    expect(cleanText('<strong>Schätze</strong> aus <em>Gottes</em> Wort')).toBe(
      'Schätze aus Gottes Wort',
    )
  })

  it('alles Übrige hinterlässt eine Leerstelle — es beendet einen Absatz', () => {
    expect(cleanText('<p>eins</p><p>zwei</p>')).toBe('eins zwei')
    expect(cleanText('<li>a</li><li>b</li>')).toBe('a b')
  })

  it('die Lesehilfe (Furigana) fliegt raus, der Grundtext bleibt', () => {
    expect(cleanText('<ruby><rb>従</rb><rt>したが</rt></ruby>')).toBe('従')
    // `rp` ist der Ersatz für Browser ohne Ruby-Unterstützung.
    expect(cleanText('<ruby>従<rp>(</rp><rt>したが</rt><rp>)</rp></ruby>')).toBe('従')
  })

  it('Entities werden auch hier dekodiert — beide Parser brauchen es', () => {
    expect(cleanText('<h3>Gespr&#228;che beginnen</h3>')).toBe('Gespräche beginnen')
  })

  it('weiche Trennzeichen und Nullbreiten-Leerzeichen fallen weg', () => {
    expect(cleanText('Versammlungs­bibelstudium')).toBe('Versammlungsbibelstudium')
    expect(cleanText('a​b')).toBe('ab')
  })

  it('mehrfacher Leerraum wird einer, die Ränder fallen weg', () => {
    expect(cleanText('  a \n\n  b  ')).toBe('a b')
  })

  it('unechte Zwischenräume in CJK werden zusammengezogen', () => {
    expect(cleanText('上帝 话语 的 宝藏')).toBe('上帝话语的宝藏')
    expect(cleanText('第 15 课')).toBe('第15课')
  })

  it('Koreanisch behält seine Wortzwischenräume — es schreibt wie das Lateinische', () => {
    expect(cleanText('하느님의 말씀 보물')).toBe('하느님의 말씀 보물')
  })

  it('lateinischer Text bleibt unangetastet', () => {
    expect(cleanText('Schätze aus Gottes Wort')).toBe('Schätze aus Gottes Wort')
  })

  it('leeres HTML ergibt leeren Text', () => {
    expect(cleanText('')).toBe('')
    expect(cleanText('<p></p>')).toBe('')
  })
})
