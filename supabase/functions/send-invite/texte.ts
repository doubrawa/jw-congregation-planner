/**
 * Texte der Einladungs-Mail je Sprache.
 *
 * **Erzeugt, nicht erfunden.** Jede Zeile hier steht wörtlich so im
 * App-Wörterbuch (`inviteMailSubject` / `inviteMailBody` in
 * `src/i18n/de.ts` und den Overlays) — dieselben zwei Sätze, die der Client
 * benutzt, wenn keine Absender-Domain konfiguriert ist und die Einladung über
 * `mailto:` hinausgeht. Ein Test hält beide Fassungen zusammen
 * (`_test/send-invite.test.ts`).
 *
 * **Warum überhaupt eine zweite Tabelle:** Eine Mail ist fertiger Text, sobald
 * sie den Server verlässt — anders als die Glocke in der App lässt sie sich
 * beim Anzeigen nicht mehr übersetzen. Und sie ist für den Empfänger die
 * **erste** Berührung mit dieser App: Er hat noch kein Konto und also auch
 * keine eingestellte Sprache. Maßgeblich ist deshalb die Sprache der
 * **Versammlung**, die der Client mitschickt.
 *
 * Eigene, kleine Liste statt der ganzen i18n-Schicht: Die Function wird
 * getrennt deployt, und mehr als diese zwei Zeilen verschickt sie nicht —
 * dieselbe Bauart wie `send-reminders/texte.ts`.
 */

export interface InviteTexte {
  /** Betreff der Einladung. */
  subject: string
  /** Rumpf mit den Platzhaltern {name}, {url} und {code}. */
  body: string
}

