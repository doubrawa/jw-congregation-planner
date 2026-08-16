/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

/*
 * Der Einladungscode ließ sich nicht kopieren. Ursache war die Reihenfolge:
 * `navigator.clipboard.writeText` bricht in echten Kontexten mit
 * „NotAllowedError: Document is not focused" ab (In-App-Browser aus
 * WhatsApp/Mail, installierte PWA), und wer sie zuerst **abwartet**, verlässt
 * damit die Nutzergeste — der klassische Weg scheitert danach ebenfalls.
 *
 * Behoben wurde das mit einer einzigen vertauschten Reihenfolge. Bewacht war
 * sie bis zur Mutationsprobe nicht: `clipboard.ts` hatte keinen einzigen Test,
 * und die Reihenfolge sieht man einer Datei nicht an — beide Wege kopieren ja.
 */

const execAufrufe: boolean[] = []
let schreibVersuche: string[] = []

/** `document.execCommand('copy')` mit gegebenem Ausgang unterschieben. */
function execCommand(ausgang: boolean | 'wirft'): void {
  document.execCommand = vi.fn(() => {
    if (ausgang === 'wirft') throw new Error('nicht erlaubt')
    execAufrufe.push(ausgang)
    return ausgang
  })
}

/** `navigator.clipboard.writeText` unterschieben; `ok=false` lässt es scheitern. */
function clipboardApi(ok: boolean): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        schreibVersuche.push(text)
        if (!ok) throw new Error('NotAllowedError: Document is not focused')
      }),
    },
  })
}

afterEach(() => {
  execAufrufe.length = 0
  schreibVersuche = []
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('In die Zwischenablage kopieren', () => {
  it('nimmt den gestensicheren Weg zuerst — die moderne API bleibt ungefragt', () => {
    // DIE Regel dieser Datei. Andersherum herum liefe sie in genau den
    // Kontexten ins Leere, für die sie gebaut wurde.
    execCommand(true)
    clipboardApi(true)
    return copyText('ABC-123').then((ok) => {
      expect(ok).toBe(true)
      expect(schreibVersuche, 'die async API wurde trotz Erfolg befragt').toEqual([])
    })
  })

  it('scheitert er, springt die moderne API ein', async () => {
    execCommand(false)
    clipboardApi(true)
    expect(await copyText('ABC-123')).toBe(true)
    expect(schreibVersuche).toEqual(['ABC-123'])
  })

  it('auch wenn er wirft statt false zu liefern', async () => {
    execCommand('wirft')
    clipboardApi(true)
    expect(await copyText('ABC-123')).toBe(true)
    expect(schreibVersuche).toEqual(['ABC-123'])
  })

  it('scheitern beide, ist die Antwort false — kein stiller Erfolg', async () => {
    // Der Aufrufer zeigt daraufhin den Code zum Abschreiben an. Ein falsches
    // „kopiert!" wäre schlimmer als ein ehrliches Nein.
    execCommand(false)
    clipboardApi(false)
    expect(await copyText('ABC-123')).toBe(false)
  })

  it('ohne moderne API bleibt es beim klassischen Weg', async () => {
    execCommand(false)
    expect(await copyText('ABC-123')).toBe(false)
    execCommand(true)
    expect(await copyText('ABC-123')).toBe(true)
  })

  it('räumt das versteckte Textfeld wieder weg — auch wenn der Weg wirft', async () => {
    // Beim Schreiben dieses Tests aufgefallen: Das Entfernen stand hinter dem
    // `execCommand`, im selben `try`. Wirft es, blieb das Feld im Dokument —
    // unsichtbar, aber bei jedem Versuch eines mehr.
    for (const ausgang of [true, false, 'wirft'] as const) {
      execCommand(ausgang)
      await copyText('ABC-123')
      expect(document.querySelectorAll('textarea').length, String(ausgang)).toBe(0)
    }
  })
})
