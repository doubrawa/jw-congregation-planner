// Je Auswahl der Vorschau: Passt der Name hinein, steht das ✕ daneben, ragt
// etwas aus der Zeile? Gemeldet werden nur die Zeilen, die nicht ganz und
// daneben sind.
//
// Die Breite des Namens misst eine unsichtbare Probe im Dokument, nicht
// `canvas.measureText`: Das maß bei Stufe 1,15 jeden Namen bis 0,75 px breiter
// als das Layout und meldete Kürzungen, die es nicht gab (Firefox 159, 6.11.2026).
(() => {
  const doc = document.documentElement
  const rollbalken = doc.scrollWidth > doc.clientWidth
  const probe = document.body.appendChild(document.createElement('span'))
  probe.style.cssText = 'position: fixed; inset: 0 auto auto 0; visibility: hidden; white-space: pre'
  const SCHRIFT = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'letterSpacing', 'fontFeatureSettings', 'fontVariationSettings', 'fontKerning']
  const auffaellig = []
  const wahlen = [...document.querySelectorAll('.wp-gruppe-wahl')]
  for (const wahl of wahlen) {
    const stil = getComputedStyle(wahl)
    for (const k of SCHRIFT) probe.style[k] = stil[k]
    const name = wahl.selectedOptions[0]?.text ?? ''
    probe.textContent = name
    const r = wahl.getBoundingClientRect()
    const rand = ['borderLeftWidth', 'borderRightWidth', 'paddingLeft', 'paddingRight'].reduce((s, k) => s + parseFloat(stil[k]), 0)
    const luecke = r.width - rand - probe.getBoundingClientRect().width
    const x = wahl.parentElement.querySelector('.wp-auslassen').getBoundingClientRect()
    const zeile = wahl.closest('.wp-vorschau-zeile').getBoundingClientRect()
    const ragt = [r, x].some((kasten) => kasten.left < zeile.left - 0.5 || kasten.right > zeile.right + 0.5)
    const befunde = [
      luecke < -0.001 && `gekürzt um ${(-luecke).toFixed(3)} px`,
      Math.abs(x.top + x.height / 2 - (r.top + r.height / 2)) >= 2 && '✕ darunter',
      ragt && 'ragt hinaus',
    ].filter(Boolean)
    if (befunde.length) auffaellig.push(`${name}: ${befunde.join(', ')}`)
  }
  probe.remove()
  return JSON.stringify({ zeilen: wahlen.length, rollbalken, auffaellig })
})()
