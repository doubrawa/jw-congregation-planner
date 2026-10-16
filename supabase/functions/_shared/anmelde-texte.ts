// =============================================================================
// Geteilt: die E-Mail mit dem Anmelde-Link (T121, Phase 8)
// =============================================================================
// **Erzeugt, nicht erfunden** — von `scripts/anmelde-texte-erzeugen.mjs`, nicht
// von Hand ändern. Jeder Satz hier steht wörtlich so im App-Wörterbuch
// (`linkMailBetreff` / `linkMailText` in `src/i18n/de.ts` und den Overlays) —
// dieselbe E-Mail, die der Admin aus seinem eigenen Mail-Programm schickt,
// solange die App selbst keine senden kann. Ein Test hält beide Fassungen
// zusammen (`_test/anmeldung.test.ts`).
//
// Zwei Functions schicken sie: `send-invite` (der Admin stellt Links aus) und
// `anmelden` (Selbstbedienung auf der Anmeldeseite, „Link senden"). Die
// Sprache ist die der **Versammlung**: Der Empfänger hat noch keine gewählt.
// =============================================================================

import { texteFuer } from './texte.ts'

export interface LinkMailTexte {
  /** Betreff mit {versammlung}. */
  betreff: string
  /** Text mit {name}, {versammlung}, {url}, {code} und {datum}. */
  text: string
}

