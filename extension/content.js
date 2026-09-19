/**
 * Remplissage de formulaires de candidature.
 *
 * Principe : l'extension ne fait rien tant que tu ne cliques pas. Elle ne
 * soumet jamais le formulaire, elle ne fait que pre-remplir les champs que
 * tu relis ensuite. C'est l'equivalent d'un gestionnaire de mots de passe.
 */

// ─── Utilitaires de texte ──────────────────────────────────────────
const sansAccent = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Reconstitue le libelle d'un champ en croisant toutes les pistes
 * disponibles. Les ATS modernes (Workday, Greenhouse, Lever) n'utilisent
 * pas tous <label for>, d'ou le ratissage large.
 */
function libelleDe(champ) {
  const pistes = []

  if (champ.id) {
    const l = document.querySelector(`label[for="${CSS.escape(champ.id)}"]`)
    if (l) pistes.push(l.textContent)
  }
  const parent = champ.closest('label')
  if (parent) pistes.push(parent.textContent)

  const ariaLabelledby = champ.getAttribute('aria-labelledby')
  if (ariaLabelledby) {
    for (const ref of ariaLabelledby.split(/\s+/)) {
      const el = document.getElementById(ref)
      if (el) pistes.push(el.textContent)
    }
  }

  pistes.push(
    champ.getAttribute('aria-label'),
    champ.placeholder,
    champ.name,
    champ.id,
    champ.getAttribute('autocomplete'),
    champ.getAttribute('data-automation-id'), // Workday
    champ.getAttribute('data-qa'), // Greenhouse / Lever
  )

  // Dernier recours : le texte du bloc parent, tronque pour eviter le bruit.
  const bloc = champ.closest('div, fieldset, li, td, section')
  if (bloc) {
    const texte = [...bloc.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE || n.tagName === 'SPAN' || n.tagName === 'P')
      .map((n) => n.textContent)
      .join(' ')
    if (texte.trim().length < 160) pistes.push(texte)
  }

  return sansAccent(pistes.filter(Boolean).join(' | ')).slice(0, 400)
}

// ─── Regles de correspondance ──────────────────────────────────────
// L'ordre compte : la premiere regle qui matche gagne. Les plus
// specifiques doivent donc passer avant les plus generales.
const REGLES = [
  { cle: 'code_postal', motifs: [/code postal/, /postal code/, /\bzip\b/, /\bcp\b/, /postcode/] },
  { cle: 'linkedin', motifs: [/linkedin/] },
  { cle: 'github', motifs: [/github/, /portfolio/, /site web/, /personal (web)?site/, /\bblog\b/] },
  { cle: 'email', motifs: [/e.?mail/, /courriel/, /\bmail\b/] },
  { cle: 'telephone', motifs: [/telephone/, /\bphone\b/, /\bmobile\b/, /portable/, /\btel\b/, /numero/] },
  { cle: 'prenom', motifs: [/prenom/, /first ?name/, /given name/, /\bvorname\b/, /\bnombre\b/] },
  {
    cle: 'nom',
    motifs: [/^nom$/, /\bnom\b(?!.*(entreprise|societe|ecole|utilisateur|fichier|complet))/, /last ?name/, /\bsurname\b/, /family name/, /nachname/],
  },
  { cle: 'nom_complet', motifs: [/nom complet/, /full name/, /votre nom et prenom/] },
  { cle: 'ville', motifs: [/\bville\b/, /\bcity\b/, /localite/, /\btown\b/] },
  { cle: 'pays', motifs: [/\bpays\b/, /\bcountry\b/] },
  { cle: 'adresse', motifs: [/adresse/, /address/, /\brue\b/, /\bstreet\b/] },
  { cle: 'nationalite', motifs: [/nationalite/, /nationality/] },
  { cle: 'salaire', motifs: [/salaire/, /pretention/, /salary/, /remuneration/, /compensation/] },
  {
    cle: 'disponibilite',
    motifs: [/disponibilite/, /date de disponibilite/, /start date/, /availability/, /quand pouvez.vous/],
  },
  { cle: 'preavis', motifs: [/preavis/, /notice period/] },
  { cle: 'annees_experience', motifs: [/annees? d.experience/, /years of experience/, /experience \(en annees\)/] },
  { cle: 'niveau_etudes', motifs: [/niveau d.etude/, /education level/, /highest degree/, /diplome le plus eleve/] },
  { cle: 'diplome', motifs: [/\bdiplome\b/, /\bdegree\b/, /qualification/] },
  { cle: 'ecole', motifs: [/\becole\b/, /universite/, /\bschool\b/, /university/, /etablissement/] },
  { cle: 'annee_diplome', motifs: [/annee d.obtention/, /graduation year/, /year of graduation/] },
  { cle: 'poste_actuel', motifs: [/poste actuel/, /current (job )?title/, /intitule du poste/, /current position/] },
  { cle: 'entreprise_actuelle', motifs: [/entreprise actuelle/, /current (employer|company)/, /employeur/] },
  { cle: 'langues', motifs: [/\blangues?\b/, /languages? spoken/] },
  { cle: 'competences', motifs: [/competences (cles|techniques)/, /key skills/, /technical skills/] },
  { cle: 'source_candidature', motifs: [/comment avez.vous (connu|entendu)/, /how did you hear/, /source/] },
  { cle: 'permis', motifs: [/permis de conduire/, /driving licen/] },
  // Volontairement en dernier : tres generique, ne doit attraper que le reste.
  { cle: 'pitch', motifs: [/presentez.vous/, /a propos de vous/, /about yourself/, /tell us about/, /bio\b/] },
]

