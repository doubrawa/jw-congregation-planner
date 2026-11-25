import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { manifestMitKennungen, symbolKennung } from './symbol-kennung.mjs'

/**
 * **Ein neu gezeichnetes App-Symbol kommt auf installierten Geräten an.**
 *
 * Chrome vergleicht beim Auffrischen einer installierten App nur das Feld
 * `icons` des Manifests und lädt die Bilder nicht mehr, wenn dort dasselbe
 * steht. Trügen die Symbole ihre Namen ohne Kennung, bliebe nach einem neuen
 * Logo auf jedem Handy das alte stehen — bis zum Neuinstallieren, und ohne
 * dass es irgendwo auffiele: Im Browser und in jeder Probe sähe man das neue.
 *
 * Darum hängt an jeder Adresse die Kennung des Inhalts. Gesichert ist hier,
 * dass sie zur Datei passt, die daneben liegt.
 */
const PUBLIC = join(import.meta.dirname, '..', 'public')
const manifestText = readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8')
const lesen = (datei: string): Uint8Array => readFileSync(join(PUBLIC, datei))
const adressen = (text: string): string[] => (JSON.parse(text) as { icons: { src: string }[] }).icons.map((symbol) => symbol.src)

describe('Die Kennung der Symbole im Manifest', () => {
  it('jedes Symbol trägt die Kennung der Datei, die in public/ liegt', () => {
    expect(adressen(manifestText).length).toBeGreaterThan(0)
    for (const adresse of adressen(manifestText)) {
      const [datei = '', kennung] = adresse.split('?v=')
      expect(kennung, adresse).toBe(symbolKennung(lesen(datei)))
    }
  })

  it('`npm run icons` ließe das Manifest, wie es ist — es ist nachgeführt', () => {
    expect(manifestMitKennungen(manifestText, lesen)).toBe(manifestText)
  })

  it('ein neu gezeichnetes Symbol bekommt eine neue Adresse, die anderen behalten ihre', () => {
    // Die Gegenprobe: ein einziges Byte mehr in einer der Dateien.
    const neu = manifestMitKennungen(manifestText, (datei) =>
      datei === 'icon-512.png' ? Uint8Array.from([...lesen(datei), 0]) : lesen(datei),
    )
    const vorher = adressen(manifestText)
    const nachher = adressen(neu)
    const geaendert = vorher.filter((adresse, i) => adresse !== nachher[i])
    expect(geaendert).toHaveLength(1)
    expect(geaendert[0]).toMatch(/^icon-512\.png\?v=/)
  })

  it('ein Manifest ohne Kennungen bekommt sie — sonst bleibt die Datei Zeichen für Zeichen gleich', () => {
    const ohne = manifestText.replace(/\?v=[0-9a-f]+/g, '')
    // Sonst prüfte die Zeile darunter nichts: Das Manifest trägt wirklich Kennungen.
    expect(ohne).not.toBe(manifestText)
    expect(manifestMitKennungen(ohne, lesen)).toBe(manifestText)
  })
})
