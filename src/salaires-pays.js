/**
 * Pretentions salariales adaptees au pays du poste.
 *
 * Principe : la cible de profil.yaml est exprimee pour la France. On la
 * convertit en position relative sur le marche francais (cible / mediane FR),
 * puis on applique ce meme ratio a la mediane du pays vise. 40 k€ a Bordeaux
 * et 120 k$ a New York correspondent ainsi au meme niveau de marche.
 *
 * Les medianes sont des ESTIMATIONS 2026 pour un ingenieur IA / ML junior
 * (0-2 ans, bac+5), salaire brut annuel en devise locale, hors bonus et equity.
 * Recoupees a partir de Glassdoor, Levels.fyi, Talent.com et des grilles des
 * cabinets de recrutement ; a verifier avant une negociation reelle.
 */

// code ISO : [nom FR, devise, mediane brute annuelle junior, motifs de detection]
export const MARCHES = {
  // ─── Europe de l'Ouest ───────────────────────────────────────────
  FR: ['France', 'EUR', 40000, /\bfrance\b|paris|bordeaux|lyon|toulouse|nantes|lille|marseille|\bnice\b|rennes|montpellier|strasbourg|grenoble/],
  BE: ['Belgique', 'EUR', 45000, /belgi|brussel|bruxelles|antwerp|anvers|\bgent\b|\bghent\b|liege/],
  LU: ['Luxembourg', 'EUR', 55000, /luxemb/],
  NL: ['Pays-Bas', 'EUR', 50000, /netherlands|pays.bas|nederland|holland|amsterdam|rotterdam|utrecht|eindhoven|the hague|den haag|\bdelft\b/],
  DE: ['Allemagne', 'EUR', 55000, /germany|allemagne|deutschland|berlin|munich|munchen|hamburg|frankfurt|koln|cologne|stuttgart|dusseldorf/],
  AT: ['Autriche', 'EUR', 48000, /austria|autriche|osterreich|vienna|vienne|\bwien\b|graz|linz/],
  CH: ['Suisse', 'CHF', 100000, /switzerland|suisse|schweiz|zurich|geneva|geneve|lausanne|\bbasel\b|\bbale\b|\bbern\b|\bberne\b/],
  IE: ['Irlande', 'EUR', 55000, /ireland|irlande|dublin|\bcork\b|galway/],
  GB: ['Royaume-Uni', 'GBP', 45000, /united kingdom|royaume.uni|\buk\b|england|scotland|london|londres|manchester|edinburgh|cambridge|oxford|bristol/],
  MC: ['Monaco', 'EUR', 50000, /monaco/],
  // ─── Europe du Sud ───────────────────────────────────────────────
  ES: ['Espagne', 'EUR', 33000, /spain|espagne|espana|madrid|barcelon|valencia|malaga|seville|sevilla|bilbao/],
  PT: ['Portugal', 'EUR', 26000, /portugal|lisbon|lisbonne|lisboa|porto\b|braga/],
  IT: ['Italie', 'EUR', 32000, /italy|italie|italia|milan|milano|rome|roma|turin|torino|bologna|florence|firenze/],
  GR: ['Grece', 'EUR', 21000, /greece|grece|athens|athenes|thessaloniki/],
  MT: ['Malte', 'EUR', 30000, /malta|malte|valletta/],
  CY: ['Chypre', 'EUR', 28000, /cyprus|chypre|limassol|nicosia/],
  // ─── Pays nordiques ──────────────────────────────────────────────
  DK: ['Danemark', 'DKK', 480000, /denmark|danemark|copenhag|kobenhavn|aarhus/],
  SE: ['Suede', 'SEK', 460000, /sweden|suede|sverige|stockholm|gothenburg|goteborg|malmo/],
  NO: ['Norvege', 'NOK', 580000, /norway|norvege|norge|oslo|bergen|trondheim/],
  FI: ['Finlande', 'EUR', 45000, /finland|finlande|suomi|helsinki|espoo|tampere|oulu|turku/],
  IS: ['Islande', 'ISK', 9000000, /iceland|islande|reykjavik/],
  // ─── Europe centrale et orientale ────────────────────────────────
  PL: ['Pologne', 'PLN', 150000, /poland|pologne|polska|warsaw|varsovie|krakow|cracovie|wroclaw|gdansk|poznan/],
  CZ: ['Tchequie', 'CZK', 850000, /czech|tcheq|prague|praha|brno/],
  SK: ['Slovaquie', 'EUR', 24000, /slovakia|slovaquie|bratislava|kosice/],
  HU: ['Hongrie', 'HUF', 10500000, /hungary|hongrie|budapest|debrecen/],
  SI: ['Slovenie', 'EUR', 30000, /slovenia|slovenie|ljubljana/],
  HR: ['Croatie', 'EUR', 22000, /croatia|croatie|zagreb|split\b/],
  RO: ['Roumanie', 'RON', 115000, /romania|roumanie|bucharest|bucarest|cluj|iasi|timisoara/],
  BG: ['Bulgarie', 'EUR', 24000, /bulgaria|bulgarie|sofia|plovdiv/],
  EE: ['Estonie', 'EUR', 33000, /estonia|estonie|tallinn|tartu/],
  LV: ['Lettonie', 'EUR', 25000, /latvia|lettonie|\briga\b/],
  LT: ['Lituanie', 'EUR', 27000, /lithuania|lituanie|vilnius|kaunas/],
  RS: ['Serbie', 'RSD', 2500000, /serbia|serbie|belgrade|novi sad/],
  BA: ['Bosnie-Herzegovine', 'BAM', 30000, /bosnia|bosnie|sarajevo/],
  ME: ['Montenegro', 'EUR', 16000, /montenegro|podgorica/],
  MK: ['Macedoine du Nord', 'MKD', 900000, /macedonia|macedoine|skopje/],
  AL: ['Albanie', 'ALL', 1400000, /albania|albanie|tirana/],
  MD: ['Moldavie', 'MDL', 300000, /moldova|moldavie|chisinau/],
  UA: ['Ukraine', 'UAH', 750000, /ukraine|kyiv|kiev|lviv|kharkiv/],
  TR: ['Turquie', 'TRY', 1400000, /turkey|turquie|turkiye|istanbul|ankara|izmir/],
  // ─── Reste du monde ──────────────────────────────────────────────
  US: ['Etats-Unis', 'USD', 120000, /united states|etats.unis|\busa\b|\bu\.s\.|new york|san francisco|seattle|boston|austin|los angeles|chicago|\bnyc\b|, (ca|ny|wa|ma|tx)\b/],
  CA: ['Canada', 'CAD', 85000, /canada|toronto|montreal|vancouver|ottawa|quebec|calgary/],
  AU: ['Australie', 'AUD', 100000, /australia|australie|sydney|melbourne|brisbane|perth/],
  NZ: ['Nouvelle-Zelande', 'NZD', 85000, /new zealand|nouvelle.zelande|auckland|wellington/],
  SG: ['Singapour', 'SGD', 72000, /singapore|singapour/],
  HK: ['Hong Kong', 'HKD', 400000, /hong kong/],
  JP: ['Japon', 'JPY', 5500000, /japan|japon|tokyo|osaka|kyoto/],
  KR: ['Coree du Sud', 'KRW', 48000000, /korea|coree|seoul/],
  AE: ['Emirats arabes unis', 'AED', 216000, /emirates|emirats|\buae\b|dubai|abu dhabi/],
  IL: ['Israel', 'ILS', 300000, /israel|tel aviv|jerusalem|haifa/],
  MA: ['Maroc', 'MAD', 180000, /morocco|maroc|casablanca|rabat|marrakech/],
  IN: ['Inde', 'INR', 1400000, /india|inde\b|bangalore|bengaluru|mumbai|hyderabad|pune|delhi/],
  BR: ['Bresil', 'BRL', 120000, /brazil|bresil|brasil|sao paulo|rio de janeiro/],
  MX: ['Mexique', 'MXN', 450000, /mexico|mexique|guadalajara|monterrey/],
}

