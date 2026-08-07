import { describe, expect, it } from 'vitest'
import { parseWorkbookWeek, type ImportedPart } from './parse'

/**
 * Der Parser in den Schriften der Welt.
 *
 * Die Wochenseite gibt es in ~480 Sprachen mit gleicher Struktur — der Parser
 * keyt deshalb auf Struktur, nicht auf Text. Nur greift „Struktur“ weiter, als
 * es zunächst aussieht: Klammern, Ziffern, Satzenden und Zwischenräume sehen je
 * Schrift anders aus. Wer nur die westliche Form kennt, verliert genau in den
 * Sprachen alles, die am seltensten jemand nachprüft.
 *
 * **Woher die Muster stammen.** Gemessen an der echten Wochenseite
 * 6.–12. Juli 2026 in 19 Sprachen (T59). Vorher blieb die komplette Meta-Zeile
 * — Minuten, Rahmen und Quellenangabe — leer in **sieben** davon: ar, fa, he,
 * ur, sw, ja und cmn-hans. Auf Chinesisch stand zusätzlich mitten im Programm
 * die deutsche Rückfall-Zeile „Schlussworte · Gebet“.
 *
 * **Die Fixtures sind synthetisch** (wie in `parse.test.ts`): sie bilden die
 * gemessenen Schrift- und Auszeichnungsmuster nach — Klammernform, Ziffern,
 * Zweirichtungs-Marken, Ruby, Satzende —, aber kein jw.org-Inhalt. Die Titel
 * sind erfundene Allerweltswörter; auf ihre Bedeutung kommt es nicht an, nur
 * darauf, dass die Zeichen echt sind.
 */

/** Gerüst einer Wochenseite: ein Schätze-Punkt, ein Schülerteil, der Abschluss. */
function seite(o: {
  h1: string
  buch: string
  /** Überschrift eines nummerierten Punkts, inklusive Nummer und Trennzeichen. */
  punkt1: string
  punkt2: string
  /** Zeitzeile des Schätze-Punkts. */
  zeit1: string
  /** Zeitzeile des Schülerteils: Zeit, Rahmen, Quelle. */
  zeit2: string
  /** Schlusszeile (h3). */
  schluss: string
}): string {
  return `
<article>
  <h1 data-pid="1">${o.h1}</h1>
  <h2 data-pid="2">${o.buch}</h2>
  <h2 data-pid="4" class="du-color--teal-700">ABSCHNITT A</h2>
  <h3 data-pid="5" class="du-color--teal-700">${o.punkt1}</h3>
  <p data-pid="6">${o.zeit1}</p>
  <h2 data-pid="18" class="du-color--gold-700">ABSCHNITT B</h2>
  <h3 data-pid="19" class="du-color--gold-700">${o.punkt2}</h3>
  <p data-pid="20">${o.zeit2}</p>
  <h3 data-pid="47">${o.schluss}</h3>
</article>`
}

const teil = (html: string, farbe: string, i = 0): ImportedPart =>
  parseWorkbookWeek(html).mid.sections.find((s) => s.farbe === farbe)!.items[i] as ImportedPart

const schluss = (html: string): ImportedPart =>
  parseWorkbookWeek(html).mid.sections.find((s) => s.label === 'ABSCHLUSS')!.items[0] as ImportedPart

/* ---- Hebräisch: Zweirichtungs-Marken rings um die Klammer ---------------- */

describe('Hebräisch — unsichtbare Marken vor und hinter der Klammer', () => {
  // Gemessen: die Zeitzeile lautet wörtlich `‏(‏10 דק׳)‏` — eine RLM-Marke steht
  // VOR der Klammer und eine gleich dahinter. `^\s*\(\s*\d` scheiterte an
  // beidem, weil eine Marke kein Leerraum ist.
  const html = seite({
    h1: '6–12 בחודש',
    buch: 'ספר יג–טו',
    punkt1: '1. ‏ כותרת ראשונה',
    punkt2: '4. ‏ כותרת שנייה',
    zeit1: '‏(‏10 דק׳)‏',
    zeit2: '‏(‏3 דק׳)‏ מבית לבית. משפט נוסף. (lmd שיעור 1 נקודה 5)',
    schluss: 'דברי סיכום ‏(‏3 דק׳)‏ | שיר 61',
  })

  it('liest Minuten trotz der Marken', () => {
    expect(teil(html, 'petrol').meta).toBe('10 דק׳')
  })

  it('liest Rahmen und Quelle des Schülerteils', () => {
    expect(teil(html, 'gold').meta).toBe('מבית לבית · 3 דק׳ · lmd שיעור 1 נקודה 5')
  })

  it('lässt keine Marke am Titelrand stehen', () => {
    // `trim()` entfernt nur Leerraum — die Marke blieb sonst vorn kleben.
    expect(teil(html, 'petrol').title).toBe('כותרת ראשונה')
  })
})

