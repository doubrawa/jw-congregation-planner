/**
 * Sprachlisten fuer die Mehrsprachigkeit.
 *
 * MASSGEBLICHE QUELLE ist jw.org selbst: JW_LANGS ist die Liste der Sprachen,
 * in denen sich das Arbeitsheft oeffnen laesst ("LESEN IN"-Combobox), als
 * { code, name } — code = jw.org-Sprachcode (URL-Locale, z. B. "ceb", "el",
 * "sw"), name = deutscher Anzeigename. Generiert aus den
 * otherAvailLangsChooser-Options einer Wochenseite.
 *
 * CONG_LANGS (Anzeigenamen) speist den Versammlungssprachen-Picker;
 * CONG_TO_JW (Name -> code) liefert den Sprachcode fuer den Import (die Woche
 * wird dann direkt in dieser Sprache von jw.org geholt). APP_LANGS/CONG_TO_CODE:
 * die vier UI-Sprachen bzw. deren Uebersetzungscode — nur fuer Demo-
 * Programminhalte (kanonisch deutsch -> makeTr) relevant; importierte Wochen
 * sind bereits in der Zielsprache.
 */

import type { Lang } from '../data/types'

export const APP_LANGS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
]

/** Versammlungssprache (deutscher Name) -> Programmuebersetzungs-Code (nur Demo). */
export const CONG_TO_CODE: Record<string, Lang | undefined> = {
  Deutsch: 'de',
  Englisch: 'en',
  Spanisch: 'es',
  Französisch: 'fr',
}

export const LOCALES: Record<Lang, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
}

/**
 * jw.org-Sprachtabelle: "code|name" je Eintrag, mit ";" getrennt. code =
 * jw.org-URL-Locale (fuer den Import), name = deutscher Anzeigename (Picker).
 * 482 Sprachen — Stand der im Arbeitsheft verfuegbaren "LESEN IN"-Liste.
 */
