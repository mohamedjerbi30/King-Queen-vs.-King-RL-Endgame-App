# Mise à jour de la présentation « Basic Chess Endgame » — Session 4 : analyse critique et améliorations

> **À l'attention de Claude (claude.ai).** Je joins la présentation actuelle
> `Basic_Chess_Endgame_Restructured_Part1_2_3.pptx` (52 diapositives, numérotées
> 0 à 51 en bas à droite). Cette séance, le cours nous demande d'**analyser
> notre travail de la séance précédente, détecter les points d'amélioration, et
> mettre à jour la présentation et le projet**. Le projet (application Flask +
> React) a déjà été testé et amélioré ; ce document contient tout ce qu'il faut
> pour mettre la présentation à jour : les erreurs à corriger diapo par diapo,
> et une nouvelle Partie 4 à ajouter. **Tous les chiffres ci-dessous sont
> mesurés** (évaluation exacte ou exécution réelle) — ne pas en inventer d'autres.

---

## 0. Consignes générales

1. **Garder le design existant** : palette navy `#162A4B` / or `#CC8A2C` / crème
   `#F5EFE4` / cartes `#F2EADC` / vert sauge `#3C6B5C` + fond `#E8F1EC` pour les
   bandeaux « KEY RULE » / rouille `#B1503E` pour les erreurs. Même police, même
   pied de page « Basic Chess Endgame · Reinforcement Learning », même logo 4
   carrés en haut à droite, même surtitre en petites capitales or
   (ex. « SESSION 4 · AUDIT »).
2. **Réutiliser les gabarits existants** : cartes numérotées (cercles or), tableaux
   à en-tête navy, barres horizontales (comme diapo 28/45), bandeau « KEY RULE ».
3. **Langue des diapositives : anglais** (comme le reste du deck).
4. Les numéros de diapositives ci-dessous sont **ceux du pied de page** de la
   version actuelle (la couverture = 0).
5. Ne pas toucher aux parties non mentionnées.
6. À la fin : mettre à jour la diapo « Roadmap » Part 1 (item 5 « Part 2 ») si besoin,
   renuméroter, et vérifier qu'aucun texte ne déborde ni ne chevauche une forme.

---

## 1. Comment l'audit a été fait (à résumer dans une diapo)

- **Test complet de l'application** : 4 modes (Play, Explore Q-table, Live
  Training, Results Dashboard), API REST testée de bout en bout, parties
  complètes jouées automatiquement par l'agent DP (5/5 mats en 2 à 6 coups).
- **Évaluation exacte de politiques** (nouveau module `policy_eval.py`) : la même
  récurrence arrière que le solveur DP, mais en faisant la **moyenne** sur les
  coups de la politique au lieu du **max**. On obtient, sans bruit
  d'échantillonnage et sur les 144 508 positions de départ :
  - la valeur exacte vπ (retour moyen),
  - la probabilité de mat Pπ,
  - le nombre moyen de coups jusqu'au mat.

  Récurrence (h = coups restants, V₀ = −1, P₀ = 0) :
  `Vπ_h(s) = Σₐ π(a|s) · [ R(s,a) si terminal, sinon moyenne sur les réponses noires de (−0.01 + γ·Vπ_{h−1}(s′)) ou −1 si la dame est prise ]`
