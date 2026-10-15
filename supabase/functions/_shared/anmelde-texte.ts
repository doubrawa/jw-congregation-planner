// =============================================================================
// Geteilt: die E-Mail mit dem Anmelde-Link (T121, Phase 8)
// =============================================================================
// **Erzeugt, nicht erfunden.** Jeder Satz hier steht wörtlich so im
// App-Wörterbuch (`linkMailBetreff` / `linkMailText` in `src/i18n/de.ts` und den
// Overlays) — dieselbe E-Mail, die der Admin aus seinem eigenen Mail-Programm
// schickt, solange die App selbst keine senden kann. Ein Test hält beide
// Fassungen zusammen (`_test/anmeldung.test.ts`).
//
// Zwei Functions schicken sie: `send-invite` (der Admin stellt Links aus) und
// `anmelden` (Selbstbedienung auf der Anmeldeseite, „Link senden"). Die
// Sprache ist die der **Versammlung**: Der Empfänger hat noch keine gewählt.
// =============================================================================

import { texteFuer } from './texte.ts'

export interface LinkMailTexte {
  /** Betreff mit {versammlung}. */
  betreff: string
  /** Text mit {name}, {versammlung}, {url} und {datum}. */
  text: string
}

const TEXTE: Record<string, LinkMailTexte> = {
  en: {
    betreff: "Your access to the {versammlung} Congregation",
    text: "Hello {name},\n\nthe {versammlung} Congregation plans its meetings and field service with Versammlung.app. Your access is ready.\n\nLog in now:\n{url}\n\nThe link is valid until {datum} and logs only you in. You don’t need a password. If it has expired, open the app and tap “Send link”.\n\nYou are receiving this email because you are listed in the {versammlung} Congregation. If you have questions, please speak to the elders.",
  },
  es: {
    betreff: "Tu acceso a la congregación {versammlung}",
    text: "Hola, {name}:\n\nla congregación {versammlung} organiza las reuniones y el servicio del campo con Versammlung.app. Tu acceso ya está listo.\n\nInicia sesión ahora:\n{url}\n\nEl enlace es válido hasta el {datum} y solo te da acceso a ti. No necesitas contraseña. Si ha caducado, abre la aplicación y toca “Enviar enlace”.\n\nRecibes este correo porque figuras en la congregación {versammlung}. Si tienes preguntas, habla con los ancianos.",
  },
  fr: {
    betreff: "Ton accès à l’assemblée de {versammlung}",
    text: "Bonjour {name},\n\nl’assemblée de {versammlung} planifie les réunions et la prédication avec Versammlung.app. Ton accès est prêt.\n\nConnecte-toi maintenant\u00a0:\n{url}\n\nLe lien est valable jusqu’au {datum} et ne connecte que toi. Tu n’as pas besoin de mot de passe. S’il a expiré, ouvre l’application et appuie sur «\u00a0Envoyer le lien\u00a0».\n\nTu reçois cet e-mail parce que tu fais partie de l’assemblée de {versammlung}. Si tu as des questions, parles-en aux anciens.",
  },
  it: {
    betreff: "Il tuo accesso alla congregazione di {versammlung}",
    text: "Ciao {name},\n\nla congregazione di {versammlung} pianifica le adunanze e il servizio di campo con Versammlung.app. Il tuo accesso è pronto.\n\nAccedi ora:\n{url}\n\nIl link è valido fino al {datum} e fa accedere solo te. Non ti serve una password. Se è scaduto, apri l’app e tocca “Invia link”.\n\nRicevi questa email perché fai parte della congregazione di {versammlung}. Se hai domande, parlane con gli anziani.",
  },
  pl: {
    betreff: "Twój dostęp do zboru {versammlung}",
    text: "Cześć {name},\n\nzbór {versammlung} planuje zebrania i służbę za pomocą Versammlung.app. Twój dostęp jest gotowy.\n\nZaloguj się teraz:\n{url}\n\nLink jest ważny do {datum} i loguje tylko ciebie. Hasło nie jest potrzebne. Jeśli wygasł, otwórz aplikację i stuknij „Wyślij link”.\n\nOtrzymujesz tego e-maila, ponieważ należysz do zboru {versammlung}. Jeśli masz pytania, porozmawiaj ze starszymi.",
  },
  ru: {
    betreff: "Ваш доступ к собранию {versammlung}",
    text: "Здравствуйте, {name}!\n\nСобрание {versammlung} планирует встречи и служение с помощью Versammlung.app. Ваш доступ готов.\n\nВойдите сейчас:\n{url}\n\nСсылка действует до {datum} и открывает вход только для вас. Пароль не нужен. Если срок действия истёк, откройте приложение и нажмите «Отправить ссылку».\n\nВы получили это письмо, потому что состоите в собрании {versammlung}. Если у вас есть вопросы, обратитесь к старейшинам.",
  },
  uk: {
    betreff: "Ваш доступ до збору {versammlung}",
    text: "Вітаємо, {name}!\n\nЗбір {versammlung} планує зібрання і служіння за допомогою Versammlung.app. Ваш доступ готовий.\n\nУвійдіть зараз:\n{url}\n\nПосилання дійсне до {datum} і відкриває вхід лише для вас. Пароль не потрібен. Якщо строк дії минув, відкрийте застосунок і натисніть «Надіслати посилання».\n\nВи отримали цей лист, бо належите до збору {versammlung}. Якщо у вас є запитання, зверніться до старійшин.",
  },
  ro: {
    betreff: "Accesul tău la congregația {versammlung}",
    text: "Bună, {name},\n\ncongregația {versammlung} planifică întrunirile și serviciul de teren cu Versammlung.app. Accesul tău este pregătit.\n\nAutentifică-te acum:\n{url}\n\nLinkul este valabil până la {datum} și te autentifică doar pe tine. Nu ai nevoie de parolă. Dacă a expirat, deschide aplicația și atinge „Trimite linkul”.\n\nPrimești acest e-mail pentru că faci parte din congregația {versammlung}. Dacă ai întrebări, vorbește cu bătrânii.",
  },
  tr: {
    betreff: "{versammlung} Cemaatine erişimin",
    text: "Merhaba {name},\n\n{versammlung} Cemaati ibadetleri ve tarla hizmetini Versammlung.app ile planlıyor. Erişimin hazır.\n\nŞimdi giriş yap:\n{url}\n\nBağlantı {datum} tarihine kadar geçerli ve yalnızca seni giriş yaptırır. Şifreye ihtiyacın yok. Süresi dolduysa uygulamayı aç ve “Bağlantı gönder” düğmesine dokun.\n\nBu e-postayı, {versammlung} Cemaatine bağlı olduğun için alıyorsun. Soruların varsa ihtiyarlarla konuş.",
  },
  ar: {
    betreff: "وصولك إلى جماعة {versammlung}",
    text: "مرحبًا {name}،\n\nتخطّط جماعة {versammlung} الاجتماعات وخدمة الحقل باستخدام Versammlung.app. وصولك جاهز.\n\nسجّل الدخول الآن:\n{url}\n\nالرابط صالح حتى {datum} ويسجّل دخولك أنت فقط. لا تحتاج إلى كلمة مرور. إذا انتهت صلاحيته، فافتح التطبيق واضغط على «إرسال الرابط».\n\nتصلك هذه الرسالة لأنك تنتمي إلى جماعة {versammlung}. إذا كانت لديك أسئلة، فتحدّث مع الشيوخ.",
  },
  fa: {
    betreff: "دسترسی شما به جماعت {versammlung}",
    text: "سلام {name}،\n\nجماعت {versammlung} جلسات و خدمت موعظه را با Versammlung.app برنامه‌ریزی می‌کند. دسترسی شما آماده است.\n\nاکنون وارد شوید:\n{url}\n\nاین پیوند تا {datum} معتبر است و فقط شما را وارد می‌کند. به رمز عبور نیازی ندارید. اگر منقضی شده است، برنامه را باز کنید و روی «ارسال پیوند» بزنید.\n\nاین ایمیل را دریافت می‌کنید، چون عضو جماعت {versammlung} هستید. اگر سؤالی دارید، با پیران جماعت صحبت کنید.",
  },
}

/** Deutsch — der Rückfall, wenn die Sprache fehlt oder unbekannt ist. */
const DE: LinkMailTexte = {
  betreff: "Dein Zugang zur Versammlung {versammlung}",
  text: "Hallo {name},\n\ndie Versammlung {versammlung} plant die Zusammenkünfte und den Predigtdienst mit Versammlung.app. Dein Zugang ist eingerichtet.\n\nJetzt anmelden:\n{url}\n\nDer Link gilt bis {datum} und meldet nur dich an. Ein Passwort brauchst du nicht. Ist er abgelaufen, öffne die App und tippe auf „Link senden“.\n\nDu bekommst diese E-Mail, weil du in der Versammlung {versammlung} eingetragen bist. Bei Fragen sprich die Ältesten an.",
}

/** Texte für einen Sprachcode der App. Unbekannt oder fehlend → Deutsch. */
export const linkMailTexte = texteFuer(TEXTE, DE)
