import { describe, expect, it } from 'vitest'
import { entzogeneZusagen, offeneMeldungen, zuletztGesendet } from './plan-versand'
import { sentKey } from './planning'
import type { ConfirmationMap, FsInstance, Meeting, PartItem, SentLog, Service, Week } from './types'

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

/** Zusammenkunftszeiten der Testversammlung: Dienstag 8.9. und Sonntag 13.9. */
const MEETINGS = 'Di 19:00 · So 10:00'

/**
 * Montagmorgen der Testwoche — noch ist nichts davon vorbei. Ohne festen Tag
 * hinge jede Zahl hier davon ab, wann der Test läuft: Seit „Plan senden"
 * Vergangenes weglässt, wäre die Woche vom 7. September ab dem 9. halb leer.
 */
const MONTAG_FRUEH = new Date(2026, 8, 7, 8, 0)

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  // Gruppen-Rotation: gehört keiner Person, taucht nirgends auf.
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** Ein Programmpunkt mit einem Platz. */
function punkt(titel: string, name: string, rolle?: string, pid?: string): PartItem {
  return {
    iid: `i-${titel}`,
    title: titel,
    mins: 5,
    names: [{ name, rolle: rolle ?? '', ...(pid ? { pid } : {}) }],
  }
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

/**
 * `offeneMeldungen` mit neun Argumenten, von denen jeder Fall eines
 * abwandelt. Ausgeschrieben stand hier zehnmal dieselbe Zeile, und welches
 * Argument der Fall variiert, musste man aus dem Stellungsvergleich lesen —
 * derselbe Griff wie `ruf` im Abschnitt darunter.
 */
const offeneVon = (
  w: Week,
  {
    fs = [] as FsInstance[],
    conf = ohne,
    log = {} as SentLog,
    base = null as Date | null,
    heute = MONTAG_FRUEH,
  } = {},
) => offeneMeldungen(w, fs, 0, base, DIENSTE, conf, log, MEETINGS, heute)

/** Der Montag als Datumsbasis — für die Fälle mit Treffpunkten. */
const BASIS = new Date(`${MONTAG}T12:00:00`)

describe('Wer von seiner Zuteilung noch nichts weiß', () => {
  it('eine frisch geplante Woche: jeder Platz steht auf der Liste', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')], { mik: [{ name: 'B. Cohn' }] }))
    expect(offeneVon(w).map((o) => o.name).sort()).toEqual(['A. Berg', 'B. Cohn'])
  })

  it('nach dem Senden ist nichts mehr offen — das Tagebuch trägt Platz UND Name', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const log = { [sentKey(KEY_ERSTER, 'A. Berg')]: '2026-08-29T10:00:00Z' }
    expect(offeneVon(w, { log })).toEqual([])
  })

  it('nach dem Umteilen steht der neue Name wieder da — der alte Eintrag gilt nicht für ihn', () => {
    // Der eigentliche Grund, warum der Name im Tagebuch-Schlüssel steht: Ohne
    // ihn zählte der Platz als gemeldet, und die neue Person erführe nie davon.
    const w = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    const log = { [sentKey(KEY_ERSTER, 'A. Berg')]: '2026-08-29T10:00:00Z' }
    expect(offeneVon(w, { log }).map((o) => o.name)).toEqual(['C. Dorn'])
  })

  it('wer bestätigt hat, weiß Bescheid — auch ohne Eintrag im Tagebuch', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const conf: ConfirmationMap = { [KEY_ERSTER]: 'bestätigt' }
    expect(offeneVon(w, { conf })).toEqual([])
  })

  it('und wer abgesagt hat, ebenso', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const conf: ConfirmationMap = { [KEY_ERSTER]: 'verhindert' }
    expect(offeneVon(w, { conf })).toEqual([])
  })

  it('ein Gastredner bekommt nichts — er gehört nicht zur Versammlung', () => {
    const w = woche(zusammenkunft([punkt('Vortrag', 'E. Fremd', 'Gastredner')]))
    expect(offeneVon(w)).toEqual([])
  })

  it('ein Dienst mit Gruppen-Rotation auch nicht — er gehört keiner Person', () => {
    const w = woche(zusammenkunft([], { rein: [{ name: 'Gruppe 1' }] }))
    expect(offeneVon(w)).toEqual([])
  })

  it('eine ausgefallene Zusammenkunft meldet nichts (T30)', () => {
    const w = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const aus = { ...w, dev: { mid: { cancelled: true } } } as unknown as Week
    expect(offeneVon(aus)).toEqual([])
  })

  it('Treffpunkt-Leiter zählen mit — sie sind die zweite Datenquelle', () => {
    const w = woche(zusammenkunft([]))
    const offen = offeneVon(w, { fs: [treffpunkt()], base: BASIS })
    expect(offen.map((o) => o.name)).toEqual(['T. Lindner'])
  })

  it('ein auswärtiger Leiter (Freitext) nicht — er hat kein Konto', () => {
    const w = woche(zusammenkunft([]))
    const extern = [treffpunkt({ leader: 'Kreisaufseher', lext: true })]
    expect(offeneVon(w, { fs: extern, base: BASIS })).toEqual([])
  })
})

