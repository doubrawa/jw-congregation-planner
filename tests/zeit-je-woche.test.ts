import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { kommentarZeile, quelldateien, WURZEL } from './quelldateien'

/**
 * **Die Zeit einer Zusammenkunft wird je Woche gefragt** (13.11.2026).
 *
 * Seit die Regelzeit zu einem Montag wechseln kann (`MeetingTime.spaeter`),
 * ist `zeiten[tab].wd` nur noch die **Grundzeit** — was vor dem ersten Wechsel
 * galt. Wer sie liest, rechnet nach einem Wechsel mit dem alten Tag, und
 * nichts schlägt fehl: Die Erinnerung ginge am falschen Tag hinaus, „vorbei"
 * wäre eine Zusammenkunft, die noch bevorsteht.
 *
 * Gefragt wird deshalb an einer Stelle — `zeitDerWoche` in `planung.ts`. Die
 * App geht über `regelzeit` und `meetingOffset`/`meetingTime`, die Functions
 * über `terminDerWoche` (beide nehmen die Zeiten als Ganzes), die Skripte
 * rufen `zeitDerWoche` selbst. Diese Probe liest den Quelltext und lässt die
 * Zeit **einer** Zusammenkunft (`zeiten[tab]`, `times.mid`,
 * `zeitenAus(zeile)[tab]`) nur in zwei Formen durch:
 *
 *  1. als **Ganzes** an eine Funktion, die die Wechsel kennt (`MIT_WECHSELN`);
 *  2. als Zugriff auf die Wechsel selbst (`.spaeter`).
 *
 * Alles andere — ein Feld lesen, die Zeit an eine Anzeige weiterreichen, sie
 * in eine Variable legen — schlägt an. So stand es an vier Stellen, als der
 * Wechsel dazukam (Zeilen der Einstellungen, das Blatt, die Wartungsskripte).
 *
 * Ausgenommen ist `planung.ts`: Dort wohnen die Auflösung und die Umformung
 * zwischen Spalten und Werten.
 *
 * Eine Textprobe, kein Typbeweis: Sie erkennt die Zeit an ihrem Namen
 * (`zeiten`, `times`). So heißt sie überall — und ein neuer Name fiele im
 * Review auf, nicht hier.
 */

const ZUHAUSE = 'supabase/functions/_shared/planung.ts'

/** Die Zeit **einer** Zusammenkunft: `zeiten[tab]`, `times.mid`, `zeitenAus(zeile)[tab]`. */
const EINE_ZEIT = /\b(?:times|zeiten|zeitenAus\([^()]*\))\s*(?:\.(?:mid|we)\b|\[[^\]]+\])/g

/** Funktionen, die die Zeit samt ihren Wechseln nehmen — als erstes Argument. */
const MIT_WECHSELN = ['zeitDerWoche', 'zeitAb', 'ohneWechsel', 'kommendeWechsel', 'naechsterWechselText']

/** Die Stellen einer Zeile, an denen die Zeit einer Zusammenkunft anders gelesen wird als erlaubt. */
function verstoesse(zeile: string): string[] {
  if (kommentarZeile(zeile)) return []
  const funde: string[] = []
  for (const treffer of zeile.matchAll(EINE_ZEIT)) {
    // Ohne den Weg dorthin (`state.congregation.`, `lage.`): Davor steht dann der Aufruf.
    const davor = zeile.slice(0, treffer.index).replace(/(?:[\w$]+\??\.)+$/, '').trimEnd()
    const danach = zeile.slice(treffer.index + treffer[0].length)
    const alsGanzes = MIT_WECHSELN.some((name) => davor.endsWith(`${name}(`))
    const wechsel = /^\s*\.spaeter\b/.test(danach)
    if (!alsGanzes && !wechsel) funde.push(treffer[0])
  }
  return funde
}

describe('Die Zeit einer Zusammenkunft wird je Woche gefragt', () => {
  it('niemand liest die Grundzeit direkt — App, Functions und Skripte', () => {
    const funde: string[] = []
    const dateien = [
      ...quelldateien({ orte: ['src', 'supabase/functions'], endungen: ['.ts', '.tsx'], ohneTests: true }),
      ...quelldateien({ orte: ['scripts'], endungen: ['.mjs'], ohneTests: true }),
    ].filter((datei) => datei !== ZUHAUSE && !datei.includes('/_test/'))
    // Gegenprobe zur Auswahl: Die Dateien, um die es geht, sind dabei.
    expect(dateien).toEqual(expect.arrayContaining([
      'src/data/meeting-dates.ts',
      'src/einstellungen/ZusammenkunftBlatt.tsx',
      'supabase/functions/send-reminders/index.ts',
      'scripts/wochenplanung-importieren.mjs',
    ]))
    for (const datei of dateien) {
      readFileSync(join(WURZEL, datei), 'utf8')
        .split('\n')
        .forEach((zeile, i) => {
          for (const fund of verstoesse(zeile)) funde.push(`${datei}:${i + 1}  ${fund}`)
        })
    }
    expect(funde, 'über `regelzeit` (App), `terminDerWoche` (Functions) oder `zeitDerWoche` (Skripte) fragen').toEqual([])
  })

  it('Gegenprobe: Die Formen, in denen der Fehler dastand, schlagen an', () => {
    const falsch = [
      'wert={zusammenkunftText(state.congregation.times[welche], state.lang)}',
      'zusammenkuenfte: `${zusammenkunftText(state.congregation.times.mid, state.lang)}`',
      'const soll = wd === zeiten.mid.wd ? undefined : wd',
      'const zeit = zeiten[welche]',
      'tag.setDate(tag.getDate() + versatzAbMontag(zeiten[a.tab].wd))',
      'const regel = zeitenAus(congRows[0])[teile.tab]',
      'endeAusStartzeit(k.zeiten.mid.time, roh.mid.end)',
    ]
    for (const zeile of falsch) expect(verstoesse(zeile), zeile).not.toEqual([])
  })

  it('und die erlaubten gehen durch', () => {
    const richtig = [
      'return zeitDerWoche(zeiten[tab], woche)',
      'const regel = zeitDerWoche(zeitenAus(congRows[0])[parts.tab], parts.woche)',
      'const soll = wd === zeitDerWoche(zeiten.mid, montag).wd ? undefined : wd',
      'schreibe(zeitAb(zeiten[welche], ab, wert))',
      'const geplant = kommendeWechsel(zeiten[welche], laufend)',
      'unter={naechsterWechselText(state.congregation.times[welche], t, state.lang)}',
      'const zeit = zeitDerWoche(lage.zeiten[p.tab], woche.start)',
      '(zeiten[tab].spaeter ?? []).map(({ ab }) => ab)',
      // Kommentare dürfen davon reden.
      ' * `zeiten[tab].wd` allein ist nur die Grundzeit',
      // Die Zeiten beider Zusammenkünfte als Ganzes sind nicht gemeint.
      'const wann = meetingTime(week, key, zeiten)',
      'dispatch({ type: "updateCongregation", patch: { times: { ...zeiten, [welche]: neu } } })',
    ]
    for (const zeile of richtig) expect(verstoesse(zeile), zeile).toEqual([])
  })
})
