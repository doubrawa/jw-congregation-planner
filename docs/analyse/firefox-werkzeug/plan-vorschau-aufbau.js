// Aufbau für die Vorschau eines Plans (T162): auf /demo.html „Winterdienst"
// öffnen, alle Wochen zeigen und in vier Zeilen eine Person wählen — die mit dem
// längsten Namen, eine mittlere, „Erik Kühn" (ihn kürzte Firefox 159) und die
// zweitlängste. Gibt die gewählten Namen zurück. Läuft in jeder Sprache der
// Seite (`l=`): Der Plan heißt in allen gleich, alles andere geht über Klassen.
(async () => {
  const schlaf = (ms) => new Promise((r) => setTimeout(r, ms))
  const warte = async (finde) => {
    for (let i = 0; i < 150; i++) {
      const treffer = finde()
      if (treffer) return treffer
      await schlaf(100)
    }
    throw new Error('nicht gefunden: ' + finde)
  }
  const plan = await warte(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Winterdienst')))
  plan.click()
  await warte(() => document.querySelector('.wp-gruppe-wahl'))
  document.querySelector('.wp-alle')?.click()
  await schlaf(300)

  const wahlen = () => [...document.querySelectorAll('.wp-gruppe-wahl')]
  const personen = [...wahlen()[0].options].filter((o) => o.value && !o.value.startsWith('g:'))
  personen.sort((x, y) => y.text.length - x.text.length)
  const erik = personen.find((o) => o.text === 'Erik Kühn') ?? personen[2]
  const zeilen = { 1: personen[0], 4: personen[Math.floor(personen.length / 2)], 7: erik, 10: personen[1] }
  for (const [nr, person] of Object.entries(zeilen)) {
    const wahl = wahlen()[Number(nr)]
    wahl.value = person.value
    wahl.dispatchEvent(new Event('change', { bubbles: true }))
    await schlaf(80)
  }
  await document.fonts.ready
  await schlaf(300)
  wahlen()[0].closest('.wp-vorschau-zeile').scrollIntoView({ block: 'start' })
  return wahlen().map((w) => w.selectedOptions[0]?.text).join(', ')
})()
