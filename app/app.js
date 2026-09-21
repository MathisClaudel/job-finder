/* Poste de pilotage Job Finder — interface locale.
   Aucune donnee n'est stockee ici : chaque action repart vers le serveur,
   qui ecrit dans data/offres.json. Le navigateur n'est qu'un affichage. */

const JOURS_AVANT_RELANCE = 10

const ETAPES = [
  { cle: 'lettre', libelle: 'Lettre de motivation ecrite' },
  { cle: 'cv', libelle: 'CV a jour et pret a joindre' },
  { cle: 'formulaire', libelle: 'Formulaire rempli et relu' },
  { cle: 'envoye', libelle: 'Candidature envoyee' },
]

const LIBELLE_STATUT = {
  nouveau: 'Nouveau',
  'a-postuler': 'A postuler',
  postulee: 'Postulee',
  relancee: 'Relancee',
  entretien: 'Entretien',
  refus: 'Refus',
  ecartee: 'Ecartee',
  acceptee: 'Acceptee',
}

const etat = {
  offres: [], statuts: [], ville: '', vue: 'afaire', ouverte: null, triIndex: 0, sante: null,
  // Diagnostic de la derniere generation de CV, par offre. Vit le temps de la
  // session : il depend de l'annonce, pas d'un etat a persister.
  cvGeneres: {},
  candidatures: [], etatsCandidature: {},
}
const tableau = { recherche: '', statut: '', verdict: '', colonne: 'note', sens: -1 }
const registre = { recherche: '', etat: '', entreprise: '', poste: '', verif: null }

const $ = (s) => document.querySelector(s)
const el = (tag, props = {}, enfants = []) => {
  const n = Object.assign(document.createElement(tag), props)
  for (const e of [].concat(enfants)) n.append(e)
  return n
}
const jours = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null)
const dateCourte = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'
const texteBrut = (html) => {
  const d = document.createElement('div')
  d.innerHTML = html ?? ''
  return d.textContent.replace(/\s+/g, ' ').trim()
}

/* ── Etat metier derive ──────────────────────────────── */

const lieuDe = (o) => (o.evaluation?.lieu?.categorie === 'local' ? etat.ville : 'Remote')
const aTrier = () => etat.offres.filter((o) => o.statut === 'nouveau' && !o.candidature?.reporte)

/** Une candidature partie depuis plus de 10 jours sans reponse appelle une relance. */
function relanceDue(o) {
  if (!['postulee', 'relancee'].includes(o.statut)) return false
  if (o.relanceLe) return new Date(o.relanceLe) <= new Date()
  return (jours(o.statutLe ?? o.decouvertLe) ?? 0) >= JOURS_AVANT_RELANCE
}

/** Seul un signal explicite vaut fermeture : le doute ne marque jamais. */
const estClose = (o) => o.disponibilite?.etat === 'close'

/** Closes alors que tu comptais encore dessus : c'est ce qui coûte du temps. */
const closesSuivies = () =>
  etat.offres.filter(
    (o) => estClose(o) && !['ecartee', 'refus'].includes(o.statut),
  )

const incompletes = () =>
  etat.offres.filter((o) => o.statut === 'a-postuler' && ETAPES.some((e) => !o.candidature?.[e.cle]))

/* ── Reseau ──────────────────────────────────────────── */

async function charger() {
  const r = await fetch('/api/etat')
  const d = await r.json()
  Object.assign(etat, {
    offres: d.offres, statuts: d.statuts, ville: d.ville, sante: d.meta?.sante ?? null,
    candidatures: d.candidatures ?? [], etatsCandidature: d.etatsCandidature ?? {},
  })
  rendre()
}