/* ---- Arabisch/Persisch: eigene Ziffern, Bindestrich als Nummerntrenner --- */

describe('Arabisch — arabisch-indische Ziffern', () => {
  // Gemessen: Nummerierung „١-‏“ (Ziffer + Bindestrich, nicht Punkt), Zeitzeile
  // „(١٠ دق)“. `\d` kennt nur 0–9, `Number('١')` ist NaN.
  const html = seite({
    h1: '٦–١٢ تموز',
    buch: 'كتاب ١٣–١٥',
    punkt1: '١-‏ عنوان اول',
    punkt2: '٤-‏ عنوان ثاني',
    zeit1: '(١٠ دق)',
    zeit2: '(٣ دق) من بيت إلى بيت. جملة اخرى. (lmd الدرس ١ النقطة ٥)',
    schluss: 'تعليقات ختامية (٣ دق) | ترنيمة ٦١',
  })

  it('liest die Punktnummer als Zahl', () => {
    expect(teil(html, 'petrol').num).toBe(1)
    expect(teil(html, 'gold').num).toBe(4)
  })

  it('nimmt die Nummer aus dem Titel', () => {
    expect(teil(html, 'petrol').title).toBe('عنوان اول')
  })

  it('liest Minuten, Rahmen und Quelle', () => {
    expect(teil(html, 'gold').meta).toBe('من بيت إلى بيت · ٣ دق · lmd الدرس ١ النقطة ٥')
  })
})

/* ---- Swahili: das Wort steht vor der Zahl ------------------------------- */

describe('Swahili — „(Dak. 10)“, Wort vor der Zahl', () => {
  // Der Beleg dafür, dass es nicht an fremden Schriften hängt: Swahili nutzt
  // lateinische Buchstaben und westliche Ziffern — und fiel trotzdem komplett
  // aus, weil die alte Regel die Ziffer unmittelbar hinter der Klammer verlangte.
  const html = seite({
    h1: 'Julai 6–12',
    buch: 'KITABU 13-15',
    punkt1: '1. Kichwa cha Kwanza',
    punkt2: '4. Kichwa cha Pili',
    zeit1: '(Dak. 10)',
    zeit2: '(Dak. 3) NYUMBA KWA NYUMBA. Sentensi nyingine. (lmd somo la 1 jambo 5)',
    schluss: 'Umalizio (Dak. 3) | Wimbo 61',
  })

  it('liest Minuten, Rahmen und Quelle', () => {
    expect(teil(html, 'gold').meta).toBe('NYUMBA KWA NYUMBA · Dak. 3 · lmd somo la 1 jambo 5')
  })

  it('erkennt eine Aufzählung weiterhin nicht als Zeit', () => {
    // Die Lockerung darf nicht jede Klammer zur Zeitzeile machen.
    const ohne = seite({ ...bausteine, zeit1: '(a) Eine Aufzählung' })
    expect(teil(ohne, 'petrol').meta).toBe('')
  })

  const bausteine = {
    h1: 'Julai 6–12',
    buch: 'KITABU 13-15',
    punkt1: '1. Kichwa cha Kwanza',
    punkt2: '4. Kichwa cha Pili',
    zeit1: '(Dak. 10)',
    zeit2: '(Dak. 3) NYUMBA KWA NYUMBA. Sentensi. (lmd somo la 1)',
    schluss: 'Umalizio (Dak. 3) | Wimbo 61',
  }
})

/* ---- Chinesisch: vollbreite Klammern, Pinyin, kein Noten-Symbol --------- */

