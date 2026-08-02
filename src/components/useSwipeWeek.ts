import { useEffect, useRef, type RefObject } from 'react'

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
const DAMP = 0.35 // der Inhalt folgt gedämpft, nicht 1:1

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

    const setShift = (px: number) => el.style.setProperty('--week-shift', `${px}px`)
    const release = (animate: boolean) => {
      el.style.transition = animate ? 'transform 200ms ease-out' : ''
      setShift(0)
      if (animate) window.setTimeout(() => (el.style.transition = ''), 220)
    }

    const onStart = (e: TouchEvent) => {
      // Mehrfinger (Zoom) gehört nicht uns.
      if (aktiv || e.touches.length !== 1) {
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
      // Am Anfang/Ende der Wochen zäher ziehen — signalisiert „hier ist Schluss".
      const blocked = (dx > 0 && !o.current.canPrev) || (dx < 0 && !o.current.canNext)
      setShift(dx * (blocked ? DAMP * 0.3 : DAMP))
    }

    const onEnd = () => {
      if (!aktiv) return
      const warWaagerecht = phase === 'waagerecht'
      const moved = dx
      aktiv = false
      phase = 'offen'
      release(true)
      if (!warWaagerecht || Math.abs(moved) < COMMIT_PX) return
      if (moved > 0 && o.current.canPrev) o.current.onPrev()
      else if (moved < 0 && o.current.canNext) o.current.onNext()
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
      el.style.removeProperty('--week-shift')
      el.style.transition = ''
    }
  }, [ref])
}
