import { env, REQUETES, UA, zoneLocale } from '../config.js'
import { getJson, nettoyer, pause } from './http.js'

const URL_TOKEN =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire'
const URL_RECHERCHE =
  'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search'

let tokenCache = null

async function obtenirToken() {
  if (tokenCache && tokenCache.expire > Date.now() + 30_000) return tokenCache.valeur

  const corps = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.franceTravail.clientId,
    client_secret: env.franceTravail.clientSecret,
    scope: 'api_offresdemploiv2 o2dsoffre',
  })

  const rep = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: corps,
  })
  if (!rep.ok) {
    const detail = await rep.text().catch(() => '')
    throw new Error(
      `Authentification France Travail refusee (HTTP ${rep.status}). ` +
        `Verifie FRANCE_TRAVAIL_CLIENT_ID / _SECRET et l'abonnement a l'API "Offres d'emploi v2". ${detail.slice(0, 200)}`,
    )
  }
  const data = await rep.json()
  tokenCache = { valeur: data.access_token, expire: Date.now() + data.expires_in * 1000 }
  return tokenCache.valeur
}

/**
 * France Travail diffuse les offres d'un job-dating sous le nom du stand :
 * « Stand SFEIR » au lieu de « SFEIR ». Ce n'est pas une erreur de collecte,
 * c'est ce que l'API renvoie — mesure faite sur 3028 offres, les 53 libelles
 * commencant par « Stand » sont exactement les 53 offres dont la fiche
 * entreprise mentionne un job-dating.
 *
 * Le prefixe est donc retire, mais l'evenement n'est pas perdu pour autant :
 * il conditionne la maniere de postuler — on se presente au stand, on n'envoie
 * pas un formulaire — et il est reporte dans le champ `evenement`.
 */
const PREFIXE_STAND = /^\s*stand\s+/i

const INDICE_EVENEMENT = /job\s?dating|jobdating|salon|forum|semaine des m[ée]tiers/i

/**
 * Libelles qui occupent la place du nom d'entreprise sans en etre un : le stand
 * de France Travail lui-meme, ou un intitule de service interne. Mieux vaut
 * « non communiquee », qui est vrai, qu'un nom qui induit en erreur et fausse
 * le dedoublonnage. Liste a completer au fil des cas rencontres.
 */
const NON_EMPLOYEURS = [
  /^stand$/i,
  /^france travail\b/i,
  /^p(o|ô)le emploi\b/i,
  /^fonctions? supports?$/i,
  /^service (rh|ressources humaines)$/i,
  /^recrutement$/i,
]

const ANONYME = 'Non communiquee'

export function nettoyerEntreprise(nom) {
  const brut = (nom ?? '').trim()
  if (!brut) return ANONYME
  const sansStand = brut.replace(PREFIXE_STAND, '').trim()
  if (!sansStand) return ANONYME
  return NON_EMPLOYEURS.some((m) => m.test(sansStand)) ? ANONYME : sansStand
}

/** L'evenement d'origine, quand l'offre vient d'un job-dating ou d'un salon. */
function evenementDe(entreprise) {
  const description = (entreprise?.description ?? '').trim()
  const viaStand = PREFIXE_STAND.test(entreprise?.nom ?? '')
  if (!viaStand && !INDICE_EVENEMENT.test(description)) return null
  return {
    intitule: description.split('\n')[0]?.trim() || 'Job-dating',
    detail: description.replace(/\s*\n\s*/g, ' · '),
    url: entreprise?.url ?? null,
  }
}

function normaliser(offre) {
  const lieu = offre.lieuTravail ?? {}
  const evenement = evenementDe(offre.entreprise)
  return {
    id: `ft-${offre.id}`,
    source: 'France Travail',
    titre: offre.intitule,
    entreprise: nettoyerEntreprise(offre.entreprise?.nom),
    ...(evenement ? { evenement } : {}),
    lieu: lieu.libelle ?? 'Non precise',
    pays: 'France',
    remote: /t(e|é)l(e|é)travail|remote|distanciel/i.test(
      `${offre.intitule} ${offre.description ?? ''}`,
    ),
    url: offre.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${offre.id}`,
    description: nettoyer(offre.description),
    datePublication: offre.dateCreation,
    salaire: offre.salaire?.libelle ?? null,
    contrat: offre.typeContratLibelle ?? offre.typeContrat ?? null,
    entrepriseDescription: nettoyer(offre.entreprise?.description),
    competences: (offre.competences ?? []).map((c) => c.libelle).filter(Boolean),
  }
}

/**
 * Recherche autour de la ville cible. L'API impose un code INSEE + une distance
 * en km pour couvrir "la ville et ses alentours" ; les deux viennent du profil.
 */
export async function chercher({ rayonKm, journal = console, rapport } = {}) {
  const zone = zoneLocale()
  rayonKm ??= zone.rayonKm
  if (!env.franceTravail.actif) {
    journal.log('  France Travail : ignoree (cles absentes dans .env)')
    rapport?.ignorer('France Travail', 'Clés absentes dans .env')
    return []
  }
  if (!zone.codeInsee) {
    journal.log('  France Travail : ignoree (code_insee absent du profil)')
    rapport?.ignorer('France Travail', 'code_insee absent du profil')
    return []
  }

  const debut = Date.now()
  let token
  try {
    token = await obtenirToken()
  } catch (err) {
    // L'authentification est le point de panne le plus frequent : cles revoquees,
    // abonnement a l'API expire. Il doit remonter tel quel, pas en "0 offre".
    rapport?.enregistrer('France Travail', {
      etat: 'echec',
      offres: 0,
      ms: Date.now() - debut,
      message: err.message.slice(0, 300),
    })
    throw err
  }
  const resultats = new Map()
  let echecs = 0
  let dernierEchec = null

  for (const motsCles of REQUETES.fr) {
    const params = new URLSearchParams({
      motsCles,
      commune: zone.codeInsee,
      distance: String(rayonKm),
      typeContrat: 'CDI',
      range: '0-149',
    })
    try {
      const data = await getJson(`${URL_RECHERCHE}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      for (const offre of data?.resultats ?? []) {
        const n = normaliser(offre)
        if (!resultats.has(n.id)) resultats.set(n.id, n)
      }
    } catch (err) {
      echecs++
      dernierEchec = err.message
      journal.log(`  France Travail ["${motsCles}"] : ${err.message}`)
    }
    // L'API est limitee a quelques appels par seconde : on reste large.
    await pause(400)
  }

  rapport?.enregistrer('France Travail', {
    etat: echecs === REQUETES.fr.length ? 'echec' : resultats.size ? 'ok' : 'vide',
    offres: resultats.size,
    ms: Date.now() - debut,
    message: echecs
      ? `${echecs}/${REQUETES.fr.length} requêtes en échec — ${String(dernierEchec).slice(0, 200)}`
      : null,
  })
  journal.log(`  France Travail : ${resultats.size} offres`)
  return [...resultats.values()]
}
