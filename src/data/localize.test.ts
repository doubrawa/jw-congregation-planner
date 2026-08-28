import { describe, expect, it } from 'vitest'
import { localizedWeek, localizedWeeks, missingVariants } from './localize'
import { itemMinutes, lacAdd, lacAdjust, lacMove, lacRemove } from './meeting-edit'
import type { Meeting, PartItem, Week } from './types'

/** Kanonische (deutsche) Beispielwoche mit englischer Sprachvariante. */
function makeWeek(): Week {
  const mid: Meeting = {
    date: 'Dienstag, 8. September · 19:00',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'SCHÄTZE AUS GOTTES WORT',
        farbe: 'petrol',
        items: [
          { num: 1, title: 'Über Jehovas Eigenschaften', meta: '10 Min.', names: [{ name: 'T. Lindner', bereichsKey: 'vortrag' }] },
          { song: 'Lied 5' },
        ],
      },
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [
          { num: 6, title: 'Punkt A', meta: '15 Min.', names: [{ name: '', bereichsKey: 'vortrag' }] },
          // Leiter **und** Leser — so legt `parse.ts` den letzten Unser-Leben-Punkt
          // immer an. Der Leser-Slot ist seit T61 die sprachunabhängige Marke, an
          // der `lacAddIndex` das Bibelstudium erkennt.
          { num: 7, title: 'Versammlungsbibelstudium', meta: '30 Min.', names: [{ name: '', rolle: 'Leiter', bereichsKey: 'studium' }, { name: '', rolle: 'Leser', bereichsKey: 'leser' }] },
        ],
      },
    ],
    helpers: { mik: [{ name: 'S. Krüger' }] },
  }
  const altMid: Meeting = {
    date: 'Tuesday, September 8 · 19:00',
    end: 'Ends approx. 20:45',
    sections: [
      {
        label: 'TREASURES FROM GOD’S WORD',
        farbe: 'petrol',
        items: [
          { num: 1, title: 'Jehovah’s Qualities', meta: '10 min.', names: [] },
          { song: 'Song 5' },
        ],
      },
      {
        label: 'LIVING AS CHRISTIANS',
        farbe: 'wein',
        items: [
          { num: 6, title: 'Item A', meta: '15 min.', names: [] },
          { num: 7, title: 'Congregation Bible Study', meta: '30 min.', names: [] },
        ],
      },
    ],
    helpers: {},
  }
  const emptyWe: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return {
    range: '7.–13. September',
    book: 'JEREMIA 32–33', start: '2026-09-07',
    current: false,
    mid,
    we: structuredClone(emptyWe),
    alt: {
      en: {
        range: 'September 7–13',
        book: 'JEREMIAH 32–33', start: '2026-09-07',
        current: false,
        mid: altMid,
        we: structuredClone(emptyWe),
      },
    },
  }
}

describe('localizedWeek (Sprachvarianten)', () => {
  it('übernimmt Texte aus der Variante, behält Zuteilungen und Struktur', () => {
    const week = makeWeek()
    const en = localizedWeek(week, 'en')
    expect(en).not.toBe(week)
    expect(en.range).toBe('September 7–13')
    expect(en.mid.sections[0].label).toBe('TREASURES FROM GOD’S WORD')
    const item = en.mid.sections[0].items[0] as PartItem
    expect(item.title).toBe('Jehovah’s Qualities')
    expect(item.meta).toBe('10 min.')
    // Zuteilungen bleiben kanonisch
    expect(item.names[0].name).toBe('T. Lindner')
    expect(en.mid.helpers.mik).toEqual([{ name: 'S. Krüger' }])
    // Lied aus der Variante
    expect(en.mid.sections[0].items[1]).toEqual({ song: 'Song 5' })
  })

  it('ohne Variante bleibt die Woche identisch (gleiche Referenz)', () => {
    const week = makeWeek()
    expect(localizedWeek(week, 'fr')).toBe(week)
    expect(localizedWeek(week, undefined)).toBe(week)
  })

  it('fällt bei Struktur-Abweichung auf die kanonische Zusammenkunft zurück', () => {
    const week = makeWeek()
    week.alt!.en.mid.sections[0].items.pop() // Variante desynchronisieren
    const en = localizedWeek(week, 'en')
    // mid bleibt komplett kanonisch (falsche Zuordnung wäre schlimmer)
    expect((en.mid.sections[0].items[0] as PartItem).title).toBe('Über Jehovas Eigenschaften')
    // Wochen-Kopf kommt weiterhin aus der Variante
    expect(en.range).toBe('September 7–13')
  })

  it('localizedWeeks lässt Wochen ohne Varianten unangetastet', () => {
    const weeks = [makeWeek()]
    expect(localizedWeeks(weeks, 'fr')).toBe(weeks)
    const localized = localizedWeeks(weeks, 'en')
    expect(localized).not.toBe(weeks)
    expect(localized[0].range).toBe('September 7–13')
  })
})