const TEXTE: Record<string, LinkMailTexte> = {
  en: {
    betreff: "Your access to the {versammlung} Congregation",
    text: "Hello {name},\n\nThe {versammlung} Congregation plans its meetings and field service with Versammlung.app. Your access is ready.\n\nLog in now:\n{url}\n\nIs the app on your Home Screen? Then open it there, tap “Type in code” and enter this code:\n{code}\n\nThe link and code are valid until {datum} and log only you in. You don’t need a password. If they have expired, open the app and tap “Send link”.\n\nYou are receiving this email because you are listed in the {versammlung} Congregation. If you have questions, please speak to the elders.",
  },
  es: {
    betreff: "Tu acceso a la congregación {versammlung}",
    text: "Hola, {name}:\n\nLa congregación {versammlung} organiza las reuniones y el servicio del campo con Versammlung.app. Tu acceso ya está listo.\n\nInicia sesión ahora:\n{url}\n\n¿Tienes la aplicación en la pantalla de inicio? Entonces ábrela desde allí, toca “Escribir código” e introduce este código:\n{code}\n\nEl enlace y el código son válidos hasta el {datum} y solo te dan acceso a ti. No necesitas contraseña. Si han caducado, abre la aplicación y toca “Enviar enlace”.\n\nRecibes este correo porque figuras en la congregación {versammlung}. Si tienes preguntas, habla con los ancianos.",
  },
  fr: {
    betreff: "Ton accès à l’assemblée de {versammlung}",
    text: "Bonjour {name},\n\nL’assemblée de {versammlung} planifie les réunions et la prédication avec Versammlung.app. Ton accès est prêt.\n\nConnecte-toi maintenant\u00a0:\n{url}\n\nAs-tu l’application sur l’écran d’accueil\u00a0? Alors ouvre-la depuis cet écran, appuie sur «\u00a0Taper le code\u00a0» et saisis ce code\u00a0:\n{code}\n\nLe lien et le code sont valables jusqu’au {datum} et ne connectent que toi. Tu n’as pas besoin de mot de passe. S’ils ont expiré, ouvre l’application et appuie sur «\u00a0Envoyer le lien\u00a0».\n\nTu reçois cet e-mail parce que tu fais partie de l’assemblée de {versammlung}. Si tu as des questions, parles-en aux anciens.",
  },
  it: {
    betreff: "Il tuo accesso alla congregazione di {versammlung}",
    text: "Ciao {name},\n\nla congregazione di {versammlung} pianifica le adunanze e il servizio di campo con Versammlung.app. Il tuo accesso è pronto.\n\nAccedi ora:\n{url}\n\nHai l’app nella schermata Home? Allora aprila da lì, tocca “Digita codice” e inserisci questo codice:\n{code}\n\nIl link e il codice sono validi fino al {datum} e fanno accedere solo te. Non ti serve una password. Se sono scaduti, apri l’app e tocca “Invia link”.\n\nRicevi questa email perché fai parte della congregazione di {versammlung}. Se hai domande, parlane con gli anziani.",
  },
  pl: {
    betreff: "Twój dostęp do zboru {versammlung}",
    text: "Cześć {name},\n\nzbór {versammlung} planuje zebrania i służbę za pomocą Versammlung.app. Twój dostęp jest gotowy.\n\nZaloguj się teraz:\n{url}\n\nMasz aplikację na ekranie początkowym? Otwórz ją tam, stuknij „Wpisz kod” i wprowadź ten kod:\n{code}\n\nLink i kod są ważne do {datum} i logują tylko ciebie. Hasło nie jest potrzebne. Jeśli wygasły, otwórz aplikację i stuknij „Wyślij link”.\n\nOtrzymujesz tego e-maila, ponieważ należysz do zboru {versammlung}. Jeśli masz pytania, porozmawiaj ze starszymi.",
  },
  ru: {
    betreff: "Ваш доступ к собранию {versammlung}",
    text: "Здравствуйте, {name}!\n\nСобрание {versammlung} планирует встречи и служение с помощью Versammlung.app. Ваш доступ готов.\n\nВойдите сейчас:\n{url}\n\nПриложение есть на экране «Домой»? Тогда откройте его там, нажмите «Ввести код» и введите этот код:\n{code}\n\nСсылка и код действуют до {datum} и открывают вход только для вас. Пароль не нужен. Если срок их действия истёк, откройте приложение и нажмите «Отправить ссылку».\n\nВы получили это письмо, потому что состоите в собрании {versammlung}. Если у вас есть вопросы, обратитесь к старейшинам.",
  },
  uk: {
    betreff: "Ваш доступ до збору {versammlung}",
    text: "Вітаємо, {name}!\n\nЗбір {versammlung} планує зібрання і служіння за допомогою Versammlung.app. Ваш доступ готовий.\n\nУвійдіть зараз:\n{url}\n\nЗастосунок є на початковому екрані? Тоді відкрийте його там, натисніть «Ввести код» і введіть цей код:\n{code}\n\nПосилання і код дійсні до {datum} і відкривають вхід лише для вас. Пароль не потрібен. Якщо строк їхньої дії минув, відкрийте застосунок і натисніть «Надіслати посилання».\n\nВи отримали цей лист, бо належите до збору {versammlung}. Якщо у вас є запитання, зверніться до старійшин.",
  },
  ro: {
    betreff: "Accesul tău la congregația {versammlung}",
    text: "Bună, {name},\n\ncongregația {versammlung} planifică întrunirile și serviciul de teren cu Versammlung.app. Accesul tău este pregătit.\n\nAutentifică-te acum:\n{url}\n\nAi aplicația pe ecranul principal? Atunci deschide-o de acolo, atinge „Introdu codul” și scrie acest cod:\n{code}\n\nLinkul și codul sunt valabile până la {datum} și te autentifică doar pe tine. Nu ai nevoie de parolă. Dacă au expirat, deschide aplicația și atinge „Trimite linkul”.\n\nPrimești acest e-mail pentru că faci parte din congregația {versammlung}. Dacă ai întrebări, vorbește cu bătrânii.",
  },
  tr: {
    betreff: "{versammlung} Cemaatine erişimin",
    text: "Merhaba {name},\n\n{versammlung} Cemaati ibadetleri ve tarla hizmetini Versammlung.app ile planlıyor. Erişimin hazır.\n\nŞimdi giriş yap:\n{url}\n\nUygulama ana ekranında mı? O zaman oradan aç, “Kodu yaz” düğmesine dokun ve bu kodu gir:\n{code}\n\nBağlantı ve kod {datum} tarihine kadar geçerli ve yalnızca seni giriş yaptırır. Şifreye ihtiyacın yok. Süreleri dolduysa uygulamayı aç ve “Bağlantı gönder” düğmesine dokun.\n\nBu e-postayı, {versammlung} Cemaatine bağlı olduğun için alıyorsun. Soruların varsa ihtiyarlarla konuş.",
  },
  ar: {
    betreff: "وصولك إلى جماعة {versammlung}",
    text: "مرحبًا {name}،\n\nتخطّط جماعة {versammlung} الاجتماعات وخدمة الحقل باستخدام Versammlung.app. وصولك جاهز.\n\nسجّل الدخول الآن:\n{url}\n\nهل التطبيق على الشاشة الرئيسية؟ إذن افتحه من هناك، واضغط على «كتابة الرمز» وأدخل هذا الرمز:\n{code}\n\nالرابط والرمز صالحان حتى {datum} ويسجّلان دخولك أنت فقط. لا تحتاج إلى كلمة مرور. إذا انتهت صلاحيتهما، فافتح التطبيق واضغط على «إرسال الرابط».\n\nتصلك هذه الرسالة لأنك تنتمي إلى جماعة {versammlung}. إذا كانت لديك أسئلة، فتحدّث مع الشيوخ.",
  },
  fa: {
    betreff: "دسترسی شما به جماعت {versammlung}",
    text: "سلام {name}،\n\nجماعت {versammlung} جلسات و خدمت موعظه را با Versammlung.app برنامه\u200cریزی می\u200cکند. دسترسی شما آماده است.\n\nاکنون وارد شوید:\n{url}\n\nآیا برنامه روی صفحه اصلی است؟ پس آن را از همان\u200cجا باز کنید، روی «وارد کردن کد» بزنید و این کد را وارد کنید:\n{code}\n\nاین پیوند و کد تا {datum} معتبرند و فقط شما را وارد می\u200cکنند. به رمز عبور نیازی ندارید. اگر منقضی شده\u200cاند، برنامه را باز کنید و روی «ارسال پیوند» بزنید.\n\nاین ایمیل را دریافت می\u200cکنید، چون عضو جماعت {versammlung} هستید. اگر سؤالی دارید، با پیران جماعت صحبت کنید.",
  },
}

/** Deutsch — der Rückfall, wenn die Sprache fehlt oder unbekannt ist. */
const DE: LinkMailTexte = {
  betreff: "Dein Zugang zur Versammlung {versammlung}",
  text: "Hallo {name},\n\ndie Versammlung {versammlung} plant die Zusammenkünfte und den Predigtdienst mit Versammlung.app. Dein Zugang ist eingerichtet.\n\nJetzt anmelden:\n{url}\n\nHast du die App auf dem Home-Bildschirm? Dann öffne sie dort, tippe auf „Code eintippen“ und gib diesen Code ein:\n{code}\n\nLink und Code gelten bis {datum} und melden nur dich an. Ein Passwort brauchst du nicht. Sind sie abgelaufen, öffne die App und tippe auf „Link senden“.\n\nDu bekommst diese E-Mail, weil du in der Versammlung {versammlung} eingetragen bist. Bei Fragen sprich die Ältesten an.",
}

/** Texte für einen Sprachcode der App. Unbekannt oder fehlend → Deutsch. */
export const linkMailTexte = texteFuer(TEXTE, DE)
