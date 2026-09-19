import { env, REQUETES, zoneLocale } from '../config.js'
import { getJson, nettoyer, pause } from './http.js'

const BASE = 'https://api.adzuna.com/v1/api/jobs'

function normaliser(offre, pays) {
  return {
    id: `adzuna-${offre.id}`,
    source: 'Adzuna',
    titre: offre.title,
    entreprise: offre.company?.display_name ?? 'Non communiquee',
    lieu: offre.location?.display_name ?? 'Non precise',
    pays,
    remote: /remote|t(e|é)l(e|é)travail|distanciel/i.test(`${offre.title} ${offre.description ?? ''}`),
    url: offre.redirect_url,
    description: nettoyer(offre.description),
    datePublication: offre.created,
    salaire:
      offre.salary_min && offre.salary_max
        ? `${Math.round(offre.salary_min)} - ${Math.round(offre.salary_max)}`
        : null,
    contrat: offre.contract_type ?? null,
    competences: [],
  }
}

/**
 * Deux passes : autour de la ville cible (rayon geographique) puis les offres
 * explicitement remote en France.
 */
export async function chercher({ rayonKm, journal = console } = {}) {
  const zone = zoneLocale()
  rayonKm ??= zone.rayonKm
  if (!env.adzuna.actif) {
    journal.log('  Adzuna : ignoree (cles absentes dans .env)')
    return []
  }

  const resultats = new Map()
  const passes = [
    { where: zone.ville, distance: rayonKm, libelle: zone.ville },
    { where: 'France', distance: null, libelle: 'remote France', remoteSeulement: true },
  ]

  for (const passe of passes) {
    for (const what of REQUETES.fr) {
      const params = new URLSearchParams({
        app_id: env.adzuna.appId,
        app_key: env.adzuna.appKey,
        results_per_page: '50',
        what,
        where: passe.where,
        content_type: 'application/json',
      })
      if (passe.distance) params.set('distance', String(passe.distance))
      if (passe.remoteSeulement) params.set('what_or', 'teletravail remote distanciel')

      try {
        const data = await getJson(`${BASE}/fr/search/1?${params}`)
        for (const offre of data?.results ?? []) {
          const n = normaliser(offre, 'France')
          if (passe.remoteSeulement && !n.remote) continue
          if (!resultats.has(n.id)) resultats.set(n.id, n)
        }
      } catch (err) {
        journal.log(`  Adzuna [${passe.libelle} / "${what}"] : ${err.message}`)
      }
      await pause(300)
    }
  }

  journal.log(`  Adzuna : ${resultats.size} offres`)
  return [...resultats.values()]
}
