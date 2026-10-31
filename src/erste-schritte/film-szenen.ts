import { LOGO_GROSS, REIHEN_DECKKRAFT } from '../bausteine/logo-form'
import { GESAMT, eio, ei, eo, eob, lerp, seg, type SzenenId } from './film-zeit'

/**
 * **Die sechs Szenen des Films „Erste Schritte" als Bewegung** (22.10.2026).
 *
 * Das Bild selbst zeichnet React (`ErsteSchritteFilm.tsx`): das Handy mit den
 * Ansichten der App, die Worte, die Punkte. Hier wird nur bewegt — jede Szene
 * ist `zeigen(t, m, zeit)`, eine reine Funktion ihrer Zeit. Was sie greift, trägt ein
 * `data-f`; was sie misst, misst `messen()` aus dem Layout (`offsetLeft`, ohne
 * die laufenden Verschiebungen). So stimmen die Tipps auch in jeder Sprache,
 * in großer Schrift und von rechts nach links: Ziel ist immer das Element
 * selbst, nicht eine Zahl, die in einer Sprache passte.
 *
 * Die Zeiten sind die des Clips aus T132, den der Betreiber abgenommen hat.
 */

/** Das Handy der App wie in erste-schritte.css: 12 Pixel Rahmen um einen Schirm von 390 Pixeln. */
const HANDY = { breite: 414, rand: 12, schirm: 390 } as const

/** Abstand des Handys zum oberen Rand der Bühne, wenn das ✕ nicht darüber steht. */
const RAND_OBEN = 14

/** So viel steigt das Handy über den ganzen Film, in Pixeln: Das Bild ruht nie ganz — auch nicht in den Halten zum Lesen. */
const STEIGEN = 18

/** So viel vom Schirm des Handys bleibt sichtbar, bevor die Bühne es unten ausblendet. */
const SICHTBAR = 580

/** Platz unter dem Handy für die vier Punkte der Schritte — samt Ring, über der Zeile „Schritt 1 von 4“. */
const STUFEN_ZONE = 74

/** Die erste Reihe des Logos: vier Plätze, vier Schritte. */
export const VORN = LOGO_GROSS.reihen[0] ?? []

/** Die Plätze der hinteren Reihen, je Platz mit der Deckkraft seiner Reihe. */
export const HINTEN = LOGO_GROSS.reihen
  .slice(1)
  .flatMap((reihe, i) => reihe.map(([x, y]) => ({ x, y, deckkraft: REIHEN_DECKKRAFT[i + 1] ?? 1 })))

const VORN_MITTE_Y = VORN.reduce((summe, [, y]) => summe + y, 0) / Math.max(1, VORN.length)
const VORN_BREITE = Math.max(...VORN.map(([x]) => x)) - Math.min(...VORN.map(([x]) => x))

/** Was die Bewegung über das Layout wissen muss — neu gemessen nach jeder Größenänderung. */
export interface Masse {
  /** Rechts nach links: −1, sonst 1. Waagerechte Wege laufen dann gespiegelt. */
  richtung: 1 | -1
  /** Die Bühne; ihre linke obere Ecke ist der Ursprung der Punkte. */
  buehne: { breite: number; hoehe: number }
  /** Wo das Handy am Ende des Films oben steht — unter dem ✕, wenn es über der Bühne liegt. */
  oben: number
  /** Maßstab des Handys. */
  k: number
  /** Die vier Punkte der Schritte, ihr Halbmesser. */
  stufen: ReadonlyArray<readonly [number, number]>
  stufenR: number
  /** Das Logo groß in der Mitte der Bühne (erste und letzte Szene). */
  logo: { x: (x: number) => number; y: (y: number) => number; l: number }
}

