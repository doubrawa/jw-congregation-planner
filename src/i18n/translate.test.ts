import { describe, expect, it } from 'vitest'
import { congAppCode } from './langs'
import { makeTr } from './translate'

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
    expect(en('4 Min. · th Lektion 2')).toBe('4 min. · th lesson 2')
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
