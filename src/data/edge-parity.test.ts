import { describe, expect, it } from 'vitest'
import {
  deutschesDatum as edgeDeutschesDatum,
  istAusgefallenFuer as edgeAusgefallen,
  meetingDayOffsets as edgeOffsets,
  meetingTimesOf as edgeTimes,
  personDisplayName as edgeName,
  rolleMitHerkunft as edgeHerkunft,
  SKIP_ROLE as EDGE_SKIP,
  taskDateText as edgeDate,
  versatzMitAbweichung as edgeVersatz,
  WEEKDAY_OFFSET as EDGE_WEEKDAY,
  zeitMitAbweichung as edgeZeit,
  zuteilungsLabel as edgeLabel,
} from '../../supabase/functions/_shared/planung.ts'
import {
  pendingOfFsWeek as edgeFsPending,
  tagebuchSchluessel as edgeTagebuch,
} from '../../supabase/functions/_shared/zuteilungen.ts'
import { STANDARD_ERINNERUNGEN } from './vorgaben'
import { displayName, istAusgefallen, rolleMitHerkunft, zuteilungsLabel } from './helpers'
import { deutschesDatum, meetingDayOffsets, meetingOffset, meetingTime, meetingTimesOf } from './meeting-dates'
import { isGuestRole, sentKey } from './planning'
import { offeneMeldungen } from './plan-versand'
import { emptyQualifications } from './helpers'
import type { Abweichung, FsInstance, Person, Week } from './types'

/**
 * Client und Edge Functions rechnen gleich — geprüft, nicht angenommen.
 *
 * Dieselben Regeln lagen in bis zu drei Fassungen nebeneinander:
 * `meetingDayOffsets` dreimal, `displayName` und `taskDate` je zweimal,
 * `SKIP_ROLE` zweimal. Daraus entstand **B8**: `send-reminders` rechnete mit
 * dem Array-Index, `substitute` mit `position` — jede Seite für sich stimmig,
 * zusammen falsch. Genau solche Fehler sieht niemand beim Lesen einer Datei.
 *
 * Die geteilte Fassung liegt in `supabase/functions/_shared/planung.ts`. Dieser
 * Test bindet **beide** Seiten ein und vergleicht sie an denselben Eingaben.
 * Läuft eine davon weg, fällt es hier auf statt im Betrieb.
 */

