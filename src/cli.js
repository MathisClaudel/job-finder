#!/usr/bin/env node
import { chercher as chercherFranceTravail } from './sources/france-travail.js'
import { chercher as chercherAdzuna } from './sources/adzuna.js'
import { chercher as chercherRemote } from './sources/remote-mondial.js'
import { classer } from './scoring.js'
import { fusionner, filtrer, trouver, majStatut, lire, STATUTS } from './store.js'
import { chargerProfil, env, zoneLocale } from './config.js'
import { genererRapport } from './report.js'

const C = {
  gras: (s) => `\x1b[1m${s}\x1b[0m`,
  vert: (s) => `\x1b[32m${s}\x1b[0m`,
  jaune: (s) => `\x1b[33m${s}\x1b[0m`,
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  rouge: (s) => `\x1b[31m${s}\x1b[0m`,
}

const couleurVerdict = { prioritaire: C.vert, 'a-etudier': C.jaune, faible: C.gris }

function argOpt(args, nom, defaut) {
  const i = args.indexOf(`--${nom}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut
}

async function commandeSearch(args) {
  const profil = chargerProfil()
  const rayonKm = Number(argOpt(args, 'rayon', zoneLocale().rayonKm))
  const seuil = Number(argOpt(args, 'seuil', 30))

  console.log(C.gras('\nRecherche en cours\n'))
  console.log(C.gris(`  Zone : ${zoneLocale().ville} + ${rayonKm} km, et full remote mondial`))
  console.log(C.gris(`  Seuil de pertinence : ${seuil}/100\n`))

  if (!env.franceTravail.actif || !env.adzuna.actif) {
    console.log(
      C.jaune(
        `  Attention : des cles API manquent dans .env — la couverture ${zoneLocale().ville} sera partielle.\n`,
      ),
    )
  }

  const lots = await Promise.allSettled([
    chercherFranceTravail({ rayonKm }),
    chercherAdzuna({ rayonKm }),
    chercherRemote({}),
  ])

  const brutes = lots.flatMap((l) => (l.status === 'fulfilled' ? l.value : []))
  lots.filter((l) => l.status === 'rejected').forEach((l) => console.log(C.rouge(`  ${l.reason.message}`)))

  const classees = classer(brutes, { seuil })
  const { nouvelles, majs, total } = fusionner(classees)

  console.log(
    `\n${C.gras('Resultat')} : ${brutes.length} offres collectees, ${classees.length} retenues apres filtrage`,
  )
  console.log(`  ${C.vert(`${nouvelles} nouvelles`)}, ${majs} deja connues, ${total} au total en base\n`)

  const prioritaires = filtrer({ verdict: 'prioritaire', statut: 'nouveau', limite: 10 })
  if (prioritaires.length) {
    console.log(C.gras('A regarder en priorite :\n'))
    prioritaires.forEach(afficherLigne)
    console.log(C.gris(`\n  Detail d'une offre : npm run show -- <id>`))
    console.log(C.gris(`  Rapport complet    : npm run report\n`))
  } else {
    console.log(C.gris('  Aucune nouvelle offre prioritaire cette fois.\n'))
  }
}

function afficherLigne(o) {
  const note = (couleurVerdict[o.evaluation?.verdict] ?? C.gris)(
    String(o.evaluation?.note ?? 0).padStart(3),
  )
  const lieu = o.evaluation?.lieu?.categorie === 'local' ? zoneLocale().ville : 'Remote'
  console.log(`  ${note}  ${C.gras(o.titre.slice(0, 58).padEnd(58))} ${C.cyan(o.entreprise.slice(0, 24))}`)
  console.log(
    `       ${C.gris(`${lieu} · ${o.source} · ${o.id}`)}${o.statut !== 'nouveau' ? C.jaune(` · ${o.statut}`) : ''}`,
  )
  if (o.evaluation?.atouts?.length) {
    console.log(`       ${C.gris('+ ' + o.evaluation.atouts.slice(0, 6).join(', '))}`)
  }
  if (o.evaluation?.reserves?.length) {
    console.log(`       ${C.jaune('! ' + o.evaluation.reserves.join(', '))}`)
  }
  console.log()
}

