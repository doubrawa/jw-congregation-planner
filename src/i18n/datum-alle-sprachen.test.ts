import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS, LOCALES } from './langs'
import { bibelbuecherLaden, makeTr } from './translate'
import { buchTabelle } from '../../supabase/functions/_shared/i18n/bible-books.ts'
import { D, EXTRA, REF } from '../../supabase/functions/_shared/i18n/translate-data.ts'
import { ersteZahl, zahl } from '../data/ziffern'
import type { Lang } from '../data/types'

/**
 * **Datum und Uhrzeit in jeder App-Sprache — gemessen, nicht gehofft.**
 *
 * Der Programmkopf, die Zeile über jeder Zusammenkunft und der Countdown einer
 * Aufgabe entstehen alle aus **einem kanonisch deutschen Text** („Dienstag,
 * 8. September", „7.–13. September", „Ende ca. 20:45"). Übersetzt wird er auf
 * zwei Wegen: über ein gepflegtes Datums-Wörterbuch (`D`, wenige Sprachen) oder
 * über `Intl` (alle übrigen). `translate.test.ts` prüft beide Wege an einzelnen
 * Sprachen; was fehlte, ist die Aussage über **alle 34**.
 *
 * Die Prüfung ist bewusst nicht „stimmt Zeichen für Zeichen" — das wäre eine
 * zweite, von Hand gepflegte Übersetzungstabelle und damit genau die Sorte
 * Verabredung, die hier schon mehrfach auseinandergelaufen ist. Geprüft werden
 * die **Zusicherungen**, die jede Sprache halten muss:
 *
 *  - Es wird überhaupt übersetzt (kein stiller Rückfall auf Deutsch).
 *  - Der **Tag bleibt derselbe**. Das ist die härteste und die, an der es
 *    tatsächlich hing: `fa-IR` bringt den persischen Kalender mit, und aus dem
 *    8. September wurde der 17. Schahriwar — ein Datum, das im Arbeitsheft
 *    nirgends steht (siehe `LOCALES`).
 *  - Die **Uhrzeit** bleibt unangetastet; sie ist keine Datumsangabe.
 *  - Nirgends steht „undefined", „NaN" oder „Invalid Date" (T1).
 */

const CODES = APP_LANGS.map((l) => l.code)
const FREMD = CODES.filter((c) => c !== 'de')

/** Alle Zahlen eines Textes — in jeder Schrift, nicht nur der westlichen. */
function zahlen(text: string): number[] {
  return [...text.matchAll(/\p{Nd}+/gu)].map((m) => zahl(m[0]))
}

describe('Der Tag bleibt der Tag', () => {
  /*
   * Warum das die entscheidende Zusicherung ist: Ein unübersetzt gebliebenes
   * Datum ist unschön, ein **falscher Tag** schickt jemanden am falschen Abend
   * zum Königreichssaal. Und genau das konnte passieren — nicht durch einen
   * Tippfehler, sondern weil eine Locale einen anderen Kalender mitbringt.
   */
  it.each(FREMD)('%s: „Dienstag, 8. September" nennt weiterhin den 8.', (code) => {
    const text = makeTr(code)('Dienstag, 8. September')
    expect(zahlen(text), `${code}: ${text}`).toContain(8)
  })

  it.each(FREMD)('%s: die Wochenspanne nennt weiterhin 7 und 13', (code) => {
    const text = makeTr(code)('7.–13. September')
    const gefunden = zahlen(text)
    expect(gefunden, `${code}: ${text}`).toContain(7)
    expect(gefunden, `${code}: ${text}`).toContain(13)
  })

  it.each(FREMD)('%s: die Spanne über den Monatswechsel behält beide Tage', (code) => {
    // Die Form von jw.org bei Monatswechsel („27. April–3. Mai"). Rund jede
    // vierte Woche hat sie; ihr eigener Ausdruck kam erst später dazu.
    const text = makeTr(code)('27. April–3. Mai')
    const gefunden = zahlen(text)
    expect(gefunden, `${code}: ${text}`).toContain(27)
    expect(gefunden, `${code}: ${text}`).toContain(3)
  })

  it.each(FREMD)('%s: die abgekürzte Spanne ebenso', (code) => {
    const text = makeTr(code)('28. Sep – 4. Okt')
    const gefunden = zahlen(text)
    expect(gefunden, `${code}: ${text}`).toContain(28)
    expect(gefunden, `${code}: ${text}`).toContain(4)
  })

  /*
   * Der Gegenbeweis zur Kalender-Regel: Ohne `-u-ca-gregory` liefert `fa-IR`
   * ein anderes Datum. Steht die Erweiterung eines Tages nicht mehr da, fällt
   * es hier auf — und nicht erst in einer persischen Versammlung.
   */
  it('persisch rechnet nicht in den Dschalali-Kalender um', () => {
    expect(LOCALES.fa).toContain('-u-ca-gregory')
    const mit = makeTr('fa')('Dienstag, 8. September')
    expect(zahlen(mit)).toContain(8)
    // Und so sähe es ohne aus — zum Vergleich, damit die Behauptung nachprüfbar
    // bleibt statt bloß behauptet zu sein.
    const ohne = new Intl.DateTimeFormat('fa-IR', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 8, 8)))
    expect(zahlen(ohne)).not.toContain(8)
  })
})