describe('missingVariants (Nachimport-Kandidaten)', () => {
  it('findet Wochen, denen konfigurierte Sprachvarianten fehlen', () => {
    // Hat eine en-Variante, aber kein Startdatum → nicht nachladbar. Seit T66
    // ist `start` verpflichtend; der leere String ist die Form für „aus
    // Altbestand, noch nicht nachgetragen".
    const w0 = { ...makeWeek(), start: '' }
    const w1 = { ...makeWeek(), start: '2026-09-07', lang: 'de' }
    const w2 = { ...makeWeek(), start: '2026-09-14', lang: 'de', alt: undefined }
    const res = missingVariants([w0, w1, w2], ['en', 'uk'], 'de')
    expect(res).toEqual([
      { wi: 1, start: '2026-09-07', lang: 'de', codes: ['uk'] }, // en schon da
      { wi: 2, start: '2026-09-14', lang: 'de', codes: ['en', 'uk'] },
    ])
  })

  it('zählt die Primärsprache der Woche nie als fehlend', () => {
    const w = { ...makeWeek(), start: '2026-09-07', lang: 'en', alt: undefined }
    expect(missingVariants([w], ['en'], 'de')).toEqual([])
  })

  it('liefert nichts ohne konfigurierte Sprachen oder ohne importierte Wochen', () => {
    expect(missingVariants([makeWeek()], ['en'], 'de')).toEqual([]) // kein start
    const w = { ...makeWeek(), start: '2026-09-07', lang: 'de', alt: undefined }
    expect(missingVariants([w], [], 'de')).toEqual([])
  })
})

describe('LAC-Edits halten Sprachvarianten aligned', () => {
  const LAC = 1 // Sektionsindex von UNSER LEBEN ALS CHRIST

  it('lacRemove entfernt das Item auch in der Variante', () => {
    const weeks = [makeWeek()]
    const next = lacRemove(weeks, 0, 'mid', LAC, 0)
    expect(next[0].mid.sections[LAC].items).toHaveLength(1)
    expect(next[0].alt!.en.mid.sections[LAC].items).toHaveLength(1)
    // Anzeige der Variante funktioniert weiterhin (Struktur aligned)
    const en = localizedWeek(next[0], 'en')
    expect((en.mid.sections[LAC].items[0] as PartItem).title).toBe('Congregation Bible Study')
  })

  it('lacAdd fügt den eigenen Punkt in allen Varianten ein', () => {
    const weeks = [makeWeek()]
    const next = lacAdd(weeks, 0, 'mid', LAC, 'Örtliche Bedürfnisse')
    expect(next[0].mid.sections[LAC].items).toHaveLength(3)
    expect(next[0].alt!.en.mid.sections[LAC].items).toHaveLength(3)
    const en = localizedWeek(next[0], 'en')
    // Eigener Punkt bleibt in beiden Sprachen der lokale Text
    expect((en.mid.sections[LAC].items[1] as PartItem).title).toBe('Örtliche Bedürfnisse')
  })

  it('lacAdjust zieht Minuten und Ende in der Variante nach', () => {
    const weeks = [makeWeek()]
    const next = lacAdjust(weeks, 0, 'mid', LAC, 0, 5)
    expect((next[0].mid.sections[LAC].items[0] as PartItem).meta).toBe('20 Min.')
    expect((next[0].alt!.en.mid.sections[LAC].items[0] as PartItem).meta).toBe('20 min.')
    expect(next[0].alt!.en.mid.end).toBe('Ends approx. 20:50')
  })

  it('lacMove tauscht in der Variante dieselben Positionen', () => {
    const weeks = [makeWeek()]
    const next = lacMove(weeks, 0, 'mid', LAC, 0, 1)
    expect((next[0].mid.sections[LAC].items[0] as PartItem).title).toBe('Versammlungsbibelstudium')
    expect((next[0].alt!.en.mid.sections[LAC].items[0] as PartItem).title).toBe('Congregation Bible Study')
    // Nummern bleiben positionsfest — auch in der Variante
    expect((next[0].alt!.en.mid.sections[LAC].items[0] as PartItem).num).toBe(6)
  })
})

