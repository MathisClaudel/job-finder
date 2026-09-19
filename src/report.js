import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, zoneLocale } from './config.js'
import { lire } from './store.js'

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function carte(o) {
  const ev = o.evaluation ?? {}
  const locale = ev.lieu?.categorie === 'local'
  const zone = locale ? 'local' : 'remote'
  const libelleZone = locale ? zoneLocale().ville : 'Remote'
  return `
  <article class="offre" data-verdict="${ev.verdict}" data-zone="${zone}" data-statut="${o.statut}">
    <div class="note ${ev.verdict}">${ev.note ?? 0}</div>
    <div class="corps">
      <h3><a href="${echapper(o.url)}" target="_blank" rel="noopener">${echapper(o.titre)}</a></h3>
      <p class="meta">
        <strong>${echapper(o.entreprise)}</strong>
        <span>${echapper(o.lieu)}</span>
        <span class="zone ${zone}">${echapper(libelleZone)}</span>
        <span>${echapper(o.source)}</span>
        ${o.salaire ? `<span class="salaire">${echapper(o.salaire)}</span>` : ''}
        ${o.statut !== 'nouveau' ? `<span class="statut">${echapper(o.statut)}</span>` : ''}
      </p>
      ${ev.atouts?.length ? `<p class="atouts">${ev.atouts.map((a) => `<span>${echapper(a)}</span>`).join('')}</p>` : ''}
      ${ev.reserves?.length ? `<p class="reserves">${ev.reserves.map((r) => `<span>${echapper(r)}</span>`).join('')}</p>` : ''}
      <p class="extrait">${echapper((o.description ?? '').slice(0, 260))}…</p>
      <p class="id">${echapper(o.id)}</p>
    </div>
  </article>`
}

export function genererRapport() {
  const base = lire()
  const offres = Object.values(base.offres)
    .filter((o) => o.statut !== 'ecartee')
    .sort((a, b) => (b.evaluation?.note ?? 0) - (a.evaluation?.note ?? 0))

  const compte = (f) => offres.filter(f).length

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offres — ${new Date().toLocaleDateString('fr-FR')}</title>
<style>
  :root { color-scheme: light dark; --fond:#fbfbfa; --carte:#fff; --texte:#1d1c1a; --doux:#6b6862; --trait:#e6e3dd;
          --vert:#1a7f5a; --jaune:#a3701a; --gris:#8a8781; --accent:#2a5ca8; }
  @media (prefers-color-scheme: dark) {
    :root { --fond:#16161a; --carte:#1e1e23; --texte:#eceae6; --doux:#9b978f; --trait:#32323a;
            --vert:#4fc99a; --jaune:#e0b055; --gris:#777; --accent:#7aa7e8; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; background:var(--fond); color:var(--texte);
         font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .conteneur { max-width: 940px; margin: 0 auto; }
  h1 { font-size:1.5rem; margin:0 0 4px; }
  .sous { color:var(--doux); margin:0 0 24px; font-size:.9rem; }
  .filtres { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; position:sticky; top:0;
             background:var(--fond); padding:12px 0; border-bottom:1px solid var(--trait); z-index:2; }
  .filtres button { font:inherit; font-size:.85rem; padding:6px 14px; border-radius:999px; cursor:pointer;
                    border:1px solid var(--trait); background:var(--carte); color:var(--texte); }
  .filtres button[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:#fff; }
  .offre { display:flex; gap:16px; background:var(--carte); border:1px solid var(--trait);
           border-radius:12px; padding:16px; margin-bottom:12px; }
  .offre[hidden] { display:none; }
  .note { flex:0 0 46px; height:46px; border-radius:10px; display:grid; place-items:center;
          font-weight:700; font-size:1.05rem; color:#fff; }
  .note.prioritaire { background:var(--vert); } .note.a-etudier { background:var(--jaune); }
  .note.faible { background:var(--gris); }
  .corps { min-width:0; flex:1; }
  h3 { margin:0 0 6px; font-size:1.02rem; line-height:1.35; }
  h3 a { color:inherit; text-decoration:none; } h3 a:hover { text-decoration:underline; }
  .meta { margin:0 0 8px; color:var(--doux); font-size:.85rem; display:flex; flex-wrap:wrap; gap:4px 12px; }
  .meta .zone.local { color:var(--accent); font-weight:600; }
  .meta .statut { color:var(--jaune); font-weight:600; text-transform:uppercase; font-size:.75rem; letter-spacing:.04em; }
  .atouts, .reserves { margin:0 0 8px; display:flex; flex-wrap:wrap; gap:6px; }
  .atouts span, .reserves span { font-size:.78rem; padding:2px 9px; border-radius:6px; }
  .atouts span { background:color-mix(in srgb, var(--vert) 14%, transparent); color:var(--vert); }
  .reserves span { background:color-mix(in srgb, var(--jaune) 16%, transparent); color:var(--jaune); }
  .extrait { margin:0 0 6px; color:var(--doux); font-size:.86rem; }
  .id { margin:0; font-family:ui-monospace,monospace; font-size:.72rem; color:var(--gris); }
</style></head>
<body><div class="conteneur">
  <h1>Offres retenues</h1>
  <p class="sous">${offres.length} offres · ${compte((o) => o.evaluation?.lieu?.categorie === 'local')} sur ${echapper(zoneLocale().ville)} ·
     ${compte((o) => o.evaluation?.lieu?.categorie === 'remote')} en remote ·
     ${compte((o) => o.statut === 'postulee')} candidatures envoyees ·
     derniere recherche ${(base.meta?.derniereRecherche ?? '').slice(0, 16).replace('T', ' ')}</p>

  <div class="filtres">
    <button data-f="tout" aria-pressed="true">Tout</button>
    <button data-f="prioritaire">Prioritaires</button>
    <button data-f="local">${echapper(zoneLocale().ville)}</button>
    <button data-f="remote">Remote</button>
    <button data-f="nouveau">Non traitees</button>
  </div>

  ${offres.map(carte).join('')}
</div>
<script>
  const boutons = [...document.querySelectorAll('.filtres button')]
  const offres = [...document.querySelectorAll('.offre')]
  boutons.forEach((b) => b.addEventListener('click', () => {
    boutons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    const f = b.dataset.f
    offres.forEach((o) => {
      o.hidden = !(f === 'tout'
        || o.dataset.verdict === f
        || o.dataset.zone === f
        || o.dataset.statut === f)
    })
  }))
</script>
</body></html>`

  mkdirSync(join(ROOT, 'data'), { recursive: true })
  const chemin = join(ROOT, 'data', 'offres.html')
  writeFileSync(chemin, html, 'utf8')
  console.log(`\n  Rapport genere : ${chemin}\n  Ouvre-le dans ton navigateur.\n`)
}
