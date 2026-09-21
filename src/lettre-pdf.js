/**
 * Mise en page PDF d'une lettre ecrite par la skill /lettre.
 *
 * Le .md reste la source : on en tire un HTML A4 (en-tete expediteur, date,
 * objet, corps) imprime par le meme Edge/Chrome que le CV. Rien n'est redige
 * ici, le texte passe tel quel.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { ROOT, chargerProfil } from './config.js'
import { htmlVersPdf, pdfAJour } from './cv/pdf.js'

export const LETTRES = join(ROOT, 'lettres')

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function lireLettre(chemin) {
  const brut = readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n')
  const m = brut.match(/^---\n([\s\S]*?)\n---\n?/)
  const entete = {}
  for (const ligne of (m?.[1] ?? '').split('\n')) {
    const kv = ligne.match(/^(\w+):\s*(.*)$/)
    if (kv) entete[kv[1]] = kv[2].trim()
  }
  return { entete, corps: (m ? brut.slice(m[0].length) : brut).trim() }
}

function dateLongue(iso, langue) {
  const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : new Date()
  return d.toLocaleDateString(langue === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function versHtml({ entete, corps }) {
  const langue = entete.langue === 'en' ? 'en' : 'fr'
  const id = chargerProfil().identite ?? {}
  const expediteur = [
    `${id.prenom ?? ''} ${id.nom ?? ''}`.trim(),
    id.adresse_actuelle,
    id.telephone,
    id.email_perso,
  ].filter(Boolean)
  const ville = (id.adresse_actuelle ?? '').match(/\d{5}\s+([^,]+)/)?.[1]?.trim()
  const date = dateLongue(entete.date, langue)
  const lieuDate = langue === 'en' ? date : `${ville ? `${ville}, le ` : ''}${date}`
  const objet = entete.poste
    ? `${langue === 'en' ? 'Application' : 'Objet : candidature'} ${langue === 'en' ? 'for' : 'au poste de'} ${entete.poste}`
    : ''
  const paragraphes = corps
    .split(/\n\s*\n/)
    .map((p) => `<p>${echapper(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  return `<!doctype html>
<html lang="${langue}">
<head>
<meta charset="utf-8">
<title>${echapper(entete.entreprise ?? 'Lettre')}</title>
<style>
  @page { size: A4; margin: 22mm 22mm 20mm; }
  body { font: 10.5pt/1.5 Calibri, "Segoe UI", Arial, sans-serif; color: #1a1a1a; margin: 0; }
  .expediteur { line-height: 1.35; }
  .expediteur strong { font-size: 12pt; }
  .destinataire { margin-top: 14mm; text-align: right; }
  .date { margin-top: 4mm; text-align: right; }
  .objet { margin-top: 10mm; font-weight: 600; }
  .corps { margin-top: 8mm; }
  .corps p { margin: 0 0 3.5mm; text-align: justify; hyphens: auto; }
</style>
</head>
<body>
<div class="expediteur">${expediteur.map((l, i) => (i ? echapper(l) : `<strong>${echapper(l)}</strong>`)).join('<br>')}</div>
${entete.entreprise ? `<div class="destinataire">${echapper(entete.entreprise)}</div>` : ''}
<div class="date">${echapper(lieuDate)}</div>
${objet ? `<div class="objet">${echapper(objet)}</div>` : ''}
<div class="corps">
${paragraphes}
</div>
</body>
</html>
`
}

/**
 * Imprime `lettres/<fichier>.md` en `lettres/<fichier>.pdf`. Ne refait rien si
 * le PDF est plus recent que le .md, sauf `force`.
 * @returns le chemin du PDF
 */
export function lettreVersPdf(fichier, { force = false } = {}) {
  const md = join(LETTRES, basename(fichier))
  if (!md.endsWith('.md') || !existsSync(md)) throw new Error(`Lettre introuvable : ${fichier}`)
  const pdf = md.replace(/\.md$/, '.pdf')
  if (!force && pdfAJour(md, pdf)) return pdf
  const html = md.replace(/\.md$/, '.html')
  writeFileSync(html, versHtml(lireLettre(md)))
  htmlVersPdf(html, pdf)
  return pdf
}

/** `node src/cli.js lettre-pdf <fichier.md>` */
export function commandeLettrePdf(args) {
  const fichier = args.find((a) => !a.startsWith('--'))
  if (!fichier) throw new Error('Usage : lettre-pdf <fichier.md du dossier lettres/>')
  console.log(`\n  ${lettreVersPdf(fichier, { force: true })}\n`)
}
