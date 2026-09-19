# Job Finder

Trois systèmes qui partagent une seule source de vérité : `profil/profil.yaml`.

1. **Recherche d'offres** — agrège 9 plateformes, score chaque offre contre ton profil, suit tes candidatures.
2. **Remplissage de formulaires** — extension navigateur qui pré-remplit les ATS depuis ton profil.
3. **Lettres de motivation** — skill `/lettre` dans Claude Code, nourrie par tes anecdotes réelles.

---

## Installation (une fois)

```powershell
git clone https://github.com/<compte>/job-finder.git
cd job-finder
npm install
```

### 1. Compléter le profil

```powershell
copy profil\profil.example.yaml profil\profil.yaml
copy profil\histoires.example.yaml profil\histoires.yaml
copy profil\reponses-ats.example.yaml profil\reponses-ats.yaml
```

Remplis ensuite `profil/profil.yaml`. Les champs les plus bloquants :
`telephone`, `linkedin`, `salaire.brut_annuel_cible`, `permis_b`. Sans eux,
l'extension laissera ces champs vides sur chaque formulaire.

La zone de recherche se définit entièrement ici, sous
`recherche.localisation.presentiel` : `ville_cible`, `code_insee` (indispensable
pour l'API France Travail), `rayon_km` et `villes_incluses` — cette dernière liste
sert à reconnaître qu'une offre est « sur zone ». Aucune ville n'est codée en dur
dans le code.

Relis aussi `profil/reponses-ats.yaml` : ce sont **tes** mots qui partiront.

> Les trois fichiers `profil/*.yaml` sont ignorés par git. Seuls les gabarits
> `*.example.yaml` sont versionnés : rien de personnel ne peut partir dans le dépôt.

### 2. Obtenir les clés API (5 minutes, gratuit)

```powershell
copy .env.example .env
```

| Service | Où | Ce que ça apporte |
|---|---|---|
| France Travail | [francetravail.io](https://francetravail.io) → créer une appli → s'abonner à « Offres d'emploi v2 » | Le gros du marché local |
| Adzuna | [developer.adzuna.com](https://developer.adzuna.com/) | Complément local + agrégation |

Les 7 sources remote (Remotive, RemoteOK, We Work Remotely, Arbeitnow, Jobicy,
Himalayas, Working Nomads) fonctionnent sans clé.

### 3. Installer l'extension

```powershell
npm run build:extension
```

Puis dans Chrome ou Edge :
`chrome://extensions` → activer **Mode développeur** → **Charger l'extension non empaquetée**
→ choisir le dossier `extension/`.

Épingle-la dans la barre d'outils. **Relance `npm run build:extension` après chaque
modification du profil**, sinon l'extension utilisera les anciennes valeurs.

---

## Usage quotidien

```powershell
npm run search                        # interroge les 9 sources, met la base à jour
npm run report                        # génère data/offres.html, filtrable
npm run show -- wwr-sticker-mule-ai   # détail d'une offre
npm run status -- <id> postulee       # suivi
node src/cli.js stats                 # tableau de bord
```

Statuts disponibles : `nouveau`, `a-postuler`, `postulee`, `relancee`, `entretien`,
`refus`, `ecartee`, `acceptee`.

### Le cycle complet pour une candidature

1. `npm run search` puis `npm run report` → tu repères une offre.
2. Dans Claude Code : `/lettre <id-de-l-offre>` → la lettre est écrite et sauvée dans `lettres/`.
3. Tu copies la lettre dans l'extension (bouton **Lettre de motivation à coller**).
4. Tu ouvres le formulaire de candidature, tu cliques sur l'extension → **Remplir le formulaire**.
5. **Tu relis tout**, tu joins ton CV à la main, tu envoies.
6. `npm run status -- <id> postulee`

---

## Comment fonctionne le score

Chaque offre est notée sur 100, en trois blocs plafonnés plus des pénalités :

| Bloc | Max | Ce qu'il mesure |
|---|---|---|
| Intitulé | 45 | Le poste correspond-il à IA / .NET / Data — les trois familles ciblées |
| Technique | 35 | Compétences réellement détenues, **plafonné** |
| Contexte | 20 | Zone de recherche, ouverture aux juniors, secteur connu |
| Pénalités | — | Senior/lead, stage, freelance, habilitation, place de marché |

Le plafond technique est ce qui empêche une annonce passe-partout citant toutes
les technos du marché de sortir devant une offre réellement ciblée.

**Verdicts :** ≥ 60 prioritaire, ≥ 40 à étudier, en dessous faible.

### Ajuster le score

Tout est dans `src/scoring.js`, en haut du fichier :

- `FAMILLES_POSTE` — élargir ou restreindre les intitulés visés
- `COMPETENCES` — ajouter une techno et son poids
- `INTERMEDIAIRES` — bloquer une place de marché supplémentaire
- `PAYS_OFFSHORE` — pays dont les offres « remote » sont en réalité réservées
Le périmètre géographique, lui, ne se règle pas ici mais dans
`profil/profil.yaml` (`villes_incluses`).

---

## Quand l'extension ne reconnaît pas un champ

Chaque ATS nomme ses champs à sa façon. Si un formulaire résiste :

1. Ouvre le popup → **Copier un champ à la main** pour débloquer la candidature.
2. Note le libellé exact du champ récalcitrant.
3. Ajoute-le dans `profil/reponses-ats.yaml`, section `alias_champs`, ou
   directement dans `REGLES` de `extension/content.js`.
4. `npm run build:extension`, puis recharge l'extension dans `chrome://extensions`.

Le champ sera reconnu automatiquement la fois suivante.

**Limite incontournable :** les navigateurs interdisent à toute extension de
remplir un champ de type fichier. L'envoi du CV reste manuel, toujours.

---

## Ce que ce système ne fait pas, et pourquoi

**Il ne se connecte pas à LinkedIn, Indeed ou APEC.** Leurs CGU interdisent
explicitement le scraping et la candidature automatisée. Un compte détecté est
banni, ce qui coûterait bien plus cher que le temps gagné. Les 9 sources
utilisées ici exposent toutes une API publique ou un flux RSS **prévus pour cet
usage**.

**Il ne soumet jamais un formulaire à ta place.** L'extension pré-remplit, tu
relis, tu cliques. C'est exactement le modèle d'un gestionnaire de mots de passe :
rien ne part sans une action humaine. C'est aussi ce qui la rend indétectable,
puisqu'il n'y a rien d'anormal à détecter.

**Il n'invente jamais un fait.** La skill `/lettre` refuse de revendiquer une
compétence absente de `profil.yaml`. Une lettre qui ment est démasquée au premier
entretien technique.

---

## Structure

```
2-Job_finder/
├── profil/                  Données personnelles — ignoré par git
│   ├── *.example.yaml       Gabarits versionnés, à copier sans le suffixe
│   ├── profil.yaml          Source de vérité — identité, zone, parcours
│   ├── histoires.yaml       Anecdotes STAR, matière première des lettres
│   └── reponses-ats.yaml    Réponses aux questions récurrentes
├── src/
│   ├── cli.js               Commandes
│   ├── config.js            Chargement profil + .env
│   ├── scoring.js           Moteur de matching
│   ├── store.js             Persistance et suivi
│   ├── report.js            Rapport HTML
│   ├── build-extension.js   profil.yaml → extension
│   └── sources/             9 connecteurs
├── extension/               Extension Chrome/Edge (MV3)
├── lettres/                 Lettres générées
└── data/                    Base d'offres + rapport HTML
```

La skill de rédaction vit à part, dans `Project/.claude/skills/lettre/SKILL.md`,
pour que Claude Code la trouve depuis la racine du projet.
