/**
 * Conversion HTML → PDF par le navigateur deja installe sur la machine.
 *
 * Edge (present sur tout Windows) ou Chrome en mode headless : meme moteur
 * que le Ctrl+P manuel, donc meme couche texte lisible par un ATS, sans
 * embarquer Chromium dans les dependances du depot. La feuille `@media print`
 * de rendu.js fixe deja le format A4 et les marges.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const CANDIDATS = [
  process.env.JF_NAVIGATEUR,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean)

export function navigateur() {
  return CANDIDATS.find((c) => existsSync(c)) ?? null
}

/** Le PDF est a jour s'il existe et n'est pas plus ancien que le HTML. */
export function pdfAJour(cheminHtml, cheminPdf) {
  return existsSync(cheminPdf) && statSync(cheminPdf).mtimeMs >= statSync(cheminHtml).mtimeMs
}

/**
 * @returns le chemin du PDF ; leve une erreur explicite si aucun navigateur
 *   n'est trouve ou si l'impression echoue.
 */
export function htmlVersPdf(cheminHtml, cheminPdf) {
  const exe = navigateur()
  if (!exe) throw new Error('Ni Edge ni Chrome trouve — definir JF_NAVIGATEUR ou imprimer le HTML a la main')

  // Profil jetable : un Edge deja ouvert par l'utilisateur ne doit pas
  // intercepter la commande ni voir son profil touche.
  const profil = mkdtempSync(join(tmpdir(), 'jf-pdf-'))
  try {
    const r = spawnSync(exe, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profil}`,
      '--no-pdf-header-footer',
      `--print-to-pdf=${cheminPdf}`,
      pathToFileURL(cheminHtml).href,
    ], { timeout: 60_000, windowsHide: true })
    if (r.error) throw r.error
    if (!existsSync(cheminPdf) || !pdfAJour(cheminHtml, cheminPdf)) {
      throw new Error(`Impression PDF echouee : ${String(r.stderr ?? '').trim().slice(0, 300) || `code ${r.status}`}`)
    }
    return cheminPdf
  } finally {
    rmSync(profil, { recursive: true, force: true, maxRetries: 3 })
  }
}
