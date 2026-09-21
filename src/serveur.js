#!/usr/bin/env node
/**
 * Serveur local du poste de pilotage.
 * Il ne fait qu'exposer ce qui existe deja : la base data/offres.json via store.js,
 * le registre data/candidatures.json, les lettres du dossier lettres/, et les commandes du CLI lancees en sous-processus.
 * Rien ne sort de la machine, rien n'est duplique cote navigateur.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { ROOT, zoneLocale, chargerProfil } from './config.js'
import { lire, patcher, STATUTS } from './store.js'
import { commandeCv, nomFichierCv } from './cv/index.js'
import { htmlVersPdf, pdfAJour } from './cv/pdf.js'
import { lettreVersPdf } from './lettre-pdf.js'
import {
  liste as listeCandidatures, antecedents, depuisOffre, enregistrer, supprimer,
  ETATS as ETATS_CANDIDATURE,
} from './candidatures.js'

const PORT = Number(process.env.JF_PORT ?? 4317)
const APP = join(ROOT, 'app')
const LETTRES = join(ROOT, 'lettres')
const CV = join(ROOT, 'cv')

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
}

const slug = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Les descriptions viennent de sites tiers : on retire tout ce qui est executable. */
function assainir(html) {
  return String(html ?? '')
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

/**
 * Une lettre est rattachee a une offre par le champ `lettre` de la base, sinon par
 * l'en-tete `id_offre` que la skill /lettre ecrit dans chaque fichier, sinon par
 * le nom de l'entreprise.
 */
function lettresDisponibles() {
  if (!existsSync(LETTRES)) return []
  return readdirSync(LETTRES)
    .filter((f) => f.endsWith('.md'))
    .map((fichier) => {
      const entete = readFileSync(join(LETTRES, fichier), 'utf8').slice(0, 800)
      return {
        fichier,
        idOffre: entete.match(/^id_offre:\s*(.+)$/m)?.[1]?.trim() ?? null,
        entreprise: slug(entete.match(/^entreprise:\s*(.+)$/m)?.[1] ?? ''),
        // Les lettres d'avant le choix de langue n'ont pas ce champ : francaises.
        langue: entete.match(/^langue:\s*(\w+)/m)?.[1] ?? 'fr',
      }
    })
}

function lettrePour(offre, toutes, langue = 'fr') {
  if (langue === 'fr' && offre.lettre) return offre.lettre
  const lettres = toutes.filter((l) => l.langue === langue)
  const exacte = lettres.find((l) => l.idOffre && l.idOffre === offre.id)
  if (exacte) return exacte.fichier
  const cle = slug(offre.entreprise)
  if (!cle) return null
  // « Stand CGI » et « CGI » designent le meme employeur : on compare les deux sens.
  const proche = lettres.find(
    (l) => l.entreprise && (l.entreprise.includes(cle) || cle.includes(l.entreprise)),
  )
  return proche?.fichier ?? null
}

function etat() {
  const base = lire()
  const lettres = lettresDisponibles()
  const registre = listeCandidatures()
  const offres = Object.values(base.offres).map((o) => {
    // Un CV deja genere pour cette offre : l'app propose de l'ouvrir plutot
    // que de le refabriquer. Le nom est deterministe, rien n'est stocke.
    const cv = nomFichierCv(o)
    const cvEn = nomFichierCv(o, 'en')
    return {
      ...o,
      description: assainir(o.description),
      lettre: lettrePour(o, lettres),
      lettreEn: lettrePour(o, lettres, 'en'),
      cv: existsSync(join(CV, cv)) ? cv : null,
      cvEn: existsSync(join(CV, cvEn)) ? cvEn : null,
      candidature: o.candidature ?? {},
      // Deja postule chez eux ? Calcule a chaque lecture : le registre change
      // hors de l'offre (import, ajout manuel), rien ne doit etre perime.
      antecedents: antecedents(o, registre),
    }
  })
  offres.sort((a, b) => (b.evaluation?.note ?? 0) - (a.evaluation?.note ?? 0))

  const profil = chargerProfil()
  return {
    offres,
    meta: base.meta ?? {},
    statuts: STATUTS,
    candidatures: registre,
    etatsCandidature: ETATS_CANDIDATURE,
    ville: zoneLocale().ville,
    prenom: profil?.identite?.prenom ?? '',
  }
}

function json(res, code, corps) {
  const texte = JSON.stringify(corps)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(texte)
}

function corpsDe(req) {
  return new Promise((resoudre, rejeter) => {
    let brut = ''
    req.on('data', (c) => {
      brut += c
      if (brut.length > 1e6) rejeter(new Error('Corps trop volumineux'))
    })
    req.on('end', () => {
      try {
        resoudre(brut ? JSON.parse(brut) : {})
      } catch {
        rejeter(new Error('JSON invalide'))
      }
    })
  })
}

const COMMANDES = {
  search: ['src/cli.js', 'search'],
  report: ['src/cli.js', 'report'],
  sante: ['src/cli.js', 'sante'],
  disponibilite: ['src/cli.js', 'disponibilite'],
  extension: ['src/build-extension.js'],
}

/** Lance une commande du CLI et pousse sa sortie ligne a ligne vers le navigateur. */
function executer(res, nom) {
  const args = COMMANDES[nom]
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })
  const envoyer = (type, donnees) => res.write(`event: ${type}\ndata: ${JSON.stringify(donnees)}\n\n`)

  const enfant = spawn(process.execPath, args, { cwd: ROOT })
  // Les couleurs ANSI du CLI n'ont pas de sens dans une page web.
  const propre = (b) => String(b).replace(/\x1b\[[0-9;]*m/g, '')

  enfant.stdout.on('data', (b) => envoyer('log', propre(b)))
  enfant.stderr.on('data', (b) => envoyer('log', propre(b)))
  enfant.on('error', (e) => {
    envoyer('fin', { code: 1, erreur: e.message })
    res.end()
  })
  enfant.on('close', (code) => {
    envoyer('fin', { code })
    res.end()
  })
  res.on('close', () => enfant.kill())
}