describe('Es wird überhaupt übersetzt', () => {
  /**
   * Formen, die die App tatsächlich erzeugt — je eine aus jeder Familie:
   * Wörterbuch-Treffer, Datumsregel, Zahlenvorlage, Verweis, Bibelstelle.
   */
  const FORMEN = [
    'Dienstag, 8. September',
    'Di, 8. September',
    '7.–13. September',
    'Lied 5',
    '30 Min.',
    'Ende ca. 20:45',
    'ca. 19:35',
    'Vorsitz',
    'Bibellesung',
    'Versammlungsbibelstudium',
    'SCHÄTZE AUS GOTTES WORT',
    'Gruppe 2',
    'Studienartikel 28',
    'Jeremia 32–33',
    'Jer 32:6-18',
  ]

  /**
   * **Wo eine Übersetzung gleich aussieht wie das Deutsche — und warum.**
   *
   * Ein unverändert zurückgegebener Text kann zweierlei heißen: „die Sprache
   * schreibt es genauso" (nl: „Lied", da/no: „Gruppe", „ca.") oder „hier fehlt
   * die Übersetzung". Die beiden auseinanderzuhalten geht nur über den Grund —
   * dieselbe Haltung wie bei `NUR_GEMESSEN_UEBERSETZBAR` in
   * `translate-data.test.ts`: keine Ausnahme ohne benennbaren Grund.
   */
  type Grund =
    /** Die Sprache schreibt das Wort genauso. Nichts zu tun. */
    | 'wortgleich'
    /**
     * **Bekannte Lücke, ausdrücklich benannt.** „Studienartikel 28" hat eine
     * Regel nur im Wörterbuch-Pfad (`makeTr` mit `D`, also en/es/fr); die
     * übrigen ~30 Sprachen laufen über `Intl`, und dort gibt es sie nicht —
     * siehe den Kommentar `FEHLT HIER` in `translate.ts`.
     *
     * Bewusst **nicht** mit einem englischen Rückfall geschlossen: Der
     * Wortlaut gehört an jw.org gemessen, wie die REF-Tabelle. Bis dahin steht
     * er hier, zählbar und mit Deckel — nicht unsichtbar.
     */
    | 'ungemessen'

  /** Sprachen mit eigenem Datums-Wörterbuch (`D`) — sie kennen „Studienartikel". */
  const MIT_ARTIKEL_REGEL = ['en', 'es', 'fr']

  /**
   * Der Grund wird **abgeleitet, nicht aufgeschrieben.**
   *
   * Eine Liste „nl schreibt Lied auch Lied" wäre eine zweite Wahrheit neben den
   * Wörterbüchern und liefe früher oder später von ihnen weg. Gefragt wird
   * deshalb die Quelle selbst: Hat die Sprache für diese Form eine **eigene**
   * Vorlage, ist ein gleich aussehendes Ergebnis ihre Entscheidung. Fehlt die
   * Vorlage, ist es eine Lücke.
   */
  const grundFuer = (code: Lang, form: string): Grund | undefined => {
    if (form === 'Studienartikel 28') {
      return MIT_ARTIKEL_REGEL.includes(code) ? undefined : 'ungemessen'
    }
    const eigenesDatumsWoerterbuch = D[code] !== undefined
    // „Lied 5" / „ca. 19:35" — Vorlagen aus EXTRA bzw. dem Datums-Wörterbuch.
    if (form.startsWith('Lied ') || form.startsWith('ca. ')) {
      return eigenesDatumsWoerterbuch || EXTRA[code] ? 'wortgleich' : undefined
    }
    // „Gruppe 2" — Verweis-Vorlage aus REF.
    if (form.startsWith('Gruppe ')) return REF[code]?.gruppe ? 'wortgleich' : undefined
    // Bibelstellen: die Buchtabelle bildet den Namen auf sich selbst ab.
    if (form.startsWith('Jeremia ')) {
      return buchTabelle(code).voll.get('Jeremia') === 'Jeremia' ? 'wortgleich' : undefined
    }
    if (form.startsWith('Jer ')) {
      return buchTabelle(code).kurz.get('Jer') === 'Jer' ? 'wortgleich' : undefined
    }
    return undefined
  }

  beforeAll(async () => {
    // Die Buchtabellen liegen in einem eigenen Modul und werden erst geladen,
    // wenn übersetzt wird (16 kB gepackt). Ohne dieses Nachladen bliebe jede
    // Bibelstelle in **jeder** Sprache deutsch — und die Prüfung sähe eine
    // Lücke, die es im laufenden Programm nicht gibt.
    await bibelbuecherLaden()
  })

  it.each(FREMD)('%s: keine dieser Formen bleibt unerklärt deutsch stehen', (code) => {
    const tr = makeTr(code)
    const unerklaert = FORMEN.filter((f) => tr(f) === f && !grundFuer(code, f))
    expect(unerklaert, `${code} übersetzt nicht: ${unerklaert.join(', ')}`).toEqual([])
  })

  it('„wortgleich" wird nur dort behauptet, wo es auch stimmt', () => {
    /*
      Die Ableitung darf nicht zur Generalabsolution werden: Sie sagt „diese
      Sprache hat eine eigene Vorlage" und deckt damit einen unveränderten Text.
      Wäre das für **jede** Sprache und jede Form so, prüfte die Regel darüber
      nichts mehr. Deshalb hier die Gegenrichtung: Die allermeisten Sprachen
      übersetzen diese Formen sehr wohl.
    */
    const uebersetztLied = FREMD.filter((c) => makeTr(c)('Lied 5') !== 'Lied 5')
    const uebersetztGruppe = FREMD.filter((c) => makeTr(c)('Gruppe 2') !== 'Gruppe 2')
    expect(uebersetztLied.length).toBeGreaterThan(FREMD.length - 4)
    expect(uebersetztGruppe.length).toBeGreaterThan(FREMD.length - 4)
  })

  it('die Lücke „Studienartikel" ist genau so breit wie beschrieben', () => {
    /*
      Der Deckel auf der einzigen echten Lücke. Wer die Wortlaute misst und die
      Regel nachträgt, macht diesen Test rot — und streicht dabei die Zeile,
      die die Lücke behauptet. Wer eine **zweite** Lücke einführt, ebenso.
    */
    const fehlt = FREMD.filter((c) => makeTr(c)('Studienartikel 28') === 'Studienartikel 28')
    expect(fehlt.sort()).toEqual(FREMD.filter((c) => !MIT_ARTIKEL_REGEL.includes(c)).sort())
  })

  it('die Bibelstelle wird übersetzt, sobald die Tabellen geladen sind', () => {
    // Gegenprobe zum `beforeAll`: Ohne Nachladen bliebe hier „Jeremia" stehen.
    // Diese Zeile belegt, dass die Prüfung oben wirklich etwas gesehen hat.
    expect(makeTr('en')('Jeremia 32–33')).toBe('Jeremiah 32–33')
    expect(makeTr('el')('Jer 32:6-18')).not.toContain('Jer ')
  })
})

