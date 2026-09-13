# Staffig — Plan d'implémentation : écrans employé (/fr/worker)

Objectif : rendre l'espace employé plus attrayant et clarifier la logique Boîte / Horaire, **sans modifier le modèle de données ni les API existantes**. Tout se fait dans les composants front (React) et le CSS, en réutilisant les tokens déjà en place (`--paper`, `--moss`, `--terra`, `--sand`, `--ink-*`, `--r-md`, `--serif`, `--ui`).

Règles pour Claude Code :

- Avant chaque étape, lire les composants existants de l'écran concerné et lister les statuts réellement retournés par l'API (ne pas inventer de statuts).
- Une PR par étape, chacune testable seule. Aucune migration DB.
- Ne pas casser l'anglais : chaque nouveau libellé passe par le système i18n existant (FR + EN).
- Icônes en SVG inline (stroke, grille 24 px), pas d'emoji.
- Cibles tactiles ≥ 44 px.

---

## Étape 1 — Boîte : écran vide et en-tête (impact max, risque min)

**Supprimer l'onglet « Historique » de la Boîte.** La Boîte ne montre que les demandes actives (statut « à répondre »). Une fois répondue, la demande disparaît de la Boîte.

Remplacer la barre d'onglets `Actif 0 / Historique 30` par une ligne de section : libellé `À DÉCIDER` (11 px, majuscules, letter-spacing 0.1em, `--ink-3`) à gauche, compteur `N demande(s)` à droite, trait `--line` en dessous.

**Nouvel écran vide** (quand 0 demande active) :

- petite illustration SVG inline (enveloppe + coche verte), ~88×72 px ;
- titre serif 22 px : « Rien de nouveau pour l'instant » ;
- texte 14 px `--ink-2` : « Les demandes arrivent selon vos disponibilités. Plus elles sont à jour, plus vous recevez d'offres. » ;
- bouton primaire `--moss` (fond) / blanc, radius 12 px, hauteur 44 px : « Mettre à jour mes disponibilités » → route Disponibilités.

Garder le bandeau « Disponible aujourd'hui / Modifier » tel quel.

Vérification : 0 demande → écran vide ; ≥ 1 demande → liste actuelle inchangée. Aucune requête supplémentaire.

## Étape 2 — Boîte : carte « Prochain quart » + tuiles de stats

Ajouter sous le bandeau de disponibilité :

**Tuiles de stats** (grille 3 colonnes, gap 10 px, carte blanche, bordure `--line`, radius `--r-md`) :

1. heures cette semaine (somme des quarts confirmés + terminés de la semaine ISO courante) ;
2. quarts complétés (compte des quarts au statut « terminé », total) ;
3. fiabilité (%) — **optionnel** : n'implémenter que si l'API expose déjà présences/absences ; sinon omettre la tuile et passer la grille à 2 colonnes.

Chiffre en serif 26 px, libellé 11 px `--ink-3`.

**Carte « Prochain quart »** : premier quart confirmé à venir. Icône calendrier sur fond `--sand-soft`, libellé `PROCHAIN QUART`, nom de l'établissement 15 px medium, ligne `Sam. 12 sept. · 08:00 – 12:00 · Montréal` 13 px `--ink-2`, chevron à droite → route Horaire. Masquer la carte s'il n'y a aucun quart à venir.

Les calculs se font côté client à partir des données déjà chargées pour l'Horaire (réutiliser le même hook/fetch ; ne pas créer d'endpoint).

## Étape 3 — Horaire : structure « À venir / Terminés » et total du mois

En-tête : sur-titre `SEPTEMBRE 2026` (mois courant, localisé), titre serif « Vos *quarts* », et à droite le total d'heures du mois (serif 26 px) + « ce mois-ci ».

Section **À VENIR** (libellé + `N quarts · X h` à droite) :

