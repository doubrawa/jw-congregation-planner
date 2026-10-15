/**
 * Bibelbuchnamen und -kuerzel je Sprache — Quelle: die Neue-Welt-Uebersetzung
 * auf jw.org (Buecheruebersicht, positionsweise uebernommen; die Reihenfolge
 * der 66 Buecher ist in jeder Sprache dieselbe).
 *
 * Hier stand frueher genau EIN Buch: "Jeremia", das Buch der Demo-Woche. Alle
 * anderen 65 blieben in jeder Sprache deutsch stehen.
 *
 * Form: pipe-getrennte Listen in kanonischer Reihenfolge statt Objekte. Als
 * Objekte stuende derselbe deutsche Schluessel je Sprache einmal im Bundle; so
 * kostet die volle Abdeckung nur einen Bruchteil. Die Zuordnung baut
 * buchTabelle() beim ersten Gebrauch und merkt sie sich.
 *
 * Erzeugt von scratchpad/gen-books.mjs — nicht von Hand pflegen. Seit dem
 * 15.10.2026 nur noch für die elf App-Sprachen außer Deutsch (vorher 33).
 *
 * **Welche Kurzform, entscheidet das Arbeitsheft** (nachgemessen am 26.9.2026
 * an 2805 Schriftstellen aus zwölf Wochen, Juli bis Dezember 2026). Die
 * WOL-Bibelübersicht führt je Buch zwei Kurzformen, „abbreviation" und
 * „official", und die Sprachen benutzen nicht dieselbe: Die meisten schreiben
 * im Heft die offizielle („Jer 36:1-13"), Persisch gar keine — dort steht der
 * volle Name („اِرْمیا ۳۶:۱-۱۳"; die Liste stand auf „ار").
 */

/** Die 66 Buecher auf Deutsch, kanonische Reihenfolge (Bezugsliste). */
const DE_VOLL = "1. Mose|2. Mose|3. Mose|4. Mose|5. Mose|Josua|Richter|Ruth|1. Samuel|2. Samuel|1. Könige|2. Könige|1. Chronika|2. Chronika|Esra|Nehemia|Esther|Hiob|Psalmen|Sprüche|Prediger|Hohes Lied|Jesaja|Jeremia|Klagelieder|Hesekiel|Daniel|Hosea|Joel|Amos|Obadja|Jona|Micha|Nahum|Habakuk|Zephanja|Haggai|Sacharja|Maleachi|Matthäus|Markus|Lukas|Johannes|Apostelgeschichte|Römer|1. Korinther|2. Korinther|Galater|Epheser|Philipper|Kolosser|1. Thessalonicher|2. Thessalonicher|1. Timotheus|2. Timotheus|Titus|Philemon|Hebräer|Jakobus|1. Petrus|2. Petrus|1. Johannes|2. Johannes|3. Johannes|Judas|Offenbarung"

/** Dieselben Buecher als Kuerzel ("1Mo", "Jer" …). */
const DE_KURZ = "1Mo|2Mo|3Mo|4Mo|5Mo|Jos|Ri|Ru|1Sa|2Sa|1Kö|2Kö|1Ch|2Ch|Esr|Ne|Est|Hi|Ps|Spr|Pr|Hoh|Jes|Jer|Klg|Hes|Da|Hos|Joel|Am|Ob|Jon|Mi|Nah|Hab|Ze|Hag|Sach|Mal|Mat|Mar|Luk|Joh|Apg|Rö|1Ko|2Ko|Gal|Eph|Php|Kol|1Th|2Th|1Ti|2Ti|Tit|Phm|Heb|Jak|1Pe|2Pe|1Jo|2Jo|3Jo|Jud|Off"