const TEXTE: Record<string, InviteTexte> = {
  de: {
    subject: "Einladung: Congregation Planner",
    body: "Hallo {name},\n\nbitte registriere dich in unserer Versammlungs-App:\n{url}\n\nLöse nach der Registrierung diesen Einladungscode ein:\n{code}",
  },
  en: {
    subject: "Invitation: Congregation Planner",
    body: "Hello {name},\n\nplease register in our congregation app:\n{url}\n\nAfter registering, redeem this invitation code:\n{code}",
  },
  es: {
    subject: "Invitación: Congregation Planner",
    body: "Hola {name}:\n\nregístrate en la aplicación de nuestra congregación:\n{url}\n\nDespués de registrarte, canjea este código de invitación:\n{code}",
  },
  fr: {
    subject: "Invitation : Congregation Planner",
    body: "Bonjour {name},\n\ninscris-toi dans l’application de notre assemblée :\n{url}\n\nAprès l’inscription, utilise ce code d’invitation :\n{code}",
  },
  it: {
    subject: "Invito: Congregation Planner",
    body: "Ciao {name},\n\nregistrati nell’app della nostra congregazione:\n{url}\n\nDopo la registrazione, usa questo codice d’invito:\n{code}",
  },
  pt: {
    subject: "Convite: Congregation Planner",
    body: "Olá {name},\n\nregistre-se no aplicativo da nossa congregação:\n{url}\n\nApós o registro, use este código de convite:\n{code}",
  },
  nl: {
    subject: "Uitnodiging: Congregation Planner",
    body: "Hallo {name},\n\nregistreer je in de app van onze gemeente:\n{url}\n\nGebruik na de registratie deze uitnodigingscode:\n{code}",
  },
  pl: {
    subject: "Zaproszenie: Congregation Planner",
    body: "Cześć {name},\n\nzarejestruj się w aplikacji naszego zboru:\n{url}\n\nPo rejestracji użyj tego kodu zaproszenia:\n{code}",
  },
  ru: {
    subject: "Приглашение: Congregation Planner",
    body: "Здравствуйте, {name}!\n\nЗарегистрируйтесь в приложении нашего собрания:\n{url}\n\nПосле регистрации используйте этот код приглашения:\n{code}",
  },
  uk: {
    subject: "Запрошення: Congregation Planner",
    body: "Вітаємо, {name}!\n\nЗареєструйтеся в застосунку нашого збору:\n{url}\n\nПісля реєстрації використайте цей код запрошення:\n{code}",
  },
  ro: {
    subject: "Invitație: Congregation Planner",
    body: "Bună, {name},\n\nînregistrează-te în aplicația congregației noastre:\n{url}\n\nDupă înregistrare, folosește acest cod de invitație:\n{code}",
  },
  el: {
    subject: "Πρόσκληση: Congregation Planner",
    body: "Γεια σου {name},\n\nκάνε εγγραφή στην εφαρμογή της εκκλησίας μας:\n{url}\n\nΜετά την εγγραφή, χρησιμοποίησε αυτόν τον κωδικό πρόσκλησης:\n{code}",
  },
  cs: {
    subject: "Pozvánka: Congregation Planner",
    body: "Ahoj {name},\n\nzaregistruj se v aplikaci našeho sboru:\n{url}\n\nPo registraci použij tento kód pozvánky:\n{code}",
  },
  sk: {
    subject: "Pozvánka: Congregation Planner",
    body: "Ahoj {name},\n\nzaregistruj sa v aplikácii nášho zboru:\n{url}\n\nPo registrácii použi tento kód pozvánky:\n{code}",
  },
  hu: {
    subject: "Meghívó: Congregation Planner",
    body: "Szia {name}!\n\nRegisztrálj a gyülekezetünk alkalmazásában:\n{url}\n\nA regisztráció után használd ezt a meghívókódot:\n{code}",
  },
  hr: {
    subject: "Poziv: Congregation Planner",
    body: "Bok {name},\n\nregistriraj se u aplikaciji naše skupštine:\n{url}\n\nNakon registracije upotrijebi ovaj pozivni kôd:\n{code}",
  },
  sr: {
    subject: "Poziv: Congregation Planner",
    body: "Zdravo {name},\n\nregistruj se u aplikaciji naše skupštine:\n{url}\n\nNakon registracije upotrebi ovaj pozivni kôd:\n{code}",
  },
  bg: {
    subject: "Покана: Congregation Planner",
    body: "Здравей, {name},\n\nрегистрирай се в приложението на нашия сбор:\n{url}\n\nСлед регистрацията използвай този код за покана:\n{code}",
  },
  sv: {
    subject: "Inbjudan: Congregation Planner",
    body: "Hej {name},\n\nregistrera dig i vår församlings app:\n{url}\n\nEfter registreringen, använd denna inbjudningskod:\n{code}",
  },
  da: {
    subject: "Invitation: Congregation Planner",
    body: "Hej {name}\n\nregistrér dig i vores menigheds app:\n{url}\n\nBrug denne invitationskode efter registreringen:\n{code}",
  },
  fi: {
    subject: "Kutsu: Congregation Planner",
    body: "Hei {name},\n\nrekisteröidy seurakuntamme sovellukseen:\n{url}\n\nKäytä rekisteröitymisen jälkeen tätä kutsukoodia:\n{code}",
  },
  no: {
    subject: "Invitasjon: Congregation Planner",
    body: "Hei {name},\n\nregistrer deg i menighetens app:\n{url}\n\nBruk denne invitasjonskoden etter registreringen:\n{code}",
  },
  tr: {
    subject: "Davet: Congregation Planner",
    body: "Merhaba {name},\n\ncemaatimizin uygulamasına kaydol:\n{url}\n\nKayıttan sonra bu davet kodunu kullan:\n{code}",
  },
  zh: {
    subject: "邀请：Congregation Planner",
    body: "你好 {name}：\n\n请在我们会众的应用中注册：\n{url}\n\n注册后使用此邀请码：\n{code}",
  },
  ja: {
    subject: "招待：Congregation Planner",
    body: "{name} さん、\n\n私たちの会衆アプリに登録してください：\n{url}\n\n登録後、この招待コードを使用してください：\n{code}",
  },
  ko: {
    subject: "초대: Congregation Planner",
    body: "{name} 님,\n\n우리 회중 앱에 등록해 주세요:\n{url}\n\n등록 후 이 초대 코드를 사용하세요:\n{code}",
  },
  id: {
    subject: "Undangan: Congregation Planner",
    body: "Halo {name},\n\nsilakan daftar di aplikasi sidang kita:\n{url}\n\nSetelah mendaftar, gunakan kode undangan ini:\n{code}",
  },
  tl: {
    subject: "Imbitasyon: Congregation Planner",
    body: "Kumusta {name},\n\nmagrehistro sa app ng ating kongregasyon:\n{url}\n\nPagkatapos magrehistro, gamitin ang invitation code na ito:\n{code}",
  },
  vi: {
    subject: "Lời mời: Congregation Planner",
    body: "Chào {name},\n\nvui lòng đăng ký trong ứng dụng của hội thánh chúng ta:\n{url}\n\nSau khi đăng ký, hãy dùng mã mời này:\n{code}",
  },
  sw: {
    subject: "Mwaliko: Congregation Planner",
    body: "Habari {name},\n\ntafadhali jisajili katika programu ya kutaniko letu:\n{url}\n\nBaada ya kujisajili, tumia msimbo huu wa mwaliko:\n{code}",
  },
  ar: {
    subject: "دعوة: Congregation Planner",
    body: "مرحبًا {name}،\n\nيرجى التسجيل في تطبيق جماعتنا:\n{url}\n\nبعد التسجيل، استخدم رمز الدعوة هذا:\n{code}",
  },
  he: {
    subject: "הזמנה: מתכנן הקהילה JW",
    body: "שלום {name},\n\nנא להירשם ביישום הקהילה שלנו:\n{url}\n\nלאחר ההרשמה, מַמֵּש את קוד ההזמנה הזה:\n{code}",
  },
  fa: {
    subject: "دعوت: برنامه‌ریز جماعت JW",
    body: "سلام {name}،\n\nلطفاً در برنامهٔ جماعت ما ثبت‌نام کنید:\n{url}\n\nپس از ثبت‌نام، این کد دعوت را وارد کنید:\n{code}",
  },
  ur: {
    subject: "دعوت: JW کلیسیا پلانر",
    body: "السلام علیکم {name}،\n\nبراہِ کرم ہماری کلیسیا کی ایپ میں رجسٹر کریں:\n{url}\n\nرجسٹریشن کے بعد یہ دعوتی کوڈ درج کریں:\n{code}",
  },
}

/**
 * Deutsch — der Rückfall, wenn die Sprache fehlt oder unbekannt ist.
 *
 * Ausgeschrieben statt `TEXTE.de`: Der Rückfall muss es geben, auch wenn jemand
 * die Tabelle umbaut. Ein `TEXTE.de!` behauptete dasselbe, ohne es zu sichern.
 */
const DE: InviteTexte = {
  subject: 'Einladung: Congregation Planner',
  body:
    'Hallo {name},\n\nbitte registriere dich in unserer Versammlungs-App:\n{url}\n\n' +
    'Löse nach der Registrierung diesen Einladungscode ein:\n{code}',
}

/**
 * Texte für einen Sprachcode. Unbekannt oder fehlend → Deutsch: Eine Einladung
 * in einer Sprache, die niemand gewählt hat, wäre schlechter als die bisherige.
 */
export function inviteTexte(lang: string | null | undefined): InviteTexte {
  return (lang && TEXTE[lang]) || DE
}

/** Platzhalter {name}, {url}, {code} einsetzen — wie `fill` im Client. */
export function fuellen(vorlage: string, werte: Record<string, string>): string {
  return vorlage.replace(/\{(\w+)\}/g, (_treffer, schluessel: string) => werte[schluessel] ?? '')
}
