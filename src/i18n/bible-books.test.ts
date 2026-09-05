import { describe, expect, it } from 'vitest'
import { buchTabelle } from '../../supabase/functions/_shared/i18n/bible-books.ts'
import { APP_LANGS } from './langs'
import { bibelbuecherLaden, makeTr } from './translate'
import { dict, loadOverlay } from './ui'

// Alle Overlays laden — dict() faellt sonst auf Englisch zurueck.
for (const { code } of APP_LANGS) await loadOverlay(code)

// Die Tabellen liegen in einem nachgeladenen Modul; makeTr stellt seine Regeln
// beim Erzeugen zusammen, das Laden muss also vorher passiert sein.
await bibelbuecherLaden()

/**
 * Bis 2026-08 kannte der Übersetzer genau ein Bibelbuch: „Jeremia" — das Buch
 * der Demo-Woche. Die übrigen 65 blieben in jeder Sprache deutsch stehen.
 * Diese Tests halten die volle Abdeckung fest.
 */
describe('Bibelbücher', () => {
  it('jede App-Sprache außer Deutsch hat eine Tabelle', () => {
    for (const { code: lang } of APP_LANGS) {
      if (lang === 'de') continue
      expect(buchTabelle(lang).voll.size, lang).toBeGreaterThan(0)
    }
  })

  it('deckt alle 66 Bücher ab (Urdu 57 — dort ist die Übersetzung Teilausgabe)', () => {
    for (const { code: lang } of APP_LANGS) {
      if (lang === 'de') continue
      const erwartet = lang === 'ur' ? 57 : 66
      expect(buchTabelle(lang).voll.size, lang).toBe(erwartet)
      expect(buchTabelle(lang).kurz.size, lang).toBe(erwartet)
    }
  })

  it('übersetzt Buch samt Kapitelangabe', () => {
    const en = makeTr('en')
    expect(en('Jeremia 32–33')).toBe('Jeremiah 32–33')
    expect(en('Matthäus 5–6')).toBe('Matthew 5–6')
    expect(en('1. Mose 1–3')).toBe('Genesis 1–3')
    expect(en('Offenbarung 1–3')).toBe('Revelation 1–3')
  })

  it('übersetzt auch die Kürzel in Bibelstellen', () => {
    // „Bibellesung · Jer 32:6-18" — Kapitel und Verse bleiben unangetastet.
    expect(makeTr('en')('Jer 32:6-18')).toBe('Jer 32:6-18')
    expect(makeTr('fr')('Jer 32:6-18')).toBe('Jr 32:6-18')
    expect(makeTr('ru')('Jer 32:6-18')).toBe('Иер 32:6-18')
  })

  it('greift auch in den Intl-Sprachen (die hatten vorher gar keine Regel)', () => {
    expect(makeTr('pl')('Jeremia 32–33')).toBe('Jeremiasza 32–33')
    expect(makeTr('ja')('Matthäus 5–6')).toBe('マタイ 5–6')
    expect(makeTr('sw')('1. Mose 1–3')).toBe('Mwanzo 1–3')
  })

  it('lässt fremde Zahlen-Segmente in Ruhe', () => {
    // Der Ausdruck darf kein Fänger sein: „Lied 5" und „Studienartikel 3"
    // haben eigene Regeln, die vorher greifen müssen.
    const en = makeTr('en')
    expect(en('Lied 5')).toBe('Song 5')
    expect(en('Studienartikel 3')).toBe('Study article 3')
    expect(en('10 Min.')).toBe('10 min.')
  })

  /*
    **Ein Buchname ist erst mit einer Zahl dahinter eine Schriftstelle.**

    Sehr viele Bibelbücher heißen wie ein Vorname: Daniel, Markus, Ruth,
    Titus, Simon, Judas, Petrus, Hiob. Der Fragment-Übersetzer läuft über
    **jedes** „ · "-Atom, das die Oberfläche zeigt — und in den Mitteilungen
    ist der Name ein eigenes Atom („Mikrofone · Dienstag, 8. September ·
    Markus Weber", so baut `substitute` den Rumpf). Ohne die Zahl-Bedingung
    stand dort in jeder fremdsprachigen Oberfläche ein anderer Mensch:

    | Eingabe | vorher (ko) | vorher (ru) |
    | --- | --- | --- |
    | Markus Weber | 마가복음 Weber | Марка Weber |
    | Ruth Meyer | 룻기 Meyer | Руфь Meyer |

    Dass die Prüfung greift, hängt daran, dass die Tabellen **geladen** sind —
    ohne sie gibt es die Regel gar nicht, und der Test wäre grün ohne Aussage.
    Der `beforeAll`-Aufruf oben in dieser Datei sorgt dafür; die Fälle darüber
    („Jeremia 32–33" wird übersetzt) sind zugleich die Gegenprobe.
  */
  it('lässt Personennamen in Ruhe, die wie ein Bibelbuch heißen', () => {
    const namen = ['Daniel Berger', 'Markus Weber', 'Ruth Meyer', 'Titus Klein', 'Simon Krüger']
    const veraendert: string[] = []
    for (const { code } of APP_LANGS) {
      const tr = makeTr(code)
      for (const name of namen) if (tr(name) !== name) veraendert.push(`${code}: ${name} → ${tr(name)}`)
    }
    expect(veraendert, veraendert.slice(0, 5).join(' | ')).toEqual([])
  })

  it('mit Kapitelangabe dahinter greift die Regel weiterhin', () => {
    // Die Gegenprobe zur Zeile darüber: Dieselben Bücher, diesmal als
    // Schriftstelle. Ginge die Regel ganz verloren, bliebe der Test oben grün.
    expect(makeTr('en')('Markus 5–6')).toBe('Mark 5–6')
    expect(makeTr('ru')('Ruth 1:16')).toBe('Руфь 1:16')
    expect(makeTr('ko')('Daniel 2')).toBe('다니엘 2')
  })

  it('zerlegt zusammengesetzte Titel weiterhin an ihren Trennern', () => {
    // Ein zu gieriger Ausdruck würde das ganze Segment schlucken und die
    // Aufteilung an „ · " / „ — " in buildTranslator umgehen.
    expect(makeTr('en')('Bibellesung · Jer 32:6-18')).toBe('Bible Reading · Jer 32:6-18')
  })
})

