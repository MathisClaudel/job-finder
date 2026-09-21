/**
 * Rendu du CV en HTML imprimable, et en texte brut.
 *
 * Contrainte structurante : UNE SEULE COLONNE.
 * Un CV en deux colonnes se lit bien a l'oeil mais sort melange d'un
 * extracteur de texte — les deux colonnes s'entrelacent ligne par ligne.
 * Ici l'ordre du DOM est l'ordre de lecture humain, donc l'ordre que voit
 * la machine. Le soin graphique passe par la typographie et le rythme
 * vertical, jamais par la mise en colonnes.
 *
 * Les autres regles de lisibilite machine appliquees ici :
 *   - titres en <h1>/<h2>/<h3> reels, listes en <ul>, aucune <table> de mise en page
 *   - coordonnees en texte selectionnable, sans icone porteuse de sens
 *   - dates ecrites en toutes lettres ("Sept. 2025 – Sept. 2026")
 *   - aucune information presente uniquement dans une image
 *   - polices systeme : le PDF s'imprime a l'identique partout, hors ligne
 */

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * Tout le texte que le rendu ecrit lui-meme. Le contenu, lui, vient de
 * cv.yaml deja localise par le ciblage.
 */
const LIBELLES = {
  fr: {
    mois: ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    aujourdhui: "aujourd'hui",
    experience: 'Expérience professionnelle',
    competences: 'Compétences',
    projets: 'Projets',
    formation: 'Formation',
    certification: 'Certification',
    basDroite: 'Certification, langues, engagement',
    disponibilite: (d) => `disponibilité ${d.toLowerCase()}`,
    ou: ' ou ',
    contrats: {},
    disponibilites: {},
  },
  en: {
    mois: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'],
    aujourdhui: 'present',
    experience: 'Professional experience',
    competences: 'Skills',
    projets: 'Projects',
    formation: 'Education',
    certification: 'Certification',
    basDroite: 'Certification, languages, leadership',
    disponibilite: (d) => `available ${d.toLowerCase()}`,
    ou: ' or ',
    // Le sigle reste entre parentheses : c'est lui que cherche un recruteur en France.
    contrats: { CDI: 'Permanent contract (CDI)', CDD: 'Fixed-term contract (CDD)' },
    disponibilites: { 'Immédiate': 'immediately' },
  },
}
const lib = (cible) => LIBELLES[cible.langue] ?? LIBELLES.fr

/** "2025-09" -> "Sept. 2025". Un ATS lit mieux un mois ecrit qu'un 09/2025. */
function moisAn(valeur, L) {
  const m = String(valeur ?? '').match(/^(\d{4})-(\d{2})/)
  if (!m) return String(valeur ?? '')
  const mois = L.mois[Number(m[2]) - 1] ?? ''
  return `${mois.charAt(0).toUpperCase()}${mois.slice(1)} ${m[1]}`
}

const periode = (exp, L) => `${moisAn(exp.debut, L)} – ${exp.fin ? moisAn(exp.fin, L) : L.aujourdhui}`

