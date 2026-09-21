/**
 * Ciblage du CV sur une offre.
 *
 * Principe, identique a celui de la skill /lettre : rien n'est redige ici.
 * Toutes les phrases viennent de `profil/cv.yaml`, ecrites a la main et
 * verifiees. Ce module ne fait que SELECTIONNER et ORDONNER.
 *
 * Trois decisions sont prises a partir du texte de l'offre :
 *   1. l'axe   — quelle famille de poste, donc quel titre et quelle accroche
 *   2. le tri  — quelles puces de chaque experience remontent
 *   3. le filtre — quels groupes de competences apparaissent, et dans quel ordre
 */

const sansAccent = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Axes reconnus, et les motifs qui les declenchent dans un intitule d'offre. */
const AXES = [
  {
    cle: 'ia',
    motifs: [
      /\b(ai|ml|llm|nlp|genai|gen ai)[\s-]?(engineer|developer|dev|scientist|specialist)/,
      /ingenieur\s+(en\s+)?(ia|intelligence artificielle|machine learning)/,
      /machine learning engineer/, /(ai|ia)[\s/]?(engineer|ingenieur)/,
      /applied (ai|scientist)/, /prompt engineer/, /consultant\s+ia\b/,
      // "Ingenieur Developpeur d'Applications Python / IA" : le sigle est
      // accole a une autre techno et aucun motif ci-dessus ne l'attrape.
      /(^|[\s/(,-])(ia|ai)([\s/),-]|$)/, /intelligence artificielle/,
    ],
  },
  { cle: 'dotnet', motifs: [/\.net\b/, /\bc#/, /dotnet/, /developpeur\s+(back|\.net|c#)/, /backend/] },
  { cle: 'fullstack', motifs: [/full[\s-]?stack/, /\breact\b/, /front[\s-]?end/, /typescript/] },
  { cle: 'data', motifs: [/data\s+(engineer|analyst|scientist)/, /\bmlops\b/, /\bbig data\b/, /analytics/] },
  { cle: 'devops', motifs: [/devops/, /\bsre\b/, /platform engineer/, /\bqa\b/, /test automation/] },
]

/**
 * L'axe est d'abord cherche dans l'intitule (c'est lui qui definit le poste),
 * et seulement a defaut dans le corps de l'annonce.
 */
export function detecterAxe(offre) {
  const titre = sansAccent(offre?.titre)
  const corps = sansAccent(texteOffre(offre))
  for (const a of AXES) if (a.motifs.some((m) => m.test(titre))) return a.cle
  for (const a of AXES) if (a.motifs.some((m) => m.test(corps))) return a.cle
  return 'defaut'
}

export const texteOffre = (offre) =>
  [offre?.titre, offre?.description, offre?.entrepriseDescription, (offre?.competences ?? []).join(' ')]
    .filter(Boolean)
    .join('\n')

/**
 * Score d'un element (puce, projet, groupe de competences) face a l'offre.
 *
 * Le poids de base domine volontairement : une puce forte le reste meme si
 * l'annonce est avare en mots-cles. Les mots-cles departagent, ils ne
 * decident pas seuls — sinon une annonce fourre-tout ferait remonter
 * n'importe quoi.
 */
function scorerElement(el, { axe, texte }) {
  let score = Number(el.poids ?? 5)
  if (el.axes?.includes(axe)) score += 6
  const trouves = (el.motscles ?? []).filter((k) => texte.includes(sansAccent(k)))
  score += Math.min(trouves.length * 2, 6)
  return { score, motsTrouves: trouves }
}

/** Trie sans muter, et garde la trace du score pour `--diff`. */
function classer(liste, ctx) {
  return liste
    .map((el) => ({ ...el, ...scorerElement(el, ctx) }))
    .sort((a, b) => b.score - a.score)
}

export const LANGUES = ['fr', 'en']

/** Champs qui portent du texte affiche, donc qui doivent exister en `_en`. */
const TRADUISIBLES = new Set([
  'poste', 'contexte', 'texte', 'groupe', 'nom', 'diplome', 'detail', 'detail_ia', 'titre', 'niveau', 'lieu',
])

/**
 * Remplace chaque champ `x` par `x_en` quand il existe, recursivement.
 *
 * Les traductions sont ecrites a la main dans cv.yaml, a cote de la phrase
 * francaise : rien n'est traduit a la volee. Un champ sans `_en` garde son
 * texte francais et est signale dans `manquants`, pour que le trou se voie
 * au lieu de passer inapercu dans un CV anglais.
 */
function localiser(valeur, langue, manquants, chemin = '') {
  if (langue === 'fr') return valeur
  if (Array.isArray(valeur)) return valeur.map((v, i) => localiser(v, langue, manquants, `${chemin}[${i}]`))
  if (!valeur || typeof valeur !== 'object') return valeur
  const sortie = {}
  for (const [cle, v] of Object.entries(valeur)) {
    if (cle.endsWith(`_${langue}`)) continue
    const traduit = valeur[`${cle}_${langue}`]
    if (traduit !== undefined) sortie[cle] = localiser(traduit, langue, manquants, `${chemin}.${cle}`)
    else {
      // Un nom propre identique dans les deux langues (Docker, Git) n'a pas
      // besoin de doublon : seuls les textes contenant des lettres accentuees
      // ou des mots francais sont suspects, d'ou le filtre sur les accents.
      if (TRADUISIBLES.has(cle) && typeof v === 'string' && /[à-ÿ]/i.test(v)) manquants.push(`${chemin}.${cle}`)
      sortie[cle] = localiser(v, langue, manquants, `${chemin}.${cle}`)
    }
  }
  return sortie
}

/**
 * Construit le CV cible.
 *
 * @param cv     contenu de profil/cv.yaml
 * @param profil contenu de profil/profil.yaml (identite uniquement)
 * @param offre  offre du store, ou null pour la version generique
 * @param options.axe   force l'axe au lieu de le detecter
 * @param options.photo inclure la photo
 * @param options.langue 'fr' (defaut) ou 'en'
 */
export function cibler(cvSource, profil, offre, options = {}) {
  const langue = options.langue ?? 'fr'
  if (!LANGUES.includes(langue)) throw new Error(`Langue inconnue : ${langue} — attendu ${LANGUES.join(' ou ')}`)
  const manquants = []
  const cv = localiser(cvSource, langue, manquants)

  const axe = options.axe ?? (offre ? detecterAxe(offre) : 'defaut')
  const texte = sansAccent(texteOffre(offre))
  const ctx = { axe, texte }

  const experiences = cv.experiences.map((exp) => ({
    ...exp,
    puces: classer(exp.puces, ctx).slice(0, exp.max_puces ?? 4),
  }))

  // Les competences d'un groupe sont triees elles aussi : la techno citee dans
  // l'annonce doit apparaitre en premier dans sa ligne, la ou l'oeil se pose.
  const competences = classer(cv.competences, ctx)
    .slice(0, 4)
    .map((g) => ({ ...g, items: classer(g.items, ctx) }))

  const projets = classer(cv.projets, ctx).slice(0, 3)

  // L'axe IA est le seul ou le detail des cours d'IA merite la place qu'il prend.
  const formation = cv.formation.map((f) => ({
    ...f,
    detail: (axe === 'ia' || axe === 'data') && f.detail_ia ? f.detail_ia : f.detail,
  }))

  return {
    axe,
    langue,
    traductionsManquantes: manquants,
    offre: offre ? { id: offre.id, titre: offre.titre, entreprise: offre.entreprise } : null,
    identite: profil.identite,
    recherche: profil.recherche,
    titre: cv.titres[axe] ?? cv.titres.defaut,
    accroche: (cv.accroches[axe] ?? cv.accroches.defaut).trim(),
    experiences,
    competences,
    projets,
    formation,
    certifications: cv.certifications ?? [],
    langues: cv.langues ?? [],
    engagement: cv.engagement,
    photo: Boolean(options.photo),
  }
}

/**
 * Vocabulaire technique surveille.
 *
 * Sert uniquement au diagnostic : reperer ce que l'annonce reclame et que le
 * CV ne dit pas. Rien ici n'est jamais ajoute au CV automatiquement — c'est
 * a Mathis de decider si un terme manquant correspond a un fait reel (alors
 * il ajoute une puce dans cv.yaml) ou a une competence qu'il n'a pas (alors
 * il l'assume, ou il ne postule pas).
 */
const VOCABULAIRE = [
  'python', 'java', 'c#', '.net', 'typescript', 'javascript', 'react', 'angular', 'vue',
  'node', 'sql', 'nosql', 'mongodb', 'postgresql', 'cobol', 'go', 'rust', 'php', 'scala',
  'azure', 'aws', 'gcp', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'jenkins', 'git',
  'llm', 'rag', 'langchain', 'mcp', 'agent', 'nlp', 'machine learning', 'deep learning',
  'pytorch', 'tensorflow', 'scikit', 'mlops', 'vector', 'embedding', 'fine-tuning',
  'spark', 'kafka', 'airflow', 'dbt', 'snowflake', 'databricks', 'power bi', 'tableau',
  'etl', 'data warehouse', 'big data', 'pandas', 'numpy',
  'rest', 'graphql', 'grpc', 'mqtt', 'microservice', 'api',
  'agile', 'scrum', 'kanban', 'safe', 'tdd', 'test unitaire', 'sharepoint', 'salesforce',
  'linux', 'bash', 'powershell', 'sap', 'anglais',
]

/**
 * Termes presents dans l'annonce et absents du CV genere.
 *
 * Le CV est compare en version texte brut : c'est exactement ce qu'un
 * extracteur lira. Un terme absent ici, c'est un terme sur lequel l'annonce
 * sera scoree a zero par un ATS a mots-cles.
 */
export function manques(cible, offre, texteCv) {
  if (!offre) return []
  const dansOffre = sansAccent(texteOffre(offre))
  const dansCv = sansAccent(texteCv)
  // Frontieres de mots obligatoires : en simple sous-chaine, « go » se
  // trouverait dans « gouvernance » et « rag » dans « paragraphe ».
  const present = (t, ou) => {
    const echappe = sansAccent(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // `s?` : « embeddings », « agents », « microservices » comptent pour leur singulier.
    return new RegExp(`(^|[^a-z0-9+#.])${echappe}s?([^a-z0-9+#]|$)`).test(ou)
  }
  return VOCABULAIRE.filter((t) => present(t, dansOffre) && !present(t, dansCv))
}

/** Explique les choix du ciblage, pour que Mathis garde la main dessus. */
export function expliquer(cible) {
  const lignes = [`Axe retenu : ${cible.axe}`, `Titre       : ${cible.titre}`, '']
  for (const exp of cible.experiences) {
    lignes.push(`${exp.entreprise}`)
    for (const p of exp.puces) {
      const mots = p.motsTrouves?.length ? ` [${p.motsTrouves.join(', ')}]` : ''
      lignes.push(`   ${String(p.score).padStart(3)}  ${p.texte.slice(0, 68)}...${mots}`)
    }
    lignes.push('')
  }
  lignes.push('Competences retenues : ' + cible.competences.map((g) => g.groupe).join(' | '))
  lignes.push('Projets retenus      : ' + cible.projets.map((p) => p.nom).join(' | '))
  return lignes.join('\n')
}
