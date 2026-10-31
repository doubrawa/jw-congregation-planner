import { describe, expect, it } from 'vitest'
import { APP_LANGS, congAppCode } from './langs'
import { bibelbuecherLaden, makeTr } from './translate'

// Die Bibelbuch-Tabellen liegen in einem nachgeladenen Modul und müssen da
// sein, BEVOR ein Übersetzer gebaut wird — makeTr stellt seine Regeln einmal
// beim Erzeugen zusammen. Deshalb hier oben statt in beforeAll.
await bibelbuecherLaden()

describe('makeTr — Programm-Inhalts-Übersetzer', () => {
  const en = makeTr('en')
  const es = makeTr('es')
  const fr = makeTr('fr')

  it('Deutsch ist die Identität', () => {
    const de = makeTr('de')
    expect(de('SCHÄTZE AUS GOTTES WORT')).toBe('SCHÄTZE AUS GOTTES WORT')
  })

  it('übersetzt offizielle S-38-Sektionslabels', () => {
    expect(en('UNS IM DIENST VERBESSERN')).toBe('APPLY YOURSELF TO THE FIELD MINISTRY')
    expect(es('SCHÄTZE AUS GOTTES WORT')).toBe('TESOROS DE LA BIBLIA')
    expect(fr('UNSER LEBEN ALS CHRIST')).toBe('VIE CHRÉTIENNE')
  })

  it('übersetzt Daten und Wochenbereiche', () => {
    expect(en('Dienstag, 8. September')).toBe('Tuesday, September 8')
    expect(en('7.–13. September')).toBe('September 7–13')
  })

  it('übersetzt zusammengesetzte Meta-Zeilen (getrennt durch ·)', () => {
    // „study", nicht „lesson": das englische Arbeitsheft schreibt bei th
    // „study 2", bei lmd/lff dagegen „lesson". Am Text von jw.org gemessen.
    expect(en('4 Min. · th Lektion 2')).toBe('4 min. · th study 2')
    expect(en('Von Haus zu Haus · 3 Min.')).toBe('House to house · 3 min.')
  })

  it('übersetzt Rahmen, Begleiter und Countdown', () => {
    // Wortlaut des Arbeitshefts, nicht übersetzt: seit der Ausgabe Nov./Dez.
    // 2026 in der Wir-Form (vorher „Haga revisitas").
    expect(es('Interesse fördern')).toBe('Hagamos revisitas')
    expect(fr('mit A. Hoffmann')).toBe('avec A. Hoffmann')
    expect(en('in 4 Tagen')).toBe('in 4 days')
  })

  it('übersetzt Sonderwochen-Begriffe', () => {
    expect(en('GEDÄCHTNISMAHL')).toBe('MEMORIAL')
    expect(en('Kreisaufseher')).toBe('Circuit overseer')
    // Hier stand ein Wachtturm-Artikeltitel aus den Testdaten. Der ist am
    // 13.8.2026 zum Platzhalter geworden („Demo-Studienartikel 2"), und sein
    // Wörterbuch-Eintrag mit ihm — er bezeichnete nichts, was die App erzeugt.
    expect(en('Dienstvortrag')).toBe('Service talk')
  })

  it('lässt Unbekanntes unverändert (Rückfall auf Deutsch)', () => {
    expect(en('Irgendetwas Unbekanntes')).toBe('Irgendetwas Unbekanntes')
  })

  it('übersetzt die Wochenend-Vorlage-Labels (auch für Zusatz-Sprachen)', () => {
    const it = makeTr('it')
    expect(it('WACHTTURM-STUDIUM')).toBe('STUDIO TORRE DI GUARDIA')
    expect(it('ÖFFENTLICHER VORTRAG')).toBe('DISCORSO PUBBLICO')
    expect(it('ERÖFFNUNG')).toBe('INTRODUZIONE')
    expect(it('ABSCHLUSS')).toBe('CONCLUSIONE')
    // makeTrIntl-Pfad (kein Hand-Datums-Dict): ru
    expect(makeTr('ru')('WACHTTURM-STUDIUM')).not.toBe('WACHTTURM-STUDIUM')
  })

  it('übersetzt zusammengesetzte Wochenend-Titel inkl. „Lied“-Atom', () => {
    const it = makeTr('it')
    expect(it('Lied · Gebet')).toBe('Cantico · Preghiera')
    // „Commenti conclusivi" wie im italienischen Arbeitsheft („Commenti conclusivi (3 min)")
    expect(it('Schlussworte · Lied · Gebet')).toBe('Commenti conclusivi · Cantico · Preghiera')
    expect(it('Lied')).toBe('Cantico')
    expect(it('(Vortragsthema eintragen)')).toBe('(inserire il tema del discorso)')
  })

  it('lokalisiert eine komplette Wochenend-Vorlage ohne deutschen Rest (it)', () => {
    const it = makeTr('it')
    const template = [
      'ERÖFFNUNG', 'Lied · Gebet',
      'ÖFFENTLICHER VORTRAG', '(Vortragsthema eintragen)', '30 Min.',
      'WACHTTURM-STUDIUM', 'Lied', '(Studienartikel eintragen)', '60 Min.',
      'ABSCHLUSS', 'Schlussworte · Lied · Gebet', 'Ende ca. 11:45',
    ]
    for (const s of template) expect(it(s)).not.toBe(s) // nichts bleibt deutsch
  })
})