export function vermessen(wurzel: HTMLElement): Masse {
  // In Pixeln der Bühne: Die Punkte liegen in ihr und rollen mit, wenn der Film
  // bei großer Schrift rollt.
  const b = finde(wurzel, 'buehne').getBoundingClientRect()
  const { width: breite, height: hoehe } = b
  const richtung = getComputedStyle(wurzel).direction === 'rtl' ? -1 : 1
  // Hochkant steht das ✕ über der Ecke des Handys, wo die Glocke ist — und der
  // Tipp auf sie (Review vom 22.10.2026). Dann beginnt das Handy darunter; quer
  // steht das ✕ über den Worten.
  const kreuz = finde(wurzel, 'schliessen').getBoundingClientRect()
  const ueberDerBuehne = kreuz.left < b.right && kreuz.right > b.left && kreuz.bottom > b.top
  const oben = ueberDerBuehne ? Math.max(RAND_OBEN, kreuz.bottom - b.top + 8) : RAND_OBEN
  const k = Math.min(1, Math.max(0.3, Math.min((breite - 24) / HANDY.breite, (hoehe - oben - STEIGEN - STUFEN_ZONE) / SICHTBAR)))

  // Die Punkte der Schritte: die erste Reihe des Logos, unten in der Bühne.
  const s = Math.min(150, Math.max(110, breite * 0.34)) / VORN_BREITE
  const mitteX = breite / 2
  // Etwas über der Mitte der Zone: Quer reichte der Ring des untersten Punkts
  // sonst bis an den Rand des Schirms und verlor seinen Strich (932 × 430).
  const stufenY = hoehe - STUFEN_ZONE / 2 - 4
  const stufen = VORN.map(([x, y]) => [mitteX + richtung * (x - 256) * s, stufenY + (y - VORN_MITTE_Y) * s] as const)

  // Das Logo: in der Mitte über den Punkten, so breit, wie Platz ist.
  const [, , weite, logoHoehe] = LOGO_GROSS.viewBox.split(' ').map(Number) as [number, number, number, number]
  const l = Math.max(120, Math.min(breite * 0.72, (hoehe - STUFEN_ZONE) * 1.25, 340)) / weite
  const logoY = (hoehe - STUFEN_ZONE) / 2
  const logo = {
    x: (x: number) => mitteX + richtung * (x - 256) * l,
    y: (y: number) => logoY + (y - (125.5 + logoHoehe / 2)) * l,
    l,
  }
  return { richtung, buehne: { breite, hoehe }, oben, k, stufen, stufenR: 15 * s, logo }
}

/** Das eine Element mit diesem `data-f` — fehlt es, ist das ein Fehler im Bild, kein Fall zum Überspringen. */
export function finde<T extends Element = HTMLElement>(in_: ParentNode, name: string): T {
  const el = in_.querySelector<T & Element>(`[data-f="${name}"]`)
  if (!el) throw new Error(`Film: [data-f="${name}"] fehlt`)
  return el as T
}

/** Alle Elemente mit diesem `data-f` — genau `anzahl`, sonst stimmt das Bild nicht. */
function alle<T extends Element = HTMLElement>(in_: ParentNode, name: string, anzahl: number): T[] {
  const liste = [...in_.querySelectorAll<T & Element>(`[data-f="${name}"]`)] as T[]
  if (liste.length !== anzahl) throw new Error(`Film: ${anzahl} × [data-f="${name}"] erwartet, ${liste.length} gefunden`)
  return liste
}

/** Wo ein Element im Layout steht, relativ zu einem Vorfahren — ohne Verschiebungen (`transform`). */
function lage(el: HTMLElement, bezug: HTMLElement): { x: number; y: number; breite: number; hoehe: number } {
  let x = 0
  let y = 0
  let knoten: HTMLElement | null = el
  while (knoten && knoten !== bezug) {
    x += knoten.offsetLeft
    y += knoten.offsetTop
    knoten = knoten.offsetParent instanceof HTMLElement ? knoten.offsetParent : null
  }
  return { x, y, breite: el.offsetWidth, hoehe: el.offsetHeight }
}

function mitte(el: HTMLElement, bezug: HTMLElement): readonly [number, number] {
  const l = lage(el, bezug)
  return [l.x + l.breite / 2, l.y + l.hoehe / 2]
}