describe('Die Uhrzeit ist kein Datum', () => {
  /*
   * „Di 19:00" ist Wochentag **und** Uhrzeit. Übersetzt wird nur der Wochentag;
   * 19:00 bleibt 19:00 — auch in Sprachen, deren Locale eine 12-Stunden-Uhr
   * vorzieht. Sonst stünde in der Einstellung „Di 19:00" und im Programm
   * „Tue 7:00 PM", und niemand wüsste, ob das dasselbe ist.
   */
  it.each(FREMD)('%s: „Di 19:00" behält seine Uhrzeit', (code) => {
    const text = makeTr(code)('Di 19:00')
    expect(text, code).toContain('19:00')
  })

  it.each(FREMD)('%s: „Ende ca. 20:45" behält seine Uhrzeit', (code) => {
    expect(makeTr(code)('Ende ca. 20:45'), code).toContain('20:45')
  })
})

describe('Nichts wird zu „undefined"', () => {
  /*
   * T1: Ein Monatsname, den eine Tabelle nicht führte, lief als `undefined` bis
   * in die Anzeige („Tue, undefined 8") und im Intl-Pfad in einen `RangeError`
   * — ohne Error Boundary der Totalausfall der App. Der Notausgang ist seither
   * „deutsch stehen lassen". Hier über alle Sprachen und alle Formen, die die
   * App tatsächlich erzeugt.
   */
  const ALLES = [
    'Dienstag, 8. September', 'Mi, 29. Februar', 'Montag, 29. Februar',
    'So, 1. Januar', 'Sa 10:00', '7.–13. September', '27. April–3. Mai',
    '28. Sep – 4. Okt', '31. Dezember–6. Januar', 'Lied 151', '1 Min.',
    'ca. 19:35', 'Ende ca. 11:45', 'th Lektion 11', 'lmd Lektion 1 Punkt 5',
    'Gruppe 2', 'Vers. Nordheim', 'mit A. Hoffmann', 'in 4 Tagen',
    '3 Zuteilungen', 'Studienartikel 28', 'Jeremia 32–33', 'Jer 32:6-18',
  ]

  it.each(CODES)('%s', (code) => {
    const tr = makeTr(code)
    for (const form of ALLES) {
      expect(() => tr(form), `${code}: ${form}`).not.toThrow()
      expect(tr(form), `${code}: ${form}`).not.toMatch(/undefined|NaN|Invalid Date/)
      expect(tr(form), `${code}: ${form}`).not.toBe('')
    }
  })
})

