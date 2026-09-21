/**
 * Etat de sante des sources d'offres.
 *
 * Une source peut tomber en panne sans rien casser : le connecteur attrape
 * l'erreur, la recherche continue, et la source disparait simplement des
 * resultats. C'est ainsi qu'Adzuna a renvoye zero offre pendant des semaines
 * sans que rien ne le signale.
 *
 * Ce module observe la recherche reelle plutot que de sonder les APIs a cote :
 * une sonde qui passe pendant que la vraie requete echoue ne prouve rien.
 */

/** Une source qui repond mais ne ramene jamais rien merite d'etre regardee. */
export const ETATS = {
  ok: { libelle: 'OK', gravite: 0 },
  vide: { libelle: 'Aucune offre', gravite: 1 },
  ignoree: { libelle: 'Ignorée', gravite: 1 },
  echec: { libelle: 'En panne', gravite: 2 },
}

export function creerRapport() {
  const sources = new Map()

  function enregistrer(nom, donnees) {
    sources.set(nom, { nom, ...donnees })
  }

  return {
    /**
     * Enveloppe l'appel reel d'une source et en deduit son etat.
     * `compter` extrait le nombre d'offres du resultat.
     */
    async mesurer(nom, appel, compter = (r) => r?.length ?? 0) {
      const debut = Date.now()
      try {
        const resultat = await appel()
        const offres = compter(resultat)
        enregistrer(nom, {
          etat: offres > 0 ? 'ok' : 'vide',
          offres,
          ms: Date.now() - debut,
          message: offres > 0 ? null : 'La source a répondu sans ramener aucune offre',
        })
        return resultat
      } catch (err) {
        enregistrer(nom, {
          etat: 'echec',
          offres: 0,
          ms: Date.now() - debut,
          message: err.message.slice(0, 300),
        })
        throw err
      }
    },

    /** Source volontairement non interrogee : cles absentes, profil incomplet. */
    ignorer(nom, raison) {
      enregistrer(nom, { etat: 'ignoree', offres: 0, ms: 0, message: raison })
    },

    enregistrer,

    /** Synthese destinee a l'interface et au stockage dans meta.sante. */
    synthese() {
      const liste = [...sources.values()].sort(
        (a, b) => ETATS[b.etat].gravite - ETATS[a.etat].gravite || a.nom.localeCompare(b.nom),
      )
      const compte = (e) => liste.filter((s) => s.etat === e).length
      return {
        date: new Date().toISOString(),
        sources: liste,
        total: liste.length,
        ok: compte('ok'),
        vides: compte('vide'),
        ignorees: compte('ignoree'),
        echecs: compte('echec'),
        offres: liste.reduce((n, s) => n + s.offres, 0),
        // Un echec est une panne ; une source muette est un avertissement.
        verdict: compte('echec') ? 'alerte' : compte('vide') || compte('ignoree') ? 'partiel' : 'sain',
      }
    },
  }
}

/** Rendu texte pour le CLI, aligne pour rester lisible dans un terminal. */
export function formaterSynthese(synthese, couleur = (s) => s) {
  const SYMBOLE = { ok: '✓', vide: '!', ignoree: '·', echec: '✗' }
  const lignes = synthese.sources.map((s) => {
    const detail = s.etat === 'ok' ? `${s.offres} offres` : ETATS[s.etat].libelle
    const duree = s.ms ? `${(s.ms / 1000).toFixed(1)}s` : ''
    return `  ${SYMBOLE[s.etat]} ${s.nom.padEnd(18)} ${detail.padEnd(14)} ${duree.padStart(6)}` +
      (s.message && s.etat !== 'ok' ? `\n      ${couleur(s.message)}` : '')
  })
  return lignes.join('\n')
}