/**
 * **Was vorbei ist, geht nicht mehr hinaus** (T95).
 *
 * Am Donnerstag zählte der Knopf noch die Plätze vom Dienstag, und die Function
 * schickte ihnen eine Nachricht über eine Zusammenkunft, die gewesen ist. Die
 * Planungs-Karte des Start-Bildschirms ließ sie weg — dieselbe Woche stand dort
 * mit einer anderen Zahl als am Knopf. Jetzt lassen Knopf, Karte und Function
 * sie weg; die Gegenprobe gegen die Function steht in `edge-parity.test.ts`.
 */
describe('Was vorbei ist, geht nicht mehr hinaus', () => {
  /** Bibellesung am Dienstag, Mikrofon am Sonntag. */
  const beide = (): Week =>
    woche(
      zusammenkunft([punkt('Bibellesung', 'A. Berg')]),
      zusammenkunft([], { mik: [{ name: 'B. Cohn' }] }),
    )

  it('am Donnerstag nennt der Knopf nur noch das Wochenende — über den Dienstag käme die Nachricht zu spät', () => {
    const offen = offeneVon(beide(), { heute: new Date(2026, 8, 10, 9, 0) })
    expect(offen.map((o) => o.name)).toEqual(['B. Cohn'])
  })

  it('am Dienstagabend zählt der Dienstag noch — vorbei ist ein Termin erst am Tag danach', () => {
    // Wann eine Zusammenkunft zu Ende ist, weiß niemand; ab dem Folgetag ist
    // sie es unstrittig (dieselbe Körnung wie `istVorbei`).
    const offen = offeneVon(beide(), { heute: new Date(2026, 8, 8, 21, 0) })
    expect(offen.map((o) => o.name).sort()).toEqual(['A. Berg', 'B. Cohn'])
  })

  it('der Tag kommt aus den Zusammenkunftszeiten der Versammlung, nicht fest vom Dienstag', () => {
    // Donnerstags-Versammlung: Am Mittwoch steht ihre Wochenmitte noch bevor.
    // Mit einem Rückfall auf Dienstag wäre sie hier schon „vorbei".
    const offen = offeneMeldungen(beide(), [], 0, null, DIENSTE, ohne, {}, 'Do 19:00 · So 10:00', new Date(2026, 8, 9, 9, 0))
    expect(offen.map((o) => o.name).sort()).toEqual(['A. Berg', 'B. Cohn'])
  })

  it('ein Treffpunkt am Montag ist am Mittwoch vorbei, der am Samstag nicht', () => {
    const fs = [
      treffpunkt({ id: 'mo', wd: 1, leader: 'M. Montag' }),
      treffpunkt({ id: 'sa', wd: 6, leader: 'S. Samstag' }),
    ]
    const offen = offeneVon(woche(zusammenkunft([])), { fs, base: BASIS, heute: new Date(2026, 8, 9, 9, 0) })
    expect(offen.map((o) => o.name)).toEqual(['S. Samstag'])
  })

  it('eine Woche ohne Datum (Vorlage) liegt nirgends im Kalender — dort ist nichts vorbei', () => {
    const ohneDatum = { ...beide(), start: '' } as Week
    expect(offeneVon(ohneDatum, { heute: new Date(2030, 0, 1) })).toHaveLength(2)
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
    entzogeneZusagen(v, n, [], [], 0, null, DIENSTE, '', conf, MONTAG_FRUEH)

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
      0, new Date(`${MONTAG}T12:00:00`), DIENSTE, '', conf, MONTAG_FRUEH,
    )
    expect(raus.map((z) => z.name)).toEqual(['T. Lindner'])
  })

  it('ein unbestätigter Treffpunkt-Leiter nicht — solange niemand zugesagt hat, ist es ein Entwurf', () => {
    /*
     * Gegenstück zum Fall darüber, und die zweite Hälfte derselben Regel: Die
     * Zusage-Prüfung greift für Zusammenkünfte **und** Treffpunkte. Sie steht
     * seit T101 an zwei Stellen — einmal im Besucher von `eachAssignedSlot`,
     * einmal in der Treffpunkt-Schleife —, weil nur Bestätigtes überhaupt
     * aufgenommen wird. Ohne diesen Fall wäre die zweite Stelle ungedeckt: Der
     * Planer dürfte den Leiter nicht mehr wechseln, ohne dem ersten eine
     * Rücknahme zu schicken, die er nie zugesagt hat.
     */
    const raus = entzogeneZusagen(
      vorher, vorher,
      [treffpunkt()],
      [treffpunkt({ leader: 'M. Albrecht' })],
      0, new Date(`${MONTAG}T12:00:00`), DIENSTE, '', ohne, MONTAG_FRUEH,
    )
    expect(raus).toEqual([])
  })

  it('ohne vorigen Stand gibt es nichts zu vergleichen', () => {
    expect(ruf(undefined, vorher)).toEqual([])
  })

  /*
   * **Wer dieselbe Person ist, entscheidet die Id.** Am Anzeigenamen allein
   * ging es in beide Richtungen schief, und beide Richtungen stehen hier: Der
   * eine Fall meldete zu viel, der andere zu wenig.
   */
  it('zwei Gleichnamige: das Umteilen zwischen ihnen wird bemerkt', () => {
    // Am Namen verglichen sah das aus wie „unverändert" — und der, der
    // zugesagt und vorbereitet hatte, erfuhr nie etwas.
    const v = woche(zusammenkunft([punkt('Bibellesung', 'M. Weber', undefined, 'pA')]))
    const n = woche(zusammenkunft([punkt('Bibellesung', 'M. Weber', undefined, 'pB')]))
    const raus = ruf(v, n)
    expect(raus).toHaveLength(1)
    // Die Id geht mit hinaus: Sonst stellte die Function nach dem Namen zu und
    // träfe womöglich den anderen der beiden.
    expect(raus[0]!.pid).toBe('pA')
  })

  it('nur die Schreibweise des Namens berichtigt: nichts', () => {
    // Dieselbe Person-Id, anderer Text. Personenfelder lösen je Tastenanschlag
    // aus — hier hing die lauteste Fehlmeldung der ganzen App.
    const v = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg', undefined, 'pA')]))
    const n = woche(zusammenkunft([punkt('Bibellesung', 'A. Bergh', undefined, 'pA')]))
    expect(ruf(v, n)).toEqual([])
  })

  it('eine nachgetragene Id ist kein Wechsel', () => {
    // Altdaten bekommen ihre `pid` beim Laden angehängt. Ein halbseitiger
    // Vergleich (eine Seite mit Id, die andere ohne) fiele auf „ungleich".
    const v = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg')]))
    const n = woche(zusammenkunft([punkt('Bibellesung', 'A. Berg', undefined, 'pA')]))
    expect(ruf(v, n)).toEqual([])
  })

  it('der Termin eines Treffpunkts nennt den Tag, nicht nur die Uhrzeit', () => {
    /*
     * „10:00 · Bahnhof" sagt niemandem, welche Woche gemeint ist — und wer
     * einen wöchentlichen Treffpunkt leitet, hat genau diese Frage. Gebaut wie
     * in `deriveMyFsTasks`, damit beide Nachrichten über denselben Platz
     * dasselbe sagen.
     */
    const key = `fs|${MONTAG}|r1`
    const raus = entzogeneZusagen(
      vorher, vorher,
      [treffpunkt()],
      [treffpunkt({ leader: '' })],
      0, new Date(`${MONTAG}T12:00:00`), DIENSTE, '', { [key]: 'bestätigt' }, MONTAG_FRUEH,
    )
    expect(raus).toHaveLength(1)
    expect(raus[0]!.datum).toMatch(/September/)
  })

  it('fällt die Zusammenkunft aus, ist das kein Entzug', () => {
    // Kongress-Woche: Dort fallen ALLE Zusammenkünfte aus, planmäßig. Die
    // Zuteilungen ruhen dann, sie sind nicht verwaist.
    const aus = { ...vorher, dev: { mid: { cancelled: true } } } as unknown as Week
    expect(ruf(vorher, aus)).toEqual([])
  })

  it('wird ein einzelner Punkt gelöscht, bleibt es ein Entzug', () => {
    // Die Gegenprobe zum Ausfall: Den Teil gibt es nicht mehr, und wer ihn
    // vorbereitet hat, muss das erfahren.
    const leer = woche(zusammenkunft([]))
    expect(ruf(vorher, leer).map((z) => z.name)).toEqual(['A. Berg'])
  })

  it('eine fehlende Bestätigungs-Liste stürzt nicht ab', () => {
    // Diese Funktion läuft in der Nebeneffekt-Schicht (`persist.ts`). Ein
    // Fehler dort risse das **Speichern** mit — lieber keine Nachricht als
    // eine verlorene Woche.
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    expect(() =>
      entzogeneZusagen(vorher, nachher, [], [], 0, null, DIENSTE, '', undefined as unknown as ConfirmationMap, MONTAG_FRUEH),
    ).not.toThrow()
  })

  /*
   * **Vergangenes meldet nichts** — dieselbe Regel wie beim „Plan senden".
   * Wer am Donnerstag nachträgt, wer am Dienstag wirklich gelesen hat, nimmt
   * niemandem etwas: Vorzubereiten gibt es nichts mehr, und „Zuteilung
   * zurückgezogen" über einen Abend, der gewesen ist, erschreckt nur.
   */
  it('ein vergangener Platz: keine Nachricht, wenn er nachträglich umgeteilt wird', () => {
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    const donnerstag = new Date(2026, 8, 10, 9, 0)
    expect(entzogeneZusagen(vorher, nachher, [], [], 0, null, DIENSTE, '', bestaetigt, donnerstag)).toEqual([])
  })

  it('Gegenprobe: am Tag selbst geht die Nachricht noch hinaus', () => {
    const nachher = woche(zusammenkunft([punkt('Bibellesung', 'C. Dorn')]))
    const dienstagMittag = new Date(2026, 8, 8, 12, 0)
    const raus = entzogeneZusagen(vorher, nachher, [], [], 0, null, DIENSTE, '', bestaetigt, dienstagMittag)
    expect(raus.map((z) => z.name)).toEqual(['A. Berg'])
  })

  it('ein Treffpunkt ist an seinem eigenen Tag vorbei — nicht erst mit der Woche', () => {
    const conf: ConfirmationMap = { [`fs|${MONTAG}|mo`]: 'bestätigt', [`fs|${MONTAG}|sa`]: 'bestätigt' }
    const vorherFs = [treffpunkt({ id: 'mo', wd: 1 }), treffpunkt({ id: 'sa', wd: 6 })]
    const nachherFs = [treffpunkt({ id: 'mo', wd: 1, leader: '' }), treffpunkt({ id: 'sa', wd: 6, leader: '' })]
    const mittwoch = new Date(2026, 8, 9, 9, 0)
    const raus = entzogeneZusagen(vorher, vorher, vorherFs, nachherFs, 0, BASIS, DIENSTE, '', conf, mittwoch)
    // Der Montag ist gewesen; der Samstag steht noch bevor.
    expect(raus.map((z) => z.key)).toEqual([`fs|${MONTAG}|sa`])
  })
})
