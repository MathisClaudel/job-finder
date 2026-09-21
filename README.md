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
npm run app
```

Ouvre **http://localhost:4317** : le poste de pilotage. Tout le suivi passe par là,
le CLI reste disponible pour les mêmes actions.

| Onglet | Ce qu'il sert à faire |
|---|---|
| **À faire** | Relances dues, candidatures inachevées, offres non triées. Le point d'entrée du matin. |
| **Tri** | Les offres neuves une par une, par score : garder / plus tard / écarter (touches 1, 2, 3). |
| **Kanban** | Les huit statuts en colonnes, cartes déplaçables à la souris. |
| **Tableau** | Recherche plein texte et tri par colonne sur les 48 offres. |

Les boutons de la barre lancent `search`, `sante`, `disponibilite`, `report` et
`build:extension`, et affichent leur sortie en direct.

### L'état des sources

En tête de l'onglet **À faire**, un bandeau donne le résultat de la dernière
recherche, source par source : combien d'offres chacune a ramené, laquelle est
tombée, laquelle a répondu sans rien ramener. Trois états au lieu de deux —
une source **muette** est signalée au même titre qu'une source **en panne**,
parce que c'est ainsi qu'Adzuna a renvoyé zéro offre pendant des semaines sans
que rien ne l'indique.

Le bandeau se met à jour à chaque **Chercher**. Le bouton **Vérifier les
sources** interroge les neuf sources sans rien écrire en base, pour diagnostiquer
sans polluer le suivi :

```powershell
npm run sante
```

Il sort en code 1 si une source est en panne, ce qui le rend utilisable dans une
tâche planifiée.

Cliquer une offre ouvre son détail : l'annonce nettoyée, le score décomposé en
intitulé / technique / contexte / pénalités, la checklist de candidature, la
lettre si elle existe dans `lettres/` — avec un bouton **Copier pour l'extension** —
et le journal horodaté auquel tu ajoutes tes notes.

Une relance est signalée au bout de 10 jours sans réponse, ou à la date que tu
poses toi-même dans le détail de l'offre.

L'application écrit directement dans `data/offres.json`. Elle n'écoute que
`127.0.0.1` : rien n'est exposé au réseau, aucune donnée ne quitte la machine.

### En ligne de commande

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

1. **Chercher** dans l'app → les nouvelles offres arrivent dans l'onglet Tri.
2. **Trier** la pile → ce que tu gardes passe en « à postuler » et apparaît dans À faire.
3. `npm run cv -- <id>` — génère le CV ciblé sur cette offre dans `cv/`.
4. Dans Claude Code : `/lettre <id>` — l'app affiche la commande prête à copier.
   La lettre écrite dans `lettres/` est rattachée à l'offre automatiquement, par
   son en-tête `id_offre`.
5. Depuis le détail de l'offre : **Copier pour l'extension**, puis remplir le
   formulaire ATS avec l'extension.
6. **Tu relis tout**, tu joins le CV, tu envoies.
7. Cocher « Candidature envoyée » dans la checklist : le statut bascule en
   « postulée » et le compteur de relance démarre.

---

## Le CV adaptatif

```bash
npm run cv -- ft-213TLVR          # ciblé sur une offre de la base
npm run cv -- --axe ia            # version générique, axe imposé
npm run cv -- ft-213TLVR --diff   # montre pourquoi chaque puce a été retenue
npm run cv -- ft-213TLVR --photo  # ajoute profil/photo.jpg

