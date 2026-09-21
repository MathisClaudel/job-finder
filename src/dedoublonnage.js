/**
 * Reconnaissance d'une meme offre publiee sur plusieurs sources.
 *
 * France Travail et Adzuna diffusent les memes annonces avec des libelles
 * differents : « Developpeur C# .Net (H/F) » chez l'un, « Developpeur C# .Net »
 * chez l'autre ; « Stand SFEIR » contre « Sfeir ». Comparer les chaines brutes
 * laisse passer la majorite des doublons.
 *
 * La regle retenue : deux annonces sont la meme offre si l'employeur est
 * identifiable et identique, et si les intitules se recouvrent assez.
 * L'employeur non communique interdit tout rapprochement — deux annonces
 * anonymes au titre voisin sont, le plus souvent, deux entreprises differentes.
 */

const SEUIL_TITRE = 0.7

/** Ces valeurs signalent l'absence d'employeur, pas un employeur nomme. */
const ANONYMES = new Set([
  'noncommuniquee',
  'noncommunique',
  'nonprecise',
  'confidentiel',
  'entrepriseconfidentielle',
  'anonyme',
  'na',
  '',
])

/** Formes juridiques et mots de remplissage : ils ne distinguent pas deux employeurs. */
const MOTS_VIDES_ENTREPRISE = new Set([
  'sas', 'sasu', 'sarl', 'sa', 'eurl', 'sci', 'snc', 'gie',
  'groupe', 'group', 'stand', 'the', 'and', 'et',
])

/**
 * « (H/F) », « F/H », « (F/H/NB) », « m/w/d » : la meme offre change de marqueur
 * d'une source a l'autre. On les retire avant toute comparaison.
 */
const MARQUEURS_GENRE =
  /[([{]?\s*\b(h\s*[/\-–]\s*f(\s*[/\-–]\s*nb)?|f\s*[/\-–]\s*h(\s*[/\-–]\s*nb)?|m\s*[/\-–]\s*f|w\s*[/\-–]\s*m\s*[/\-–]\s*d|m\s*[/\-–]\s*w\s*[/\-–]\s*d|h\s*ou\s*f)\b\s*[)\]}]?/gi

/** Mentions de categorie ajoutees par les agregateurs, sans valeur distinctive. */
const SUFFIXES_AGREGATEUR = /\((it|it\/tech|tech|cdi|cdd|informatique)\)/gi

const sansAccent = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

const compacter = (s) => sansAccent(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/** Decoupe en jetons comparables, en gardant c#, .net, c++ intacts. */
function jetons(texte) {
  return new Set(
    sansAccent(texte ?? '')
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9#+.]*/g)
      ?.map((t) => t.replace(/\.$/, ''))
      // Le « e » de « Ingenieur(e) » ou le « se » de « Developpeur/se » ne distingue rien.
      .filter((t) => t.length > 1) ?? [],
  )
}

export function normaliserTitre(titre) {
  return (titre ?? '')
    .replace(MARQUEURS_GENRE, ' ')
    .replace(SUFFIXES_AGREGATEUR, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Jetons significatifs de l'employeur, formes juridiques retirees. */
function jetonsEntreprise(entreprise) {
  return new Set([...jetons(entreprise)].filter((t) => !MOTS_VIDES_ENTREPRISE.has(t)))
}

export function entrepriseAnonyme(entreprise) {
  const c = compacter(entreprise)
  return ANONYMES.has(c) || c.length < 2
}

const inclus = (a, b) => a.size > 0 && [...a].every((t) => b.has(t))

/**
 * Inclusion tolerante d'un seul mot d'ecart. Sans cette borne, « Developpeur
 * .NET » absorbait « Concepteur Developpeur .Net/Angular », qui est un autre
 * poste, dans une autre ville.
 */
const inclusEtroit = (a, b) => inclus(a, b) && b.size - a.size <= 1

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  const inter = [...a].filter((t) => b.has(t)).length
  return inter / (a.size + b.size - inter)
}

/** Meme employeur si les jetons coincident, ou si l'un est contenu dans l'autre. */
export function memeEmployeur(a, b) {
  if (entrepriseAnonyme(a) || entrepriseAnonyme(b)) return false
  const [x, y] = [jetonsEntreprise(a), jetonsEntreprise(b)]
  if (!x.size || !y.size) return false
  return inclus(x, y) || inclus(y, x)
}

export function memeIntitule(a, b) {
  const [x, y] = [jetons(normaliserTitre(a)), jetons(normaliserTitre(b))]
  if (!x.size || !y.size) return false
  if (inclusEtroit(x, y) || inclusEtroit(y, x)) return true
  return jaccard(x, y) >= SEUIL_TITRE
}

/**
 * Clef de regroupement rapide : elle rassemble les candidats plausibles.
 * Deux offres qui partagent cette clef sont ensuite confirmees par
 * `memeOffre`, qui seul decide. Une offre sans employeur nomme recoit une
 * clef unique, ce qui l'exclut de tout rapprochement.
 */
export function clefRegroupement(offre) {
  if (entrepriseAnonyme(offre.entreprise)) return `seule::${offre.id}`
  return [...jetonsEntreprise(offre.entreprise)].sort().join('-')
}

/** L'URL est le signal le plus sur quand deux sources pointent la meme annonce. */
function memeUrl(a, b) {
  if (!a.url || !b.url) return false
  const nu = (u) => {
    try {
      const x = new URL(u)
      return (x.host + x.pathname).toLowerCase().replace(/\/+$/, '')
    } catch {
      return String(u).toLowerCase()
    }
  }
  return nu(a.url) === nu(b.url)
}

/** Verdict final : ces deux annonces decrivent-elles le meme poste ? */
export function memeOffre(a, b) {
  if (a.id === b.id) return true
  if (memeUrl(a, b)) return true
  return memeEmployeur(a.entreprise, b.entreprise) && memeIntitule(a.titre, b.titre)
}

/**
 * Index des offres deja connues, interroge par clef de regroupement.
 * Evite de comparer chaque nouvelle annonce a la base entiere.
 */
export function creerIndex(offres = []) {
  const parClef = new Map()
  const ajouter = (offre) => {
    const clef = clefRegroupement(offre)
    if (!parClef.has(clef)) parClef.set(clef, [])
    parClef.get(clef).push(offre)
  }
  for (const o of offres) ajouter(o)

  return {
    ajouter,
    /** Renvoie l'offre deja connue qui correspond, ou undefined. */
    trouver(offre) {
      const candidats = parClef.get(clefRegroupement(offre)) ?? []
      return candidats.find((c) => memeOffre(c, offre))
    },
  }
}
