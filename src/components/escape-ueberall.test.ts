import { describe, expect, it } from 'vitest'

/**
 * **Jeder Dialog geht mit Escape wieder zu.**
 *
 * Am Schreibtisch ist die Taste der gewohnte Weg hinaus — und für alles, was
 * `useDialogFocus` einsetzt, auch ein wichtiger: Der Fokus liegt in einer
 * Tab-Falle, es gibt also keinen Weg heraus außer über einen der Knöpfe darin.
 *
 * `useEscape` wurde genau deshalb aus fünf gleichlautenden Effekten
 * herausgelöst, und sein Kopf nennt die Lücke beim Namen: „`MyTaskSheet` und
 * `ConfirmDialog` fehlte er, was beim Lesen einer einzelnen Datei nicht
 * auffällt". Nach dem Herauslösen fehlte er dort weiter — bei `MyTaskSheet`
 * ohne Grund, dazu bei `ServicePersonsSheet`, das erst später dazukam.
 *
 * Ein Aufruf neben `useBackDismiss` macht die Lücke sichtbar, sobald jemand
 * hinsieht. Dieser Test sieht hin, ohne dass jemand daran denken muss.
 */
describe('Overlays lassen sich mit Escape schließen', () => {
  const QUELLEN = import.meta.glob('../**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  /**
   * Wer kein `useEscape` braucht — jeder Eintrag mit seinem Grund.
   *
   * Die beiden unteren regeln Escape **selbst**, weil sie den Effekt an einen
   * Zustand binden müssen (`useEscape` kennt kein „nur wenn offen"). Dass sie
   * es wirklich tun, prüft der zweite Test — sonst wäre diese Liste ein
   * bequemer Ort, um eine echte Lücke abzulegen.
   */
  const AUSNAHMEN: Record<string, string> = {
    'ConfirmDialog.tsx':
      'Absicht: Solange eine Bestätigung aussteht, bleibt das Blatt stehen — dort gibt es weder ✕ noch Escape.',
    'AppShell.tsx': 'Regelt Escape selbst, gebunden an das geöffnete Seitenmenü.',
    'DatePicker.tsx': 'Kein modaler Dialog, sondern ein Popup — Escape hängt dort am `open`-Zustand.',
  }

  /** Bausteine, die einen Dialog zeichnen — Prüfstände zählen nicht mit. */
  const dialoge = Object.entries(QUELLEN).filter(
    ([pfad, q]) => !pfad.includes('.test.') && q.includes('role="dialog"'),
  )
  const name = (pfad: string): string => pfad.split('/').pop() ?? pfad

  it('jeder Baustein mit role="dialog" nimmt Escape entgegen', () => {
    // Gegenprobe: Ohne Treffer prüfte der Test nichts.
    expect(dialoge.length, 'keine Dialoge gefunden').toBeGreaterThan(5)

    const ohne = dialoge
      .filter(([pfad, q]) => !q.includes('useEscape') && !(name(pfad) in AUSNAHMEN))
      .map(([pfad]) => name(pfad))
    expect(ohne, `ohne Escape: ${ohne.join(', ')}`).toEqual([])
  })

  it('… und wer sich ausnimmt, tut es aus einem geprüften Grund', () => {
    for (const [datei, grund] of Object.entries(AUSNAHMEN)) {
      const eintrag = dialoge.find(([pfad]) => name(pfad) === datei)
      // Eine Ausnahme für etwas, das gar kein Dialog mehr ist, gehört weg.
      expect(eintrag, `${datei} zeichnet keinen Dialog mehr — Ausnahme streichen`).toBeDefined()
      expect(grund.length, `${datei} ohne Begründung`).toBeGreaterThan(20)
      // Die beiden, die es selbst regeln, müssen es auch wirklich tun.
      if (grund.includes('selbst') || grund.includes('Escape hängt')) {
        expect(eintrag?.[1], `${datei} regelt Escape nicht selbst`).toContain("'Escape'")
      }
    }
  })
})