/** Sprachcode -> [Namen, Kuerzel], je pipe-getrennt in kanonischer Reihenfolge. */
const ZIEL: Record<string, [string, string]> = {
  en: ["Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation", "Ge|Ex|Le|Nu|De|Jos|Jg|Ru|1Sa|2Sa|1Ki|2Ki|1Ch|2Ch|Ezr|Ne|Es|Job|Ps|Pr|Ec|Ca|Isa|Jer|La|Eze|Da|Ho|Joe|Am|Ob|Jon|Mic|Na|Hab|Zep|Hag|Zec|Mal|Mt|Mr|Lu|Joh|Ac|Ro|1Co|2Co|Ga|Eph|Php|Col|1Th|2Th|1Ti|2Ti|Tit|Phm|Heb|Jas|1Pe|2Pe|1Jo|2Jo|3Jo|Jude|Re"],
  es: ["Génesis|Éxodo|Levítico|Números|Deuteronomio|Josué|Jueces|Rut|1 Samuel|2 Samuel|1 Reyes|2 Reyes|1 Crónicas|2 Crónicas|Esdras|Nehemías|Ester|Job|Salmos|Proverbios|Eclesiastés|El Cantar de los Cantares|Isaías|Jeremías|Lamentaciones|Ezequiel|Daniel|Oseas|Joel|Amós|Abdías|Jonás|Miqueas|Nahúm|Habacuc|Sofonías|Ageo|Zacarías|Malaquías|Mateo|Marcos|Lucas|Juan|Hechos|Romanos|1 Corintios|2 Corintios|Gálatas|Efesios|Filipenses|Colosenses|1 Tesalonicenses|2 Tesalonicenses|1 Timoteo|2 Timoteo|Tito|Filemón|Hebreos|Santiago|1 Pedro|2 Pedro|1 Juan|2 Juan|3 Juan|Judas|Apocalipsis", "Gé|Éx|Le|Nú|Dt|Jos|Jue|Rut|1Sa|2Sa|1Re|2Re|1Cr|2Cr|Esd|Ne|Est|Job|Sl|Pr|Ec|Can|Is|Jer|Lam|Eze|Da|Os|Joe|Am|Abd|Jon|Miq|Na|Hab|Sof|Ag|Zac|Mal|Mt|Mr|Lu|Jn|Hch|Ro|1Co|2Co|Gál|Ef|Flp|Col|1Te|2Te|1Ti|2Ti|Tit|Flm|Heb|Snt|1Pe|2Pe|1Jn|2Jn|3Jn|Jud|Ap"],
  fr: ["Genèse|Exode|Lévitique|Nombres|Deutéronome|Josué|Juges|Ruth|1 Samuel|2 Samuel|1 Rois|2 Rois|1 Chroniques|2 Chroniques|Esdras|Néhémie|Esther|Job|Psaumes|Proverbes|Ecclésiaste|Chant de Salomon|Isaïe|Jérémie|Lamentations|Ézéchiel|Daniel|Osée|Joël|Amos|Abdias|Jonas|Michée|Nahum|Habacuc|Sophonie|Aggée|Zacharie|Malachie|Matthieu|Marc|Luc|Jean|Actes|Romains|1 Corinthiens|2 Corinthiens|Galates|Éphésiens|Philippiens|Colossiens|1 Thessaloniciens|2 Thessaloniciens|1 Timothée|2 Timothée|Tite|Philémon|Hébreux|Jacques|1 Pierre|2 Pierre|1 Jean|2 Jean|3 Jean|Jude|Révélation", "Gn|Ex|Lv|Nb|Dt|Jos|Jg|Ru|1S|2S|1R|2R|1Ch|2Ch|Esd|Né|Est|Jb|Ps|Pr|Ec|Ct|Is|Jr|Lm|Éz|Dn|Os|Jl|Am|Ab|Jon|Mi|Na|Hab|Sph|Ag|Za|Ml|Mt|Mc|Lc|Jean|Ac|Rm|1Co|2Co|Ga|Éph|Php|Col|1Th|2Th|1Tm|2Tm|Tt|Phm|Hé|Jc|1P|2P|1J|2J|3J|Jude|Ré"],
  it: ["Genesi|Esodo|Levitico|Numeri|Deuteronomio|Giosuè|Giudici|Rut|1 Samuele|2 Samuele|1 Re|2 Re|1 Cronache|2 Cronache|Esdra|Neemia|Ester|Giobbe|Salmi|Proverbi|Ecclesiaste|Cantico dei Cantici|Isaia|Geremia|Lamentazioni|Ezechiele|Daniele|Osea|Gioele|Amos|Abdia|Giona|Michea|Naum|Abacuc|Sofonia|Aggeo|Zaccaria|Malachia|Matteo|Marco|Luca|Giovanni|Atti|Romani|1 Corinti|2 Corinti|Galati|Efesini|Filippesi|Colossesi|1 Tessalonicesi|2 Tessalonicesi|1 Timoteo|2 Timoteo|Tito|Filemone|Ebrei|Giacomo|1 Pietro|2 Pietro|1 Giovanni|2 Giovanni|3 Giovanni|Giuda|Rivelazione", "Gen|Eso|Le|Nu|De|Gsè|Gdc|Ru|1Sa|2Sa|1Re|2Re|1Cr|2Cr|Esd|Ne|Est|Gb|Sl|Pr|Ec|Ca|Isa|Ger|La|Ez|Da|Os|Gle|Am|Abd|Gna|Mic|Na|Aba|Sof|Ag|Zac|Mal|Mt|Mr|Lu|Gv|At|Ro|1Co|2Co|Gal|Ef|Flp|Col|1Ts|2Ts|1Tm|2Tm|Tit|Flm|Eb|Gc|1Pt|2Pt|1Gv|2Gv|3Gv|Gda|Ri"],
  pl: ["Rodzaju|Wyjścia|Kapłańska|Liczb|Powtórzonego Prawa|Jozuego|Sędziów|Rut|1 Samuela|2 Samuela|1 Królów|2 Królów|1 Kronik|2 Kronik|Ezdrasza|Nehemiasza|Estery|Hioba|Psalmy|Przysłów|Kaznodziei|Pieśń|Izajasza|Jeremiasza|Lamentacje|Ezechiela|Daniela|Ozeasza|Joela|Amosa|Abdiasza|Jonasza|Micheasza|Nahuma|Habakuka|Sofoniasza|Aggeusza|Zachariasza|Malachiasza|Mateusza|Marka|Łukasza|Jana|Dzieje|Rzymian|1 Koryntian|2 Koryntian|Galatów|Efezjan|Filipian|Kolosan|1 Tesaloniczan|2 Tesaloniczan|1 Tymoteusza|2 Tymoteusza|Tytusa|Filemona|Hebrajczyków|Jakuba|1 Piotra|2 Piotra|1 Jana|2 Jana|3 Jana|Judy|Objawienie", "Rdz|Wj|Kpł|Lb|Pwt|Joz|Sdz|Rut|1Sm|2Sm|1Kl|2Kl|1Kn|2Kn|Ezd|Neh|Est|Hi|Ps|Prz|Kzn|PnP|Iz|Jer|Lam|Eze|Dn|Oz|Jl|Am|Abd|Jon|Mi|Nah|Hab|Sof|Ag|Za|Mal|Mt|Mk|Łk|Jn|Dz|Rz|1Ko|2Ko|Gal|Ef|Flp|Kol|1Ts|2Ts|1Tm|2Tm|Tyt|Flm|Heb|Jak|1Pt|2Pt|1Jn|2Jn|3Jn|Judy|Obj"],
  ru: ["Бытие|Исход|Левит|Числа|Второзаконие|Иисус Навин|Судей|Руфь|1 Самуила|2 Самуила|1 Царей|2 Царей|1 Летопись|2 Летопись|Ездра|Неемия|Эсфирь|Иов|Псалмы|Притчи|Экклезиаст|Песня Соломона|Исайя|Иеремия|Плач Иеремии|Иезекииль|Даниил|Осия|Иоиль|Амос|Авдий|Иона|Михей|Наум|Аввакум|Софония|Аггей|Захария|Малахия|Матфея|Марка|Луки|Иоанна|Деяния|Римлянам|1 Коринфянам|2 Коринфянам|Галатам|Эфесянам|Филиппийцам|Колоссянам|1 Фессалоникийцам|2 Фессалоникийцам|1 Тимофею|2 Тимофею|Титу|Филимону|Евреям|Иакова|1 Петра|2 Петра|1 Иоанна|2 Иоанна|3 Иоанна|Иуды|Откровение", "Бт|Исх|Лв|Чс|Вт|ИсН|Сд|Рф|1См|2См|1Цр|2Цр|1Лт|2Лт|Езд|Не|Эсф|Иов|Пс|Пр|Эк|Псн|Иса|Иер|Пл|Иез|Дан|Ос|Ил|Ам|Авд|Ион|Мх|На|Авв|Сф|Аг|Зх|Мл|Мф|Мк|Лк|Ин|Де|Рм|1Кр|2Кр|Гл|Эф|Фп|Кл|1Фс|2Фс|1Тм|2Тм|Тит|Фм|Евр|Иак|1Пт|2Пт|1Ин|2Ин|3Ин|Иуды|Отк"],
  uk: ["Буття|Вихід|Левіт|Числа|Повторення Закону|Ісуса Навина|Суддів|Рут|1 Самуїла|2 Самуїла|1 Царів|2 Царів|1 Хронік|2 Хронік|Ездри|Неемії|Естер|Йова|Псалми|Прислів’я|Екклезіаста|Пісня над піснями|Ісаї|Єремії|Плач Єремії|Єзекіїля|Даниїла|Осії|Йоіла|Амоса|Овдія|Йони|Михея|Наума|Авакума|Софонії|Огія|Захарія|Малахії|Матвія|Марка|Луки|Івана|Дії|Римлян|1 Коринфян|2 Коринфян|Галатів|Ефесян|Філіппійців|Колоссян|1 Фессалонікійців|2 Фессалонікійців|1 Тимофія|2 Тимофія|Тита|Филимона|Євреїв|Якова|1 Петра|2 Петра|1 Івана|2 Івана|3 Івана|Юди|Об’явлення", "Бт|Вх|Лв|Чс|Пв|ІсН|Сд|Рт|1См|2См|1Цр|2Цр|1Хр|2Хр|Езд|Не|Ес|Йв|Пс|Пр|Ек|Псн|Іс|Єр|Пл|Єз|Дн|Ос|Йл|Ам|Ов|Йн|Мих|На|Ав|Сф|Ог|Зх|Мл|Мт|Мр|Лк|Ів|Дії|Рм|1Кр|2Кр|Гл|Еф|Флп|Кл|1Фс|2Фс|1Тм|2Тм|Тит|Флм|Єв|Як|1Пт|2Пт|1Ів|2Ів|3Ів|Юд|Об"],
  ro: ["Geneza|Exodul|Leviticul|Numerele|Deuteronomul|Iosua|Judecătorii|Rut|1 Samuel|2 Samuel|1 Regi|2 Regi|1 Cronici|2 Cronici|Ezra|Neemia|Estera|Iov|Psalmii|Proverbele|Eclesiastul|Cântarea cântărilor|Isaia|Ieremia|Plângerile|Ezechiel|Daniel|Osea|Ioel|Amos|Obadia|Iona|Mica|Naum|Habacuc|Țefania|Hagai|Zaharia|Maleahi|Matei|Marcu|Luca|Ioan|Faptele|Romani|1 Corinteni|2 Corinteni|Galateni|Efeseni|Filipeni|Coloseni|1 Tesaloniceni|2 Tesaloniceni|1 Timotei|2 Timotei|Tit|Filimon|Evrei|Iacov|1 Petru|2 Petru|1 Ioan|2 Ioan|3 Ioan|Iuda|Revelația", "Ge|Ex|Le|Nu|De|Ios|Ju|Rut|1Sa|2Sa|1Re|2Re|1Cr|2Cr|Ezr|Ne|Es|Iov|Ps|Pr|Ec|Cân|Is|Ier|Pln|Eze|Da|Os|Ioe|Am|Ob|Ion|Mi|Na|Hab|Țe|Hag|Za|Mal|Mt|Mr|Lu|Ioa|Fa|Ro|1Co|2Co|Ga|Ef|Flp|Col|1Te|2Te|1Ti|2Ti|Tit|Flm|Ev|Iac|1Pe|2Pe|1Io|2Io|3Io|Iuda|Re"],
  tr: ["Başlangıç|Çıkış|Levioğulları|Sayılar|Tekrar|Yeşu|Hâkimler|Rut|1. Samuel|2. Samuel|1. Krallar|2. Krallar|1. Tarihler|2. Tarihler|Ezra|Nehemya|Ester|Eyüp|Mezmurlar|Özdeyişler|Vaiz|Ezgiler Ezgisi|İşaya|Yeremya|Ağıtlar|Hezekiel|Daniel|Hoşea|Yoel|Amos|Obadya|Yunus|Mika|Nahum|Habakkuk|Tsefanya|Haggay|Zekeriya|Malaki|Matta|Markos|Luka|Yuhanna|Elçiler|Romalılar|1. Korintliler|2. Korintliler|Galatyalılar|Efesliler|Filipililer|Koloseliler|1. Selanikliler|2. Selanikliler|1. Timoteos|2. Timoteos|Titus|Filimon|İbraniler|Yakup|1. Petrus|2. Petrus|1. Yuhanna|2. Yuhanna|3. Yuhanna|Yahuda|Vahiy", "Ba|Çk|Le|Sy|Tkr|Yş|Hk|Ru|1Sa|2Sa|1Kr|2Kr|1Ta|2Ta|Ezr|Ne|Es|Ey|Mezm.|Öz|Vz|Ezg|İş|Yr|Ağ|He|Da|Ho|Yo|Ams|Ob|Yun|Mi|Na|Hb|Tsf|Hg|Zk|Ml|Mt|Mr|Lu|Yhn|Elç|Ro|1Ko|2Ko|Ga|Ef|Flp|Kl|1Se|2Se|1Ti|2Ti|Tit|Flm|İb|Yk|1Pe|2Pe|1Yh|2Yh|3Yh|Yhd|Vh"],
  ar: ["التكوين|الخروج|اللاويين|العدد|التثنية|يشوع|القضاة|راعوث|١ صموئيل|٢ صموئيل|١ ملوك|٢ ملوك|١ أخبار الأيام|٢ أخبار الأيام|عزرا|نحميا|أستير|أيوب|المزامير|الأمثال|الجامعة|نشيد الأناشيد|إشعيا|إرميا|المراثي|حزقيال|دانيال|هوشع|يوئيل|عاموس|عوبديا|يونان|ميخا|ناحوم|حبقوق|صفنيا|حجاي|زكريا|ملاخي|متى|مرقس|لوقا|يوحنا|الأعمال|روما|١ كورنثوس|٢ كورنثوس|غلاطية|أفسس|فيلبي|كولوسي|١ تسالونيكي|٢ تسالونيكي|١ تيموثاوس|٢ تيموثاوس|تيطس|فليمون|العبرانيين|يعقوب|١ بطرس|٢ بطرس|١ يوحنا|٢ يوحنا|٣ يوحنا|يهوذا|الرؤيا", "تك|خر|لا|عد|تث|يش|قض|را|١ صم|٢ صم|١ مل|٢ مل|١ أخ|٢ أخ|عز|نح|أس|أي|مز|أم|جا|نش|إش|إر|مرا|حز|دا|هو|يوء|عا|عو|يون|مي|نا|حب|صف|حج|زك|مل|مت|مر|لو|يو|أع|رو|١ كو|٢ كو|غل|أف|في|كو|١ تس|٢ تس|١ تي|٢ تي|تي|فل|عب|يع|١ بط|٢ بط|١ يو|٢ يو|٣ يو|يه|رؤ"],
  fa: ["پیدایش|خروج|لاویان|اعداد|تَثنیه|یوشَع|داوران|روت|۱سموئیل|۲سموئیل|۱پادشاهان|۲پادشاهان|۱تواریخ|۲تواریخ|عِزرا|نِحِمیا|اِستِر|ایّوب|مزامیر|امثال|جامعه|غزل غزل‌ها|اِشَعْیا|اِرْمیا|مراثی|حِزْقیال|دانیال|هوشَع|یوئیل|عاموس|عوبَدیا|یونِس|میکاه|ناحوم|حَبَقوق|صَفَنیا|حَجّای|زَکَریا|مَلاکی|مَتّی|مَرقُس|لوقا|یوحنا|اعمال|رومیان|۱قُرِنتیان|۲قُرِنتیان|غَلاطیان|اِفِسُسیان|فیلیپیان|کولُسیان|۱تِسالونیکیان|۲تِسالونیکیان|۱تیموتائوس|۲تیموتائوس|تیتوس|فیلیمون|عبرانیان|یعقوب|۱پِطرُس|۲پِطرُس|۱یوحنا|۲یوحنا|۳یوحنا|یهودا|مکاشفه", "پیدایش|خروج|لاویان|اعداد|تَثنیه|یوشَع|داوران|روت|۱سموئیل|۲سموئیل|۱پادشاهان|۲پادشاهان|۱تواریخ|۲تواریخ|عِزرا|نِحِمیا|اِستِر|ایّوب|مزامیر|امثال|جامعه|غزل غزل‌ها|اِشَعْیا|اِرْمیا|مراثی|حِزْقیال|دانیال|هوشَع|یوئیل|عاموس|عوبَدیا|یونِس|میکاه|ناحوم|حَبَقوق|صَفَنیا|حَجّای|زَکَریا|مَلاکی|مَتّی|مَرقُس|لوقا|یوحنا|اعمال|رومیان|۱قُرِنتیان|۲قُرِنتیان|غَلاطیان|اِفِسُسیان|فیلیپیان|کولُسیان|۱تِسالونیکیان|۲تِسالونیکیان|۱تیموتائوس|۲تیموتائوس|تیتوس|فیلیمون|عبرانیان|یعقوب|۱پِطرُس|۲پِطرُس|۱یوحنا|۲یوحنا|۳یوحنا|یهودا|مکاشفه"],
}