describe('congAppCode — Versammlungssprache → App-Übersetzungscode', () => {
  it('mappt unterstützte Sprachen', () => {
    expect(congAppCode('ru')).toBe('ru')
    expect(congAppCode('it')).toBe('it')
    // Entfallene App-Sprachen (15.10.2026) haben keine Programmübersetzung mehr.
    expect(congAppCode('el')).toBeUndefined()
    expect(congAppCode('cmn-hans')).toBeUndefined()
  })
  it('gibt undefined für nicht unterstützte Sprachen (Rückfall auf Deutsch)', () => {
    expect(congAppCode('ceb')).toBeUndefined()
    expect(congAppCode('irgendwas')).toBeUndefined()
  })
})

describe('makeTr(en) — jede Wörterbuch-Regel', () => {
  const en = makeTr('en')
  it('deckt alle Regel-Zweige des Hand-Datums-Pfads ab', () => {
    expect(en('Lied 5')).toBe('Song 5')
    expect(en('4 Min.')).toBe('4 min.')
    expect(en('Ende ca. 20:45')).toBe('Ends approx. 20:45')
    expect(en('ca. 19:35')).toBe('approx. 19:35')
    expect(en('Mo, 8. September')).toBe('Mon, September 8')
    expect(en('Mo 19:00')).toBe('Mon 19:00')
    expect(en('28. Sep – 4. Okt')).toBe('Sep 28 – Oct 4')
    expect(en('27. April–3. Mai')).toBe('April 27 – May 3')
    expect(en('Jeremia 32–33')).toBe('Jeremiah 32–33')
    expect(en('Jer 3:1')).toBe('Jer 3:1')
    expect(en('wcg Kap. 5')).toBe('wcg chap. 5')
    expect(en('lmd Lektion 3')).toBe('lmd lesson 3')
    expect(en('lmd Anhang A Punkt 2')).toBe('lmd appendix A point 2')
    expect(en('Studienartikel 7')).toBe('Study article 7')
    expect(en('mit Anna')).toBe('with Anna')
    expect(en('Vers. Krumbach')).toBe('Cong. Krumbach')
    expect(en('Gruppe 1')).toBe('Group 1')
    expect(en('2 Zuteilungen')).toBe('2 assignments')
  })

  it('nimmt den Monat ausgeschrieben UND als Kurzform', () => {
    // Beide Datumsregeln fangen `[A-Za-zäöü]+` — welche Form ankommt, hängt
    // von der Quelle ab: der Programmkopf schreibt „8. September", die
    // Erinnerungstexte „8. Sep". Wer nur eine Tabelle befragt, liefert für die
    // andere Form „undefined" statt eines Monats.
    expect(en('Mo, 8. September')).toBe('Mon, September 8')
    expect(en('Mo, 8. Sep')).toBe('Mon, September 8')
    expect(en('Dienstag, 8. Sep')).toBe('Tuesday, September 8')
    expect(en('7.–13. Sep')).toBe('September 7–13')
  })

  it('lässt ein Datum mit unbekanntem Monat deutsch stehen', () => {
    // Lieber ein sichtbar unübersetztes Datum als ein „Invalid Date".
    expect(en('Mo, 8. Xyz')).toBe('Mo, 8. Xyz')
  })

  it('rekursiert an " — " innerhalb eines Segments', () => {
    expect(en('Unbekannt — Gruppe 1')).toBe('Unbekannt — Group 1')
  })

  it('leere Eingabe bleibt leer', () => {
    expect(en('')).toBe('')
  })
})

