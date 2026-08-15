import { describe, expect, it } from 'vitest'
import { KEINE_ABWESENHEIT, buildAbsences } from '../data/absence'
import { syncAuxSlots } from '../data/aux-class'
import { emptyQualifications } from '../data/helpers'
import { DE } from '../i18n/de'
import { kandidaten, type KandidatenDaten } from './kandidaten'
import type { Absence, PartItem, Person, Qualifications, Service, SlotSelection, Week } from '../data/types'

/**
 * Die Auswahlliste des Zuteilungs-Sheets war der wichtigste ungetestete Code
 * der App: Filter, Geschlechtsregeln, Auslastung und Sortierung lagen mitten
 * im JSX. Genau dort blieb unbemerkt, dass der Gesprächsführer immer im
 * Hauptsaal gesucht wurde — auch für einen Platz der Zusätzlichen Klasse.
 */

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) q[k] = true
  return q
}

function person(id: string, fn: string, ln: string, female: boolean, ...q: string[]): Person {
  return { id, fn, ln, role: 'verkuendiger', female, tel: '', mail: '', priv: priv(...q), grp: null }
}

const BRUDER_A = person('b1', 'Anton', 'Alt', false, 'schulung', 'schulungPartner')
const BRUDER_B = person('b2', 'Bernd', 'Brand', false, 'schulung', 'schulungPartner')
const SCHWESTER_C = person('s1', 'Clara', 'Cohn', true, 'schulung', 'schulungPartner')
const SCHWESTER_D = person('s2', 'Dora', 'Dietz', true, 'schulung', 'schulungPartner')

const PERSONEN = [BRUDER_A, BRUDER_B, SCHWESTER_C, SCHWESTER_D]
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Schülerteil mit Führer- und Partner-Platz, in beiden Räumen. */
function wocheMitKlasse(fuehrerHaupt: string, fuehrerKlasse: string): Week {
  const item: PartItem = {
    title: 'Gespräche beginnen',
    names: [
      { name: fuehrerHaupt, bereichsKey: 'schulung' },
      { name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
    ],
  }
  const w: Week = {
    range: '',
    book: '', start: '2026-09-07',
    current: false,
    mid: { date: '', end: '', sections: [{ label: 'X', farbe: 'gold', items: [item] }], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
  const an = syncAuxSlots([w], true)[0]
  const auxItem = an.mid.sections[0].items[0] as PartItem
  auxItem.aux![0].name = fuehrerKlasse
  return an
}

function daten(weeks: Week[], persons = PERSONEN, absences: Absence[] = []): KandidatenDaten {
  return {
    weeks,
    persons,
    groups: [],
    services: DIENSTE,
    fsWeeks: [],
    fsBase: new Date(2026, 8, 7, 12),
    absences,
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

describe('Gesprächspartner richtet sich nach dem Führer DESSELBEN Raums', () => {
  // Hauptsaal: Bruder führt → nur Brüder als Partner.
  // Zusätzliche Klasse: Schwester führt → nur Schwestern.
  const state = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')])

  it('Hauptsaal folgt dem Hauptsaal-Führer', () => {
    expect(namen(partnerSlot(false), state)).toEqual(['Anton Alt', 'Bernd Brand'])
  })

  it('Zusätzliche Klasse folgt IHREM Führer, nicht dem des Hauptsaals', () => {
    // Vorher stand hier dieselbe Liste wie oben — die Klasse richtete sich
    // nach dem falschen Raum.
    expect(namen(partnerSlot(true), state)).toEqual(['Clara Cohn', 'Dora Dietz'])
  })

  it('und andersherum genauso', () => {
    const gedreht = daten([wocheMitKlasse('Clara Cohn', 'Anton Alt')])
    expect(namen(partnerSlot(false), gedreht)).toEqual(['Clara Cohn', 'Dora Dietz'])
    expect(namen(partnerSlot(true), gedreht)).toEqual(['Anton Alt', 'Bernd Brand'])
  })
})

describe('Kandidatenliste allgemein', () => {
  const state = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')])

  it('filtert nach Qualifikation', () => {
    const ohne = person('x1', 'Egon', 'Ernst', false) // gar nichts qualifiziert
    const s = daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')], [...PERSONEN, ohne])
    expect(namen(partnerSlot(false), s)).not.toContain('Egon Ernst')
  })

  it('sortiert alphabetisch nach Nachname', () => {
    expect(namen({ ...partnerSlot(false), priv: null } as SlotSelection, state)).toEqual([
      'Anton Alt',
      'Bernd Brand',
      'Clara Cohn',
      'Dora Dietz',
    ])
  })

  it('schiebt Abwesende stabil ans Ende, ohne sie zu entfernen', () => {
    const weeks = [wocheMitKlasse('Anton Alt', 'Clara Cohn')]
    weeks[0].start = '2026-09-07'
    const abw: Absence[] = [
      { id: 'a1', personId: BRUDER_A.id, userId: 'u', from: '2026-09-07', to: '2026-09-09', reason: '' },
    ]
    const s = daten(weeks, PERSONEN, abw)
    const set = buildAbsences(abw, weeks, s.fsBase, 'Di 19:00 · So 10:00')
    const liste = kandidaten(s, { ...partnerSlot(false), priv: null } as SlotSelection, set, DE, (x) => x)
    expect(liste.map((c) => c.name).at(-1)).toBe('Anton Alt')
    expect(liste.find((c) => c.name === 'Anton Alt')?.absent).toBe(true)
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

describe('Gruppen-Slots liefern Gruppen statt Personen', () => {
  it('Reinigung o. Ä.', () => {
    const state: KandidatenDaten = {
      ...daten([wocheMitKlasse('Anton Alt', 'Clara Cohn')]),
      groups: [{ id: 'g1', name: 'Gruppe 1', ov: BRUDER_A.id, as: null }],
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
    expect(liste[0].initials).toBe('G1')
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
})
