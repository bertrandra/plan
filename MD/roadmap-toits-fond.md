# Roadmap — toits du voisinage en tâche de fond

Chantier ouvert en octobre 2026, à la demande de l'utilisateur. Les toits « automatiques » (estimés
d'après la BD TOPO) ne sont pas satisfaisants au-delà des quelques bâtiments relus sur le LiDAR HD à
l'import. Le but est une **couverture totale du voisinage**, lue en tâche de fond, sans bloquer le plan,
avec un affichage qui se complète au fil de la lecture.

Références : `MD/spec-toit-ign.md` §10 (lecture LiDAR), skill `toits` (règles, AE 101),
`app/toitsLidar.ts` (la lecture d'un bâtiment), `app/toitsFond.ts` (la file de fond).

## Décisions de l'utilisateur

- À la création et à l'actualisation, **30 bâtiments** au lieu de 150 sont lus avant l'ouverture du
  plan, les plus proches de la parcelle. Le reste est lu en tâche de fond.
- La lecture de fond procède **par lots**, et chaque bâtiment traité est **marqué**.
- La **couleur des murs** à partir des photos de rue (Panoramax) est **laissée de côté** pour l'instant.

## Étape 1 — fait (branche `claude/toits-fond`)

| Élément | Où | Détail |
|---|---|---|
| 30 bâtiments à l'import et à l'actualisation | `app/toitsLidar.ts` `MAX_BATIMENTS_LIDAR` | au lieu de 150 ; toujours dans `DELAI_TOITS_LIDAR_MS` = 20 s |
| Marque par bâtiment | `toitLidarLu` (`model/types.ts`), `VERSION_LECTURE_TOITS`, `toitLu()` | posée même sans mesure dessous ; pas posée si le service n'a pas répondu ; enregistrée (`io/serialisation.ts`) |
| Marque remise à zéro | `app/valeursParDefaut.ts`, `app/actualisationIgn.ts` | « Actualiser le projet », et tout contour de bâtiment relu par l'actualisation IGN |
| File de fond par lots | `app/toitsFond.ts` | lots de 12 (`LOT_TOITS_FOND`), 6 lectures à la fois, du plus proche au plus loin ; une pause entre deux bâtiments rend la main au navigateur |
| Lecture sur copies | `app/toitsFond.ts::reporter` | un résultat ne s'écrit que si le bâtiment est encore là, avec le même contour et le même toit. Un bâtiment déplacé, supprimé ou dont le toit a été saisi pendant la lecture n'est pas écrasé ; il est relu au lot suivant |
| Échec ou absence de mesure | `geo/mnh.ts::lireHauteursSousStrict` | un service qui ne répond pas fait échouer la lecture (le bâtiment reste à relire) ; « rien à lire ici » marque le bâtiment lu |
| Service muet | `app/toitsFond.ts` | après un lot sans aucune lecture, attente de 30 s ; après 3 lots muets d'affilée, arrêt jusqu'à la prochaine ouverture ou « Reprendre ». Un bâtiment refusé deux fois est laissé pour la séance. Sans dalle LiDAR sur le secteur : arrêt immédiat |
| Affichage progressif | `app/boot.ts` | chaque lot écrit redessine le plan ; la Vue 3D ouverte se rebâtit au plus toutes les 10 s |
| Progression | `core/lectureToits.ts`, `zones/BarreEtat.tsx` | « Toits LiDAR : 120 / 2 400 » dans la barre d'état, avec « (en pause) » ou « (service LiDAR muet) » |
| Suspendre / Reprendre | commande `projet.toitsFond` (`app/ecouteurs/toitsFond.ts`), menu Fichier | refusée en lecture seule, grisée quand il n'y a rien à lire |
| Lancement | `app/boot.ts` | à l'ouverture d'un projet, après un import JSON, après une actualisation ; jamais en lecture seule |
| Pas de lecture de fond | vitrine, plan témoin (`?temoin`), fumée et captures (`window.__sansToitsFond`, `scripts/captures.mjs`) | une lecture qui aboutirait changerait ce qu'elles mesurent |
| Historique | — | les écritures de fond ne passent pas par Ctrl+Z ; elles marquent le projet « à enregistrer » |

## Étape 2 — fait (branche `claude/toits-fond-suite`)

Les points 1 à 9 et 11 de la liste d'origine, plus les modes de diagnostic demandés en route.

### Mesure sur un grand voisinage (points 1 et 11)

Le Vésinet, 2 allée des Limites, voisinage étendu à 1 km : 3 773 parcelles, 5 240 bâtiments,
9 014 objets ; création du projet en 70 à 80 s. Script de mesure : un import par l'interface, puis
la progression relevée toutes les 15 s avec les longues tâches du navigateur (`PerformanceObserver`).

| | Avant (étape 1) | Après (étape 2) |
|---|---|---|
| Débit | 1,5 bâtiment/s (forme seule) | 2,5 bâtiments/s (forme **et** couleur) |
| À ~470 s | 678 bâtiments | 1 170 bâtiments |
| Plus longue tâche | 3 à 6 s à chaque lot | 70 à 300 ms ; ~1 s à chaque enregistrement automatique |
| Taille du projet | 9,2 Mo (2 850 bâtiments lus) | voir ci-dessous |

Cause des à-coups : chaque lot redessinait tout le plan (9 000 objets) et notifiait le magasin, qui
redessinait toutes les zones (l'explorateur et ses milliers de lignes). Pour 10 000 bâtiments (le
plafond du voisinage), compter environ 70 minutes de lecture.

### Ce qui a été fait

| Point | Où | Ce qui change |
|---|---|---|
| 2. Mise à jour partielle | `three/scene.ts::remplacerObjets3d`, `render/pipeline.ts::rendreObjets`, `app/boot.ts::redessinerObjets` | Seuls les bâtiments écrits se redessinent, sur le plan et dans la Vue 3D, sans la rebâtir. La progression est lue directement par la barre d'état et le menu (`useSyncExternalStore`). |
| 3. Enregistrer en cours de route | `app/toitsFond.ts`, `core/historique.ts::modifications`, `app/projet.ts::enregistrerSansBruit` | Enregistrement seul toutes les 5 minutes et à la fin, seulement si toutes les modifications en attente viennent de la lecture. Un refus (projet trop lourd) arrête les essais pour la séance. |
| 5. Calcul hors du fil principal | — | **Pas fait, pas nécessaire aujourd'hui.** Une fois le dessin partiel en place, plus aucune longue tâche ne dépasse 300 ms. À reprendre si un poste plus lent saccade. |
| 6. Couleur des toits en fond | `app/toitsFond.ts`, `render/couleurToitOrtho.ts` (lectures en parallèle) | Chaque lot lit la forme des toits qui n'en ont pas, puis la couleur de ceux qui n'en ont pas. Un toit sans couleur est « à lire » : aucune marque de plus. Sans dalle LiDAR, les couleurs se lisent quand même. |
| 7. Questions « à cheval » | `app/boot.ts` (`fin`) | Posées à la fin de la lecture. |
| 8. Bilan de fin | `app/toitsFond.ts::texteFinToitsFond` | « Toits du voisinage lus sur le LiDAR HD : 2 400 (…). 2 350 couleurs de toit lues sur la photo aérienne. » |
| 9. Relire après un changement de règle | skill `toits` §6 bis, test | Passer `VERSION_LECTURE_TOITS` : les bâtiments marqués d'une version plus ancienne sont relus. |
| Modes de diagnostic | `app/diagnostic.ts`, `?mode=devroof`, `?mode=devwall` | Bâtiments peints selon l'origine du toit ou des murs, sur le plan et dans la Vue 3D, avec une légende et des comptes dans la barre d'état. |
| Défaut corrigé | `app/toitsFond.ts::reporter` | Une couleur lue sans la forme s'écrit seule. Sinon le bâtiment repassait à chaque lot. |

### Taille du projet (point 4)

TAILLE_A_COMPLETER

## Reste à faire

1. **Taille du projet au-delà de quelques centaines de mètres** : voir la section précédente.
2. **Régler le débit** : `LOT_TOITS_FOND` (12) et `PARALLELE_TOITS_FOND` (6). Un lot attend son
   bâtiment le plus lent ; une file continue (sans lots) irait plus vite. À essayer après avoir vérifié
   les quotas de la Géoplateforme (erreurs 429).
3. **Couleur des murs (Panoramax)**, laissée de côté (décision de l'utilisateur). Limiter à environ
   500 m le jour où elle est reprise.
4. **Calcul hors du fil principal**, si un poste plus lent saccade (voir point 5 ci-dessus).

## Points de vigilance

- **AE 101 ne bouge pas** : la lecture de fond utilise la même chaîne que l'import
  (`toitsDepuisLidar`), sans règle nouvelle. Le script d'identité du skill `toits` le vérifie.
- **Mitoyens en fond** : ils sont reconnus par leur clé (`estMitoyen`), puisque le lot se lit sur
  des copies. Le calcul reste le calcul entier, grille gardée, comme à l'import.
- **Ctrl+Z** restaure un instantané d'avant une écriture de fond. Les bâtiments perdent alors leur
  marque et seront relus. Le coût est accepté pour l'instant.
