import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './config.js'
import { creerIndex } from './dedoublonnage.js'
import { nettoyerEntreprise } from './sources/france-travail.js'

const DOSSIER = join(ROOT, 'data')
const FICHIER = join(DOSSIER, 'offres.json')

export const STATUTS = [
  'nouveau',
  'a-postuler',
  'postulee',
  'relancee',
  'entretien',
  'refus',
  'ecartee',
  'acceptee',
]

export function lire() {
  if (!existsSync(FICHIER)) return { offres: {}, meta: {} }
  return JSON.parse(readFileSync(FICHIER, 'utf8'))
}

/**
 * Ecriture atomique : fichier temporaire puis renommage.
 * Deux processus ecrivent maintenant cette base — le serveur de l'application
 * quand tu changes un statut, le CLI quand une recherche se termine. Une
 * ecriture directe interrompue a mi-chemin laisserait un JSON tronque,
 * c'est-a-dire tout le suivi perdu. Le renommage, lui, est indivisible.
 */
export function ecrire(base) {
  mkdirSync(DOSSIER, { recursive: true })
  const temporaire = `${FICHIER}.${process.pid}.tmp`
  writeFileSync(temporaire, JSON.stringify(base, null, 2), 'utf8')
  renameSync(temporaire, FICHIER)
}

/**
 * Ce que l'utilisateur a produit, plus ce que le systeme a observe de son cote :
 * jamais ecrase par une collecte. `disponibilite` en fait partie — c'est un
 * constat sur le lien, pas une donnee de la source ; l'effacer relancerait la
 * verification de toutes les offres a chaque recherche.
 */
const CHAMPS_DE_SUIVI = [
  'statut', 'statutLe', 'notes', 'decouvertLe', 'candidature',
  'relanceLe', 'lettre', 'sourcesAlternatives', 'disponibilite',
]

/**
 * Recopie les champs descriptifs d'une offre fraichement collectee sur celle
 * deja stockee. Sans cela, une offre connue gardait a jamais la forme qu'elle
 * avait le jour de sa decouverte : quand un connecteur apprend a nettoyer les
 * noms d'employeur ou a reconnaitre un job-dating, les anciennes offres n'en
 * profitaient pas.
 *
 * Reserve aux offres de la meme source : une annonce vue ailleurs n'est pas
 * autorisee a remplacer un nom d'employeur correct par le sien.
 */
function rafraichir(existante, fraiche) {
  // L'identite ne se rafraichit pas. Une annonce republiee sous un nouvel
  // identifiant reste rangee sous l'ancien : laisser `fraiche` imposer son id
  // desynchronise la clef et le champ, et toute recherche par id echoue ensuite.
  const conserves = { id: existante.id }
  for (const champ of CHAMPS_DE_SUIVI) {
    if (existante[champ] !== undefined) conserves[champ] = existante[champ]
  }
  for (const champ of Object.keys(existante)) {
    if (champ !== 'id' && !CHAMPS_DE_SUIVI.includes(champ)) delete existante[champ]
  }
  Object.assign(existante, fraiche, conserves)
}

/**
 * Fusionne les resultats d'une recherche dans le stock.
 * Une offre deja connue conserve son statut et ses notes : on ne perd jamais
 * le travail de suivi, meme si l'offre ressort d'une autre source.
 */
export function fusionner(offresClassees) {
  const base = lire()
  const index = creerIndex(Object.values(base.offres))
  let nouvelles = 0
  let majs = 0
  let doublons = 0

  for (const offre of offresClassees) {
    const existante = index.trouver(offre)

    if (existante) {
      // Le rafraichissement d'abord : il reconstruit l'offre a partir de la
      // collecte, donc tout ce qu'on ecrit ensuite doit venir apres lui.
      if (existante.source === offre.source) {
        rafraichir(existante, offre)
        majs++
      } else {
        doublons++
      }
      existante.evaluation = offre.evaluation
      existante.vuLe = new Date().toISOString()
      // Une meme offre publiee sur plusieurs sites : on garde la trace de chacune.
      existante.sourcesAlternatives = [
        ...new Set([...(existante.sourcesAlternatives ?? []), offre.source]),
      ].filter((s) => s !== existante.source)
      continue
    }

    const ajoutee = {
      ...offre,
      statut: 'nouveau',
      decouvertLe: new Date().toISOString(),
      vuLe: new Date().toISOString(),
      notes: [],
      sourcesAlternatives: [],
    }
    base.offres[offre.id] = ajoutee
    // Indexee aussitot : deux annonces identiques du meme lot ne rentrent
    // qu'une fois, meme si elles viennent de deux sources differentes.
    index.ajouter(ajoutee)
    nouvelles++
  }

  base.meta.derniereRecherche = new Date().toISOString()
  ecrire(base)
  return { nouvelles, majs, doublons, total: Object.keys(base.offres).length }
}

