// Seitenseitiger Teil der Umbruchprobe: wird per Runtime.evaluate in /demo.html
// gelegt. Misst nur — ändert die App nicht (außer der optionalen Nachher-Simulation
// per eingehängtem <style> bzw. Textknoten, nur im Tab).
(() => {
  const NBSP = String.fromCharCode(0xa0)
  const schlaf = (ms) => new Promise((r) => setTimeout(r, ms))
  const BUCHSTABE = /[\p{L}\p{M}\p{N}]/u

  const probeStil = document.createElement('style')
  probeStil.textContent =
    '[data-umbruch-probe], [data-umbruch-probe] * { overflow-wrap: normal !important; word-break: normal !important; }' +
    '*, *::before, *::after { transition: none !important; animation: none !important; }'
  document.head.appendChild(probeStil)

  async function warteBis(fn, ms = 8000) {
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      const v = fn()
      if (v) return v
      await schlaf(100)
    }
    return null
  }

  function name(el) {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).join('.') : ''
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }

  // Zeilen eines Elements: Zeichen für Zeichen die Oberkante, nur eigene Textknoten.
  function zeilen(el) {
    const out = []
    let cur = ''
    let lastTop = null
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue
      for (let i = 0; i < n.data.length; i++) {
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + 1)
        const rc = [...r.getClientRects()].find((x) => x.width > 0 || x.height > 0)
        if (!rc) {
          cur += n.data[i]
          continue
        }
        const top = Math.round(rc.top)
        if (lastTop !== null && Math.abs(top - lastTop) > 3) {
          out.push(cur)
          cur = ''
        }
        lastTop = top
        cur += n.data[i]
      }
    }
    out.push(cur)
    return out
  }

  // Dasselbe Element bei gleicher Breite ohne Notumbruch (overflow-wrap/word-break
  // normal): Bricht es dort gleich, war der Bruch eine Silbentrennung (mit Strich).
  function zeilenOhneNotumbruch(el) {
    let blk = el
    while (blk.parentElement && ['inline', 'contents'].includes(getComputedStyle(blk).display)) blk = blk.parentElement
    const pfad = []
    for (let x = el; x !== blk; x = x.parentElement) pfad.unshift([...x.parentElement.childNodes].indexOf(x))
    const r = blk.getBoundingClientRect()
    const klon = blk.cloneNode(true)
    klon.setAttribute('data-umbruch-probe', '')
    Object.assign(klon.style, {
      position: 'absolute',
      insetInlineStart: '0px',
      top: '0px',
      visibility: 'hidden',
      width: r.width + 'px',
      boxSizing: 'border-box',
      minWidth: '0px',
      maxWidth: 'none',
      margin: '0px',
      pointerEvents: 'none',
    })
    blk.parentElement.appendChild(klon)
    let ziel = klon
    for (const i of pfad) ziel = ziel.childNodes[i]
    const z = zeilen(ziel)
    const ueber = ziel.scrollWidth > ziel.clientWidth + 1
    klon.remove()
    return { z, ueber }
  }

  function brueche(el, z) {
    const out = []
    for (let i = 0; i < z.length - 1; i++) {
      const a = z[i]
      const b = z[i + 1]
      const aT = a.replace(/\s+$/u, '')
      const bT = b.replace(/^\s+/u, '')
      const stelle = a.slice(-16) + '|' + b.slice(0, 16)
      if (BUCHSTABE.test(a.slice(-1)) && BUCHSTABE.test(b.slice(0, 1))) {
        const ohne = zeilenOhneNotumbruch(el)
        const gleich = JSON.stringify(ohne.z) === JSON.stringify(z)
        out.push({ art: gleich ? 'getrennt' : 'im-wort', stelle })
      }
      if (/[:：]$/u.test(aT) && /^\p{Nd}/u.test(bT)) out.push({ art: 'zahl-getrennt', stelle })
      // „3 kişi", aber auch das Datum „7. September" / „7 września"
      else if (a !== aT && /\p{Nd}\.?$/u.test(aT) && /^\p{L}/u.test(bT)) out.push({ art: 'zahl-getrennt', stelle })
    }
    return out
  }

  function textElemente(wurzel) {
    const out = []
    for (const el of (wurzel ? document.querySelector(wurzel) : document.body).querySelectorAll('*')) {
      if (el.closest('style, script, [inert], [data-umbruch-probe]')) continue
      if (![...el.childNodes].some((c) => c.nodeType === 3 && c.data.trim())) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      out.push(el)
    }
    return out
  }

  function ueberbreite() {
    const B = document.documentElement.clientWidth
    const roll = []
    const ragt = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[inert], [data-umbruch-probe]')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)
        roll.push(name(el) + ' ' + el.scrollWidth + '>' + el.clientWidth)
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.right > B + 0.5 || r.left < -0.5) {
        let geklippt = false
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== 'visible') {
            const ar = a.getBoundingClientRect()
            if (ar.right <= B + 0.5 && ar.left >= -0.5) {
              geklippt = true
              break
            }
          }
        }
        ragt.push(name(el) + (geklippt ? ' (geklippt)' : '') + ' ' + Math.round(r.left) + '..' + Math.round(r.right))
      }
    }
    return {
      B,
      sw: document.documentElement.scrollWidth,
      zuBreit: document.documentElement.scrollWidth > B,
      roll,
      ragt: ragt.slice(0, 12),
      ragtAnzahl: ragt.length,
    }
  }

  // Text, der aus seinem eigenen Kasten ragt (überlappt dann Nachbarn, ohne die
  // Seite breiter zu machen) — z. B. „Notifications" unter dem Zähler.
  function textUeberlauf(wurzel) {
    const out = []
    for (const el of textElemente(wurzel)) {
      const cs = getComputedStyle(el)
      if (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis') continue
      const r = el.getBoundingClientRect()
      const links = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
      const rechts = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.data.trim()) continue
        const rg = document.createRange()
        rg.selectNodeContents(n)
        for (const rc of rg.getClientRects()) {
          if (!rc.width) continue
          const raus = Math.max(rc.right - rechts, links - rc.left)
          if (raus > 1.5) out.push(name(el) + ' „' + n.data.trim().slice(0, 30) + '" ' + Math.round(raus) + ' px')
        }
      }
    }
    return [...new Set(out)]
  }

  // Nachher-Simulation: Bezeichnung und Zahl mit geschütztem Leerzeichen binden.
  function nbspSimulieren() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    let zahl = 0
    while ((n = w.nextNode())) {
      if (n.parentElement?.closest('style, script')) continue
      const neu = n.data
        .replace(/([:：]) (\p{Nd})/gu, '$1' + NBSP + '$2')
        .replace(/(\p{Nd}\.?) (\p{L})/gu, '$1' + NBSP + '$2')
      if (neu !== n.data) {
        n.data = neu
        zahl++
      }
    }
    return zahl
  }

  // Nachher-Simulation: weiche Trennstellen in einzelnen Wörtern („Değerlen|dirme").
  function weichSimulieren(paare) {
    const SHY = String.fromCharCode(0xad)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    let zahl = 0
    while ((n = w.nextNode())) {
      for (const [wort, getrennt] of paare) {
        if (n.data.includes(wort)) {
          n.data = n.data.split(wort).join(getrennt.split('|').join(SHY))
          zahl++
        }
      }
    }
    return zahl
  }

  async function messe(ansicht, opt = {}) {
    if (opt.wurzel && !document.querySelector(opt.wurzel)) return { ansicht, fehler: 'nicht offen: ' + opt.wurzel, funde: [], wichtig: [], ueber: ueberbreite() }
    await document.fonts.ready
    const nbsp = opt.nbsp ? nbspSimulieren() : 0
    if (opt.weich) weichSimulieren(opt.weich)
    await schlaf(50)
    const funde = []
    const wichtig = []
    for (const el of textElemente(opt.wurzel)) {
      const z = zeilen(el)
      const b = z.length > 1 ? brueche(el, z) : []
      if (b.length) funde.push({ el: name(el), text: el.textContent.trim().slice(0, 60), b })
      if (el.matches('.einst-zeile-name, .sheet-sub, .sheet-title, .hd-name .klein-text, .bereich-name, .einst-nav-name'))
        wichtig.push({ el: name(el), zeilen: z })
    }
    return { ansicht, nbsp, ueber: ueberbreite(), funde, wichtig, textRaus: textUeberlauf(opt.wurzel) }
  }

  async function bereit(lang) {
    await warteBis(() => document.documentElement.lang === lang && document.querySelector('.einstellungen'))
    await schlaf(1500)
    await document.fonts.ready
    await schlaf(200)
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      fs: getComputedStyle(document.documentElement).getPropertyValue('--fs').trim(),
      desktop: !!document.querySelector('.einst-raster'),
    }
  }

  async function zuHilfsdiensten() {
    // Unter Last steht die Seite manchmal erst halb: auf Leiste oder zwei Karten warten.
    await warteBis(() => document.querySelectorAll('.einst-nav-eintrag').length > 2 || document.querySelectorAll('.einst-karte').length > 1, 10000)
    const nav = [...document.querySelectorAll('.einst-nav-eintrag')]
    if (nav.length) nav[2].click()
    else {
      const karten = document.querySelectorAll('.einst-karte')
      const z = karten[1].querySelectorAll('.einst-zeile')
      z[z.length - 1].click()
    }
    await warteBis(() => document.querySelector('.hd-karte'))
    await schlaf(500)
    await document.fonts.ready
    return !!document.querySelector('.hd-karte')
  }

  async function oeffneDienst(i) {
    const knoepfe = document.querySelectorAll('.hd-name')
    if (!knoepfe[i]) return { fehler: 'kein .hd-name ' + i + ' von ' + knoepfe.length, hd: !!document.querySelector('.hd-karte') }
    knoepfe[i].click()
    const da = await warteBis(() => document.querySelector('[role=dialog] .sheet-kopf'))
    await schlaf(700)
    await document.fonts.ready
    return da ? document.querySelector('.sheet-title')?.textContent ?? '' : { fehler: 'kein Blatt nach Klick', text: knoepfe[i].textContent }
  }

  async function schliesseBlatt() {
    document.querySelector('.sheet-backdrop')?.click()
    await warteBis(() => !document.querySelector('.sheet-kopf'), 3000)
    await schlaf(300)
    return !document.querySelector('.sheet-kopf')
  }

  function cssEinhaengen(text) {
    const s = document.createElement('style')
    s.setAttribute('data-nachher', '')
    s.textContent = text
    document.head.appendChild(s)
    return true
  }

  function trennProbe() {
    const probe = (lang, wort) => {
      const d = document.createElement('div')
      d.lang = lang
      d.style.cssText =
        'position:absolute;left:0;top:0;width:60px;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:normal;font:16px sans-serif;visibility:hidden'
      d.textContent = wort
      document.body.appendChild(d)
      const z = zeilen(d)
      d.remove()
      return lang + ': ' + z.join('|')
    }
    return [
      probe('de', 'Königreichssaal'),
      probe('en', 'internationalization'),
      probe('es', 'acomodadores'),
      probe('fr', 'responsabilités'),
      probe('it', 'responsabilità'),
      probe('pl', 'odpowiedzialność'),
      probe('ru', 'достопримечательность'),
      probe('uk', 'відповідальність'),
      probe('ro', 'responsabilitatea'),
      probe('tr', 'sorumluluklarımız'),
      probe('ar', 'المسؤوليات'),
      probe('fa', 'مسئولیت‌ها'),
    ]
  }

  window.__umbruch = { bereit, messe, zuHilfsdiensten, oeffneDienst, schliesseBlatt, cssEinhaengen, trennProbe }
  return true
})()
