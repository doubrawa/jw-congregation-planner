/**
 * Sprachnamen in der Bediensprache.
 *
 * `JW_LANGS` (langs.ts) führt alle 482 Sprachen, in denen es das Arbeitsheft
 * gibt — mit **deutschem** Anzeigenamen, denn generiert wurde die Liste aus dem
 * „LESEN IN"-Umschalter der deutschen Wochenseite. Solange das der einzige Name
 * war, las eine hebräischsprachige Versammlung ihre eigene Sprache im
 * Einstellungs-Sheet als „Hebräisch" — und wählte aus 482 deutschen Wörtern.
 * Gemessen bei der Vollständigkeitsprobe auf Hebräisch (T60): die Oberfläche
 * war vollständig übersetzt, diese Liste als einzige nicht.
 *
 * **Woher die Namen kommen.** Von jw.org selbst: dieselbe Wochenseite in der
 * Bediensprache geöffnet, die Beschriftungen desselben Umschalters übernommen.
 * Ein Abruf je Sprache liefert alle 482 Namen. Damit ist keiner davon erfunden
 * — dieselbe Linie wie bei den Verweis-Vorlagen: lieber gemessen als
 * ausgedacht.
 *
 * **Warum nachgeladen.** Je Sprache 8–15 KB, und gebraucht wird die Liste nur,
 * wenn jemand das Versammlungssprachen-Sheet öffnet. Sie gehört nicht ins
 * Start-Bundle. Bis sie da ist, steht der deutsche Name — lesbar bleibt es
 * immer, nur nicht sofort in der eigenen Schrift.
 */

import { useEffect, useState } from 'react'
import type { Lang } from '../data/types'
import { CONG_TO_JW, JW_LANGS } from './langs'

const MODULE = import.meta.glob<{ default: string }>('./langnames/*.ts')

/** jw.org-Code → Name, je geladener Bediensprache. */
const GELADEN = new Map<Lang, Map<string, string>>()
const LAEUFT = new Map<Lang, Promise<boolean>>()

let generation = 0

/**
 * Namen holen und das Rendern anstoßen, sobald sie da sind.
 *
 * Bewusst hier und nicht beim Sprachwechsel im Store: die Liste erscheint nur
 * in den Einstellungen. Wer nie dorthin geht, lädt sie nie — und das ist der
 * einzige Grund, sie überhaupt auszulagern.
 */
export function useLangNames(lang: Lang): number {
  const [gen, setGen] = useState(generation)
  useEffect(() => {
    let aktuell = true
    void loadLangNames(lang)
      .then(() => {
        if (aktuell) setGen(generation)
      })
      // Nach einem Deployment sind die alten Lazy-Chunks weg — dann bleibt es
      // beim deutschen Namen, statt eine unbehandelte Ablehnung zu erzeugen.
      .catch((fehler: unknown) => console.error('[langnames]', lang, fehler))
    return () => {
      aktuell = false
    }
  }, [lang])
  return gen
}

function parse(rohtext: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const zeile of rohtext.split('\n')) {
    const i = zeile.indexOf('|')
    if (i > 0) map.set(zeile.slice(0, i), zeile.slice(i + 1))
  }
  return map
}

/**
 * Sprachnamen einer Bediensprache nachladen. Liefert true, wenn dabei etwas
 * Neues registriert wurde (der Aufrufer stößt dann ein Re-Render an); false für
 * Deutsch, bereits Geladenes und Sprachen ohne eigene Liste.
 */
export function loadLangNames(lang: Lang): Promise<boolean> {
  if (lang === 'de' || GELADEN.has(lang)) return Promise.resolve(false)
  const loader = MODULE[`./langnames/${lang}.ts`]
  if (!loader) return Promise.resolve(false)
  let pending = LAEUFT.get(lang)
  if (!pending) {
    pending = loader().then((m) => {
      GELADEN.set(lang, parse(m.default))
      LAEUFT.delete(lang)
      generation++
      return true
    })
    LAEUFT.set(lang, pending)
  }
  return pending
}

/**
 * Anzeigeliste der Versammlungssprachen: der gespeicherte **deutsche** Name
 * bleibt der Schlüssel (er steht so in der Datenbank), `label` ist der Name in
 * der Bediensprache.
 *
 * Sortiert wird nach `label` mit der Bediensprache als Kollation — sonst stünde
 * eine griechische oder hebräische Liste in deutscher Buchstabenfolge da.
 */
export interface LangChoice {
  /** Deutscher Name — der gespeicherte Wert (`state.congLang`). */
  key: string
  /** Name in der Bediensprache; ohne geladene Liste der deutsche. */
  label: string
}

export function langChoices(lang: Lang): LangChoice[] {
  const namen = GELADEN.get(lang)
  const liste = JW_LANGS.map((l) => ({ key: l.name, label: namen?.get(l.code) ?? l.name }))
  return namen ? liste.sort((a, b) => a.label.localeCompare(b.label, lang)) : liste
}

/** Ein einzelner Name: deutscher Anzeigename → Name in der Bediensprache. */
export function langLabel(deutscherName: string, lang: Lang): string {
  const code = CONG_TO_JW[deutscherName]
  return (code && GELADEN.get(lang)?.get(code)) || deutscherName
}