const CSS = `
:root {
  --encre: #15181d;
  --gris: #5b6472;
  --trait: #dfe3e9;
  --accent: #1d4ed8;
  --accent-clair: #eef2ff;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  font-family: "Segoe UI", Inter, -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
  font-size: 9.6pt;
  line-height: 1.42;
  color: var(--encre);
  background: #f2f4f7;
}
.page {
  width: 210mm;
  min-height: 297mm;
  padding: 13mm 15mm 11mm;
  margin: 0 auto;
  background: #fff;
}

/* ─── En-tete ─────────────────────────────────────────────── */
.entete { display: flex; gap: 10mm; align-items: flex-start; }
.entete-texte { flex: 1; min-width: 0; }
h1 {
  margin: 0;
  font-size: 23pt;
  font-weight: 650;
  letter-spacing: -0.4pt;
  line-height: 1.05;
}
.titre-poste {
  margin: 2.5mm 0 0;
  font-size: 11.4pt;
  font-weight: 600;
  color: var(--accent);
}
.dispo {
  display: inline-block;
  margin: 2.5mm 0 0;
  padding: 0.9mm 2.4mm;
  border-radius: 1mm;
  background: var(--accent-clair);
  color: var(--accent);
  font-size: 8.6pt;
  font-weight: 600;
}
.accroche { margin: 3mm 0 0; color: #2b313b; max-width: 158mm; }
.contact {
  margin: 4mm 0 0;
  padding-top: 3mm;
  border-top: 1px solid var(--trait);
  color: var(--gris);
  font-size: 9pt;
}
.contact span::after { content: "  ·  "; color: var(--trait); }
.contact span:last-child::after { content: ""; }
.contact a { color: var(--gris); text-decoration: none; }
.photo {
  width: 27mm; height: 32mm; object-fit: cover;
  border-radius: 2mm; flex: none;
}

/* ─── Sections ────────────────────────────────────────────── */
section { margin-top: 6.5mm; }
h2 {
  margin: 0 0 3mm;
  font-size: 8.6pt;
  font-weight: 700;
  letter-spacing: 1.1pt;
  text-transform: uppercase;
  color: var(--accent);
  padding-bottom: 1.6mm;
  border-bottom: 1.6pt solid var(--accent);
}

/* ─── Experiences ─────────────────────────────────────────── */
.exp { margin-bottom: 4.5mm; page-break-inside: avoid; }
.exp:last-child { margin-bottom: 0; }
.exp-tete { display: flex; justify-content: space-between; gap: 6mm; align-items: baseline; }
h3 { margin: 0; font-size: 10.6pt; font-weight: 650; }
h3 .chez { font-weight: 500; color: var(--gris); }
.dates { flex: none; font-size: 8.8pt; color: var(--gris); font-variant-numeric: tabular-nums; }
.contexte { margin: 0.6mm 0 1.6mm; font-size: 8.8pt; color: var(--gris); font-style: italic; }
ul { margin: 0; padding-left: 4.4mm; }
li { margin-bottom: 1.1mm; }
li::marker { color: var(--accent); }

/* ─── Competences ─────────────────────────────────────────── */
.comp { display: flex; gap: 3mm; margin-bottom: 1.8mm; align-items: baseline; }
.comp-groupe { flex: none; width: 34mm; font-weight: 650; }
.comp-items { flex: 1; color: #2b313b; }

/* ─── Bas de page : formation, langues ────────────────────── */
.duo { display: flex; gap: 9mm; }
.duo > * { flex: 1; min-width: 0; }
.form-item { margin-bottom: 2.6mm; }
.form-item strong { font-weight: 650; }
.form-meta { color: var(--gris); font-size: 8.8pt; }
.ligne-simple { margin-bottom: 1.4mm; }
.projet { margin-bottom: 2.6mm; page-break-inside: avoid; }
.projet strong { font-weight: 650; }
.projet .lien { color: var(--accent); font-size: 8.8pt; }

/* Temoin de debordement : visible a l'ecran, jamais imprime. */
.temoin {
  position: fixed; right: 4mm; bottom: 4mm; z-index: 9;
  padding: 2mm 3.5mm; border-radius: 1.5mm;
  font: 600 9pt/1 "Segoe UI", system-ui, sans-serif;
  color: #fff; background: #16a34a;
}
.temoin.trop { background: #dc2626; }

@media print {
  body { background: #fff; }
  .page { width: auto; min-height: 0; margin: 0; padding: 0; }
  .temoin { display: none; }
  @page { size: A4; margin: 12mm 14mm; }
}
`

/**
 * A l'ecran, indique si le contenu tient sur une page A4 imprimee.
 * 297mm moins 2 x 12mm de marge @page = 273mm de hauteur utile.
 */
const TEMOIN = `
<div class="temoin" id="temoin"></div>
<script>
  (function () {
    var utileMm = 273
    var page = document.querySelector('.page')
    var mm = document.createElement('div')
    mm.style.cssText = 'height:100mm;position:absolute;visibility:hidden'
    document.body.appendChild(mm)
    var parMm = mm.getBoundingClientRect().height / 100
    mm.remove()
    // Le padding d'ecran de .page n'existe pas a l'impression : on le retire.
    var styles = getComputedStyle(page)
    var hauteur =
      (page.getBoundingClientRect().height - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)) / parMm
    var t = document.getElementById('temoin')
    var reste = utileMm - hauteur
    t.textContent = reste >= 0 ? 'Tient sur 1 page (' + reste.toFixed(0) + ' mm de marge)' : 'Deborde de ' + (-reste).toFixed(0) + ' mm'
    t.className = 'temoin' + (reste >= 0 ? '' : ' trop')
  })()
</script>`

