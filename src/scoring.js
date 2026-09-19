/**
 * Scoring des offres par rapport au profil.
 *
 * Le score se decompose en trois blocs PLAFONNES, plus des penalites non
 * plafonnees. Le plafond est essentiel : sans lui, une annonce passe-partout
 * qui enumere toutes les technos du marche (typique des places de marche
 * freelance) sort devant une offre reellement ciblee.
 *
 *   intitule   0-45   le poste correspond-il aux intitules vises
 *   technique  0-35   les competences reellement detenues
 *   contexte   0-20   zone geographique, seniorite, secteur
 *   penalites   < 0   incompatibilites (seniorite, contrat, habilitation)
 */

import { zoneLocale } from './config.js'

// Les communes de la zone de recherche viennent du profil, jamais du code.
const { ville: VILLE, communes: COMMUNES } = zoneLocale()

// ─── Bloc 1 : l'intitule correspond-il au projet professionnel ? ────
const FAMILLES_POSTE = [
  {
    cle: 'ia',
    points: 45,
    libelle: 'Poste IA',
    motifs: [
      /\b(ai|ml|llm|nlp|genai|gen ai)[\s-]?(engineer|developer|dev|scientist|specialist|architect)/i,
      /ing(e|é)nieur\s+(en\s+)?(ia|intelligence artificielle|machine learning)/i,
      /machine learning engineer/i,
      /(ai|ia)[\s/]?(engineer|ingenieur)/i,
      /applied (ai|scientist)/i,
      /prompt engineer/i,
      /\b(ia|ai)\b.{0,15}(engineer|developer)/i,
    ],
  },
  {
    cle: 'dotnet',
    points: 42,
    libelle: 'Poste .NET / C#',
    motifs: [/\.net\b/i, /\bc#/i, /dotnet/i, /d(e|é)veloppeur\s+(back|\.net|c#)/i],
  },
  {
    cle: 'data',
    points: 38,
    libelle: 'Poste Data / MLOps',
    motifs: [
      /data engineer/i, /mlops/i, /analytics engineer/i, /data scientist/i,
      /ing(e|é)nieur (data|donn(e|é)es)/i,
    ],
  },
  {
    cle: 'soft',
    points: 32,
    libelle: 'Poste developpement generaliste',
    motifs: [
      /software (engineer|developer)/i, /full[\s-]?stack/i, /back[\s-]?end/i,
      /front[\s-]?end/i, /d(e|é)veloppeur/i, /\bdeveloper\b/i, /ing(e|é)nieur (logiciel|d(e|é)tudes)/i,
      /web developer/i, /consultant (technique|applicatif|si)/i,
    ],
  },
]

// ─── Bloc 2 : competences reellement detenues ───────────────────────
const COMPETENCES = [
  { motifs: [/\bllm\b/i, /large language model/i], points: 9, libelle: 'LLM' },
  { motifs: [/\bai agents?\b/i, /agentic/i, /agents? (ia|d.ia)/i], points: 9, libelle: 'Agents IA' },
  { motifs: [/\bmcp\b/i, /model context protocol/i], points: 8, libelle: 'MCP' },
  { motifs: [/\brag\b/i, /retrieval.augmented/i], points: 7, libelle: 'RAG' },
  { motifs: [/\bc#\b/i, /\.net\b/i, /dotnet/i, /asp\.net/i], points: 9, libelle: 'C# / .NET' },
  { motifs: [/\btypescript\b/i], points: 7, libelle: 'TypeScript' },
  { motifs: [/\breact\b/i], points: 7, libelle: 'React' },
  { motifs: [/\bazure\b/i], points: 7, libelle: 'Azure (AZ-900)' },
  { motifs: [/\bpython\b/i], points: 6, libelle: 'Python' },
  { motifs: [/sharepoint/i, /\bspfx\b/i, /power platform/i], points: 6, libelle: 'SharePoint / SPFx' },
  { motifs: [/\bmlops\b/i], points: 6, libelle: 'MLOps' },
  { motifs: [/\bjavascript\b/i], points: 4, libelle: 'JavaScript' },
  { motifs: [/\bsql\b/i], points: 3, libelle: 'SQL' },
  { motifs: [/\bgit\b/i, /\bci\/cd\b/i, /devops/i], points: 3, libelle: 'Git / CI-CD' },
  { motifs: [/\bdocker\b/i, /kubernetes/i], points: 3, libelle: 'Docker' },
  { motifs: [/\bjava\b(?!script)/i], points: 2, libelle: 'Java' },
  { motifs: [/copilot/i], points: 4, libelle: 'GitHub Copilot' },
  { motifs: [/tests? automatis/i, /test automation/i, /non.r(e|é)gression/i], points: 4, libelle: 'Tests automatises' },
  { motifs: [/conduite du changement/i, /change management/i, /acculturation/i], points: 5, libelle: 'Conduite du changement' },
  { motifs: [/\bagile\b/i, /\bscrum\b/i], points: 2, libelle: 'Agile' },
]
const PLAFOND_TECHNIQUE = 35

// ─── Penalites ──────────────────────────────────────────────────────
const SENIORITE_TITRE =
  /\b(senior|sr\.?|lead|staff|principal|head of|director|vp|chief|architecte?|manager|expert)\b/i

const DRAPEAUX = [
  { motifs: [/\b(stage|internship|alternance|apprenticeship|apprenti)\b/i], points: -60, libelle: 'Stage/alternance' },
  { motifs: [/\b([7-9]|1[0-9])\s*(\+)?\s*(ans|years)\b[^.]{0,40}(exp(e|é)rience)/i], points: -35, libelle: 'Seniorite hors de portee' },
  { motifs: [/security clearance/i, /habilitation d(e|é)fense/i, /secret d(e|é)fense/i], points: -40, libelle: 'Habilitation requise' },
  { motifs: [/\bfreelance\b/i, /\bcontractor\b/i, /\bind(e|é)pendant\b/i, /\bb2b contract\b/i], points: -30, libelle: 'Freelance, pas un CDI' },
  { motifs: [/\bcdd\b/i, /fixed.term contract/i], points: -20, libelle: 'CDD' },
  { motifs: [/\bph\.?d\b/i, /\bdoctorat\b/i], points: -15, libelle: 'Doctorat attendu' },
]

/**
 * Places de marche freelance et cabinets de sourcing : ils publient des
 * annonces generiques enumerant toutes les technos, rediffusees sur toutes
 * les plateformes. Ce ne sont pas des employeurs en CDI.
 */
const INTERMEDIAIRES = [
  /lemon\.io/i, /toptal/i, /\bturing\b/i, /andela/i, /crossover/i, /gun\.io/i,
  /\barc\.dev\b/i, /x-?team/i, /proxify/i, /upwork/i, /fiverr/i, /braintrust/i,
  /\bteamed\b/i, /remotemore/i, /\bstrider\b/i,
]

/** Pays vers lesquels ces offres "remote" sont en realite reservees. */
const PAYS_OFFSHORE =
  'colombia|colombie|brazil|brasil|bresil|argentina|mexico|mexique|chile|peru|india|inde|' +
  'philippines|indonesia|vietnam|pakistan|bangladesh|nigeria|kenya|egypt|south africa|' +
  'ukraine|poland|romania|serbia|turkey|canada|australia|new zealand|singapore|japan'

const RESTRICTIONS_GEO = [
  /\b(us|usa|united states|u\.s\.)[\s-]?(only|based|residents?)/i,
  /must be (located|based|authorized to work) in the (us|united states|uk|canada|australia)/i,
  new RegExp(`\\b(${PAYS_OFFSHORE})[\\s-]?only\\b`, 'i'),
  /authorized to work in the united states/i,
  /\bwork authorization in the (us|uk)\b/i,
]

/**
 * Beaucoup d'annonces encodent la restriction dans l'intitule :
 * "Full Stack Engineer (Remote - Colombia)". Le champ `lieu` dit alors
 * seulement "Remote", ce qui laisserait passer l'offre.
 */
// Les separateurs varient : "(Remote @ Colombia)", "Remote - Brazil", "India | Remote".
const GEO_DANS_TITRE = new RegExp(
  `\\b(remote|based|hybrid)\\b[^a-z0-9]{0,4}\\b(${PAYS_OFFSHORE})\\b` +
    `|\\b(${PAYS_OFFSHORE})\\b[^a-z0-9]{0,4}\\b(remote|based)\\b`,
  'i',
)

const ZONES_OUVERTES = /worldwide|anywhere|global|emea|europe|international/i

/** "Sênior", "Sénior", "Senior" doivent declencher la meme penalite. */
const sansAccent = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

const texteOffre = (o) =>
  [o.titre, o.description, o.entrepriseDescription, (o.competences ?? []).join(' ')]
    .filter(Boolean)
    .join('\n')

export function evaluerLieu(offre) {
  const lieu = (offre.lieu ?? '').toLowerCase()
  const texte = texteOffre(offre)

  if (COMMUNES.some((c) => lieu.includes(c))) {
    return { compatible: true, categorie: 'local', raison: `Présentiel ${offre.lieu}` }
  }

  if (offre.remote) {
    if (GEO_DANS_TITRE.test(offre.titre ?? '')) {
      return { compatible: false, categorie: 'remote', raison: `Remote réservé à un pays : ${offre.titre}` }
    }
    const restreinte = RESTRICTIONS_GEO.some((r) => r.test(texte) || r.test(lieu))
    if (restreinte && !/france|europe|emea|worldwide|anywhere/i.test(lieu)) {
      return { compatible: false, categorie: 'remote', raison: 'Remote géo-restreint hors France' }
    }
    const ouverte = ZONES_OUVERTES.test(lieu) || /france/i.test(lieu)
    return {
      compatible: true,
      categorie: 'remote',
      raison: ouverte ? `Full remote (${offre.lieu})` : `Remote à vérifier (${offre.lieu})`,
      aVerifier: !ouverte,
    }
  }

  if (offre.pays === 'France') {
    return { compatible: false, categorie: 'presentiel', raison: `Hors zone : ${offre.lieu}` }
  }
  return { compatible: false, categorie: 'inconnu', raison: `Lieu incompatible : ${offre.lieu}` }
}

export function scorer(offre) {
  const texte = texteOffre(offre)
  const titre = offre.titre ?? ''
  const entreprise = offre.entreprise ?? ''
  const atouts = []
  const reserves = []

  // ── Bloc 1 : intitule ────────────────────────────────────────────
  const famille = FAMILLES_POSTE.find((f) => f.motifs.some((m) => m.test(titre)))
  let scoreIntitule = 0
  if (famille) {
    scoreIntitule = famille.points
    atouts.push(famille.libelle)
  } else {
    // Un intitule hors cible ne doit pas remonter grace au corps de l'annonce.
    reserves.push('Intitulé hors cible')
    scoreIntitule = -10
  }

  // ── Bloc 2 : competences, plafonnees ─────────────────────────────
  let scoreTechnique = 0
  for (const c of COMPETENCES) {
    if (!c.motifs.some((m) => m.test(texte))) continue
    const dansTitre = c.motifs.some((m) => m.test(titre))
    scoreTechnique += dansTitre ? c.points * 1.4 : c.points
    atouts.push(c.libelle)
  }
  const sature = scoreTechnique > PLAFOND_TECHNIQUE * 1.6
  scoreTechnique = Math.min(scoreTechnique, PLAFOND_TECHNIQUE)
  // Une annonce qui coche absolument tout ne cible personne.
  if (sature) reserves.push('Annonce générique (toutes technos citées)')

  // ── Bloc 3 : contexte ────────────────────────────────────────────
  let scoreContexte = 0
  const lieu = evaluerLieu(offre)
  if (lieu.categorie === 'local') {
    scoreContexte += 14
    atouts.push(VILLE)
  }
  if (lieu.aVerifier) reserves.push('Zone remote à confirmer')

  if (/\bjunior\b|d(e|é)butant|jeune dipl(o|ô)m(e|é)|graduate|entry.level|\b0.?[-a3]\s*ans\b/i.test(texte)) {
    scoreContexte += 12
    atouts.push('Ouvert aux juniors')
  }
  if (/banc(aire|e)|\bfintech\b|assurance|cr(e|é)dit/i.test(texte)) {
    scoreContexte += 4
    atouts.push('Secteur bancaire connu')
  }
  if (/\benglish\b|anglais courant|fluent in english/i.test(texte)) atouts.push('Anglais (C1)')
  scoreContexte = Math.min(scoreContexte, 20)

  // ── Penalites ────────────────────────────────────────────────────
  let penalites = 0
  if (SENIORITE_TITRE.test(sansAccent(titre))) {
    penalites -= 40
    reserves.push('Poste senior/lead (2 ans d\'expérience)')
  }
  if (INTERMEDIAIRES.some((m) => m.test(entreprise) || m.test(texte.slice(0, 400)))) {
    penalites -= 45
    reserves.push('Place de marché freelance, pas un employeur')
  }
  for (const d of DRAPEAUX) {
    if (!d.motifs.some((m) => m.test(texte))) continue
    penalites += d.points
    reserves.push(d.libelle)
  }

  const note = Math.max(0, Math.min(100, Math.round(scoreIntitule + scoreTechnique + scoreContexte + penalites)))

  return {
    note,
    detail: {
      intitule: Math.round(scoreIntitule),
      technique: Math.round(scoreTechnique),
      contexte: Math.round(scoreContexte),
      penalites: Math.round(penalites),
    },
    atouts: [...new Set(atouts)],
    reserves: [...new Set(reserves)],
    lieu,
    verdict: note >= 60 ? 'prioritaire' : note >= 40 ? 'a-etudier' : 'faible',
  }
}

/** Filtre sur la zone geographique puis sur le seuil, et trie par note. */
export function classer(offres, { seuil = 30 } = {}) {
  return offres
    .map((o) => ({ ...o, evaluation: scorer(o) }))
    .filter((o) => o.evaluation.lieu.compatible && o.evaluation.note >= seuil)
    .sort((a, b) => b.evaluation.note - a.evaluation.note)
}
