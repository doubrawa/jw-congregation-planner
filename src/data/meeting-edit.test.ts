import { describe, expect, it } from 'vitest'
import { buildDemoWeeks } from '../../tests/testdaten/testdaten'
import {
  editTalkTheme,
  endeAusStartzeit,
  endenNachziehen,
  lacAdd,
  lacMinuten,
  lacMove,
  lacRemove,
  lacTitel,
  MEETING_MINUTES,
  setAbweichung,
  setClosingSong,
  setDienstwoche,
  setOpeningSong,
  setPartThema,
  togglePartner,
} from './meeting-edit'
import { isSong, istArt } from './helpers'
import type { Meeting, PartItem, Week } from './types'

describe('endeAusStartzeit — Endzeit aus den Zusammenkunftszeiten', () => {
  // Der Import trug feste Werte ein (20:45 / 11:45), unabhängig von den
  // gepflegten Zeiten. Bei einem Beginn um 18:30 stand damit auf jedem
  // Programmblatt eine falsche Endzeit.
  it('rechnet Startzeit + Regeldauer', () => {
    expect(endeAusStartzeit('19:00', 'X')).toBe('Ende ca. 20:45')
    expect(endeAusStartzeit('10:00', 'X')).toBe('Ende ca. 11:45')
    expect(endeAusStartzeit('18:30', 'X')).toBe('Ende ca. 20:15')
  })

  it('bestätigt die bisherigen Festwerte — 1:45 je Zusammenkunft', () => {
    expect(MEETING_MINUTES).toBe(105)
  })

  it('ohne hinterlegte Startzeit bleibt der mitgebrachte Wert', () => {
    expect(endeAusStartzeit('', 'Ende ca. 20:45')).toBe('Ende ca. 20:45')
    expect(endeAusStartzeit('abends', 'Ende ca. 20:45')).toBe('Ende ca. 20:45')
  })
})

