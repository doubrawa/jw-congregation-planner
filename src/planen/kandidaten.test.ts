import { describe, expect, it } from 'vitest'
import { KEINE_ABWESENHEIT, buildAbsences } from '../data/absence'
import { syncAuxSlots } from '../data/aux-class'
import { emptyQualifications } from '../data/helpers'
import { DE } from '../i18n/de'
import { kandidaten, type KandidatenDaten } from './kandidaten'
import type { Absence, PartItem, Person, Qualifications, Service, SlotSelection, Week } from '../data/types'
import { privSetzen } from '../data/helpers'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * Die Auswahlliste des Zuteilungs-Sheets war der wichtigste ungetestete Code
 * der App: Filter, Geschlechtsregeln, Auslastung und Sortierung lagen mitten
 * im JSX. Genau dort blieb unbemerkt, dass der Gesprächsführer immer im
 * Hauptsaal gesucht wurde — auch für einen Platz der Zusätzlichen Klasse.
 */

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) privSetzen(q, k, true)
  return q
}

function person(id: string, fn: string, ln: string, female: boolean, ...q: string[]): Person {
  return { id, fn, ln, role: 'verkuendiger', female, priv: priv(...q), grp: null }
}

const BRUDER_A = person('b1', 'Anton', 'Alt', false, 'schulung', 'schulungPartner')
const BRUDER_B = person('b2', 'Bernd', 'Brand', false, 'schulung', 'schulungPartner')
const SCHWESTER_C = person('s1', 'Clara', 'Cohn', true, 'schulung', 'schulungPartner')
const SCHWESTER_D = person('s2', 'Dora', 'Dietz', true, 'schulung', 'schulungPartner')