const REGLES_LETTRE = [
  /lettre de motivation/,
  /cover letter/,
  /motivation/,
  /pourquoi (souhaitez|voulez).vous/,
  /why do you want/,
  /message au recruteur/,
  /informations complementaires/,
  /additional information/,
]

// Questions binaires : on repond a partir de faits du profil.
const REGLES_OUI_NON = [
  { motifs: [/autorise? a travailler/, /authorized to work/, /work authorization/, /droit de travailler/], reponse: 'oui' },
  { motifs: [/sponsorship/, /parrainage/, /visa/, /permis de travail requis/], reponse: 'non' },
  { motifs: [/etes.vous majeur/, /are you over 18/, /18 (ans|years)/], reponse: 'oui' },
  { motifs: [/accepte(z|r).{0,20}(teletravail|remote)/, /willing to work remotely/], reponse: 'oui' },
  { motifs: [/permis b/, /driving licen/], reponse: JF_VALEURS.permis ? 'oui' : null },
]

const MOTS_OUI = ['oui', 'yes', 'ja', 'si', 'true', 'y']
const MOTS_NON = ['non', 'no', 'nein', 'false', 'n']

// ─── Ecriture compatible React / Vue / Angular ─────────────────────
/**
 * Un `input.value = x` direct est ignore par React, qui suit sa propre
 * copie de l'etat. On passe par le setter natif du prototype puis on
 * emet les evenements que le framework ecoute.
 */
function ecrire(champ, valeur) {
  const proto =
    champ instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : champ instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(champ, valeur)
  else champ.value = valeur

  champ.dispatchEvent(new Event('input', { bubbles: true }))
  champ.dispatchEvent(new Event('change', { bubbles: true }))
  champ.dispatchEvent(new Event('blur', { bubbles: true }))
}

function marquer(champ) {
  champ.style.outline = '2px solid #1a7f5a'
  champ.style.outlineOffset = '1px'
  setTimeout(() => {
    champ.style.outline = ''
    champ.style.outlineOffset = ''
  }, 4000)
}

function estRemplissable(champ) {
  if (champ.disabled || champ.readOnly) return false
  if (champ.type === 'hidden' || champ.type === 'file' || champ.type === 'submit') return false
  if (champ.offsetParent === null && champ.type !== 'radio') return false
  return true
}

// ─── Remplissage par type de champ ─────────────────────────────────
function remplirSelect(champ, valeur) {
  const cible = sansAccent(valeur)
  const options = [...champ.options]
  const trouve =
    options.find((o) => sansAccent(o.textContent) === cible) ??
    options.find((o) => sansAccent(o.value) === cible) ??
    options.find((o) => sansAccent(o.textContent).includes(cible)) ??
    options.find((o) => cible.includes(sansAccent(o.textContent)) && o.textContent.trim().length > 2)
  if (!trouve) return false
  ecrire(champ, trouve.value)
  return true
}

function remplirOuiNon(groupe, reponse) {
  const mots = reponse === 'oui' ? MOTS_OUI : MOTS_NON
  for (const champ of groupe) {
    const texte = sansAccent(libelleDe(champ) + ' ' + champ.value)
    if (mots.some((m) => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(texte))) {
      champ.click()
      marquer(champ)
      return true
    }
  }
  return false
}

// ─── Orchestration ─────────────────────────────────────────────────
async function remplir({ ecraser = false, lettre = '' } = {}) {
  const champs = [...document.querySelectorAll('input, textarea, select')].filter(estRemplissable)
  const journal = []
  let rempli = 0

  // 1. Questions binaires (radios groupes par nom).
  const radios = champs.filter((c) => c.type === 'radio')
  const groupes = {}
  for (const r of radios) (groupes[r.name] ||= []).push(r)

  for (const groupe of Object.values(groupes)) {
    if (!ecraser && groupe.some((r) => r.checked)) continue
    const contexte = sansAccent(groupe.map(libelleDe).join(' '))
    const regle = REGLES_OUI_NON.find((r) => r.reponse && r.motifs.some((m) => m.test(contexte)))
    if (regle && remplirOuiNon(groupe, regle.reponse)) {
      rempli++
      journal.push({ champ: contexte.slice(0, 60), valeur: regle.reponse })
    }
  }

  // 2. Champs texte, textarea et select.
  for (const champ of champs) {
    if (champ.type === 'radio' || champ.type === 'checkbox') continue
    if (!ecraser && champ.value?.trim()) continue

    const libelle = libelleDe(champ)
    if (!libelle) continue

    // La lettre de motivation a sa propre logique : uniquement les zones longues.
    if (champ.tagName === 'TEXTAREA' && lettre && REGLES_LETTRE.some((m) => m.test(libelle))) {
      ecrire(champ, lettre)
      marquer(champ)
      rempli++
      journal.push({ champ: 'lettre de motivation', valeur: `${lettre.length} caracteres` })
      continue
    }

    const regle = REGLES.find((r) => r.motifs.some((m) => m.test(libelle)))
    if (!regle) continue

    const valeur = JF_VALEURS[regle.cle]
    if (!valeur) continue

    const ok = champ.tagName === 'SELECT' ? remplirSelect(champ, valeur) : (ecrire(champ, valeur), true)
    if (!ok) continue

    marquer(champ)
    rempli++
    journal.push({ champ: regle.cle, valeur: String(valeur).slice(0, 60) })
  }

  const fichiers = document.querySelectorAll('input[type="file"]').length

  return {
    rempli,
    total: champs.length,
    fichiers,
    journal,
    url: location.href,
    titrePage: document.title,
  }
}

chrome.runtime.onMessage.addListener((msg, _exp, repondre) => {
  if (msg?.action !== 'remplir') return
  remplir(msg.options ?? {}).then(repondre)
  return true // reponse asynchrone
})
