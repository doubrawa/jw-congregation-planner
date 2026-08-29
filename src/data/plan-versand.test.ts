import { describe, expect, it } from 'vitest'
import { entzogeneZusagen, offeneMeldungen, zuletztGesendet } from './plan-versand'
import { sentKey } from './planning'
import type { ConfirmationMap, FsInstance, Meeting, PartItem, Service, Week } from './types'

/**
 * **„Plan senden" — wer weiß noch nichts?**
 *
 * Der Knopf im Planen-Screen beschriftet sich aus diesen Funktionen, verschickt
 * wird serverseitig (`send-plan`). Der teure Fehler wäre hier keine Ausnahme,
 * sondern eine **Zahl, die nicht auf null geht**: Der Planer drückt, bekommt
 * „0 gesendet", und darüber steht weiter „3 noch nicht mitgeteilt". Genau
 * dagegen prüfen die Fälle unten — jeder Ausschluss einzeln, damit auffällt,
 * wenn eine Seite ihn kennt und die andere nicht.
 *
 * Der zweite Teil betrifft den Fall, der nicht auf den Knopf warten darf: Wer
 * **zugesagt** hat und den Platz wieder verliert, bereitet sonst weiter etwas
 * vor, das ihm nicht mehr gehört.
 */

const MONTAG = '2026-09-07'

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  // Gruppen-Rotation: gehört keiner Person, taucht nirgends auf.
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** Ein Programmpunkt mit einem Platz. */
function punkt(titel: string, name: string, rolle?: string): PartItem {
  return { iid: `i-${titel}`, title: titel, mins: 5, names: [{ name, rolle: rolle ?? '' }] }
}

function zusammenkunft(items: PartItem[], helpers: Record<string, { name: string }[]> = {}): Meeting {
  return {
    date: '',
    end: '',
    sections: [{ label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schatz', items }],
    helpers,
  } as unknown as Meeting
}

function woche(mid: Meeting, we?: Meeting): Week {
  return {
    range: '7.–13. September',
    book: '',
    start: MONTAG,
    current: true,
    mid,
    we: we ?? zusammenkunft([]),
  } as unknown as Week
}

/** Schlüssel des ersten Platzes im ersten Punkt (stabile Kennung, T37). */
const KEY_ERSTER = `${MONTAG}|mid|part|i-Bibellesung|0`

const treffpunkt = (over: Partial<FsInstance> = {}): FsInstance => ({
  id: 'r1',
  ruleId: 'r1',
  grp: '',
  wd: 6,
  time: '09:30',
  place: 'Königreichssaal',
  leader: 'T. Lindner',
  ...over,
})

const ohne: ConfirmationMap = {}

describe('Wer von seiner Zuteilung noch nichts weiß', () => {
  it('eine frisch geplante Woche: jeder Platz steht auf der Liste', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')], { mik: [{ name: 'B. Cohn' }] }))
    const offen = offeneMeldungen(w, [], 0, null, DIENSTE, ohne, {})
    expect(offen.map((o) => o.name).sort()).toEqual(['A. Berg', 'B. Cohn'])
  })

  it('nach dem Senden ist nichts mehr offen — das Tagebuch trägt Platz UND Name', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const log = { [sentKey(KEY_ERSTER, 'A. Berg')]: '2026-08-29T10:00:00Z' }
    expect(offeneMeldungen(w, [], 0, null, DIENSTE, ohne, log)).toEqual([])
  })

  it('nach dem Umteilen steht der neue Name wieder da — der alte Eintrag gilt nicht für ihn', () => {
    // Der eigentliche Grund, warum der Name im Tagebuch-Schlüssel steht: Ohne
    // ihn zählte der Platz als gemeldet, und die neue Person erführe nie davon.
    const w = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    const log = { [sentKey(KEY_ERSTER, 'A. Berg')]: '2026-08-29T10:00:00Z' }
    expect(offeneMeldungen(w, [], 0, null, DIENSTE, ohne, log).map((o) => o.name)).toEqual(['C. Dorn'])
  })

  it('wer bestätigt hat, weiß Bescheid — auch ohne Eintrag im Tagebuch', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const conf: ConfirmationMap = { [KEY_ERSTER]: 'bestätigt' }
    expect(offeneMeldungen(w, [], 0, null, DIENSTE, conf, {})).toEqual([])
  })

  it('und wer abgesagt hat, ebenso', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const conf: ConfirmationMap = { [KEY_ERSTER]: 'verhindert' }
    expect(offeneMeldungen(w, [], 0, null, DIENSTE, conf, {})).toEqual([])
  })

  it('ein Gastredner bekommt nichts — er gehört nicht zur Versammlung', () => {
    const w = woche(zusammenkunft([punkt('Vortrag', 'E. Fremd', 'Gastredner')]))
    expect(offeneMeldungen(w, [], 0, null, DIENSTE, ohne, {})).toEqual([])
  })

  it('ein Dienst mit Gruppen-Rotation auch nicht — er gehört keiner Person', () => {
    const w = woche(zusammenkunft([], { rein: [{ name: 'Gruppe 1' }] }))
    expect(offeneMeldungen(w, [], 0, null, DIENSTE, ohne, {})).toEqual([])
  })

  it('eine ausgefallene Zusammenkunft meldet nichts (T30)', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const aus = { ...w, dev: { mid: { cancelled: true } } } as unknown as Week
    expect(offeneMeldungen(aus, [], 0, null, DIENSTE, ohne, {})).toEqual([])
  })

  it('Treffpunkt-Leiter zählen mit — sie sind die zweite Datenquelle', () => {
    const w = woche(zusammenkunft([]))
    const offen = offeneMeldungen(w, [treffpunkt()], 0, new Date(`${MONTAG}T12:00:00`), DIENSTE, ohne, {})
    expect(offen.map((o) => o.name)).toEqual(['T. Lindner'])
  })

  it('ein auswärtiger Leiter (Freitext) nicht — er hat kein Konto', () => {
    const w = woche(zusammenkunft([]))
    const extern = [treffpunkt({ leader: 'Kreisaufseher', lext: true })]
    expect(offeneMeldungen(w, extern, 0, new Date(`${MONTAG}T12:00:00`), DIENSTE, ohne, {})).toEqual([])
  })
})

