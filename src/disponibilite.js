/**
 * Verification qu'une offre est toujours ouverte.
 *
 * Le piege est de conclure trop vite. Mesure faite sur les 9 sources :
 * We Work Remotely et Himalayas repondent 403 a une requete programmatique,
 * et Adzuna redirige vers l'annonce d'origine. Traiter ces reponses comme une
 * fermeture ferait disparaitre des offres vivantes — une erreur bien plus
 * couteuse qu'un lien mort laisse en place.
 *
 * D'ou trois etats seulement, et un seul chemin vers « close » : un signal
 * explicite et sans ambiguite (404, 410, ou le 204 de l'API France Travail).
 * Tout le reste est « indeterminee », ce qui n'enleve rien a personne.
 */
import { env, UA } from './config.js'

export const ETATS_DISPO = ['ouverte', 'close', 'indeterminee']

const DELAI = 15000

/** France Travail expose une fiche par offre : c'est la source qui fait foi. */
const URL_OFFRE_FT = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres'
const URL_TOKEN_FT =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire'

export async function tokenFranceTravail() {
  if (!env.franceTravail.actif) return null
  const corps = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.franceTravail.clientId,
    client_secret: env.franceTravail.clientSecret,
    scope: 'api_offresdemploiv2 o2dsoffre',
  })
  const rep = await fetch(URL_TOKEN_FT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: corps,
  })
  if (!rep.ok) return null
  return (await rep.json()).access_token
}

/**
 * 200 : l'offre existe. 204 : France Travail l'a retiree — verifie sur une
 * offre reellement close, la fiche publique renvoie alors 404 de son cote.
 */
async function verifierFranceTravail(offre, token) {
  if (!token) return { etat: 'indeterminee', code: null, methode: 'api France Travail (sans jeton)' }
  const id = offre.id.replace(/^ft-/, '')
  const rep = await fetch(`${URL_OFFRE_FT}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(DELAI),
  })
  if (rep.status === 200) return { etat: 'ouverte', code: 200, methode: 'api France Travail' }
  if (rep.status === 204 || rep.status === 404) {
    return { etat: 'close', code: rep.status, methode: 'api France Travail' }
  }
  return { etat: 'indeterminee', code: rep.status, methode: 'api France Travail' }
}

/**
 * Pour les autres sources, seule l'absence averee de la page compte.
 * Un 403 signale une protection anti-robot, pas une offre close ; un 429 ou un
 * 5xx signale un incident chez l'hebergeur. Aucun des deux ne conclut.
 */
async function verifierParLien(offre) {
  if (!offre.url) return { etat: 'indeterminee', code: null, methode: 'aucun lien' }
  const rep = await fetch(offre.url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(DELAI),
  })
  if (rep.status === 404 || rep.status === 410) {
    return { etat: 'close', code: rep.status, methode: 'lien' }
  }
  if (rep.ok) return { etat: 'ouverte', code: rep.status, methode: 'lien' }
  return { etat: 'indeterminee', code: rep.status, methode: 'lien' }
}

/** Verdict pour une offre. Ne leve jamais : une panne reste « indeterminee ». */
export async function verifierOffre(offre, { token } = {}) {
  try {
    const resultat =
      offre.source === 'France Travail'
        ? await verifierFranceTravail(offre, token)
        : await verifierParLien(offre)
    return { ...resultat, verifieeLe: new Date().toISOString() }
  } catch (err) {
    return {
      etat: 'indeterminee',
      code: null,
      methode: 'erreur reseau',
      message: err.message.slice(0, 160),
      verifieeLe: new Date().toISOString(),
    }
  }
}

/**
 * Verifie un lot en limitant le nombre de requetes simultanees : ces serveurs
 * rendent un service gratuit, rien ne justifie de les marteler.
 */
export async function verifierLot(offres, { token, simultanees = 4, surAvancement } = {}) {
  const resultats = new Map()
  const file = [...offres]
  let faits = 0

  async function ouvrier() {
    for (let offre = file.shift(); offre; offre = file.shift()) {
      resultats.set(offre.id, await verifierOffre(offre, { token }))
      surAvancement?.(++faits, offres.length, offre)
    }
  }

  await Promise.all(Array.from({ length: Math.min(simultanees, offres.length) }, ouvrier))
  return resultats
}