async function patcher(id, champs) {
  const avant = etat.offres.find((o) => o.id === id)
  if (avant && champs.statut !== undefined && !confirmeDoublon(avant, champs)) return rendre()
  const r = await fetch(`/api/offre/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(champs),
  })
  const d = await r.json()
  if (!r.ok) return toast(d.erreur ?? 'Echec de la mise a jour')
  const i = etat.offres.findIndex((o) => o.id === id)
  // Le serveur renvoie l'offre brute : on conserve la description assainie deja chargee.
  if (i >= 0) etat.offres[i] = { ...etat.offres[i], ...d.offre, description: etat.offres[i].description }
  // Un statut « postulee » ajoute une ligne au registre : les antecedents de
  // toutes les offres du meme employeur changent, on recharge l'etat entier.
  if (champs.statut !== undefined) return charger()
  rendre()
}

function toast(message) {
  const t = $('#toast')
  t.textContent = message
  t.classList.remove('cachee')
  clearTimeout(toast.minuteur)
  toast.minuteur = setTimeout(() => t.classList.add('cachee'), 2600)
}

/* ── Commandes du CLI ────────────────────────────────── */

const TITRES_CMD = {
  search: 'Recherche des 9 sources',
  disponibilite: 'Verification des liens',
  sante: 'Verification des sources',
  report: 'Generation du rapport',
  extension: 'Build de l extension',
}

function executer(nom, bouton) {
  const log = $('#console-log')
  $('#console-titre').textContent = TITRES_CMD[nom] ?? nom
  log.textContent = ''
  $('#console').classList.remove('cachee')
  document.querySelectorAll('.actions .btn').forEach((b) => (b.disabled = true))

  const flux = new EventSource(`/api/executer/${nom}`)
  // EventSource envoie un GET : le serveur accepte les deux methodes sur cette route.
  flux.addEventListener('log', (e) => {
    log.textContent += JSON.parse(e.data)
    log.scrollTop = log.scrollHeight
  })
  flux.addEventListener('fin', (e) => {
    const { code, erreur } = JSON.parse(e.data)
    flux.close()
    document.querySelectorAll('.actions .btn').forEach((b) => (b.disabled = false))
    toast(erreur ? `Echec : ${erreur}` : code === 0 ? 'Termine' : `Termine avec le code ${code}`)
    charger()
  })
  flux.onerror = () => {
    flux.close()
    document.querySelectorAll('.actions .btn').forEach((b) => (b.disabled = false))
  }
  void bouton
}

/* ── Antecedents : deja postule chez eux ? ───────────── */

const dateLongue = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const libelleCandidature = (c) =>
  `${c.poste ?? 'poste non precise'} — ${etat.etatsCandidature[c.etat] ?? c.etat}, ${dateLongue(c.envoyeeLe ?? c.date)}`

/** Etiquette courte pour les cartes : le signal doit se voir sans ouvrir l'offre. */
function tagAntecedent(o) {
  const a = o.antecedents
  if (!a) return null
  if (a.memePoste?.length) return el('span', { className: 'tag mauvais', textContent: 'Deja postule', title: a.memePoste.map(libelleCandidature).join('\n') })
  if (a.memeEntreprise?.length) {
    return el('span', {
      className: 'tag alerte',
      textContent: `Deja candidat chez eux · ${a.memeEntreprise.length}`,
      title: a.memeEntreprise.map(libelleCandidature).join('\n'),
    })
  }
  if (a.cible) return el('span', { className: 'tag cible', textContent: 'Entreprise ciblee' })
  return null
}

/**
 * Bandeau detaille : quelle candidature, quand, et ce qu'elle est devenue.
 * Meme poste = rouge, il ne faut pas repostuler. Meme employeur, autre poste =
 * orange : c'est permis, mais un refus recent chez eux change la lettre.
 */
function bandeauAntecedents(o, a = o.antecedents) {
  if (!a) return null
  const autres = (a.memeEntreprise ?? []).filter((c) => !a.memePoste?.includes(c) && !a.memePoste?.some((m) => m.id === c.id))
  if (!a.memePoste?.length && !autres.length && !a.cible) return null

  const enfants = []
  if (a.memePoste?.length) {
    enfants.push(el('strong', { textContent: 'Tu as deja postule a ce poste chez eux' }))
    for (const c of a.memePoste) enfants.push(el('p', { className: 'meta', textContent: libelleCandidature(c) }))
  }
  if (autres.length) {
    enfants.push(el('strong', { textContent: a.memePoste?.length ? 'Autres candidatures chez eux' : 'Deja candidat chez cet employeur, sur un autre poste' }))
    for (const c of autres) enfants.push(el('p', { className: 'meta', textContent: libelleCandidature(c) }))
  }
  if (!a.memePoste?.length && !autres.length && a.cible) {
    enfants.push(el('strong', { textContent: 'Entreprise que tu avais ciblee' }))
    if (a.cible.notes) enfants.push(el('p', { className: 'meta', textContent: a.cible.notes }))
  }
  const ton = a.memePoste?.length ? 'rouge' : autres.length ? 'orange' : 'bleu'
  return el('div', { className: `antecedents ${ton}` }, enfants)
}

/**
 * Dernier filet avant l'accident : garder ou marquer postulee une offre dont
 * le poste figure deja au registre demande une confirmation explicite.
 */
function confirmeDoublon(o, champs) {
  if (!['a-postuler', 'postulee'].includes(champs.statut)) return true
  if (['a-postuler', 'postulee'].includes(o.statut)) return true
  const deja = o.antecedents?.memePoste ?? []
  if (!deja.length) return true
  return window.confirm(
    `Tu as deja postule chez ${o.entreprise} :\n\n${deja.map((c) => `• ${libelleCandidature(c)}`).join('\n')}\n\nContinuer quand meme ?`,
  )
}

/* ── Fragments reutilisables ─────────────────────────── */

function carte(o, { compacte = false } = {}) {
  const note = el('span', {
    className: `note ${o.evaluation?.verdict ?? ''}`,
    textContent: String(o.evaluation?.note ?? 0),
  })
  const tete = el('div', { className: 'carte-tete' }, [
    el('span', { className: 'titre', textContent: o.titre }),
    note,
  ])
  const meta = el('div', {
    className: 'meta',
    textContent: `${o.entreprise} · ${lieuDe(o)} · ${o.source}`,
  })
  const enfants = [tete, meta]

  if (estClose(o)) {
    tete.prepend(el('span', { className: 'tag mauvais', textContent: 'Close' }))
  }
  const deja = tagAntecedent(o)
  if (deja) enfants.push(el('div', { className: 'etiquettes' }, [deja]))

  if (o.evenement) {
    enfants.push(
      el('div', { className: 'etiquettes' }, [
        el('span', { className: 'tag alerte', textContent: o.evenement.intitule }),
      ]),
    )
  }

  if (!compacte) {
    const tags = el('div', { className: 'etiquettes' })
    for (const a of (o.evaluation?.atouts ?? []).slice(0, 5)) {
      tags.append(el('span', { className: 'tag bon', textContent: a }))
    }
    for (const r of (o.evaluation?.reserves ?? []).slice(0, 3)) {
      tags.append(el('span', { className: 'tag mauvais', textContent: r }))
    }
    if (tags.childElementCount) enfants.push(tags)
  }

  const c = el('button', { className: 'carte', type: 'button' }, enfants)
  c.addEventListener('click', () => ouvrir(o.id))
  return c
}

const vide = (texte) => el('p', { className: 'vide', textContent: texte })

function bloc(titre, compte, contenu) {
  const h = el('h2', {}, [
    document.createTextNode(titre + ' '),
    el('span', { className: 'compte', textContent: `(${compte})` }),
  ])
  return el('div', { className: 'bloc' }, [h, contenu])
}

/* ── Etat de sante des sources ───────────────────────── */

const ETATS_SOURCE = {
  ok: { libelle: 'OK', classe: 'bon' },
  vide: { libelle: 'Aucune offre', classe: 'alerte' },
  ignoree: { libelle: 'Ignorée', classe: 'alerte' },
  echec: { libelle: 'En panne', classe: 'mauvais' },
}

const ilYA = (iso) => {
  const min = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.floor(h / 24)} j`
}

/**
 * Bandeau de sante. Une source muette est signalee au meme titre qu'une source
 * en panne : Adzuna a renvoye zero offre pendant des semaines sans alerter.
 */
function banniereSante() {
  const s = etat.sante
  if (!s) {
    return el('div', { className: 'sante inconnue' }, [
      el('span', { textContent: 'Sources jamais vérifiées' }),
      el('span', { className: 'meta', textContent: 'Lance une recherche ou « Vérifier les sources »' }),
    ])
  }

  const resume = el('div', { className: 'sante-tete' }, [
    el('strong', { textContent: `${s.ok}/${s.total} sources OK` }),
    el('span', {
      className: 'meta',
      textContent: `${s.offres} offres collectées · ${ilYA(s.date)}`,
    }),
  ])

  const detail = el('div', { className: 'etiquettes' })
  for (const src of s.sources) {
    const e = ETATS_SOURCE[src.etat] ?? ETATS_SOURCE.vide
    const t = el('span', {
      className: `tag ${src.etat === 'ok' ? 'bon' : e.classe}`,
      textContent:
        src.etat === 'ok' ? `${src.nom} · ${src.offres}` : `${src.nom} · ${e.libelle}`,
      title: src.message ?? '',
    })
    detail.append(t)
  }

  const enfants = [resume, detail]
  // Le message d'erreur exact evite d'avoir a relire les logs pour diagnostiquer.
  for (const src of s.sources.filter((x) => x.etat === 'echec')) {
    enfants.push(
      el('p', { className: 'sante-erreur', textContent: `${src.nom} : ${src.message}` }),
    )
  }

  return el('div', { className: `sante ${s.verdict}` }, enfants)
}

/* ── Vue : A faire ───────────────────────────────────── */

function rendreAFaire() {
  const v = $('#vue-afaire')
  v.textContent = ''
  v.append(banniereSante())

  const closes = closesSuivies()
  const relances = etat.offres.filter(relanceDue)
  const inc = incompletes().filter((o) => !estClose(o))
  const neufs = aTrier()

  if (closes.length) {
    const liste = el('div')
    for (const o of closes) {
      const c = carte(o, { compacte: true })
      const d = o.disponibilite
      c.append(
        el('div', { className: 'etiquettes' }, [
          el('span', {
            className: 'tag mauvais',
            textContent: `Annonce retirée · vérifié ${dateCourte(d.verifieeLe)}`,
          }),
        ]),
      )
      const ecarter = el('button', {
        className: 'btn fantome petit',
        type: 'button',
        textContent: 'Écarter',
      })
      ecarter.addEventListener('click', (e) => {
        e.stopPropagation()
        patcher(o.id, { statut: 'ecartee', note: 'Annonce retirée par la source' })
      })
      liste.append(c, el('div', { className: 'rangee', style: 'margin:6px 0 12px' }, [ecarter]))
    }
    v.append(bloc('Offres closes', closes.length, liste))
  }

  if (!closes.length && !relances.length && !inc.length && !neufs.length) {
    v.append(vide('Rien en attente. Lance une recherche pour alimenter la pile.'))
    return
  }

  if (relances.length) {
    const liste = el('div')
    for (const o of relances) {
      const c = carte(o, { compacte: true })
      const j = jours(o.statutLe ?? o.decouvertLe)
      c.append(el('div', { className: 'etiquettes' }, [
        el('span', { className: 'tag alerte', textContent: `${LIBELLE_STATUT[o.statut]} depuis ${j} jours` }),
      ]))
      liste.append(c)
    }
    v.append(bloc('Relances a faire', relances.length, liste))
  }

  if (inc.length) {
    const liste = el('div')
    for (const o of inc) {
      const c = carte(o, { compacte: true })
      const restant = ETAPES.filter((e) => !o.candidature?.[e.cle])
      c.append(el('div', { className: 'etiquettes' },
        restant.map((e) => el('span', { className: 'tag', textContent: e.libelle }))))
      liste.append(c)
    }
    v.append(bloc('Candidatures a terminer', inc.length, liste))
  }

  if (neufs.length) {
    const liste = el('div')
    for (const o of neufs.slice(0, 5)) liste.append(carte(o, { compacte: true }))
    const lien = el('button', { className: 'btn', type: 'button', textContent: `Trier les ${neufs.length} offres` })
    lien.addEventListener('click', () => allerA('tri'))
    liste.append(el('div', { className: 'rangee', style: 'margin-top:12px' }, [lien]))
    v.append(bloc('Offres non triees', neufs.length, liste))
  }
}

/* ── Vue : tri en pile ───────────────────────────────── */

function rendreTri() {
  const v = $('#vue-tri')
  v.textContent = ''
  const pile = aTrier()

  if (!pile.length) {
    v.append(vide('Pile vide. Tout est trie.'))
    return
  }
  if (etat.triIndex >= pile.length) etat.triIndex = 0
  const o = pile[etat.triIndex]

  const extrait = el('div', { className: 'pile-extrait' })
  extrait.innerHTML = o.description ?? ''

  const tags = el('div', { className: 'etiquettes' })
  for (const a of o.evaluation?.atouts ?? []) tags.append(el('span', { className: 'tag bon', textContent: a }))
  for (const r of o.evaluation?.reserves ?? []) tags.append(el('span', { className: 'tag mauvais', textContent: r }))

  const bGarder = el('button', { className: 'btn oui', type: 'button', textContent: 'Garder (1)' })
  const bPlusTard = el('button', { className: 'btn fantome', type: 'button', textContent: 'Plus tard (2)' })
  const bEcarter = el('button', { className: 'btn non', type: 'button', textContent: 'Ecarter (3)' })
  const bDetail = el('button', { className: 'btn fantome', type: 'button', textContent: 'Voir en detail' })

  bGarder.addEventListener('click', () => trier(o.id, 'garder'))
  bPlusTard.addEventListener('click', () => trier(o.id, 'plus-tard'))
  bEcarter.addEventListener('click', () => trier(o.id, 'ecarter'))
  bDetail.addEventListener('click', () => ouvrir(o.id))

  v.append(
    el('div', { className: 'pile' }, [
      el('div', { className: 'pile-progres', textContent: `${etat.triIndex + 1} sur ${pile.length} a trier` }),
      el('div', { className: 'pile-carte' }, [
        el('h3', { textContent: o.titre }),
        el('div', { className: 'meta', textContent: `${o.entreprise} · ${lieuDe(o)} · ${o.source} · score ${o.evaluation?.note ?? 0}/100` }),
        bandeauAntecedents(o) ?? '',
        tags,
        extrait,
        el('div', { className: 'pile-boutons' }, [bGarder, bPlusTard, bEcarter, bDetail]),
      ]),
      el('p', { className: 'raccourcis', innerHTML: 'Clavier : <kbd>1</kbd> garder · <kbd>2</kbd> plus tard · <kbd>3</kbd> ecarter' }),
    ]),
  )
}

function trier(id, action) {
  if (action === 'garder') return patcher(id, { statut: 'a-postuler' })
  if (action === 'ecarter') return patcher(id, { statut: 'ecartee' })
  // « Plus tard » ne change pas le statut : l'offre sort de la pile sans etre jugee.
  return patcher(id, { candidature: { reporte: true } })
}

/* ── Vue : kanban ────────────────────────────────────── */

function rendreKanban() {
  const v = $('#vue-kanban')
  v.textContent = ''
  const colonnes = el('div', { className: 'colonnes' })

  for (const statut of etat.statuts) {
    const lot = etat.offres.filter((o) => o.statut === statut)
    const col = el('div', { className: 'colonne' }, [
      el('div', { className: 'colonne-tete', textContent: `${LIBELLE_STATUT[statut]} · ${lot.length}` }),
    ])
    col.dataset.statut = statut

    for (const o of lot) {
      const c = carte(o, { compacte: true })
      c.draggable = true
      c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', o.id))
      if (relanceDue(o)) {
        c.append(el('div', { className: 'etiquettes' }, [el('span', { className: 'tag alerte', textContent: 'A relancer' })]))
      }
      col.append(c)
    }

    col.addEventListener('dragover', (e) => {
      e.preventDefault()
      col.classList.add('survol')
    })
    col.addEventListener('dragleave', () => col.classList.remove('survol'))
    col.addEventListener('drop', (e) => {
      e.preventDefault()
      col.classList.remove('survol')
      const id = e.dataTransfer.getData('text/plain')
      const offre = etat.offres.find((o) => o.id === id)
      if (offre && offre.statut !== statut) patcher(id, { statut })
    })

    colonnes.append(col)
  }
  v.append(colonnes)
}

/* ── Vue : tableau ───────────────────────────────────── */

const COLONNES = [
  { cle: 'note', libelle: 'Score', valeur: (o) => o.evaluation?.note ?? 0, num: true },
  { cle: 'titre', libelle: 'Poste', valeur: (o) => o.titre },
  { cle: 'entreprise', libelle: 'Entreprise', valeur: (o) => o.entreprise },
  { cle: 'lieu', libelle: 'Lieu', valeur: (o) => lieuDe(o) },
  { cle: 'source', libelle: 'Source', valeur: (o) => o.source },
  { cle: 'statut', libelle: 'Statut', valeur: (o) => LIBELLE_STATUT[o.statut] ?? o.statut },
  { cle: 'decouvertLe', libelle: 'Vue le', valeur: (o) => o.decouvertLe, affichage: (o) => dateCourte(o.decouvertLe) },
]

function rendreTableau() {
  const v = $('#vue-tableau')
  v.textContent = ''

  const recherche = el('input', { id: 'recherche', type: 'search', placeholder: 'Poste, entreprise, techno...', value: tableau.recherche })
  recherche.addEventListener('input', () => {
    tableau.recherche = recherche.value
    const curseur = recherche.selectionStart
    rendreTableau()
    // La vue est reconstruite a chaque frappe : on rend la main au champ, curseur inclus.
    const champ = $('#recherche')
    champ.focus()
    champ.setSelectionRange(curseur, curseur)
  })

  const selStatut = el('select', {}, [el('option', { value: '', textContent: 'Tous les statuts' })])
  for (const s of etat.statuts) {
    selStatut.append(el('option', { value: s, textContent: LIBELLE_STATUT[s], selected: tableau.statut === s }))
  }
  selStatut.addEventListener('change', () => {
    tableau.statut = selStatut.value
    rendreTableau()
  })

  const selVerdict = el('select', {}, [el('option', { value: '', textContent: 'Tous les verdicts' })])
  for (const [val, lib] of [['prioritaire', 'Prioritaire'], ['a-etudier', 'A etudier'], ['faible', 'Faible']]) {
    selVerdict.append(el('option', { value: val, textContent: lib, selected: tableau.verdict === val }))
  }
  selVerdict.addEventListener('change', () => {
    tableau.verdict = selVerdict.value
    rendreTableau()
  })

  v.append(el('div', { className: 'filtres' }, [recherche, selStatut, selVerdict]))

  const q = tableau.recherche.toLowerCase()
  const lignes = etat.offres
    .filter((o) => !tableau.statut || o.statut === tableau.statut)
    .filter((o) => !tableau.verdict || o.evaluation?.verdict === tableau.verdict)
    .filter((o) => !q || `${o.titre} ${o.entreprise} ${texteBrut(o.description)}`.toLowerCase().includes(q))

  const col = COLONNES.find((c) => c.cle === tableau.colonne)
  lignes.sort((a, b) => {
    const [x, y] = [col.valeur(a), col.valeur(b)]
    return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * tableau.sens
  })

  const thead = el('tr')
  for (const c of COLONNES) {
    const th = el('th', { textContent: c.libelle + (tableau.colonne === c.cle ? (tableau.sens > 0 ? ' ↑' : ' ↓') : '') })
    th.addEventListener('click', () => {
      tableau.sens = tableau.colonne === c.cle ? -tableau.sens : c.num ? -1 : 1
      tableau.colonne = c.cle
      rendreTableau()
    })
    thead.append(th)
  }

  const tbody = el('tbody')
  for (const o of lignes) {
    const tr = el('tr')
    for (const c of COLONNES) {
      tr.append(el('td', { className: c.num ? 'num' : '', textContent: String(c.affichage ? c.affichage(o) : c.valeur(o)) }))
    }
    tr.addEventListener('click', () => ouvrir(o.id))
    tbody.append(tr)
  }

  v.append(el('table', {}, [el('thead', {}, [thead]), tbody]))
  v.append(el('p', { className: 'meta', textContent: `${lignes.length} offre(s) sur ${etat.offres.length}` }))
}

/* ── Vue : registre des candidatures ─────────────────── */

const EN_COURS = ['envoyee', 'relancee', 'entretien']

async function appelRegistre(chemin, methode, corps) {
  const r = await fetch(chemin, {
    method: methode,
    headers: { 'content-type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const d = await r.json()
  if (!r.ok || d.erreur) throw new Error(d.erreur ?? 'Echec')
  return d
}

/**
 * Formulaire d'ajout pour les candidatures parties hors du job-finder.
 * Il verifie a la frappe, avec les memes regles que les offres : c'est le
 * moment utile, avant de cliquer « Postuler » sur LinkedIn, pas apres.
 */
function formulaireAjout() {
  const entreprise = el('input', { type: 'text', placeholder: 'Entreprise', value: registre.entreprise })
  const poste = el('input', { type: 'text', placeholder: 'Poste', value: registre.poste })
  const selEtat = el('select')
  for (const [cle, lib] of Object.entries(etat.etatsCandidature)) {
    selEtat.append(el('option', { value: cle, textContent: lib, selected: cle === 'envoyee' }))
  }
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) })
  const bAjouter = el('button', { className: 'btn', type: 'button', textContent: 'Ajouter' })
  const verdict = el('div', { className: 'verif' })

  let minuteur = null
  const verifier = () => {
    registre.entreprise = entreprise.value
    registre.poste = poste.value
    clearTimeout(minuteur)
    if (entreprise.value.trim().length < 2) {
      verdict.textContent = ''
      return
    }
    minuteur = setTimeout(async () => {
      const q = new URLSearchParams({ entreprise: entreprise.value, poste: poste.value })
      const a = await (await fetch(`/api/candidatures/verifier?${q}`)).json()
      verdict.textContent = ''
      verdict.append(
        bandeauAntecedents(null, a) ??
          el('p', { className: 'meta ok', textContent: `Aucune candidature chez ${entreprise.value.trim()} — la voie est libre.` }),
      )
    }, 250)
  }
  entreprise.addEventListener('input', verifier)
  poste.addEventListener('input', verifier)

  bAjouter.addEventListener('click', async () => {
    if (!entreprise.value.trim()) return toast('Entreprise obligatoire')
    try {
      await appelRegistre('/api/candidatures', 'POST', {
        entreprise: entreprise.value.trim(),
        poste: poste.value.trim() || null,
        etat: selEtat.value,
        date: date.value || null,
      })
      Object.assign(registre, { entreprise: '', poste: '' })
      toast('Candidature enregistree')
      charger()
    } catch (e) {
      toast(e.message)
    }
  })

  // La vue se redessine a chaque rechargement : on rejoue la verification en cours.
  if (registre.entreprise) setTimeout(verifier)
  return el('div', { className: 'bloc ajout' }, [
    el('h2', { textContent: 'Avant de postuler ailleurs' }),
    el('p', {
      className: 'meta',
      textContent: "LinkedIn, site carriere, cooptation : tape l'entreprise et le poste pour verifier, puis ajoute la candidature une fois envoyee.",
    }),
    el('div', { className: 'filtres' }, [entreprise, poste, selEtat, date, bAjouter]),
    verdict,
  ])
}

const ORIGINES = { 'suivi-manuel': 'Ancien suivi', 'job-finder': 'Job Finder', app: 'Ajout manuel', cli: 'CLI' }

function rendreCandidatures() {
  const v = $('#vue-candidatures')
  v.textContent = ''
  v.append(formulaireAjout())

  const toutes = etat.candidatures
  const compte = (e) => toutes.filter((c) => c.etat === e).length
  const synthese = el('div', { className: 'etiquettes synthese' }, [
    el('span', { className: 'tag', textContent: `${toutes.filter((c) => c.etat !== 'prevu').length} envoyee(s)` }),
    el('span', { className: 'tag alerte', textContent: `${EN_COURS.reduce((n, e) => n + compte(e), 0)} en attente` }),
    el('span', { className: 'tag bon', textContent: `${compte('entretien')} entretien(s)` }),
    el('span', { className: 'tag mauvais', textContent: `${compte('refus')} refus` }),
    el('span', { className: 'tag cible', textContent: `${compte('prevu')} cible(s)` }),
  ])

  const recherche = el('input', { id: 'recherche-cand', type: 'search', placeholder: 'Entreprise, poste...', value: registre.recherche })
  recherche.addEventListener('input', () => {
    registre.recherche = recherche.value
    const curseur = recherche.selectionStart
    rendreCandidatures()
    const champ = $('#recherche-cand')
    champ.focus()
    champ.setSelectionRange(curseur, curseur)
  })
  const selFiltre = el('select', {}, [el('option', { value: '', textContent: 'Tous les etats' })])
  for (const [cle, lib] of Object.entries(etat.etatsCandidature)) {
    selFiltre.append(el('option', { value: cle, textContent: lib, selected: registre.etat === cle }))
  }
  selFiltre.addEventListener('change', () => {
    registre.etat = selFiltre.value
    rendreCandidatures()
  })

  const q = registre.recherche.toLowerCase()
  const lignes = toutes
    .filter((c) => !registre.etat || c.etat === registre.etat)
    .filter((c) => !q || `${c.entreprise} ${c.poste ?? ''}`.toLowerCase().includes(q))

  const tbody = el('tbody')
  for (const c of lignes) {
    const selEtat = el('select')
    for (const [cle, lib] of Object.entries(etat.etatsCandidature)) {
      selEtat.append(el('option', { value: cle, textContent: lib, selected: c.etat === cle }))
    }
    selEtat.addEventListener('change', async () => {
      try {
        await appelRegistre(`/api/candidatures/${encodeURIComponent(c.id)}`, 'PATCH', {
          etat: selEtat.value,
          date: new Date().toISOString().slice(0, 10),
        })
        toast('Etat mis a jour')
        charger()
      } catch (e) {
        toast(e.message)
      }
    })

    const actions = el('td', { className: 'actions-ligne' })
    const offre = c.idOffre && etat.offres.find((o) => o.id === c.idOffre)
    if (offre) {
      const bOffre = el('button', { className: 'btn fantome petit', type: 'button', textContent: 'Offre' })
      bOffre.addEventListener('click', () => ouvrir(offre.id))
      actions.append(bOffre)
    } else if (c.url) {
      actions.append(el('a', { className: 'btn fantome petit', href: c.url, target: '_blank', rel: 'noopener', textContent: 'Lien' }))
    }
    const bSuppr = el('button', { className: 'btn fantome petit', type: 'button', textContent: 'Suppr.' })
    bSuppr.addEventListener('click', async () => {
      if (!window.confirm(`Retirer ${c.entreprise} — ${c.poste ?? 'sans poste'} du registre ?`)) return
      await appelRegistre(`/api/candidatures/${encodeURIComponent(c.id)}`, 'DELETE')
      toast('Retiree du registre')
      charger()
    })
    actions.append(bSuppr)

    tbody.append(el('tr', { className: `etat-${c.etat}` }, [
      el('td', { textContent: c.entreprise }),
      el('td', { textContent: c.poste ?? '—' }),
      el('td', {}, [selEtat]),
      el('td', { textContent: dateLongue(c.envoyeeLe) }),
      el('td', { textContent: dateLongue(c.date) }),
      el('td', { className: 'meta', textContent: ORIGINES[c.origine] ?? c.origine ?? '' }),
      actions,
    ]))
  }

  const thead = el('tr', {}, ['Entreprise', 'Poste', 'Etat', 'Envoyee le', 'Mise a jour', 'Origine', ''].map((t) => el('th', { textContent: t })))
  v.append(
    el('div', { className: 'bloc' }, [
      el('h2', {}, [document.createTextNode('Registre '), el('span', { className: 'compte', textContent: `(${toutes.length})` })]),
      synthese,
      el('div', { className: 'filtres' }, [recherche, selFiltre]),
      lignes.length
        ? el('table', { className: 'registre' }, [el('thead', {}, [thead]), tbody])
        : vide('Aucune candidature ne correspond.'),
    ]),
  )
}

/* ── Panneau de detail ───────────────────────────────── */

function ouvrir(id) {
  etat.ouverte = id
  $('#voile').classList.remove('cachee')
  rendrePanneau()
}

function fermer() {
  etat.ouverte = null
  $('#panneau').classList.add('cachee')
  $('#voile').classList.add('cachee')
}

function rendrePanneau() {
  const p = $('#panneau')
  const o = etat.offres.find((x) => x.id === etat.ouverte)
  if (!o) return fermer()
  p.textContent = ''
  p.classList.remove('cachee')

  const bFermer = el('button', { className: 'btn fantome petit fermer', type: 'button', textContent: 'Fermer' })
  bFermer.addEventListener('click', fermer)

  p.append(
    bFermer,
    el('h3', { textContent: o.titre }),
    el('div', { className: 'meta', textContent: `${o.entreprise} · ${o.lieu ?? lieuDe(o)} · ${o.source} · publiee ${dateCourte(o.datePublication)}` }),
  )

  /* Offre close : le dire avant que tu ne cliques sur un lien mort. */
  if (estClose(o)) {
    const d = o.disponibilite
    p.append(
      el('section', {}, [
        el('div', { className: 'close-bandeau' }, [
          el('strong', { textContent: "L'annonce n'est plus en ligne" }),
          el('p', {
            className: 'meta',
            textContent: `Constaté le ${dateCourte(d.verifieeLe)} via ${d.methode}${d.code ? ` (${d.code})` : ''}.`,
          }),
        ]),
      ]),
    )
  }

  /* Deja postule : le dire avant la checklist, pas apres. */
  const deja = bandeauAntecedents(o)
  if (deja) p.append(el('section', {}, [deja]))

  /* Evenement : job-dating ou salon. On ne postule pas pareil. */
  if (o.evenement) {
    const enfants = [
      el('strong', { textContent: o.evenement.intitule }),
      el('p', { className: 'meta', textContent: o.evenement.detail }),
      el('p', {
        className: 'meta',
        textContent: 'On se présente au stand : pas de formulaire à remplir ici.',
      }),
    ]
    if (o.evenement.url) {
      enfants.push(
        el('a', {
          className: 'btn fantome petit',
          href: o.evenement.url,
          target: '_blank',
          rel: 'noopener',
          textContent: "Détail de l'événement",
        }),
      )
    }
    p.append(el('section', {}, [el('div', { className: 'evenement' }, enfants)]))
  }

  /* Statut, relance, lien */
  const sel = el('select')
  for (const s of etat.statuts) sel.append(el('option', { value: s, textContent: LIBELLE_STATUT[s], selected: o.statut === s }))
  sel.addEventListener('change', () => patcher(o.id, { statut: sel.value }))

  const relance = el('input', { type: 'date', value: o.relanceLe ? o.relanceLe.slice(0, 10) : '' })
  relance.addEventListener('change', () => patcher(o.id, { relanceLe: relance.value || null }))

  const lien = el('a', { className: 'btn fantome petit', href: o.url, target: '_blank', rel: 'noopener', textContent: 'Ouvrir l annonce' })

  p.append(el('section', {}, [
    el('h4', { textContent: 'Suivi' }),
    el('div', { className: 'rangee' }, [sel, el('span', { className: 'meta', textContent: 'Relance le' }), relance, lien]),
  ]))

  /* Checklist */
  const liste = el('div', { className: 'checklist' })
  for (const e of ETAPES) {
    const cb = el('input', { type: 'checkbox', checked: Boolean(o.candidature?.[e.cle]) })
    cb.addEventListener('change', () => {
      const champs = { candidature: { [e.cle]: cb.checked } }
      // Cocher « envoyee » sans basculer le statut laisserait le kanban mentir.
      if (e.cle === 'envoye' && cb.checked && o.statut === 'a-postuler') champs.statut = 'postulee'
      patcher(o.id, champs)
    })
    liste.append(el('label', {}, [cb, el('span', { textContent: e.libelle })]))
  }
  p.append(el('section', {}, [el('h4', { textContent: 'Checklist de candidature' }), liste]))

  /* Score explique */
  const detail = o.evaluation?.detail ?? {}
  const MAX = { intitule: 45, technique: 35, contexte: 20 }
  const lignes = el('div', { className: 'score-lignes' })
  for (const [cle, libelle] of [['intitule', 'Intitule'], ['technique', 'Technique'], ['contexte', 'Contexte'], ['penalites', 'Penalites']]) {
    const val = detail[cle] ?? 0
    const max = MAX[cle] ?? 45
    const barre = el('i', { className: val < 0 ? 'moins' : '' })
    barre.style.width = `${Math.min(100, (Math.abs(val) / max) * 100)}%`
    lignes.append(el('div', { className: 'score-ligne' }, [
      el('span', { textContent: libelle }),
      el('span', { className: 'jauge' }, [barre]),
      el('span', { className: 'num', textContent: String(val) }),
    ]))
  }
  const tags = el('div', { className: 'etiquettes' })
  for (const a of o.evaluation?.atouts ?? []) tags.append(el('span', { className: 'tag bon', textContent: a }))
  for (const r of o.evaluation?.reserves ?? []) tags.append(el('span', { className: 'tag mauvais', textContent: r }))
  if (o.evaluation?.lieu?.raison) tags.append(el('span', { className: 'tag', textContent: o.evaluation.lieu.raison }))

  p.append(el('section', {}, [
    el('h4', { textContent: `Score ${o.evaluation?.note ?? 0}/100 — ${o.evaluation?.verdict ?? ''}` }),
    lignes,
    tags,
  ]))

  /* CV */
  p.append(sectionCv(o))

  /* Lettre */
  p.append(sectionLettre(o))

  /* Description */
  const description = el('div', { className: 'description' })
  description.innerHTML = o.description ?? ''
  p.append(el('section', {}, [el('h4', { textContent: 'Annonce' }), description]))

  /* Journal */
  const journal = el('div', { className: 'journal' })
  const entrees = [
    { date: o.decouvertLe, texte: `Decouverte via ${o.source}` },
    ...(o.statutLe ? [{ date: o.statutLe, texte: `Statut : ${LIBELLE_STATUT[o.statut]}` }] : []),
    ...(o.notes ?? []),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))
  for (const e of entrees) {
    journal.append(el('div', { className: 'journal-ligne' }, [
      el('span', { className: 'journal-date', textContent: dateCourte(e.date) }),
      el('span', { textContent: e.texte }),
    ]))
  }

  const champNote = el('textarea', { rows: 2, placeholder: 'Ajouter une note (contact, reponse recue, relance...)' })
  const bNote = el('button', { className: 'btn petit', type: 'button', textContent: 'Ajouter' })
  bNote.addEventListener('click', () => {
    if (!champNote.value.trim()) return
    patcher(o.id, { note: champNote.value.trim() })
  })

  p.append(el('section', {}, [
    el('h4', { textContent: 'Journal' }),
    journal,
    el('div', { className: 'rangee', style: 'margin-top:10px' }, [champNote, bNote]),
  ]))
}

