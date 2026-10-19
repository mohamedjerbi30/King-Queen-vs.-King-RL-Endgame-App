# Audit UI/UX de l'application et plan d'amélioration

> **État (mise à jour) : P0 et P1 sont faits, ainsi que l'essentiel de P2 et une partie de P3.**
> - Bugs B1 à B7 corrigés.
> - Q-table en « mat en N », avec couleurs relatives, « ? », phrase de synthèse, exemples et vue Comparer.
> - Composants UI réutilisables dans `frontend/src/ui/`.
> - Sauvegarde dans le localStorage (préfixe `kqk.`, bouton « Reset saved data »).
> - Guide pas à pas sur chaque page : ouverture automatique à la première visite, bouton « ? Guide », option « à chaque ouverture ».
> - Contrôles de l'agent : ▶/⏸, coup suivant, indice, vitesse.
> - Barre de progression de l'entraînement, plateau responsive avec coordonnées, notation numérotée.
>
> **Reste à faire :** comparer deux entraînements sur un même graphique, et rejouer une partie terminée coup par coup.

**Comment le test a été fait.** L'application a été ouverte dans Microsoft Edge et pilotée automatiquement (Playwright) :
- les 4 onglets, sur grand écran (1440 px) et sur mobile (390 px) ;
- de vrais clics sur le plateau ;
- une partie humaine, une partie complète jouée par l'agent DP ;
- un entraînement Monte Carlo de 20 000 épisodes, réutilisé ensuite dans Explore et Play ;
- la surveillance des erreurs console et des erreurs HTTP.

Captures : [docs/ui-audit/](docs/ui-audit/).

---

## 1. Ce qui fonctionne

| Module | Résultat du test |
|---|---|
| Moteur d'échecs | Identique à la bibliothèque de référence `python-chess` sur les 144 508 positions (~4 M coups) |
| Play — humain | Sélection de la dame → 22 points de destination légaux ; « Suggest a move » répond (Qg6, 0.930) |
| Play — agent DP | Partie complète jouée seule : mat en 4 coups, G = 0.9406 |
| Play — agent MC | Avec un job entraîné : partie jouée jusqu'au mat, G = 0.6523 |
| Explore — DP | Valeurs exactes affichées, coups joués légalement, position illégale détectée (« Black is in check ») |
| Explore — MC | Valeurs apprises affichées, avec le nombre de visites |
| Live Training | 20 000 épisodes, courbe en direct, évaluation exacte automatique à la fin (mean return 0.194, 68.8 % de mats) |
| Results Dashboard | Graphiques et vérifications ✓ affichés, aucune erreur |

## 2. Ce qui ne fonctionne pas : bugs à corriger

