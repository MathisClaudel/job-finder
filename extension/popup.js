const $ = (s) => document.querySelector(s)

// ─── La lettre en cours est conservee entre deux ouvertures ────────
chrome.storage.local.get(['lettre'], ({ lettre }) => {
  if (lettre) {
    $('#lettre').value = lettre
    $('#bloc-lettre').open = true
  }
})
$('#lettre').addEventListener('input', (e) => {
  chrome.storage.local.set({ lettre: e.target.value })
})
$('#vider-lettre').addEventListener('click', () => {
  $('#lettre').value = ''
  chrome.storage.local.remove('lettre')
})

// ─── Champs copiables : utile pour les ATS exotiques ───────────────
const liste = $('#liste-champs')
for (const [cle, valeur] of Object.entries(JF_VALEURS)) {
  if (!valeur) continue
  const b = document.createElement('button')
  b.innerHTML = `<span class="cle"></span><span class="val"></span>`
  b.querySelector('.cle').textContent = cle
  b.querySelector('.val').textContent = valeur
  b.title = valeur
  b.addEventListener('click', async () => {
    await navigator.clipboard.writeText(valeur)
    const original = b.querySelector('.val').textContent
    b.querySelector('.val').textContent = 'copié'
    setTimeout(() => (b.querySelector('.val').textContent = original), 900)
  })
  liste.append(b)
}

// ─── Declenchement ─────────────────────────────────────────────────
$('#remplir').addEventListener('click', async () => {
  const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })
  const boite = $('#resultat')

  let total = 0
  let fichiers = 0
  const details = []

  // Un formulaire ATS vit souvent dans une iframe : on interroge tous les cadres.
  const cadres = await chrome.webNavigation?.getAllFrames?.({ tabId: onglet.id }).catch(() => null)
  const cibles = cadres ? cadres.map((f) => f.frameId) : [0]

  for (const frameId of cibles) {
    try {
      const rep = await chrome.tabs.sendMessage(
        onglet.id,
        {
          action: 'remplir',
          options: { ecraser: $('#ecraser').checked, lettre: $('#lettre').value },
        },
        { frameId },
      )
      if (!rep) continue
      total += rep.rempli
      fichiers += rep.fichiers
      details.push(...rep.journal)
    } catch {
      // Cadre sans script de contenu (cross-origin bloque) : on ignore.
    }
  }

  boite.className = 'visible'
  if (total === 0) {
    boite.innerHTML = `
      <div class="titre" style="color:var(--jaune)">Aucun champ reconnu</div>
      <p style="margin:0;color:var(--doux)">
        Cet ATS utilise des libellés inhabituels. Utilise « Copier un champ à la main »,
        puis ajoute les libellés rencontrés dans <code>profil/reponses-ats.yaml</code>
        pour que ce soit automatique la prochaine fois.
      </p>`
    return
  }

  boite.innerHTML = `
    <div class="titre">${total} champ${total > 1 ? 's' : ''} rempli${total > 1 ? 's' : ''}</div>
    <ul>${details.slice(0, 14).map((d) => `<li>${d.champ}</li>`).join('')}</ul>
    ${fichiers ? `<p class="alerte">${fichiers} champ${fichiers > 1 ? 's' : ''} de fichier à remplir à la main (CV, portfolio) — les navigateurs interdisent l'envoi automatique.</p>` : ''}
    <p class="alerte">Relis chaque champ avant d'envoyer.</p>`
})