- carte du prochain quart mise en évidence (bordure `--moss`) avec bloc date à gauche (jour abrégé + numéro en serif 22 px sur fond `--moss-soft`), établissement, `08:00 – 12:00 · 4,0 h`, adresse, badge `Confirmé` (`--moss-soft` / `--moss`) ;
- deux actions secondaires sous la carte : « Itinéraire » (lien maps avec l'adresse) et « Ajouter au calendrier » (fichier .ics généré côté client) — si l'adresse n'est pas dans les données, masquer « Itinéraire » ;
- quarts suivants en cartes standard (bloc date sur fond `--paper-2`).

Section **TERMINÉS** (+ « Voir tout ») : cartes compactes, bloc date gris, `21:06 – 21:12 · 0,1 h`, coche verte à droite. Limiter à 5, « Voir tout » déplie le reste.

Format des heures : virgule décimale en FR (`4,0 h`), point en EN.

## Étape 4 — Disponibilités : grille lisible

- Remplacer les deux boutons Disponible / Indisponible par un **segment control** (fond `--paper-2`, radius 12 px, option active fond `--moss` texte blanc avec point blanc).
- Navigation semaine : « 7 – 13 septembre » au lieu de `2026-09-07 → 2026-09-13`, et en dessous `N créneaux disponibles` en `--moss`.
- Cellules : cochée = fond `--moss` + crochet blanc ; libre = blanc bordure `--line` ; passée = fond `--paper-2` non cliquable. Jour courant : numéro dans une pastille `--terra`.
- Légende sous la grille (Disponible / Libre / Passé).
- Boutons côte à côte en bas : « Copier la semaine dernière » (secondaire) et « Enregistrer » (primaire `--moss`). Si la sauvegarde est déjà automatique, remplacer « Enregistrer » par un indicateur « Enregistré ✓ » discret.

## Étape 5 — Profil : libellés lisibles

- Mapper les codes de qualification (`ECE_LEVEL_1`, `TES`, …) vers des libellés FR/EN via un dictionnaire i18n ; afficher en badges (`--paper-2`, radius 999 px). Le code brut reste en fallback si une clé manque.
- Idem pour les villes si elles sont stockées en code.
- Permettre une photo de profil si l'API le supporte déjà ; sinon garder les initiales, mais varier la couleur de fond selon l'utilisateur (hash du nom → `--terra-soft` / `--moss-soft` / `--sand-soft`).

## Étape 6 — Polish transversal

**Règle de couleur (à appliquer sur tous les écrans).** Aujourd'hui tout est crème et gris ; seul le bandeau de disponibilité a de la couleur. Introduire une hiérarchie chromatique fixe, sans ajouter de nouvelles couleurs aux tokens :

- `--moss` / `--moss-soft` = positif et actif : quart confirmé, demande acceptée, créneau coché, onglet de nav actif, bouton primaire, chiffre de fiabilité.
- `--terra` / `--terra-soft` = attention et action requise : pastille de non-lus sur Alertes, jour courant, demande active à répondre (bordure de carte), avatar.
- `--sand` / `--sand-soft` = neutre-informatif : icône « Prochain quart », statut « pourvu par un autre ».
- `--paper-2` + `--ink-3` = passé et inactif : quarts terminés, créneaux passés, demandes expirées (opacité 0,7).
- Blanc + bordure `--line` = carte par défaut. Jamais deux cartes voisines sans au moins un élément coloré (badge, bloc date, icône).

Chaque statut affiché doit correspondre à une de ces quatre familles ; pas de statut en gris texte seul.

- Corriger l'horodatage relatif : « 11 y a 22 h » → « il y a 22 h » (vérifier la fonction de formatage relatif et la locale passée).
- Nav du bas : libellés 11 px, actif en `--moss` + poids 600, pastille `--terra` sur « Alertes » quand il y a des non-lues (réutiliser le compteur existant).
- Renommer « Disponibilités » en « Dispos » dans la nav si le libellé déborde sur petits écrans.
- Vérifier chaque écran à 375 px de large et en EN.

---

## Ordre et estimation

| Étape | Risque | Effort |
|---|---|---|
| 1. Boîte vide | très faible | petit |
| 2. Stats + prochain quart | faible (calculs client) | moyen |
| 3. Horaire | faible | moyen |
| 4. Disponibilités | faible | moyen |
| 5. Profil | très faible | petit |
| 6. Polish | très faible | petit |

Commencer par 1 et 5 (gains rapides), puis 2 → 3 → 4 → 6.

## Prompt de départ pour Claude Code

> Lis ce plan en entier. Commence par l'étape 1 uniquement. Avant de coder, montre-moi : (a) les fichiers que tu vas toucher, (b) la liste des statuts de demande que l'API retourne réellement, (c) la clé i18n existante pour les libellés de la Boîte. Ne modifie ni les modèles ni les endpoints. Une fois l'étape 1 validée, on passe à la suivante.
