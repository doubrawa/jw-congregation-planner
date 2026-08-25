import { describe, expect, it } from 'vitest'
import { buildImportWeek } from './testdaten'
import { emptyQualifications, helperWorkload, istAusgefallen, partWorkload, serviceQualKey, weichtAb } from './helpers'
import { setAbweichung } from './meeting-edit'
import { meetingDateText, meetingOffset, meetingTime } from './meeting-dates'
import { autoAssignMeeting, deriveMyTasks, deriveSubstituteReqs, helperTaskKey, weekConflicts } from './planning'
import type { Meeting, Person, Week } from './types'

/**
 * T30 — eine Woche kann von der Regel abweichen.
 *
 * Der Anlass kam vom Betreiber: mehrere Versammlungen teilen sich oft einen
 * Königreichssaal. Hat eine davon Dienstwoche (Kreisaufseher), muss eine
 * **andere** ihren Zusammenkunftstag verlegen, weil man sich abstimmen muss.
 * Eine Sonderwoche verschiebt also Tag und Uhrzeit — sie ändert nicht bloß den
 * Ablauf. Und es gibt Gründe, die einen Ausfall rechtfertigen (Kongress).
 *
 * Deshalb kein Satz einzelner Schalter je Sonderfall, sondern **eine** Aussage:
 * diese Zusammenkunft weicht ab. Die bekannten Fälle sind Ausprägungen davon.
 */

const ZEITEN = 'Di 19:00 · So 10:00'

const person: Person = {
  id: 'p1', fn: 'Anna', ln: 'Beispiel', dn: 'A. Beispiel',
  role: 'verkuendiger', tel: '', mail: '', priv: { ...emptyQualifications(), gebet: true },
}