/* ---- Worte ------------------------------------------------------------------ */

/** Wann die Worte einer Szene kommen; `titel` gleitet von der Seite herein, zu der die Zeile läuft (rechts, auf Arabisch links). */
export interface WortZeiten {
  schritt?: number
  titel: number
  sub: number
  notiz?: number
}

/** Wie lange ein Teil der Worte zum Erscheinen braucht (`worteZeigen`). */
export const ERSCHEINEN = { schritt: 0.4, titel: 0.6, sub: 0.5, notiz: 0.45 } as const

/**
 * Die Worte jeder Szene, in Sekunden ihrer Zeit. Die Halte zum Lesen in
 * `film-zeit.ts` liegen danach — `film-szenen.test.ts` hält beide zusammen.
 */
export const WORTE: Record<SzenenId, WortZeiten> = {
  punkte: { titel: 0.1, sub: 0.5 },
  link: { schritt: 0.3, titel: 0.5, sub: 1.3, notiz: 3.4 },
  aufgabe: { schritt: 0.2, titel: 0.4, sub: 1.2, notiz: 3.6 },
  // Der lange Satz zu Android und iPhone steht da, solange das Menü offen ist.
  installieren: { schritt: 0.2, titel: 0.4, sub: 0.9, notiz: 3.9 },
  erinnern: { schritt: 0.2, titel: 0.35, sub: 1.0 },
  ende: { titel: 0.3, sub: 0.6 },
}

function worteZeigen(worte: HTMLElement, m: Masse, t: number, z: WortZeiten): void {
  const schritt = worte.querySelector<HTMLElement>('[data-f="schritt"]')
  if (schritt && z.schritt !== undefined) schritt.style.opacity = String(eo(seg(t, z.schritt, z.schritt + ERSCHEINEN.schritt)))
  const titel = finde(worte, 'titel')
  const p = eo(seg(t, z.titel, z.titel + ERSCHEINEN.titel))
  titel.style.opacity = String(p)
  titel.style.transform = `translateX(${m.richtung * 28 * (1 - p)}px)`
  finde(worte, 'sub').style.opacity = String(eo(seg(t, z.sub, z.sub + ERSCHEINEN.sub)))
  const notiz = worte.querySelector<HTMLElement>('[data-f="notiz"]')
  if (notiz && z.notiz !== undefined) {
    const n = eo(seg(t, z.notiz, z.notiz + ERSCHEINEN.notiz))
    notiz.style.opacity = String(n)
    notiz.style.transform = `translateY(${18 * (1 - n)}px)`
  }
}

/* ---- Die Punkte der Schritte ----------------------------------------------- */

interface Stufen {
  messen(m: Masse): void
  /** Schritt `k` füllt sich (`voll` 0…1) mit Ring (`ring` 0…1); die davor sind voll, die danach leer. */
  zeigen(k: number, voll: number, ring: number): void
  sichtbar(ja: boolean): void
}

function baueStufen(svg: SVGElement): Stufen {
  const gruppe = finde<SVGGElement>(svg, 'stufen')
  const punkte = [...gruppe.querySelectorAll<SVGGElement>('g')].map((g) => ({
    leer: finde<SVGCircleElement>(g, 'leer'),
    voll: finde<SVGCircleElement>(g, 'voll'),
    ring: finde<SVGCircleElement>(g, 'ring'),
  }))
  let r = 0
  return {
    messen(m) {
      r = m.stufenR
      punkte.forEach((p, i) => {
        const [x, y] = m.stufen[i] ?? [0, 0]
        for (const c of [p.leer, p.voll, p.ring]) {
          c.setAttribute('cx', String(x))
          c.setAttribute('cy', String(y))
        }
        p.leer.setAttribute('r', String(r))
      })
    },
    zeigen(k, voll, ring) {
      punkte.forEach((p, i) => {
        p.voll.setAttribute('r', String(r * (i < k ? 1 : i === k ? voll : 0)))
        p.ring.style.opacity = String(i === k ? ring : 0)
        p.ring.setAttribute('r', String(r * (1.25 + 0.4 * ring)))
      })
    },
    sichtbar(ja) {
      gruppe.style.opacity = ja ? '1' : '0'
    },
  }
}