/**
 * Repasse la base entiere au crible du dedoublonnage et fusionne ce qui reste.
 * Sert apres un durcissement des regles, pour les doublons deja stockes.
 * L'offre conservee est celle qui porte le plus de suivi : un statut avance,
 * des notes, une lettre — on ne detruit jamais du travail.
 */
export function dedoublonnerBase({ simulation = false } = {}) {
  const base = lire()
  const rang = (o) =>
    (o.statut && o.statut !== 'nouveau' ? 100 : 0) +
    (o.notes?.length ?? 0) * 10 +
    (o.candidature ? Object.keys(o.candidature).length : 0)

  // Les offres les plus suivies passent en premier : ce sont elles qui restent.
  const ordonnees = Object.values(base.offres).sort((a, b) => rang(b) - rang(a))
  const index = creerIndex([])
  const fusions = []

  for (const offre of ordonnees) {
    const gardee = index.trouver(offre)
    if (!gardee) {
      index.ajouter(offre)
      continue
    }
    fusions.push({ gardee: gardee.id, supprimee: offre.id, titre: offre.titre, entreprise: offre.entreprise })
    gardee.sourcesAlternatives = [
      ...new Set([...(gardee.sourcesAlternatives ?? []), offre.source]),
    ].filter((s) => s !== gardee.source)
    if (offre.notes?.length) gardee.notes = [...(gardee.notes ?? []), ...offre.notes]
    if (!simulation) delete base.offres[offre.id]
  }

  if (!simulation && fusions.length) ecrire(base)
  return { fusions, restant: Object.keys(base.offres).length - (simulation ? fusions.length : 0) }
}

export function majStatut(id, statut, note) {
  const base = lire()
  const offre = base.offres[id] ?? Object.values(base.offres).find((o) => o.id.endsWith(id))
  if (!offre) throw new Error(`Offre introuvable : ${id}`)
  if (!STATUTS.includes(statut)) {
    throw new Error(`Statut inconnu : ${statut}. Valeurs possibles : ${STATUTS.join(', ')}`)
  }
  offre.statut = statut
  offre.statutLe = new Date().toISOString()
  if (note) offre.notes.push({ date: new Date().toISOString(), texte: note })
  ecrire(base)
  return offre
}

export function trouver(id) {
  const base = lire()
  return (
    base.offres[id] ??
    Object.values(base.offres).find((o) => o.id.endsWith(id) || o.id.includes(id))
  )
}

export function filtrer({ verdict, statut, source, limite = 30 } = {}) {
  const base = lire()
  return Object.values(base.offres)
    .filter((o) => !verdict || o.evaluation?.verdict === verdict)
    .filter((o) => !statut || o.statut === statut)
    .filter((o) => !source || o.source.toLowerCase().includes(source.toLowerCase()))
    .sort((a, b) => (b.evaluation?.note ?? 0) - (a.evaluation?.note ?? 0))
    .slice(0, limite)
}

/**
 * Met a jour les champs de suivi d'une offre pilotes depuis l'interface.
 * Ne touche jamais aux donnees issues des sources : seuls le statut, les notes,
 * la checklist de candidature et la date de relance sont modifiables ici.
 */