describe('endenNachziehen — Endzeiten folgen einer Zeitumstellung', () => {
  // `end` steht in den Wochendaten und wurde nur beim Import gerechnet; die
  // Startzeit holt die Anzeige dagegen jedes Mal frisch aus den Einstellungen.
  // Ohne Nachziehen zeigte der Programmkopf nach einer Umstellung 18:30 und
  // die Fußzeile weiter „Ende ca. 20:45" — 2:15 auf dem Blatt.
  /**
   * Wochen, wie der jw.org-Import sie anlegt: im `date`-Feld steht die
   * Überschrift der Seite, ohne Wochentag und ohne Uhrzeit. Nur für die kommt
   * die Startzeit aus den Einstellungen — und nur bei denen klaffte es.
   */
  function importierteWochen(): Week[] {
    const weeks = buildDemoWeeks().slice(0, 2)
    for (const week of weeks) {
      week.mid.date = '7.–13. September'
      week.we.date = '7.–13. September'
      week.mid.end = 'Ende ca. 20:45'
      week.we.end = 'Ende ca. 11:45'
    }
    return weeks
  }

  it('verschiebt beide Zusammenkünfte um ihre eigene Differenz', () => {
    const next = endenNachziehen(importierteWochen(), { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '09:30' } })
    expect(next[0]!.mid.end).toBe('Ende ca. 20:15')
    expect(next[0]!.we.end).toBe('Ende ca. 11:15')
    expect(next[1]!.mid.end).toBe('Ende ca. 20:15') // alle geladenen Wochen
  })

  it('rührt die andere Zusammenkunft nicht an', () => {
    const next = endenNachziehen(importierteWochen(), { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '10:00' } })
    expect(next[0]!.mid.end).toBe('Ende ca. 20:15')
    expect(next[0]!.we.end).toBe('Ende ca. 11:45') // unverändert
  })

  it('verschiebt, statt neu zu rechnen — die Anpassung des Planers bleibt', () => {
    // Der Planer hat die LAC-Minuten geändert, `shiftEnd` hat das Ende um 10
    // Minuten versetzt (20:55 statt 20:45). Eine Zeitumstellung darf diese
    // Anpassung nicht verwerfen: 20:55 − 30 min = 20:25, nicht 18:30 + 105.
    const weeks = importierteWochen()
    weeks[0]!.mid.end = 'Ende ca. 20:55'
    const next = endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '10:00' } })
    expect(next[0]!.mid.end).toBe('Ende ca. 20:25')
  })

  it('lässt Zusammenkünfte mit eigener Uhrzeit unberührt', () => {
    // Eine Abweichung (T30) bestimmt auch den Anfang (`meetingTime`), der
    // Rhythmus bleibt außen vor. Dann bewegt sich das Ende nicht.
    //
    // Die eigene Uhrzeit stand bis zum 18.9.2026 als **Text** im `date`-Feld
    // („Dienstag, 8. September · 19:45") und wurde von dort zurückgelesen; seit
    // T30 sagt eine `Abweichung` dasselbe als Wert.
    const weeks = importierteWochen()
    weeks[0]!.dev = { mid: { time: '19:45' } }
    weeks[0]!.mid.end = 'Ende ca. 21:30'
    const next = endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '10:00' } })
    expect(next[0]!.mid.end).toBe('Ende ca. 21:30') // unverändert
    expect(next[1]!.mid.end).toBe('Ende ca. 20:15') // mitgezogen
  })

  it('eine unberührte Woche behält ihre Referenz', () => {
    /*
      „Unberührt" muss man **sehen** können: `persist.ts` entscheidet an der
      Referenz, welche Woche es zu schreiben gibt. Hier stand ein `{ ...week }`
      vor der Schleife — jede Woche bekam damit eine neue Hülle, auch die, an
      der nichts zu verschieben war. Eine Gedächtnismahl-Woche ging so bei
      jeder Zeitumstellung an die Datenbank; hatte dort inzwischen ein anderer
      Planer geschrieben, meldete der Stand-Vergleich einen Konflikt für eine
      Woche, die niemand angefasst hatte.

      Der Test daneben („dasselbe Array") prüft nur den Fall, dass gar nichts
      geschieht. Dieser hier prüft den, der im Betrieb vorkommt: es geschieht
      etwas — nur nicht überall.
    */
    const weeks = importierteWochen()
    weeks[0]!.dev = { mid: { time: '19:45' }, we: { time: '10:30' } } // eigene Termine
    const next = endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '09:30' } })
    expect(next[0]).toBe(weeks[0]) // keine der beiden Zusammenkünfte betroffen
    expect(next[1]).not.toBe(weeks[1]) // diese schon
  })

  it('gibt bei unveränderter Zeit dasselbe Array zurück', () => {
    // Identität, damit React nicht ohne Grund neu rendert und die Persistenz
    // nicht 52 unveränderte Wochen schreibt.
    const weeks = importierteWochen()
    expect(endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } })).toBe(weeks)
    // Nur der Wochentag ändert sich — die Uhrzeit bleibt, das Ende auch.
    expect(endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 3, time: '19:00' }, we: { wd: 0, time: '10:00' } })).toBe(weeks)
  })

  /*
   * Hier stand: „ohne erkennbare Uhrzeit bleibt alles stehen" — mit dem Eingang
   * „Di abends · So 10:00". Beide Seiten waren Anzeigetexte, aus denen die
   * Uhrzeiten der Stellung nach gelesen wurden; fehlte in einem eine, rutschte
   * die Zuordnung, und die Verschiebung lag um Stunden daneben. Der Fall ist
   * mit den Werten (`MeetingTimes`) verschwunden, nicht bloß abgestellt: Eine
   * unlesbare Uhrzeit lässt sich nicht mehr übergeben.
   */
})

/*
 * Jede Bearbeitungsfunktion läuft die Kette Woche → Zusammenkunft → Abschnitt →
 * Punkt ab. Zeigt ein Index ins Leere — Lücke im geladenen Fenster (T35), ein
 * Abschnitt, den diese Woche nicht hat (die Kreisaufseher-Woche baut sie um,
 * T62) —, warf der Zugriff bis dahin. Diese Funktionen laufen aus dem Reducer;
 * ein Wurf dort reißt die Ansicht mit. Sie geben jetzt die Wochen unverändert
 * zurück (T42): dieselbe Antwort wie auf jede andere unmögliche Bearbeitung.
 */