function sectionExperiences(cible) {
  const blocs = cible.experiences
    .map(
      (exp) => `
      <article class="exp">
        <div class="exp-tete">
          <h3>${echapper(exp.poste)} <span class="chez">— ${echapper(exp.entreprise)}</span></h3>
          <span class="dates">${echapper(periode(exp, lib(cible)))} · ${echapper(exp.lieu)}</span>
        </div>
        ${exp.contexte ? `<p class="contexte">${echapper(exp.contexte)}</p>` : ''}
        <ul>${exp.puces.map((p) => `<li>${echapper(p.texte)}</li>`).join('')}</ul>
      </article>`,
    )
    .join('')
  return `<section><h2>${lib(cible).experience}</h2>${blocs}</section>`
}

function sectionCompetences(cible) {
  const lignes = cible.competences
    .map(
      (g) => `
      <div class="comp">
        <div class="comp-groupe">${echapper(g.groupe)}</div>
        <div class="comp-items">${g.items.map((i) => echapper(i.nom)).join(' · ')}</div>
      </div>`,
    )
    .join('')
  return `<section><h2>${lib(cible).competences}</h2>${lignes}</section>`
}

function sectionProjets(cible) {
  if (!cible.projets.length) return ''
  const blocs = cible.projets
    .map(
      (p) => `
      <div class="projet">
        <strong>${echapper(p.nom)}</strong>${p.lien ? ` <span class="lien">${echapper(p.lien)}</span>` : ''}
        — ${echapper(p.texte)}
      </div>`,
    )
    .join('')
  return `<section><h2>${lib(cible).projets}</h2>${blocs}</section>`
}

function sectionBas(cible) {
  const formation = cible.formation
    .map(
      (f) => `
      <div class="form-item">
        <strong>${echapper(f.diplome)}</strong><br>
        <span class="form-meta">${echapper(f.etablissement)}, ${echapper(f.lieu)} · ${echapper(f.periode)}</span>
        ${f.detail ? `<br><span class="form-meta">${echapper(f.detail)}</span>` : ''}
      </div>`,
    )
    .join('')

  const aCote = [
    cible.certifications.length
      ? `<div class="ligne-simple"><strong>${lib(cible).certification}</strong> — ${cible.certifications
          .map((c) => `${echapper(c.nom)}, ${echapper(c.annee)}`)
          .join(' · ')}</div>`
      : '',
    ...cible.langues.map(
      (l) => `<div class="ligne-simple"><strong>${echapper(l.nom)}</strong> — ${echapper(l.niveau)}</div>`,
    ),
    cible.engagement
      ? `<div class="ligne-simple" style="margin-top:3mm">
           <strong>${echapper(cible.engagement.titre)}</strong>
           <span class="form-meta">(${echapper(cible.engagement.periode)})</span><br>
           ${echapper(cible.engagement.texte)}
         </div>`
      : '',
  ].join('')

  return `
  <div class="duo">
    <section style="margin-top:6.5mm"><h2>${lib(cible).formation}</h2>${formation}</section>
    <section style="margin-top:6.5mm"><h2>${lib(cible).basDroite}</h2>${aCote}</section>
  </div>`
}

/**
 * En-tete commun aux deux rendus.
 *
 * L'adresse est reduite a la ville : un recruteur veut savoir si le candidat
 * est sur zone, pas ou il habite. La ligne de disponibilite donne en clair
 * les trois informations que tout ATS indexe et que tout recruteur cherche —
 * contrat, disponibilite, zone geographique.
 */