describe('Chinesisch — vollbreite Klammern und Pinyin-Lesehilfe', () => {
  // Drei Fallen auf einmal, alle gemessen:
  //  1. die Zeit steht in vollbreiten Klammern „（10 分钟）“
  //  2. jedes Wort steckt in `<ruby><rb><strong>…` — die Lesehilfe landete im
  //     Titel und das allgemeine Tag→Leerzeichen zerlegte ihn in Einzelteile
  //  3. die Schlusszeile trägt KEIN Noten-Symbol, nur einen Liederbuch-Link
  const ruby = (zeichen: string, pinyin: string) =>
    `<ruby><rb><strong>${zeichen}</strong></rb><rt><strong>${pinyin}</strong></rt></ruby>`
  const html = seite({
    h1: '7月6–12日',
    buch: `${ruby('书卷', 'shūjuàn')}13－15${ruby('章', 'zhāng')}`,
    punkt1: `1．${ruby('第一', 'dìyī')}${ruby('标题', 'biāotí')}`,
    punkt2: `4．${ruby('第二', 'dìèr')}${ruby('标题', 'biāotí')}`,
    zeit1: '（10 分钟）',
    zeit2: '（3 分钟）向住户作见证。另一句话。（lmd 第1课第5点）',
    schluss: `${ruby('结语', 'Jiéyǔ')}（3 分钟）<strong>|</strong><a class="pub-sjj" href="#">${ruby('唱诗', 'Chàngshī')}61</a>`,
  })

  it('liest Minuten aus vollbreiten Klammern', () => {
    // Ohne Fuge zwischen Zahl und Einheit: im Chinesischen und Japanischen
    // steht dort keine. Diese Regel kam aus `study.ts` (Wachtturm-Artikel) und
    // gilt seit der Zusammenführung in `text.ts` für beide Parser — vorher war
    // derselbe Text im Artikel sauber und im Programm zerfranst.
    expect(teil(html, 'petrol').meta).toBe('10分钟')
  })

  it('lässt die Lesehilfe weg und klebt den Grundtext zusammen', () => {
    // Vorher: „第一 dìyī 标题 biāotí“ — Lesehilfe im Titel und jedes Zeichen
    // durch das entfernte Tag auseinandergerissen.
    expect(teil(html, 'petrol').title).toBe('第一标题')
    expect(parseWorkbookWeek(html).book).toBe('书卷13－15章')
  })

  it('liest die Punktnummer trotz vollbreitem Punkt', () => {
    expect(teil(html, 'petrol').num).toBe(1)
  })

  it('erkennt den Abschluss am Liederbuch-Link statt am Noten-Symbol', () => {
    // Sonst trat die deutsche Rückfall-Vorlage an seine Stelle — „Schlussworte ·
    // Gebet“ mitten in einem chinesischen Programm.
    expect(schluss(html).title).toContain('结语')
    expect(schluss(html).title).not.toContain('Schlussworte')
    expect(schluss(html).meta).toBe('3分钟')
  })
})

/* ---- Japanisch: Ruby mit <rb>, westliche Nummerierung ------------------- */

describe('Japanisch — Furigana über jedem Zeichen', () => {
  const ruby = (zeichen: string, lesung: string) =>
    `<ruby><rb>${zeichen}</rb><rt>${lesung}</rt></ruby>`
  const html = seite({
    h1: '7月6–12日',
    buch: `${ruby('書', 'しょ')}13-15`,
    punkt1: `1. ${ruby('見', 'み')}${ruby('出', 'だ')}し`,
    punkt2: `4. ${ruby('第', 'だい')}２${ruby('項', 'こう')}`,
    zeit1: '（10 分）',
    zeit2: '（3 分）家から家で。別の文。（lmd レッスン1）',
    schluss: `${ruby('閉', 'へい')}${ruby('会', 'かい')}（3 分）| <span class="dc-icon--music"><a href="#">61</a></span>`,
  })

  it('fügt den Grundtext ohne Leerstellen zusammen', () => {
    expect(teil(html, 'petrol').title).toBe('見出し')
  })

  it('liest Minuten und Rahmen', () => {
    expect(teil(html, 'petrol').meta).toBe('10分')
    expect(teil(html, 'gold').meta).toBe('家から家で · 3分 · lmd レッスン1')
  })
})

