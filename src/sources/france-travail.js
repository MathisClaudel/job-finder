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

function normaliser(offre) {
  const lieu = offre.lieuTravail ?? {}
  return {
    id: `ft-${offre.id}`,
    source: 'France Travail',
    titre: offre.intitule,
    entreprise: offre.entreprise?.nom ?? 'Non communiquee',
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
export async function chercher({ rayonKm, journal = console } = {}) {
  const zone = zoneLocale()
  rayonKm ??= zone.rayonKm
  if (!env.franceTravail.actif) {
    journal.log('  France Travail : ignoree (cles absentes dans .env)')
    return []
  }
  if (!zone.codeInsee) {
    journal.log('  France Travail : ignoree (code_insee absent du profil)')
    return []
  }

  const token = await obtenirToken()
  const resultats = new Map()

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
      journal.log(`  France Travail ["${motsCles}"] : ${err.message}`)
    }
    // L'API est limitee a quelques appels par seconde : on reste large.
    await pause(400)
  }

  journal.log(`  France Travail : ${resultats.size} offres`)
  return [...resultats.values()]
}