/* ---- Das Handy -------------------------------------------------------------- */

/**
 * Das Handy steht oben in der Mitte der Bühne und steigt über den ganzen Film
 * langsam — so ruht das Bild nie ganz, auch über die Schnitte und die Halte
 * hinweg: `zeit` ist die des Films, nicht die der Szene. Am Ende steht es bei
 * `m.oben`, nie darüber.
 */
function handySetzen(handy: HTMLElement, m: Masse, zeit: number, versatz = 0, zoom = 1, zoomY = 0): void {
  const y = m.oben + STEIGEN * (1 - zeit / GESAMT) + versatz - zoomY * m.k * (zoom - 1)
  handy.style.transform = `translateX(-50%) translateY(${y}px) scale(${m.k * zoom})`
}

/**
 * Ein Tipp auf ein Element des Schirms: Der Kreis kommt, drückt und geht. Ziel
 * ist die Mitte des Elements, wie das Layout es hinstellt.
 */
interface Tipp {
  messen(): void
  zeigen(t: number): void
}

function baueTipp(kreis: HTMLElement, ziel: () => HTMLElement, schirm: HTMLElement, wann: number): Tipp {
  let dx = 0
  let dy = 0
  return {
    messen() {
      const [x, y] = mitte(ziel(), schirm)
      const eigen = lage(kreis, schirm)
      dx = x - eigen.x - eigen.breite / 2
      dy = y - eigen.y - eigen.hoehe / 2
    },
    zeigen(t) {
      const a = seg(t, wann - 0.25, wann)
      const b = seg(t, wann + 0.05, wann + 0.5)
      kreis.style.opacity = String(a * (1 - b))
      kreis.style.transform = `translate(${dx}px, ${dy}px) scale(${1.3 - 0.3 * eo(a) + 0.6 * eo(b)})`
    },
  }
}

/* ---- Die Szenen ------------------------------------------------------------- */

interface Szene {
  /** Was die Szene aus dem Layout braucht — nach jeder Größenänderung. */
  messen?(m: Masse): void
  /** `t`: die Zeit der Szene (steht in einem Halt still); `zeit`: die des Films. */
  zeigen(t: number, m: Masse, zeit: number): void
}

export interface Film {
  /** Nach jeder Größenänderung: alles neu vermessen. */
  messen(m: Masse): void
  /** Das Bild der Szene `id` zu ihrer Zeit `t`, im Film bei `zeit`. */
  zeigen(id: SzenenId, t: number, zeit: number): void
}

/**
 * Baut die Bewegung zu einem gezeichneten Film. `ebene(id)` ist die Schicht
 * der Szene auf der Bühne, `worte(id)` ihr Text, `svg` die Punkte über allem.
 */
export function baueFilm(teile: {
  ebene: (id: SzenenId) => HTMLElement
  worte: (id: SzenenId) => HTMLElement
  svg: SVGElement
}): Film {
  const stufen = baueStufen(teile.svg)
  const szenen: Record<SzenenId, Szene> = {
    punkte: szenePunkte(teile.svg, teile.worte('punkte'), stufen),
    link: szeneLink(teile.ebene('link'), teile.worte('link'), stufen),
    aufgabe: szeneAufgabe(teile.ebene('aufgabe'), teile.worte('aufgabe'), stufen),
    installieren: szeneInstallieren(teile.ebene('installieren'), teile.worte('installieren'), stufen),
    erinnern: szeneErinnern(teile.ebene('erinnern'), teile.worte('erinnern'), stufen),
    ende: szeneEnde(teile.svg, teile.worte('ende'), stufen),
  }
  let masse: Masse | null = null
  return {
    messen(m) {
      masse = m
      stufen.messen(m)
      for (const szene of Object.values(szenen)) szene.messen?.(m)
    },
    zeigen(id, t, zeit) {
      if (masse) szenen[id].zeigen(t, masse, zeit)
    },
  }
}