/* ---- Hindi: Danda statt Punkt ------------------------------------------ */

describe('Hindi — Danda als Satzende', () => {
  // Der Rahmen endet am Danda „।“, nicht am Punkt. Vorher lief er bis in die
  // Quellenangabe hinein, fiel dort durch die Ziffernprüfung und blieb leer.
  const html = seite({
    h1: '6–12 जुलाई',
    buch: 'पुस्तक 13-15',
    punkt1: '1. पहला शीर्षक',
    punkt2: '4. दूसरा शीर्षक',
    zeit1: '(10 मि.)',
    zeit2: '(3 मि.) घर-घर का प्रचार। एक और वाक्य। (lmd पाठ 1 मुद्दा 5)',
    schluss: 'समाप्ति (3 मि.) | गीत 61',
  })

  it('liest den Rahmen bis zum Danda', () => {
    expect(teil(html, 'gold').meta).toBe('घर-घर का प्रचार · 3 मि. · lmd पाठ 1 मुद्दा 5')
  })
})

/* ---- Thai: kein Satzende — bewusst leerer Rahmen ----------------------- */

describe('Thai — ohne Satzzeichen bleibt der Rahmen leer', () => {
  // Thai trennt Sätze durch Leerzeichen, nicht durch Satzzeichen. Damit gibt es
  // nichts, woran der Rahmen enden könnte — er bleibt leer. Das ist die
  // gewollte Antwort: lieber kein Rahmen als der halbe Folgesatz in der
  // Meta-Zeile. Festgehalten, damit es eine Entscheidung bleibt und nicht als
  // unbemerkte Lücke durchgeht.
  const html = seite({
    h1: 'วันที่ 6–12',
    buch: 'หนังสือ 13-15',
    punkt1: '1. หัวข้อแรก',
    punkt2: '4. หัวข้อสอง',
    zeit1: '(10 นาที)',
    zeit2: '(3 นาที) ตามบ้าน ประโยคถัดไป (lmd บทเรียน 1 ข้อ 5)',
    schluss: 'คำกล่าวปิด (3 นาที) | เพลง 61',
  })

  it('liest Minuten und Quelle, aber keinen Rahmen', () => {
    expect(teil(html, 'gold').meta).toBe('3 นาที · lmd บทเรียน 1 ข้อ 5')
  })
})

/* ---- Gegenprobe: die deutsche Seite bleibt Zeichen für Zeichen gleich --- */

describe('Deutsch bleibt unverändert', () => {
  const html = seite({
    h1: '6.–12. Juli',
    buch: 'BUCH 13-15',
    punkt1: '1. Erster Punkt',
    punkt2: '4. Gespräche beginnen',
    zeit1: '(10 Min.)',
    zeit2: '(3 Min.) VON HAUS ZU HAUS. Noch ein Satz. (lmd Lektion 1 Punkt 5)',
    schluss: 'Schlussworte (3 Min.) | <span class="dc-icon--music">Lied 61</span>',
  })

  it('liest wie zuvor', () => {
    expect(teil(html, 'petrol').meta).toBe('10 Min.')
    expect(teil(html, 'petrol').num).toBe(1)
    expect(teil(html, 'gold').meta).toBe('VON HAUS ZU HAUS · 3 Min. · lmd Lektion 1 Punkt 5')
    expect(schluss(html).meta).toBe('3 Min.')
  })

  it('trennt Wörter weiterhin, wo Auszeichnung sie trennt', () => {
    // Inline-Auszeichnung fällt ersatzlos weg (`<b>Wort</b><i>zwei</i>` heißt
    // „Wortzwei“) — echte Zwischenräume im Text bleiben aber erhalten.
    const mitAuszeichnung = seite({
      h1: 'x', buch: 'y', punkt1: '1. <strong>Erster</strong> <em>Punkt</em>',
      punkt2: '4. Zweiter', zeit1: '(10 Min.)', zeit2: '(3 Min.)', schluss: 'Ende (3 Min.) | Lied 1',
    })
    expect(teil(mitAuszeichnung, 'petrol').title).toBe('Erster Punkt')
  })
})
