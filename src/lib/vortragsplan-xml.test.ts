/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { vortragsplanLesen, type LeseErgebnis } from './vortragsplan-xml'

/**
 * **Die Datei des Planungsprogramms lesen** (T122).
 *
 * Gelesen wird auf dem Gerät des Planers; weiter geht nur Datum, Redner,
 * Versammlung, Thema und Lied. Geprüft wird, dass genau das ankommt, dass
 * alles andere übergangen *und genannt* wird, und wie fehlerhafte Dateien und
 * Vorträge enden.
 */

const datei = (inhalt: string, kopf = '<vortragsplan version="1">'): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${kopf}\n${inhalt}\n</vortragsplan>`

function gelesen(e: LeseErgebnis) {
  if (!e.ok) throw new Error(`nicht gelesen: ${e.grund}`)
  return e
}

describe('Vortragsplan lesen', () => {
  it('liest Gastredner und eigenen Redner — und sonst nichts', () => {
    const e = gelesen(
      vortragsplanLesen(
        datei(`
  <vortrag datum="2026-11-08">
    <redner>Max   Mustermann</redner>
    <versammlung>Musterstadt</versammlung>
    <thema>
      Demo-Thema 1
    </thema>
    <lied>151</lied>
  </vortrag>
  <vortrag datum="2026-11-15">
    <redner eigener="true">Peter Beispiel</redner>
    <versammlung>Wird übergangen</versammlung>
  </vortrag>`),
      ),
    )
    expect(e.plan.vortraege).toEqual([
      { datum: '2026-11-08', redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: 'Demo-Thema 1', lied: '151' },
      { datum: '2026-11-15', redner: 'Peter Beispiel', versammlung: '', eigener: true, thema: '', lied: '' },
    ])
    expect(e.plan.von).toBe('2026-11-08')
    expect(e.plan.bis).toBe('2026-11-15')
    expect(e.fehler).toEqual([])
    expect(e.ignoriert).toEqual([])
  })

  it('übergeht unbekannte Felder und nennt sie — sie verlassen das Gerät nicht', () => {
    const e = gelesen(
      vortragsplanLesen(
        datei(
          `
  <vortrag datum="2026-11-08" id="17">
    <redner mobil="0000">Max Mustermann</redner>
    <versammlung>Musterstadt</versammlung>
    <telefon>0000 000000</telefon>
    <email>platzhalter@example.org</email>
  </vortrag>
  <koordinator><name>X</name></koordinator>`,
          '<vortragsplan version="1" erstellt="heute">',
        ),
      ),
    )
    expect(e.ignoriert).toEqual(['email', 'erstellt', 'id', 'koordinator', 'mobil', 'telefon'])
    // Im Ergebnis steht davon nichts — nur die fünf bekannten Felder und das Datum.
    expect(Object.keys(e.plan.vortraege[0] ?? {}).sort()).toEqual(['datum', 'eigener', 'lied', 'redner', 'thema', 'versammlung'])
    expect(JSON.stringify(e.plan)).not.toContain('0000')
  })

  it('„eigener" gilt bei true, 1 und ja — sonst ist es ein Gastredner', () => {
    // Je Wert ein Sonntag — eine Woche, ein Vortrag.
    const faelle: Array<[string, string]> = [
      ['2026-11-01', 'true'],
      ['2026-11-08', 'TRUE'],
      ['2026-11-15', '1'],
      ['2026-11-22', 'ja'],
      ['2026-11-29', 'false'],
      ['2026-12-06', 'nein'],
      ['2026-12-13', ''],
    ]
    const xml = faelle
      .map(([datum, w]) => `<vortrag datum="${datum}"><redner eigener="${w}">R</redner><versammlung>V</versammlung></vortrag>`)
      .join('\n')
    const e = gelesen(vortragsplanLesen(datei(xml)))
    expect(e.plan.vortraege.map((v) => v.eigener)).toEqual([true, true, true, true, false, false, false])
  })

  it('fehlerhafte Vorträge bleiben draußen und werden mit ihrem Datum genannt; der Rest kommt an', () => {
    const e = gelesen(
      vortragsplanLesen(
        datei(`
  <vortrag datum="2026-02-31"><redner>A</redner><versammlung>V</versammlung></vortrag>
  <vortrag datum="8.11.2026"><redner>B</redner><versammlung>V</versammlung></vortrag>
  <vortrag datum="2026-11-15"><versammlung>V</versammlung></vortrag>
  <vortrag datum="2026-11-22"><redner>C</redner></vortrag>
  <vortrag datum="2026-11-29"><redner>D</redner><versammlung>V</versammlung><lied>1234</lied></vortrag>
  <vortrag datum="2026-12-06"><redner>E</redner><versammlung>V</versammlung><lied>Nr. 5</lied></vortrag>
  <vortrag datum="2026-12-13"><redner>F</redner><versammlung>V</versammlung><lied>007</lied></vortrag>`),
      ),
    )
    expect(e.fehler).toEqual([
      { datum: '2026-02-31', grund: 'datum' },
      { datum: '2026-11-15', grund: 'redner' },
      { datum: '2026-11-22', grund: 'versammlung' },
      { datum: '2026-11-29', grund: 'lied' },
      { datum: '2026-12-06', grund: 'lied' },
      { datum: '8.11.2026', grund: 'datum' },
    ])
    expect(e.plan.vortraege).toEqual([
      { datum: '2026-12-13', redner: 'F', versammlung: 'V', eigener: false, thema: '', lied: '7' },
    ])
    // Die Wochen der lesbaren Daten bleiben unberührt — ein Fehler ist keine Absage.
    // Ein unlesbares Datum nennt keine Woche.
    expect(e.plan.fehlerWochen).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })

  it('zwei Vorträge in derselben Woche: keiner von beiden, beide genannt', () => {
    const e = gelesen(
      vortragsplanLesen(
        datei(`
  <vortrag datum="2026-11-14"><redner>A</redner><versammlung>V</versammlung></vortrag>
  <vortrag datum="2026-11-15"><redner>B</redner><versammlung>V</versammlung></vortrag>
  <vortrag datum="2026-11-22"><redner>C</redner><versammlung>V</versammlung></vortrag>`),
      ),
    )
    expect(e.fehler).toEqual([
      { datum: '2026-11-14', grund: 'doppelt' },
      { datum: '2026-11-15', grund: 'doppelt' },
    ])
    expect(e.plan.vortraege.map((v) => v.redner)).toEqual(['C'])
    expect(e.plan.fehlerWochen).toEqual(['2026-11-09'])
  })

  it('der Zeitraum: angegeben, ohne Angabe aus den Vorträgen, von einem Vortrag außerhalb erweitert', () => {
    const v = '<vortrag datum="2026-11-08"><redner>A</redner><versammlung>V</versammlung></vortrag>'
    expect(gelesen(vortragsplanLesen(datei(v, '<vortragsplan version="1" von="2026-11-01" bis="2026-11-30">'))).plan)
      .toMatchObject({ von: '2026-11-01', bis: '2026-11-30' })
    expect(gelesen(vortragsplanLesen(datei(v))).plan).toMatchObject({ von: '2026-11-08', bis: '2026-11-08' })
    expect(gelesen(vortragsplanLesen(datei(v, '<vortragsplan version="1" von="2026-11-10" bis="2026-11-30">'))).plan)
      .toMatchObject({ von: '2026-11-08', bis: '2026-11-30' })
    // Kein Vortrag, aber ein Zeitraum: alles darin entfällt — eine gültige Aussage.
    expect(gelesen(vortragsplanLesen(datei('', '<vortragsplan version="1" von="2026-11-01" bis="2026-11-30">'))).plan)
      .toEqual({ von: '2026-11-01', bis: '2026-11-30', vortraege: [], fehlerWochen: [] })
  })

  it('weist ab: kein XML, falsche Wurzel, andere Version, ungültiger Zeitraum', () => {
    expect(vortragsplanLesen('datum;redner;versammlung\n2026-11-08;A;V')).toEqual({ ok: false, grund: 'keinXml' })
    expect(vortragsplanLesen('<vortragsplan version="1"><vortrag></vortragsplan>')).toEqual({ ok: false, grund: 'keinXml' })
    expect(vortragsplanLesen('<plan version="1"/>')).toEqual({ ok: false, grund: 'wurzel' })
    expect(vortragsplanLesen('<vortragsplan/>')).toEqual({ ok: false, grund: 'version' })
    expect(vortragsplanLesen('<vortragsplan version="2"/>')).toEqual({ ok: false, grund: 'version' })
    expect(vortragsplanLesen('<vortragsplan version="1" von="2026-12-01" bis="2026-11-01"/>')).toEqual({ ok: false, grund: 'zeitraum' })
    expect(vortragsplanLesen('<vortragsplan version="1" von="1.11.2026"/>')).toEqual({ ok: false, grund: 'zeitraum' })
  })

  it('liest den lokalen Namen — ein Namensraum stört nicht', () => {
    const e = gelesen(
      vortragsplanLesen(
        '<vp:vortragsplan xmlns:vp="urn:beispiel" version="1"><vp:vortrag datum="2026-11-08"><vp:redner>A</vp:redner><vp:versammlung>V</vp:versammlung></vp:vortrag></vp:vortragsplan>',
      ),
    )
    expect(e.plan.vortraege.map((v) => v.redner)).toEqual(['A'])
    expect(e.ignoriert).toEqual([])
  })
})

describe('Kodierung', () => {
  const inhalt = (enc: string) =>
    `<?xml version="1.0" encoding="${enc}"?><vortragsplan version="1"><vortrag datum="2026-11-08"><redner>Jörg Müller</redner><versammlung>Lörrach-Süd</versammlung></vortrag></vortragsplan>`

  it('windows-1252, wie die XML-Deklaration es sagt — die Umlaute bleiben ganz', () => {
    // Von Hand kodiert: jedes Zeichen ein Byte (für ö, ü, ü reicht Latin-1).
    const text = inhalt('windows-1252')
    const bytes = Uint8Array.from(Array.from(text), (z) => z.charCodeAt(0))
    const e = gelesen(vortragsplanLesen(bytes.buffer))
    expect(e.plan.vortraege[0]).toMatchObject({ redner: 'Jörg Müller', versammlung: 'Lörrach-Süd' })
  })

  it('UTF-8 mit und ohne BOM, UTF-16 mit BOM', () => {
    const utf8 = new TextEncoder().encode(inhalt('UTF-8'))
    const mitBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])
    for (const bytes of [utf8, mitBom]) {
      expect(gelesen(vortragsplanLesen(bytes.buffer as ArrayBuffer)).plan.vortraege[0]?.redner).toBe('Jörg Müller')
    }
    const text = inhalt('UTF-16')
    const utf16 = new Uint8Array(2 + text.length * 2)
    utf16.set([0xff, 0xfe])
    for (let i = 0; i < text.length; i++) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff
      utf16[3 + i * 2] = text.charCodeAt(i) >> 8
    }
    expect(gelesen(vortragsplanLesen(utf16.buffer)).plan.vortraege[0]?.versammlung).toBe('Lörrach-Süd')
  })
})
