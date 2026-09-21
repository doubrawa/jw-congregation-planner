import { describe, expect, it } from 'vitest'
import {
  deutschesDatum as edgeDeutschesDatum,
  heuteUtc as edgeHeuteUtc,
  istAusgefallenFuer as edgeAusgefallen,
  personDisplayName as edgeName,
  rolleMitHerkunft as edgeHerkunft,
  SKIP_ROLE as EDGE_SKIP,
  taskDateText as edgeDate,
  terminText as edgeTermin,
  versatzMitAbweichung as edgeVersatz,
  zeitenAus as edgeZeitenAus,
  zeitMitAbweichung as edgeZeit,
  versatzAbMontag as edgeVersatzAbMontag,
  STANDARD_ZEITEN as EDGE_STANDARD_ZEITEN,
  zuteilungsLabel as edgeLabel,
} from '../../supabase/functions/_shared/planung.ts'
import {
  offeneDerWoche as edgeOffeneDerWoche,
  pendingOfFsWeek as edgeFsPending,
  pendingOfMeeting as edgePending,
  tagebuchSchluessel as edgeTagebuch,
} from '../../supabase/functions/_shared/zuteilungen.ts'
import { STANDARD_ERINNERUNGEN } from './vorgaben'
import { displayName, istAusgefallen, rolleMitHerkunft, zuteilungsLabel } from './helpers'
import { deutschesDatum, meetingDateText, meetingOffset, meetingTime, versatzAbMontag } from './meeting-dates'
import { isGuestRole, sentKey } from './planning'
import { entzogeneZusagen, offeneMeldungen } from './plan-versand'
import { emptyQualifications } from './helpers'
import type { Abweichung, FsInstance, Meeting, Person, Section, Service, Week } from './types'
import { STANDARD_ZEITEN } from './vorgaben'

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

/**
 * Ein Tag vor allen Wochen dieser Datei (September 2026). Die Vorschau lässt
 * Vergangenes weg; ohne festen Tag hinge jede Menge hier davon ab, wann der Test
 * läuft.
 */
const VOR_DER_WOCHE = new Date(2026, 8, 1, 9, 0)