# Offre qui n'est pas en base : annonce collée, page d'un site non couvert
npm run cv -- --fichier cv/.offres/annonce.txt --entreprise "Neoxia"
cat annonce.txt | npm run cv -- --stdin
```

À chaque génération, la commande liste **ce que l'annonce demande et que le CV ne
dit pas**. C'est le seul endroit où le système te pose une question plutôt que de
décider : soit le fait existe et mérite une puce dans `cv.yaml`, soit il n'existe
pas et il ne doit pas apparaître. Rien n'est jamais ajouté automatiquement.

Sortie dans `cv/` (ignoré par git) : un `.pdf` imprimé automatiquement par Edge ou
Chrome en mode headless (bouton « Télécharger le PDF » dans l'app ; chemin forcé
via `JF_NAVIGATEUR`), le `.html` source, et un `.txt` pour les champs
« collez votre CV » des formulaires.

**Le générateur ne rédige rien.** Toutes les phrases sont écrites à la main dans
`profil/cv.yaml`, avec leurs axes et leurs mots-clés. Le ciblage ne fait que
choisir, ordonner et couper — même règle que la skill `/lettre` : rien ne sort
qui ne soit défendable en entretien. Pour enrichir le CV, on ajoute une puce au
YAML ; on ne touche pas au code.

Trois contraintes sont câblées dans le rendu :

- **Une seule colonne.** Un CV en deux colonnes se lit bien à l'œil mais sort
  entrelacé d'un extracteur de texte. Ici l'ordre du DOM est l'ordre de lecture,
  donc l'ordre que voit la machine. Le `.txt` généré permet de vérifier d'un coup
  d'œil ce qu'un ATS lit réellement.
- **Titres, listes et dates en clair** — `<h1>`/`<h2>`/`<ul>` réels, aucun tableau
  de mise en page, dates écrites « Sept. 2025 – Sept. 2026 », aucune information
  présente uniquement dans une image.
- **Une page.** Un témoin en bas à droite de l'écran affiche la marge restante ou
  le débordement ; il ne s'imprime pas.

---

## Le registre des candidatures

Avant de postuler, une seule question compte : *suis-je déjà passé par là ?*
`data/candidatures.json` y répond. Il recense tout ce que tu as envoyé, dans le
job-finder **ou ailleurs** — LinkedIn, site carrière, cooptation.

```bash
npm run candidatures                                         # le registre
npm run candidatures -- import "../Suivi candidature.md" --appliquer   # reprendre un suivi tenu à la main
npm run candidatures -- add "Safran" "Ingénieur IA" envoyee 21/09/2026
npm run candidatures -- sync                                 # rattrapage depuis la base d'offres
```

Dans l'application :

- **Chaque carte et chaque offre** portent le signal : `Déjà postulé` en rouge
  (même employeur, même poste), `Déjà candidat chez eux` en orange (autre poste),
  `Entreprise ciblée` en bleu (listée dans tes cibles, rien d'envoyé).
- **Garder** une offre déjà postulée, ou la marquer « Postulée », demande une
  confirmation explicite.
- **Passer une offre en « Postulée »** l'ajoute au registre, sans ressaisie ; les
  statuts suivants (relancée, entretien, refus) le mettent à jour.
- **L'onglet Candidatures** liste le registre, permet d'en changer l'état, et
  vérifie à la frappe une candidature trouvée hors du job-finder avant que tu
  cliques sur « Postuler ».

Le rapprochement réutilise les règles du dédoublonnage — « La Banque Postale » et
« Banque postale » sont le même employeur, « AI Engineer (H/F) » et « AI Engineer »
le même poste — et y ajoute une équivalence français/anglais : « Software
Engineer .Net Core » et « Ingénieur logiciel .NET CORE » sont le même poste.

Le registre est séparé de `data/offres.json` à dessein. Une candidature survit à
l'annonce, peut n'avoir aucune offre en base, et surtout : fusionner les deux
ferait **disparaître** la prochaine offre du même employeur au lieu de t'avertir.

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

## Les offres closes

Une annonce retirée reste dans la base : les sources cessent simplement de la
renvoyer, sans jamais dire qu'elle est fermée. Le lien ne se révèle mort qu'au
moment où tu cliques — trop tard.

**Chaque recherche vérifie donc les offres où le doute est réel** : celles que
tu suis (`à postuler`, `postulée`, `relancée`, `entretien`) et celles que la
dernière collecte n'a pas ramenées. Les offres contrôlées il y a moins de 12 h
sont sautées, les `écartée` ne sont jamais contrôlées.

```powershell
npm run disponibilite             # les offres où le doute est réel
npm run disponibilite -- --toutes # tout, sauf les écartées
npm run search -- --sans-verification
```

### Trois états, un seul chemin vers « close »

| État | Quand |
|---|---|
| **ouverte** | la fiche répond |
| **close** | signal explicite : 404, 410, ou le 204 de l'API France Travail |
| **indéterminée** | tout le reste — et l'offre reste affichée, sans marque |

La prudence n'est pas de principe, elle est mesurée : **We Work Remotely et
Himalayas répondent 403** à une requête programmatique, et un 429 ou un 5xx
signale un incident chez l'hébergeur. Conclure « close » sur ces réponses ferait
disparaître des offres vivantes — une erreur bien plus coûteuse qu'un lien mort
laissé en place.

Pour France Travail, la vérification passe par la **fiche officielle de l'offre**
(`/offres/{id}`), qui fait autorité : elle répond 204 quand l'annonce a été
retirée. Pour les autres sources, seul le statut HTTP du lien compte. Les
requêtes sont limitées à 4 en parallèle — ces services sont gratuits, rien ne
justifie de les marteler.

### Dans l'application

Les offres closes que tu suivais encore remontent en tête de **À faire**, avec
un bouton **Écarter**. Leurs cartes portent une étiquette `Close`, et leur
détail affiche quand et comment la fermeture a été constatée. Le bouton
**Vérifier les liens** relance le contrôle à la demande.

---

## Les noms d'employeur de France Travail

France Travail diffuse les offres d'un job-dating **sous le nom du stand** :
`Stand SFEIR` et non `SFEIR`. Ce n'est pas une erreur de collecte, c'est ce
que l'API renvoie. Mesuré sur 3028 offres réelles : les 53 libellés commençant
par `Stand` sont exactement les 53 offres dont la fiche entreprise mentionne
un job-dating. La corrélation étant parfaite, la règle est sûre.

`nettoyerEntreprise()`, dans `src/sources/france-travail.js` :

- retire le préfixe `Stand ` — `Stand SFEIR` → `SFEIR` ;
- remplace par `Non communiquee` les libellés qui ne désignent pas un
  employeur : le stand de France Travail lui-même, `FONCTIONS SUPPORTS`, un
  service RH. Mieux vaut « non communiqué », qui est vrai, qu'un nom faux qui
  fausserait en plus le dédoublonnage.

La liste `NON_EMPLOYEURS` est faite pour s'allonger au fil des cas rencontrés.

**La casse n'est pas touchée.** `KLANIK`, `THALES`, `SYNBOLI` s'écrivent
réellement en capitales ; deviner lesquelles « corriger » reviendrait à inventer.
Le dédoublonnage compare sans tenir compte de la casse, donc rien ne s'y perd.

### L'événement n'est pas jeté avec le préfixe

Une offre de job-dating ne se traite pas comme les autres : **on se présente au
stand**, on ne remplit pas un formulaire. Le connecteur reporte donc l'événement
dans un champ `evenement` (intitulé, lieu, date, lien), affiché en évidence
dans le détail de l'offre et signalé par une étiquette sur sa carte.

### Réparer ce qui est déjà stocké

```powershell
npm run reparer                   # simulation, n'écrit rien
npm run reparer -- --appliquer
```

`reparer` remet aussi en accord la clef et le champ `id` d'une offre quand ils
divergent — une offre introuvable par son identifiant n'est joignable ni par
l'interface ni par la vérification de disponibilité.

Cela dit, ce n'est utile qu'une fois. Depuis, **une offre déjà connue est
rafraîchie à chaque recherche** par sa propre source : titre, employeur,
description, événement sont repris de la collecte, tandis que le statut, les
notes, la checklist, la date de découverte et la lettre sont préservés. Une
amélioration des règles de nettoyage profite donc aux anciennes offres à la
recherche suivante, sans commande à lancer.

Le rafraîchissement n'accepte que la **même source** : une annonce vue ailleurs
n'est pas autorisée à remplacer un nom d'employeur correct par le sien.

---

## Les doublons entre sources

France Travail et Adzuna diffusent largement les mêmes annonces. Comparer les
libellés bruts ne suffit pas : la même offre s'appelle « Développeur C# .Net
(H/F) » chez l'un et « Développeur C# .Net » chez l'autre, l'employeur est
« Stand SFEIR » ici et « Sfeir » là.

`src/dedoublonnage.js` retire les marqueurs de genre (`(H/F)`, `F/H`,
`(F/H/NB)`, `m/w/d`), les mentions de catégorie des agrégateurs (`(IT)`,
`(CDI)`) et les formes juridiques, puis compare ce qui reste. Deux annonces
sont la même offre si **l'employeur est identifiable et identique** et si les
intitulés se recouvrent à 70 % ou plus.

Deux garde-fous contre les faux positifs :

- **Employeur non communiqué : aucun rapprochement.** Deux annonces anonymes au
  titre voisin sont, le plus souvent, deux entreprises différentes.
- **L'inclusion tolère un seul mot d'écart.** Sans cette borne, « Développeur
  .NET » absorbait « Concepteur Développeur .Net/Angular », qui est un autre
  poste dans une autre ville.

Mesuré sur 232 offres réelles : 38 doublons entre France Travail et Adzuna,
30 doublons internes à Adzuna, 3 internes à France Travail, aucun faux positif.
L'ancienne règle en attrapait 6.

Le dédoublonnage s'applique **pendant** la recherche, sur la base et sur le lot
en cours. Pour repasser la base existante au crible :

```powershell
npm run dedoublonner              # simulation, n'écrit rien
npm run dedoublonner -- --appliquer
```

L'offre conservée est celle qui porte le plus de suivi — statut avancé, notes,
checklist. Les notes de la doublonne sont reprises, et sa source est ajoutée à
`sourcesAlternatives`. Aucun travail de suivi n'est détruit.

**Limite connue :** deux postes réellement distincts, même intitulé, même
employeur, deux villes, seraient fusionnés. Le cas ne s'est pas présenté sur
l'échantillon, mais il existe.

---

## Ce que ce système ne fait pas, et pourquoi

**Il ne se connecte pas à LinkedIn, Indeed ou APEC.** Leurs CGU interdisent
explicitement le scraping et la candidature automatisée. Un compte détecté est
banni, ce qui coûterait bien plus cher que le temps gagné. Les 9 sources
utilisées ici exposent toutes une API publique ou un flux RSS **prévus pour cet
usage**.

**Il ne se connecte pas non plus à Meteojob.** Vérifié en septembre 2026 :
Meteojob n'expose ni API publique ni flux RSS, et son `robots.txt` interdit
`/api/`, `/jobsearch/api/` ainsi que toute URL à paramètres (`Disallow: /*?`) —
c'est-à-dire exactement les requêtes de recherche. Y accéder demanderait de
scraper contre une directive explicite. Ses offres remontent malgré tout, par
**Adzuna**, qui agrège une centaine de jobboards français dont Meteojob.

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
│   ├── cv.yaml              Banque de formulations ciblables du CV
│   └── reponses-ats.yaml    Réponses aux questions récurrentes
├── src/
│   ├── cli.js               Commandes
│   ├── serveur.js           Serveur local de l'application
│   ├── config.js            Chargement profil + .env
│   ├── scoring.js           Moteur de matching
│   ├── dedoublonnage.js     Reconnaissance d une meme offre entre sources
│   ├── sante.js             Etat des sources a chaque recherche
│   ├── disponibilite.js     Verification des offres encore ouvertes
│   ├── store.js             Persistance et suivi
│   ├── candidatures.js      Registre de ce qui a été envoyé, alerte de doublon
│   ├── report.js            Rapport HTML
│   ├── build-extension.js   profil.yaml → extension
│   ├── cv/                  Générateur de CV ciblé (ciblage + rendu)
│   └── sources/             9 connecteurs
├── app/                     Poste de pilotage (interface web locale)
├── extension/               Extension Chrome/Edge (MV3)
├── cv/                      CV générés — ignoré par git
├── lettres/                 Lettres générées
└── data/                    Base d'offres, registre des candidatures, rapport HTML
```

Les skills vivent à part, dans `Project/.claude/skills/`, pour que Claude Code les
trouve depuis la racine du projet : `lettre/SKILL.md` pour les lettres de
motivation, `cv/SKILL.md` pour le CV ciblé.
