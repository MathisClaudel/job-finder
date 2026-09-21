#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { chercher as chercherFranceTravail } from './sources/france-travail.js'
import { chercher as chercherAdzuna } from './sources/adzuna.js'
import { chercher as chercherRemote } from './sources/remote-mondial.js'
import { classer } from './scoring.js'
import {
  fusionner, filtrer, trouver, majStatut, lire, STATUTS,
  enregistrerSante, dedoublonnerBase, reparerEntreprises,
  offresAVerifier, enregistrerDisponibilites, reparerIdentifiants,
} from './store.js'
import { creerRapport, formaterSynthese } from './sante.js'
import { verifierLot, tokenFranceTravail } from './disponibilite.js'
import { chargerProfil, env, zoneLocale } from './config.js'
import { genererRapport } from './report.js'
import { formater, paysDeLOffre, salairesParPays } from './salaires-pays.js'
import { commandeCv } from './cv/index.js'
import { commandeLettrePdf } from './lettre-pdf.js'
import {
  importerSuivi, synchroniser, enregistrer, supprimer, ETATS,
  liste as listeCandidatures,
} from './candidatures.js'

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

  const rapport = creerRapport()
  const lots = await Promise.allSettled([
    chercherFranceTravail({ rayonKm, rapport }),
    chercherAdzuna({ rayonKm, rapport }),
    chercherRemote({ rapport }),
  ])

  const brutes = lots.flatMap((l) => (l.status === 'fulfilled' ? l.value : []))
  lots.filter((l) => l.status === 'rejected').forEach((l) => console.log(C.rouge(`  ${l.reason.message}`)))

  const sante = rapport.synthese()
  console.log(`\n${C.gras('Etat des sources')}\n`)
  console.log(formaterSynthese(sante, C.rouge))
  const resume = `${sante.ok}/${sante.total} sources OK`
  console.log(
    '\n  ' +
      (sante.verdict === 'sain'
        ? C.vert(resume)
        : sante.verdict === 'partiel'
          ? C.jaune(`${resume} — ${sante.vides + sante.ignorees} muette(s) ou ignoree(s)`)
          : C.rouge(`${resume} — ${sante.echecs} en panne`)),
  )

  const classees = classer(brutes, { seuil })
  const { nouvelles, majs, doublons, total } = fusionner(classees)
  enregistrerSante(sante)

  console.log(
    `\n${C.gras('Resultat')} : ${brutes.length} offres collectees, ${classees.length} retenues apres filtrage`,
  )
  console.log(
    `  ${C.vert(`${nouvelles} nouvelles`)}, ${majs} deja connues, ` +
      `${C.cyan(`${doublons} doublons inter-sources fusionnes`)}, ${total} au total en base\n`,
  )

  // Une offre close se reconnait au moment ou tu cliques, c'est-a-dire trop
  // tard. La verification suit donc chaque recherche, sans rien demander.
  if (!args.includes('--sans-verification')) await commandeDisponibilite([])

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