export function patcher(id, champs) {
  const base = lire()
  const offre = base.offres[id]
  if (!offre) throw new Error(`Offre introuvable : ${id}`)

  if (champs.statut !== undefined) {
    if (!STATUTS.includes(champs.statut)) throw new Error(`Statut inconnu : ${champs.statut}`)
    if (champs.statut !== offre.statut) {
      offre.statut = champs.statut
      offre.statutLe = new Date().toISOString()
    }
  }
  if (champs.note) {
    offre.notes = offre.notes ?? []
    offre.notes.push({ date: new Date().toISOString(), texte: String(champs.note) })
  }
  if (champs.candidature !== undefined) {
    offre.candidature = { ...(offre.candidature ?? {}), ...champs.candidature }
  }
  if (champs.relanceLe !== undefined) offre.relanceLe = champs.relanceLe || null
  if (champs.lettre !== undefined) offre.lettre = champs.lettre || null

  ecrire(base)
  return offre
}

/** Conserve le dernier etat de sante des sources pour que l'interface l'affiche. */
export function enregistrerSante(synthese) {
  const base = lire()
  base.meta = base.meta ?? {}
  base.meta.sante = synthese
  ecrire(base)
  return synthese
}

/**
 * Re-applique aux offres deja stockees les regles de nettoyage des noms
 * d'employeur. Le connecteur corrige les collectes a venir ; ceci repare
 * celles qui sont deja en base, et sert a nouveau chaque fois que la liste
 * des libelles non-employeurs s'allonge.
 */
export function reparerEntreprises({ simulation = false } = {}) {
  const base = lire()
  const corrections = []

  for (const offre of Object.values(base.offres)) {
    if (offre.source !== 'France Travail') continue
    const propre = nettoyerEntreprise(offre.entreprise)
    if (propre === offre.entreprise) continue
    corrections.push({ id: offre.id, avant: offre.entreprise, apres: propre, titre: offre.titre })
    if (!simulation) offre.entreprise = propre
  }

  if (!simulation && corrections.length) ecrire(base)
  return corrections
}

/** Statuts pour lesquels un lien mort te fait reellement perdre du temps. */
const STATUTS_SUIVIS = ['a-postuler', 'postulee', 'relancee', 'entretien']

/**
 * Choisit les offres dont la disponibilite merite d'etre verifiee.
 *
 * Tout verifier a chaque recherche serait 140 requetes pour rien : la plupart
 * des offres viennent d'etre revues dans leur flux. On retient celles ou le
 * doute est reel — celles que tu suis, et celles que la derniere collecte n'a
 * pas ramenees — en sautant ce qui vient d'etre controle.
 */
export function offresAVerifier({ toutes = false, ageHeures = 12 } = {}) {
  const base = lire()
  const offres = Object.values(base.offres)
  const recemment = Date.now() - ageHeures * 3600000
  const derniere = base.meta?.derniereRecherche
    ? new Date(base.meta.derniereRecherche).getTime() - 3600000
    : null

  return offres.filter((o) => {
    if (o.statut === 'ecartee') return false
    if (!toutes && o.disponibilite?.verifieeLe) {
      if (new Date(o.disponibilite.verifieeLe).getTime() > recemment) return false
    }
    if (toutes) return true
    if (STATUTS_SUIVIS.includes(o.statut)) return true
    // Absente de la derniere collecte : son flux ne la propose plus.
    return derniere !== null && new Date(o.vuLe).getTime() < derniere
  })
}

export function enregistrerDisponibilites(resultats) {
  const base = lire()
  let closes = 0
  for (const [id, resultat] of resultats) {
    const offre = base.offres[id]
    if (!offre) continue
    offre.disponibilite = resultat
    if (resultat.etat === 'close') closes++
  }
  ecrire(base)
  return { verifiees: resultats.size, closes }
}

/**
 * Remet en accord la clef et le champ `id` de chaque offre. Une divergence
 * rend l'offre introuvable par son identifiant : ni l'interface ni la
 * verification de disponibilite ne peuvent plus la joindre.
 */
export function reparerIdentifiants({ simulation = false } = {}) {
  const base = lire()
  const divergences = []
  for (const [cle, offre] of Object.entries(base.offres)) {
    if (offre.id === cle) continue
    divergences.push({ cle, id: offre.id, titre: offre.titre })
    if (!simulation) offre.id = cle
  }
  if (!simulation && divergences.length) ecrire(base)
  return divergences
}