describe('Rollen und Verweise — auch in den Zusatz-Sprachen', () => {
  // Diese Begriffe blieben früher deutsch stehen: die Rollen fehlten im
  // Wörterbuch, die Verweis-/Gruppen-Regeln gab es nur für en/es/fr.
  // Die Wörter der S-38 (1201038, p40/p74): ar الناصح.
  it('Gesprächspartner und Ratgeber sind überall übersetzt', () => {
    expect(makeTr('pl')('Partner')).toBe('Pomocnik')
    expect(makeTr('ru')('Ratgeber')).toBe('Советник')
    expect(makeTr('ar')('Ratgeber')).toBe('الناصح')
  })

  it('Kreisaufseher auch in den zuletzt ergänzten Sprachen', () => {
    expect(makeTr('ar')('Kreisaufseher')).toBe('ناظر الدائرة')
    expect(makeTr('fa')('Kreisaufseher')).toBe('سرپرست حوزه')
  })

  it('Gruppen und Versammlungen in den Zusatz-Sprachen', () => {
    expect(makeTr('ru')('Gruppe 2')).toBe('Группа 2')
    expect(makeTr('tr')('Vers. Nordheim')).toBe('Cemaat Nordheim')
  })

  it('Studienstoff-Verweise stehen so im Arbeitsheft der Sprache', () => {
    // Gemessen, nicht übersetzt: Türkisch stellt die Zahl voran, und „th"
    // heißt im Englischen study, lmd/lff dagegen lesson.
    expect(makeTr('tr')('lmd Lektion 1 Punkt 5')).toBe('lmd 1. bölüm 5. nokta')
    expect(makeTr('en')('th Lektion 11')).toBe('th study 11')
    expect(makeTr('en')('lff Lektion 20 Punkt 4')).toBe('lff lesson 20 point 4')
    expect(makeTr('tr')('wcg Kap. 15')).toBe('wcg 15. bölüm')
    expect(makeTr('en')('lmd Anhang A Punkt 21')).toBe('lmd appendix A point 21')
    expect(makeTr('pl')('lmd Anhang A Punkt 21')).toBe('lmd dodatek A, punkt 21')
  })

  it('übersetzt auch das Publikationskürzel, wo die Sprache das tut', () => {
    // Die RTL-Sprachen schreiben nicht „th", sondern ein eigenes Kürzel — und
    // je Publikation ein anderes. Eine gemeinsame Regel für alle Buch-Kürzel
    // setzte hier das falsche ein.
    expect(makeTr('fa')('th Lektion 11')).toBe('ب-تعلیم درس 11')
    expect(makeTr('ar')('lmd Lektion 1 Punkt 5')).toBe('أن الدرس 1 النقطة 5')
    // th und wcg sind verschiedene Publikationen → verschiedene Kürzel
    expect(makeTr('fa')('wcg Kap. 16')).toBe('ک-شجاع فصل 16')
    expect(makeTr('fa')('th Lektion 16')).not.toContain(makeTr('fa')('wcg Kap. 16').split(' ')[0])
  })
})

describe('makeTr(ru) — Intl-Pfad (kein Hand-Datums-Dict)', () => {
  const ru = makeTr('ru')
  const changed = (s: string) => expect(ru(s)).not.toBe(s)
  it('feuert jede Intl-Regel (Datum/Zeit/Bereich/Extras)', () => {
    changed('Lied 5')
    changed('4 Min.')
    changed('Ende ca. 20:45')
    changed('ca. 19:35')
    changed('Dienstag, 8. September')
    changed('Mo, 8. September')
    expect(ru('Mo 19:00')).toMatch(/19:00$/)
    changed('7.–13. September')
    changed('28. Sep – 4. Okt')
    changed('27. April–3. Mai')
    changed('mit Anna')
    changed('in 4 Tagen')
    changed('2 Zuteilungen')
    expect(ru('Völlig unbekannt xyz')).toBe('Völlig unbekannt xyz') // Rückfall
  })

  it('verarbeitet auch den Kurzmonat, statt zu werfen', () => {
    // Der Intl-Pfad gab einen unbekannten Monat als `undefined` an
    // `Intl.format()` weiter — das wirft `RangeError` und riss ohne Error
    // Boundary die ganze App mit. Betraf alle 30 Sprachen ohne eigenes
    // Datums-Wörterbuch.
    changed('Di, 8. Sep')
    changed('7.–13. Sep')
  })
})