const PERSONEN = [BRUDER_A, BRUDER_B, SCHWESTER_C, SCHWESTER_D]
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Schülerteil mit Führer- und Partner-Platz, in beiden Räumen. */
function wocheMitKlasse(fuehrerHaupt: string, fuehrerKlasse: string): Week {
  const item: PartItem = { iid: 'i75',
    title: 'Gespräche beginnen',
    names: [
      { name: fuehrerHaupt, bereichsKey: 'schulung' },
      { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' },
    ],
  }
  const w: Week = {
    range: '',
    book: '', start: '2026-09-07',
    
    mid: { date: '', end: '', sections: [{ label: 'X', farbe: 'gold', items: [item] }], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
  const an = syncAuxSlots([w], true)[0]!
  const auxItem = an.mid.sections[0]!.items[0] as PartItem
  auxItem.aux![0]!.name = fuehrerKlasse
  return an
}

/** Dienstag 19 Uhr, Sonntag 10 Uhr — daran misst die Abwesenheit. */
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }

function daten(weeks: Week[], persons = PERSONEN, absences: Absence[] = []): KandidatenDaten {
  return {
    weeks,
    persons,
    lang: 'de',
    groups: [],
    services: DIENSTE,
    fsWeeks: [],
    absences,
    congregation: { name: 'Test', hall: 'Saal', times: ZEITEN },
  }
}

const partnerSlot = (aux: boolean): SlotSelection => ({
  kind: 'part',
  wi: 0,
  tab: 'mid',
  si: 0,
  ii: 0,
  ni: 1,
  aux: aux || undefined,
  priv: 'schulungPartner',
  groups: false,
  label: 'Gespräche beginnen',
})

const namen = (sel: SlotSelection, state: KandidatenDaten) =>
  kandidaten(state, sel, KEINE_ABWESENHEIT, DE, (s) => s).map((c) => c.name)

/** Wer zur Wahl steht, ohne die Reihenfolge — für die Fragen des Filters. */
const wer = (sel: SlotSelection, state: KandidatenDaten) => namen(sel, state).sort()

describe('Gesprächspartner richtet sich nach dem Führer DESSELBEN Raums', () => {
  // Hauptsaal: Bruder führt → nur Brüder als Partner.
  // Zusätzliche Klasse: Schwester führt → nur Schwestern.
  const state = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')])

  it('Hauptsaal folgt dem Hauptsaal-Führer', () => {
    expect(wer(partnerSlot(false), state)).toEqual(['Anton Alt', 'Bernd Brand'])
  })

  it('Zusätzliche Klasse folgt IHREM Führer, nicht dem des Hauptsaals', () => {
    // Vorher stand hier dieselbe Liste wie oben — die Klasse richtete sich
    // nach dem falschen Raum.
    expect(wer(partnerSlot(true), state)).toEqual(['Clara Cohn', 'Dora Dietz'])
  })

  it('und andersherum genauso', () => {
    const gedreht = daten([wocheMitKlasse('Clara Cohn', 'Anton Alt')])
    expect(wer(partnerSlot(false), gedreht)).toEqual(['Clara Cohn', 'Dora Dietz'])
    expect(wer(partnerSlot(true), gedreht)).toEqual(['Anton Alt', 'Bernd Brand'])
  })
})

  it('der Führer wird über seine Id erkannt, nicht über seinen Namen', () => {
    /*
      Zwei Gleichnamige verschiedenen Geschlechts — bis T110 möglich, seither
      verbietet es der Index `persons_name_eindeutig`. Am Namen allein
      entschied die **Reihenfolge der Personenliste**, wer als Führer gilt:
      Steht die Schwester vorn, bekam der Bruder Schwestern als
      Gesprächspartnerinnen vorgeschlagen.

      Der Platz trägt eine `pid`, sobald ihn jemand zugeteilt hat. `gehoertZu`
      ist die Stelle, an der „gehört dieser Platz dieser Person?" entschieden
      wird — hier stand eine vierte Fassung derselben Frage.
    */
    const w = wocheMitKlasse('Anton Alt', 'Clara Cohn')
    const fuehrer = (w.mid.sections[0]!.items[0] as PartItem).names[0]!
    fuehrer.pid = BRUDER_A.id
    // Die Namensvetterin steht VOR ihm — `find` über den Namen träfe sie.
    const schwesterAlt = person('s9', 'Anton', 'Alt', true, 'schulung', 'schulungPartner')
    const s = daten([w], [schwesterAlt, ...PERSONEN])

    expect(wer(partnerSlot(false), s)).toEqual(['Anton Alt', 'Bernd Brand'])
  })

describe('Kandidatenliste allgemein', () => {
  const state = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')])

  it('filtert nach Qualifikation', () => {
    const ohne = person('x1', 'Egon', 'Ernst', false) // gar nichts qualifiziert
    const s = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')], [...PERSONEN, ohne])
    expect(namen(partnerSlot(false), s)).not.toContain('Egon Ernst')
  })

  it('ohne Rangfolge der Automatik alphabetisch nach Nachname', () => {
    // Am Redner-Platz wählt die Automatik nie (`rangfolgeFuer` ist leer) —
    // dort bleibt es bei der Ordnung des Alphabets.
    const ALLE = [
      person('x4', 'Dieter', 'Dietz', false),
      person('x2', 'Bernd', 'Brand', false),
      person('x3', 'Carl', 'Cohn', false),
      person('x1', 'Anton', 'Alt', false),
    ].map((p): Person => ({ ...p, role: 'aeltester' }))
    const woche: Week = {
      range: '', book: '', start: '2026-09-07',
      mid: { date: '', end: '', sections: [], helpers: {} },
      we: {
        date: '', end: '', helpers: {},
        sections: [{ label: 'X', farbe: 'petrol', items: [{ iid: 'i81', title: 'Thema', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] }],
      },
    }
    const redner: SlotSelection = { kind: 'part', wi: 0, tab: 'we', si: 0, ii: 0, ni: 0, priv: 'vortrag', groups: false, guest: true, label: 'Thema' }
    expect(namen(redner, daten([woche], ALLE))).toEqual(['Anton Alt', 'Bernd Brand', 'Carl Cohn', 'Dieter Dietz'])
  })

  it('schiebt Abwesende stabil ans Ende, ohne sie zu entfernen', () => {
    const weeks = [wocheMitKlasse('Anton Alt', 'Clara Cohn')]
    weeks[0]!.start = '2026-09-07'
    const abw: Absence[] = [
      { id: 'a1', personId: BRUDER_A.id, userId: 'u', from: '2026-09-07', to: '2026-09-09', reason: '' },
    ]
    const s = daten(weeks, PERSONEN, abw)
    const set = buildAbsences(abw, weeks, ZEITEN)
    const liste = kandidaten(s, { ...partnerSlot(false), priv: null } as SlotSelection, set, DE, (x) => x)
    expect(liste.map((c) => c.name).at(-1)).toBe('Anton Alt')
    const anton = liste.find((c) => c.name === 'Anton Alt')
    expect(anton?.absent).toBe(true)
    // Mit ihrem Zeitraum — das Blatt nennt ihn („abwesend 7.–9. September").
    expect(anton?.abwesenheit?.id).toBe('a1')
  })

  it('meldet den Führer als „schon heute zugeteilt"', () => {
    const liste = kandidaten(state, partnerSlot(false), KEINE_ABWESENHEIT, DE, (x) => x)
    expect(liste.find((c) => c.name === 'Anton Alt')?.today.length).toBe(1)
    expect(liste.find((c) => c.name === 'Bernd Brand')?.today).toEqual([])
  })

  it('erkennt den Führer der Klasse ebenfalls als zugeteilt (T17)', () => {
    const liste = kandidaten(state, partnerSlot(true), KEINE_ABWESENHEIT, DE, (x) => x)
    expect(liste.find((c) => c.name === 'Clara Cohn')?.today.length).toBe(1)
  })
})

/**
 * **Ein Platz nur für Brüder** (Schülervortrag, `male` aus dem Import):
 * `isQualified` prüft bewusst kein Geschlecht — welche Bereiche eine Schwester
 * übernimmt, entscheiden die Schalter. Die Sperre ist der Platz selbst. Eine
 * Schwester mit versehentlich gesetztem Bereich stünde sonst zur Wahl, und
 * ein Tipp teilte sie zum Vortrag ein. Bis zum 31.10.2026 lief diese Regel der
 * Liste in keinem Test (den Ratgeber prüft `sonderplaetze.test.ts`).
 */
describe('Ein Platz nur für Brüder — keine Schwester, auch nicht mit dem Bereich', () => {
  const BRUDER = person('vb', 'Viktor', 'Vogt', false, 'schulungVortrag')
  const SCHWESTER = person('vs', 'Vera', 'Voss', true, 'schulungVortrag')
  const woche = (nurBrueder: boolean): Week => ({
    range: '', book: '', start: '2026-09-07',
    mid: {
      date: '', end: '', helpers: {},
      sections: [{ label: 'X', farbe: 'gold', items: [{ iid: 'i90', title: 'Demoaufgabe 4', names: [{ name: '', bereichsKey: 'schulungVortrag', ...(nurBrueder ? { male: true } : {}) }] }] }],
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  })
  const vortrag: SlotSelection = { kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 0, priv: 'schulungVortrag', groups: false, label: 'Demoaufgabe 4' }

  it('der Schülervortrag bietet nur den Bruder an', () => {
    expect(wer(vortrag, daten([woche(true)], [BRUDER, SCHWESTER]))).toEqual(['Viktor Vogt'])
  })

  it('Gegenprobe: Ohne die Marke am Platz entscheidet allein der Bereich — dann steht sie da', () => {
    expect(wer(vortrag, daten([woche(false)], [BRUDER, SCHWESTER]))).toEqual(['Vera Voss', 'Viktor Vogt'])
  })
})

/**
 * **„Am anderen Tag schon dran" zählt nur, wenn der andere Tag stattfindet.**
 * Fällt das Wochenende aus (Kongress, T30), ruhen seine Zuteilungen; sie
 * neben der Person zu nennen, hielte den Planer von jemandem ab, der frei ist.
 */
describe('Der andere Tag der Woche', () => {
  const woche = (wochenendeFaelltAus: boolean): Week => {
    const w = wocheMitKlasse('', '')
    w.we = {
      date: '', end: '', helpers: {},
      sections: [{ label: 'Y', farbe: 'petrol', items: [{ iid: 'i91', title: 'Demoaufgabe 5', names: [{ name: 'Anton Alt', pid: BRUDER_A.id, bereichsKey: 'schulung' }] }] }],
    }
    if (wochenendeFaelltAus) w.dev = { we: { cancelled: true } }
    return w
  }
  const anton = (w: Week) => kandidaten(daten([w]), partnerSlot(false), KEINE_ABWESENHEIT, DE, (s) => s).find((c) => c.key === BRUDER_A.id)!

  it('findet das Wochenende statt, steht sein Platz dort neben ihm', () => {
    expect(anton(woche(false)).andererTag).toEqual({ tab: 'we', aufgaben: [expect.objectContaining({ text: expect.stringContaining('Demoaufgabe 5') })] })
  })

  it('fällt es aus, steht dort nichts', () => {
    expect(anton(woche(true)).andererTag).toBeUndefined()
  })
})

/**
 * **Nach dem stillen Nachladen kann der Platz fort sein.** Scheitert ein
 * Schreibvorgang an einem Konflikt, lädt die App still nach; das Blatt bleibt
 * offen, solange seine Woche da ist (`slotSel` im Reducer). Hat ein anderer
 * Planer den Punkt oder Treffpunkt inzwischen entfernt, zeigt die Auswahl ins
 * Leere — die Liste darf daran nicht abstürzen (zuteilen lässt sich dort
 * ohnehin nichts mehr, `assignSlot`).
 */
describe('Ein Platz, den es nach dem Nachladen nicht mehr gibt', () => {
  it('ein entfernter Programmpunkt: die Qualifizierten stehen da — ohne Geschlechtsregel, denn es gibt keinen Führer mehr', () => {
    const state = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')])
    const fort: SlotSelection = { ...partnerSlot(false), ii: 5 } as SlotSelection
    expect(wer(fort, state)).toEqual(['Anton Alt', 'Bernd Brand', 'Clara Cohn', 'Dora Dietz'])
  })
})

/**
 * **Der Redner-Platz: nach Stellung, nicht nach Bereich** (Betreiber,
 * 4.10.2026).
 *
 * Den öffentlichen Vortrag am Sonntag kann jeder Älteste und Dienstamtgehilfe
 * halten. Eingeteilt wird er ohnehin von Hand — ein eigener Bereich wäre Pflege
 * ohne Nutzen, und `vortrag` meint seither nur noch den Vortrag unter „Schätze
 * aus Gottes Wort". Ob ein Platz ein Redner-Platz ist, sagt `sel.guest`
 * (`isSpeakerRole`, gesetzt in `MeetingSection`).
 */
describe('Redner-Platz: Älteste und Dienstamtgehilfen, ohne Bereich', () => {
  const ALT: Person = { ...person('a1', 'Albert', 'Ahrens', false), role: 'aeltester' }
  const DAG: Person = { ...person('d1', 'Detlef', 'Dorn', false), role: 'dienstamtgehilfe' }
  // Hat den Bereich des Platzes, ist aber Verkündiger.
  const VERK = person('v1', 'Viktor', 'Vogt', false, 'vortrag')
  const ALLE = [ALT, DAG, VERK]

  /** Ein Punkt mit dem Bereich `vortrag` — wie der Vortragsplatz aus dem Import. */
  const woche: Week = {
    range: '', book: '', start: '2026-09-07',
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: {
      date: '', end: '', helpers: {},
      sections: [{ label: 'X', farbe: 'petrol', items: [{ iid: 'i80', title: 'Thema', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] }],
    },
  }
  const platz = (guest: boolean): SlotSelection => ({
    kind: 'part', wi: 0, tab: 'we', si: 0, ii: 0, ni: 0, priv: 'vortrag', groups: false, guest, label: 'Thema',
  })

  it('am Redner-Platz stehen die Ältesten und Dienstamtgehilfen — auch ohne den Bereich', () => {
    expect(namen(platz(true), daten([woche], ALLE))).toEqual(['Albert Ahrens', 'Detlef Dorn'])
  })

  it('Gegenprobe: derselbe Bereich an einem gewöhnlichen Platz fragt weiter den Bereich', () => {
    expect(namen(platz(false), daten([woche], ALLE))).toEqual(['Viktor Vogt'])
  })
})

describe('Rollen-Beschriftung der Kandidaten', () => {
  /**
   * Die Rolle kommt aus dem UI-Wörterbuch (`ROLE_KEY` → Dict), nicht mehr aus
   * dem Fragment-Übersetzer. Der Unterschied ist nicht kosmetisch: FRAG fällt
   * bei einer Lücke stumm auf Deutsch zurück und wird von keiner
   * Vollständigkeitsprüfung erfasst — der Rollen-Chip im Personen-Detail stand
   * dann in der Fremdsprache und die Zeile darunter auf Deutsch, für dieselbe
   * Person auf demselben Bildschirm.
   *
   * Die weibliche Form ist zugleich gestrichen (Betreiber-Entscheid
   * 15.8.2026): Sie hing als deutsches `+ "in"` im Code und war damit in den
   * übrigen 33 Sprachen ohnehin nie richtig.
   */
  const AELTESTER: Person = { ...BRUDER_A, id: 'b9', fn: 'Ernst', ln: 'Egger', role: 'aeltester' }

  // Leerer Führerplatz: dann entfällt die Geschlechtsregel des Partner-Slots
  // und beide stehen zur Wahl (siehe geschlechtsPruefung).
  const rollen = (personen: Person[]) =>
    kandidaten(daten([wocheMitKlasse('', '')], personen), partnerSlot(false), KEINE_ABWESENHEIT, DE, (s) => s)
      .map((c) => [c.name, c.sub.split(' · ')[0]])

  it('nimmt das Wörterbuch-Label der Rolle', () => {
    expect(rollen([SCHWESTER_C, AELTESTER])).toEqual([
      ['Clara Cohn', DE.rolleVerk],
      ['Ernst Egger', DE.rolleAeltester],
    ])
  })

  it('Schwestern tragen keine weibliche Form mehr', () => {
    expect(rollen([SCHWESTER_C])).toEqual([['Clara Cohn', 'Verkündiger']])
  })
})

/*
 * Der Treffpunkt-Zweig derselben Funktion. Er war der einzige der drei, den
 * kein Test je aufrief — aufgefallen beim Lesen der Abdeckung (T67), nicht
 * beim Benutzen: Er tut ja etwas, nur eben ungeprüft. Und er hat eigene
 * Regeln, die den beiden anderen gerade nicht gleichen — „schon heute" meint
 * hier den Wochentag DIESES Treffpunkts, und die Abwesenheit wird an seinem
 * Datum gemessen, nicht an der Zusammenkunft.
 */
describe('Treffpunkt-Leiter: eigene Liste, eigene Regeln', () => {
  const LEITER_E = person('l1', 'Emil', 'Ernst', false, 'treffpunkt')
  const LEITER_F = person('l2', 'Frida', 'Falk', true, 'treffpunkt')
  const OHNE = person('l3', 'Gustav', 'Gross', false, 'schulung')

  /** Zwei Treffpunkte am Montag, einer am Mittwoch. */
  const TREFFPUNKTE = [
    { id: 'a', ruleId: null, grp: null, wd: 1, time: '09:00', place: 'Saal', leader: '' },
    { id: 'b', ruleId: null, grp: null, wd: 1, time: '14:00', place: 'Park', leader: '' },
    { id: 'c', ruleId: null, grp: null, wd: 3, time: '09:00', place: 'Halle', leader: '' },
  ]

  /** Eine Woche ohne Programm — nur ihr Montag zählt, daran hängt der Tag des Treffpunkts. */
  const leer = (start: string) =>
    ({
      range: '', start, book: '',
      mid: { date: '', end: '', sections: [], helpers: {} },
      we: { date: '', end: '', sections: [], helpers: {} },
    }) as unknown as Week

  /** Die Treffpunkte liegen in der Woche ab Montag, 7.9.2026. */
  function fsDaten(instanzen = TREFFPUNKTE, absences: Absence[] = []): KandidatenDaten {
    return { ...daten([leer('2026-09-07')], [LEITER_E, LEITER_F, OHNE], absences), fsWeeks: [instanzen] }
  }

  const fsSlot = (instId: string): SlotSelection => ({
    kind: 'fs', wi: 0, instId, label: 'Treffpunkt', priv: 'treffpunkt', groups: false,
  })

  const liste = (instId: string, state: KandidatenDaten) =>
    kandidaten(state, fsSlot(instId), KEINE_ABWESENHEIT, DE, (s) => s)

  it('nur treffpunkt-Qualifizierte, alphabetisch', () => {
    expect(liste('a', fsDaten()).map((c) => c.name)).toEqual(['Emil Ernst', 'Frida Falk'])
  })

  it('„schon heute" nennt den anderen Treffpunkt desselben Wochentags', () => {
    const belegt = TREFFPUNKTE.map((i) => (i.id === 'b' ? { ...i, leader: 'Emil Ernst' } : i))
    const emil = liste('a', fsDaten(belegt))[0]!
    expect(emil.name).toBe('Emil Ernst')
    expect(emil.today.map((h) => h.text)).toEqual([`14:00 · ${DE.fsVers}`])
  })

  it('ein Treffpunkt an einem ANDEREN Wochentag zählt nicht dazu', () => {
    // Wer am Mittwoch leitet, ist am Montag frei — sonst sperrte eine Leitung
    // die ganze Woche.
    const belegt = TREFFPUNKTE.map((i) => (i.id === 'c' ? { ...i, leader: 'Emil Ernst' } : i))
    expect(liste('a', fsDaten(belegt))[0]!.today).toEqual([])
  })

  it('der eigene Platz zählt nicht als „schon heute"', () => {
    const belegt = TREFFPUNKTE.map((i) => (i.id === 'a' ? { ...i, leader: 'Emil Ernst' } : i))
    expect(liste('a', fsDaten(belegt))[0]!.today).toEqual([])
  })

  it('abwesend am Tag DIESES Treffpunkts, nicht irgendwann in der Woche', () => {
    // Die Woche beginnt Montag, 7.9.2026; der Mittwochs-Treffpunkt liegt am 9.9.
    const nurMittwoch: Absence[] = [
      { id: 'u', personId: 'l1', userId: '', from: '2026-09-09', to: '2026-09-09', reason: '' },
    ]
    const state = fsDaten(TREFFPUNKTE, nurMittwoch)
    expect(liste('a', state).find((c) => c.key === 'l1')?.absent, 'Montag').toBe(false)
    const mittwoch = liste('c', state).find((c) => c.key === 'l1')
    expect(mittwoch?.absent, 'Mittwoch').toBe(true)
    expect(mittwoch?.abwesenheit?.id).toBe('u')
  })

  it('bei einer Lücke im Bestand zählt der Tag DIESER Woche, nicht der aus der Position', () => {
    /*
     * **Zwei Antworten auf dieselbe Frage.** „Ist die Person am Tag dieses
     * Treffpunkts abwesend?" beantwortete das Konfliktbanner über den Montag
     * der Woche (`fsWeekConflicts`), das Kandidatenblatt aber über „Montag der
     * Woche 0 plus wi Wochen". Ohne Lücke im Bestand ist das dasselbe — fehlt
     * eine Woche, liegen beide sieben Tage auseinander, und der Planer sah im
     * Banner eine Abwesenheit, die die Liste daneben nicht kannte.
     *
     * Hier steht in Position 1 der 21.9. (der 14. fehlt). Der Montags-
     * Treffpunkt liegt also am 21., nicht am 14.
     */
    const state: KandidatenDaten = {
      ...daten([], [LEITER_E, LEITER_F, OHNE]),
      weeks: [leer('2026-09-07'), leer('2026-09-21')],
      fsWeeks: [[], TREFFPUNKTE],
      absences: [
        { id: 'u', personId: 'l1', userId: '', from: '2026-09-21', to: '2026-09-21', reason: '' },
      ],
    }
    const sel: SlotSelection = {
      kind: 'fs', wi: 1, instId: 'a', label: 'Treffpunkt', priv: 'treffpunkt', groups: false,
    }
    const emil = kandidaten(state, sel, KEINE_ABWESENHEIT, DE, (s) => s).find((c) => c.key === 'l1')
    expect(emil?.absent, 'Montag der Woche 1 ist der 21.9.').toBe(true)
  })

  it('ein Freitext-Leiter macht seinen Namensvetter nicht „schon heute" dran', () => {
    // Wer als Freitext dasteht, ist nicht diese Person — er heißt nur so
    // (`fsLeiterZuteilung`).
    const gast = TREFFPUNKTE.map((i) => (i.id === 'b' ? { ...i, leader: 'Emil Ernst', lext: true } : i))
    expect(liste('a', fsDaten(gast)).find((c) => c.key === 'l1')?.today).toEqual([])
  })

  it('ohne „zuletzt" und ohne Punkte — Treffpunkte zählt die Automatik anders', () => {
    // Die Zahl der Punkte ist die Zusammenkunfts-Last (`workloadOf`);
    // Treffpunkte zählen ausdrücklich nicht hinein (`fsLast`). Eine Zahl
    // daneben behauptete hier etwas, das die Wahl nicht trägt.
    const emil = liste('a', fsDaten()).find((c) => c.key === 'l1')
    expect(emil?.last).toBeUndefined()
    expect(emil?.zuletzt).toBeUndefined()
    expect(emil?.sub).toBe(DE.rolleVerk)
  })

  it('Abwesende bleiben in der Liste, rutschen aber ans Ende', () => {
    const emilWeg: Absence[] = [
      { id: 'u', personId: 'l1', userId: '', from: '2026-09-07', to: '2026-09-07', reason: '' },
    ]
    expect(liste('a', fsDaten(TREFFPUNKTE, emilWeg)).map((c) => c.name)).toEqual([
      'Frida Falk',
      'Emil Ernst',
    ])
  })

  it('ist der Treffpunkt nach dem stillen Nachladen fort, stürzt die Liste nicht ab — ohne seinen Tag gibt es kein „abwesend" und kein „schon heute"', () => {
    // Gegenprobe ist der Fall darüber: Mit Treffpunkt rutscht Emil ans Ende.
    const belegt = TREFFPUNKTE.map((i) => (i.id === 'b' ? { ...i, leader: 'Emil Ernst' } : i))
    const emilWeg: Absence[] = [{ id: 'u', personId: 'l1', userId: '', from: '2026-09-07', to: '2026-09-07', reason: '' }]
    expect(liste('fort', fsDaten(belegt, emilWeg)).map((c) => [c.name, c.absent, c.today])).toEqual([
      ['Emil Ernst', false, []],
      ['Frida Falk', false, []],
    ])
  })
})

describe('Gruppen-Slots liefern Gruppen statt Personen', () => {
  it('Reinigung o. Ä.', () => {
    const state: KandidatenDaten = {
      ...daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')]),
      groups: [{ id: 'g1', name: 'Gruppe 1', overseerId: BRUDER_A.id, assistantId: null }],
    }
    const sel: SlotSelection = {
      kind: 'helper',
      wi: 0,
      tab: 'mid',
      svc: 'rein',
      pos: 0,
      priv: null,
      groups: true,
      label: 'Reinigung',
    }
    const liste = kandidaten(state, sel, KEINE_ABWESENHEIT, DE, (x) => x)
    expect(liste.map((c) => c.assignName)).toEqual(['Gruppe 1'])
    // Die Zeile nennt den Aufseher und die Größe der Gruppe; Punkte gibt es
    // nicht — die Reinigung rotiert.
    expect(liste[0]!.sub).toBe(zahlBinden(`Anton Alt · ${DE.mitgliederN.replace('{n}', '0')}`))
    expect(liste[0]!.last).toBeUndefined()
  })

  it('ohne angelegte Gruppen bleibt die Liste leer — das Sheet zeigt dafür einen Hinweis', () => {
    // Die Auto-Zuteilung trägt in diesem Fall trotzdem „Gruppe 1…3" ein
    // (feste Dreizahl in planning.ts). Dass hier nichts zur Auswahl steht, ist
    // der Anlass für den Hinweis im Zuteilungs-Sheet: sonst sieht der Planer
    // eine Zuteilung, die er nicht ändern kann, und keinen Grund dafür.
    const state: KandidatenDaten = {
      ...daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')]),
      groups: [],
    }
    const sel: SlotSelection = {
      kind: 'helper', wi: 0, tab: 'mid', svc: 'rein', pos: 0,
      priv: null, groups: true, label: 'Reinigung',
    }
    expect(kandidaten(state, sel, KEINE_ABWESENHEIT, DE, (x) => x)).toEqual([])
  })

  it('eine aus der Reinigung genommene Gruppe steht nicht zur Wahl — wie eine Person ohne den Bereich', () => {
    // Der Admin hat Gruppe 2 im Blatt der Reinigung abgeschaltet (18.10.2026).
    // „Automatisch" überspringt sie; böte das Blatt sie an, teilte man sie von
    // Hand eben doch ein.
    const gruppe = (n: number, ohneReinigung?: boolean) => ({
      id: `g${n}`, name: `Gruppe ${n}`, overseerId: null, assistantId: null, ohneReinigung,
    })
    const state: KandidatenDaten = {
      ...daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')]),
      groups: [gruppe(1), gruppe(2, true), gruppe(3)],
    }
    const sel: SlotSelection = {
      kind: 'helper', wi: 0, tab: 'mid', svc: 'rein', pos: 0,
      priv: null, groups: true, label: 'Reinigung',
    }
    expect(kandidaten(state, sel, KEINE_ABWESENHEIT, DE, (x) => x).map((c) => c.key)).toEqual(['g1', 'g3'])
    // Wieder hineingenommen steht sie wieder da — an ihrer Stelle.
    const zurueck = { ...state, groups: [gruppe(1), gruppe(2, false), gruppe(3)] }
    expect(kandidaten(zurueck, sel, KEINE_ABWESENHEIT, DE, (x) => x).map((c) => c.key)).toEqual(['g1', 'g2', 'g3'])
  })
})