function servirStatique(res, chemin) {
  const fichier = join(APP, chemin === '/' ? 'index.html' : chemin.replace(/^\//, ''))
  if (!fichier.startsWith(APP) || !existsSync(fichier)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('Introuvable')
  }
  res.writeHead(200, {
    'content-type': `${MIME[extname(fichier)] ?? 'application/octet-stream'}; charset=utf-8`,
    'cache-control': 'no-store',
  })
  res.end(readFileSync(fichier))
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const chemin = url.pathname

  try {
    if (chemin === '/api/etat') return json(res, 200, etat())

    if (chemin.startsWith('/api/executer/')) {
      const nom = chemin.split('/').pop()
      if (!COMMANDES[nom]) return json(res, 404, { erreur: `Commande inconnue : ${nom}` })
      return executer(res, nom)
    }

    if (chemin.startsWith('/api/offre/') && req.method === 'PATCH') {
      const id = decodeURIComponent(chemin.slice('/api/offre/'.length))
      const champs = await corpsDe(req)
      const offre = patcher(id, champs)
      // « Postulee » dans l'app = une ligne de plus au registre, sans ressaisie.
      if (champs.statut !== undefined) depuisOffre(offre)
      return json(res, 200, { offre })
    }

    // Registre des candidatures : ce que tu as envoye, dans le job-finder ou ailleurs.
    if (chemin === '/api/candidatures' && req.method === 'POST') {
      return json(res, 200, { candidature: enregistrer({ origine: 'app', ...(await corpsDe(req)) }) })
    }
    // Controle avant d'envoyer une candidature trouvee hors du job-finder.
    if (chemin === '/api/candidatures/verifier') {
      const entreprise = url.searchParams.get('entreprise') ?? ''
      const titre = url.searchParams.get('poste') ?? ''
      return json(res, 200, antecedents({ entreprise, titre }))
    }
    if (chemin.startsWith('/api/candidatures/')) {
      const id = decodeURIComponent(chemin.slice('/api/candidatures/'.length))
      if (req.method === 'DELETE') {
        supprimer(id)
        return json(res, 200, { supprimee: id })
      }
      if (req.method === 'PATCH') {
        const existante = listeCandidatures().find((c) => c.id === id)
        if (!existante) return json(res, 404, { erreur: `Candidature introuvable : ${id}` })
        const { etat, notes, date } = await corpsDe(req)
        return json(res, 200, { candidature: enregistrer({ ...existante, etat, notes, date }) })
      }
    }

    // Generation : l'app passe l'id de l'offre, eventuellement un axe force.
    if (chemin.startsWith('/api/cv/generer/') && req.method === 'POST') {
      const id = decodeURIComponent(chemin.slice('/api/cv/generer/'.length))
      const { axe, photo, langue } = await corpsDe(req)
      const args = [id, ...(axe ? ['--axe', axe] : []), ...(photo ? ['--photo'] : []), ...(langue ? ['--langue', langue] : [])]
      const r = commandeCv(args, { silencieux: true })
      return json(res, 200, {
        fichier: r.fichier,
        fichierTxt: r.fichierTxt,
        fichierPdf: r.fichierPdf,
        erreurPdf: r.erreurPdf,
        axe: r.cible.axe,
        langue: r.cible.langue,
        traductionsManquantes: r.cible.traductionsManquantes,
        titre: r.cible.titre,
        absents: r.absents,
      })
    }

    // Telechargement PDF. Un CV genere avant l'arrivee du PDF, ou dont le HTML
    // a ete retouche depuis, est reimprime a la volee.
    if (chemin.startsWith('/api/cv/pdf/')) {
      const fichier = decodeURIComponent(chemin.slice('/api/cv/pdf/'.length))
      const html = join(CV, fichier)
      if (!html.startsWith(CV) || !fichier.endsWith('.html') || !existsSync(html)) {
        return json(res, 404, { erreur: 'CV introuvable — le generer d abord' })
      }
      const pdf = html.replace(/\.html$/, '.pdf')
      if (!pdfAJour(html, pdf)) htmlVersPdf(html, pdf)
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${fichier.replace(/\.html$/, '.pdf')}"`,
        'cache-control': 'no-store',
      })
      return res.end(readFileSync(pdf))
    }

    // Lecture : le HTML s'ouvre dans un onglet, le TXT alimente le presse-papier.
    if (chemin.startsWith('/api/cv/fichier/')) {
      const fichier = decodeURIComponent(chemin.slice('/api/cv/fichier/'.length))
      const complet = join(CV, fichier)
      if (!complet.startsWith(CV) || !existsSync(complet)) {
        return json(res, 404, { erreur: 'CV introuvable — le generer d abord' })
      }
      if (url.searchParams.get('format') === 'json') {
        return json(res, 200, { fichier, texte: readFileSync(complet, 'utf8') })
      }
      res.writeHead(200, {
        'content-type': `${MIME[extname(complet)] ?? 'text/plain'}; charset=utf-8`,
        'cache-control': 'no-store',
      })
      return res.end(readFileSync(complet))
    }

    // PDF de la lettre : imprime a la volee s'il manque ou si le .md a change.
    if (chemin.startsWith('/api/lettre-pdf/')) {
      const fichier = decodeURIComponent(chemin.slice('/api/lettre-pdf/'.length))
      const complet = join(LETTRES, fichier)
      if (!complet.startsWith(LETTRES) || !fichier.endsWith('.md') || !existsSync(complet)) {
        return json(res, 404, { erreur: 'Lettre introuvable' })
      }
      const pdf = lettreVersPdf(fichier)
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${fichier.replace(/.md$/, '.pdf')}"`,
        'cache-control': 'no-store',
      })
      return res.end(readFileSync(pdf))
    }

    if (chemin.startsWith('/api/lettre/')) {
      const fichier = decodeURIComponent(chemin.slice('/api/lettre/'.length))
      const complet = join(LETTRES, fichier)
      if (!complet.startsWith(LETTRES) || !existsSync(complet)) {
        return json(res, 404, { erreur: 'Lettre introuvable' })
      }
      return json(res, 200, { fichier, texte: readFileSync(complet, 'utf8') })
    }

    if (chemin.startsWith('/api/')) return json(res, 404, { erreur: 'Route inconnue' })
    return servirStatique(res, chemin)
  } catch (e) {
    json(res, 400, { erreur: e.message })
  }
})

serveur.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Poste de pilotage : \x1b[36mhttp://localhost:${PORT}\x1b[0m`)
  console.log('  Ctrl+C pour arreter.\n')
})