/**
 * Der Wochentag eines Programmdatums wird über ein echtes Kalenderdatum
 * ermittelt, dessen Jahr gesucht wird. Beim 29. Februar reichte der abgesuchte
 * Bereich nicht für alle sieben Wochentage.
 */
describe('Wochentag im Programmdatum', () => {
  // Nur die Intl-Sprachen gehen durch diese Suche; en/es/fr haben eigene
  // Wochentagslisten und waren nie betroffen.
  const nl = makeTr('nl')

  it('trifft auch den 29. Februar an jedem Wochentag', () => {
    // Vorher wurde daraus „zaterdag 1 maart" — falscher Tag UND falsches
    // Datum, weil der Rückfall auf ein Datum zeigte, das es nicht gibt.
    expect(nl('Montag, 29. Februar')).toBe('maandag 29 februari')
    expect(nl('Samstag, 29. Februar')).toBe('zaterdag 29 februari')
  })

  it('bleibt bei gewöhnlichen Daten korrekt', () => {
    expect(nl('Dienstag, 8. September')).toBe('dinsdag 8 september')
  })
})

/**
 * Mitteilungen werden geteilt: sie entstehen bei einem Planer und erscheinen
 * bei allen. Deshalb steht ihr Text kanonisch deutsch in der Datenbank und
 * wird erst beim Anzeigen übersetzt.
 */
describe('Mitteilungstext „Treffpunkte"', () => {
  it('wird in jeder App-Sprache übersetzt', () => {
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      expect(makeTr(code)('Treffpunkte'), code).not.toBe('Treffpunkte')
    }
  })

  it('auch als Teil eines zusammengesetzten Textes', () => {
    // So sieht die Zeile aus: „Name — Treffpunkte · 7.–13. September"
    expect(makeTr('en')('Simon Krüger — Treffpunkte · Jer 32:6-18')).toBe('Simon Krüger — Field Service · Jer 32:6-18')
  })
})

/**
 * Zusätzliche Klasse (jw.org S-38, Absatz 26). Die Abschnittsüberschrift kommt
 * aus dem Artikel selbst, „Hauptsaal" aus dem schon vorhandenen Schlüssel des
 * S-89-Formulars — beides also nicht neu übersetzt, sondern übernommen.
 */
describe('Begriffe der Zusätzlichen Klasse', () => {
  const KEYS = ['auxKlassen', 'auxKlasse', 'auxHauptsaal', 'auxRatgeber', 'auxDesc',
    'auxRatgeberHint', 'toastAuxAn', 'toastAuxAus'] as const

  it('sind in jeder App-Sprache gesetzt und nicht deutsch stehengeblieben', () => {
    const de = dict('de')
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      for (const key of KEYS) {
        expect(dict(code)[key], `${code}/${key}`).toBeTruthy()
        expect(dict(code)[key], `${code}/${key}`).not.toBe(de[key])
      }
    }
  })

  it('„Hauptsaal" ist derselbe Begriff wie im S-89-Formular', () => {
    // Zwei Wörter für denselben Raum wären in derselben App verwirrend.
    for (const { code } of APP_LANGS) {
      expect(dict(code).auxHauptsaal, code).toBe(dict(code).s89Hauptsaal)
    }
  })
})