function commandeList(args) {
  const offres = filtrer({
    verdict: argOpt(args, 'verdict'),
    statut: argOpt(args, 'statut'),
    source: argOpt(args, 'source'),
    limite: Number(argOpt(args, 'limite', 30)),
  })
  if (!offres.length) return console.log(C.gris('\n  Aucune offre ne correspond a ce filtre.\n'))
  console.log()
  offres.forEach(afficherLigne)
}

function commandeShow(args) {
  const offre = trouver(args[0])
  if (!offre) return console.log(C.rouge(`\n  Offre introuvable : ${args[0]}\n`))

  console.log(`\n${C.gras(offre.titre)}`)
  console.log(`${C.cyan(offre.entreprise)} — ${offre.lieu}`)
  console.log(C.gris(`${offre.source} · ${offre.contrat ?? 'contrat non precise'} · publiee le ${(offre.datePublication ?? '').slice(0, 10)}`))
  console.log(C.gris(offre.url))
  console.log(`\n${C.gras('Score')} : ${offre.evaluation.note}/100 (${offre.evaluation.verdict})`)
  console.log(`${C.vert('Atouts')}   : ${offre.evaluation.atouts.join(', ') || '—'}`)
  console.log(`${C.jaune('Reserves')} : ${offre.evaluation.reserves.join(', ') || '—'}`)
  console.log(`${C.gris('Lieu')}     : ${offre.evaluation.lieu.raison}`)
  if (offre.salaire) console.log(`${C.gris('Salaire')}  : ${offre.salaire}`)
  console.log(`${C.gris('Statut')}   : ${offre.statut}`)
  if (offre.notes?.length) {
    console.log(`\n${C.gras('Notes')}`)
    offre.notes.forEach((n) => console.log(`  ${C.gris(n.date.slice(0, 10))} ${n.texte}`))
  }
  console.log(`\n${C.gras('Description')}\n`)
  console.log(offre.description.slice(0, 3000))
  console.log(
    C.gris(
      `\n\n  Lettre de motivation : ouvre Claude Code et lance  /lettre ${offre.id}\n` +
        `  Marquer postulee     : npm run status -- ${offre.id} postulee\n`,
    ),
  )
}

function commandeStatus(args) {
  const [id, statut, ...note] = args
  if (!id || !statut) {
    return console.log(
      C.gris(`\n  Usage : npm run status -- <id> <statut> ["note"]\n  Statuts : ${STATUTS.join(', ')}\n`),
    )
  }
  const offre = majStatut(id, statut, note.join(' '))
  console.log(C.vert(`\n  ${offre.titre} → ${statut}\n`))
}

function commandeStats() {
  const base = lire()
  const offres = Object.values(base.offres)
  const parStatut = {}
  const parSource = {}
  for (const o of offres) {
    parStatut[o.statut] = (parStatut[o.statut] ?? 0) + 1
    parSource[o.source] = (parSource[o.source] ?? 0) + 1
  }
  console.log(`\n${C.gras('Suivi de candidatures')}\n`)
  console.log(C.gris(`  Derniere recherche : ${base.meta?.derniereRecherche ?? 'jamais'}\n`))
  for (const s of STATUTS) {
    if (parStatut[s]) console.log(`  ${String(parStatut[s]).padStart(4)}  ${s}`)
  }
  console.log(`\n${C.gras('Par source')}\n`)
  for (const [s, n] of Object.entries(parSource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${s}`)
  }
  console.log()
}

const commandes = {
  search: commandeSearch,
  list: commandeList,
  show: commandeShow,
  status: commandeStatus,
  stats: commandeStats,
  report: genererRapport,
}

const [, , commande, ...args] = process.argv
const fn = commandes[commande]

if (!fn) {
  console.log(`
${C.gras('job-finder')} — recherche d'emploi locale + full remote mondial

  ${C.cyan('npm run search')}                       Interroge toutes les sources et met a jour la base
  ${C.cyan('npm run list')} -- --verdict prioritaire  Liste les offres en base
  ${C.cyan('npm run show')} -- <id>                   Detail complet d'une offre
  ${C.cyan('npm run status')} -- <id> postulee        Met a jour le suivi
  ${C.cyan('npm run report')}                       Genere un rapport HTML consultable
  ${C.cyan('node src/cli.js stats')}                Tableau de bord des candidatures

  Options de search : --rayon 40  --seuil 30
`)
  process.exit(commande ? 1 : 0)
}

try {
  await fn(args)
} catch (err) {
  console.error(C.rouge(`\n  Erreur : ${err.message}\n`))
  process.exit(1)
}
