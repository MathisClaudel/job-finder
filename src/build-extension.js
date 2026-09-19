#!/usr/bin/env node
/**
 * Transforme profil.yaml + reponses-ats.yaml en un fichier JS charge par
 * l'extension. Relancer apres chaque modification du profil.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, chargerProfil, chargerReponsesAts } from './config.js'

const profil = chargerProfil()
const ats = chargerReponsesAts()

const vide = (v) => v === undefined || v === null || v === '' || v === 'TODO'
const ou = (...vals) => vals.find((v) => !vide(v)) ?? ''

const id = profil.identite ?? {}
const rech = profil.recherche ?? {}
const courts = ats.champs_courts ?? {}

// L'adresse du profil est en texte libre : on en extrait code postal et ville.
const adresse = id.adresse_actuelle ?? ''
const cp = (adresse.match(/\b(\d{5})\b/) ?? [])[1] ?? ''
const ville = (adresse.match(/\b\d{5}\s+([^,]+)/) ?? [])[1]?.trim() ?? ''
const rue = adresse.split(',')[0]?.trim() ?? ''

const derniere = (profil.experiences ?? [])[0] ?? {}
const diplome = (profil.formation ?? [])[0] ?? {}

const valeurs = {
  prenom: id.prenom,
  nom: id.nom,
  nom_complet: `${ou(id.prenom)} ${ou(id.nom)}`.trim(),
  email: ou(id.email_pro, id.email_perso),
  telephone: ou(id.telephone),
  linkedin: ou(id.linkedin),
  github: ou(id.github, id.portfolio),
  adresse: rue,
  ville,
  code_postal: cp,
  pays: 'France',
  nationalite: ou(id.nationalite),
  permis: id.permis_b === true ? 'Permis B' : '',

  poste_actuel: ou(courts.titre_poste_actuel),
  entreprise_actuelle: ou(derniere.entreprise),
  annees_experience: ou(courts.annees_experience),
  niveau_etudes: ou(courts.niveau_etudes),
  diplome: ou(diplome.diplome),
  ecole: ou(diplome.etablissement),
  annee_diplome: String(ou(diplome.annee_obtention)),

  disponibilite: ou(rech.disponibilite, courts.disponibilite),
  preavis: ou(courts.preavis),
  salaire: vide(rech.salaire?.brut_annuel_cible) ? '' : String(rech.salaire.brut_annuel_cible),
  type_contrat: (rech.type_contrat ?? ['CDI']).join(', '),
  autorisation_travail: 'Oui',
  besoin_visa: 'Non',
  source_candidature: ou(courts.source_candidature),

  pitch: ou(ats.pitchs?.trois_lignes)?.trim(),
  pitch_court: ou(ats.pitchs?.une_ligne)?.trim(),

  langues: (profil.langues ?? []).map((l) => `${l.langue} (${l.niveau})`).join(', '),
  // Seules les competences maitrisees : une auto-evaluation a 2/5 n'a rien a faire
  // dans un champ "competences cles" de formulaire.
  competences: [
    ...(profil.competences?.langages ?? []),
    ...(profil.competences?.frameworks_outils ?? []),
  ]
    .filter((c) => c.niveau === 'confirme' || c.niveau === 'avance')
    .map((c) => c.nom)
    .join(', '),
}

// Champs legitimement vides : les signaler comme manquants serait un faux positif.
const VIDES_ATTENDUS = new Set(
  [
    profil.identite?.permis_b === false && 'permis',
    !profil.identite?.github && 'github',
  ].filter(Boolean),
)

const sortie = `// Genere automatiquement par 'npm run build:extension' — ne pas editer a la main.
// Source : profil/profil.yaml et profil/reponses-ats.yaml
// Genere le ${new Date().toISOString()}
var JF_VALEURS = ${JSON.stringify(valeurs, null, 2)};
var JF_ALIAS = ${JSON.stringify(ats.alias_champs ?? {}, null, 2)};
`

const chemin = join(ROOT, 'extension', 'profil-genere.js')
writeFileSync(chemin, sortie, 'utf8')

const manquants = Object.entries(valeurs)
  .filter(([k, v]) => vide(v) && !VIDES_ATTENDUS.has(k))
  .map(([k]) => k)

console.log(`\n  Extension mise a jour : ${chemin}`)
console.log(`  ${Object.keys(valeurs).length - manquants.length} champs renseignes`)
if (manquants.length) {
  console.log(`\n  \x1b[33mChamps vides (a completer dans profil/profil.yaml) :\x1b[0m`)
  console.log(`  ${manquants.join(', ')}\n`)
} else {
  console.log()
}