/** Kreis setzen: Mitte und Halbmesser. */
function kreis(c: SVGCircleElement, x: number, y: number, r: number): void {
  c.setAttribute('cx', String(x))
  c.setAttribute('cy', String(y))
  c.setAttribute('r', String(Math.max(0, r)))
}

/** Skalieren um einen Punkt — als SVG-Transformation, die Koordinaten bleiben die der Bühne. */
function umPunkt(x: number, y: number, s: number): string {
  return `translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`
}

/** Die Punkte setzen sich, darunter der Titel; dann wandert die erste Reihe zu den Schritten. */
function szenePunkte(svg: SVGElement, worte: HTMLElement, stufen: Stufen): Szene {
  const gruppe = finde<SVGGElement>(svg, 'punkte')
  const hinten = finde<SVGGElement>(gruppe, 'hinten')
  const pult = finde<SVGCircleElement>(gruppe, 'punkte-pult')
  const sitze = alle<SVGCircleElement>(gruppe, 'punkte-sitz', HINTEN.length)
  const vorn = alle<SVGGElement>(gruppe, 'punkte-vorn', VORN.length).map((g) => ({
    leer: finde<SVGCircleElement>(g, 'leer'),
    voll: finde<SVGCircleElement>(g, 'voll'),
  }))
  return {
    messen(m) {
      kreis(pult, m.logo.x(LOGO_GROSS.pult.mitte[0]), m.logo.y(LOGO_GROSS.pult.mitte[1]), LOGO_GROSS.pult.r * m.logo.l)
      sitze.forEach((c, i) => {
        const platz = HINTEN[i]
        if (platz) kreis(c, m.logo.x(platz.x), m.logo.y(platz.y), LOGO_GROSS.r * m.logo.l)
      })
    },
    zeigen(t, m) {
      stufen.sichtbar(false)
      const cx = m.logo.x(256)
      const cy = m.logo.y(251)
      // Ein ruhiger Schub auf das Logo, dann treten die hinteren Reihen zurück.
      const schub = 1 + 0.035 * eio(seg(t, 0, 2.6))
      const weg = eio(seg(t, 2.3, 3.0))
      hinten.setAttribute('transform', umPunkt(cx, cy, schub * (1 - 0.06 * weg)))
      hinten.style.opacity = String(1 - weg)
      worteZeigen(worte, m, t, WORTE.punkte)
      worte.style.opacity = String(1 - eio(seg(t, 2.1, 2.7)))
      // Die erste Reihe wandert hinunter zu den Schritten: vier Plätze, vier Schritte — noch leer.
      vorn.forEach((p, i) => {
        const [lx, ly] = VORN[i] ?? [0, 0]
        const sx = cx + (m.logo.x(lx) - cx) * schub
        const sy = cy + (m.logo.y(ly) - cy) * schub
        const [zx, zy] = m.stufen[i] ?? [0, 0]
        const q = eio(seg(t, 2.6 + i * 0.07, 3.6 + i * 0.07))
        const r = lerp(LOGO_GROSS.r * m.logo.l * schub, m.stufenR, q)
        const x = lerp(sx, zx, q)
        const y = lerp(sy, zy, q) - 40 * Math.sin(Math.PI * q)
        kreis(p.leer, x, y, r)
        kreis(p.voll, x, y, r)
        p.voll.style.opacity = String(1 - eio(seg(t, 3.0 + i * 0.07, 3.75 + i * 0.05)))
      })
    },
  }
}

