import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { makeTr } from '../i18n/translate'
import type { Lang } from './types'
import { buildAbsences } from './absence'
import {
  emptyQualifications,
  istArt,
  serviceQualKey,
  TITEL_DIENSTVORTRAG,
  zuteilungsLabel,
} from './helpers'
import { setDienstwoche, itemMinutes, lacAdd, lacAddIndex } from './meeting-edit'
import {
  alleS89DerWoche,
  autoAssignMeeting,
  buildS89ForSlot,
  deriveMyTasks,
  openSlotLabels,
  weekConflicts,
} from './planning'
import { zahl, zahlWieVorlage } from './ziffern'
import type { Meeting, PartItem, Person, Section, Service, Week } from './types'

/**
 * **Eine Versammlung, die nicht auf Deutsch zusammenkommt.**
 *
 * Die Wochendaten sind dann *nicht* kanonisch deutsch. Der Import holt die
 * Wochenseite in der Sprache der Versammlung und übernimmt jeden sichtbaren
 * Text wörtlich daraus: Abschnitts-Überschriften, Titel der Programmpunkte,
 * Meta-Zeile, Datum, Wochenspanne. Kanonisch deutsch bleibt nur, was
 * **Struktur** ist und nie angezeigt wird, ohne durch einen Übersetzer zu
 * laufen: `SlotAssignment.rolle`, `bereichsKey`, `Section.kind`, die Farbe und
 * die beiden Rahmen-Überschriften ERÖFFNUNG/ABSCHLUSS.
 *
 * Genau an dieser Grenze ist hier schon mehrfach etwas kaputtgegangen, immer
 * nach demselben Muster: Eine Regel fragt den **Anzeigetext** statt die
 * Struktur, und außerhalb des Deutschen trifft sie nie — ohne Fehler, ohne
 * Hinweis, oft monatelang.
 *
 * | Befund | Regel, die den Anzeigetext fragte |
 * | --- | --- |
 * | T32 | Minuten via `/(\d+) Min\./` aus der Meta-Zeile |
 * | T61 | Bibelstudium via `title.startsWith('Versammlungsbibelstudium')` |
 * | 266acbb | LAC-Abschnitt via `label === 'UNSER LEBEN ALS CHRIST'` |
 * | hier | S-89-Zettel via `title.startsWith('Bibellesung')` und Rahmen als deutsche Wortliste |
 *
 * Die bisherigen Proben dazu prüfen je einen Befund mit je einer Sprache
 * (`lac-einfuegestelle.test.ts`: sechs Titel; `t62.test.ts`: spanische
 * Überschriften). Was fehlte, ist die Probe über die **ganze Woche** und über
 * **alle** Sprachen: Wer eine neue Regel schreibt, die einen Anzeigetext
 * abfragt, soll hier rot werden und nicht erst bei einer Versammlung in Lima.
 *
 * **Woher die Fixtures kommen.** Nicht von Hand übersetzt und kein übernommener
 * jw.org-Inhalt: Die kanonische Woche unten läuft durch `makeTr(code)` — also
 * durch das Wörterbuch, das die App ohnehin mitbringt. Was der Import in dieser
 * Sprache liefert, sieht so aus. Damit deckt die Probe jede der 34 Sprachen ab
 * und wächst mit der 35. mit.
 */

/* ---- Die kanonische Woche, wie der Import sie baut ---------------------- */

const platz = (
  name: string,
  rolle: string | undefined,
  bereichsKey: string,
): PartItem['names'][number] => ({ name, ...(rolle ? { rolle } : {}), bereichsKey })

/**
 * Kanonisch deutsche Ausgangswoche — nachgebaut nach `parse.ts`, nicht aus den
 * Demo-Daten übernommen: die tragen erfundene Titel („Demoaufgabe 3"), und
 * erfundene Titel lassen sich nicht übersetzen. Jeder Text hier steht als
 * Schlüssel im Fragment-Wörterbuch.
 */
