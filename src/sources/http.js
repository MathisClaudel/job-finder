import { UA } from '../config.js'

/** Fetch JSON avec timeout, User-Agent honnete et message d'erreur exploitable. */
export async function getJson(url, options = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), options.timeout ?? 20000)
  try {
    const rep = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...options.headers },
    })
    // France Travail repond 206 quand la plage demandee est partielle : c'est un succes.
    if (!rep.ok && rep.status !== 206) {
      const corps = await rep.text().catch(() => '')
      throw new Error(`HTTP ${rep.status} sur ${new URL(url).host} — ${corps.slice(0, 160)}`)
    }
    // France Travail repond 204 avec un corps vide quand la requete ne ramene
    // rien. C'est un resultat vide, pas une panne : le signaler comme une erreur
    // masquerait les vraies.
    const texte = await rep.text()
    if (!texte.trim()) return null
    return JSON.parse(texte)
  } finally {
    clearTimeout(timer)
  }
}

export async function getTexte(url, options = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), options.timeout ?? 20000)
  try {
    const rep = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, ...options.headers },
    })
    if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${new URL(url).host}`)
    return await rep.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Retire le HTML des descriptions et normalise les espaces. */
export function nettoyer(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms))
