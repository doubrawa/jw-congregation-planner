import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { DE, dict, loadOverlay } from './ui'

/**
 * **Die App heißt in jeder Sprache gleich** (T115).
 *
 * „Versammlung.app" ist ein Eigenname und steht in allen App-Sprachen
 * lateinisch da. Übersetzt würde er zu einem zweiten Produktnamen je Sprache,
 * und der Empfänger einer Einladung erkennt nicht wieder, wovon die Rede ist. Als erlaubter fester JSX-Text steht das schon in
 * `beschriftungen-quelle.test.ts` („produktname"); hier geht es um die
 * Wörterbücher.
 *
 * **Warum es diese Probe gibt.** Die Umbenennung vom 20.9.2026 (`b370710`) war
 * eine Textersetzung: „Congregation Planner" → „Versammlung.app", 34
 * Wörterbücher, Kopf, Seitenleiste, Anmeldung, Manifest. Drei Sprachen hat sie
 * damit **gar nicht angefasst** — Persisch, Hebräisch und Urdu hatten den alten
 * Namen seinerzeit nicht stehen lassen, sondern *übersetzt*
 * („מתכנן הקהילה JW", „برنامه‌ریز جماعت JW", „JW کلیسیا پلانر"). Wonach
 * ersetzt wurde, stand dort nicht; die drei blieben unverändert und luden noch
 * einen Monat später unter dem alten Namen ein.
 *
 * **Daraus folgt der Zuschnitt.** Eine Suche nach dem *alten* Namen
 * (`tests/kein-alter-app-name.test.ts`) hätte genau diese drei nicht gefunden —
 * sie trugen ihn ja nicht mehr wörtlich. Die tragende Prüfung ist deshalb die
 * **positive**: Wo das Deutsche den Namen nennt, muss ihn jede Sprache nennen.
 * Sie greift unabhängig davon, wie der alte Name lautete und in welcher Schrift
 * er stand.
 *
 * **Die Liste der Schlüssel wird abgeleitet, nicht gepflegt.** Träger ist, was
 * im Deutschen den Namen enthält — eine neue Beschriftung mit dem Produktnamen
 * ist damit vom ersten Tag an mitgeprüft, ohne sich hier eintragen zu müssen.
 *
 * **Die Serverseite braucht keine eigene Zeile.** Bis zum 31.10.2026 lag dort
 * eine Abschrift der Anmelde-Mail (`_shared/anmelde-texte.ts`); seitdem gibt
 * es die Mail nicht mehr, und die Nachricht mit dem Link kommt aus dem
 * Wörterbuch selbst. Und dass jedes Overlay jeden Schlüssel selbst
 * übersetzt (statt still auf Deutsch zurückzufallen), sichert `ui.test.ts`;
 * sonst prüfte `dict()` hier stellenweise nur das Deutsche.
 */

/** Der Name, unter dem die App auftritt. */
const NAME = 'Versammlung.app'

beforeAll(async () => {
  await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
})

/** Jeder Schlüssel, dessen **deutscher** Wert den Produktnamen nennt. */
const TRAEGER = Object.entries(DE as unknown as Record<string, string>)
  .filter(([, wert]) => wert.includes(NAME))
  .map(([schluessel]) => schluessel)

describe('Der Name der App steht in jeder Sprache (T115)', () => {
  it('findet überhaupt Schlüssel, die ihn tragen — sonst prüft die Probe nichts', () => {
    // Ohne diese Zusicherung wäre eine künftige Umbenennung, die `NAME` hier zu
    // ändern vergisst, eine grüne Prüfung über null Schlüssel. Seit dem
    // Anmelden per Link (T121, Phase 8) tragen ihn nur noch zwei: die Nachricht
    // mit dem Link (bis zum 31.10.2026 die E-Mail) und der Betreff der Anfrage —
    // die Texte der Einladungscodes sind fort.
    expect(TRAEGER, `kein deutscher Wert enthält „${NAME}"`).toEqual(expect.arrayContaining(['linkNachrichtText', 'anfrageBetreff']))
  })

  it('jede Sprache nennt ihn — unübersetzt, wie einen Markennamen', () => {
    const ohneName: string[] = []
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      for (const schluessel of TRAEGER) {
        if (!d[schluessel]?.includes(NAME)) ohneName.push(`${code}.${schluessel}: ${d[schluessel]}`)
      }
    }
    expect(ohneName, `diese Werte nennen die App nicht „${NAME}"`).toEqual([])
  })
})
