import { describe, expect, it } from 'vitest'
import { LABEL_WT_STUDIUM } from './constants'
import {
  emptyQualifications,
  isSong,
  LABEL_DIENSTVORTRAG,
  isGuestRole,
  partWorkload,
  ROLE_CIRCUIT,
  TITEL_DIENSTVORTRAG,
  TITEL_SCHLUSSVORTRAG,
} from './helpers'
import { itemMinutes, setDienstwoche, setPartThema, themaVon } from './meeting-edit'
import { localizedWeek } from './localize'
import { countOpenSlots, deriveMyTasks } from './planning'
import type { Meeting, PartItem, Person, Week } from './types'

/**
 * T62 — die Woche, in der der Kreisaufseher kommt.
 *
 * Unter der Woche wird das Versammlungsbibelstudium zum **Dienstvortrag**
 * (30 Min., ein Freitext-Platz, kein Leser). Am Wochenende wird das
 * Wachtturm-Studium auf **30 Minuten verkürzt** und verliert seinen Leser — die
 * Absätze werden dann nicht gelesen, es werden nur die Fragen des Artikels
 * besprochen —, und dahinter kommt ein **Schlussvortrag**, ebenfalls 30 Minuten.
 *
 * Der Ablauf wird dabei **in den Daten umgebaut**, nicht bei der Anzeige
 * abgeleitet: sonst müssten alle Auswerter und die Edge Functions dieselbe
 * Ableitung ein zweites Mal enthalten. Was ersetzt wurde, bleibt in
 * `week.coData` erhalten — samt Zuteilungen.
 */

const ZEITEN = 'Di 19:00 · So 10:00'

const person = (id: string, dn: string): Person => ({
  id, fn: dn.split(' ')[0] ?? '', ln: dn.split(' ')[1] ?? '',
  dn, role: 'aeltester', tel: '', mail: '', priv: emptyQualifications(),
})

const LEITER = person('p1', 'A. Leiter')
const LESER = person('p2', 'B. Leser')

/** Woche wie aus dem Import: Bibelstudium unter der Woche, WT-Studium am Wochenende. */
function makeWeek(): Week {
  const mid: Meeting = {
    date: '7.–13. September',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [
          { iid: 'a1', num: 6, title: 'Bedürfnisse der Versammlung', meta: '15 Min.', mins: 15, names: [{ name: '', bereichsKey: 'studium' }] },
          {
            iid: 'a2',
            num: 7,
            title: 'Versammlungsbibelstudium',
            meta: '30 Min. · wcg Kap. 7',
            mins: 30,
            names: [
              { name: 'A. Leiter', pid: 'p1', rolle: 'Leiter', bereichsKey: 'studium' },
              { name: 'B. Leser', pid: 'p2', rolle: 'Leser', bereichsKey: 'leser' },
            ],
          },
        ],
      },
    ],
    helpers: {},
  }
  const we: Meeting = {
    date: '7.–13. September',
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ iid: 'b1', title: '(Vortragsthema eintragen)', meta: '30 Min.', mins: 30, names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] },
      {
        label: 'WACHTTURM-STUDIUM',
        farbe: 'wein',
        items: [
          { song: 'Lied 20' },
          {
            iid: 'b2',
            title: 'Demo-Studienartikel 6',
            meta: 'Studienartikel 28 · 60 Min.',
            mins: 60,
            names: [
              { name: 'A. Leiter', pid: 'p1', rolle: 'Leiter', bereichsKey: 'studium' },
              { name: 'B. Leser', pid: 'p2', rolle: 'Leser', bereichsKey: 'leser' },
            ],
          },
        ],
      },
    ],
    helpers: {},
  }
  return { range: '7.–13. September', book: '', start: '2026-09-07', current: false, mid, we }
}

/**
 * Element an einer Position — mit Zusicherung statt Nicht-Null-Zusatz.
 *
 * Bricht die Struktur, fällt der Test mit einer Ansage statt mit einem
 * `undefined`-Vergleich irgendwo weiter unten. Zugleich hält er
 * `noUncheckedIndexedAccess` ein: die Sperrklinke aus T42 gilt auch für neue
 * Testdateien, und ein Dutzend Nicht-Null-Zusätze wäre genau die Entwertung,
 * gegen die sie da ist.
 */
function bei<T>(arr: readonly T[] | undefined, i: number): T {
  const x = arr?.[i]
  if (x === undefined) throw new Error(`kein Element an Position ${i}`)
  return x
}

/** Die eine Woche der Fixture. */
const eine = (ws: Week[]): Week => bei(ws, 0)

