/**
 * UI-Wörterbücher (v3-Mehrsprachigkeit). DE ist die Basis (alle Schlüssel),
 * EN die eager gebündelte Fallback-Schicht; die übrigen ~29 Sprachen liegen
 * als eigene Module unter ./overlays/ und werden lazy nachgeladen
 * (loadOverlay). `{n}` / `{name}` / `{m}` sind Platzhalter.
 *
 * DE aus dem v3-Prototyp, Übersetzungen aus docs/design-handoff/design/
 * i18n.js. Offizielle S-38-Begriffe (siehe i18n.js-Kopf).
 */

import type { Lang, QualificationKey, Role } from '../data/types'
import EN_OVERLAY from './overlays/en'
import { DE } from './de'

// DE bleibt Teil der öffentlichen ui-API (Tests, Dict-Basis).
export { DE }

export type Dict = typeof DE

/**
 * Sprach-Overlays: überschreiben nur abweichende Schlüssel (DE ist die Basis,
 * EN der Fallback — siehe `dict`). EN bleibt im Start-Bundle; alle weiteren
 * Sprachen liegen als eigene Module unter ./overlays/ und werden per
 * loadOverlay() erst beim Sprachwechsel nachgeladen (Code-Splitting — das
 * Start-Bundle trägt nicht mehr alle ~30 Wörterbücher).
 */
const OVERLAY: Partial<Record<Exclude<Lang, 'de'>, Partial<Dict>>> = { en: EN_OVERLAY }

const OVERLAY_MODULES = import.meta.glob<{ default: Partial<Dict> }>('./overlays/*.ts')
const overlayLoading = new Map<Lang, Promise<boolean>>()

/**
 * Zählt jede Overlay-Registrierung hoch. useT nimmt den Wert in seine
 * useMemo-Dependencies — sonst bliebe nach dem Nachladen das memoisierte
 * EN-Fallback-Wörterbuch stehen (lang/congLang ändern sich dabei ja nicht).
 */
let overlayGen = 0
export function overlayGeneration(): number {
  return overlayGen
}

/**
 * Overlay einer Sprache nachladen. Liefert true, wenn dabei ein neues Overlay
 * registriert wurde (der Aufrufer stößt dann ein Re-Render an, damit dict()
 * die Texte liefert); false für de/en, bereits Geladenes und Unbekanntes —
 * bis dahin greift der EN-Fallback.
 */
export function loadOverlay(lang: Lang): Promise<boolean> {
  if (lang === 'de' || OVERLAY[lang]) return Promise.resolve(false)
  const loader = OVERLAY_MODULES[`./overlays/${lang}.ts`]
  if (!loader) return Promise.resolve(false)
  let pending = overlayLoading.get(lang)
  if (!pending) {
    pending = loader().then((m) => {
      OVERLAY[lang as Exclude<Lang, 'de'>] = m.default
      overlayLoading.delete(lang)
      overlayGen++
      return true
    })
    overlayLoading.set(lang, pending)
  }
  return pending
}

/**
 * Vollständiges Wörterbuch für eine App-Sprache. Reihenfolge der Zusammen-
 * führung: DE (Basis) ← EN (Fallback für noch nicht übersetzte Sprachen) ←
 * sprachspezifisches Overlay, sofern schon nachgeladen (loadOverlay).
 */
export function dict(lang: Lang): Dict {
  if (lang === 'de') return DE
  return { ...DE, ...(OVERLAY.en ?? {}), ...(OVERLAY[lang] ?? {}) }
}

/**
 * Fester Aufgabenbereich → Wörterbuch-Schlüssel (Personen-Detail). Die
 * Hilfsdienst-Bereiche haben keinen festen Schlüssel — ihr Label ist der
 * Dienstname und wird über `tu` übersetzt.
 */
export const PRIV_KEY: Record<QualificationKey, keyof Dict> = {
  // vorsitzMid/vorsitzWe teilen sich das Basis-Label „Vorsitz"; den Zusatz
  // „unter der Woche"/„Wochenende" hängt PersonDetail aus tabMid/tabWe an.
  vorsitzMid: 'privVorsitz',
  vorsitzWe: 'privVorsitz',
  vortrag: 'privVortrag',
  gebet: 'privGebet',
  bibellesung: 'privBibellesung',
  leser: 'privLeser',
  schulung: 'privSchulung',
  studium: 'privStudium',
  treffpunkt: 'privTreffpunkt',
  wtLeiter: 'privWtLeiter',
  wtVertreter: 'privWtVertreter',
}

/** Rolle → Wörterbuch-Schlüssel (Personen-Rollenchips). */
export const ROLE_KEY: Record<Role, keyof Dict> = {
  aeltester: 'rolleAeltester',
  dienstamtgehilfe: 'rolleDag',
  verkuendiger: 'rolleVerk',
}

/** Deutscher Mitteilungs-Titel → Wörterbuch-Schlüssel (Übersetzung bei Anzeige). */
export const NOTIF_TITLE_KEY: Record<string, keyof Dict> = {
  'Neue Zuteilung': 'notifZuteilung',
  Erinnerung: 'notifErinnerung',
  'Plan veröffentlicht': 'notifPlan',
  'Zuteilung gesendet': 'notifZutGesendet',
  'Zuteilungen gesendet': 'notifZutsGesendet',
  'Programm importiert': 'notifProgImportiert',
  'Verhinderung gemeldet': 'notifVerhindert',
}