function kanonisch(): Week {
  const mid: Meeting = {
    date: 'Dienstag, 8. September · 19:00',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'ERÖFFNUNG',
        kind: 'eroeffnung',
        farbe: 'neutral',
        items: [
          {
            title: 'Lied 1 · Gebet · Einleitende Worte',
            meta: '1 Min.',
            mins: 1,
            names: [platz('Manfred Albrecht', 'Vorsitz', 'vorsitzMid'), platz('', 'Gebet', 'gebet')],
          },
        ],
      },
      {
        label: 'SCHÄTZE AUS GOTTES WORT',
        kind: 'schaetze',
        farbe: 'petrol',
        items: [
          {
            num: 1,
            title: 'Nach geistigen Schätzen graben',
            meta: '10 Min.',
            mins: 10,
            names: [platz('', undefined, 'vortrag')],
          },
          {
            num: 3,
            title: 'Bibellesung',
            meta: '4 Min. · th Lektion 2',
            mins: 4,
            names: [platz('Niklas Feld', undefined, 'bibellesung')],
          },
        ],
      },
      {
        label: 'UNS IM DIENST VERBESSERN',
        kind: 'dienst',
        farbe: 'gold',
        items: [
          {
            num: 4,
            title: 'Gespräche beginnen',
            meta: 'Von Haus zu Haus · 3 Min. · lmd Lektion 1',
            mins: 3,
            names: [
              platz('Lena Hoffmann', undefined, 'schulung'),
              platz('A. Hoffmann', 'Gesprächspartner', 'schulungPartner'),
            ],
          },
        ],
      },
      {
        label: 'UNSER LEBEN ALS CHRIST',
        kind: 'lac',
        farbe: 'wein',
        items: [
          {
            num: 7,
            title: 'Versammlungsbibelstudium',
            meta: '30 Min. · wcg Kap. 7',
            mins: 30,
            names: [platz('', 'Leiter', 'studium'), platz('', 'Leser', 'leser')],
          },
        ],
      },
      {
        label: 'ABSCHLUSS',
        kind: 'abschluss',
        farbe: 'neutral',
        items: [
          {
            title: 'Schlussworte · Lied 143 · Gebet',
            meta: '3 Min.',
            mins: 3,
            names: [platz('', 'Gebet', 'gebet')],
          },
        ],
      },
    ],
    helpers: { mik: [{ name: '' }, { name: '' }] },
  }
  const we: Meeting = {
    // Die Wochenend-Vorlage steht **immer** kanonisch deutsch da: sie kommt aus
    // `weekendTemplate` und nicht von der Wochenseite (parse.ts). Sie muss
    // deshalb hier unübersetzt bleiben, sonst prüfte die Probe eine Woche, die
    // es so nie gibt.
    date: 'Sonntag, 13. September · 10:00',
    end: 'Ende ca. 11:45',
    sections: [
      {
        label: 'ERÖFFNUNG',
        kind: 'eroeffnung',
        farbe: 'neutral',
        items: [
          {
            title: 'Lied · Gebet',
            names: [platz('', 'Vorsitz', 'vorsitzWe'), platz('', 'Gebet', 'gebet')],
          },
        ],
      },
      {
        label: 'ÖFFENTLICHER VORTRAG',
        kind: 'vortrag',
        farbe: 'petrol',
        items: [
          {
            title: '(Vortragsthema eintragen)',
            meta: '30 Min.',
            mins: 30,
            names: [platz('', 'Gastredner', 'vortrag')],
          },
        ],
      },
      {
        label: 'WACHTTURM-STUDIUM',
        kind: 'wtStudium',
        farbe: 'wein',
        items: [
          { song: 'Lied' },
          {
            title: '(Studienartikel eintragen)',
            meta: '60 Min.',
            mins: 60,
            names: [platz('', 'Leiter', 'studium'), platz('', 'Leser', 'leser')],
          },
        ],
      },
      {
        label: 'ABSCHLUSS',
        kind: 'abschluss',
        farbe: 'neutral',
        items: [
          { title: 'Schlussworte · Lied · Gebet', names: [platz('', 'Gebet', 'gebet')] },
        ],
      },
    ],
    helpers: {},
  }
  return {
    range: '7.–13. September',
    book: 'JEREMIA 32–33',
    start: '2026-09-07',
    current: false,
    mid,
    we,
  }
}

