import { useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/**
 * Waagerecht wischen, um eine Woche zu blättern (Programm und Planen).
 *
 * Bewusst NUR die Woche: waagerecht bedeutet in dieser App sonst nichts
 * anderes: die drei Reiter bleiben Antippen. Zwei Bedeutungen für dieselbe
 * Richtung müsste man raten.
 *
 * ## Warum Touch- und nicht Zeiger-Ereignisse
 *
 * Ein Daumen ist am Gelenk angeschlagen und wischt im Bogen: die ersten
 * Millimeter gehen oft fast nur nach unten, erst danach setzt die waagerechte
 * Bewegung ein. Da `touch-action: pan-y` senkrechtes Scrollen erlaubt, wertet
 * der Browser diesen Anfang als Scrollen, übernimmt die Geste — und schickt
 * `pointercancel`. Ab da kommt kein einziges `pointermove` mehr, egal wie weit
 * der Finger noch zur Seite wandert. Auf dem Gerät heißt das: es blättert nie.
 *
 * Auf dem Rechner mit exakt waagerechten Testbewegungen passiert das nicht —
 * deshalb fiel es erst am echten Handy auf.
 *
 * Die Touch-Ereignisse laufen nach diesem Abbruch weiter. Deshalb hängt die
 * Erkennung an ihnen. Sobald die Bewegung klar waagerecht ist, wird das
 * Scrollen per `preventDefault()` gestoppt — sofern der Browser das dann noch
 * zulässt. Falls nicht, scrollt der Inhalt ein Stück mit; geblättert wird
 * trotzdem, und das ist allemal besser als eine Geste, die gar nicht geht.
 *
 * Mausbedienung braucht das nicht: dort gibt es die Pfeile (die es ohnehin
 * überall gibt — WCAG 2.5.1: eine Geste ist nie der einzige Weg).
 *
 * ## Was die Bewegung aussagt
 *
 * Der Inhalt folgt dem Finger 1:1 — er wird ja weggeschoben. Beim Loslassen
 * wandern alte und neue Woche gemeinsam weiter, wie zwei Bilder eines
 * Filmstreifens: die alte hinaus, die neue direkt dahinter herein.
 *
 * Dass sie aneinanderkleben, ist der Punkt. Ohne das sprang der Inhalt quer
 * über den Bildschirm — einen Wimpernschlag lang war gar nichts zu sehen —
 * und das las sich, als wäre die Bewegung zurückgelaufen.
 *
 * Beide Bildschirme lesen die Woche direkt aus dem Zustand; zwei Wochen
 * gleichzeitig zu rendern hieße, sie dafür umzubauen. Stattdessen bleibt ein
 * Standbild (`cloneNode`) der alten Woche liegen und wandert mit hinaus. Es ist
 * reine Optik: keine Ereignisse, für Screenreader unsichtbar, und nach der
 * Bewegung wieder weg.
 *
 * Zurückfedern heißt ausdrücklich das Gegenteil: „hier geht es nicht weiter".
 * Deshalb federt es nur, wenn wirklich nichts kommt (erste/letzte Woche) oder
 * zu kurz gezogen wurde. Vorher tat die Animation beides gleichzeitig — sie
 * federte zurück UND blätterte — und war dadurch nicht zu deuten.
 *
 * ## Weitere Fallstricke
 *
 * Im Browser-Tab löst ein Wisch vom Bildschirmrand die Zurück-/Vorwärts-
 * Navigation aus, in der installierten App die System-Geste von Android.
 * Gesten, die in den äußeren EDGE_PX beginnen, werden daher ignoriert.
 *
 * Die Richtung bleibt offen, bis eine Seite deutlich gewinnt — wer schon beim
 * ersten senkrechten Ausschlag verwirft, verliert wieder den Bogen von oben.
 */
const EDGE_PX = 24 // Randzone für System-/Browser-Gesten
const START_PX = 10 // so weit waagerecht: Geste übernehmen
const COMMIT_PX = 60 // so weit gezogen: blättern
const ANGLE = 1.4 // |dx| muss so viel größer sein als |dy|
const VERT_PX = 24 // erst ab hier gilt eine Bewegung als senkrecht …
const VERT_RATIO = 2 // … und nur, wenn sie so deutlich überwiegt
const RUBBER = 0.25 // am Anfang/Ende: zäh mitgeben statt mitschieben
const SLIDE_MS = 200 // Dauer für Hinaus- und Hereinschieben je
const SPRING_MS = 180 // Zurückfedern, wenn nicht geblättert wird

interface Options {
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

export function useSwipeWeek(ref: RefObject<HTMLElement | null>, opts: Options): void {
  const o = useRef(opts)
  o.current = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let aktiv = false // eine Berührung wird gerade verfolgt
    let startX = 0
    let startY = 0
    // 'offen' = Richtung noch nicht entschieden
    let phase: 'offen' | 'waagerecht' | 'verworfen' = 'offen'
    let dx = 0

    let timer: number | undefined
    let raf: number | undefined
    let laeuft = false // Blätter-Animation läuft; neue Gesten warten

    const setShift = (px: number) => el.style.setProperty('--week-shift', `${px}px`)
    const setTransition = (ms: number | null) => {
      el.style.transition = ms === null ? '' : `transform ${ms}ms ease-out`
    }

    /** Zurück auf null — „hier geht es nicht weiter" oder zu kurz gezogen. */
    const release = (animate: boolean) => {
      setTransition(animate ? SPRING_MS : null)
      setShift(0)
      if (animate) timer = window.setTimeout(() => setTransition(null), SPRING_MS + 20)
    }

    /** Standbild der aktuellen Woche, das mit hinauswandert. */
    let buehne: HTMLElement | null = null
    const buehneWeg = () => {
      buehne?.remove()
      buehne = null
    }

    /**
     * Filmstreifen: alte und neue Woche wandern um dieselbe Strecke weiter.
     *
     * `richtung` -1 = nach links hinaus (nächste Woche), +1 = nach rechts.
     * Die neue Woche startet unmittelbar neben der alten — deshalb genau eine
     * Bildschirmbreite versetzt — und beide legen dieselbe Strecke zurück.
     */
    const slide = (richtung: -1 | 1, ab: number, blaettern: () => void) => {
      laeuft = true

      // Standbild dort einfrieren, wo der Finger losgelassen hat.
      const r = el.getBoundingClientRect()
      /*
       * Versetzt wird um die Breite des BILDSCHIRMS, nicht des Fensters. Die
       * App-Spalte ist auf 430 px (mobil) bzw. 660 px begrenzt und sitzt
       * mittig. Auf allem, was breiter ist — großes Handy, Querformat, Tablet,
       * Browser-Tab — klaffte sonst genau die Differenz zwischen alter und
       * neuer Woche, und die alte flöge weit über den Rand hinaus.
       * Rückfall auf die Fensterbreite nur, wenn keine Breite messbar ist.
       */
      const weg = r.width || window.innerWidth
      buehne = document.createElement('div')
      buehne.dataset.weekGhost = '' // Standbild — nur Optik, kein Inhalt der App
      buehne.setAttribute('aria-hidden', 'true')
      buehne.style.cssText =
        'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:5'
      const klon = el.cloneNode(true) as HTMLElement
      klon.style.position = 'absolute'
      // `r.left` enthält die aktuelle Verschiebung bereits — sie steckt ja im
      // transform. Sie muss herausgerechnet werden, sonst wirkt sie doppelt
      // (einmal über die Position, einmal über --week-shift) und zwischen
      // alter und neuer Woche klafft genau die gezogene Strecke.
      klon.style.left = `${r.left - ab}px`
      klon.style.top = `${r.top}px`
      klon.style.width = `${r.width}px`
      klon.style.margin = '0'
      // Den Untergrund der App-Spalte mitnehmen. Das Standbild hängt am
      // <body> und säße sonst auf dessen Schreibtisch-Ton — die hinauswandernde
      // Woche sähe aus wie Text ohne Hintergrund. Auf dem Tablet, wo die Spalte
      // schmaler als das Fenster ist, fällt das sofort auf.
      klon.style.background = 'var(--bg)'
      klon.style.setProperty('--week-shift', `${ab}px`)
      buehne.appendChild(klon)
      document.body.appendChild(buehne)

      // Die neue Woche ohne Übergang direkt neben das Standbild setzen und
      // sofort einwechseln. `flushSync`, damit sie wirklich schon da steht,
      // bevor die Bewegung beginnt — sonst liefe kurz die alte Woche mit.
      setTransition(null)
      setShift(ab - richtung * weg)
      flushSync(blaettern)

      raf = requestAnimationFrame(() => {
        setTransition(SLIDE_MS)
        setShift(0)
        klon.style.transition = `transform ${SLIDE_MS}ms ease-out`
        klon.style.setProperty('--week-shift', `${richtung * weg}px`)
        timer = window.setTimeout(() => {
          setTransition(null)
          buehneWeg()
          laeuft = false
        }, SLIDE_MS + 20)
      })
    }

    const onStart = (e: TouchEvent) => {
      // Mehrfinger (Zoom) gehört nicht uns; während des Blätterns ist Pause.
      if (aktiv || laeuft || e.touches.length !== 1) {
        aktiv = false
        phase = 'verworfen'
        return
      }
      const t = e.touches[0]
      // Randzone dem System überlassen (Zurück-Geste).
      if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) return
      aktiv = true
      startX = t.clientX
      startY = t.clientY
      phase = 'offen'
      dx = 0
      el.style.transition = ''
    }

    const onMove = (e: TouchEvent) => {
      if (!aktiv || phase === 'verworfen') return
      if (e.touches.length !== 1) {
        // Zweiter Finger dazu → Zoom, nicht blättern.
        phase = 'verworfen'
        release(true)
        return
      }
      const t = e.touches[0]
      dx = t.clientX - startX
      const dy = t.clientY - startY
      if (phase === 'offen') {
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        // Deutlich senkrecht → das ist Scrollen. Bewusst träge: ein früher
        // Ausschlag nach unten gehört zum normalen Bogen.
        if (ady > VERT_PX && ady > adx * VERT_RATIO) {
          phase = 'verworfen'
          return
        }
        // Deutlich waagerecht → übernehmen. Sonst weiter abwarten.
        if (adx < START_PX || adx < ady * ANGLE) return
        phase = 'waagerecht'
      }
      // Scrollen unterbinden, solange der Browser es noch zulässt. Hat er die
      // Geste schon übernommen, ist das Ereignis nicht mehr abbrechbar — dann
      // scrollt es eben ein Stück mit.
      if (e.cancelable) e.preventDefault()
      // 1:1 mitschieben — der Inhalt wandert ja wirklich hinaus. Nur am
      // Anfang/Ende zäh mitgeben: dort federt es gleich wieder zurück, und
      // genau das soll „hier ist Schluss" heißen.
      const blocked = (dx > 0 && !o.current.canPrev) || (dx < 0 && !o.current.canNext)
      setShift(blocked ? dx * RUBBER : dx)
    }

    const onEnd = () => {
      if (!aktiv) return
      const warWaagerecht = phase === 'waagerecht'
      const moved = dx
      aktiv = false
      phase = 'offen'
      if (warWaagerecht && Math.abs(moved) >= COMMIT_PX) {
        // Nach rechts gezogen (moved > 0) heißt: die vorige Woche liegt links
        // — die alte wandert also nach rechts hinaus.
        if (moved > 0 && o.current.canPrev) return slide(1, moved, o.current.onPrev)
        if (moved < 0 && o.current.canNext) return slide(-1, moved, o.current.onNext)
      }
      release(true)
    }

    /* Vom System abgebrochen (Anruf, System-Geste): nicht blättern. */
    const onCancel = () => {
      if (!aktiv) return
      aktiv = false
      phase = 'offen'
      release(true)
    }

    // `passive: false` bei touchmove — ohne das darf preventDefault() nicht
    // greifen und der Inhalt scrollt beim Blättern mit.
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onCancel)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      // Laufende Animation abbrechen — sonst greifen die Zeitgeber auf ein
      // Element zu, das längst aus dem Baum ist, und das Standbild bliebe über
      // dem nächsten Bildschirm liegen.
      if (timer !== undefined) window.clearTimeout(timer)
      if (raf !== undefined) cancelAnimationFrame(raf)
      buehneWeg()
      el.style.removeProperty('--week-shift')
      el.style.transition = ''
    }
  }, [ref])
}