/* ── Lettre de motivation ───────────────────────────── */

/**
 * La lettre est redigee par la skill /lettre, pas par l'app : la liste
 * choisit la langue de la lettre affichee, ou de la commande a copier.
 */
function sectionLettre(o) {
  const section = el('section', {}, [el('h4', { textContent: 'Lettre de motivation' })])
  const selLangue = el('select', { title: 'Langue de la lettre' })
  for (const [valeur, libelle] of LANGUES_CV) selLangue.append(el('option', { value: valeur, textContent: libelle }))
  const zone = el('div')

  const dessiner = () => {
    zone.textContent = ''
    const langue = selLangue.value
    const fichier = langue === 'en' ? o.lettreEn : o.lettre
    if (fichier) {
      const contenu = el('div', { className: 'lettre-texte', textContent: 'Chargement...' })
      const bCopier = el('button', { className: 'btn petit', type: 'button', textContent: 'Copier pour l extension' })
      fetch(`/api/lettre/${encodeURIComponent(fichier)}`)
        .then((r) => r.json())
        .then((d) => (contenu.textContent = d.texte ?? d.erreur))
      bCopier.addEventListener('click', async () => {
        await navigator.clipboard.writeText(contenu.textContent)
        toast('Lettre copiee')
      })
      // Le serveur imprime le PDF s'il manque ou si le .md a ete retouche.
      const bPdf = el('a', {
        className: 'btn petit',
        href: `/api/lettre-pdf/${encodeURIComponent(fichier)}`,
        download: fichier.replace(/.md$/, '.pdf'),
        textContent: 'Telecharger le PDF',
      })
      zone.append(el('div', { className: 'rangee' }, [el('span', { className: 'meta', textContent: fichier }), bCopier, bPdf]), contenu)
    } else {
      const cmd = () =>
        [`/lettre ${o.id}`, langue === 'fr' ? null : `--langue ${langue}`, pdf.checked ? '--pdf' : null].filter(Boolean).join(' ')
      const code = el('code', { className: 'cmd', textContent: cmd() })
      pdf.onchange = () => (code.textContent = cmd())
      const bCopier = el('button', { className: 'btn petit', type: 'button', textContent: 'Copier la commande' })
      bCopier.addEventListener('click', async () => {
        await navigator.clipboard.writeText(cmd())
        toast('Commande copiee — colle-la dans Claude Code')
      })
      const absente = langue === 'en' ? 'Aucune lettre en anglais pour cette offre.' : 'Aucune lettre trouvee dans lettres/ pour cette entreprise.'
      zone.append(el('p', { className: 'meta', textContent: absente }))
      zone.append(el('div', { className: 'rangee' }, [code, bCopier]))
    }
  }

  // Coche : la commande copiee demande aussi le PDF a la skill.
  const pdf = el('input', { type: 'checkbox', title: 'Generer aussi la lettre en PDF' })
  const libPdf = el('label', { className: 'meta' }, [pdf, document.createTextNode(' PDF')])

  selLangue.addEventListener('change', dessiner)
  dessiner()
  section.append(el('div', { className: 'rangee' }, [selLangue, libPdf]), zone)
  return section
}