/** Nur diese beiden Überschriften bleiben beim Import kanonisch (parse.ts). */
const RAHMEN_LABEL = new Set(['ERÖFFNUNG', 'ABSCHLUSS'])

/**
 * Alle Ziffern eines Textes in die Schrift schreiben, die `muster` verwendet.
 * jw.org setzt die Ziffern der jeweiligen Schrift („٣ دق"), und genau daran ist
 * T32 gescheitert — eine Probe mit westlichen Ziffern hätte ihn nie gefunden.
 */
function inSchrift(text: string, muster: string): string {
  return text.replace(/\p{Nd}+/gu, (folge) => zahlWieVorlage(zahl(folge), muster))
}

/**
 * Die Woche, wie der Import sie für eine Versammlung dieser Sprache liefert:
 * jeder Anzeigetext übersetzt, jede Struktur-Angabe unverändert.
 *
 * `ziffern` schreibt zusätzlich alle Zahlen in die Schrift der Vorlage —
 * `wocheIn('ar', '٠')` entspricht dem arabischen Arbeitsheft.
 */
function wocheIn(code: Lang, ziffern?: string): Week {
  const tr = makeTr(code)
  const t = (s: string): string => {
    const uebersetzt = tr(s)
    return ziffern ? inSchrift(uebersetzt, ziffern) : uebersetzt
  }
  const uebersetzeMeeting = (meeting: Meeting, kanonischeVorlage: boolean): Meeting => ({
    ...meeting,
    date: kanonischeVorlage ? meeting.date : t(meeting.date),
    end: kanonischeVorlage ? meeting.end : t(meeting.end),
    sections: meeting.sections.map(
      (s): Section => ({
        ...s,
        label: kanonischeVorlage || RAHMEN_LABEL.has(s.label) ? s.label : t(s.label),
        items: s.items.map((item) =>
          'song' in item
            ? item
            : {
                ...item,
                title: kanonischeVorlage ? item.title : t(item.title),
                ...(item.meta !== undefined
                  ? { meta: kanonischeVorlage ? item.meta : t(item.meta) }
                  : {}),
                // Zuteilungen und Bereiche bleiben, wie sie sind — sie sind
                // Struktur, kein Anzeigetext.
                names: item.names.map((n) => ({ ...n })),
              },
        ),
      }),
    ),
  })
  const woche = kanonisch()
  return {
    ...woche,
    lang: code,
    range: t(woche.range),
    book: woche.book, // Buchname übersetzt der Import mit; hier nicht geprüft
    mid: uebersetzeMeeting(woche.mid, false),
    we: uebersetzeMeeting(woche.we, true),
  }
}

/** Alle Sprachen außer Deutsch — Deutsch ist der Normalfall und ohnehin geprüft. */
const FREMD = APP_LANGS.map((l) => l.code).filter((c) => c !== 'de')

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Index eines Abschnitts über seine **Art**, nie über seinen Namen. */
const artIndex = (meeting: Meeting, art: Parameters<typeof istArt>[1]): number =>
  meeting.sections.findIndex((s) => istArt(s, art))

/* ---- Die Probe, dass die Fixtures überhaupt fremdsprachig sind ----------- */