const person = (fn: string, ln: string): Person => ({
  id: 'p', fn, ln, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

describe('Name einer Person', () => {
  const faelle: Array<[string, string]> = [
    ['Anna', 'Beispiel'],
    ['', 'Beispiel'], // nur Nachname → kein führendes Leerzeichen
    ['Anna', ''],
    ['', ''], // gar nichts → leer, nicht " "
    ['Jörg', 'Grünwald'],
    ['Josef sen.', 'Mayer'], // der Zusatz gegen Namensgleichheit (T110)
  ]

  it.each(faelle)('„%s %s" gleich auf beiden Seiten', (fn, ln) => {
    expect(edgeName(fn, ln)).toBe(displayName(person(fn, ln)))
  })
})

describe('Beschriftung einer Zuteilung', () => {
  const faelle: Array<[string, string, string | undefined]> = [
    ['ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Vorsitz'],
    ['ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Gebet'],
    ['ABSCHLUSS', 'Schlussworte · Lied 24 · Gebet', 'Gebet'],
    ['UNSER LEBEN ALS CHRIST', 'Versammlungsbibelstudium', 'Leiter'],
    ['UNS IM DIENST VERBESSERN', 'Gespräche beginnen', 'Partner'],
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

  it('Rolle und Herkunft ergeben zusammen den Anzeigetext', () => {
    expect(rolleMitHerkunft({ rolle: 'Gastredner', herkunft: 'Vers. Nordheim' }))
      .toBe('Gastredner · Vers. Nordheim')
  })

  it('eine Herkunft im Rollentext zählt nicht mehr', () => {
    // Sie stand einmal als zweites Atom der Rolle. Ein Versammlungsname ist
    // aber kein Teil einer Rolle — über die entscheiden `isGuestRole` und die
    // Auto-Zuteilung. Beide Seiten lesen sie jetzt nur aus ihrem eigenen Feld.
    expect(rolleMitHerkunft({ rolle: 'Gastredner · Vers. Nordheim' })).toBe('Gastredner')
    expect(edgeHerkunft({ rolle: 'Gastredner · Vers. Nordheim' })).toBe('Gastredner')
  })

  it('ohne Herkunft steht kein Trenner ins Leere', () => {
    expect(rolleMitHerkunft({ rolle: 'Gastredner', herkunft: '' })).toBe('Gastredner')
  })
})

describe('Regeltermine der Versammlung', () => {
  /*
    Hier standen zwei Blöcke — „Uhrzeiten der Zusammenkünfte" und „Wochentage
    der Zusammenkünfte" — und beide verglichen zwei **Leser desselben
    Anzeigetexts**: „Di 19:00 · So 10:00" wurde auf jeder Seite mit einem
    eigenen regulären Ausdruck zerlegt. Genau das ist seit dem 18. September
    2026 weg: Die Versammlung führt vier Spalten, und beide Seiten lesen
    Werte.

    Zu vergleichen bleibt, was beide noch selbst tun — und hier ist es
    buchstäblich dasselbe Stück Code: `STANDARD_ZEITEN` liegt im geteilten
    Modul, der Client gibt es nur weiter. Der Test hält fest, dass das so
    bleibt: Zwei Vorgaben hießen, dass die App einen Tag anzeigt und die
    Erinnerung einen anderen nennt.
  */
  it('die Vorgabe ist auf beiden Seiten dieselbe', () => {
    expect(STANDARD_ZEITEN).toEqual(EDGE_STANDARD_ZEITEN)
    expect(STANDARD_ZEITEN).toBe(EDGE_STANDARD_ZEITEN)
  })

  it('aus den vier Spalten wird beidseitig derselbe Wert', () => {
    // `time` kommt aus PostgreSQL als „19:00:00"; geführt wird „19:00".
    expect(edgeZeitenAus({ mid_wd: 3, mid_time: '19:30:00', we_wd: 6, we_time: '17:00:00' })).toEqual({
      mid: { wd: 3, time: '19:30' },
      we: { wd: 6, time: '17:00' },
    })
    expect(edgeZeitenAus(undefined)).toEqual(STANDARD_ZEITEN)
  })

  it('der Versatz ab Montag ist beidseitig derselbe', () => {
    for (let wd = 0; wd < 7; wd++) {
      expect(edgeVersatzAbMontag(wd), `wd ${wd}`).toBe(versatzAbMontag(wd))
    }
    // Und er stimmt: Sonntag (0) liegt hinten, Montag (1) vorn.
    expect(versatzAbMontag(0)).toBe(6)
    expect(versatzAbMontag(1)).toBe(0)
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
    'Partner',
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
    Abweichung → Rhythmus der Versammlung.

    Dazwischen stand eine dritte Quelle — der Wochentag, den das `date`-Feld
    **anzeigt**. Die Fälle „eigener Termin" von damals sind geblieben: Sie
    zeigen jetzt, dass aus dem Anzeigetext nichts mehr abgeleitet wird.
  */
  const faelle: Array<[string, Abweichung | undefined, string, number, string]> = [
    ['ohne Abweichung, Wochenspanne', undefined, '7.–13. September', 1, '19:00'],
    ['ohne Abweichung, Termin im Anzeigetext', undefined, 'Samstag, 3. Oktober · 19:30', 1, '19:00'],
    ['nur Tag verlegt', { wd: 4 }, '7.–13. September', 3, '19:00'],
    ['nur Uhrzeit verlegt', { time: '18:30' }, '7.–13. September', 1, '18:30'],
    ['Tag und Uhrzeit verlegt', { wd: 5, time: '17:00' }, '7.–13. September', 4, '17:00'],
    ['Abweichung schlägt den Anzeigetext', { wd: 1, time: '20:00' }, 'Samstag, 3. Oktober · 19:30', 0, '20:00'],
    ['Ausfall ohne Verlegung ändert den Tag nicht', { cancelled: true }, '7.–13. September', 1, '19:00'],
    // Der Sonntag ist die 0 — mit `||` statt `??` fiele er auf den Rhythmus
    // zurück, und beide Seiten nennten den Dienstag.
    ['auf Sonntag verlegt', { wd: 0 }, '7.–13. September', 6, '19:00'],
  ]

  const woche = (dev: Abweichung | undefined, date: string): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    mid: { date, end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
    dev: dev ? { mid: dev } : undefined,
  })

  it.each(faelle)('%s', (_name, dev, date, tag, zeit) => {
    const w = woche(dev, date)
    const zeiten = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
    // Client
    expect(meetingOffset(w, 'mid', zeiten)).toBe(tag)
    expect(meetingTime(w, 'mid', zeiten)).toBe(zeit)
    // Edge — dieselben Eingaben, eigene Fassung
    expect(edgeVersatz(w.dev, 'mid', 2)).toBe(tag)
    expect(edgeZeit(w.dev, 'mid', '19:00')).toBe(zeit)
  })

  /*
    Nicht nur Tag und Uhrzeit einzeln — auch der **fertige Satz** muss auf
    beiden Seiten derselbe sein. Er steht dem Empfänger zweimal vor Augen: in
    „Meine Aufgaben" (Client) und in Erinnerung, Zuteilung, Entzug und
    Ersatzsuche (Function). Liest er dort zwei verschiedene Termine, glaubt er
    keinem von beiden.

    Der erste Fall der Tabelle ist der, der im Betrieb der Regelfall ist: Eine
    importierte Woche trägt im `date`-Feld nur die Wochenspanne. Wer es
    ungeprüft übernimmt, schreibt „7.–13. September" statt „Dienstag, 8.
    September · 19:00" — genau das tat `substitute` als einzige der drei
    Functions.
  */
  it.each(faelle)('%s — derselbe Termin-Text', (_name, dev, date, tag, zeit) => {
    const w = woche(dev, date)
    const zeiten = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
    expect(edgeTermin(w.start, tag, date, zeit)).toBe(
      meetingDateText(w, 0, 'mid', zeiten),
    )
  })

  it('die Wochenspanne allein ist kein Termin', () => {
    // Die Gegenprobe zur Zeile darüber: Das rohe `date`-Feld einer
    // importierten Woche nennt keinen Tag — beide Seiten müssen ihn rechnen.
    const w = woche(undefined, '7.–13. September')
    expect(edgeDate(w.mid.date)).toBe('7.–13. September')
    expect(meetingDateText(w, 0, 'mid', { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } })).toBe('Dienstag, 8. September · 19:00')
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
    grp: null,
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
    const client = offeneMeldungen(woche, [inst as FsInstance], 1, BASIS, [], {}, {}, STANDARD_ZEITEN, VOR_DER_WOCHE)
    // Function: der Montag kommt aus der Datenbankzeile.
    const server = edgeFsPending(MONTAG, [inst as never], new Map())
    expect(client.map((o) => o.key)).toEqual(server.map((p) => p.key))
    expect(client.map((o) => o.name)).toEqual(server.map((p) => p.name))
  })

  /**
   * **Und dieselbe Zeile, nicht nur derselbe Schlüssel.**
   *
   * Die Function schrieb `Treffpunkt-Leiter · Bahnhof` und ließ den Termin ohne
   * Ort; der Client schrieb `Treffpunkt-Leiter` und setzte den Ort in den
   * Termin. Zwei Reihenfolgen derselben Auskunft, je nachdem, ob die Nachricht
   * aus dem Versand oder aus dem Browser kam — und dazwischen liegt nur, wer
   * gerade schreibt. Wer erst erinnert und dann entzogen wird, las zweierlei.
   */
  it('dieselbe Bezeichnung und derselbe Termin auf beiden Seiten', () => {
    const nachher = { ...inst, leader: 'A. Anders', lpid: 'p2' }
    const key = `fs|${MONTAG}|r1`
    const client = entzogeneZusagen(
      woche,
      woche,
      [inst as FsInstance],
      [nachher as FsInstance],
      1,
      BASIS,
      [],
      STANDARD_ZEITEN,
      { [key]: 'bestätigt' },
      VOR_DER_WOCHE,
    )
    const server = edgeFsPending(MONTAG, [inst as never], new Map())
    expect(client).toHaveLength(1)
    expect(server).toHaveLength(1)
    expect(client[0]!.label).toBe(server[0]!.label)
    expect(client[0]!.datum).toBe(server[0]!.datum)
    // Und zwar so herum: der Ort gehört zum Termin, nicht in die Bezeichnung.
    expect(server[0]!.label).toBe('Treffpunkt-Leiter')
    expect(server[0]!.datum).toBe('Samstag, 26. September · 09:30 · Königreichssaal')
  })

  it('ohne Ort endet der Termin nicht auf einem hängenden Trenner', () => {
    // Der Rand, an dem die zwei Fassungen schon einmal auseinanderliefen.
    const ohneOrt = { ...inst, place: '' }
    expect(edgeFsPending(MONTAG, [ohneOrt as never], new Map())[0]!.datum).toBe(
      'Samstag, 26. September · 09:30',
    )
  })

  it('und ein Freitext-Leiter bleibt auf beiden Seiten draußen', () => {
    // Der Kreisaufseher hat kein Konto — die Ausnahme muss beidseitig gelten,
    // sonst geht eine Nachricht ins Leere oder gar keine hinaus.
    const extern = { ...inst, lext: true }
    expect(offeneMeldungen(woche, [extern as FsInstance], 1, BASIS, [], {}, {}, STANDARD_ZEITEN, VOR_DER_WOCHE)).toEqual([])
    expect(edgeFsPending(MONTAG, [extern as never], new Map())).toEqual([])
  })
})

/**
 * **Der Erinnerungs-Rhythmus.**
 *
 * Die Voreinstellung stand an zwei Stellen: im Client (`STANDARD_ERINNERUNGEN`,
 * gezeigt in den Einstellungen) und als Rückfall in `send-reminders`, wo eine
 * Versammlung nichts Eigenes gespeichert hatte. Lief das auseinander, zeigte die
 * App „Wiederholung aus" und der Versand erinnerte trotzdem täglich — sichtbar
 * nur für den Empfänger, der sich über sieben Push-Nachrichten wundert.
 *
 * Seit die Erinnerungen **Spalten** sind (T105), gibt es diesen Rückfall nicht
 * mehr: Eine Versammlung hat immer Werte, und woher sie kommen, sagt das
 * `default` in `schema.sql`. Verglichen wird deshalb der Client mit dem
 * Schema — dieselbe Frage, eine Ebene tiefer.
 */
describe('Voreinstellung der Erinnerungen: Client und Datenbank sind sich einig', () => {
  const SCHEMA = import.meta.glob('../../supabase/schema.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const schema = Object.values(SCHEMA)[0] ?? ''

  /** Der Vorgabewert einer Spalte aus `schema.sql`. */
  const vorgabe = (spalte: string): string => {
    const m = new RegExp(`\\n  ${spalte}\\s+\\w+ not null default ([^\\s,]+)`).exec(schema)
    if (!m) throw new Error(`Vorgabe für \`${spalte}\` nicht gefunden — Stelle nachziehen`)
    return m[1]!.trim()
  }

  it.each([
    ['first', 'reminder_first'],
    ['last', 'reminder_last'],
    ['repeat', 'reminder_repeat'],
  ])('%s', (feld, spalte) => {
    expect(vorgabe(spalte)).toBe(
      String(STANDARD_ERINNERUNGEN[feld as keyof typeof STANDARD_ERINNERUNGEN]),
    )
  })
})

/**
 * **„Plan senden" trifft auf beiden Seiten dieselbe Menge** — auch bei den
 * Zusammenkünften.
 *
 * Der Knopf im Planen-Screen beschriftet sich aus der Client-Vorschau
 * (`offeneMeldungen`), verschickt wird aus der Function (`pendingOfMeeting`).
 * Weichen die beiden ab, zeigt der Knopf eine Zahl an, die nach dem Drücken
 * nicht auf null geht — der Planer drückt, bekommt „0 gesendet", und die Zahl
 * steht unverändert da. Niemand sieht, woran es liegt.
 *
 * Für die **Treffpunkte** stand diese Gegenprobe längst hier (siehe oben); für
 * die Zusammenkünfte fehlte sie — und dort liegen die vier Platzsorten, die
 * `alle-plaetze.test.ts` als Wiederholungstäter führt: beide Räume, der
 * Ratgeber der Zusätzlichen Klasse, die Hilfsdienste bis `svc.count` — samt
 * der Unterscheidung zwischen stabilem und positionsbasiertem Schlüssel.
 */
describe('Plan senden: Vorschau und Versand treffen dieselbe Menge (Zusammenkunft)', () => {
  const MONTAG_PS = '2026-09-07'
  const dienste: Service[] = [
    { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true }, // Rotation: keine Person
    { key: 'ton', name: 'Ton', count: 1, groups: false },
  ]

  /** Eine Zusammenkunft mit allem, was je vergessen wurde. */
  function zusammenkunft(): Meeting {
    const sections: Section[] = [
      {
        label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral',
        items: [
          { song: 'Lied 1' }, // Lieder tragen keine Plätze
          { iid: 'a1', title: 'Lied 1 · Gebet · Einleitende Worte', meta: '', names: [
            { name: 'Anton Alt', pid: 'p1', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
            { name: 'Bernd Berg', pid: 'p2', rolle: 'Gebet', bereichsKey: 'gebet' },
          ] },
        ],
      },
      {
        label: 'UNS IM DIENST VERBESSERN', kind: 'dienst', farbe: 'gold',
        items: [
          // Schülerteil in beiden Räumen — die zweite Reihe ist die Platzsorte,
          // die am häufigsten übersehen wurde.
          { iid: 'b1', title: 'Gespräche beginnen', meta: 'Von Haus zu Haus · 3 Min.', names: [
            { name: 'Clara Cord', pid: 'p3', bereichsKey: 'schulung' },
            { name: 'Dora Dill', pid: 'p4', rolle: 'mit Clara Cord', bereichsKey: 'schulungPartner' },
          ], aux: [
            { name: 'Emil Erd', pid: 'p5', bereichsKey: 'schulung' },
            { name: '', bereichsKey: 'schulungPartner' }, // offen → gehört niemandem
          ] },
          { iid: 'd1', title: 'Weiterer Punkt', meta: '', names: [{ name: 'Fritz Feld', pid: 'p6', bereichsKey: 'schulung' }] },
        ],
      },
      {
        label: 'ÖFFENTLICHER VORTRAG', kind: 'vortrag', farbe: 'petrol',
        items: [
          { iid: 'c1', title: 'Vortrag', meta: '', names: [
            { name: 'Gustav Gast', rolle: 'Gastredner', herkunft: 'Nordheim', bereichsKey: 'vortrag' },
          ] },
        ],
      },
    ]
    return {
      date: '7.–13. September', end: '', sections,
      helpers: {
        // Der dritte Name steht hinter `count: 2` — er zählt nirgends.
        mik: [{ name: 'Hans Hell', pid: 'p7' }, { name: '' }, { name: 'Ida Idyll', pid: 'p8' }],
        rein: [{ name: 'Gruppe 2' }],
        ton: [{ name: 'Jens Jung', pid: 'p9' }],
      },
      auxRatgeber: { name: 'Karl Kern', pid: 'p10', rolle: 'Ratgeber', bereichsKey: 'ratgeber' },
    }
  }

  const wochePS = (mid: Meeting): Week => ({
    range: '', book: '', start: MONTAG_PS, current: false,
    mid,
    we: { date: '', end: '', sections: [], helpers: {} },
  } as unknown as Week)

  const beideSeiten = (
    mid: Meeting,
    svc: Service[] = dienste,
    conf: Record<string, 'bestätigt' | 'verhindert'> = {},
  ): [string[], string[]] => [
    offeneMeldungen(wochePS(mid), [], 0, null, svc, conf, {}, STANDARD_ZEITEN, VOR_DER_WOCHE)
      .map((o) => `${o.key} | ${o.name}`)
      .sort(),
    edgePending(MONTAG_PS, 'mid', mid as never, svc as never, new Map(Object.entries(conf)))
      .map((p) => `${p.key} | ${p.name}`)
      .sort(),
  ]

  it('dieselben Schlüssel und Namen über alle vier Platzsorten', () => {
    const [client, server] = beideSeiten(zusammenkunft())
    expect(client).toEqual(server)
    // Und es ist die erwartete Menge: kein Lied, kein Gastredner, keine
    // Gruppen-Rotation, kein offener Platz, nichts hinter `count`.
    expect(client).toEqual([
      `${MONTAG_PS}|mid|aux|b1|0 | Emil Erd`,
      `${MONTAG_PS}|mid|helper|mik|0 | Hans Hell`,
      `${MONTAG_PS}|mid|helper|ton|0 | Jens Jung`,
      `${MONTAG_PS}|mid|part|a1|0 | Anton Alt`,
      `${MONTAG_PS}|mid|part|a1|1 | Bernd Berg`,
      `${MONTAG_PS}|mid|part|b1|0 | Clara Cord`,
      `${MONTAG_PS}|mid|part|b1|1 | Dora Dill`,
      `${MONTAG_PS}|mid|part|d1|0 | Fritz Feld`,
      `${MONTAG_PS}|mid|ratgeber | Karl Kern`,
    ])
  })

  it('abgeschaltete Klasse: die zweite Reihe zählt auf keiner Seite', () => {
    // Die Namen bleiben beim Abschalten absichtlich stehen (damit ein
    // Wiedereinschalten sie hat). Erkennungsmerkmal ist der Ratgeber-Platz.
    const mid = zusammenkunft()
    delete mid.auxRatgeber
    const [client, server] = beideSeiten(mid)
    expect(client).toEqual(server)
    expect(client.join(' ')).not.toContain('Emil Erd')
    expect(client.join(' ')).not.toContain('Karl Kern')
  })

  it('wer bestätigt oder abgesagt hat, fällt beidseitig heraus', () => {
    const conf = {
      [`${MONTAG_PS}|mid|part|a1|0`]: 'bestätigt' as const,
      [`${MONTAG_PS}|mid|helper|mik|0`]: 'verhindert' as const,
    }
    const [client, server] = beideSeiten(zusammenkunft(), dienste, conf)
    expect(client).toEqual(server)
    expect(client.join(' ')).not.toContain('Anton Alt')
    expect(client.join(' ')).not.toContain('Hans Hell')
  })

  it('reduzierte Platzzahl: der Name dahinter zählt auf keiner Seite', () => {
    const wenig = dienste.map((s) => (s.key === 'mik' ? { ...s, count: 1 } : s))
    const [client, server] = beideSeiten(zusammenkunft(), wenig)
    expect(client).toEqual(server)
    expect(client.join(' ')).not.toContain('Ida Idyll')
  })
})

/**
 * **„Plan senden" lässt auf beiden Seiten dasselbe weg, was vorbei ist** (T95).
 *
 * Die Vorschau am Knopf (`offeneMeldungen`) und der Versand der Function
 * (`offeneDerWoche`) überspringen Vergangenes — tagesgenau, am Tag selbst zählt
 * eine Zusammenkunft noch. Rechnet eine Seite den Tag anders (einen Tag zu früh,
 * den Wochentag fest statt aus den Einstellungen, die Verlegung nicht mit), zeigt
 * der Knopf eine Zahl, die nach dem Drücken nicht auf null geht — oder es geht
 * eine Nachricht über einen Abend hinaus, der gewesen ist.
 *
 * Verglichen wird am **selben Kalendertag**: der Client mit dem örtlichen Datum,
 * die Function mit dessen UTC-Mitternacht — so, wie der Client ihn mitschickt
 * (`heuteUtc`).
 */
describe('Plan senden: Vorschau und Versand lassen dasselbe Vergangene weg', () => {
  const MONTAG_V = '2026-09-07' // Di 8.9., So 13.9.
  const MEETINGS_V = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
  const dienste: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]

  const woche = (over: Partial<Week> = {}): Week =>
    ({
      range: '', book: '', start: MONTAG_V, current: false,
      mid: {
        date: '7.–13. September', end: '',
        sections: [{
          label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schatz', farbe: 'petrol',
          items: [{ iid: 'b1', title: 'Bibellesung', meta: '', names: [{ name: 'Anna Alt', pid: 'p1' }] }],
        }],
        helpers: { mik: [{ name: 'Bernd Berg', pid: 'p2' }] },
      },
      we: { date: '7.–13. September', end: '', sections: [], helpers: { mik: [{ name: 'Clara Cord', pid: 'p3' }] } },
      ...over,
    }) as unknown as Week

  const treffpunkte = [
    { id: 'mo', ruleId: 'mo', grp: null, wd: 1, time: '14:00', place: 'Saal', leader: 'Dora Dill', lpid: 'p4' },
    { id: 'sa', ruleId: 'sa', grp: null, wd: 6, time: '09:30', place: 'Saal', leader: 'Emil Erd', lpid: 'p5' },
  ] as FsInstance[]

  /** Beide Seiten am `tag`. September 2026, mittags örtlich bzw. als UTC-Mitternacht. */
  const beideSeiten = (tag: number, w: Week = woche()): [string[], string[]] => [
    offeneMeldungen(w, treffpunkte, 0, null, dienste, {}, {}, MEETINGS_V, new Date(2026, 8, tag, 12, 0))
      .map((o) => o.name)
      .sort(),
    edgeOffeneDerWoche(MONTAG_V, w as never, treffpunkte as never, dienste as never, new Map(), MEETINGS_V, Date.UTC(2026, 8, tag))
      .map((p) => p.name)
      .sort(),
  ]

  it('am Montag steht alles an — dieselbe Menge auf beiden Seiten', () => {
    const [client, server] = beideSeiten(7)
    expect(client).toEqual(server)
    expect(client).toEqual(['Anna Alt', 'Bernd Berg', 'Clara Cord', 'Dora Dill', 'Emil Erd'])
  })

  it('am Mittwoch sind der Dienstag und der Montags-Treffpunkt auf beiden Seiten weg', () => {
    const [client, server] = beideSeiten(9)
    expect(client).toEqual(server)
    expect(client).toEqual(['Clara Cord', 'Emil Erd'])
  })

  it('am Sonntag zählt der Sonntag noch — beidseitig tagesgenau', () => {
    const [client, server] = beideSeiten(13)
    expect(client).toEqual(server)
    expect(client).toEqual(['Clara Cord'])
  })

  it('eine verlegte Zusammenkunft zählt ab ihrem neuen Tag — auf beiden Seiten (T30)', () => {
    // Die Wochenmitte ist auf Donnerstag verlegt: Am Mittwoch steht sie noch
    // bevor, obwohl der reguläre Dienstag vorbei ist.
    const verlegt = woche({ dev: { mid: { wd: 4 } } } as Partial<Week>)
    const [client, server] = beideSeiten(9, verlegt)
    expect(client).toEqual(server)
    expect(client).toEqual(['Anna Alt', 'Bernd Berg', 'Clara Cord', 'Emil Erd'])
  })
})

/**
 * **Welchen Tag die Function für „heute" hält.**
 *
 * Der Client schickt seinen örtlichen Kalendertag mit. In Mitteleuropa ist der
 * UTC-Tag zwischen Mitternacht und 02:00 noch der gestrige — ohne den
 * mitgeschickten Tag meinten Knopf und Versand in dieser Zeit verschiedene Tage.
 */
describe('Der Kalendertag, den die Function glaubt', () => {
  // Dienstag, 23:30 UTC — in Mitteleuropa schon Mittwoch.
  const jetzt = Date.UTC(2026, 8, 8, 23, 30)

  it('der Tag des Planers gilt, auch wenn UTC noch beim Vortag ist', () => {
    expect(edgeHeuteUtc('2026-09-09', jetzt)).toBe(Date.UTC(2026, 8, 9))
  })

  it('ohne Angabe — ein älterer Client — der UTC-Tag', () => {
    expect(edgeHeuteUtc(undefined, jetzt)).toBe(Date.UTC(2026, 8, 8))
  })

  it('mehr als einen Tag daneben wird nicht geglaubt — eine falsch gestellte Uhr bestimmt nicht, was vorbei ist', () => {
    expect(edgeHeuteUtc('2026-09-10', jetzt)).toBe(Date.UTC(2026, 8, 8))
    expect(edgeHeuteUtc('2026-09-06', jetzt)).toBe(Date.UTC(2026, 8, 8))
  })

  it('und kein Datum schon gar nicht', () => {
    expect(edgeHeuteUtc('morgen', jetzt)).toBe(Date.UTC(2026, 8, 8))
  })
})
