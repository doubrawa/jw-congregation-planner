/*
 * Neue Fassung nach einem Deploy tatsächlich übernehmen.
 *
 * Das Problem, das dahintersteckt: Die installierte App wird vom System beim
 * Schließen meist nur eingefroren und beim Öffnen wieder aufgeweckt — die Seite
 * lädt dabei NIE neu. Genauso ein Tab, der wochenlang offen liegt. Der Service
 * Worker holt zwar bei jedem echten Seitenaufruf die frische index.html; wenn es
 * aber gar keinen Seitenaufruf mehr gibt, läuft der Stand vom Installationstag
 * unbegrenzt weiter. Für den Nutzer sieht das aus, als wären Änderungen nie
 * veröffentlicht worden.
 *
 * Erkennung ohne zusätzliche Build-Schritte: Vite hängt jedem Bündel einen
 * Inhalts-Hash an (`index-BfxAPfZk.js`). Zeigt die ausgelieferte index.html auf
 * einen anderen Namen als den, der hier gerade läuft, gibt es eine neue Fassung.
 *
 * Geprüft wird beim Zurückkehren zur App. Das ist der schonendste Moment: der
 * Nutzer kommt gerade zurück und tippt nicht mitten in einem Formular. Ist
 * trotzdem ein Overlay offen, warten wir auf die nächste Gelegenheit, statt es
 * ihm unter den Fingern wegzuräumen.
 */

/** Frühestens so oft nachsehen — App-Wechsel kommen sonst im Sekundentakt. */
const CHECK_EVERY_MS = 5 * 60_000

/** Merker gegen Endlosschleifen (überlebt das Neuladen, nicht den App-Start). */
const MARKER = 'cpReloadedFor'

/** Offen heißt: jetzt nicht neu laden. */
const OVERLAY = '.sheet, [role="dialog"]'

/** Bündelname aus einer URL oder aus HTML-Text, z. B. `index-BfxAPfZk.js`. */
function bundleName(text: string): string | null {
  return /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(text)?.[1] ?? null
}

/** Das Bündel, das gerade läuft. */
function runningBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  return el ? bundleName(el.getAttribute('src') ?? '') : null
}

/** Das Bündel, auf das die ausgelieferte index.html zeigt. */
async function deployedBundle(): Promise<string | null> {
  // `no-store`: sonst beantwortet der HTTP-Cache die Frage mit der alten Antwort.
  const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })
  if (!res.ok) return null
  return bundleName(await res.text())
}

/**
 * Läuft eine veraltete Fassung? `null`, wenn es sich nicht feststellen lässt
 * (kein Netz, unerwartetes HTML) — dann passiert bewusst nichts.
 */
export async function updateAvailable(): Promise<string | null> {
  const running = runningBundle()
  if (!running) return null
  let deployed: string | null = null
  try {
    deployed = await deployedBundle()
  } catch {
    return null // offline o. Ä.: kein Grund, irgendetwas zu tun
  }
  return deployed && deployed !== running ? deployed : null
}

/**
 * Beim Zurückkehren zur App auf eine neue Fassung prüfen und sie übernehmen.
 * Gibt eine Abmelde-Funktion zurück.
 */
export function watchForUpdates(reload: () => void = () => location.reload()): () => void {
  let lastCheck = 0

  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastCheck < CHECK_EVERY_MS) return
    lastCheck = now

    void updateAvailable().then((neu) => {
      if (!neu) return
      if (document.querySelector(OVERLAY)) return // nicht mitten in einer Eingabe
      // Den Service Worker gleich mitnehmen — aber nur hier: ohne neue Fassung
      // gibt es nichts nachzusehen, und jede Prüfung wäre eine Netzanfrage bei
      // jedem Zurückkehren zur App.
      void navigator.serviceWorker?.getRegistration().then(
        (reg) => reg?.update(),
        () => {},
      )
      // Ohne diesen Merker könnte ein Fehlschlag beim Ausliefern in einer
      // Neulade-Schleife enden.
      if (sessionStorage.getItem(MARKER) === neu) return
      sessionStorage.setItem(MARKER, neu)
      reload()
    })
  }

  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}
