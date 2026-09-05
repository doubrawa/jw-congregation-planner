import { describe, expect, it } from 'vitest'
import { alsFreitext } from '../../supabase/functions/_shared/i18n/freitext.ts'
import { APP_LANGS } from './langs'
import { bibelbuecherLaden, makeTr } from './translate'
import { loadOverlay } from './ui'

// Wie in bible-books.test.ts: Overlays und Buchtabellen liegen in nachgeladenen
// Modulen, und `makeTr` stellt seine Regeln beim Erzeugen zusammen.
for (const { code } of APP_LANGS) await loadOverlay(code)
await bibelbuecherLaden()

/**
 * **Ein Name ist kein Programmtext.**
 *
 * Mitteilungen stehen kanonisch deutsch in der Datenbank und werden erst beim
 * Anzeigen übersetzt — Atom für Atom entlang der „ · “-Grenzen. Im Rumpf steht
 * neben Dienst und Termin aber auch der **Name einer Person**, und für den
 * Übersetzer sehen alle drei gleich aus.
 *
 * Das traf zweierlei: die Buch-Regel (sehr viele Bibelbücher heißen wie ein
 * Vorname — Daniel, Markus, Ruth, Titus) und, davor, den blanken
 * Wörterbuch-Treffer (wer „Ton“ heißt, hieße „Sound“). Eine Textregel kann das
 * nicht auflösen; die Auskunft „das ist ein Name“ hat nur, wer den Rumpf baut.
 * Deshalb wird sie mitgeschickt (`_shared/i18n/freitext.ts`).
 */
describe('Freitext im Mitteilungs-Rumpf', () => {
  const en = makeTr('en')

  it('ein gekennzeichneter Name bleibt, wie er ist', () => {
    // Gegenprobe zuerst: ohne Marke greift die Buch-Regel wirklich.
    expect(en('Markus 2')).toBe('Mark 2')
    expect(en(alsFreitext('Markus 2'))).toBe('Markus 2')
  })

  it('auch dort, wo das Wörterbuch zuschlägt — vor jeder Regel', () => {
    // „Mikrofone“ ist ein Dienstname und steht im Wörterbuch; die Buch-Regel
    // käme hier gar nicht erst zum Zug. Wer so hieße, hieße dort „Microphones“.
    expect(en('Mikrofone'), 'Gegenprobe').toBe('Microphones')
    expect(en(alsFreitext('Mikrofone'))).toBe('Mikrofone')
  })

  it('im ganzen Rumpf: die übrigen Atome werden weiter übersetzt', () => {
    const rumpf = `Mikrofone · Dienstag, 8. September · ${alsFreitext('Markus 2')}`
    expect(en(rumpf)).toBe('Microphones · Tuesday, September 8 · Markus 2')
  })

  it('und in der „ — “-Hälfte, mit der die App Absagen meldet', () => {
    // `declineTask` baut „<Aufgabe> — <Name>“; buildTranslator teilt rekursiv.
    // Und zugleich der Fall, für den es das Sicherheitsnetz braucht: Das
    // zweite Atom trifft als Ganzes die Buch-Regel, der Name darin bleibt
    // unangetastet — nur seine Marke käme sonst mit heraus.
    const rumpf = `Bibellesung · Jeremia 32 — ${alsFreitext('Ruth 2')}`
    expect(en(rumpf)).toBe('Bible Reading · Jeremiah 32 — Ruth 2')
  })

  it('Deutsch übersetzt nichts und nimmt die Marke trotzdem ab', () => {
    // Sonst stünden die unsichtbaren Isolat-Zeichen im DOM.
    const de = makeTr('de')
    expect(de(alsFreitext('Markus 2'))).toBe('Markus 2')
    expect(de(`Mikrofone · ${alsFreitext('Ton')}`)).toBe('Mikrofone · Ton')
    // Auch mitten im Atom (Sicherheitsnetz).
    expect(de(`Jeremia 32 — ${alsFreitext('Ruth 2')}`)).toBe('Jeremia 32 — Ruth 2')
  })

  it('leer bleibt leer — eine Marke um nichts wäre ein Atom zu viel', () => {
    expect(alsFreitext('')).toBe('')
    expect([`Mikrofone`, alsFreitext('')].filter(Boolean).join(' · ')).toBe('Mikrofone')
  })

  it('die Marke ist unsichtbar, aber messbar', () => {
    // Sie steht in der Datenbank und geht im Push mit hinaus; wer den Rumpf
    // vergleicht, muss wissen, dass sie da ist.
    const markiert = alsFreitext('Anna')
    expect(markiert).not.toBe('Anna')
    expect(markiert).toHaveLength('Anna'.length + 2)
    expect(en(markiert)).toBe('Anna')
  })
})