function enTete(cible) {
  const id = cible.identite
  const r = cible.recherche ?? {}
  const L = lib(cible)
  const ville = ((id.adresse_actuelle ?? '').match(/\b\d{5}\s+([^,]+)/) ?? [])[1]?.trim()

  const dispo = [
    (r.type_contrat ?? []).map((c) => L.contrats[c] ?? c).join(' / ') || null,
    r.disponibilite ? L.disponibilite(L.disponibilites[r.disponibilite] ?? String(r.disponibilite)) : null,
    [r.localisation?.presentiel?.ville_cible, r.localisation?.remote?.accepte_full_remote ? 'full remote' : null]
      .filter(Boolean)
      .join(L.ou) || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    contacts: [id.email_perso, id.telephone, ville, id.linkedin, id.github].filter(Boolean),
    dispo,
  }
}

export function rendreHtml(cible, { photoDataUri = null } = {}) {
  const id = cible.identite
  const nom = `${id.prenom} ${id.nom}`.toUpperCase()

  // Une seule ligne de contact, en texte : c'est ce que les ATS savent lire.
  const { contacts: lignesContact, dispo } = enTete(cible)
  const contacts = lignesContact.map((c) => `<span>${echapper(c)}</span>`).join('')

  return `<!DOCTYPE html>
<html lang="${cible.langue ?? 'fr'}">
<head>
<meta charset="utf-8">
<title>CV — ${echapper(nom)} — ${echapper(cible.titre)}</title>
<meta name="author" content="${echapper(`${id.prenom} ${id.nom}`)}">
<meta name="description" content="${echapper(cible.titre)}">
<style>${CSS}</style>
</head>
<body>
<main class="page">
  <header class="entete">
    <div class="entete-texte">
      <h1>${echapper(nom)}</h1>
      <p class="titre-poste">${echapper(cible.titre)}</p>
      ${dispo ? `<p><span class="dispo">${echapper(dispo)}</span></p>` : ''}
      <p class="accroche">${echapper(cible.accroche)}</p>
      <p class="contact">${contacts}</p>
    </div>
    ${cible.photo && photoDataUri ? `<img class="photo" src="${photoDataUri}" alt="${echapper(nom)}">` : ''}
  </header>

  ${sectionExperiences(cible)}
  ${sectionCompetences(cible)}
  ${sectionProjets(cible)}
  ${sectionBas(cible)}
</main>
${TEMOIN}
</body>
</html>`
}

/**
 * Version texte brut : pour les champs "collez votre CV" des ATS, et pour
 * verifier d'un coup d'oeil ce qu'une machine lit reellement du document.
 */
export function rendreTexte(cible) {
  const id = cible.identite
  const L = lib(cible)
  const l = []
  const titre = (t) => l.push('', t.toUpperCase(), '='.repeat(t.length))

  const { contacts, dispo } = enTete(cible)
  l.push(`${id.prenom} ${id.nom}`.toUpperCase())
  l.push(cible.titre)
  if (dispo) l.push(dispo)
  l.push(contacts.join(' | '))
  l.push('', cible.accroche)

  titre(L.experience)
  for (const exp of cible.experiences) {
    l.push('', `${exp.poste} — ${exp.entreprise}`, `${periode(exp, L)} · ${exp.lieu}`)
    for (const p of exp.puces) l.push(`- ${p.texte}`)
  }

  titre(L.competences)
  for (const g of cible.competences) l.push(`${g.groupe} : ${g.items.map((i) => i.nom).join(', ')}`)

  titre(L.projets)
  for (const p of cible.projets) l.push(`- ${p.nom}${p.lien ? ` (${p.lien})` : ''} : ${p.texte}`)

  titre(L.formation)
  for (const f of cible.formation) {
    l.push(`${f.diplome} — ${f.etablissement}, ${f.lieu} (${f.periode})`)
    if (f.detail) l.push(`  ${f.detail}`)
  }

  titre(L.basDroite)
  for (const c of cible.certifications) l.push(`- ${c.nom} (${c.annee})`)
  for (const lg of cible.langues) l.push(`- ${lg.nom} : ${lg.niveau}`)
  if (cible.engagement) l.push(`- ${cible.engagement.titre} (${cible.engagement.periode}) : ${cible.engagement.texte}`)

  return l.join('\n') + '\n'
}