/** Schritt 1: ein Tipp auf den Link in der Nachricht — die App öffnet sich, angemeldet. */
function szeneLink(ebene: HTMLElement, worte: HTMLElement, stufen: Stufen): Szene {
  const handy = finde(ebene, 'handy')
  const schirm = finde(ebene, 'schirm')
  const nachricht = finde(ebene, 'nachricht')
  const start = finde(ebene, 'start')
  const tipp = baueTipp(finde(ebene, 'tipp'), () => finde(nachricht, 'url'), schirm, 2.3)
  return {
    messen: () => tipp.messen(),
    zeigen(t, m, zeit) {
      stufen.sichtbar(true)
      // Das Handy kommt von unten herauf; die Nachricht zeigt den Link.
      handySetzen(handy, m, zeit, m.buehne.hoehe * (1 - eo(seg(t, 0, 0.9))))
      stufen.zeigen(0, eo(seg(t, 3.2, 3.7)), eo(seg(t, 0.3, 0.8)) * (1 - eio(seg(t, 4.9, 5.5))))
      worteZeigen(worte, m, t, WORTE.link)
      tipp.zeigen(t)
      const w = eio(seg(t, 2.5, 3.1))
      nachricht.style.transform = `translateX(${-m.richtung * 170 * w}px)`
      nachricht.style.opacity = String(1 - 0.6 * w)
      start.style.transform = `translateX(${m.richtung * HANDY.schirm * (1 - w)}px)`
    },
  }
}

/** Schritt 2: die nächste Aufgabe ganz oben — ein Tipp auf Bestätigen. */
function szeneAufgabe(ebene: HTMLElement, worte: HTMLElement, stufen: Stufen): Szene {
  const handy = finde(ebene, 'handy')
  const schirm = finde(ebene, 'schirm')
  const karte = finde(ebene, 'karte')
  const knopf = finde(ebene, 'bestaetigen')
  const stand = finde(ebene, 'bestaetigt')
  const du = finde<SVGElement>(ebene, 'du')
  const tipp = baueTipp(finde(ebene, 'tipp'), () => knopf, schirm, 2.6)
  let karteY = 0
  return {
    messen() {
      // Gemessen wird mit dem Knopf, wie er vor dem Tipp dasteht.
      knopf.style.display = ''
      stand.style.display = 'none'
      tipp.messen()
      const [, y] = mitte(karte, schirm)
      karteY = HANDY.rand + y
    },
    zeigen(t, m, zeit) {
      stufen.sichtbar(true)
      // Näher an die Karte, zum Schluss wieder zurück — die nächste Szene beginnt so.
      const zoom = 1 + 0.15 * eio(seg(t, 0.3, 1.4)) * (1 - eio(seg(t, 4.9, 5.9)))
      handySetzen(handy, m, zeit, 0, zoom, karteY)
      stufen.zeigen(1, eo(seg(t, 3.0, 3.5)), eo(seg(t, 0.2, 0.7)) * (1 - eio(seg(t, 4.8, 5.4))))
      worteZeigen(worte, m, t, WORTE.aufgabe)
      // Bestätigen: Der Knopf gibt kurz nach, dann steht der Stand an seiner Stelle.
      tipp.zeigen(t)
      const weg = t >= 2.9
      knopf.style.display = weg ? 'none' : ''
      knopf.style.opacity = String(1 - 0.3 * eo(seg(t, 2.55, 2.75)))
      stand.style.display = weg ? '' : 'none'
      stand.style.opacity = String(eo(seg(t, 2.9, 3.15)))
      // Mit dem Stand füllt sich der eigene Platz im Saal — wie in der App.
      du.style.transform = `scale(${eob(seg(t, 2.9, 3.35))})`
    },
  }
}