describe('Zusammengesetzte Zeilen zerfallen nicht', () => {
  /*
   * Die App reicht ganze Zeilen durch den Übersetzer, keine Einzelbegriffe:
   * „Bibellesung · Jer 32:6-18", „Demoaufgabe 10 · Do, 8. Mär · ca. 19:35".
   * Zerlegt wird an „ · "; jedes Stück für sich. Bleibt ein Stück unbekannt,
   * muss es unverändert **stehen bleiben** — und die Trenner müssen zählbar
   * dieselben sein, sonst hat der Übersetzer Atome verschluckt.
   */
  const ZEILEN = [
    'Bibellesung · Jer 32:6-18',
    'Versammlungsbibelstudium · Leiter',
    'Lied 1 · Gebet · Einleitende Worte',
    'Schlussworte · Lied 143 · Gebet',
    'Von Haus zu Haus · 3 Min. · lmd Lektion 1',
    'Dienstag, 8. September · 19:00 · Königreichssaal',
  ]

  it.each(FREMD)('%s: die Zahl der Atome bleibt gleich', (code) => {
    const tr = makeTr(code)
    for (const zeile of ZEILEN) {
      const vorher = zeile.split(' · ').length
      const nachher = tr(zeile).split(' · ').length
      expect(nachher, `${code}: „${zeile}" → „${tr(zeile)}"`).toBe(vorher)
    }
  })

  it.each(FREMD)('%s: die Schriftstelle behält Kapitel und Verse', (code) => {
    // Übersetzt wird der Buchname, nie die Zahlen dahinter. Ein verschobener
    // Vers wäre schlimmer als ein deutscher Buchname.
    const text = makeTr(code)('Jer 32:6-18')
    const gefunden = zahlen(text)
    expect(gefunden, `${code}: ${text}`).toContain(32)
    expect(gefunden, `${code}: ${text}`).toContain(6)
    expect(gefunden, `${code}: ${text}`).toContain(18)
  })
})

describe('Minuten bleiben Minuten', () => {
  /*
   * Die Minutenangabe geht durch den Übersetzer und kommt in der Zielsprache
   * heraus („30 min.", „30 分", „٣٠ دقيقة"). Der Ziffernleser muss sie wieder
   * erkennen — sonst zeigt der Planen-Screen keine Minuten-Knöpfe (T32).
   */
  it.each(FREMD)('%s: „30 Min." bleibt als 30 lesbar', (code) => {
    const text = makeTr(code)('30 Min.')
    expect(ersteZahl(text), `${code}: ${text}`).toBe(30)
  })
})