describe('Bearbeitung mit einem Index, den es nicht gibt', () => {
  const WEIT_DRAUSSEN = 99
  const w = (): Week[] => buildDemoWeeks()

  it('lacMinuten: fehlende Woche, fehlender Abschnitt, fehlender Punkt', () => {
    const weeks = w()
    expect(lacMinuten(weeks, WEIT_DRAUSSEN, 'mid', 0, 0, 20)).toBe(weeks)
    expect(lacMinuten(weeks, 0, 'mid', WEIT_DRAUSSEN, 0, 20)).toBe(weeks)
    expect(lacMinuten(weeks, 0, 'mid', 0, WEIT_DRAUSSEN, 20)).toBe(weeks)
  })

  it('lacRemove: fehlende Woche, fehlender Abschnitt, fehlender Punkt', () => {
    const weeks = w()
    expect(lacRemove(weeks, WEIT_DRAUSSEN, 'mid', 0, 0)).toBe(weeks)
    expect(lacRemove(weeks, 0, 'mid', WEIT_DRAUSSEN, 0)).toBe(weeks)
    expect(lacRemove(weeks, 0, 'mid', 0, WEIT_DRAUSSEN)).toBe(weeks)
  })

  it('lacMove und lacAdd: fehlende Woche, fehlender Abschnitt', () => {
    const weeks = w()
    expect(lacMove(weeks, WEIT_DRAUSSEN, 'mid', 0, 0, 1)).toBe(weeks)
    expect(lacMove(weeks, 0, 'mid', WEIT_DRAUSSEN, 0, 1)).toBe(weeks)
    expect(lacAdd(weeks, WEIT_DRAUSSEN, 'mid', 0, 'Neu')).toBe(weeks)
    expect(lacAdd(weeks, 0, 'mid', WEIT_DRAUSSEN, 'Neu')).toBe(weeks)
  })

  it('lacTitel: fehlende Woche, fehlender Abschnitt, fehlender Punkt', () => {
    const weeks = w()
    expect(lacTitel(weeks, WEIT_DRAUSSEN, 'mid', 0, 0, 'Neu')).toBe(weeks)
    expect(lacTitel(weeks, 0, 'mid', WEIT_DRAUSSEN, 0, 'Neu')).toBe(weeks)
    expect(lacTitel(weeks, 0, 'mid', 0, WEIT_DRAUSSEN, 'Neu')).toBe(weeks)
  })

  it('togglePartner auf eine Woche, die es nicht gibt', () => {
    const weeks = w()
    expect(togglePartner(weeks, WEIT_DRAUSSEN, 'mid', 0, 0)).toBe(weeks)
  })

  it('editTalkTheme und die Lieder auf eine Woche, die es nicht gibt', () => {
    const weeks = w()
    expect(editTalkTheme(weeks, WEIT_DRAUSSEN, 0, 0, 'Thema')).toBe(weeks)
    expect(setOpeningSong(weeks, WEIT_DRAUSSEN, '78')).toBe(weeks)
    expect(setClosingSong(weeks, WEIT_DRAUSSEN, '78')).toBe(weeks)
  })

  it('die vorhandene Stelle bleibt bearbeitbar — die Prüfung sperrt nichts zu', () => {
    // Gegenprobe zur Gegenprobe: sonst wären alle Tests oben auch grün, wenn
    // die Funktionen gar nichts mehr täten.
    const weeks = w()
    expect(setOpeningSong(weeks, 0, '78')).not.toBe(weeks)
    expect(togglePartner(weeks, 0, 'mid', 1, 1)).not.toBe(weeks)
  })

  it('eine Liednummer in fremden Ziffern wird gespeichert, nicht verworfen', () => {
    // Eine arabische oder persische Zifferntastatur liefert „٢٥" bzw. „۲۵".
    // Gespeichert wird westlich, wie der ganze kanonische Titel.
    const weeks = w()
    const westlich = setOpeningSong(weeks, 0, '25')[0]!.we
    expect(westlich).not.toEqual(weeks[0]!.we)
    expect(setOpeningSong(weeks, 0, '٢٥')[0]!.we).toEqual(westlich)
    expect(setOpeningSong(weeks, 0, '۲۵')[0]!.we).toEqual(westlich)
  })
})

/** Erste Stelle eines Lieds in der Zusammenkunft (Abschnitt, Punkt). */
function liedStelle(m: Meeting): [number, number] {
  for (const [si, s] of m.sections.entries()) {
    const ii = s.items.findIndex((it) => isSong(it))
    if (ii >= 0) return [si, ii]
  }
  throw new Error('kein Lied in der Zusammenkunft')
}