/** Schritt 3: über das Menü des Browsers auf den Startbildschirm des Handys. */
function szeneInstallieren(ebene: HTMLElement, worte: HTMLElement, stufen: Stufen): Szene {
  const handy = finde(ebene, 'handy')
  const schirm = finde(ebene, 'schirm')
  const start = finde(ebene, 'start')
  const ueber = finde(ebene, 'ueber')
  const menue = finde(ebene, 'menue')
  const wahl = finde(ebene, 'wahl')
  const home = finde(ebene, 'home')
  const flug = finde(ebene, 'flug')
  const name = finde(ebene, 'name')
  const tipp = baueTipp(finde(ebene, 'tipp'), () => wahl, schirm, 1.7)
  // Auf dem Weg zum Startbildschirm tritt die App um die Mitte des Schirms zurück.
  for (const a of [start, ueber]) a.style.transformOrigin = 'center'
  let von: readonly [number, number] = [0, 0]
  let nach: readonly [number, number] = [0, 0]
  return {
    messen() {
      tipp.messen()
      // Das Symbol fliegt vom Eintrag im Menü auf seinen Platz unter den anderen.
      const eigen = lage(flug, schirm)
      const [wx, wy] = mitte(wahl, schirm)
      const platz = lage(finde(home, 'platz'), schirm)
      von = [wx - eigen.x - eigen.breite / 2, wy - eigen.y - eigen.hoehe / 2]
      nach = [platz.x - eigen.x + (platz.breite - eigen.breite) / 2, platz.y - eigen.y]
    },
    zeigen(t, m, zeit) {
      stufen.sichtbar(true)
      handySetzen(handy, m, zeit)
      stufen.zeigen(2, eo(seg(t, 3.5, 3.95)), eo(seg(t, 0.2, 0.7)) * (1 - eio(seg(t, 4.6, 5.2))))
      worteZeigen(worte, m, t, WORTE.installieren)
      // Das Menü des Browsers klappt auf; ein Tipp auf „App installieren".
      const auf = eo(seg(t, 0.8, 1.0)) * (1 - eo(seg(t, 1.95, 2.15)))
      menue.style.opacity = String(auf)
      menue.style.transform = `scale(${lerp(0.96, 1, auf)})`
      wahl.classList.toggle('is-gewaehlt', t > 1.62 && t < 2.15)
      tipp.zeigen(t)
      // Zurück zum Startbildschirm des Handys — dort landet das Symbol.
      const heim = eio(seg(t, 2.2, 2.8))
      for (const a of [start, ueber]) {
        a.style.opacity = String(1 - heim)
        a.style.transform = `scale(${1 - 0.08 * heim})`
      }
      home.style.opacity = String(heim)
      const f = seg(t, 2.8, 3.4)
      const p = eo(f)
      flug.style.opacity = String(eo(seg(t, 2.75, 2.95)))
      flug.style.transform = `translate(${lerp(von[0], nach[0], p)}px, ${lerp(von[1], nach[1], p) - 40 * Math.sin(Math.PI * p)}px) scale(${lerp(0.5, 1, eob(f, 1.6))})`
      name.style.opacity = String(eo(seg(t, 3.3, 3.6)))
    },
  }
}