describe('Die Fixtures sind wirklich übersetzt', () => {
  /*
   * Ohne diese Prüfung wäre die ganze Datei wertlos: Läuft `makeTr` für eine
   * Sprache ins Leere, bliebe die Woche deutsch — und alle Proben darunter
   * blieben grün, ohne je etwas Fremdsprachiges gesehen zu haben. Genau diese
   * Sorte stiller Selbsttäuschung („der Test lief, aber über nichts") ist der
   * Grund, warum die Übersetzungslücken hier so lange unentdeckt blieben.
   */
  it.each(FREMD)('%s: Überschriften und Titel stehen nicht mehr deutsch da', (code) => {
    const w = wocheIn(code)
    const schaetze = w.mid.sections[artIndex(w.mid, 'schaetze')]!
    const dienst = w.mid.sections[artIndex(w.mid, 'dienst')]!
    expect(schaetze.label, code).not.toBe('SCHÄTZE AUS GOTTES WORT')
    expect(dienst.label, code).not.toBe('UNS IM DIENST VERBESSERN')
    expect((schaetze.items[1] as PartItem).title, code).not.toBe('Bibellesung')
    expect((dienst.items[0] as PartItem).title, code).not.toBe('Gespräche beginnen')
  })

  it.each(FREMD)('%s: Rollen und Bereiche bleiben kanonisch deutsch', (code) => {
    const w = wocheIn(code)
    const lac = w.mid.sections[artIndex(w.mid, 'lac')]!
    const vbs = lac.items[0] as PartItem
    expect(vbs.names.map((n) => n.rolle), code).toEqual(['Leiter', 'Leser'])
    expect(vbs.names.map((n) => n.bereichsKey), code).toEqual(['studium', 'leser'])
  })
})

/* ---- S-89: der Zettel des Schülers --------------------------------------- */

describe('S-89-Zettel in der Sprache der Versammlung', () => {
  /*
   * **Der Befund.** `buildS89ForSlot` erkannte die Bibellesung an
   * `item.title.startsWith('Bibellesung')`. Bei einer fremdsprachigen
   * Versammlung steht dort „Lectura de la Biblia" — der Schüler bekam **keinen
   * Zettel**, und niemand sah einen Fehler. Erkannt wird sie jetzt am Bereich
   * (`bereichsKey: 'bibellesung'`), den der Import in jeder Sprache vergibt.
   */
  it.each(FREMD)('%s: die Bibellesung bekommt ihren Zettel', (code) => {
    const w = wocheIn(code)
    const si = artIndex(w.mid, 'schaetze')
    const zettel = buildS89ForSlot([w], {
      kind: 'part',
      wi: 0,
      tab: 'mid',
      si,
      ii: 1,
      ni: 0,
      priv: 'bibellesung',
      groups: false,
      label: '',
    })
    expect(zettel, `${code}: kein S-89-Zettel für die Bibellesung`).not.toBeNull()
    expect(zettel?.name, code).toBe('Niklas Feld')
    // Der Schulungspunkt muss ankommen — und zwar so, wie er im Arbeitsheft
    // dieser Sprache steht. Sieben Sprachen übersetzen das Publikationskürzel
    // mit („th" → 教励), weshalb er nicht am Kürzel erkannt werden darf.
    expect(zettel?.point, `${code}: der Schulungspunkt fehlt`).toBe(
      makeTr(code)('th Lektion 2'),
    )
  })

  /*
   * **Der zweite Befund derselben Zeile.** Der Rahmen wurde aus einer Liste
   * dreier deutscher Wendungen gefischt. In jeder anderen Sprache blieb das
   * Feld leer: Auf dem Zettel stand dann nicht, ob der Schüler von Haus zu Haus
   * oder informell vorspielen soll — die halbe Aufgabenstellung.
   */
  it.each(FREMD)('%s: der Rahmen des Schülerteils steht auf dem Zettel', (code) => {
    const w = wocheIn(code)
    const si = artIndex(w.mid, 'dienst')
    const zettel = buildS89ForSlot([w], {
      kind: 'part',
      wi: 0,
      tab: 'mid',
      si,
      ii: 0,
      ni: 0,
      priv: 'schulung',
      groups: false,
      label: '',
    })
    const rahmen = makeTr(code)('Von Haus zu Haus')
    expect(zettel?.type, `${code}: Rahmen fehlt auf dem Zettel`).toBe(
      `${makeTr(code)('Gespräche beginnen')} · ${rahmen}`,
    )
    expect(zettel?.partner, code).toBe('A. Hoffmann')
  })

  it.each(FREMD)('%s: ein Nicht-Schulungsplatz bekommt weiterhin keinen Zettel', (code) => {
    // Die Erkennung darf nicht ins Gegenteil kippen: Vorsitz, Gebet, Leiter und
    // Leser sind keine Schulungsaufgaben und bekommen nie ein S-89.
    const w = wocheIn(code)
    const si = artIndex(w.mid, 'lac')
    const lac = w.mid.sections[si]!.items[0] as PartItem
    lac.names[0]!.name = 'Thomas Lindner'
    expect(
      buildS89ForSlot([w], {
        kind: 'part', wi: 0, tab: 'mid', si, ii: 0, ni: 0,
        priv: 'studium', groups: false, label: '',
      }),
      code,
    ).toBeNull()
  })

  it('ohne Rahmen bleibt der Titel allein stehen', () => {
    // Die Schätze-Punkte haben keinen Rahmen — die Formregel („das Meta-Stück
    // ohne Ziffer") darf dort nichts erfinden.
    const w = wocheIn('es')
    const si = artIndex(w.mid, 'schaetze')
    const zettel = buildS89ForSlot([w], {
      kind: 'part', wi: 0, tab: 'mid', si, ii: 1, ni: 0,
      priv: 'bibellesung', groups: false, label: '',
    })
    expect(zettel?.type).toBe('Lectura de la Biblia')
  })
})

