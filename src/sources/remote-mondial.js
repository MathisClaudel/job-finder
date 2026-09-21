/**
 * Sources d'offres 100 % remote, ouvertes au monde entier, sans authentification.
 * Toutes exposent une API publique ou un flux RSS destines a cet usage.
 */
import { getJson, getTexte, nettoyer } from './http.js'

const base = (o) => ({ pays: 'International', remote: true, competences: [], ...o })

/** Les APIs publiques renvoient tantot une chaine, tantot un tableau, tantot rien. */
const liste = (v) => (Array.isArray(v) ? v : v ? [v] : [])

// ─── Remotive ────────────────────────────────────────────────────────
async function remotive() {
  const offres = []
  for (const categorie of ['software-dev', 'data']) {
    const data = await getJson(`https://remotive.com/api/remote-jobs?category=${categorie}&limit=100`)
    for (const j of data?.jobs ?? []) {
      offres.push(
        base({
          id: `remotive-${j.id}`,
          source: 'Remotive',
          titre: j.title,
          entreprise: j.company_name,
          lieu: j.candidate_required_location || 'Worldwide',
          url: j.url,
          description: nettoyer(j.description),
          datePublication: j.publication_date,
          salaire: j.salary || null,
          contrat: j.job_type ?? null,
          competences: liste(j.tags),
        }),
      )
    }
  }
  return offres
}

