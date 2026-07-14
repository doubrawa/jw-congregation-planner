import { describe, expect, it } from 'vitest'
import { articleTitle, cleanText, songs, studyIssueSlugs, studySynopses } from './study'

// Synthetische Fixtures: bilden nur die *Struktur* der Studienausgabe-Seiten nach
// (synopsis-Karten, contextTitle, h2>a, pub-sjj, h1 data-pid, Ruby) — KEIN
// übernommener jw.org-Inhalt.

// Übersicht: eine datumslose Kopf-Karte (muss ignoriert werden) + drei Artikel-
// Karten, davon eine mit Monatswechsel im Zeitraum.
const FIXTURE_ISSUE = `
<div class="synopsis header">
  <p class="contextTitle">DER MUSTERTURM – STUDIENAUSGABE</p>
  <h3><a href="/de/x/musterturm-mai-2099/">Mai 2099</a></h3>
</div>
<div class="synopsis pub-w">
  <p class="contextTitle">   7.-13. September 2099   </p>
  <h2><a href="/de/x/musterturm-mai-2099/Erster-Beispielartikel/">Erster Beispielartikel</a></h2>
  <p class="desc">Wird in der Woche vom 7. bis 13. September 2099 behandelt.</p>
</div>
<div class="synopsis pub-w">
  <p class="contextTitle">   14.-20. September 2099   </p>
  <h2><a href="/de/x/musterturm-mai-2099/Zweiter-Beispielartikel/">Zweiter Beispielartikel</a></h2>
</div>
<div class="synopsis pub-w">
  <p class="contextTitle">   28. September–4. Oktober 2099   </p>
  <h2><a href="/de/x/musterturm-mai-2099/Dritter-Beispielartikel/">Dritter Beispielartikel</a></h2>
</div>
`

// Artikelseite: Sprach-Dialog-h1 ohne data-pid (muss übersprungen werden), der
// echte Titel-h1 mit data-pid, zwei pub-sjj-Lieder (Anfang/Ende) und dazwischen
// eine Bibelstelle mit gleichem <a><strong>-Markup, aber ohne pub-sjj.
const FIXTURE_ARTICLE = `
<div class="dialog"><h1>Sprache auswählen</h1></div>
<article>
  <p class="contextTitle">7.-13. September 2099</p>
  <p><a class="pub-sjj" data-page-id="mid1" href="/de/x/liederbuch/12-erstes-beispiellied/"><strong>LIED 12</strong></a> Erstes Beispiellied</p>
  <h1 class="du-color--coolGray-700" id="p3" data-pid="3">Beispiel-Studienartikel</h1>
  <p>Text mit <a class="pub-nwtsty" target="_blank" href="/de/x/bibel/2-beispielbuch/3/#v1"><strong>Beispielbuch 3:4-6</strong></a> als Bezug.</p>
  <div class="groupFootnote">
    <p><a class="pub-sjj" data-page-id="mid2" href="/de/x/liederbuch/34-zweites-beispiellied/"><strong>LIED 34</strong></a> Zweites Beispiellied</p>
  </div>
</article>
`

describe('studySynopses', () => {
  const syn = studySynopses(FIXTURE_ISSUE)

  it('ignoriert die datumslose Kopf-Karte (kein Off-by-one)', () => {
    expect(syn).toHaveLength(3)
    expect(syn[0].title).toBe('Erster Beispielartikel')
    expect(syn[0].href).toBe('/de/x/musterturm-mai-2099/Erster-Beispielartikel/')
  })

  it('paart Datum und Titel pro Karte korrekt', () => {
    expect(syn[0]).toMatchObject({ day: 7, mon: 9 })
    expect(syn[1]).toMatchObject({ day: 14, mon: 9, title: 'Zweiter Beispielartikel' })
  })

  it('nimmt bei Monatswechsel Tag+Monat des Zeitraum-Anfangs', () => {
    expect(syn[2]).toMatchObject({ day: 28, mon: 9, title: 'Dritter Beispielartikel' })
  })

  it('matcht eine Woche über Tag+Monat', () => {
    const hit = syn.find((s) => s.day === 7 && s.mon === 9)
    expect(hit?.title).toBe('Erster Beispielartikel')
  })
})

describe('articleTitle', () => {
  it('nimmt das erste <h1> mit data-pid, nicht den Sprach-Dialog', () => {
    expect(articleTitle(FIXTURE_ARTICLE)).toBe('Beispiel-Studienartikel')
  })
  it('gibt null ohne passendes h1', () => {
    expect(articleTitle('<h1>Nur ein Dialog</h1>')).toBeNull()
  })
})

describe('songs', () => {
  const out = songs(FIXTURE_ARTICLE)

  it('erfasst genau die pub-sjj-Lieder (Anfang + Ende), keine Bibelstelle', () => {
    expect(out).toEqual(['LIED 12 Erstes Beispiellied', 'LIED 34 Zweites Beispiellied'])
  })
  it('Anfang = erstes, Schluss = letztes', () => {
    expect(out[0]).toBe('LIED 12 Erstes Beispiellied')
    expect(out[out.length - 1]).toBe('LIED 34 Zweites Beispiellied')
  })
})

describe('cleanText (CJK/Ruby)', () => {
  it('entfernt Ruby-Lesungen (rt) und zieht CJK-Leerzeichen zusammen', () => {
    const html = '<span>98</span> <ruby><rb>番</rb><rt>ばん</rt></ruby> <ruby><rb>歌</rb><rt>うた</rt></ruby>'
    expect(cleanText(html)).toBe('98番歌')
  })
  it('bewahrt koreanische Wort-Leerzeichen (kein Hangul-Kollaps)', () => {
    expect(cleanText('노래 98 밝은 빛')).toBe('노래 98 밝은 빛')
  })
  it('lässt lateinischen Text mit Leerzeichen unangetastet', () => {
    expect(cleanText('LIED 98 Ein Beispiel')).toBe('LIED 98 Ein Beispiel')
  })
})

describe('studyIssueSlugs', () => {
  it('probiert die Ausgaben von Monat −2 und −3', () => {
    const slugs = studyIssueSlugs(new Date(Date.UTC(2099, 8, 7))) // 7. September 2099
    expect(slugs).toEqual([
      'wachtturm-studienausgabe-juli-2099',
      'wachtturm-studienausgabe-juni-2099',
    ])
  })
})