const lac = (w: Week) => bei(w.mid.sections, 0).items as PartItem[]
const wt = (w: Week) => bei(w.we.sections, 1).items
const wtParts = (w: Week) => wt(w).filter((i) => !('song' in i)) as PartItem[]

describe('Unter der Woche: Dienstvortrag statt Bibelstudium', () => {
  const an = () => setDienstwoche([makeWeek()], 0, true)

  it('ersetzt den Punkt und behält seine Kennung', () => {
    // Die Kennung bleibt, weil der Platz im Programm derselbe ist — nur sein
    // Inhalt wechselt. Bestätigungen zeigen dadurch nicht ins Leere (T37).
    const punkt = bei(lac(eine(an())), 1)
    expect(punkt.title).toBe(TITEL_DIENSTVORTRAG)
    expect(punkt.iid).toBe('a2')
    expect(itemMinutes(punkt)).toBe(30)
  })

  it('hat genau einen Platz — Freitext, kein Leser', () => {
    const punkt = bei(lac(eine(an())), 1)
    expect(punkt.names).toEqual([{ name: '', rolle: ROLE_CIRCUIT, bereichsKey: 'vortrag' }])
    expect(punkt.names.some((n) => n.bereichsKey === 'leser')).toBe(false)
  })

  it('der Kreisaufseher zählt nirgends mit', () => {
    // Wie der Gastredner: von außen. Kein Bestätigungs-Flow, keine Erinnerung,
    // keine Anrechnung, keine Auto-Zuteilung — all das hängt an isGuestRole.
    expect(isGuestRole(ROLE_CIRCUIT)).toBe(true)
  })

  it('das Ende der Zusammenkunft verschiebt sich nicht', () => {
    expect(eine(an()).mid.end).toBe('Ende ca. 20:45') // 30 gegen 30
  })
})

describe('Wochenende: verkürztes Studium und Schlussvortrag', () => {
  const an = () => setDienstwoche([makeWeek()], 0, true)

  it('kürzt das Wachtturm-Studium auf 30 Minuten', () => {
    const stud = bei(wtParts(eine(an())), 0)
    expect(itemMinutes(stud)).toBe(30)
    expect(stud.meta).toBe('Studienartikel 28 · 30 Min.')
  })

  it('nimmt dem Studium den Leser, lässt den Leiter', () => {
    // Die Absätze werden nicht gelesen — es werden nur die Fragen besprochen.
    const stud = bei(wtParts(eine(an())), 0)
    expect(stud.names.map((n) => n.rolle)).toEqual(['Leiter'])
    expect(bei(stud.names, 0).name).toBe('A. Leiter') // Zuteilung bleibt
  })

  /*
    Seit T64 steht der Schlussvortrag in einer **eigenen Sektion**, nicht mehr
    unter der Überschrift des Wachtturm-Studiums. Dort war er ein zweiter Punkt,
    der keiner ist — der Betreiber hat es am 8.8.2026 beanstandet.
  */
  it('setzt den Schlussvortrag in eine eigene Sektion hinter das Studium', () => {
    expect(wtParts(eine(an()))).toHaveLength(1) // das Studium ist wieder allein

    const sections = eine(an()).we.sections
    const si = sections.findIndex((s) => s.label === LABEL_DIENSTVORTRAG)
    const wtIdx = sections.findIndex((s) => s.label === LABEL_WT_STUDIUM)
    expect(si).toBe(wtIdx + 1) // direkt dahinter, vor dem ABSCHLUSS
    expect(bei(sections, si).farbe).toBe('gold')

    const vortrag = bei(sections, si).items.filter((x) => !isSong(x)) as PartItem[]
    expect(vortrag).toHaveLength(1)
    expect(bei(vortrag, 0).title).toBe(TITEL_SCHLUSSVORTRAG)
    expect(itemMinutes(bei(vortrag, 0))).toBe(30)
    expect(bei(vortrag, 0).names).toEqual([{ name: '', rolle: ROLE_CIRCUIT, bereichsKey: 'vortrag' }])
    expect(bei(vortrag, 0).iid).toBeTruthy()
  })

  it('und nimmt die Sektion beim Zurücknehmen wieder mit', () => {
    const zurueck = setDienstwoche(an(), 0, false)
    expect(eine(zurueck).we.sections.some((s) => s.label === LABEL_DIENSTVORTRAG)).toBe(false)
    // Und keine leere Hülle: die Sektionen sind wieder so viele wie zu Beginn.
    expect(eine(zurueck).we.sections).toHaveLength(makeWeek().we.sections.length)
  })

  it('das Ende verschiebt sich nicht — minus 30, plus 30', () => {
    expect(eine(an()).we.end).toBe('Ende ca. 11:45')
  })

  it('der Leser verliert seine Aufgabe, der Leiter behält sie', () => {
    const vorher = [makeWeek()]
    expect(deriveMyTasks(vorher, [], 'B. Leser', {}, ZEITEN, 'p2')).toHaveLength(2)
    const nachher = an()
    expect(deriveMyTasks(nachher, [], 'B. Leser', {}, ZEITEN, 'p2')).toHaveLength(0)
    expect(deriveMyTasks(nachher, [], 'A. Leiter', {}, ZEITEN, 'p1')).toHaveLength(1)
  })

  it('die beiden neuen Plätze zählen als offen', () => {
    // Sie sind zu besetzen wie jeder andere — nur eben von Hand.
    expect(countOpenSlots(eine(an()).we, [])).toBe(countOpenSlots(makeWeek().we, []) + 1)
  })
})

