import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Charge .env sans dependance externe (Node 20 n'a pas encore --env-file stable partout). */
function chargerEnv() {
  const chemin = join(ROOT, '.env')
  if (!existsSync(chemin)) return
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const valeur = m[2].trim().replace(/^["']|["']$/g, '')
    if (valeur && !process.env[m[1]]) process.env[m[1]] = valeur
  }
}
chargerEnv()

/**
 * Le profil reel (`profil/*.yaml`) contient des donnees personnelles et n'est pas
 * versionne. A l'installation il n'existe pas encore : on retombe alors sur le
 * gabarit `*.example.yaml`, ce qui permet de lancer l'outil avant de l'avoir rempli.
 */
function cheminProfil(nom) {
  const reel = join(ROOT, 'profil', `${nom}.yaml`)
  return existsSync(reel) ? reel : join(ROOT, 'profil', `${nom}.example.yaml`)
}

function lireProfil(nom) {
  const chemin = cheminProfil(nom)
  return existsSync(chemin) ? parse(readFileSync(chemin, 'utf8')) : null
}

export function chargerProfil() {
  const p = lireProfil('profil')
  if (!p) throw new Error('profil/profil.yaml introuvable — copier profil/profil.example.yaml')
  return p
}

export function chargerHistoires() {
  return lireProfil('histoires') ?? {}
}

export function chargerReponsesAts() {
  return lireProfil('reponses-ats') ?? {}
}

export function chargerCv() {
  const cv = lireProfil('cv')
  if (!cv) throw new Error('profil/cv.yaml introuvable — copier profil/cv.example.yaml')
  return cv
}

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Zone de recherche en presentiel, lue depuis le profil : aucune ville n'est
 * codee en dur ici. `communes` sert au matching du lieu des offres, avec et sans
 * accent puisque les plateformes ecrivent les deux.
 */
let zoneMemo = null
export function zoneLocale() {
  if (zoneMemo) return zoneMemo
  const p = chargerProfil().recherche?.localisation?.presentiel ?? {}
  const noms = [p.ville_cible, ...(p.villes_incluses ?? [])].filter(Boolean).map(String)
  const communes = [...new Set(noms.flatMap((n) => [n.toLowerCase(), sansAccent(n.toLowerCase())]))]
  zoneMemo = {
    ville: p.ville_cible ?? 'Zone locale',
    rayonKm: Number(p.rayon_km ?? 40),
    codeInsee: p.code_insee ? String(p.code_insee) : null,
    departement: p.departement ? String(p.departement) : null,
    communes,
  }
  return zoneMemo
}

export const env = {
  franceTravail: {
    clientId: process.env.FRANCE_TRAVAIL_CLIENT_ID,
    clientSecret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET,
    get actif() { return Boolean(this.clientId && this.clientSecret) },
  },
  adzuna: {
    appId: process.env.ADZUNA_APP_ID,
    appKey: process.env.ADZUNA_APP_KEY,
    get actif() { return Boolean(this.appId && this.appKey) },
  },
}

/**
 * Mots-cles de recherche, derives du ciblage valide :
 * ingenieur IA, dev .NET/C#/fullstack, data/MLOps.
 */
export const REQUETES = {
  fr: [
    'ingenieur intelligence artificielle',
    'ingenieur IA',
    'developpeur IA',
    'developpeur .NET',
    'developpeur C#',
    'developpeur fullstack',
    'data engineer',
    'MLOps',
  ],
  en: [
    'AI engineer',
    'machine learning engineer',
    'LLM engineer',
    'software engineer AI',
    '.NET developer',
    'C# developer',
    'fullstack developer',
    'data engineer',
    'MLOps engineer',
  ],
}

export const UA = 'job-finder/1.0 (recherche d emploi personnelle)'
