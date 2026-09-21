/**
 * Commande `jf cv` — genere un CV cible sur une offre de la base.
 *
 * Le PDF est imprime par le Edge/Chrome deja installe (voir pdf.js) : couche
 * texte propre, sans embarquer Chromium dans les dependances du depot.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { ROOT, chargerProfil, chargerCv } from '../config.js'
import { trouver } from '../store.js'
import { cibler, expliquer, manques } from './ciblage.js'
import { rendreHtml, rendreTexte } from './rendu.js'
import { htmlVersPdf } from './pdf.js'

const DOSSIER = join(ROOT, 'cv')
const TYPES_IMAGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

/** La photo est facultative : absente, le CV se rend sans elle, sans erreur. */
function photoDataUri() {
  for (const ext of Object.keys(TYPES_IMAGE)) {
    const chemin = join(ROOT, 'profil', `photo${ext}`)
    if (!existsSync(chemin)) continue
    return `data:${TYPES_IMAGE[ext]};base64,${readFileSync(chemin).toString('base64')}`
  }
  return null
}

const glisser = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/**
 * Nom du fichier produit pour une offre. Expose pour que l'app sache, sans
 * rien regenerer, si un CV existe deja pour une offre donnee.
 *
 * Le francais garde le nom historique ; l'anglais prend un suffixe, pour que
 * les deux versions d'un meme CV coexistent.
 */
export function nomFichierCv(offre, langue = 'fr') {
  const suffixe = langue === 'fr' ? null : langue
  return ['cv', glisser(offre?.entreprise), glisser(offre?.titre), suffixe].filter(Boolean).join('-') + '.html'
}

export const DOSSIER_CV = DOSSIER