/* ── CV cible ────────────────────────────────────────── */

const AXES_CV = [
  ['', 'Axe detecte automatiquement'],
  ['ia', 'Ingenieur IA'],
  ['dotnet', '.NET / C#'],
  ['fullstack', 'Fullstack'],
  ['data', 'Data'],
  ['devops', 'Qualite / DevOps'],
]

const LANGUES_CV = [
  ['fr', 'Francais'],
  ['en', 'Anglais'],
]

/**
 * Le bouton ne fabrique rien lui-meme : il appelle le meme generateur que
 * `npm run cv`. L'app n'est qu'une telecommande, comme pour les autres commandes.
 */
function sectionCv(o) {
  const section = el('section', {}, [el('h4', { textContent: 'CV cible sur cette offre' })])

  const selAxe = el('select', { title: "Forcer l'axe si la detection se trompe" })
  for (const [valeur, libelle] of AXES_CV) selAxe.append(el('option', { value: valeur, textContent: libelle }))

  const selLangue = el('select', { title: 'Langue du CV' })
  for (const [valeur, libelle] of LANGUES_CV) selLangue.append(el('option', { value: valeur, textContent: libelle }))

  const photo = el('input', { type: 'checkbox', id: `cv-photo-${o.id}` })
  const bGenerer = el('button', { className: 'btn petit', type: 'button', textContent: 'Generer le CV' })
  const resultat = el('div', { className: 'cv-resultat' })

  const afficher = (fichier, info) => {
    resultat.textContent = ''
    const bOuvrir = el('button', { className: 'btn petit', type: 'button', textContent: 'Ouvrir le CV' })
    bOuvrir.addEventListener('click', () => window.open(`/api/cv/fichier/${encodeURIComponent(fichier)}`, '_blank'))

    // Un lien plutot qu'un fetch : le navigateur gere le telechargement,
    // le serveur imprime le PDF s'il manque ou s'il est perime.
    const bPdf = el('a', {
      className: 'btn petit',
      href: `/api/cv/pdf/${encodeURIComponent(fichier)}`,
      download: fichier.replace(/\.html$/, '.pdf'),
      textContent: 'Telecharger le PDF',
    })

    const bTexte = el('button', { className: 'btn petit', type: 'button', textContent: 'Copier le texte ATS' })
    bTexte.addEventListener('click', async () => {
      const r = await fetch(`/api/cv/fichier/${encodeURIComponent(fichier.replace(/\.html$/, '.txt'))}?format=json`)
      const d = await r.json()
      if (!d.texte) return toast(d.erreur ?? 'Texte introuvable')
      await navigator.clipboard.writeText(d.texte)
      toast('CV copie en texte brut')
    })

    resultat.append(el('div', { className: 'rangee' }, [
      el('span', { className: 'meta', textContent: fichier }),
      bOuvrir,
      bPdf,
      bTexte,
    ]))

    if (info?.titre) {
      resultat.append(el('p', { className: 'meta', textContent: `Axe ${info.axe} — ${info.titre}` }))
    }
    if (info?.traductionsManquantes?.length) {
      resultat.append(el('p', {
        className: 'meta',
        textContent: `Sans traduction anglaise, laisse en francais : ${info.traductionsManquantes.join(', ')}`,
      }))
    }
    // Ce que l'annonce reclame et que le CV ne dit pas : c'est la seule chose
    // que le generateur ne tranche pas seul.
    if (info?.absents?.length) {
      const tags = el('div', { className: 'etiquettes' })
      for (const t of info.absents) tags.append(el('span', { className: 'tag mauvais', textContent: t }))
      resultat.append(
        el('p', { className: 'meta', textContent: "Demande par l'annonce, absent du CV :" }),
        tags,
      )
    }
    if (info?.erreurPdf) {
      resultat.append(el('p', { className: 'meta', textContent: `PDF non genere : ${info.erreurPdf}` }))
    }
  }

  bGenerer.addEventListener('click', async () => {
    bGenerer.disabled = true
    bGenerer.textContent = 'Generation...'
    try {
      const r = await fetch(`/api/cv/generer/${encodeURIComponent(o.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ axe: selAxe.value || null, photo: photo.checked, langue: selLangue.value }),
      })
      const d = await r.json()
      if (d.erreur) throw new Error(d.erreur)
      // Conserve hors du DOM : `patcher` redessine le panneau, et le diagnostic
      // de la generation ne doit pas disparaitre avec lui.
      etat.cvGeneres[o.id] = d
      afficher(d.fichier, d)
      toast('CV genere')
      // Le CV compte comme une etape de candidature : la checklist suit.
      if (!o.candidature?.cv) patcher(o.id, { candidature: { cv: true } })
    } catch (e) {
      toast(e.message)
    } finally {
      bGenerer.disabled = false
      bGenerer.textContent = 'Regenerer le CV'
    }
  })

  section.append(
    el('div', { className: 'rangee' }, [
      selAxe,
      selLangue,
      el('label', { className: 'meta', htmlFor: photo.id }, [photo, el('span', { textContent: ' Photo' })]),
      bGenerer,
    ]),
    resultat,
  )

  // Chaque langue a son fichier : changer la liste montre le CV deja
  // genere dans cette langue, s'il existe.
  const existant = () => (selLangue.value === 'en' ? o.cvEn : o.cv)
  const dejaGenere = etat.cvGeneres[o.id]
  if (dejaGenere) {
    selAxe.value = AXES_CV.some(([v]) => v === dejaGenere.axe) ? dejaGenere.axe : ''
    selLangue.value = dejaGenere.langue ?? 'fr'
    bGenerer.textContent = 'Regenerer le CV'
    afficher(dejaGenere.fichier, dejaGenere)
  } else if (existant()) {
    bGenerer.textContent = 'Regenerer le CV'
    afficher(existant(), null)
  }
  selLangue.addEventListener('change', () => {
    const d = etat.cvGeneres[o.id]
    const f = d?.langue === selLangue.value ? d.fichier : existant()
    bGenerer.textContent = f ? 'Regenerer le CV' : 'Generer le CV'
    if (f) afficher(f, d?.langue === selLangue.value ? d : null)
    else resultat.textContent = ''
  })
  return section
}

/* ── Navigation et rendu ─────────────────────────────── */

function allerA(vue) {
  etat.vue = vue
  document.querySelectorAll('.onglet').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue))
  document.querySelectorAll('.vue').forEach((s) => s.classList.toggle('cachee', s.id !== `vue-${vue}`))
  rendre()
}

function rendre() {
  $('#pastille-afaire').textContent = String(
    closesSuivies().length + etat.offres.filter(relanceDue).length + incompletes().length || '',
  )
  $('#pastille-tri').textContent = String(aTrier().length || '')
  $('#pastille-candidatures').textContent = String(
    etat.candidatures.filter((c) => EN_COURS.includes(c.etat)).length || '',
  )

  if (etat.vue === 'afaire') rendreAFaire()
  if (etat.vue === 'tri') rendreTri()
  if (etat.vue === 'kanban') rendreKanban()
  if (etat.vue === 'tableau') rendreTableau()
  if (etat.vue === 'candidatures') rendreCandidatures()
  if (etat.ouverte) rendrePanneau()
}

document.querySelectorAll('.onglet').forEach((b) => b.addEventListener('click', () => allerA(b.dataset.vue)))
document.querySelectorAll('.actions .btn').forEach((b) => b.addEventListener('click', () => executer(b.dataset.cmd, b)))
$('#console-fermer').addEventListener('click', () => $('#console').classList.add('cachee'))
$('#voile').addEventListener('click', fermer)

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return fermer()
  if (etat.vue !== 'tri' || etat.ouverte) return
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
  const pile = aTrier()
  if (!pile.length) return
  const id = pile[Math.min(etat.triIndex, pile.length - 1)].id
  if (e.key === '1') trier(id, 'garder')
  if (e.key === '2') trier(id, 'plus-tard')
  if (e.key === '3') trier(id, 'ecarter')
})

charger()