describe('Wann ging für diese Woche zuletzt etwas hinaus', () => {
  const log = {
    [sentKey(`${MONTAG}|mid|part|i-a|0`, 'A')]: '2026-08-28T08:00:00Z',
    [sentKey(`${MONTAG}|we|helper|mik|0`, 'B')]: '2026-08-29T09:00:00Z',
    [sentKey(`fs|${MONTAG}|r1`, 'C')]: '2026-08-27T07:00:00Z',
    // andere Woche — zählt nicht
    [sentKey('2026-09-14|mid|part|i-x|0', 'D')]: '2026-09-01T10:00:00Z',
  }

  it('nennt den jüngsten Eintrag dieser Woche', () => {
    expect(zuletztGesendet(log, MONTAG)).toBe('2026-08-29T09:00:00Z')
  })

  it('Treffpunkte zählen mit — ihr Schlüssel führt die Woche an zweiter Stelle', () => {
    const nurFs = { [sentKey(`fs|${MONTAG}|r1`, 'C')]: '2026-08-27T07:00:00Z' }
    expect(zuletztGesendet(nurFs, MONTAG)).toBe('2026-08-27T07:00:00Z')
  })

  it('eine Woche ohne Eintrag hat nichts vorzuweisen', () => {
    expect(zuletztGesendet(log, '2026-09-21')).toBeNull()
  })
})

/**
 * **Der Fall, der nicht auf den Knopf warten darf.**
 *
 * Wer zugesagt hat, bereitet vor. Nimmt der Planer ihm den Platz, verwirft die
 * App seine Bestätigung still (`dropConfirmations`) — bis T99 ging dabei keine
 * Nachricht hinaus, und er übte weiter für etwas, das ihm nicht mehr gehörte.
 */
describe('Wem eine bestätigte Zusage genommen wurde', () => {
  const bestaetigt: ConfirmationMap = { [KEY_ERSTER]: 'bestätigt' }
  const vorher = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
  const ruf = (v: Week | undefined, n: Week | undefined, conf = bestaetigt) =>
    entzogeneZusagen(v, n, [], [], 0, null, DIENSTE, '', conf)

  it('umgeteilt: der bisherige Inhaber wird genannt, mit Platz und Termin', () => {
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    const raus = ruf(vorher, nachher)
    expect(raus).toHaveLength(1)
    expect(raus[0]!.name).toBe('A. Berg')
    expect(raus[0]!.key).toBe(KEY_ERSTER)
    expect(raus[0]!.label).toContain('Bibellesung')
  })

  it('geleert: ebenso — der Platz ist weg, die Zusage auch', () => {
    const nachher = woche(zusammenkunft([punkt('Bibellesung', '')]))
    expect(ruf(vorher, nachher).map((z) => z.name)).toEqual(['A. Berg'])
  })

  it('unbestätigt: nichts — bis zur Zusage ist der Plan ein Entwurf', () => {
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    expect(ruf(vorher, nachher, {})).toEqual([])
  })

  it('dieselbe Person, andere Rolle: nichts — sie hat nichts verloren', () => {
    // Verglichen werden Namen je Aufgaben-Schlüssel, nicht Slot-Inhalte. Ohne
    // das bekäme jemand „zurückgezogen", weil der Planer seine Rolle ergänzt.
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg', 'Leser')]))
    expect(ruf(vorher, nachher)).toEqual([])
  })

  it('gar nichts geändert: nichts', () => {
    expect(ruf(vorher, vorher)).toEqual([])
  })

  it('auch ein Treffpunkt-Leiter, dem die Leitung genommen wird', () => {
    const key = `fs|${MONTAG}|r1`
    const conf: ConfirmationMap = { [key]: 'bestätigt' }
    const raus = entzogeneZusagen(
      vorher, vorher,
      [treffpunkt()],
      [treffpunkt({ leader: 'M. Albrecht' })],
      0, new Date(`${MONTAG}T12:00:00`), DIENSTE, '', conf,
    )
    expect(raus.map((z) => z.name)).toEqual(['T. Lindner'])
  })

  it('ohne vorigen Stand gibt es nichts zu vergleichen', () => {
    expect(ruf(undefined, vorher)).toEqual([])
  })

  it('eine fehlende Bestätigungs-Liste stürzt nicht ab', () => {
    // Diese Funktion läuft in der Nebeneffekt-Schicht (`persist.ts`). Ein
    // Fehler dort risse das **Speichern** mit — lieber keine Nachricht als
    // eine verlorene Woche.
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    expect(() =>
      entzogeneZusagen(vorher, nachher, [], [], 0, null, DIENSTE, '', undefined as unknown as ConfirmationMap),
    ).not.toThrow()
  })
})