/* ---- Ziffern fremder Schriften in der ganzen Woche ----------------------- */

describe('Arbeitsheft mit eigenen Ziffern (ar/fa/hi)', () => {
  /*
   * T32 in seiner ganzen Breite: Die Wochenseite schreibt „٣ دق"; darauf liefert
   * `Number()` NaN und `/\d/` trifft nicht. Geprüft wird deshalb nicht nur der
   * Ziffernleser (das tut `minuten.test.ts`), sondern die **Woche als Ganzes**
   * — mit Zahlen, die in keiner Zeile westlich geschrieben sind.
   */
  const SCHRIFTEN: Array<[string, string]> = [
    ['arabisch-indisch', '٠'],
    ['erweitert arabisch-indisch (fa/ur)', '۰'],
    ['Devanagari', '०'],
    ['vollbreit (zh/ja)', '０'],
  ]

  it.each(SCHRIFTEN)('%s: die Minuten bleiben lesbar', (_name, null_) => {
    const w = wocheIn('ar', null_)
    for (const section of w.mid.sections) {
      for (const item of section.items) {
        if ('song' in item) continue
        // `mins` trägt die Zahl seit T32 selbst; `itemMinutes` muss sie auch
        // ohne das Feld aus der Meta-Zeile zurückbekommen (Altbestand).
        const ohneFeld: PartItem = { ...item, mins: undefined }
        expect(itemMinutes(ohneFeld), `${null_} · ${item.meta}`).toBe(item.mins)
      }
    }
  })

  it.each(SCHRIFTEN)('%s: der Rahmen wird trotzdem gefunden', (_name, null_) => {
    // Die Formregel für den Rahmen lautet „das Meta-Stück ohne Ziffer". Kennt
    // sie nur `\d`, hält sie „٣ دق" für ziffernlos und schreibt die Dauer als
    // Rahmen auf den Zettel.
    const w = wocheIn('ar', null_)
    const si = artIndex(w.mid, 'dienst')
    const zettel = buildS89ForSlot([w], {
      kind: 'part', wi: 0, tab: 'mid', si, ii: 0, ni: 0,
      priv: 'schulung', groups: false, label: '',
    })
    expect(zettel?.type).toBe(
      `${makeTr('ar')('Gespräche beginnen')} · ${makeTr('ar')('Von Haus zu Haus')}`,
    )
  })
})