/** Pretentions a annoncer pour cette offre, converties au marche de son pays. */
function salaireAttendu(offre) {
  const salaire = chargerProfil().recherche?.salaire
  if (!salaire?.brut_annuel_cible) return null
  const code = paysDeLOffre(offre)
  if (!code) return C.gris('pays non reconnu — choisir le pays dans l\'extension')
  const s = salairesParPays(salaire)[code]
  return `${formater(s.cible, s.devise)} brut/an (${s.nom}, plancher ${formater(s.plancher, s.devise)})`
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
  const attendu = salaireAttendu(offre)
  if (attendu) console.log(`${C.gris('Attendu')}  : ${attendu}`)
  if (offre.evenement) {
    console.log(`\n${C.jaune(offre.evenement.intitule)}`)
    console.log(C.gris(`  ${offre.evenement.detail}`))
    console.log(C.gris('  On se presente au stand : pas de formulaire a remplir.'))
  }
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

/**
 * Interroge les 9 sources sans rien ecrire en base : sert a verifier qu'elles
 * repondent avant de lancer une vraie recherche, ou a diagnostiquer une panne.
 */
async function commandeSante() {
  const rayonKm = zoneLocale().rayonKm
  console.log(C.gras('\nVerification des sources\n'))

  const rapport = creerRapport()
  await Promise.allSettled([
    chercherFranceTravail({ rayonKm, rapport, journal: { log: () => {} } }),
    chercherAdzuna({ rayonKm, rapport, journal: { log: () => {} } }),
    chercherRemote({ rapport, journal: { log: () => {} } }),
  ])

  const sante = rapport.synthese()
  console.log(formaterSynthese(sante, C.rouge))
  console.log(
    `\n  ${sante.ok}/${sante.total} sources OK · ${sante.offres} offres collectees ` +
      C.gris('(rien n a ete ecrit en base)\n'),
  )
  enregistrerSante(sante)
  if (sante.verdict === 'alerte') process.exitCode = 1
}

function commandeDedoublonner(args) {
  const appliquer = args.includes('--appliquer')
  const { fusions } = dedoublonnerBase({ simulation: !appliquer })

  if (!fusions.length) return console.log(C.vert('\n  Aucun doublon en base.\n'))

  console.log(`\n${C.gras(`${fusions.length} doublon(s)`)}\n`)
  for (const f of fusions) {
    console.log(`  ${C.cyan(f.entreprise)} — ${f.titre.slice(0, 56)}`)
    console.log(C.gris(`     garde ${f.gardee}  ·  fusionne ${f.supprimee}`))
  }
  console.log(
    appliquer
      ? C.vert(`\n  ${fusions.length} offre(s) fusionnee(s). Le suivi le plus avance a ete conserve.\n`)
      : C.jaune('\n  Simulation. Relance avec --appliquer pour fusionner.\n'),
  )
}

/**
 * Verifie que les offres sont toujours ouvertes. Appelee seule, ou en fin de
 * recherche pour les offres ou le doute est reel.
 */
async function commandeDisponibilite(args = []) {
  const toutes = args.includes('--toutes')
  const offres = offresAVerifier({ toutes })

  if (!offres.length) {
    return console.log(C.vert('\n  Rien a verifier : tout a ete controle recemment.\n'))
  }

  console.log(`\n${C.gras('Verification des offres')}\n`)
  console.log(C.gris(`  ${offres.length} offre(s) a controler\n`))

  const token = await tokenFranceTravail()
  const resultats = await verifierLot(offres, {
    token,
    surAvancement: (faits, total) => {
      if (faits % 10 === 0 || faits === total) process.stdout.write(C.gris(`  ${faits}/${total}\r`))
    },
  })

  const { verifiees, closes } = enregistrerDisponibilites(resultats)
  const parEtat = { ouverte: [], close: [], indeterminee: [] }
  for (const o of offres) parEtat[resultats.get(o.id).etat].push(o)

  if (parEtat.close.length) {
    console.log(`\n${C.rouge(C.gras('Offres closes'))}\n`)
    for (const o of parEtat.close) {
      const r = resultats.get(o.id)
      console.log(`  ${C.gras(o.titre.slice(0, 54))} ${C.cyan(o.entreprise.slice(0, 22))}`)
      console.log(C.gris(`     ${o.id} · ${o.statut} · ${r.methode} ${r.code ?? ''}`))
    }
  }

  console.log(
    `\n  ${C.vert(`${parEtat.ouverte.length} ouverte(s)`)}, ` +
      `${closes ? C.rouge(`${closes} close(s)`) : '0 close'}, ` +
      `${C.gris(`${parEtat.indeterminee.length} indeterminee(s)`)} sur ${verifiees}\n`,
  )
  // Une offre indeterminee reste utilisable : rien n'est masque sur un doute.
  if (parEtat.indeterminee.length) {
    console.log(C.gris('  Indeterminee = le site bloque les requetes automatiques ou etait\n' +
      '  indisponible. L offre reste affichee, sans marque.\n'))
  }
}

function commandeReparer(args) {
  const appliquer = args.includes('--appliquer')

  const identifiants = reparerIdentifiants({ simulation: !appliquer })
  if (identifiants.length) {
    console.log(`\n${C.gras(`${identifiants.length} identifiant(s) desynchronise(s)`)}\n`)
    for (const d of identifiants) console.log(C.gris(`  ${d.cle}  portait l id ${d.id}`))
    console.log(
      appliquer
        ? C.vert('  Remis en accord avec leur clef.')
        : C.jaune('  Simulation.'),
    )
  }

  const corrections = reparerEntreprises({ simulation: !appliquer })

  if (!corrections.length) {
    return console.log(
      identifiants.length ? '' : C.vert('\n  Aucun nom d employeur a corriger.\n'),
    )
  }

  console.log(`\n${C.gras(`${corrections.length} nom(s) d employeur`)}\n`)
  for (const c of corrections) {
    console.log(`  ${C.jaune(c.avant.padEnd(28))} → ${C.vert(c.apres)}`)
    console.log(C.gris(`     ${c.id} · ${c.titre.slice(0, 54)}`))
  }
  console.log(
    appliquer
      ? C.vert(`\n  ${corrections.length} nom(s) corrige(s). Relance ${C.cyan('npm run dedoublonner')} : des doublons peuvent apparaitre.\n`)
      : C.jaune('\n  Simulation. Relance avec --appliquer pour corriger.\n'),
  )
}

/**
 * `jf candidatures` — le registre de ce que tu as deja envoye.
 *
 *   jf candidatures                          liste
 *   jf candidatures import "<chemin.md>"     reprend un suivi tenu a la main
 *   jf candidatures sync                     reporte les offres deja postulees
 *   jf candidatures add "Entreprise" "Poste" [etat] [JJ/MM/AAAA]
 *   jf candidatures rm <id>
 */
async function commandeCandidatures(args) {
  const [action, ...reste] = args

  if (action === 'import') {
    const chemin = reste.find((a) => !a.startsWith('--'))
    if (!chemin) throw new Error('Chemin du document de suivi attendu')
    const simulation = !reste.includes('--appliquer')
    const r = importerSuivi(readFileSync(chemin, 'utf8'), { simulation })

    console.log(`\n${C.gras('Import du suivi')}  ${C.gris(chemin)}\n`)
    for (const c of r.envoyees) {
      console.log(`  ${C.vert('✓')} ${c.entreprise.padEnd(20)} ${C.gris((c.poste ?? '—').slice(0, 42).padEnd(44))} ${ETATS[c.etat]} ${C.gris(c.date ?? '')}`)
    }
    for (const c of r.cibles) console.log(`  ${C.jaune('○')} ${c.entreprise.padEnd(20)} ${C.gris('cible, pas encore postule')}`)
    if (r.ignorees.length) console.log(C.gris(`\n  ${r.ignorees.length} ligne(s) ignoree(s) : ni entreprise ni etat exploitables.`))
    console.log(
      simulation
        ? C.jaune('\n  Simulation. Relance avec --appliquer pour enregistrer.\n')
        : C.vert(`\n  ${r.envoyees.length} candidature(s) et ${r.cibles.length} cible(s) enregistrees.\n`),
    )
    return
  }

  if (action === 'sync') {
    const ajoutees = synchroniser(Object.values(lire().offres))
    console.log(
      ajoutees.length
        ? C.vert(`\n  ${ajoutees.length} candidature(s) reprise(s) depuis la base d offres.\n`)
        : C.gris('\n  Rien a reprendre : le registre est deja a jour.\n'),
    )
    return
  }

  if (action === 'add') {
    const [entreprise, poste, etat, date] = reste
    if (!entreprise) throw new Error('Usage : jf candidatures add "Entreprise" "Poste" [etat] [JJ/MM/AAAA]')
    const jma = date && /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? date.split('/').reverse().join('-') : undefined
    const c = enregistrer({ entreprise, poste, etat: etat || 'envoyee', date: jma, origine: 'cli' })
    console.log(C.vert(`\n  Enregistre : ${c.entreprise} — ${c.poste ?? '—'} (${ETATS[c.etat]})\n`))
    return
  }

  if (action === 'rm') {
    if (!reste[0]) throw new Error('Identifiant attendu')
    supprimer(reste[0])
    console.log(C.vert(`\n  Supprime : ${reste[0]}\n`))
    return
  }

  const toutes = listeCandidatures()
  if (!toutes.length) {
    return console.log(C.gris('\n  Registre vide. `jf candidatures import "<fichier.md>"` pour reprendre un suivi existant.\n'))
  }

  const couleur = { refus: C.rouge, acceptee: C.vert, entretien: C.vert, prevu: C.gris }
  console.log(`\n${C.gras(`${toutes.length} candidature(s)`)}\n`)
  for (const c of toutes) {
    const teinte = couleur[c.etat] ?? C.jaune
    console.log(
      `  ${teinte(ETATS[c.etat].padEnd(10))} ${C.gras(c.entreprise.padEnd(20))} ${(c.poste ?? '—').slice(0, 44).padEnd(46)} ${C.gris(c.date ?? '')}`,
    )
  }

  // Ce que le registre sert a empecher : deux fois le meme employeur.
  const parBoite = new Map()
  for (const c of toutes.filter((x) => x.etat !== 'prevu')) {
    const k = c.entreprise.toLowerCase()
    parBoite.set(k, (parBoite.get(k) ?? 0) + 1)
  }
  const repetes = [...parBoite].filter(([, n]) => n > 1)
  if (repetes.length) {
    console.log(C.gris(`\n  Employeurs sollicites plusieurs fois : ${repetes.map(([e, n]) => `${e} (${n})`).join(', ')}`))
  }
  console.log('')
}

const commandes = {
  search: commandeSearch,
  list: commandeList,
  show: commandeShow,
  status: commandeStatus,
  stats: commandeStats,
  sante: commandeSante,
  dedoublonner: commandeDedoublonner,
  reparer: commandeReparer,
  disponibilite: commandeDisponibilite,
  report: genererRapport,
  cv: commandeCv,
  'lettre-pdf': commandeLettrePdf,
  candidatures: commandeCandidatures,
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
  ${C.cyan('npm run sante')}                        Verifie les 9 sources sans rien ecrire
  ${C.cyan('npm run dedoublonner')}                 Cherche les doublons en base (--appliquer pour fusionner)
  ${C.cyan('npm run disponibilite')}                Verifie que les offres sont encore ouvertes (--toutes)
  ${C.cyan('npm run reparer')}                      Corrige les noms d employeur et les id (--appliquer)

  ${C.cyan('npm run cv')} -- <id>                     CV cible sur une offre (--axe ia  --langue en  --photo  --diff)
  ${C.cyan('node src/cli.js lettre-pdf')} <fichier.md>   Met en page une lettre de lettres/ en PDF

  ${C.cyan('npm run candidatures')}                 Registre de ce que tu as deja envoye
  ${C.cyan('npm run candidatures')} -- import <md>   Reprend un suivi tenu a la main (--appliquer)
  ${C.cyan('npm run candidatures')} -- sync        Reporte les offres deja postulees

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