/** Der Punkt mit dem Leser in einem Abschnitt — Bibelstudium bzw. Wachtturm-Studium. */
function leserPunkt(m: Meeting, art: 'lac' | 'wtStudium'): [number, number] {
  const si = m.sections.findIndex((s) => istArt(s, art))
  const ii = m.sections[si]?.items.findIndex((it) => !isSong(it) && it.names.some((n) => n.bereichsKey === 'leser')) ?? -1
  if (si < 0 || ii < 0) throw new Error(`kein Punkt mit Leser in ${art}`)
  return [si, ii]
}

describe('Gegenfälle: ein Lied, eine fehlende Woche, nichts zu tun (31.10.2026)', () => {
  it('ein Lied ist kein Punkt — Partner, Thema, Minuten und Vortragstitel lassen es in Ruhe', () => {
    const weeks = buildDemoWeeks()
    const [si, ii] = liedStelle(weeks[0]!.mid)
    expect(togglePartner(weeks, 0, 'mid', si, ii)).toBe(weeks)
    expect(setPartThema(weeks, 0, 'mid', si, ii, 'Dienstvortrag', 'Thema')).toBe(weeks)
    expect(lacMinuten(weeks, 0, 'mid', si, ii, 20)).toBe(weeks)
    const [wsi, wii] = liedStelle(weeks[0]!.we)
    expect(editTalkTheme(weeks, 0, wsi, wii, 'Thema')).toBe(weeks)
  })

  it('setPartThema: fehlender Punkt oder dasselbe Thema — dieselben Wochen', () => {
    const weeks = buildDemoWeeks()
    expect(setPartThema(weeks, 0, 'mid', 99, 0, 'Dienstvortrag', 'Thema')).toBe(weeks)
    expect(setPartThema(weeks, 99, 'mid', 0, 0, 'Dienstvortrag', 'Thema')).toBe(weeks)
    const mit = setPartThema(weeks, 0, 'mid', 1, 1, 'Dienstvortrag', 'Thema')
    expect(mit).not.toBe(weeks)
    expect(setPartThema(mit, 0, 'mid', 1, 1, 'Dienstvortrag', ' Thema ')).toBe(mit)
  })

  it('setAbweichung und setDienstwoche auf eine Woche, die es nicht gibt — und Dienstwoche ohne Wechsel', () => {
    const weeks = buildDemoWeeks()
    expect(setAbweichung(weeks, 99, 'mid', { time: '19:30' })).toBe(weeks)
    expect(setDienstwoche(weeks, 99, true)).toBe(weeks)
    // Schon ausgeschaltet: Ausschalten ändert nichts.
    expect(setDienstwoche(weeks, 0, false)).toBe(weeks)
    const ein = setDienstwoche(weeks, 0, true)
    expect(setDienstwoche(ein, 0, true)).toBe(ein)
  })

  it('endenNachziehen: ein Ende ohne Uhrzeit bleibt stehen, und die Wochen behalten ihre Referenz', () => {
    const weeks = buildDemoWeeks().slice(0, 1)
    weeks[0]!.mid.end = 'Ende offen'
    weeks[0]!.we.end = 'Ende offen'
    const zeiten = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
    expect(endenNachziehen(weeks, zeiten, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '09:30' } })).toBe(weeks)
  })
})

describe('Sprachvarianten ziehen mit (Week.alt)', () => {
  it('setPartThema schreibt das Thema in jede Variante und vermerkt dort den Umbau — ein Lied an der Stelle bleibt Lied', () => {
    const weeks = buildDemoWeeks()
    const woche = weeks[0]!
    const fr = structuredClone(woche.mid)
    fr.sections[1]!.items[1] = { song: 'Lied 7' }
    const kopf = { range: woche.range, book: woche.book }
    woche.alt = { en: { ...kopf, mid: structuredClone(woche.mid), we: structuredClone(woche.we) }, fr: { ...kopf, mid: fr, we: structuredClone(woche.we) } }

    const next = setPartThema(weeks, 0, 'mid', 1, 1, 'Dienstvortrag', 'Mein Thema')
    const titel = (m: Meeting | undefined) => (m?.sections[1]?.items[1] as PartItem | undefined)?.title
    expect(titel(next[0]!.mid)).toBe('Dienstvortrag · Mein Thema')
    expect(titel(next[0]!.alt!.en!.mid)).toBe('Dienstvortrag · Mein Thema')
    expect(next[0]!.alt!.en!.mid!.umgebaut).toBe(true)
    expect(next[0]!.alt!.fr!.mid!.sections[1]!.items[1]).toEqual({ song: 'Lied 7' })
    // Geklont, nicht im Bestand geändert.
    expect(titel(weeks[0]!.alt!.en!.mid)).not.toBe('Dienstvortrag · Mein Thema')
  })
})