/* ---- Abschnitts-Art, Einfügestelle, Dienstwoche -------------------------- */

describe('Die Struktur trägt, nicht die Überschrift', () => {
  it.each(FREMD)('%s: jeder Abschnitt wird an seiner Art erkannt', (code) => {
    const w = wocheIn(code)
    const arten = w.mid.sections.map((s) => s.kind)
    expect(arten, code).toEqual(['eroeffnung', 'schaetze', 'dienst', 'lac', 'abschluss'])
    expect(artIndex(w.mid, 'lac'), code).toBe(3)
  })

  it.each(FREMD)('%s: der Kreisaufseher-Besuch baut das Programm um', (code) => {
    // 266acbb: `LABEL_LAC` traf bei fremder Überschrift nie, der Dienstvortrag
    // wurde stumm nicht eingesetzt. Hier für alle Sprachen statt nur Spanisch —
    // und mit einer Woche, deren LAC-Titel ebenfalls übersetzt ist.
    const an = setDienstwoche([wocheIn(code)], 0, true)
    const titel = an[0]!.mid.sections.flatMap((s) =>
      s.items.map((i) => ('title' in i ? i.title : '')),
    )
    expect(titel, `${code}: kein Dienstvortrag eingesetzt`).toContain(TITEL_DIENSTVORTRAG)
    expect(titel, code).not.toContain(makeTr(code)('Versammlungsbibelstudium'))
  })

  it.each(FREMD)('%s: das Wachtturm-Studium wird am Wochenende gekürzt', (code) => {
    // Der Wochenend-Teil derselben Regel. Er läuft über `Section.kind` und die
    // Wochenend-Vorlage, die kanonisch deutsch bleibt — trotzdem gehört er
    // hierher: fällt jemand auf die Überschrift zurück, fällt es sonst nicht auf.
    const an = setDienstwoche([wocheIn(code)], 0, true)
    const wt = an[0]!.we.sections[an[0]!.we.sections.findIndex((s) => istArt(s, 'wtStudium'))]!
    const studium = wt.items.find((i) => !('song' in i) && i.mins === 30)
    expect(studium, `${code}: das Studium wurde nicht gekürzt`).toBeDefined()
  })

  it.each(FREMD)('%s: ein eigener Punkt landet vor dem Bibelstudium', (code) => {
    // T61 — hier über die ganze Woche und über alle Sprachen statt über sechs
    // von Hand eingetragene Titel.
    const w = wocheIn(code)
    const si = artIndex(w.mid, 'lac')
    const items = w.mid.sections[si]!.items
    expect(lacAddIndex(items), code).toBe(0)
    const next = lacAdd([w], 0, 'mid', si, 'Örtliche Bedürfnisse')
    const titel = next[0]!.mid.sections[si]!.items.map((i) =>
      'song' in i ? i.song : i.title,
    )
    expect(titel[0], code).toBe('Örtliche Bedürfnisse')
  })
})

/* ---- Beschriftungen: Titel und Rolle kommen aus zwei Sprachen ------------ */