function argOpt(args, nom, defaut) {
  const i = args.indexOf(`--${nom}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defaut
}

const OPTIONS_A_VALEUR = ['axe', 'fichier', 'titre', 'entreprise', 'langue']

/**
 * Une offre qui n'est pas en base — annonce collee dans le chat, page d'un
 * site que le job-finder n'interroge pas, offre transmise par un contact.
 * Elle n'entre pas dans le store : elle ne sert qu'a ce rendu.
 *
 * Le titre gouverne la detection de l'axe. A defaut d'un `--titre`, on prend
 * la premiere ligne non vide du fichier, qui est presque toujours l'intitule.
 */
function offreLibre(args) {
  const fichier = argOpt(args, 'fichier', null)
  const texte = fichier ? readFileSync(fichier, 'utf8') : readFileSync(0, 'utf8')
  if (!texte.trim()) throw new Error('Annonce vide — passer --fichier <chemin> ou piper le texte')

  const lignes = texte.split('\n').map((l) => l.trim())
  const titre = argOpt(args, 'titre', lignes.find(Boolean) ?? 'Offre')
  return {
    id: 'libre',
    titre,
    entreprise: argOpt(args, 'entreprise', ''),
    description: texte,
  }
}

/**
 * @param options.silencieux appele par le serveur de l'app : le resultat part
 *   vers le navigateur, la sortie console n'a pas de lecteur.
 */
export function commandeCv(args = [], options = {}) {
  const brut = {
    gras: (s) => `\x1b[1m${s}\x1b[0m`,
    vert: (s) => `\x1b[32m${s}\x1b[0m`,
    gris: (s) => `\x1b[90m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
    jaune: (s) => `\x1b[33m${s}\x1b[0m`,
  }
  const C = options.silencieux ? {} : brut
  const console = options.silencieux ? { log: () => {} } : globalThis.console
  for (const cle of Object.keys(brut)) C[cle] ??= (s) => s

  // L'identifiant est le seul argument libre : les valeurs qui suivent
  // `--axe`, `--fichier`, `--titre` ou `--entreprise` n'en sont pas, sans quoi
  // `cv --axe ia` chercherait une offre « ia ».
  const valeurs = new Set(OPTIONS_A_VALEUR.map((o) => args.indexOf(`--${o}`)).filter((i) => i >= 0).map((i) => i + 1))
  const idOffre = args.find((a, i) => !a.startsWith('--') && !valeurs.has(i))

  const libre = args.includes('--fichier') || args.includes('--stdin')
  if (libre && idOffre) throw new Error('Choisir : un id en base, ou une annonce libre — pas les deux')

  const offre = libre ? offreLibre(args) : idOffre ? trouver(idOffre) : null
  if (idOffre && !offre) throw new Error(`Offre ${idOffre} introuvable en base — verifier avec \`npm run list\``)

  const cible = cibler(chargerCv(), chargerProfil(), offre, {
    axe: argOpt(args, 'axe', null),
    photo: args.includes('--photo'),
    langue: argOpt(args, 'langue', 'fr'),
  })

  const base = offre
    ? nomFichierCv(offre, cible.langue).replace(/\.html$/, '')
    : ['cv', cible.axe, cible.langue === 'fr' ? null : cible.langue].filter(Boolean).join('-')

  mkdirSync(DOSSIER, { recursive: true })
  const cheminHtml = join(DOSSIER, `${base}.html`)
  const cheminTxt = join(DOSSIER, `${base}.txt`)
  const texteCv = rendreTexte(cible)
  writeFileSync(cheminHtml, rendreHtml(cible, { photoDataUri: photoDataUri() }), 'utf8')
  writeFileSync(cheminTxt, texteCv, 'utf8')
  const absents = manques(cible, offre, texteCv)

  // Un PDF rate ne doit pas faire perdre le HTML : on le signale, sans plus.
  const cheminPdf = join(DOSSIER, `${base}.pdf`)
  let erreurPdf = null
  try {
    htmlVersPdf(cheminHtml, cheminPdf)
  } catch (e) {
    erreurPdf = e.message
  }

  console.log(`\n${C.gras('CV genere')}\n`)
  if (offre) console.log(C.gris(`  Offre  : ${offre.titre} — ${offre.entreprise}`))
  console.log(C.gris(`  Axe    : ${cible.axe}`))
  console.log(C.gris(`  Langue : ${cible.langue}`))
  console.log(C.gris(`  Titre  : ${cible.titre}`))
  console.log(`\n  ${C.cyan(cheminHtml)}`)
  if (!erreurPdf) console.log(`  ${C.cyan(cheminPdf)}`)
  console.log(`  ${C.gris(cheminTxt)}  ${C.gris('(pour les champs "collez votre CV")')}`)

  if (absents.length) {
    console.log(`\n  ${C.jaune('Demande par l annonce, absent du CV :')} ${absents.join(', ')}`)
    console.log(C.gris('  Pour chacun : soit le fait existe et merite une puce dans profil/cv.yaml,'))
    console.log(C.gris('  soit il n existe pas et il ne doit pas apparaitre. Aucun ajout automatique.'))
  }

  if (cible.traductionsManquantes.length) {
    console.log(`\n  ${C.jaune('Sans traduction, laisse en francais :')} ${cible.traductionsManquantes.join(', ')}`)
    console.log(C.gris('  Ajouter le champ _en correspondant dans profil/cv.yaml.'))
  }

  if (cible.photo && !photoDataUri()) {
    console.log(C.jaune("\n  --photo demande mais aucune photo trouvee : deposer profil/photo.jpg"))
  }
  if (erreurPdf) {
    console.log(C.jaune(`\n  PDF non genere : ${erreurPdf}`))
    console.log(C.gris('  Repli : ouvrir le .html dans Chrome puis Ctrl+P → "Enregistrer au format PDF".'))
  }
  console.log('')

  if (args.includes('--diff')) console.log(C.gris(expliquer(cible)) + '\n')
  return {
    cheminHtml, cheminTxt, cheminPdf: erreurPdf ? null : cheminPdf,
    fichier: `${base}.html`, fichierTxt: `${base}.txt`, fichierPdf: erreurPdf ? null : `${base}.pdf`,
    erreurPdf, absents, cible,
  }
}