describe('Kreisaufseher-Woche, wo die umzubauenden Punkte fehlen (T62)', () => {
  it('ohne Bibelstudium und ohne Wachtturm-Studium: Ein- und Ausschalten setzen nur den Vermerk', () => {
    const weeks = buildDemoWeeks()
    const woche = weeks[0]!
    const [lac, vbs] = leserPunkt(woche.mid, 'lac')
    woche.mid.sections[lac]!.items.splice(vbs, 1)
    woche.we.sections = woche.we.sections.filter((s) => !istArt(s, 'wtStudium'))
    const vorher = structuredClone(woche)

    const ein = setDienstwoche(weeks, 0, true)
    expect(ein[0]!.co).toBe(true)
    expect(ein[0]!.coData).toEqual({})
    expect(ein[0]!.mid.sections).toEqual(vorher.mid.sections)
    expect(ein[0]!.we.sections).toEqual(vorher.we.sections)

    const aus = setDienstwoche(ein, 0, false)
    expect(aus[0]!.co).toBe(false)
    expect(aus[0]!.coData).toBeUndefined()
    expect(aus[0]!.mid.sections).toEqual(vorher.mid.sections)
    expect(aus[0]!.we.sections).toEqual(vorher.we.sections)
  })

  it('eine Variante ohne den Punkt bleibt, wie sie ist — die Zusammenkunft selbst wird umgebaut und kommt zurück', () => {
    const weeks = buildDemoWeeks()
    const woche = weeks[0]!
    const [lac, vbs] = leserPunkt(woche.mid, 'lac')
    const [wt, stud] = leserPunkt(woche.we, 'wtStudium')
    const en = { range: woche.range, book: woche.book, mid: structuredClone(woche.mid), we: structuredClone(woche.we) }
    en.mid.sections[lac]!.items.splice(vbs, 1)
    expect(en.mid.sections[lac]!.items[vbs], 'Bibelstudium ist der letzte Punkt').toBeUndefined()
    delete (en.we.sections[wt]!.items[stud] as PartItem).meta
    woche.alt = { en }
    const vbsTitel = (woche.mid.sections[lac]!.items[vbs] as PartItem).title

    const ein = setDienstwoche(weeks, 0, true)
    expect((ein[0]!.mid.sections[lac]!.items[vbs] as PartItem).title).not.toBe(vbsTitel)
    expect(ein[0]!.coData?.midOrigAlt).toEqual({})
    expect(ein[0]!.coData?.weOrigAlt).toEqual({})
    expect(ein[0]!.alt!.en!.mid!.sections[lac]!.items).toEqual(en.mid.sections[lac]!.items)

    const aus = setDienstwoche(ein, 0, false)
    expect((aus[0]!.mid.sections[lac]!.items[vbs] as PartItem).title).toBe(vbsTitel)
    expect(aus[0]!.alt!.en!.mid!.sections[lac]!.items).toEqual(en.mid.sections[lac]!.items)
  })

  it('wurde das Wachtturm-Studium zwischendurch entfernt, nimmt das Ausschalten den Rest trotzdem zurück', () => {
    const weeks = buildDemoWeeks()
    const [lac, vbs] = leserPunkt(weeks[0]!.mid, 'lac')
    const vbsTitel = (weeks[0]!.mid.sections[lac]!.items[vbs] as PartItem).title
    const ein = setDienstwoche(weeks, 0, true)
    const wt = ein[0]!.we.sections.findIndex((s) => istArt(s, 'wtStudium'))
    const ohne = structuredClone(ein)
    ohne[0]!.we.sections[wt]!.items = ohne[0]!.we.sections[wt]!.items.filter((it) => isSong(it))

    const aus = setDienstwoche(ohne, 0, false)
    expect(aus[0]!.co).toBe(false)
    expect((aus[0]!.mid.sections[lac]!.items[vbs] as PartItem).title).toBe(vbsTitel)
    // Der Schlussvortrag ist fort, auch ohne das Studium davor.
    expect(aus[0]!.we.sections.some((s) => istArt(s, 'dienstvortrag'))).toBe(false)
  })
})