- **Re-calcul à la main** des formules et exemples des diapos.
- **Entraînements Monte Carlo réels** (jusqu'à 500 000 épisodes), chaque
  checkpoint évalué exactement.

---

## 2. Erreurs détectées dans la présentation actuelle → corrections

| Diapo | Ce qui est écrit | Problème | Correction à appliquer |
|---|---|---|---|
| **6** « How each piece moves » | « White queen … Nothing blocks it — only three pieces remain on the board. » | Faux : le **roi blanc bloque la dame** (et le roi noir arrête sa ligne). Le moteur le gère. | « Any number of squares along a rank, file, or diagonal — until it reaches the edge or another piece: its own king blocks it. » |
| **8** « How many states are there? » | 4ᵉ carte : « Valid, White to move — no game already over » | Le filtre réel est « **Black not in check** » (si Noir était en échec, ce serait à Noir de jouer). 223 944 − 144 508 = **79 436** positions retirées pour cette raison. | Sous-titre carte 4 : « Black not in check » ; ajouter une ligne : « minus 79,436 boards where Black would already be in check ». |
| **12** « Reward function » | La phrase « Equal magnitude for success and failure … » | **Chevauche le tableau** (rendu barré sur la dernière ligne). | Descendre la phrase sous le tableau (ou réduire la hauteur des lignes). |
| **13** « Why ±1 » | « π* is identical whether draws score 0, failures are graded (−0.5/−1), or the step cost is −0.05 — checked across all 144,508 starting positions. » | Affirmation **non reproduite** dans le projet actuel, et « identique » est fragile car π* a beaucoup d'égalités (ex. 6 coups ex-aequo depuis Kc6/Qe4 vs Ka8). | Adoucir : « The ranking of moves is driven by the terminal ±1; changing the failure grading or step cost mainly changes values, not which positions are winning. » (ou supprimer la carte). |
| **14** « Return and policy objective » | « Mate on White move 3 : **G₀ = 0.9701** = −0.01 − 0.99×0.01 + 0.99²×1 » | **Erreur de calcul** : −0.01 − 0.0099 + 0.9801 = **0.9602**. (Le second exemple, 0.8641, est juste.) | Remplacer 0.9701 par **0.9602**. |
| **19** « The Markov Decision Process » (schéma circulaire) | Les étiquettes « → approach / restrict », « ← bad move / escape »… | **Chevauchent les cercles** ; pas de flèches visibles. | Réduire les cercles, mettre de vraies flèches entre cercles avec les étiquettes au-dessus (avant, or) et en dessous (arrière, rouille). |
| **26** « How we computed π* » | « We iterate the Bellman optimality equation over every state **until values stop changing** » | Ce n'est pas de l'itération sur les valeurs jusqu'à convergence : le budget h fait partie de l'état, c'est un **MDP à horizon fini** résolu par **induction arrière en exactement 40 balayages** (h = 1…40, V₀ = −1). Conséquence : **π* dépend de h** (politique non stationnaire). | « Backward induction over the move budget: V₀ = −1, then one exact Bellman sweep per h = 1 … 40 over all 144,508 boards (≈3.99 M state-action pairs). No convergence test needed — exactly 40 sweeps. π* depends on the moves left h. » Temps réel : table de transitions ~2–3 min (une fois), induction ~20 s. |
| **27** « A Bellman backup, worked through » | Exemple abstrait (« suppose… v*(s) = 1 ») | Juste, mais purement hypothétique. | Ajouter un **exemple réel** : position **Kc6, Qe4 vs Ka8, h = 40** : v*(s) = **0.98** = −0.01 + 0.99 × 1 (mat forcé au 2ᵉ coup). **6 coups sur 31 sont à égalité** au maximum (Kb6, Kc7, Qb1, Qb4, Qe7, Qh7) ; le pire coup du roi (Kd5) vaut 0.9456. |
| **28** « π* compared with simpler policies » | « "Safe" random 15.9% » | **« Safe random » n'est défini nulle part.** On a retrouvé la définition exacte qui donne ces chiffres. | Ajouter sous le titre : « Safe random = play a mate-in-one if one exists, otherwise a uniformly random move that neither stalemates nor leaves the queen en prise. » Ajouter une coche « ✓ re-verified exactly » à côté des 6 chiffres (voir §3). |
| **29** « π* in action » | « π* chooses the best legal move » : **Qb5** depuis Kd4, Qb2 vs Kg8, puis mat Kf6/Qg7/Kh8 | **Faux** : depuis cette position, π* joue **Ke5** (q* = 0.9409). Qb5 n'est que **21ᵉ sur 26** (q* = 0.921). La séquence affichée est illustrative, pas jouée par π*. | Remplacer par une **vraie partie jouée par π*** (graine 0) : **1. Ke5** (q*=0.9409) … Kh7 **2. Kf6** (q*=0.9668) … Kh6 **3. Qh2#** (q*=1.0). Trois plateaux : départ (Kd4 Qb2 / Kg8), après 1. Ke5 Kh7, position finale (Kf6 Qh2 / Kh6). Si on garde Qb5 diapo 10 comme exemple d'*action légale*, préciser « (any legal move — not π*'s choice) ». |
| **36** « Prediction checked against an exact value » | Annonce la vérification **sans aucun chiffre** | Manque la preuve. | Ajouter un petit tableau (50 000 épisodes simulés chacun, départs uniformes, h = 40) : **Uniform random** : MC **−0.9778 ± 0.0009** vs exact **−0.9789** · **π*** : MC **0.9272 ± 0.0001** vs exact **0.9271**. Les deux sont dans ~1 erreur-type → simulateur et modèle DP concordent. |
| **44** « Learning curve » | Courbe « illustrative » partant de −0.3 à 10³ et ~0.6 à 10⁵ | **Trop optimiste** : la vraie courbe (mesurée, voir §4) est à −0.98 jusqu'à 10⁴ épisodes et à −0.26 à 10⁵. | Remplacer par le graphique réel du §4 (axe log), en gardant la ligne v* = 0.927 et le point final du rapport 0.9022 (100M) clairement marqué « report, 100M episodes ». |
| **45** « Final agent vs exact π* » | Titre sur 2 lignes | Le titre **chevauche la première barre**. | Raccourcir : « Final MC agent vs exact π* » + sous-titre « mean of 3 seeds, 100M episodes ». |
| **47** « Reading the learned Q-table » | Heatmap avec valeurs (0.81, 0.74, …) et mêmes colonnes « Ka1-b1, Qe4-e8… » pour tous les états | **Valeurs inventées** et colonnes impossibles (un même coup n'est pas légal dans 4 états différents). | Remplacer par des **vraies lignes de q*** (§5), ou indiquer clairement « illustrative » sur la diapo. Préciser aussi : le Q-table MC compte ~**499 000 entrées (état, coup)** pour 18 081 états représentatifs. |

---

## 3. Chiffres du rapport re-vérifiés exactement

Évaluation exacte sur les 144 508 positions, h = 40 (module `policy_eval.py`,
test automatique `backend/test_policy_eval.py`) :

| Politique | Taux de mat (rapport → exact) | Retour moyen (rapport → exact) | Coups jusqu'au mat |
|---|---|---|---|
| Uniform random | 1.2 % → **1.198 %** ✓ | −0.979 → **−0.9789** ✓ | 14.13 |
| Safe random | 15.9 % → **15.87 %** ✓ | −0.729 → **−0.7288** ✓ | 17.42 |
| π* (optimal) | 100 % → **100 %** ✓ | 0.927126 → **0.9271257** ✓ | 4.70 → **4.7046** ✓ |

Conclusion : **tous les chiffres DP et baselines sont confirmés**. Les résultats
MC à 100M épisodes (0.9022 ± 0.0008, 6.02 coups, > 99.99 %) n'ont pas pu être
re-mesurés (trop long en direct) — à présenter comme « reported, not re-run ».

---

## 4. Vraie courbe d'apprentissage + mini-ablation (nouvelles données)

Chaque point = **évaluation exacte de la politique gloutonne** (sans
exploration) sur les 144 508 positions. Graine 1, ε = 0.05 partout.

| Épisodes | α=0.01, Q0=+1 (**réglage du rapport**) | α=0.1, Q0=+1 | α=0.1, Q0=0 |
|---|---|---|---|
| 1 000 | −0.978 (1.2 % mats) | — | — |
| 3 000 | −0.977 (1.3 %) | — | — |
| 10 000 | −0.972 (1.6 %) | −0.972 (1.6 %) | −0.492 (29.5 %) |
| 30 000 | −0.842 (9.0 %) | −0.754 (14.0 %) | **+0.415 (81.9 %)** |
| 100 000 | −0.262 (41.8 %) | +0.258 (71.1 %) | +0.697 (97.4 %, 15.0 coups) |
| 300 000 | +0.162 (65.5 %) | **+0.784 (98.9 %, 11.5 coups)** | +0.757 (99.4 %, 13.5 coups) |
| 500 000 | **+0.685 (92.5 %, 10.6 coups)** | — | — |
| 100 M (rapport) | 0.9022 (> 99.99 %, 6.02 coups) | | |

Diagnostics supplémentaires à 500 000 épisodes (réglage du rapport) : **99.96 %**
des paires (état, coup) ont été essayées au moins une fois, mais l'agent ne joue
un coup **exactement optimal** que dans **15 %** des positions — il mate quand
même dans 92.5 % des cas, mais plus lentement (10.6 coups vs 4.70).

**Interprétation (à mettre sur la diapo)** :
- Avec **Q0 = +1** (optimiste) chaque coup jamais essayé vaut +1, donc l'agent
  glouton essaie systématiquement les coups nouveaux : il reste **quasi
  aléatoire** tant que chaque mauvais coup n'a pas été visité plusieurs fois.
  Avec α = 0.01, après n visites à retour ≈ −1 on a Q = −1 + 2·0.99ⁿ : il faut
  ~6 visites pour qu'un mauvais coup passe sous un bon coup (≈ 0.9). Avec ~499 000
  paires (état, coup), cela explique la longue phase plate.
- **α plus grand** (0.1) accélère fortement l'apprentissage précoce.
- **Q0 = 0** apprend le plus vite au début mais **explore moins** (seulement 77 %
  des paires essayées à 300k) et mate plus lentement (13.5 coups) : compromis
  exploration / vitesse — exactement ce que Q0 = +1 cherchait à éviter.
- Le choix du rapport (α = 0.01, Q0 = +1) est justifié **à 100M épisodes**
  (meilleure précision finale), pas pour une démo courte.

---

## 5. Données réelles pour la diapo Q-table (remplace les valeurs inventées)

q*(s, a) exacts à h = 40 :

- **Kc6, Qe4 vs Ka8** — v* = 0.9800, 31 coups légaux. Meilleurs (6 ex-aequo à
  0.9800) : Kb6, Kc7, Qb1, Qb4, Qe7, Qh7. Pires : Kc5 0.9553, Kd6 0.9553,
  Kd7 0.9553, Kd5 0.9456.
- **Kd4, Qb2 vs Kg8** — v* = 0.9409, 26 coups. Meilleurs : Ke5 0.9409, Qb7 0.9406,
  Qg2 0.9328, Kd5 0.9326, Ke4 0.9319. Pires : Qe2 0.9197, Ke3 0.9099, Kd3 0.9078,
  Kc3 0.9026. (Qb5 : 0.921, rang 21/26.)
- **Ke1, Qd1 vs Ke8** — v* = 0.8917, 21 coups. Meilleurs : Ke2 0.8917, Kf2 0.8917,
  Kd2 0.8903, Qe2 0.8780, Qd6 0.8765. **Pires : Qd8 −0.0551, Qd7 −0.0585** (la
  dame se met à portée du roi noir et peut être prise → chute brutale de valeur).

Suggestion de visuel : une heatmap 3 lignes (positions) × 5–6 coups chacune,
avec les **noms de coups propres à chaque ligne**, couleur sauge pour ≥ 0.9, or
entre 0 et 0.9, rouille < 0. Message clé : « Most moves are almost equally good —
a few blunders (hanging the queen) are catastrophic. »

---

## 6. NOUVELLE PARTIE 4 à ajouter (avant « References »)

Ajouter ~9 diapositives, même style. Contenu proposé :

### 4.0 — Roadmap « Part 4 — Reviewing our own work »
1. How we audited the project · 2. Errors we found and fixed · 3. Verifying every
number exactly · 4. What Monte Carlo really learns, and how fast · 5. Improving
the application · 6. Limits and next steps.

### 4.1 — « How we audited the project » (4 cartes numérotées)
1. **Test every mode of the app** — Play, Explore, Training, Dashboard; full games played by π*.
2. **Exact policy evaluation** — replace the DP's max by the policy's average: exact vπ, mate probability and moves-to-mate for *any* policy, no sampling noise.
3. **Re-derive every formula and example** in the deck by hand.
4. **Run real MC training** up to 500k episodes and evaluate each checkpoint exactly.

### 4.2 — « Errors we found in our own deck » (tableau)
Colonnes : Slide · What we claimed · What is true. Lignes (les plus parlantes) :
- Return example: G₀ = 0.9701 → **0.9602** (arithmetic slip).
- π* in action: « π* plays Qb5 » → **π* plays Ke5**; Qb5 ranks 21/26.
- How π* is computed: « iterate until convergence » → **40 backward-induction sweeps; π* depends on h**.
- Queen movement: « nothing blocks it » → **its own king blocks it**.
- « Safe random » undefined → **defined: mate-in-one if available, else random safe move**.
- Learning curve & Q-table heatmap were illustrative → **replaced by measured data**.
KEY RULE : « Every number on the remaining slides is now either exactly recomputed or measured. »

### 4.3 — « Exact policy evaluation » (méthode)
Formule de la récurrence (§1), schéma « DP solver: max over moves → π* » vs
« Policy evaluation: average over π(a|s) → vπ ». Une carte : « Same transition
table, ~16 s per policy for all 144,508 boards ».

### 4.4 — « Every headline number, re-verified » (tableau §3 avec coches ✓)
+ ligne MC prediction (§2, diapo 36). KEY RULE : « DP and baselines confirmed to the last digit quoted; MC 100M result reported, not re-run. »

### 4.5 — « The real learning curve » (graphique)
Courbe log-x des 3 séries du §4, ligne pointillée or v* = 0.927, point vert
0.9022 @ 100M (rapport). Carte à droite : « Flat for 10⁴ episodes, then climbs:
+0.685 and 92.5% mates at 500k. »

### 4.6 — « Why learning starts slowly: optimistic Q0 and small α » (ablation)
Tableau §4 condensé (30k / 100k / 300k) + 3 cartes : *Optimism forces exploration* ·
*Bigger α learns faster early* · *Q0 = 0 is fast but explores less, mates slower*.
KEY RULE : « Our report settings are right for 100M episodes, not for a 1-minute demo — we added a separate "Fast demo" preset. »

### 4.7 — « Mating ≠ playing optimally » (diagnostic MC à 500k)
Barres : Mate rate 92.5 % · Optimal move chosen 15 % · (state, move) pairs tried
99.96 % · Moves to mate 10.6 vs 4.70. Message : « The agent learns *a* winning
technique long before it learns *the fastest* one. »
Ajouter aussi la remarque de modélisation : **le Q-table MC est indexé par
(wK, wQ, bK) sans h** (états symétriques réduits), alors que la DP utilise
(wK, wQ, bK, h) — MC apprend donc une politique stationnaire, qui ne peut pas
adapter son jeu au budget restant ; c'est une des raisons de l'écart résiduel
(0.9022 vs 0.9271). Le Q-table contient ~499 000 entrées (état, coup).

### 4.8 — « What we improved in the application » (tableau avant → après)
| Before | After |
|---|---|
| Explore (DP) showed only the best move, no values | Every legal move's exact q*(s,a) drawn on the board; all tied optimal moves starred; mate/stalemate moves flagged |
| Default Explore position (Ka1, Qa7 vs Ka8) was illegal (Black in check) → error | Legal default (Kc6, Qe4 vs Ka8); clear messages for illegal positions; click-to-place pieces |
| Learned Q showed untried moves at Q0 = 1.0 with no warning | Visit count per move, "never tried" label, symmetry representative shown, note that MC ignores h |
| MC job id had to be copied by hand into Play/Explore | Job picker listing all training runs |
| Training chart = ε-greedy training return only (noisy, not comparable to v*) | + exact evaluation of the greedy policy (mean return, % of v*, mate rate, moves to mate, agreement with π*), automatic at the end of training |
| Only the report's slow settings → near-random agent in a live demo | "Report settings" and "Fast demo" presets |
| Dashboard numbers hard-coded from the report | Baselines and π* re-evaluated exactly on the server with ✓ / ≠ badges; real learning curves; DP-vs-MC table; "safe random" defined |
| Game board disappeared at game end | Final position kept, discounted return G shown live |
| MC training started from 143,636 boards (excluded 872 valid ones) | Starts sampled from the same 144,508 boards as the DP and the report |

### 4.9 — « Limits and next steps » (3–4 cartes)
1. **100M-episode result not reproducible live** (hours of compute) — the app shows up to 500k.
2. **Budget-aware MC**: add h (or h-buckets) to the Q-table key to close the gap with π*.
3. **GLIE / decaying ε and 1/N step sizes**, then compare with **TD methods (SARSA, Q-learning)** on the same exact benchmark.
4. **Deployment**: background threads and the ~360 MB DP cache don't fit a serverless host (Vercel) — needs a persistent server or a precomputed, compressed policy.

### Conclusion (mettre à jour la diapo 50 « What Session 3 establishes » ou ajouter « What Session 4 establishes »)
« We audited our own work with an exact evaluator: all DP and baseline figures
are confirmed; six slide-level errors were corrected (one arithmetic slip, one
wrong π* example, one mis-described algorithm, one rule error, one undefined
baseline, two illustrative figures); the real MC learning curve shows a long
optimistic-exploration phase, which we explain and illustrate with a small
ablation. The application now exposes exact q*, exact policy evaluation and a
reproducible verification of every number. »

### References (diapo 51) — ajouter
- « Exact policy evaluation and verification tests: backend/app/policy_eval.py, backend/test_policy_eval.py (this project, Session 4). »
- Sutton & Barto, *Reinforcement Learning: An Introduction*, 2nd ed., ch. 4 (DP / policy evaluation) and ch. 5 (Monte Carlo, optimistic initial values §2.6).

---

## 7. Résumé express pour l'oral (optionnel, notes du présentateur)

- DP = **planification** avec modèle complet → π* exact, référence.
- MC = **apprentissage** sans modèle, à partir de parties → approximation de π*.
- On a construit un **évaluateur exact** pour vérifier tous les chiffres, trouvé et
  corrigé nos erreurs, et mesuré la vraie dynamique d'apprentissage de MC.