/**
 * **Sprachvarianten jenseits des Englischen.**
 *
 * Alles oben misst mit `alt.en` — lateinische Schrift, westliche Ziffern,
 * dieselbe Leserichtung. Genau die Eigenschaften also, die im Deutschen auch
 * gelten und deshalb nichts beweisen. Die Varianten, die eine Versammlung
 * tatsächlich konfiguriert, sehen anders aus: arabisch-indische Ziffern,
 * Zweirichtungs-Marken, Ostasien ohne Wortzwischenräume.
 *
 * Zwei Zusicherungen von `localizedWeek` müssen dabei unverändert halten, und
 * beide sind hier schon einmal knapp danebengegangen:
 *
 *  1. **Nur Texte werden übernommen** — Zuteilungen, Kennungen und Struktur
 *     bleiben kanonisch. Ein Name, der aus der Variante käme, wäre leer (die
 *     Varianten tragen keine Zuteilungen), und die Zuteilung wäre weg.
 *  2. **Bei abweichender Struktur bleibt alles kanonisch.** Lieber eine
 *     deutsche Zeile als ein Titel über dem falschen Programmpunkt.
 */
describe('Sprachvarianten in fremden Schriften', () => {
  /** Eine Variante, wie der Import sie liefert: Texte übersetzt, Plätze leer. */
  function variante(texte: {
    range: string
    datum: string
    ende: string
    label: string
    titel: string
    meta: string
    lied: string
    lacTitel: string
    vbsTitel: string
  }): Week {
    const meeting: Meeting = {
      date: texte.datum,
      end: texte.ende,
      sections: [
        {
          label: texte.label,
          farbe: 'petrol',
          items: [
            { num: 1, title: texte.titel, meta: texte.meta, names: [] },
            { song: texte.lied },
          ],
        },
        {
          label: texte.lacTitel,
          farbe: 'wein',
          items: [
            { num: 6, title: 'Punkt A', meta: '15 Min.', names: [] },
            { num: 7, title: texte.vbsTitel, meta: '30 Min.', names: [] },
          ],
        },
      ],
      helpers: {},
    }
    return {
      range: texte.range,
      book: 'x', start: '2026-09-07', current: false,
      mid: meeting,
      we: { date: '', end: '', sections: [], helpers: {} },
    }
  }

  /** Arabisch: eigene Ziffern, RTL-Marken im Text. */
  const ARABISCH = variante({
    range: '٧–١٣ سبتمبر',
    datum: 'الثلاثاء، ٨ سبتمبر · ١٩:٠٠',
    ende: 'ينتهي حوالي ٢٠:٤٥',
    label: 'كنوز من كلمة الله',
    titel: 'صفات يهوه',
    meta: '١٠ دق',
    lied: 'الترنيمة ٥',
    lacTitel: 'حياتنا كمسيحيين',
    vbsTitel: 'درس الجماعة للكتاب المقدس',
  })

  /** Japanisch: keine Wortzwischenräume, Zahl und Einheit ohne Fuge. */
  const JAPANISCH = variante({
    range: '9月7–13日',
    datum: '9月8日火曜日 · 19:00',
    ende: '約20:45終了',
    label: '神の言葉の宝',
    titel: 'エホバの特質',
    meta: '10分',
    lied: '歌5番',
    lacTitel: 'クリスチャンとして生きる',
    vbsTitel: '会衆聖書研究',
  })

  const mitVarianten = (): Week => {
    const w = makeWeek()
    w.alt = { ...w.alt, ar: ARABISCH, ja: JAPANISCH }
    return w
  }

  /**
   * Der erste Abschnitt einer Woche, mit Wächter statt `!`.
   *
   * Die Sperrklinke aus T42 (`noUncheckedIndexedAccess`) zählt jeden
   * ungeprüften Index-Zugriff je Datei und lässt die Zahl nur fallen. Neue
   * Prüfungen fangen deshalb bei null an — auch in einer Datei, die noch
   * Altbestand trägt.
   */
  const ersterAbschnitt = (w: Week) => {
    const s = w.mid.sections[0]
    if (!s) throw new Error('Testaufbau: die Woche hat keinen Abschnitt')
    return s
  }
  const punkt = (w: Week, ii: number): PartItem => {
    const p = ersterAbschnitt(w).items[ii]
    if (!p || 'song' in p) throw new Error(`Testaufbau: Punkt ${ii} fehlt`)
    return p
  }

  it.each([['ar', ARABISCH], ['ja', JAPANISCH]] as const)(
    '%s: die Texte kommen an, die Zuteilungen bleiben',
    (code, quelle) => {
      const lokal = localizedWeek(mitVarianten(), code)
      expect(lokal.range).toBe(quelle.range)
      expect(lokal.mid.date).toBe(quelle.mid.date)
      expect(ersterAbschnitt(lokal).label).toBe(ersterAbschnitt(quelle).label)
      expect(punkt(lokal, 0).title).toBe(punkt(quelle, 0).title)
      expect(ersterAbschnitt(lokal).items[1]).toEqual(ersterAbschnitt(quelle).items[1])
      // **Die Zuteilung bleibt kanonisch.** Die Variante trägt keine — würde
      // sie übernommen, stünde der Platz plötzlich leer da.
      expect(punkt(lokal, 0).names[0]?.name).toBe('T. Lindner')
      expect(lokal.mid.helpers.mik).toEqual([{ name: 'S. Krüger' }])
    },
  )

  it.each(['ar', 'ja'] as const)('%s: die Minuten bleiben lesbar', (code) => {
    // Die Meta-Zeile kommt aus der Variante — in ihrer eigenen Schrift. Der
    // Minuten-Rückfall muss sie trotzdem lesen können (T32).
    const lokal = localizedWeek(mitVarianten(), code)
    expect(itemMinutes({ ...punkt(lokal, 0), mins: undefined })).toBe(10)
  })

  it.each(['ar', 'ja'] as const)('%s: abweichende Struktur → alles bleibt kanonisch', (code) => {
    const w = mitVarianten()
    const variante = w.alt?.[code]
    if (!variante) throw new Error('Testaufbau: die Variante fehlt')
    ersterAbschnitt(variante).items.pop()
    const lokal = localizedWeek(w, code)
    expect(punkt(lokal, 0).title).toBe('Über Jehovas Eigenschaften')
    // Der Wochenkopf steht außerhalb der Struktur-Prüfung und kommt weiterhin
    // aus der Variante — dieselbe Regel wie im englischen Fall darüber.
    expect(lokal.range).toBe(variante.range)
  })

  it('mehrere Varianten stören einander nicht', () => {
    // Eine Versammlung kann mehrere Programmsprachen führen; jede Anzeige holt
    // sich ihre. Würde `localizedWeek` die Woche verändern statt zu kopieren,
    // sähe die zweite Sprache die erste.
    const w = mitVarianten()
    const ar = localizedWeek(w, 'ar')
    const ja = localizedWeek(w, 'ja')
    expect(ar.range).toBe(ARABISCH.range)
    expect(ja.range).toBe(JAPANISCH.range)
    expect(w.range).toBe('7.–13. September') // die kanonische bleibt unberührt
  })

  it('eine nicht konfigurierte Sprache liefert dieselbe Woche zurück', () => {
    const w = mitVarianten()
    expect(localizedWeek(w, 'he')).toBe(w)
  })

  it('missingVariants nennt genau die fehlenden Codes', () => {
    const w = { ...mitVarianten(), lang: 'de' }
    expect(missingVariants([w], ['ar', 'ja', 'he', 'de'], 'de')).toEqual([
      { wi: 0, start: '2026-09-07', lang: 'de', codes: ['he'] },
    ])
  })
})