describe('Zurücknehmen stellt alles wieder her', () => {
  it('Programm und Zuteilungen sind wieder wie vorher', () => {
    // Der Kreisaufseher wird angekündigt und sagt ab — dann darf niemand seine
    // Einteilung verloren haben.
    const vorher = makeWeek()
    const zurueck = setDienstwoche(setDienstwoche([vorher], 0, true), 0, false)
    expect(eine(zurueck).co).toBe(false)
    expect(eine(zurueck).coData).toBeUndefined()
    expect(eine(zurueck).mid).toEqual(vorher.mid)
    expect(eine(zurueck).we).toEqual(vorher.we)
  })

  it('der Leser hat seine beiden Aufgaben wieder', () => {
    const zurueck = setDienstwoche(setDienstwoche([makeWeek()], 0, true), 0, false)
    expect(deriveMyTasks(zurueck, [], 'B. Leser', {}, ZEITEN, 'p2')).toHaveLength(2)
    expect(partWorkload(zurueck, LESER)).toBe(2)
    expect(partWorkload(zurueck, LEITER)).toBe(2)
  })

  it('zweimal dasselbe zu setzen ändert nichts', () => {
    const weeks = [makeWeek()]
    const an = setDienstwoche(weeks, 0, true)
    expect(setDienstwoche(an, 0, true)).toBe(an)
    expect(setDienstwoche(weeks, 0, false)).toBe(weeks)
  })

  it('funktioniert auch ohne vorhandene Kennungen', () => {
    // Demo- und Vorlagenwochen laufen nicht durch die Lade-Migration (T37).
    // Ohne Kennung fände das Zurücknehmen den Punkt nicht wieder.
    const ohne = makeWeek()
    for (const it of lac(ohne)) delete it.iid
    for (const it of wtParts(ohne)) delete it.iid
    const zurueck = setDienstwoche(setDienstwoche([ohne], 0, true), 0, false)
    expect(bei(lac(eine(zurueck)), 1).title).toBe('Versammlungsbibelstudium')
    expect(wtParts(eine(zurueck))).toHaveLength(1)
    expect(itemMinutes(bei(wtParts(eine(zurueck)), 0))).toBe(60)
  })
})

describe('Das Thema steht hinter dem Begriff', () => {
  it('setzt und liest es zurück', () => {
    const an = setDienstwoche([makeWeek()], 0, true)
    const mit = setPartThema(an, 0, 'mid', 0, 1, TITEL_DIENSTVORTRAG, 'Bleibt wachsam')
    const titel = bei(lac(eine(mit)), 1).title
    expect(titel).toBe('Dienstvortrag · Bleibt wachsam')
    expect(themaVon(titel, TITEL_DIENSTVORTRAG)).toBe('Bleibt wachsam')
  })

  it('leeres Thema lässt nur den Begriff stehen', () => {
    const an = setDienstwoche([makeWeek()], 0, true)
    const mit = setPartThema(an, 0, 'mid', 0, 1, TITEL_DIENSTVORTRAG, 'Etwas')
    const ohne = setPartThema(mit, 0, 'mid', 0, 1, TITEL_DIENSTVORTRAG, '   ')
    expect(bei(lac(eine(ohne)), 1).title).toBe(TITEL_DIENSTVORTRAG)
    expect(themaVon(TITEL_DIENSTVORTRAG, TITEL_DIENSTVORTRAG)).toBe('')
  })
})

