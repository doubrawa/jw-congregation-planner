import { describe, expect, it } from 'vitest'
import { congAppCode } from './langs'
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
    expect(es('Interesse fördern')).toBe('Haga revisitas')
    expect(fr('mit A. Hoffmann')).toBe('avec A. Hoffmann')
    expect(en('in 4 Tagen')).toBe('in 4 days')
  })

  it('übersetzt Sonderwochen-Begriffe', () => {
    expect(en('GEDÄCHTNISMAHL')).toBe('MEMORIAL')
    expect(en('Kreisaufseher')).toBe('Circuit overseer')
    expect(en('„Lauft so, dass ihr den Preis gewinnt“')).toContain('Run in Such a Way')
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
    // makeTrIntl-Pfad (kein Hand-Datums-Dict): el
    expect(makeTr('el')('WACHTTURM-STUDIUM')).not.toBe('WACHTTURM-STUDIUM')
  })

  it('übersetzt zusammengesetzte Wochenend-Titel inkl. „Lied“-Atom', () => {
    const it = makeTr('it')
    expect(it('Lied · Gebet')).toBe('Cantico · Preghiera')
    expect(it('Schlussworte · Lied · Gebet')).toBe('Parole di conclusione · Cantico · Preghiera')
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
    expect(congAppCode('Griechisch')).toBe('el')
    expect(congAppCode('Italienisch')).toBe('it')
    expect(congAppCode('Chinesisch (Hochchinesisch, vereinfachte Schriftzeichen)')).toBe('zh')
  })
  it('gibt undefined für nicht unterstützte Sprachen (Rückfall auf Deutsch)', () => {
    expect(congAppCode('Cebuano')).toBeUndefined()
    expect(congAppCode('Irgendwas')).toBeUndefined()
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
  it('Gesprächspartner und Ratgeber sind überall übersetzt', () => {
    expect(makeTr('ja')('Gesprächspartner')).toBe('補助')
    expect(makeTr('pl')('Gesprächspartner')).toBe('Pomocnik')
    expect(makeTr('ru')('Ratgeber')).toBe('Советник')
    expect(makeTr('ar')('Ratgeber')).toBe('المشير')
  })

  it('Kreisaufseher auch in den zuletzt ergänzten Sprachen', () => {
    expect(makeTr('ar')('Kreisaufseher')).toBe('ناظر الدائرة')
    expect(makeTr('ur')('Kreisaufseher')).toBe('حلقے کا نگہبان')
  })

  it('Gruppen und Versammlungen in den Zusatz-Sprachen', () => {
    expect(makeTr('ru')('Gruppe 2')).toBe('Группа 2')
    expect(makeTr('hu')('Gruppe 2')).toBe('2. csoport') // Zahl voran
    expect(makeTr('tr')('Vers. Nordheim')).toBe('Cemaat Nordheim')
  })

  it('Studienstoff-Verweise stehen so im Arbeitsheft der Sprache', () => {
    // Gemessen, nicht übersetzt: Tschechisch stellt die Zahl voran, und „th"
    // heißt im Englischen study, lmd/lff dagegen lesson.
    expect(makeTr('cs')('lmd Lektion 1 Punkt 5')).toBe('lmd 1. lekce 5. bod')
    expect(makeTr('cs')('th Lektion 11')).toBe('th 11. lekce')
    expect(makeTr('en')('lff Lektion 20 Punkt 4')).toBe('lff lesson 20 point 4')
    expect(makeTr('sk')('wcg Kap. 15')).toBe('wcg 15. kap.')
    expect(makeTr('en')('lmd Anhang A Punkt 21')).toBe('lmd appendix A point 21')
    expect(makeTr('pl')('lmd Anhang A Punkt 21')).toBe('lmd dodatek A, punkt 21')
  })

  it('übersetzt auch das Publikationskürzel, wo die Sprache das tut', () => {
    // Ostasien und die RTL-Sprachen schreiben nicht „th", sondern ein eigenes
    // Kürzel — und je Publikation ein anderes. Eine gemeinsame Regel für alle
    // Buch-Kürzel setzte hier das falsche ein.
    expect(makeTr('ja')('th Lektion 11')).toBe('教励 第11課')
    expect(makeTr('zh')('lmd Lektion 1 Punkt 5')).toBe('《爱心》第1课第5点')
    expect(makeTr('ko')('wcg Kap. 16')).toBe('「용하」 16장')
    expect(makeTr('he')('th Lektion 11')).toBe('הר שיעור 11')
    // th und wcg sind verschiedene Publikationen → verschiedene Kürzel
    expect(makeTr('ko')('th Lektion 16')).toBe('「읽가」 16과')
  })

  it('bleibt deutsch, wo keine Vorlage gemessen werden konnte', () => {
    // Bulgarisch behandelt im Versammlungsbibelstudium eine andere Publikation;
    // Erfundenes wäre schlimmer als ein erkennbar unübersetzter Verweis.
    expect(makeTr('bg')('wcg Kap. 15')).toBe('wcg Kap. 15')
  })
})

describe('makeTr(el) — Intl-Pfad (kein Hand-Datums-Dict)', () => {
  const el = makeTr('el')
  const changed = (s: string) => expect(el(s)).not.toBe(s)
  it('feuert jede Intl-Regel (Datum/Zeit/Bereich/Extras)', () => {
    changed('Lied 5')
    changed('4 Min.')
    changed('Ende ca. 20:45')
    changed('ca. 19:35')
    changed('Dienstag, 8. September')
    changed('Mo, 8. September')
    expect(el('Mo 19:00')).toMatch(/19:00$/)
    changed('7.–13. September')
    changed('28. Sep – 4. Okt')
    changed('mit Anna')
    changed('in 4 Tagen')
    changed('2 Zuteilungen')
    expect(el('Völlig unbekannt xyz')).toBe('Völlig unbekannt xyz') // Rückfall
  })
})
