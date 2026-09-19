import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './config.js'

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

export function ecrire(base) {
  mkdirSync(DOSSIER, { recursive: true })
  writeFileSync(FICHIER, JSON.stringify(base, null, 2), 'utf8')
}

/**
 * Fusionne les resultats d'une recherche dans le stock.
 * Une offre deja connue conserve son statut et ses notes : on ne perd jamais
 * le travail de suivi, meme si l'offre ressort d'une autre source.
 */
export function fusionner(offresClassees) {
  const base = lire()
  let nouvelles = 0
  let majs = 0

  for (const offre of offresClassees) {
    const cle = clefDedoublonnage(offre)
    const existante = Object.values(base.offres).find((o) => clefDedoublonnage(o) === cle)

    if (existante) {
      existante.evaluation = offre.evaluation
      existante.vuLe = new Date().toISOString()
      // Une meme offre publiee sur plusieurs sites : on garde la trace de chacune.
      existante.sourcesAlternatives = [
        ...new Set([...(existante.sourcesAlternatives ?? []), offre.source]),
      ].filter((s) => s !== existante.source)
      majs++
      continue
    }

    base.offres[offre.id] = {
      ...offre,
      statut: 'nouveau',
      decouvertLe: new Date().toISOString(),
      vuLe: new Date().toISOString(),
      notes: [],
      sourcesAlternatives: [],
    }
    nouvelles++
  }

  base.meta.derniereRecherche = new Date().toISOString()
  ecrire(base)
  return { nouvelles, majs, total: Object.keys(base.offres).length }
}

/** Deux annonces avec le meme intitule chez la meme entreprise sont la meme offre. */
function clefDedoublonnage(offre) {
  const norm = (s) =>
    (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')
  return `${norm(offre.entreprise)}::${norm(offre.titre)}`
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