const person = (fn: string, ln: string, dn?: string): Person => ({
  id: 'p', fn, ln, dn, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

describe('Anzeigename', () => {
  const faelle: Array<[string, string, string | undefined]> = [
    ['Anna', 'Beispiel', undefined],
    ['Anna', 'Beispiel', 'A. Beispiel'],
    ['', 'Beispiel', undefined], // nur Nachname → kein führendes Leerzeichen
    ['Anna', '', undefined],
    ['', '', undefined], // gar nichts → leer, nicht " "
    ['Jörg', 'Grünwald', ''], // leerer dn zählt nicht als gesetzt
  ]

  it.each(faelle)('„%s %s" (dn: %s) gleich auf beiden Seiten', (fn, ln, dn) => {
    expect(edgeName(fn, ln, dn)).toBe(displayName(person(fn, ln, dn)))
  })
})

describe('Beschriftung einer Zuteilung', () => {
  const faelle: Array<[string, string, string | undefined]> = [
    ['ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Vorsitz'],
    ['ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Gebet'],
    ['ABSCHLUSS', 'Schlussworte · Lied 24 · Gebet', 'Gebet'],
    ['UNSER LEBEN ALS CHRIST', 'Versammlungsbibelstudium', 'Leiter'],
    ['UNS IM DIENST VERBESSERN', 'Gespräche beginnen', 'Gesprächspartner'],
    ['UNS IM DIENST VERBESSERN', 'Gespräche beginnen', 'mit A. Hoffmann'], // Begleiter
    ['SCHÄTZE AUS GOTTES WORT', 'Bibellesung · Jer 44:24-30', ''],
    ['SCHÄTZE AUS GOTTES WORT', 'Bibellesung · Jer 44:24-30', undefined],
    ['', 'Zuteilung', 'Leser'], // Abschnitt ohne Überschrift
  ]

  it.each(faelle)('„%s" / „%s" / Rolle „%s" gleich auf beiden Seiten', (label, titel, rolle) => {
    expect(edgeLabel(label, titel, rolle)).toBe(zuteilungsLabel(label, titel, rolle))
  })

  it('nennt in ERÖFFNUNG weder Lied noch Einleitende Worte', () => {
    const text = zuteilungsLabel('ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Vorsitz')
    expect(text).toBe('Vorsitz')
    expect(text).not.toContain('Lied')
    expect(text).not.toContain('Einleitende Worte')
  })

  /**
   * **Die fremdsprachige Woche — die Eingabe, die beide Seiten am ehesten
   * auseinanderlaufen lässt.**
   *
   * `zuteilungsLabel` entscheidet am **Namen** des Abschnitts, ob der Titel den
   * ganzen Block benennt. Das geht nur auf, weil der Import ERÖFFNUNG und
   * ABSCHLUSS kanonisch deutsch lässt und die drei farbigen Überschriften
   * wörtlich aus der Zielsprache übernimmt. Beide Fassungen der Funktion
   * müssen dieselbe Annahme tragen — die Client-Seite kennt seit 266acbb
   * zusätzlich `Section.kind`, die Edge-Seite nicht (sie hat nur den Namen).
   *
   * Läuft eine davon auf die Art um, ohne die andere, sagt die Erinnerung
   * plötzlich etwas anderes als der Bildschirm.
   */
  const FREMD: Array<[string, string, string | undefined]> = [
    ['NUESTRA VIDA CRISTIANA', 'Estudio bíblico de la congregación', 'Leiter'],
    ['神の言葉の宝', '聖書朗読', ''],
    ['كنوز من كلمة الله', 'قراءة الكتاب المقدس', undefined],
    ['ΘΗΣΑΥΡΟΙ ΑΠΟ ΤΟΝ ΛΟΓΟ ΤΟΥ ΘΕΟΥ', 'Ανάγνωση της Αγίας Γραφής', 'Leser'],
    // Die beiden Rahmen-Überschriften bleiben auch dort kanonisch deutsch.
    ['ERÖFFNUNG', 'Canción 1 · Oración · Palabras de introducción', 'Vorsitz'],
    ['ABSCHLUSS', '結びの言葉 · 歌 24 · 祈り', 'Gebet'],
  ]

  it.each(FREMD)('fremdsprachig „%s" / „%s" gleich auf beiden Seiten', (label, titel, rolle) => {
    expect(edgeLabel(label, titel, rolle)).toBe(zuteilungsLabel(label, titel, rolle))
  })

  it('und im fremdsprachigen Block-Abschnitt trägt weiterhin die Rolle allein', () => {
    // Der eigentliche Ertrag: Wer die Eröffnung hat, liest seine Rolle — nicht
    // „Canción 1 · Oración · Palabras de introducción · Vorsitz".
    expect(zuteilungsLabel('ERÖFFNUNG', 'Canción 1 · Oración · Palabras de introducción', 'Vorsitz'))
      .toBe('Vorsitz')
    // In einem farbigen Abschnitt dagegen steht der (fremdsprachige) Titel
    // vorn und die Rolle dahinter.
    expect(zuteilungsLabel('NUESTRA VIDA CRISTIANA', 'Estudio bíblico de la congregación', 'Leiter'))
      .toBe('Estudio bíblico de la congregación · Leiter')
  })
})

describe('Rolle mit Herkunft', () => {
  /*
    Die Heimatversammlung eines auswärtigen Redners stand als zweites Atom in
    `rolle` — mitten in dem Feld, über das `isGuestRole` und die
    Auto-Zuteilung entscheiden. Sie hat jetzt ihr eigenes Feld.

    Beide Formen müssen denselben Text ergeben, und zwar auf beiden Seiten:
    die Erinnerung nennt ihn, und sie entsteht in der Edge Function.
  */
  const faelle: Array<[string, { rolle?: string; herkunft?: string }]> = [
    ['eigenes Feld', { rolle: 'Gastredner', herkunft: 'Vers. Nordheim' }],
    ['Altdaten im Rollentext', { rolle: 'Gastredner · Vers. Nordheim' }],
    ['ohne Herkunft', { rolle: 'Gastredner' }],
    ['leere Herkunft', { rolle: 'Gastredner', herkunft: '' }],
    ['gewöhnliche Rolle', { rolle: 'Vorsitz' }],
    ['Begleiter-Beschriftung', { rolle: 'mit A. Hoffmann' }],
    ['gar keine Rolle', {}],
    ['Versammlungsname mit Trenner', { rolle: 'Gastredner', herkunft: 'Nord · Süd' }],
  ]

  it.each(faelle)('%s ergibt beidseitig denselben Text', (_name, slot) => {
    expect(edgeHerkunft(slot)).toBe(rolleMitHerkunft(slot))
  })

  it('beide Formen sind derselbe Text', () => {
    const neu = rolleMitHerkunft({ rolle: 'Gastredner', herkunft: 'Vers. Nordheim' })
    const alt = rolleMitHerkunft({ rolle: 'Gastredner · Vers. Nordheim' })
    expect(neu).toBe('Gastredner · Vers. Nordheim')
    expect(alt).toBe(neu)
  })

  it('ohne Herkunft steht kein Trenner ins Leere', () => {
    expect(rolleMitHerkunft({ rolle: 'Gastredner', herkunft: '' })).toBe('Gastredner')
  })
})

describe('Uhrzeiten der Zusammenkünfte', () => {
  // Dieselbe Zeichenkette, die andere Hälfte: die Tag-Hälfte war längst
  // geteilt und geprüft, die Uhrzeit-Hälfte lag nur in `send-reminders`.
  const faelle = [
    'Di 19:00 · So 10:00',
    'Mi 19.30 · Sa 17.00', // Punkt statt Doppelpunkt
    'Di 9:00 · So 10:00', // einstellige Stunde → beidseitig führende Null
    '', // ohne Angabe → beidseitig leer, keine erfundene Zeit
    'Di · So', // Kürzel ohne Zeiten
    'Fr 19:00', // nur eine Angabe
  ]

  it.each(faelle)('„%s" ergibt beidseitig dieselben Uhrzeiten', (zeiten) => {
    expect(edgeTimes(zeiten)).toEqual(meetingTimesOf(zeiten))
  })
})

describe('Deutsches Datum', () => {
  // Der Client liest die Felder in Ortszeit, die Edge Function auf einem
  // UTC-Zeitstempel — dieselben Tabellen, dieselbe Zusammensetzung. Geprüft
  // wird an Mitternacht UTC, wo beide Ablesungen denselben Tag ergeben.
  const faelle = ['2026-09-08', '2026-01-01', '2026-12-31', '2026-02-28', '2026-03-01']

  it.each(faelle)('%s schreibt sich beidseitig gleich', (iso) => {
    const utcMitternacht = new Date(`${iso}T00:00:00Z`)
    const ortszeit = new Date(`${iso}T12:00:00`)
    expect(edgeDeutschesDatum(utcMitternacht, true)).toBe(deutschesDatum(ortszeit))
  })

  it('nennt Wochentag, Tag und Monat — nicht die Wochenspanne', () => {
    expect(deutschesDatum(new Date('2026-09-08T12:00:00'))).toBe('Dienstag, 8. September')
  })
})

describe('Wochentage der Zusammenkünfte', () => {
  const faelle = [
    'Di 19:00 · So 10:00',
    'Mi 19:30 · Sa 17:00',
    'Mo 18:00 · So 09:00',
    '', // ohne Angabe → Di/So
    '19:00 · 10:00', // Zeiten ohne Kürzel → Di/So
    'Donnerstag 19:00 · Sonntag 10:00', // ausgeschrieben, kein Kürzel-Treffer
    'Fr 19:00', // nur eine Angabe → zweite fällt zurück
  ]

  it.each(faelle)('„%s" ergibt beidseitig dieselben Versätze', (zeiten) => {
    expect(edgeOffsets(zeiten)).toEqual(meetingDayOffsets(zeiten))
  })
})

describe('Externe Rollen', () => {
  const rollen = [
    'Gastredner',
    'Gastredner · Vers. Nordheim',
    'Kreisaufseher',
    'Redner', // eigener Redner (T29) — ausdrücklich NICHT extern
    'Vorsitz',
    'Gebet',
    'Leser',
    '',
    'Gesprächspartner',
  ]

  it.each(rollen)('„%s" wird beidseitig gleich eingeordnet', (rolle) => {
    expect(EDGE_SKIP.test(rolle)).toBe(isGuestRole(rolle))
  })

  it('der eigene Redner bekommt auch in den Edge Functions eine Erinnerung', () => {
    // Er wird dort nicht gesondert behandelt — er fällt schlicht nicht unter
    // SKIP_ROLE. Genau darauf beruht T29: eine Rolle, kein Sonderweg. Wäre
    // „Redner" versehentlich in den Ausdruck geraten, bliebe der eigene Redner
    // stumm, obwohl die App ihm eine Bestätigung abverlangt.
    expect(EDGE_SKIP.test('Redner')).toBe(false)
  })
})

describe('Termin aus dem date-Feld', () => {
  it('schneidet den Ort ab, lässt Tag und Uhrzeit stehen', () => {
    expect(edgeDate('Dienstag, 8. September · 19:00 · Königreichssaal')).toBe(
      'Dienstag, 8. September · 19:00',
    )
    expect(edgeDate('Dienstag, 8. September · 19:00')).toBe('Dienstag, 8. September · 19:00')
    // Importierte Wochen tragen hier nur die Wochenspanne — die bleibt stehen.
    expect(edgeDate('7.–13. September')).toBe('7.–13. September')
    expect(edgeDate(undefined)).toBe('')
  })
})

describe('Sonderwochen: Verlegung und Ausfall (T30)', () => {
  /*
    Eine verlegte Woche verschiebt **auch die Erinnerungen**. `send-reminders`
    rechnete mit dem regulären Wochentag aus den Einstellungen — die Erinnerung
    nannte dann einen Abend, an dem niemand kommt. Und ein Ausfall darf gar
    nicht erst erinnern.

    Beide Seiten müssen dieselbe Rangfolge anwenden:
    Abweichung → eigener Termin im `date`-Feld → Einstellungen.
  */
  const faelle: Array<[string, Abweichung | undefined, string, number, string]> = [
    ['ohne Abweichung, Wochenspanne', undefined, '7.–13. September', 1, '19:00'],
    ['ohne Abweichung, eigener Termin', undefined, 'Samstag, 3. Oktober · 19:30', 5, '19:30'],
    ['nur Tag verlegt', { day: 'Donnerstag' }, '7.–13. September', 3, '19:00'],
    ['nur Uhrzeit verlegt', { time: '18:30' }, '7.–13. September', 1, '18:30'],
    ['Tag und Uhrzeit verlegt', { day: 'Freitag', time: '17:00' }, '7.–13. September', 4, '17:00'],
    // Der wichtigste Fall: das `date`-Feld nennt noch den alten Termin.
    ['Abweichung schlägt den eigenen Termin', { day: 'Montag', time: '20:00' }, 'Samstag, 3. Oktober · 19:30', 0, '20:00'],
    ['Ausfall ohne Verlegung ändert den Tag nicht', { cancelled: true }, '7.–13. September', 1, '19:00'],
    ['unbekannter Wochentag fällt zurück', { day: 'Nichttag' }, '7.–13. September', 1, '19:00'],
  ]

  const woche = (dev: Abweichung | undefined, date: string): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    mid: { date, end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
    dev: dev ? { mid: dev } : undefined,
  })

  it.each(faelle)('%s', (_name, dev, date, tag, zeit) => {
    const w = woche(dev, date)
    const zeiten = 'Di 19:00 · So 10:00'
    // Client
    expect(meetingOffset(w, 'mid', zeiten)).toBe(tag)
    expect(meetingTime(w, 'mid', zeiten)).toBe(zeit)
    // Edge — dieselben Eingaben, eigene Fassung
    expect(edgeVersatz(w.dev, 'mid', date, 1)).toBe(tag)
    expect(edgeZeit(w.dev, 'mid', date, '19:00')).toBe(zeit)
  })

  it('„entfällt" heißt auf beiden Seiten dasselbe', () => {
    const aus = woche({ cancelled: true }, '7.–13. September')
    expect(istAusgefallen(aus, 'mid')).toBe(true)
    expect(edgeAusgefallen(aus.dev, 'mid')).toBe(true)
    // Die andere Zusammenkunft ist davon unberührt.
    expect(istAusgefallen(aus, 'we')).toBe(false)
    expect(edgeAusgefallen(aus.dev, 'we')).toBe(false)
  })

  it('die Gedächtnismahl-Woche ist KEIN Ausfall — beidseitig', () => {
    // `memCancel` sieht aus wie ein Ausfall, ist aber eine Ersetzung: der Tab
    // zeigt dann das Mahl, und das hat eigene Zuteilungen. Als Ausfall gelesen,
    // fielen genau diese aus Auslastung, Aufgaben und Erinnerungen heraus.
    const mahl: Week = { ...woche(undefined, '7.–13. September'), mem: true, memCancel: 'we' }
    expect(istAusgefallen(mahl, 'we')).toBe(false)
    expect(edgeAusgefallen(mahl.dev, 'we')).toBe(false)
  })
})

describe('Ausgeschriebene Wochentage', () => {
  it('deckt beide Schreibweisen des Samstags ab', () => {
    // Ältere Datensätze tragen „Sonnabend"; fehlte er, fiele der Termin auf
    // den Rhythmus aus den Einstellungen zurück — stumm und um Tage daneben.
    expect(EDGE_WEEKDAY.Samstag).toBe(5)
    expect(EDGE_WEEKDAY.Sonnabend).toBe(5)
  })

  it('Montag ist 0 und Sonntag 6 — die Woche beginnt am Montag', () => {
    expect(EDGE_WEEKDAY.Montag).toBe(0)
    expect(EDGE_WEEKDAY.Sonntag).toBe(6)
  })
})

/**
 * **Das Versand-Tagebuch (T99).**
 *
 * Der Planen-Screen zeigt „12 noch nicht gesendet", die Function entscheidet,
 * was wirklich hinausgeht — beide bilden dafür denselben Schlüssel aus Platz
 * und Name. Weichen sie ab, geht der Zähler nach dem Drücken nicht auf null:
 * Der Planer sieht „0 gesendet" und darüber unverändert „12".
 *
 * Diese Probe steht hier, weil genau das schon passiert ist: In der Function
 * war der Trenner zwischenzeitlich kein Leerzeichen, sondern ein unsichtbares
 * Steuerzeichen. Alle Tests der Function blieben grün — sie verglich ja mit
 * sich selbst. Erst der Blick auf **beide** Seiten fällt darauf herein nicht.
 */
describe('Versand-Tagebuch: Client und Function bilden denselben Schlüssel', () => {
  const faelle: Array<[string, string]> = [
    ['2026-09-07|mid|part|i1|0', 'A. Berg'],
    ['2026-09-07|mid|helper|mikro|1', 'Bernd Cohn'],
    ['fs|2026-09-07|r1', 'T. Lindner'],
    // Namen dürfen alles enthalten — Bindestriche, Apostrophe, mehrere Wörter.
    ['2026-09-07|we|ratgeber', "Jörg O'Brien-Müller"],
  ]

  it.each(faelle)('%s / %s', (key, name) => {
    expect(sentKey(key, name)).toBe(edgeTagebuch(key, name))
  })

  it('und der Trenner ist ein echtes Leerzeichen', () => {
    // Ohne diese Zeile wären zwei gleich falsche Fassungen ununterscheidbar
    // von zwei gleich richtigen.
    expect(sentKey('k', 'n')).toBe('k n')
  })
})

/**
 * **Treffpunkte: Client und Function meinen dieselbe Woche.**
 *
 * Bis dahin verglich diese Datei nur die *Form* der Schlüssel, nie die
 * *Menge* — und genau dazwischen lag der Fehler: Die Function nimmt den Montag
 * aus der Spalte `weeks.start`, der Client rechnete ihn aus der Ordnungszahl
 * (`fsBase + wi·7`). Ohne Lücke im Bestand ist das dasselbe, mit Lücke nicht.
 * Beide Seiten liefen dann sauber durch und redeten über verschiedene Wochen:
 * Der Knopf zeigte „1 noch nicht gesendet", der Druck meldete „0 gesendet",
 * und die Zahl blieb stehen.
 *
 * Geprüft wird deshalb an einem Bestand **mit** Lücke — ohne sie könnte auch
 * die alte Rechnung bestehen.
 */
describe('Treffpunkt-Schlüssel: Client und Function treffen dieselbe Menge', () => {
  const MONTAG = '2026-09-21' // zweite geladene Woche; die vom 14. fehlt
  const BASIS = new Date(2026, 8, 7, 12)
  const inst = {
    id: 'r1',
    ruleId: 'r1',
    grp: '',
    wd: 6,
    time: '09:30',
    place: 'Königreichssaal',
    leader: 'T. Lindner',
    lpid: 'p1',
  }
  const woche = {
    range: '',
    book: '',
    start: MONTAG,
    current: false,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  } as unknown as Week

  it('derselbe Schlüssel für denselben Treffpunkt', () => {
    // Client: die Woche ist die zweite geladene (wi = 1).
    const client = offeneMeldungen(woche, [inst as FsInstance], 1, BASIS, [], {}, {})
    // Function: der Montag kommt aus der Datenbankzeile.
    const server = edgeFsPending(MONTAG, [inst as never], new Map())
    expect(client.map((o) => o.key)).toEqual(server.map((p) => p.key))
    expect(client.map((o) => o.name)).toEqual(server.map((p) => p.name))
  })

  it('und ein Freitext-Leiter bleibt auf beiden Seiten draußen', () => {
    // Der Kreisaufseher hat kein Konto — die Ausnahme muss beidseitig gelten,
    // sonst geht eine Nachricht ins Leere oder gar keine hinaus.
    const extern = { ...inst, lext: true }
    expect(offeneMeldungen(woche, [extern as FsInstance], 1, BASIS, [], {}, {})).toEqual([])
    expect(edgeFsPending(MONTAG, [extern as never], new Map())).toEqual([])
  })
})

/**
 * **Der Erinnerungs-Rhythmus.**
 *
 * Die Voreinstellung steht an zwei Stellen: im Client (`STANDARD_ERINNERUNGEN`,
 * gezeigt in den Einstellungen) und als Rückfall in `send-reminders`, wo eine
 * Versammlung nichts Eigenes gespeichert hat. Läuft das auseinander, zeigt die
 * App „Wiederholung aus" und der Versand erinnert trotzdem täglich — sichtbar
 * nur für den Empfänger, der sich über sieben Push-Nachrichten wundert.
 */
describe('Voreinstellung der Erinnerungen: Client und Versand sind sich einig', () => {
  // Über Vite eingelesen, nicht über `node:fs`: Diese Suite läuft in der
  // Browser-Umgebung des Projekts, dieselbe Machart wie in
  // `i18n/mitteilungs-titel.test.ts`.
  const EDGE = import.meta.glob('../../supabase/functions/send-reminders/index.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const quelle = Object.values(EDGE)[0] ?? ''
  const rueckfall = (feld: string): string => {
    // Gelesen wird der Quelltext, weil die Function nicht importierbar ist
    // (sie ruft beim Laden `Deno.serve`). Findet das Muster seine Stelle nicht
    // mehr, bricht die Probe laut ab, statt stillschweigend grün zu bleiben.
    const muster = new RegExp(
      `${feld}: cong\\.settings\\?\\.reminders\\?\\.${feld} \\?\\? ([^,\\n]+),`,
    )
    const m = muster.exec(quelle)
    if (!m) throw new Error(`Rückfall für \`${feld}\` nicht gefunden — Stelle nachziehen`)
    return m[1]!.trim()
  }

  it.each([['first'], ['last'], ['repeat']])('%s', (feld) => {
    expect(rueckfall(feld)).toBe(String(STANDARD_ERINNERUNGEN[feld as keyof typeof STANDARD_ERINNERUNGEN]))
  })
})
