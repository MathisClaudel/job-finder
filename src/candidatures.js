/**
 * Registre des candidatures envoyees.
 *
 * `data/offres.json` decrit le marche ; ce fichier-ci decrit ce que tu as fait.
 * Les deux sont volontairement separes :
 *
 *  - une candidature survit a l'annonce. Betclic a retire son offre en aout,
 *    la candidature, elle, reste un fait a ne pas repeter ;
 *  - une candidature peut etre partie hors du job-finder — LinkedIn, site de
 *    l'entreprise, salon, cooptation — donc sans offre correspondante en base ;
 *  - fusionner les deux ferait disparaitre des offres reelles : le
 *    dedoublonnage de `store.js` absorbe toute annonce reconnue comme deja
 *    connue. Une candidature chez Atos effacerait la prochaine offre Atos au
 *    lieu de t'avertir. Ici, on avertit, on ne supprime jamais.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './config.js'
import { memeEmployeur, memeIntitule, entrepriseAnonyme } from './dedoublonnage.js'

const DOSSIER = join(ROOT, 'data')
const FICHIER = join(DOSSIER, 'candidatures.json')

export const ETATS = {
  prevu: 'Prévue',
  envoyee: 'Envoyée',
  relancee: 'Relancée',
  entretien: 'Entretien',
  refus: 'Refusée',
  acceptee: 'Acceptée',
  abandonnee: 'Abandonnée',
}

/** Etats qui valent « je suis deja passe par la ». « prevu » n'en fait pas partie. */
const ENVOYEES = ['envoyee', 'relancee', 'entretien', 'refus', 'acceptee', 'abandonnee']

/** Statut d'une offre → etat de la candidature correspondante. */
export const DEPUIS_STATUT = {
  postulee: 'envoyee',
  relancee: 'relancee',
  entretien: 'entretien',
  refus: 'refus',
  acceptee: 'acceptee',
}

const slug = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Clef naturelle : entreprise + poste. Deux envois pour le meme poste chez le
 * meme employeur ne sont pas deux candidatures, c'est precisement l'accident a
 * eviter — la clef le rend impossible, et rend l'import rejouable.
 */
export function clef(entreprise, poste) {
  return [slug(entreprise) || 'sans-employeur', slug(poste) || 'sans-poste'].join('--')
}

export function lire() {
  if (!existsSync(FICHIER)) return { candidatures: {}, meta: {} }
  return JSON.parse(readFileSync(FICHIER, 'utf8'))
}

/** Meme ecriture atomique que la base d'offres : CLI et serveur ecrivent ici. */
export function ecrire(registre) {
  mkdirSync(DOSSIER, { recursive: true })
  const temporaire = `${FICHIER}.${process.pid}.tmp`
  writeFileSync(temporaire, JSON.stringify(registre, null, 2), 'utf8')
  renameSync(temporaire, FICHIER)
}

export function liste() {
  return Object.values(lire().candidatures).sort((a, b) =>
    String(b.date ?? '').localeCompare(String(a.date ?? '')),
  )
}

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/**
 * Cree ou met a jour une candidature.
 * Les champs absents de l'appel ne sont pas effaces : une synchronisation
 * depuis la base d'offres ne doit pas ecraser une note ecrite a la main.
 */
export function enregistrer(entree) {
  if (!entree.entreprise?.trim()) throw new Error('Une candidature sans entreprise ne sert a rien')
  const registre = lire()
  const id = entree.id ?? clef(entree.entreprise, entree.poste)
  const existante = registre.candidatures[id] ?? {}

  if (entree.etat && !ETATS[entree.etat]) {
    throw new Error(`Etat inconnu : ${entree.etat}. Valeurs : ${Object.keys(ETATS).join(', ')}`)
  }

  const fusion = { ...existante }
  for (const [c, v] of Object.entries(entree)) {
    if (v !== undefined && v !== null && v !== '') fusion[c] = v
  }

  registre.candidatures[id] = {
    ...fusion,
    id,
    entreprise: entree.entreprise.trim(),
    poste: (entree.poste ?? existante.poste ?? '').trim() || null,
    etat: entree.etat ?? existante.etat ?? 'envoyee',
    date: entree.date ?? existante.date ?? aujourdhui(),
  }
  // Trace du premier envoi : l'etat evolue, la date d'envoi non. Une cible
  // n'a rien envoye, elle n'en recoit pas.
  const c = registre.candidatures[id]
  if (ENVOYEES.includes(c.etat)) c.envoyeeLe = existante.envoyeeLe ?? entree.envoyeeLe ?? c.date
  else delete c.envoyeeLe
  ecrire(registre)
  return registre.candidatures[id]
}