describe('Die Sprachvarianten laufen mit', () => {
  /** Woche mit strukturgleicher englischer Variante. */
  function mitVariante(): Week {
    const w = makeWeek()
    const en = structuredClone(w)
    // Nur die Texte unterscheiden sich — die Struktur bleibt gleich, sonst
    // verweigert `localizedWeek` die Übernahme von vornherein.
    const enLac = bei(en.mid.sections, 0).items
    const enWt = bei(en.we.sections, 1).items
    enLac[1] = { ...(bei(enLac, 1) as PartItem), title: 'Congregation Bible Study', names: [] }
    enWt[1] = { ...(bei(enWt, 1) as PartItem), title: '“Serve Jehovah With Joy”', names: [] }
    w.alt = { en }
    return w
  }

  /*
    Geprüft wird am **englischen Titel des Studienartikels**, nicht an der
    Struktur: `localizedWeek` vergleicht Abschnitts- und Punktzahl und liefert
    bei Abweichung stillschweigend die kanonische Woche zurück. Eine Prüfung
    auf Länge oder auf den kanonischen Titel bestünde deshalb in beiden Fällen —
    die erste Fassung dieses Tests tat genau das und merkte nicht, dass die
    Variante gar nicht mitlief.
  */
  const EN_STUDIUM = '“Serve Jehovah With Joy”'

  it('die Variante läuft mit — sonst fiele die Anzeige aufs Deutsche zurück', () => {
    const an = setDienstwoche([mitVariante()], 0, true)
    const en = localizedWeek(eine(an), 'en')
    expect((bei(bei(en.we.sections, 1).items, 1) as PartItem).title).toBe(EN_STUDIUM)
    expect(bei(en.we.sections, 1).items).toHaveLength(2) // Lied + Studium — der Vortrag steht jetzt daneben
    // Die eigene Sektion muss die Variante mitbekommen haben: fehlte sie dort,
    // wäre die Woche nicht mehr strukturgleich und `localizedWeek` fiele für
    // **alles** aufs Deutsche zurück — auch für den Studienartikel oben.
    const si = en.we.sections.findIndex((s) => s.label === LABEL_DIENSTVORTRAG)
    expect(si).toBe(2)
    expect((bei(bei(en.we.sections, si).items, 0) as PartItem).title).toBe(TITEL_SCHLUSSVORTRAG)
    expect((bei(bei(en.mid.sections, 0).items, 1) as PartItem).title).toBe(TITEL_DIENSTVORTRAG)
  })

  it('und beim Zurücknehmen wieder', () => {
    const zurueck = setDienstwoche(setDienstwoche([mitVariante()], 0, true), 0, false)
    const en = localizedWeek(eine(zurueck), 'en')
    expect((bei(bei(en.we.sections, 1).items, 1) as PartItem).title).toBe(EN_STUDIUM)
    expect(bei(en.we.sections, 1).items).toHaveLength(2)
    // Der englische Titel des Bibelstudiums ist wieder da — die Variante hat
    // den Umbau also vollständig zurückgenommen, nicht nur die kanonische Woche.
    expect((bei(bei(en.mid.sections, 0).items, 1) as PartItem).title).toBe('Congregation Bible Study')
  })
})

describe('Randfälle, die im Betrieb vorkommen', () => {
  it('das gelöschte Bibelstudium kommt trotzdem zurück', () => {
    // Der Planer schaltet ein, löscht den Dienstvortrag über das ✕ und nimmt
    // die Woche dann zurück. Das Bibelstudium samt Zuteilungen deshalb zu
    // verlieren wäre die böseste Überraschung von allen.
    const an = setDienstwoche([makeWeek()], 0, true)
    lac(eine(an)).splice(1, 1) // ✕ auf dem Dienstvortrag
    const zurueck = setDienstwoche(an, 0, false)
    const titel = lac(eine(zurueck)).map((i) => i.title)
    expect(titel).toContain('Versammlungsbibelstudium')
    expect(deriveMyTasks(zurueck, [], 'B. Leser', {}, ZEITEN, 'p2')).toHaveLength(2)
  })

  it('ohne mins bleibt die Meta-Zeile unangetastet — geraten wird nicht', () => {
    // Beim Wachtturm-Studium steht zuerst die Nummer des Studienartikels.
    // Ohne verlässliche Dauer würde ein Ersetzen sie treffen: aus
    // „Studienartikel 28 · 60 Min." wurde im Browser „Studienartikel 30 · 60 Min.".
    const ohneMins = makeWeek()
    delete bei(wtParts(ohneMins), 0).mins
    const an = setDienstwoche([ohneMins], 0, true)
    const stud = bei(wtParts(eine(an)), 0)
    expect(stud.meta).toBe('Studienartikel 28 · 60 Min.') // unverändert
    expect(stud.mins).toBe(30) // die Zahl stimmt trotzdem
  })
})