export const PAYS_REFERENCE = 'FR'

const sansAccent = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Arrondi lisible quelle que soit la devise : 3 chiffres significatifs, au millier minimum. */
function arrondir(n) {
  const pas = Math.max(1000, 10 ** (Math.floor(Math.log10(n)) - 2))
  return Math.round(n / pas) * pas
}

/**
 * Cible et plancher pour chaque pays, derives de la cible francaise du profil.
 * @param {{ brut_annuel_cible: number, brut_annuel_plancher?: number }} salaire
 */
export function salairesParPays(salaire) {
  const ref = MARCHES[PAYS_REFERENCE][2]
  const ratioCible = salaire.brut_annuel_cible / ref
  const ratioPlancher = (salaire.brut_annuel_plancher ?? salaire.brut_annuel_cible) / ref
  const table = {}
  for (const [code, [nom, devise, mediane]] of Object.entries(MARCHES)) {
    table[code] = {
      nom,
      devise,
      cible: arrondir(mediane * ratioCible),
      plancher: arrondir(mediane * ratioPlancher),
    }
  }
  return table
}

/** Code pays deduit d'un texte libre (lieu d'une offre, adresse). null si rien de sur. */
export function detecterPays(texte) {
  const t = sansAccent(texte)
  if (!t) return null
  for (const [code, [, , , motif]] of Object.entries(MARCHES)) {
    if (motif.test(t)) return code
  }
  return null
}

/** Nom de pays de l'offre -> code, pour les sources qui renseignent `pays`. */
export function paysDeLOffre(offre) {
  return detecterPays(offre.lieu) ?? detecterPays(offre.pays)
}

export const formater = (n, devise) =>
  `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} ${devise}`