describe('Jede Locale ist der Laufzeit bekannt', () => {
  /*
   * Kennt `Intl` eine Locale nicht, fällt es **still** auf die Umgebungssprache
   * zurück: Ein tagalog-sprachiger Nutzer bekäme dann englische Wochentage,
   * ohne dass irgendwo ein Fehler entstünde. Geprüft wird deshalb nicht „wirft
   * nicht", sondern dass die aufgelöste Locale wirklich die angeforderte
   * Sprache ist.
   */
  it.each(CODES)('%s', (code) => {
    const locale = LOCALES[code as Lang]
    const aufgeloest = new Intl.DateTimeFormat(locale).resolvedOptions().locale
    expect(aufgeloest, `${code}: ${locale} → ${aufgeloest}`).toMatch(
      new RegExp(`^${locale.split('-')[0]}\\b`),
    )
  })

  it('zwei Sprachen liefern nie denselben Wochentagsnamen wie Deutsch', () => {
    // Gegenprobe zur Prüfung darüber: Wäre die Auflösung wirkungslos, sähen
    // alle Sprachen gleich aus. Ausgenommen sind die, die den Wochentag
    // tatsächlich wie im Deutschen schreiben — davon gibt es keine.
    const deutsch = new Intl.DateTimeFormat(LOCALES.de, { weekday: 'long' }).format(
      new Date(Date.UTC(2026, 8, 8)),
    )
    const gleich = FREMD.filter(
      (c) =>
        new Intl.DateTimeFormat(LOCALES[c as Lang], { weekday: 'long' }).format(
          new Date(Date.UTC(2026, 8, 8)),
        ) === deutsch,
    )
    expect(gleich).toEqual([])
  })
})

/**
 * **Welche Ziffern die App selbst schreibt — und wo sie damit von der
 * Wochenseite abweicht.**
 *
 * Zwei Zahlenquellen treffen auf demselben Bildschirm aufeinander:
 *
 *  - Die **Wochenseite** bringt ihre eigenen Ziffern mit („٣ دق", „۳ دقیقه") —
 *    der Import übernimmt sie wörtlich, und `ziffern.ts` liest sie in jeder
 *    Schrift (T32).
 *  - Alles **Gerechnete** (Termin, Countdown, Zähler) formatiert `Intl` nach
 *    der Locale aus `LOCALES`.
 *
 * Laufen die beiden auseinander, steht in einer Zeile „٣ دق" und in der
 * nächsten „8. September" mit westlichen Ziffern. Das ist kein Absturz und
 * keine fehlende Übersetzung — es fällt in keiner der übrigen Prüfungen auf,
 * und genau deshalb steht es hier gemessen.
 *
 * **Befund (28.8.2026):** Von den vier Sprachen mit eigener Schrift schreibt
 * nur **Persisch** seine eigenen Ziffern (`arabext`, wie das Arbeitsheft).
 * Arabisch, Urdu und Hebräisch bekommen von CLDR westliche — für Hebräisch
 * stimmt das mit der Wochenseite überein (gemessen in
 * `parse.sprachen.test.ts`: „‏(‏10 דק׳)‏"), für **Arabisch nicht**: dort steht
 * „(١٠ دق)".
 *
 * Nicht stillschweigend geändert: `ar-u-nu-arab` zu erzwingen hieße, für alle
 * arabischsprachigen Gegenden zu entscheiden — der Maghreb schreibt westlich,
 * und CLDR hat die Vorgabe für das allgemeine `ar` aus genau diesem Grund
 * einmal umgestellt. Die Entscheidung gehört dem Betreiber; die Messung hierher.
 */
describe('Ziffernsätze der Anzeige', () => {
  const ziffernSatz = (code: Lang): string =>
    new Intl.NumberFormat(LOCALES[code]).resolvedOptions().numberingSystem

  it('nur Persisch schreibt eigene Ziffern — die übrigen westliche', () => {
    const eigene = CODES.filter((c) => ziffernSatz(c) !== 'latn')
    expect(eigene, `eigene Ziffern: ${eigene.map((c) => `${c}=${ziffernSatz(c)}`).join(', ')}`)
      .toEqual(['fa'])
    expect(ziffernSatz('fa')).toBe('arabext')
  })

  it('Persisch bleibt bei seinen Ziffern auch im übersetzten Datum', () => {
    // Die Gegenprobe zur Kalender-Regel weiter oben: `-u-ca-gregory` ändert den
    // Kalender, nicht den Ziffernsatz.
    const text = makeTr('fa')('Dienstag, 8. September')
    expect(text).toMatch(/[۰-۹]/)
    expect(text).not.toMatch(/[0-9]/)
  })

  it('Arabisch, Urdu und Hebräisch schreiben westlich — sichtbar festgehalten', () => {
    for (const code of ['ar', 'ur', 'he'] as const) {
      expect(makeTr(code)('Dienstag, 8. September'), code).toMatch(/8/)
    }
  })
})