describe('Datumsregeln in allen Sprachen — nichts wirft', () => {
  // Der Absturz lag im Demo-Datensatz und wurde erst beim Öffnen der
  // Mitteilungen sichtbar. Deshalb hier jede Sprache × jede Datumsform.
  const formen = [
    'Dienstag, 8. September',
    'Dienstag, 8. Sep',
    'Di, 8. September',
    'Di, 8. Sep',
    'Di 19:00',
    '7.–13. September',
    '7.–13. Sep',
    '28. Sep – 4. Okt',
    '27. April–3. Mai',
    '30. März–5. April',
    'Demoaufgabe 10 · Di, 8. Sep · ca. 19:35', // demo.ts:245
  ]
  it.each(APP_LANGS.map((l) => l.code))('%s', (code) => {
    const tr = makeTr(code)
    for (const s of formen) {
      expect(() => tr(s)).not.toThrow()
      expect(tr(s)).not.toMatch(/undefined|Invalid Date|NaN/)
    }
  })
})

/*
  Die Kopfzeile einer Woche über den Monatswechsel — **die Form, die jw.org
  wirklich liefert**: beide Monate ausgeschrieben, Halbgeviertstrich ohne
  Leerzeichen („27. April–3. Mai", nachgemessen an der Ausgabe März/April 2026).

  Der Übersetzer kannte nur die abgekürzte Form mit Leerzeichen („28. Sep –
  4. Okt"), und die steht nur in den Demo- und Vorlagenwochen dieser App. Jede
  importierte Woche über einen Monatswechsel — rund jede vierte — behielt damit
  in allen 33 Sprachen ihre deutsche Kopfzeile. Nichts stürzte ab, nichts fiel
  auf; es blieb einfach deutsch stehen.

  Deshalb hier nicht „wirft nicht", sondern **wird übersetzt**: jede Sprache muss
  etwas anderes liefern als den deutschen Ausgangstext.
*/
describe('Wochenspanne über den Monatswechsel — in jeder Sprache übersetzt', () => {
  const deutsch = '27. April–3. Mai'
  it.each(APP_LANGS.map((l) => l.code).filter((c) => c !== 'de'))('%s', (code) => {
    expect(makeTr(code)(deutsch)).not.toBe(deutsch)
  })

  it('die abgekürzte Form bleibt abgekürzt', () => {
    // Zwei Muster, zwei Namenslisten: zurückgeschrieben wird, was hereinkam.
    // Eine gemeinsame Regel hätte „28. Sep – 4. Okt" ausgeschrieben.
    expect(makeTr('es')('28. Sep – 4. Okt')).toBe('28 de sep. al 4 de oct.')
    expect(makeTr('es')('27. April–3. Mai')).toBe('27 de abril al 3 de mayo')
  })
})

/*
  Ein unbekannter Monat am **zweiten** Ende einer Spanne — ein Tippfehler in
  einer von Hand angelegten Woche, eine Form, die das Arbeitsheft einmal
  anders schreibt. Die Regel schlägt beide Enden nach. Fehlt das zweite, darf
  sie den ersten Monat nicht für beide nehmen: Aus „27. April–3. Mail" würde
  sonst „April 27 – April 3", ein Zeitraum, den niemand geschrieben hat und der
  rückwärts läuft. Stehen bleibt der deutsche Text, wie beim unbekannten Monat
  sonst auch (T1).
*/
describe('Ein unbekannter Monat am zweiten Ende einer Spanne bleibt deutsch', () => {
  // Wörterbuch-Pfad (en) und Intl-Pfad (it, ar) — beide nutzen dieselbe Regel.
  it.each(['en', 'it', 'ar'] as const)('%s', (code) => {
    const tr = makeTr(code)
    // Positivkontrolle: Mit bekanntem Monat wird dieselbe Spanne übersetzt.
    expect(tr('27. April–3. Mai')).not.toBe('27. April–3. Mai')
    expect(tr('28. Sep – 4. Okt')).not.toBe('28. Sep – 4. Okt')
    expect(tr('27. April–3. Mail')).toBe('27. April–3. Mail')
    expect(tr('28. Sep – 4. Okx')).toBe('28. Sep – 4. Okx')
  })

  it('ebenso über den Jahreswechsel — kein „Invalid Date", kein halb übersetzter Kopf', () => {
    for (const code of ['en', 'it', 'ar'] as const) {
      const tr = makeTr(code)
      // Positivkontrolle wie oben.
      expect(tr('29. Dezember 2025 – 4. Januar 2026')).not.toBe('29. Dezember 2025 – 4. Januar 2026')
      expect(tr('29. Dezember 2025 – 4. Jänner 2026')).toBe('29. Dezember 2025 – 4. Jänner 2026')
    }
  })
})