| # | Gravité | Bug | Comment le reproduire |
|---|---|---|---|
| B1 | 🔴 | **Boucle infinie de requêtes en erreur.** En mode Agent avec la source « Trained (Monte Carlo) » et aucun job, la page renvoie `/api/agent_move` toutes les 400 ms. Elle reçoit une erreur 400 à chaque fois, indéfiniment. | Play → Agent → source Monte Carlo, sans avoir lancé d'entraînement |
| B2 | 🔴 | **Tout est perdu quand on change d'onglet.** La partie en cours, la position d'Explore et surtout l'affichage d'un entraînement en cours disparaissent. L'entraînement continue sur le serveur, mais l'onglet Training redevient vide. | Lancer un entraînement → aller sur Play → revenir sur Live Training |
| B3 | 🟠 | **Les valeurs MC affichent « 0.00 » pour les coups jamais essayés**, en orange comme une vraie valeur. On ne distingue pas « appris = 0 » de « aucune donnée ». | Explore → Learned Q → les tags orange « 0.00 » |
| B4 | 🟠 | **Le plateau a une largeur fixe de 420 px.** Sur téléphone, la page déborde horizontalement (480 px pour 390 px d'écran) dans Play et Explore. | Ouvrir sur mobile |
| B5 | 🟡 | **Dans la Q-table, tout se ressemble.** Depuis Kc6/Qe4 vs Ka8, les 31 coups valent entre 0.95 et 0.98 et sont tous verts. Le meilleur coup ne ressort pas. | Explore, position par défaut |
| B6 | 🟡 | **Étiquettes illisibles** sous le graphique « Mean return by policy » : les noms se chevauchent. | Dashboard |
| B7 | 🟡 | **Aucun message** dans Explore quand la source est « Learned Q » et qu'il n'existe aucun job : la liste reste simplement vide. | Explore → Learned Q, sans job |

## 3. Incohérences UI/UX constatées

**Plateau**
- Les numéros de rangées 1–8 n'existent pas : seules les colonnes a–h sont affichées. On ne peut pas lire « e4 » sur le plateau.
- La pièce sélectionnée n'est pas mise en évidence.
- La réponse du roi noir n'est pas surlignée : seul le coup blanc l'est.
- Le roi blanc et le roi noir se distinguent mal (♔ contour / ♚ plein, à petite taille).

**Notation incohérente selon l'endroit**
- Play (journal) : « White Q → g6 ».
- Explore : « ♕ → b4 ».
- Agent : « Q → g6 (value 0.930) ».
- Aucune numérotation des coups.

**Formulaires**
- Les champs texte d'Explore (bordure noire fine) ne ressemblent pas aux champs numériques (arrondis).
- Les listes déroulantes sont celles du navigateur, sans style.
- Les boutons radio « You / Agent » sont placés aux deux extrémités de la carte.

**Vocabulaire technique sans explication**
- Les termes « q(s,a) », « v\*(s) », « Bellman backup », « greedy », « ε-greedy », « symmetry class » apparaissent sans aide pour quelqu'un qui découvre l'app.
- La « value 0.930 » de la suggestion n'est pas expliquée.

**Contrôle de l'agent**
- L'agent joue à vitesse fixe.
- Il n'y a ni pause ni mode « coup par coup ».
- On ne voit pas pourquoi il choisit un coup.

**Mise en page**
- Grand vide sous le plateau dans Play.
- Colonnes inégales dans le Dashboard : le second graphique est écrasé.
- La légende des graphiques de Training et du Dashboard est en police plus grande que le reste.

**Accueil**
- Aucun écran ni texte d'accueil n'explique ce que l'on peut faire dans chaque onglet, ni dans quel ordre.

---

## 4. Pourquoi la Q-table est difficile à comprendre (et la solution)

La Q-table **fonctionne** : les valeurs sont justes et vérifiées. Le problème vient de la présentation, et il y a trois causes.

1. **Les nombres sont abstraits.** Personne ne sait spontanément ce que « 0.96 » veut dire.
2. **Ils sont presque tous identiques.** Dans une bonne position, presque tous les coups mènent au mat ; ils ne diffèrent que de 0.01 ou 0.02.
3. **Toutes les valeurs ≥ 0.8 ont la même couleur verte.** Les différences de 0.01–0.02 deviennent donc invisibles.

### Solution : traduire chaque valeur en « mat en N coups »

Avec nos récompenses, un mat au coup n vaut exactement **q = 2·0.99ⁿ⁻¹ − 1**. On peut donc inverser :
**N ≈ 1 + ln((q+1)/2) / ln(0.99)**

| q | Signification affichée |
|---|---|
| 1.00 | **Mat immédiat** |
| 0.98 | **Mat en 2** |
| 0.96 | **≈ mat en 3** |
| 0.94 | **≈ mat en 4** |
| ≤ 0 | **Gaffe** : risque de pat, de perte de la dame ou de manquer de coups |

Cette conversion a été vérifiée sur une vraie partie de π\*. Depuis Kd4/Qb2 vs Kg8, la valeur est v\* = 0.9409, soit « ≈ mat en 4 ». La partie réelle a duré 3 à 4 coups selon les réponses aléatoires du Noir.

Ce que ça change dans Explore :
- Sur le plateau, chaque case affiche **« M2 », « M3 »… au lieu de « 0.98 », « 0.96 »**.
- Les couleurs sont **relatives au meilleur coup** :
  - vert = optimal ;
  - jaune = 1 coup plus lent ;
  - orange = 2 ou plus ;
  - rouge = gaffe.
- La valeur brute q reste visible au survol et dans la liste.
- Une ligne de synthèse résume la position, par exemple : *« 6 coups forcent le mat en 2 ; les 25 autres sont 1 à 2 coups plus lents ; aucun n'est une gaffe. »*
- En mode MC, les coups jamais essayés s'affichent **« ? » en gris**, et non « 0.00 ».
- Une vue **« Comparer DP vs MC »** met côte à côte, pour la même position, la vraie valeur et la valeur apprise. C'est exactement l'idée centrale du projet.

---

## 5. Plan d'amélioration, par priorité

### P0 — Corriger les bugs (≈ ½ journée)
1. **B1** : arrêter l'auto-play à la première erreur. Désactiver l'option « Agent + Monte Carlo » tant qu'aucun job n'existe, avec le message « Entraînez d'abord un agent dans Live Training ».
2. **B2** : garder l'état entre les onglets, soit en laissant les 4 onglets montés (simplement masqués), soit avec un état global. Au retour dans Training, rattacher automatiquement le dernier job en cours.
3. **B3** : « ? » gris pour les coups jamais visités, et une légende qui l'explique.
4. **B4** : plateau responsive : `width: min(420px, 100vw − 32px)`, tailles en pourcentage.
5. **B6 / B7** : étiquettes d'axe inclinées ou raccourcies ; message « aucun job » dans Explore.

### P1 — Rendre la Q-table compréhensible (≈ 1 journée)
1. Afficher « Mat en N » et utiliser des couleurs relatives au meilleur coup (section 4).
2. Ajouter la ligne de synthèse en langage simple au-dessus de la liste.
3. Ajouter un mini-guide en 3 étapes en haut d'Explore :
   1. Placez ou jouez une position.
   2. Lisez la valeur de chaque coup.
   3. L'agent joue la plus grande.
4. Ajouter la vue « Comparer DP vs MC » : deux colonnes, avec l'écart pour chaque coup.
5. Ajouter quelques positions d'exemple prêtes à charger en un clic :
   - « Mat en 2 avec 6 coups équivalents » (Kc6/Qe4 vs Ka8) ;
   - « Piège : la dame peut être prise » (Ke1/Qd1 vs Ke8 : Qd7 et Qd8 sont des gaffes) ;
   - « Position de la diapo 29 » (Kd4/Qb2 vs Kg8).

### P2 — Cohérence visuelle (≈ 1 journée)
1. **Composant plateau commun** : coordonnées 1–8 et a–h, pièce sélectionnée entourée, dernier coup blanc **et** réponse noire surlignés (deux teintes), meilleure distinction blanc/noir.
2. **Une seule notation partout** : notation algébrique numérotée (« 1. Qg6 Kd8 2. Qf7 Kc8 … »), avec la même icône de pièce dans Play, Explore et l'agent.
3. **Un seul style de formulaire** : même champ, même liste déroulante stylée, groupes de boutons (segmented control) à la place des boutons radio dispersés.
4. **Mise en page** : grilles égales dans le Dashboard, pas de vide sous le plateau (déplacer le journal sous le plateau sur grand écran), même taille de police pour les légendes.
5. **Glossaire** : une petite icône « i » à côté de chaque terme technique (q, v\*, ε-greedy, symétrie…) avec une phrase d'explication.

### P3 — Une meilleure expérience (≈ 1–2 jours)
1. **Contrôles de l'agent** dans Play : ▶ / ⏸ / « coup suivant », curseur de vitesse.
2. **« Pourquoi ce coup ? »** : pendant que l'agent joue, afficher les 3 meilleurs coups et leur « mat en N ».
3. **Accueil** : une bannière d'introduction dans le premier onglet (« 1. Jouez → 2. Explorez les valeurs → 3. Entraînez un agent → 4. Comparez les résultats »).
4. **Training** : barre de progression, temps restant estimé, bouton « Comparer avec un autre run » (deux courbes superposées).
5. **Rejouer une partie** : parcourir les coups d'une partie terminée avec ← / →.

### Ordre conseillé
P0 → P1 → P2 → P3. Pour la présentation, **P0 + P1** suffisent : la Q-table devient lisible (« mat en N »), et l'app est stable pendant une démo en direct.

---

## 6. Recettes de test après correction

Chaque point se vérifie avec le même script Playwright, relancé après chaque étape :
- Play → Agent + MC sans job : aucune requête en boucle, message clair.
- Lancer un entraînement → changer d'onglet → revenir : la courbe est toujours là et continue.
- Explore (Kc6/Qe4 vs Ka8, DP) : 6 coups « M2 » en vert, les autres « M3 »/« M4 » en jaune ou orange.
- Explore MC : les coups jamais essayés affichent « ? ».
- Largeur 390 px : aucun défilement horizontal sur aucun onglet.
- Aucune erreur dans la console.
