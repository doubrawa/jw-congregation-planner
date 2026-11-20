import { afterEach } from 'vitest'
import { anzeigeSpracheSetzen } from '../src/i18n/anzeige-ziffern'

/**
 * **Nach jeder Probe zeigt die Oberfläche wieder Deutsch.** Die Sprache, in
 * deren Ziffern `fill` und `inAnzeigeZiffern` schreiben, ist Modulzustand:
 * `useT` stellt sie beim Rendern ein, und danach bleibt sie stehen. Nach einer
 * Probe, die eine Ansicht in Persisch zeigt, bekäme die nächste derselben Datei
 * persische Ziffern, sobald sie `fill` vor dem eigenen Rendern ruft — sie hinge
 * an der Reihenfolge.
 */
afterEach(() => anzeigeSpracheSetzen('de'))