const JW_LANG_DATA =
  'ab|Abchasisch;aba|Abe;abn|Abua;ach|Acholi;ada|Adangme;om|Afan Oromo;af|Afrikaans;aha|Ahanta;ajg|Aja;ahk|Akha;akl|Aklanon;sq|Albanisch;alt|Altaisch;alz|Alur;ase|Amerikanische Gebärdensprache;am|Amharisch;ami|Ami;sgn-ao|Angolanische Gebärdensprache;ar|Arabisch;arz|Arabisch (Ägypten);apd|Arabisch (Sudanesisch);aed|Argentinische Gebärdensprache;hy|Armenisch;hyw|Armenisch (Westarmenisch);az|Aserbaidschanisch;az-cyrl|Aserbaidschanisch (kyrillische Schrift);as|Assamesisch;ati|Attié;djk|Aukisch;asf|Australische Gebärdensprache;ay|Aymaranisch;bm|Bambaro;ba|Baschkirisch;eu|Baskisch;bas|Bassa (Kamerun);bsq|Bassa (Liberia);bci|Baule;sfb|Belgisch-französische Gebärdensprache;bzj|Belize-Kreolisch;bem|Bemba;bn|Bengalisch;naq-x-dmr|Bergdama;btg|Betye;bcl|Bikol;my|Birmanisch;bi|Bislama;bvl|Bolivianische Gebärdensprache;bzs|Brasilianische Gebärdensprache;bfi|Britische Gebärdensprache;bg|Bulgarisch;bum|Bulu;cak|Cakchiquel (Westlich);ceb|Cebuano;ny|Cewa;cbk|Chabacano;tso-mz|Changana (Mosambik);csg|Chilenische Gebärdensprache;cnh|Chin, Haka;cmn-hant|Chinesisch (Hochchinesisch, traditionell);cmn-hans|Chinesisch (Hochchinesisch, vereinfachte Schriftzeichen);yue-hant|Chinesisch (Kantonesisch, traditionell);yue-hans|Chinesisch (Kantonesisch, vereinfachte Schriftzeichen);csl|Chinesische Gebärdensprache;cjk|Chokwe;ctu|Chol;cce|Chopi;cac|Chuj;chw|Chwabo;rar|Cookinseln‑Maori;csr|Costa-ricanische Gebärdensprache;dga|Dagari;mbp|Damana;daf|Dan;da|Dänisch;dhv|Dehu;de|Deutsch;gsg|Deutsche Gebärdensprache;din|Dinka;dua|Duala;igb|Ebira;ecs|Ecuadorianische Gebärdensprache;bin|Edo;efi|Efik;cto|Empera (Catío);cmi|Empera (Chami);en|Englisch;lir|Englisch (Liberia);ish|Esan;et|Estnisch;ee|Ewe;ewo|Ewondo;fan|Fang;fat|Fante;fo|Färöisch;fj|Fidschi;fi|Finnisch;fse|Finnische Gebärdensprache;fon|Fon-Gbe;gur|Frafra;fcs|Frankokanadische Gebärdensprache;fr|Französisch;fsl|Französische Gebärdensprache;gaa|Ga;gl|Galegisch;lg|Ganda;gba|Gbaya;ka|Georgisch;gxx|Gere;gse|Ghanaische Gebärdensprache;gil|Gilbertesisch;toh|Gitonga;gkn|Gokana;el|Griechisch;kl|Grönländisch;gcf|Guadeloupe-Kreolisch;gug|Guarani;gsm|Guatemaltekische Gebärdensprache;pov|Guiné Crioulo;gu|Gujarati;guw|Gun-Gbe;gcr|Guyanesisch;ht|Haitianisch;ha|Haussa;hav|Havu;hwc|Hawai’i Pidgin;he|Hebräisch;hyw-x-hma|Hemşin (Armenisch);hyw-x-hms|Hemşin (Kyrillisch);hz|Herero;hil|Hiligaynon;hi|Hindi;hi-latn|Hindi (lateinische Schrift);ho|Hiri-Motu;hmn|Hmong Daw;hds|Honduranische Gebärdensprache;qub|Huallaga-Quechua;hus|Huastekisch (San Luis Potosi);mau|Huautla-Mazatekisch;hrx|Hunsrückisch;iba|Iban;ibg|Ibanag;yom-x-ibi|Ibinda;idu|Idoma;igl|Igala;ig|Igbo;ige|Igede;ilo|Iloko;ins|Indische Gebärdensprache;id|Indonesisch;inl|Indonesische Gebärdensprache;ga|Irisch;is|Isländisch;it|Italienisch;ise|Italienische Gebärdensprache;its|Itsekiri;sgn-ci|Ivorische Gebärdensprache;ixl|Ixil;jam-x-jcr|Jamaika-Kreolisch;jls|Jamaikanische Gebärdensprache;ja|Japanisch;jsl|Japanische Gebärdensprache;jv|Javanisch;dyu|Julakan;kbd|Kabardinotscherkessisch;kbp|Kabiye;kab|Kabylisch;kam|Kamba;km|Kambodschanisch;sgn-cm|Kamerunische Gebärdensprache;ogo|Kana;kn|Kannada;kny|Kanyoka;kqn|Kaonde;kea|Kapverdisch;ksw|Karenisch (S\'gaw);cab|Karif;btx|Karo-Batak;kk|Kasachisch;kk-arab|Kasachisch (Arabisch);cat|Katalanisch;kek|Kekchi;xki|Kenianische Gebärdensprache;kha|Khasi;kwy|Kikongo;ki|Kikuyu;rw|Kinyaruanda;ky|Kirgisisch;kss|Kisi;ktu-x-kit|Kituba;ktu-x-kgl|Kituba (Kikongo);kzn|Kokola;csn|Kolumbianische Gebärdensprache;kg|Kongo;sgn-cd|Kongolesische Gebärdensprache;koo|Konjo;gom|Konkani (lateinische Schrift);ko|Koreanisch;kvk|Koreanische Gebärdensprache;kos|Kosraeanisch;xpe|Kpelle;kri|Krio;hr|Kroatisch;csq|Kroatische Gebärdensprache;csf|Kubanische Gebärdensprache;kdn|Kunda;kmr-x-rd|Kurdisch Kurmandschi;kmr-x-rdu|Kurdisch Kurmandschi (Kaukasus);kmr-cyrl|Kurdisch Kurmandschi (kyrillische Schrift);kwn|Kwangali;kj|Kwanyama;kwf|Kwara\'ae;nyy-x-nkn|Kyangonde;cy|Kymrisch (Walisisch);ldi|Laadi;lai|Lambya;laj|Lango;lo|Laotisch;led|Lendu;leh|Lenje;lv|Lettisch;ln|Lingala;lt|Litauisch;llb|Lolo;lom|Loma;ngl|Lomwe;loz|Lozi;lu|Luba;lua|Luba-Lulua;lue|Luena;lgg|Lugbara;lun|Lunda;luo|Luo;lb|Luxemburgisch;mzc|Madagassische Gebärdensprache;kde|Makonde;vmw|Makua;vmk|Makua-Shirima;mg|Malagassi;ms|Malaiisch;xml|Malaiische Gebärdensprache;sgn-mw|Malawische Gebärdensprache;ml|Malayalam;mt|Maltesisch;mam|Mam;mgr|Mambwe-Lungu;mev|Mano;mny|Manyawa;arn|Mapudungun;mr|Marathi;xmc|Marevone;mhr|Mari;mh|Marshallesisch;gcf-x-mtc|Martinique-Kreolisch;shr|Mashi;yua|Maya;mk|Mazedonisch;kmb|Mbundu;mck|Mbuun;mgh|Medo;mni|Meithei;mni-latn|Meithei (Lateinisch);mer|Meru;mfs|Mexikanische Gebärdensprache;ote|Mezquital Otomi;xmf|Mingrelisch;nan-x-chw|Minnan (Taiwan);miq|Miskito;mco|Mixe (Nordzentral);mxv|Mixtekisch (Guerrero);meh|Mixtekisch (Tlaxiaco);lus|Mizo;mn|Mongolisch;mos|More;mfe|Morisyen;mzy|Mosambikanische Gebärdensprache;meu|Motu;mwn|Mwanga;sgn-mm|Myanmarische Gebärdensprache;ngu|Nahuatl (Guerrero);nch|Nahuatl (Huastekisch);ncj|Nahuatl (Nord-Puebla);nhk|Nahuatl (Veracruz);nnb|Nande;ndc|Ndau;ndc-x-ndw|Ndau (West);nr|Ndebele;nd|Ndebele (Simbabwe);ng|Ndonga;ne|Nepali;gym|Ngäbere;nba|Ngangwela;ngb|Ngbandi (Nördlich);pls|Ngigua (San Marcos Tlacoyalco);nia|Niassisch;ncs|Nicaraguanische Gebärdensprache;nl|Niederländisch;nsi|Nigerianische Gebärdensprache;caq|Nikobaresisch;nyn|Nkole;no|Norwegisch;nse-mz|Nsenga (Mosambik);nse|Nsenga (Sambia);nyk|Nyaneka;nya|Nyanja;nyu|Nyungwe;nzi|Nzima;ann|Obolo;oke|Okpe;or|Oriya;os|Ossetisch;ots|Otomi (Staat Mexiko);pau|Palauanisch;lsp|Panamaische Gebärdensprache;pag|Pangasinan;pa|Panjabi;pnb|Panjabi (Shahmukhi);pap|Papiamento (Curaçao);pys|Paraguayische Gebärdensprache;nso|Pedi;pem|Pende;fa|Persisch;prl|Peruanische Gebärdensprache;psp|Philippinische Gebärdensprache;phm|Phimbi;wes-x-pgw|Pidgin (Westafrika);pdt|Plautdietsch;pon|Pohnpeianisch;poh|Pokonchi;pl|Polnisch;pso|Polnische Gebärdensprache;nds|Pomoranisch;pt-ao|Portugiesisch (Angola);pt|Portugiesisch (Brasilien);pt-pt|Portugiesisch (Portugal);psr|Portugiesische Gebärdensprache;que|Quechua (Ancash);quy|Quechua (Ayacucho);qu|Quechua (Bolivien);quz|Quechua (Cuzco);quc|Quiché;qug|Quichua (Chimborazo);qug-x-qix|Quichua (Cotopaxi);qvi|Quichua (Imbabura);rcf|Reunionesisch;rmo|Romanes (Sinti);rmn-x-rm|Romani (Mazedonien);rmn-cyrl|Romani (Mazedonien) Kyrillisch;rmc-sk|Romani (Ostslowakei);rmy|Romani (Rumänien);rmn-x-rme|Romani (Serbien);rmn-x-rmg|Romani (Südgriechenland);rmy-x-rmv|Romani (Vlach-Romani, Russland);rmn-x-rmb|Romani (Westbulgarien);rng|Ronga;ro|Rumänisch;rms|Rumänische Gebärdensprache;run|Rundi;ttj|Runyoro-Rutooro;ru|Russisch;rsl|Russische Gebärdensprache;rnd|Ruund;sfw|Safwi;acf|Saint Lucia-Kreolisch;pis|Salomonen-Pidgin;esn|Salvadorianische Gebärdensprache;zsl|Sambische Gebärdensprache;sm|Samoanisch;sg|Sango;srm|Saramakkisch;sv|Schwedisch;seh|Sena;nso-x-spl|Sepulana;sr-cyrl|Serbisch (kyrillische Schrift);sr-latn|Serbisch (lateinische Schrift);crs|Seychellen-Kreolisch;sn|Shona;jiv|Shuara;sid|Sidamo;poi|Sierra-Popoluca;zib|Simbabwische Gebärdensprache;si|Singhalesisch;sk|Slowakisch;svk|Slowakische Gebärdensprache;sl|Slowenisch;iso|Soko;sop|Songe;nsx|Songo;soe|Songomeno;st|Sotho (Lesotho);st-za|Sotho (Südafrika);es|Spanisch;ssp|Spanische Gebärdensprache;srn|Srananisch;sfs|Südafrikanische Gebärdensprache;ijc|Südost-Ijo;sw|Swahili;swc-x-swk|Swahili (Katanga);swc|Swahili (Kongo);ss|Swazi;tap|Tabwa;tg|Tadschikisch;tl|Tagalog;ty|Tahitisch;tss|Taiwanesische Gebärdensprache;vec|Talian;ta|Tamil;ta-x-tlr|Tamilisch (lateinische Schrift);tdx|Tandroy;xmv|Tankarana;tar|Tarahumara;tsz|Taraskanisch;tt|Tatarisch;te|Telugu;teo|Teso;tll|Tetela;tdt|Tetun-Prasa;twx|Tewe;th|Thai;tsq|Thailändische Gebärdensprache;tca|Ticuna;ti|Tigrinja;tiv|Tiv;tcf|Tlapanekisch;ncx|Tlascalan;mlu|To\'ambaita;bbc|Toba-Batak;toj|Tojolabal;tpi|Tok Pisin;tog|Tonga (Malawi);toi|Tonga (Sambia);toi-zw|Tonga (Simbabwe);to|Tonganisch;top|Totonakisch;chk|Trukesisch;cs|Tschechisch;cse|Tschechische Gebärdensprache;cv|Tschuwaschisch;tsc|Tshwa;ts|Tsonga;tn|Tswana;tum|Tumbuka;tui|Tupuri;tr|Türkisch;tk|Turkmenisch;tvl|Tuvaluanisch;tyv|Tuwinisch;tw|Twi;tzh|Tzeltal;tzo|Tzotzil;udm|Udmurtisch;ugn|Ugandische Gebärdensprache;ug-cyrl|Uigurisch (kyrillische Schrift);uk|Ukrainisch;umb|Umbundu;hu|Ungarisch;hsh|Ungarische Gebärdensprache;ur|Urdu;urh|Urhobo;uz-cyrl|Usbekisch;uz-latn|Usbekisch (lateinische Schrift);ca-x-vlc|Valenzianisch;ve|Venda;vsl|Venezolanische Gebärdensprache;skg-x-vz|Vezo;vi|Vietnamesisch;wls|Wallisianisch;war|Waray-Waray;guc|Wayuunaiki;wal|Welaita;mzh|Wichí (Pilcomayo);hch|Wixárika;wo|Wolof;xh|Xhosa;yao|Yao;yap|Yapesisch;yom-x-ymb|Yombe;yo|Yoruba;zne|Zande;zav|Zapotekisch (Rincon);zpa|Zapotekisch (Tehuantepec);zai|Zapotekisch (Tehuantepecano);zu|Zulu'

export const JW_LANGS: ReadonlyArray<{ code: string; name: string }> = JW_LANG_DATA.split(
  ';',
).map((entry) => {
  const i = entry.indexOf('|')
  return { code: entry.slice(0, i), name: entry.slice(i + 1) }
})

/** Anzeigenamen fuer den Versammlungssprachen-Picker (alphabetisch, deutsch). */
export const CONG_LANGS: readonly string[] = JW_LANGS.map((l) => l.name)

/** Deutscher Anzeigename -> jw.org-Sprachcode (fuer den Arbeitsheft-Import). */
export const CONG_TO_JW: Readonly<Record<string, string>> = Object.fromEntries(
  JW_LANGS.map((l) => [l.name, l.code]),
)