/** Gebaute Tabellen je Sprache (deutscher Name -> Zielsprache). */
const cache = new Map<string, { voll: Map<string, string>; kurz: Map<string, string> }>()

/**
 * Zuordnungen fuer eine Sprache — leer, wenn jw.org die Sprache nicht fuehrt
 * (dann bleibt der deutsche Name stehen, wie bisher).
 */
export function buchTabelle(lang: string): { voll: Map<string, string>; kurz: Map<string, string> } {
  const fertig = cache.get(lang)
  if (fertig) return fertig
  const eintrag = ZIEL[lang]
  const voll = new Map<string, string>()
  const kurz = new Map<string, string>()
  if (eintrag) {
    const deVoll = DE_VOLL.split('|')
    const deKurz = DE_KURZ.split('|')
    const zielVoll = (eintrag[0] ?? '').split('|')
    const zielKurz = (eintrag[1] ?? '').split('|')
    for (let i = 0; i < deVoll.length; i++) {
      // Kürzere Ziel-Liste als Quell-Liste hieße: eine Sprache ist unvollständig
      // gepflegt. Dann bleibt der Eintrag lieber aus, als leer gesetzt zu werden
      // — die Anzeige fällt auf den deutschen Namen zurück.
      const vollZiel = zielVoll[i]
      const kurzZiel = zielKurz[i]
      const vollQuelle = deVoll[i]
      const kurzQuelle = deKurz[i]
      if (vollQuelle && vollZiel) voll.set(vollQuelle, vollZiel)
      if (kurzQuelle && kurzZiel) kurz.set(kurzQuelle, kurzZiel)
    }
  }
  const gebaut = { voll, kurz }
  cache.set(lang, gebaut)
  return gebaut
}