describe('Beschriftung einer Zuteilung', () => {
  it.each(FREMD)('%s: der Titel bleibt fremdsprachig, die Rolle deutsch-kanonisch', (code) => {
    const w = wocheIn(code)
    const aufgaben = deriveMyTasks([w], DIENSTE, 'Lena Hoffmann', {})
    expect(aufgaben, code).toHaveLength(1)
    // `title` geht in die Anzeige durch `tpw` (Programmsprache), `rolle` durch
    // `tu` (Lesersprache) — zusammengesetzt wird erst in `aufgabenLabel`.
    expect(aufgaben[0]!.title, code).toBe(makeTr(code)('Gespräche beginnen'))
    expect(aufgaben[0]!.rolle ?? '', code).toBe('')
  })

  it.each(FREMD)('%s: im Block-Abschnitt trägt allein die Rolle', (code) => {
    // ERÖFFNUNG/ABSCHLUSS behalten ihren kanonischen Namen — sonst stünde beim
    // Vorsitzenden „Canción 1 · Oración · Palabras de introducción · Vorsitz"
    // statt schlicht seiner Rolle.
    const w = wocheIn(code)
    const eroeffnung = w.mid.sections[artIndex(w.mid, 'eroeffnung')]!
    const item = eroeffnung.items[0] as PartItem
    expect(zuteilungsLabel(eroeffnung.label, item.title, 'Vorsitz'), code).toBe('Vorsitz')
  })

  it.each(FREMD)('%s: offene Plätze nennen Titel und Rolle getrennt', (code) => {
    const w = wocheIn(code)
    const offen = openSlotLabels(w.mid, DIENSTE)
    const vbs = offen.find((o) => o.rolle === 'Leiter')
    expect(vbs, `${code}: der Leiter-Platz fehlt in der Liste`).toBeDefined()
    expect(vbs!.lang, code).toBe('p') // Titel → Programmsprache
    expect(vbs!.text, code).toBe(makeTr(code)('Versammlungsbibelstudium'))
    // Das Gebet steht in der Eröffnung — dort trägt die Rolle allein, und die
    // gehört in die Sprache des Lesers.
    const gebet = offen.find((o) => o.text === 'Gebet')
    expect(gebet?.lang, code).toBe('u')
  })
})

/* ---- Konflikte ----------------------------------------------------------- */

describe('Konflikte finden auch fremdsprachige Wochen', () => {
  const NIKLAS: Person = {
    id: 'p-niklas', fn: 'Niklas', ln: 'Feld', role: 'verkuendiger',
    tel: '', mail: '', priv: emptyQualifications(),
  }

  it.each(FREMD)('%s: Programmpunkt und Hilfsdienst am selben Tag fallen auf', (code) => {
    const w = wocheIn(code)
    // Niklas hat die Bibellesung; jetzt bekommt er am selben Abend auch noch
    // ein Mikrofon. Das ist die Regel des Betreibers — und sie darf nicht davon
    // abhängen, in welcher Sprache der Programmpunkt überschrieben ist.
    w.mid.helpers.mik = [{ name: 'Niklas Feld', pid: NIKLAS.id }, { name: '' }]
    for (const section of w.mid.sections) {
      for (const item of section.items) {
        if (!('song' in item)) for (const slot of item.names) {
          if (slot.name === 'Niklas Feld') slot.pid = NIKLAS.id
        }
      }
    }
    const konflikte = weekConflicts([w], 0, [NIKLAS], DIENSTE, 'mid')
    expect(
      konflikte.map((k) => k.kind),
      `${code}: die Doppelbelegung blieb unbemerkt`,
    ).toContain('helperTask')
  })

  it.each(FREMD)('%s: eine abwesende Person mit Zuteilung fällt auf', (code) => {
    const w = wocheIn(code)
    const schaetze = w.mid.sections[artIndex(w.mid, 'schaetze')]!.items[1] as PartItem
    schaetze.names[0]!.pid = NIKLAS.id
    const abwesend = buildAbsences(
      [{ id: 'a1', personId: NIKLAS.id, userId: null, from: '2026-09-07', to: '2026-09-13', reason: '' }],
      [w],
      new Date(2026, 8, 7, 12),
      'Di 19:00 · So 10:00',
    )
    const konflikte = weekConflicts([w], 0, [NIKLAS], DIENSTE, 'mid', abwesend)
    expect(konflikte.map((k) => k.kind), code).toContain('absent')
  })
})

/* ---- Der Druckbogen und die Auto-Zuteilung ------------------------------- */