export function supprimer(id) {
  const registre = lire()
  if (!registre.candidatures[id]) throw new Error(`Candidature introuvable : ${id}`)
  delete registre.candidatures[id]
  ecrire(registre)
}

/**
 * Les employeurs publient le meme poste en francais ou en anglais selon le
 * site : « Ingenieur logiciel .NET » chez toi, « Software Engineer .Net » dans
 * l'annonce. On ramene les deux vers un vocabulaire commun avant de comparer.
 * Limite a ce controle : le dedoublonnage des offres garde ses regles strictes.
 */
// Accents retires avant remplacement : `\b` ne reconnait pas « é » comme une lettre.
const EQUIVALENCES = [
  [/\bingenieure?s?\b/g, 'engineer'],
  [/\bdeveloppeu(r|se)s?\b/g, 'developer'],
  [/\blogiciels?\b/g, 'software'],
  [/\bchef de projets?\b/g, 'project manager'],
  [/\barchitecte\b/g, 'architect'],
  [/\bingenierie\b/g, 'engineering'],
  [/\bdonnees\b/g, 'data'],
  [/\bia\b/g, 'ai'],
]
const traduire = (titre) =>
  EQUIVALENCES.reduce(
    (t, [motif, cible]) => t.replace(motif, cible),
    String(titre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  )
const memePosteQue = (a, b) => memeIntitule(a, b) || memeIntitule(traduire(a), traduire(b))

/**
 * Ce que tu as deja tente chez cet employeur.
 *
 * `memeEmployeur` et `memeIntitule` sont les regles deja eprouvees du
 * dedoublonnage : elles savent que « Stand CGI » et « CGI » sont le meme
 * employeur, et que « AI Engineer (H/F) » et « AI Engineer » sont le meme
 * poste. Reutiliser ces regles evite qu'un doublon passe ici alors qu'il
 * serait attrape la.
 */
export function antecedents(offre, registre = liste()) {
  if (!offre?.entreprise || entrepriseAnonyme(offre.entreprise)) {
    return { memePoste: [], memeEntreprise: [], cible: null }
  }
  const chezEux = registre.filter((c) => memeEmployeur(c.entreprise, offre.entreprise))
  const envoyees = chezEux.filter((c) => ENVOYEES.includes(c.etat))
  return {
    // Le vrai garde-fou : meme boite, meme poste. Postuler deux fois ici se
    // voit du cote recruteur et ne joue jamais en ta faveur.
    memePoste: envoyees.filter((c) => c.poste && memePosteQue(c.poste, offre.titre)),
    memeEntreprise: envoyees,
    cible: chezEux.find((c) => c.etat === 'prevu') ?? null,
  }
}

/* ── Import du suivi tenu a la main ──────────────────── */

const DATE_FR = /^(\d{2})\/(\d{2})\/(\d{4})$/

function dateIso(brut) {
  const m = DATE_FR.exec(String(brut ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function etatDepuisLibelle(brut) {
  const t = slug(brut)
  if (!t) return null
  if (t.startsWith('refus')) return 'refus'
  if (t.startsWith('envoy') || t.startsWith('postul')) return 'envoyee'
  if (t.startsWith('relanc')) return 'relancee'
  if (t.startsWith('entretien')) return 'entretien'
  if (t.startsWith('accept')) return 'acceptee'
  if (t.startsWith('abandon')) return 'abandonnee'
  return null
}

/** Decoupe les tableaux Markdown d'un document en lignes d'objets {colonne: valeur}. */
function tableauxMarkdown(texte) {
  const tableaux = []
  let courant = null

  for (const ligne of texte.split('\n')) {
    const t = ligne.trim()
    if (!t.startsWith('|')) {
      courant = null
      continue
    }
    const cellules = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (!courant) {
      courant = { colonnes: cellules.map(slug), lignes: [] }
      tableaux.push(courant)
      continue
    }
    // La ligne de separation `|-|-|` n'est pas une donnee.
    if (cellules.every((c) => /^:?-+:?$/.test(c) || c === '')) continue
    courant.lignes.push(Object.fromEntries(courant.colonnes.map((c, i) => [c, cellules[i] ?? ''])))
  }
  return tableaux
}

/** Une cellule de gabarit non remplie : « X », « X/5 », un tiret, du vide. */
const nonRenseigne = (v) => !v || /^(x(\s*\/\s*\d+)?|-|—|n\/a)$/i.test(String(v).trim())

/**
 * Lit le document de suivi tenu a la main et en fait des candidatures.
 *
 * Deux tableaux y coexistent : celui des candidatures effectuees (colonne
 * « Etat ») et celui des candidatures planifiees (colonne « Interet »). Le
 * second ne contient souvent qu'un nom d'entreprise : il devient une cible,
 * pas une candidature, et n'alimente pas l'avertissement de doublon.
 */
export function importerSuivi(texte, { simulation = false } = {}) {
  const resultats = { envoyees: [], cibles: [], ignorees: [] }

  for (const tableau of tableauxMarkdown(texte)) {
    const planifie = tableau.colonnes.includes('interet')
    for (const ligne of tableau.lignes) {
      const entreprise = ligne.entreprise
      if (!entreprise || nonRenseigne(entreprise)) {
        resultats.ignorees.push(ligne)
        continue
      }
      const poste = nonRenseigne(ligne.poste) ? null : ligne.poste

      if (planifie) {
        resultats.cibles.push({
          entreprise,
          poste,
          etat: 'prevu',
          date: null,
          notes: nonRenseigne(ligne.raison) ? null : ligne.raison,
          url: nonRenseigne(ligne.lien) ? null : ligne.lien,
          origine: 'suivi-manuel',
        })
        continue
      }

      const etat = etatDepuisLibelle(ligne.etat)
      if (!etat) {
        resultats.ignorees.push(ligne)
        continue
      }
      resultats.envoyees.push({
        entreprise,
        poste,
        etat,
        date: dateIso(ligne['date-de-derniere-maj'] ?? ligne.date),
        origine: 'suivi-manuel',
      })
    }
  }

  // Une cible deja postulee n'est plus une cible : la candidature prime.
  // « Banque postale » en cible et « La Banque Postale » en envoi sont le meme employeur.
  resultats.cibles = resultats.cibles.filter(
    (c) => !resultats.envoyees.some((e) => memeEmployeur(e.entreprise, c.entreprise)),
  )

  if (!simulation) {
    for (const c of [...resultats.envoyees, ...resultats.cibles]) enregistrer(c)
  }
  return resultats
}

/**
 * Reporte une offre de la base dans le registre, si son statut dit que la
 * candidature est partie. Appele par le serveur a chaque changement de statut :
 * le registre se tient a jour sans que tu aies a y penser.
 *
 * Une offre deja reportee est retrouvee par son id, meme si son intitule a
 * change depuis ; sinon elle prend sa clef naturelle.
 */
export function depuisOffre(o) {
  const etat = DEPUIS_STATUT[o?.statut]
  if (!etat || !o.entreprise || entrepriseAnonyme(o.entreprise)) return null
  const dejaLa = liste().find((c) => c.idOffre === o.id)
  return enregistrer({
    id: dejaLa?.id ?? clef(o.entreprise, o.titre),
    entreprise: o.entreprise,
    poste: o.titre,
    etat,
    date: (o.statutLe ?? '').slice(0, 10) || undefined,
    idOffre: o.id,
    url: o.url,
    source: o.source,
    origine: dejaLa?.origine ?? 'job-finder',
  })
}

/** Rattrapage en masse : `jf candidatures sync`. */
export function synchroniser(offres) {
  const avant = new Set(Object.keys(lire().candidatures))
  for (const o of offres) depuisOffre(o)
  return Object.keys(lire().candidatures).filter((id) => !avant.has(id))
}