/** Woche mit je einer besetzten Aufgabe und einem Hilfsdienst-Platz. */
function makeWeek(): Week {
  const meeting = (): Meeting => ({
    date: '7.–13. September',
    end: '',
    sections: [
      {
        label: 'ERÖFFNUNG',
        farbe: 'neutral',
        items: [{ title: 'Lied · Gebet', names: [{ name: 'A. Beispiel', pid: 'p1', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
      },
    ],
    helpers: { mik: [{ name: 'A. Beispiel', pid: 'p1' }] },
  })
  return { range: '7.–13. September', book: '', start: '2026-09-07', current: false, mid: meeting(), we: meeting() }
}

const mitAbweichung = (w: Week, tab: 'mid' | 'we', dev: Week['dev'] extends undefined ? never : NonNullable<Week['dev']>['mid']): Week => ({
  ...w,
  dev: { ...w.dev, [tab]: dev },
})

describe('Verlegung: anderer Tag, andere Uhrzeit', () => {
  it('der verlegte Tag schlägt den Rhythmus aus den Einstellungen', () => {
    const w = mitAbweichung(makeWeek(), 'mid', { day: 'Donnerstag', reason: 'Saal belegt' })
    expect(meetingOffset(w, 'mid', ZEITEN)).toBe(3) // Do statt Di
    expect(meetingOffset(w, 'we', ZEITEN)).toBe(6) // unberührt
  })

  it('die verlegte Uhrzeit ebenso', () => {
    const w = mitAbweichung(makeWeek(), 'mid', { time: '17:30' })
    expect(meetingTime(w, 'mid', ZEITEN)).toBe('17:30')
    expect(meetingTime(w, 'we', ZEITEN)).toBe('10:00')
  })

  it('der Termintext nennt den verlegten Tag, nicht den regulären', () => {
    // Hier fällt es dem Nutzer auf: „Meine Aufgaben", S-89 und der
    // Erinnerungstext leiten alle von hier ab.
    const w = mitAbweichung(makeWeek(), 'mid', { day: 'Donnerstag', time: '18:00' })
    expect(meetingDateText(w, 0, 'mid', ZEITEN)).toBe('Donnerstag, 10. September · 18:00')
    expect(meetingDateText(makeWeek(), 0, 'mid', ZEITEN)).toBe('Dienstag, 8. September · 19:00')
  })

  it('eine Abweichung schlägt auch einen eigenen Termin im date-Feld', () => {
    // Alt-Datensätze tragen den Termin im Anzeigetext. Verlegt der Planer die
    // Woche, nennt dieses Feld noch den alten Tag — ohne Vorrang stünde in der
    // Erinnerung der Abend, an dem niemand kommt.
    const alt = makeWeek()
    alt.mid.date = 'Samstag, 12. September · 19:30'
    expect(meetingOffset(alt, 'mid', ZEITEN)).toBe(5)
    const verlegt = mitAbweichung(alt, 'mid', { day: 'Montag', time: '20:00' })
    expect(meetingOffset(verlegt, 'mid', ZEITEN)).toBe(0)
    expect(meetingTime(verlegt, 'mid', ZEITEN)).toBe('20:00')
    expect(meetingDateText(verlegt, 0, 'mid', ZEITEN)).toBe('Montag, 7. September · 20:00')
  })

  it('weichtAb erkennt Tag, Uhrzeit und Ausfall — sonst nichts', () => {
    expect(weichtAb(makeWeek(), 'mid')).toBe(false)
    expect(weichtAb(mitAbweichung(makeWeek(), 'mid', { day: 'Freitag' }), 'mid')).toBe(true)
    expect(weichtAb(mitAbweichung(makeWeek(), 'mid', { time: '18:00' }), 'mid')).toBe(true)
    expect(weichtAb(mitAbweichung(makeWeek(), 'mid', { cancelled: true }), 'mid')).toBe(true)
    // Ein Grund allein ist keine Abweichung — er erklärt eine.
    expect(weichtAb(mitAbweichung(makeWeek(), 'mid', { reason: 'nur eine Notiz' }), 'mid')).toBe(false)
  })
})

describe('Ausfall: es kommt niemand zusammen', () => {
  const aus = () => mitAbweichung(makeWeek(), 'mid', { cancelled: true, reason: 'Kongress' })

  it('zählt nicht auf die Auslastung — weder Aufgabe noch Hilfsdienst', () => {
    // Wer nicht drankommt, ist nicht ausgelastet. Sonst gälte er wochenlang als
    // beschäftigt und die Auto-Zuteilung überginge ihn bei der nächsten echten
    // Zusammenkunft — genau die Ungerechtigkeit, die niemand nachvollziehen kann.
    expect(partWorkload([makeWeek()], person)).toBe(2) // mid + we
    expect(partWorkload([aus()], person)).toBe(1) // nur noch we
    expect(helperWorkload([makeWeek()], person)).toBe(2)
    expect(helperWorkload([aus()], person)).toBe(1)
  })

  it('erzeugt keine Aufgabe und damit nichts zu bestätigen', () => {
    expect(deriveMyTasks([makeWeek()], [], 'A. Beispiel', {}, ZEITEN, 'p1')).toHaveLength(2)
    expect(deriveMyTasks([aus()], [], 'A. Beispiel', {}, ZEITEN, 'p1')).toHaveLength(1)
  })

  it('taucht in der Konfliktprüfung nicht auf', () => {
    // Die Woche stellt genau den Fall „Hilfsdienst UND Aufgabe am selben Tag":
    // A. Beispiel betet und steht am Mikrofon. Findet der Abend nicht statt,
    // ist das kein Konflikt, sondern Lärm — und verdeckt die echten daneben.
    const dienste = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]
    expect(weekConflicts([makeWeek()], 0, [person], dienste, 'mid')).toEqual([
      { kind: 'helperTask', name: 'A. Beispiel', kennung: person.id, tab: 'mid' },
    ])
    expect(weekConflicts([aus()], 0, [person], dienste, 'mid')).toEqual([])
  })

  it('wird von der Auto-Zuteilung nicht besetzt', () => {
    // Echte Import-Vorlage statt Minimal-Attrappe: nur so greifen dieselben
    // Regeln wie im Betrieb (Qualifikation, Geschlecht, Doppelbelegung).
    const kandidaten = ['vorsitzMid', 'gebet', 'bibellesung', 'leser', 'studium', 'schulung'].map(
      (q, i): Person => ({
        id: `k${i}`, fn: `V${i}`, ln: `N${i}`, role: 'aeltester', female: false, tel: '', mail: '',
        priv: { ...emptyQualifications(), [q]: true },
      }),
    )
    const eingabe = [{ ...buildImportWeek(), dev: { mid: { cancelled: true } } }]
    const res = autoAssignMeeting(eingabe, 0, 'mid', kandidaten, [])
    expect(res.count).toBe(0)
    expect(res.weeks).toBe(eingabe) // unverändert, nicht einmal kopiert

    // Gegenprobe: ohne den Ausfall besetzt dieselbe Vorlage sehr wohl.
    expect(autoAssignMeeting([buildImportWeek()], 0, 'mid', kandidaten, []).count).toBeGreaterThan(0)
  })

  /*
   * Ersatzgesuche sind die vierte Ableitung an derselben Grenze — und die
   * einzige, die sie nicht kannte.
   *
   * Der Hergang ist alltäglich: Jemand sagt seinen Hilfsdienst ab, danach fällt
   * die Zusammenkunft aus (Kongress, Saal belegt). Das Gesuch blieb stehen: im
   * Aufgaben-Blatt, in der Zahl „noch zu erledigen" — und `vorzulegen` legte es
   * beim nächsten Öffnen sogar als Modal vor. Wer daraufhin zusagte, bekam vom
   * Server ein 409 ('meeting-cancelled') und davon nur einen Speicherfehler zu
   * sehen: eine Einladung zu etwas, das die App selbst ablehnt.
   */
  it('sucht keinen Ersatz mehr — für einen Abend, an dem niemand kommt', () => {
    const dienste = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]
    const einspringer: Person = {
      id: 'p2', fn: 'Bernd', ln: 'Bereit', role: 'verkuendiger', tel: '', mail: '',
      priv: { ...emptyQualifications(), [serviceQualKey('mik')]: true },
    }
    const abgesagt = { [helperTaskKey('2026-09-07', 'mid', 'mik', 0)]: 'verhindert' as const }

    // Gegenprobe zuerst: findet die Zusammenkunft statt, gibt es das Gesuch.
    expect(deriveSubstituteReqs([makeWeek()], dienste, abgesagt, einspringer, ZEITEN)).toHaveLength(1)
    expect(deriveSubstituteReqs([aus()], dienste, abgesagt, einspringer, ZEITEN)).toEqual([])
  })

  it('lässt die Zuteilungen stehen — Zurücknehmen stellt die Planung wieder her', () => {
    // Nichts wird verwaist: die Namen bleiben in den Daten, sie zählen nur so
    // lange nicht, wie die Zusammenkunft nicht stattfindet.
    const w = aus()
    expect(w.mid.sections[0].items[0]).toEqual(makeWeek().mid.sections[0].items[0])
    const zurueck: Week = { ...w, dev: { mid: { reason: 'Kongress' } } }
    expect(istAusgefallen(zurueck, 'mid')).toBe(false)
    expect(partWorkload([zurueck], person)).toBe(2)
  })
})

describe('Die Gedächtnismahl-Woche ist kein Ausfall', () => {
  it('memCancel ersetzt den Ablauf, es findet trotzdem etwas statt', () => {
    // Der Tab der betroffenen Zusammenkunft zeigt dann das Mahl — mit Vortrag,
    // Gebeten und dem Herumreichen der Symbole. Als Ausfall gelesen, fielen
    // genau diese Zuteilungen aus Auslastung, Aufgaben und Erinnerungen heraus.
    const mahl: Week = { ...makeWeek(), mem: true, memCancel: 'we' }
    expect(istAusgefallen(mahl, 'we')).toBe(false)
    expect(partWorkload([mahl], person)).toBe(2)
    expect(deriveMyTasks([mahl], [], 'A. Beispiel', {}, ZEITEN, 'p1')).toHaveLength(2)
  })
})

describe('setAbweichung räumt hinter sich auf', () => {
  it('setzt, ergänzt und nimmt einzelne Felder zurück', () => {
    const a = setAbweichung([makeWeek()], 0, 'mid', { day: 'Donnerstag' })
    expect(a[0].dev).toEqual({ mid: { day: 'Donnerstag' } })
    const b = setAbweichung(a, 0, 'mid', { time: '18:00' })
    expect(b[0].dev).toEqual({ mid: { day: 'Donnerstag', time: '18:00' } })
    const c = setAbweichung(b, 0, 'mid', { day: undefined })
    expect(c[0].dev).toEqual({ mid: { time: '18:00' } })
  })

  it('entfernt die leere Abweichung ganz — sonst gälte die Woche als abweichend', () => {
    // Bliebe `{ day: undefined }` stehen, erschienen Chip und Banner ohne
    // Anlass und `weichtAb` sagte die Unwahrheit.
    const a = setAbweichung([makeWeek()], 0, 'mid', { day: 'Donnerstag' })
    const b = setAbweichung(a, 0, 'mid', { day: undefined })
    expect(b[0].dev).toBeUndefined()
    expect(weichtAb(b[0], 'mid')).toBe(false)
  })

  it('lässt die andere Zusammenkunft in Ruhe', () => {
    const a = setAbweichung([makeWeek()], 0, 'mid', { cancelled: true })
    const b = setAbweichung(a, 0, 'we', { time: '09:30' })
    expect(b[0].dev).toEqual({ mid: { cancelled: true }, we: { time: '09:30' } })
    const c = setAbweichung(b, 0, 'mid', { cancelled: undefined })
    expect(c[0].dev).toEqual({ we: { time: '09:30' } })
  })

  it('behält Leerwerte nicht: „" ist kein Grund', () => {
    const a = setAbweichung([makeWeek()], 0, 'mid', { reason: '   ' })
    expect(a[0].dev).toBeUndefined()
    const b = setAbweichung([makeWeek()], 0, 'mid', { reason: '  Kongress  ' })
    expect(b[0].dev).toEqual({ mid: { reason: 'Kongress' } })
  })

  it('rührt die Eingabe nicht an (pure Funktion)', () => {
    const eingabe = [makeWeek()]
    const kopie = structuredClone(eingabe)
    setAbweichung(eingabe, 0, 'mid', { cancelled: true })
    expect(eingabe).toEqual(kopie)
  })
})