// ─── RemoteOK ────────────────────────────────────────────────────────
async function remoteok() {
  const data = await getJson('https://remoteok.com/api')
  // Le premier element du tableau est une mention legale, pas une offre.
  return (Array.isArray(data) ? data.slice(1) : [])
    .filter((j) => j.position)
    .map((j) =>
      base({
        id: `remoteok-${j.id}`,
        source: 'RemoteOK',
        titre: j.position,
        entreprise: j.company,
        lieu: j.location || 'Worldwide',
        url: j.url ?? `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
        description: nettoyer(j.description),
        datePublication: j.date,
        salaire:
          j.salary_min && j.salary_max ? `${j.salary_min} - ${j.salary_max} USD` : null,
        contrat: null,
        competences: liste(j.tags),
      }),
    )
}

// ─── We Work Remotely (RSS) ──────────────────────────────────────────
function itemsRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
}
function champRss(item, nom) {
  const m =
    item.match(new RegExp(`<${nom}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${nom}>`)) ??
    item.match(new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`))
  return m ? m[1].trim() : ''
}

async function weworkremotely() {
  const flux = [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  ]
  const offres = []
  for (const url of flux) {
    const xml = await getTexte(url, { headers: { Accept: 'application/rss+xml' } })
    for (const item of itemsRss(xml)) {
      const titreBrut = champRss(item, 'title')
      // WWR formate ses titres en "Entreprise: Intitule du poste".
      const [entreprise, ...reste] = titreBrut.split(':')
      const lien = champRss(item, 'link')
      offres.push(
        base({
          id: `wwr-${lien.split('/').pop()}`,
          source: 'We Work Remotely',
          titre: reste.join(':').trim() || titreBrut,
          entreprise: reste.length ? entreprise.trim() : 'Non communiquee',
          lieu: champRss(item, 'region') || 'Worldwide',
          url: lien,
          description: nettoyer(champRss(item, 'description')),
          datePublication: champRss(item, 'pubDate'),
          salaire: null,
          contrat: champRss(item, 'type') || null,
        }),
      )
    }
  }
  return offres
}

// ─── Arbeitnow ───────────────────────────────────────────────────────
async function arbeitnow() {
  const data = await getJson('https://www.arbeitnow.com/api/job-board-api')
  return (data?.data ?? [])
    .filter((j) => j.remote)
    .map((j) =>
      base({
        id: `arbeitnow-${j.slug}`,
        source: 'Arbeitnow',
        titre: j.title,
        entreprise: j.company_name,
        lieu: j.location || 'Europe',
        pays: 'Europe',
        url: j.url,
        description: nettoyer(j.description),
        datePublication: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
        salaire: null,
        contrat: liste(j.job_types).join(', ') || null,
        competences: liste(j.tags),
      }),
    )
}

// ─── Jobicy ──────────────────────────────────────────────────────────
async function jobicy() {
  const offres = []
  for (const industry of ['engineering', 'data-science']) {
    const data = await getJson(
      `https://jobicy.com/api/v2/remote-jobs?count=50&geo=anywhere&industry=${industry}`,
    )
    for (const j of data?.jobs ?? []) {
      offres.push(
        base({
          id: `jobicy-${j.id}`,
          source: 'Jobicy',
          titre: j.jobTitle,
          entreprise: j.companyName,
          lieu: j.jobGeo || 'Anywhere',
          url: j.url,
          description: nettoyer(j.jobDescription || j.jobExcerpt),
          datePublication: j.pubDate,
          salaire:
            j.annualSalaryMin && j.annualSalaryMax
              ? `${j.annualSalaryMin} - ${j.annualSalaryMax} ${j.salaryCurrency ?? ''}`.trim()
              : null,
          contrat: liste(j.jobType).join(', ') || null,
          competences: liste(j.jobIndustry),
        }),
      )
    }
  }
  return offres
}

// ─── Himalayas ───────────────────────────────────────────────────────
async function himalayas() {
  const data = await getJson('https://himalayas.app/jobs/api?limit=100')
  return (data?.jobs ?? []).map((j) =>
    base({
      id: `himalayas-${j.guid ?? j.title}-${j.companyName}`.replace(/\s+/g, '-').slice(0, 120),
      source: 'Himalayas',
      titre: j.title,
      entreprise: j.companyName,
      lieu: liste(j.locationRestrictions).join(', ') || 'Worldwide',
      url: j.applicationLink ?? j.guid,
      description: nettoyer(j.description),
      datePublication: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
      salaire: j.minSalary && j.maxSalary ? `${j.minSalary} - ${j.maxSalary} USD` : null,
      contrat: liste(j.employmentType).join(', ') || null,
      competences: liste(j.categories),
    }),
  )
}

// ─── Working Nomads ──────────────────────────────────────────────────
async function workingnomads() {
  const data = await getJson('https://www.workingnomads.com/api/exposed_jobs/')
  return (Array.isArray(data) ? data : []).map((j) =>
    base({
      id: `wn-${j.id ?? j.url}`,
      source: 'Working Nomads',
      titre: j.title,
      entreprise: j.company_name,
      lieu: j.location || 'Worldwide',
      url: j.url,
      description: nettoyer(j.description),
      datePublication: j.pub_date,
      salaire: null,
      contrat: null,
      competences: (j.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    }),
  )
}

const SOURCES = [
  ['Remotive', remotive],
  ['RemoteOK', remoteok],
  ['We Work Remotely', weworkremotely],
  ['Arbeitnow', arbeitnow],
  ['Jobicy', jobicy],
  ['Himalayas', himalayas],
  ['Working Nomads', workingnomads],
]

/** Interroge les 7 sources en parallele ; une source en panne n'arrete pas les autres. */
export async function chercher({ journal = console, rapport } = {}) {
  // Chaque source est chronometree separement : une panne doit pouvoir etre
  // attribuee a un fournisseur precis, pas au bloc "remote" dans son ensemble.
  const debuts = SOURCES.map(() => Date.now())
  const resultats = await Promise.allSettled(
    SOURCES.map(([, fn], i) => {
      debuts[i] = Date.now()
      return fn()
    }),
  )
  const offres = new Map()

  resultats.forEach((r, i) => {
    const nom = SOURCES[i][0]
    const ms = Date.now() - debuts[i]
    if (r.status === 'rejected') {
      journal.log(`  ${nom} : indisponible — ${r.reason.message}`)
      rapport?.enregistrer(nom, {
        etat: 'echec',
        offres: 0,
        ms,
        message: r.reason.message.slice(0, 300),
      })
      return
    }
    for (const o of r.value) if (!offres.has(o.id)) offres.set(o.id, o)
    rapport?.enregistrer(nom, {
      etat: r.value.length ? 'ok' : 'vide',
      offres: r.value.length,
      ms,
      message: r.value.length ? null : 'La source a répondu sans ramener aucune offre',
    })
    journal.log(`  ${nom} : ${r.value.length} offres`)
  })

  return [...offres.values()]
}
