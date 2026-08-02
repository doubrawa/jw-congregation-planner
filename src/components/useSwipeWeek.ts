import { useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { gestenLog } from '../lib/gesture-log'

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
 * Der Inhalt folgt dem Finger 1:1 — der ganze Streifen wird ja verschoben.
 * Die Nachbarwochen sind bereits gezeichnet (WeekStrip), stehen also schon
 * angedockt daneben und kommen beim Ziehen von selbst ins Bild.
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
    let bewegungen = 0 // nur fuers Protokoll

    let timer: number | undefined
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

    /**
     * Blättern: den Streifen um genau eine Wochenbreite weiterschieben.
     *
     * `richtung` -1 = nach links (nächste Woche), +1 = nach rechts. Die
     * Nachbarwochen sind bereits gezeichnet (WeekStrip), es gibt also nichts
     * einzublenden — nur zu verschieben.
     *
     * Am Ende der Bewegung steht die Nachbarwoche dort, wo die mittlere hin
     * gehört. Der Wochenwechsel macht sie zur mittleren, und der Versatz geht
     * im selben Zug auf null zurück: beides in einem Arbeitsschritt, damit
     * dazwischen nichts gezeichnet wird. `flushSync`, weil ein späteres
     * Rendern genau dieses eine Bild kosten würde.
     */
    const slide = (richtung: -1 | 1, ab: number, blaettern: () => void) => {
      laeuft = true
      /*
       * Verschoben wird um die Breite des BILDSCHIRMS, nicht des Fensters. Die
       * App-Spalte ist auf 430 px (mobil) bzw. 660 px begrenzt und sitzt
       * mittig; auf allem Breiteren liefe der Streifen sonst zu weit.
       * Rückfall auf die Fensterbreite nur, wenn keine Breite messbar ist.
       */
      const weg = el.getBoundingClientRect().width || window.innerWidth
      gestenLog('BLÄTTERN', { richtung, ab: Math.round(ab), weg: Math.round(weg) })

      setTransition(SLIDE_MS)
      setShift(richtung * weg)
      timer = window.setTimeout(() => {
        setTransition(null)
        flushSync(blaettern)
        setShift(0)
        laeuft = false
      }, SLIDE_MS)
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
      if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) {
        gestenLog('start', { verworfen: 'Randzone', x: Math.round(t.clientX) })
        return
      }
      gestenLog('start', { x: Math.round(t.clientX), y: Math.round(t.clientY) })
      bewegungen = 0
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
      bewegungen++
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
          gestenLog('senkrecht → verworfen', { dx: Math.round(dx), dy: Math.round(dy) })
          return
        }
        // Deutlich waagerecht → übernehmen. Sonst weiter abwarten.
        if (adx < START_PX || adx < ady * ANGLE) return
        phase = 'waagerecht'
        gestenLog('waagerecht erkannt', { dx: Math.round(dx), dy: Math.round(dy), abbrechbar: e.cancelable })
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

    /**
     * Geste beenden — sowohl bei touchend als auch bei touchcancel.
     *
     * Entscheidend ist, dass ein Abbruch NICHT anders behandelt wird, sobald
     * die Bewegung schon als waagerecht erkannt und weit genug gezogen war.
     * Android zieht die Geste an sich, wenn der anfangs senkrechte Bogen wie
     * Scrollen aussieht, und schickt dann touchcancel. Wer daraufhin nur
     * zurückfedert, blättert auf dem Gerät nie — genau das war zu beobachten,
     * während iPad und Rechner sauber durchliefen.
     *
     * Der Wunsch des Nutzers steht zu dem Zeitpunkt längst fest: über 60 px
     * eindeutig zur Seite gezogen. Ihn wegen einer Browser-Entscheidung zu
     * verwerfen, wäre die schlechtere Auslegung.
     */
    const beenden = (grund: 'touchend' | 'touchcancel') => {
      if (!aktiv) return
      const warWaagerecht = phase === 'waagerecht'
      const stand = phase // vor dem Zurücksetzen, fürs Protokoll
      const moved = dx
      aktiv = false
      phase = 'offen'
      gestenLog(grund, {
        phase: stand,
        dx: Math.round(moved),
        schwelle: COMMIT_PX,
        bewegungen,
        canPrev: o.current.canPrev,
        canNext: o.current.canNext,
      })
      if (warWaagerecht && Math.abs(moved) >= COMMIT_PX) {
        // Nach rechts gezogen (moved > 0) heißt: die vorige Woche liegt links
        // — die alte wandert also nach rechts hinaus.
        if (moved > 0 && o.current.canPrev) return slide(1, moved, o.current.onPrev)
        if (moved < 0 && o.current.canNext) return slide(-1, moved, o.current.onNext)
      }
      release(true)
    }

    const onEnd = () => beenden('touchend')
    const onCancel = () => {
      if (!aktiv) gestenLog('touchcancel (ohne laufende Geste)', { phase })
      beenden('touchcancel')
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
      el.style.removeProperty('--week-shift')
      el.style.transition = ''
    }
  }, [ref])
}