describe('S-89-Bogen der ganzen Woche', () => {
  /*
   * `alleS89DerWoche` geht die Plätze durch und lässt `buildS89ForSlot`
   * entscheiden, welche einen Zettel bekommen. Genau der Befund aus dieser
   * Datei — die Bibellesung am deutschen Titel erkannt — hätte damit **den
   * halben Bogen** gekostet: Der Planer druckt sechs Zettel je Blatt und merkt
   * an einem fehlenden nichts, weil er nicht weiß, wie viele es sein müssten.
   */
  it.each(FREMD)('%s: Bibellesung und Schülerteil stehen beide auf dem Bogen', (code) => {
    const w = wocheIn(code)
    const bogen = alleS89DerWoche([w], 0, 'Di 19:00 · So 10:00', false)
    const arten = bogen.map((z) => z.type)
    expect(arten, `${code}: ${arten.join(' | ')}`).toHaveLength(2)
    expect(arten[0], code).toBe(makeTr(code)('Bibellesung'))
    expect(arten[1], code).toBe(
      `${makeTr(code)('Gespräche beginnen')} · ${makeTr(code)('Von Haus zu Haus')}`,
    )
  })

  it.each(FREMD)('%s: mit Gesprächspartner zwei Zettel für denselben Punkt', (code) => {
    const bogen = alleS89DerWoche([wocheIn(code)], 0, '', true)
    expect(bogen, code).toHaveLength(3) // Bibellesung + Schüler + Partner
  })

  it('auf Deutsch sind es dieselben Zettel — die Sprache ändert nur die Worte', () => {
    // Die Gegenprobe: Käme fremdsprachig ein Zettel weniger heraus, wäre der
    // Unterschied genau der Fehler, den diese Datei sucht.
    const deutsch = alleS89DerWoche([kanonisch()], 0, '', false)
    for (const code of FREMD) {
      expect(alleS89DerWoche([wocheIn(code)], 0, '', false), code).toHaveLength(deutsch.length)
    }
  })
})

describe('Auto-Zuteilung arbeitet auf jeder Sprachfassung gleich', () => {
  const KANDIDATEN: Person[] = [
    { id: 'p-1', fn: 'Aa', ln: 'Bb', role: 'aeltester', tel: '', mail: '', priv: { ...emptyQualifications(), vorsitzMid: true, gebet: true, studium: true, leser: true, bibellesung: true, schulung: true } },
    { id: 'p-2', fn: 'Cc', ln: 'Dd', role: 'aeltester', tel: '', mail: '', priv: { ...emptyQualifications(), vorsitzMid: true, gebet: true, studium: true, leser: true, bibellesung: true, schulung: true } },
    { id: 'p-3', fn: 'Ee', ln: 'Ff', role: 'dienstamtgehilfe', tel: '', mail: '', priv: { ...emptyQualifications(), gebet: true, leser: true, [serviceQualKey('mik')]: true } },
  ]

  /*
   * Die Auswahl läuft über Bereiche (`bereichsKey`) und Rollen — beides
   * kanonisch deutsch, beides unabhängig von der Sprache der Überschriften.
   * Kommt in einer Sprache eine andere Zahl heraus, entscheidet irgendwo doch
   * ein Anzeigetext mit.
   */
  it('jede Sprache besetzt gleich viele Plätze wie die deutsche Fassung', () => {
    const deutsch = autoAssignMeeting([kanonisch()], 0, 'mid', KANDIDATEN, DIENSTE)
    expect(deutsch.count, 'die deutsche Fassung besetzt gar nichts').toBeGreaterThan(2)
    for (const code of FREMD) {
      const eigen = autoAssignMeeting([wocheIn(code)], 0, 'mid', KANDIDATEN, DIENSTE)
      expect(eigen.count, `${code}: ${eigen.count} statt ${deutsch.count}`).toBe(deutsch.count)
      expect(eigen.unfilled, code).toBe(deutsch.unfilled)
    }
  })
})