/** Schritt 4: Glocke, „Aktivieren" — und die erste Erinnerung gleitet herein. */
function szeneErinnern(ebene: HTMLElement, worte: HTMLElement, stufen: Stufen): Szene {
  const handy = finde(ebene, 'handy')
  const schirm = finde(ebene, 'schirm')
  // Das Symbol steht auf seinem Platz: gemessen wird der Platz (ein SVG kennt kein offsetLeft).
  const symbol = finde(ebene, 'platz')
  const start = finde(ebene, 'start')
  const mitteilungen = finde(ebene, 'mitteilungen')
  const karte = finde(ebene, 'pushkarte')
  const rest = finde(ebene, 'rest')
  const banner = finde(ebene, 'banner')
  const [aufSymbol, aufGlocke, aufAktivieren] = alle(ebene, 'tipp', 3) as [HTMLElement, HTMLElement, HTMLElement]
  const tipps = [
    baueTipp(aufSymbol, () => symbol, schirm, 0.5),
    baueTipp(aufGlocke, () => finde(start, 'glocke'), schirm, 1.5),
    baueTipp(aufAktivieren, () => finde(mitteilungen, 'aktivieren'), schirm, 2.6),
  ]
  let hoch = 0
  return {
    messen() {
      for (const tipp of tipps) tipp.messen()
      // Die App geht aus dem Symbol auf: Es ist die Mitte ihres Wachsens.
      const [ox, oy] = mitte(symbol, schirm)
      start.style.transformOrigin = `${ox}px ${oy}px`
      hoch = karte.offsetHeight + 12
    },
    zeigen(t, m, zeit) {
      stufen.sichtbar(true)
      // Zum Schluss sinkt das Handy aus dem Bild, die Worte gehen: Platz für das Logo.
      handySetzen(handy, m, zeit, 1.1 * (m.buehne.hoehe + 40) * ei(seg(t, 4.45, 5.0)))
      stufen.zeigen(3, eo(seg(t, 3.45, 3.9)), eo(seg(t, 0.2, 0.7)) * (1 - eio(seg(t, 4.4, 4.9))))
      worteZeigen(worte, m, t, WORTE.erinnern)
      worte.style.opacity = String(1 - eio(seg(t, 4.5, 4.95)))
      // Das Symbol öffnet die App, die Glocke die Mitteilungen.
      for (const tipp of tipps) tipp.zeigen(t)
      const weiter = eio(seg(t, 1.65, 2.15))
      start.style.opacity = String(eo(seg(t, 0.6, 0.85)))
      start.style.transform = `translateX(${-m.richtung * 170 * weiter}px) scale(${lerp(0.2, 1, eio(seg(t, 0.6, 1.1)))})`
      mitteilungen.style.transform = `translateX(${m.richtung * HANDY.schirm * (1 - weiter)}px)`
      // „Aktivieren": Die Karte geht, die erste Erinnerung kommt.
      const g = eio(seg(t, 2.75, 3.05))
      karte.style.opacity = String(1 - g)
      rest.style.transform = `translateY(${-hoch * g}px)`
      const b = eo(seg(t, 3.05, 3.45))
      banner.style.opacity = String(b)
      banner.style.transform = `translateY(${lerp(-120, 0, b)}px)`
    },
  }
}

/** Fertig: Die vier vollen Punkte kehren in die erste Reihe zurück, der Saal füllt sich um sie. */
function szeneEnde(svg: SVGElement, worte: HTMLElement, stufen: Stufen): Szene {
  const gruppe = finde<SVGGElement>(svg, 'ende')
  const logo = finde<SVGGElement>(gruppe, 'ende-logo')
  const pult = finde<SVGCircleElement>(gruppe, 'ende-pult')
  const sitze = alle<SVGCircleElement>(gruppe, 'ende-sitz', HINTEN.length)
  const vorn = alle<SVGCircleElement>(gruppe, 'ende-vorn', VORN.length)
  return {
    zeigen(t, m) {
      stufen.sichtbar(false)
      const cx = m.logo.x(256)
      const cy = m.logo.y(251)
      logo.setAttribute('transform', umPunkt(cx, cy, 1 + 0.02 * eio(seg(t, 0.7, 3.5))))
      vorn.forEach((c, i) => {
        const p = eio(seg(t, i * 0.04, 0.55 + i * 0.04))
        const [vx, vy] = m.stufen[i] ?? [0, 0]
        const [lx, ly] = VORN[i] ?? [0, 0]
        kreis(c, lerp(vx, m.logo.x(lx), p), lerp(vy, m.logo.y(ly), p) - 50 * Math.sin(Math.PI * p), lerp(m.stufenR, LOGO_GROSS.r * m.logo.l, p))
      })
      kreis(pult, m.logo.x(LOGO_GROSS.pult.mitte[0]), m.logo.y(LOGO_GROSS.pult.mitte[1]), LOGO_GROSS.pult.r * m.logo.l * Math.max(0, eob(seg(t, 0.15, 0.55), 1.7)))
      sitze.forEach((c, j) => {
        const platz = HINTEN[j]
        if (platz) kreis(c, m.logo.x(platz.x), m.logo.y(platz.y), LOGO_GROSS.r * m.logo.l * Math.max(0, eob(seg(t, 0.2 + 0.025 * j, 0.5 + 0.025 * j), 1.6)))
      })
      worteZeigen(worte, m, t, WORTE.ende)
    },
  }
}
