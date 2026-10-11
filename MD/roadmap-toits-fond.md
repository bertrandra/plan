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

## Reste à faire

Classé par ordre de priorité proposé.

1. **Mesurer sur un grand voisinage** (1 à 5 km : Le Vésinet, Gordes).
   - Première mesure, sur le plan de démonstration (Le Vésinet, 57 bâtiments, octobre 2026) : tout
     est lu en une douzaine de secondes, soit environ 8 bâtiments par seconde. Cela donne une
     vingtaine de minutes pour 10 000 bâtiments, si le débit tient.
   - À vérifier sur des milliers de bâtiments : le débit soutenu, le comportement de la Géoplateforme
     (quotas, erreurs 429) et la fluidité du plan pendant la lecture.
   - À ajuster ensuite : `LOT_TOITS_FOND`, `PARALLELE_TOITS_FOND`, l'attente après échec.
2. **Mise à jour partielle de la Vue 3D**. Aujourd'hui, la scène se rebâtit en entier, au plus toutes
   les 10 s. Avec des milliers de bâtiments, chaque reconstruction fige l'écran une à deux secondes.
   Il faut ne remplacer que les maillages des bâtiments lus, par leur clé (`three/scene.ts`).
3. **Enregistrer en cours de route**, pour que la reprise après fermeture ne relise pas tout.
   - Aujourd'hui, le projet est seulement marqué « à enregistrer ».
   - Piste : un enregistrement automatique en fin de lecture, ou tous les N lots, si le projet est
     sur la plateforme et n'a pas d'autre modification en attente.
4. **Taille du projet**. Les corps d'un toit pèsent environ 0,5 Ko par bâtiment, soit environ 5 Mo
   pour 10 000 bâtiments, ce qui risque `PAYLOAD_TOO_LARGE`.
   - Piste : compacter `corpsToit` à l'écriture (arrondis au centimètre, champs par défaut omis),
     comme le relief (`compacterRelief`).
   - À vérifier : la limite de la plateforme avec un voisinage complet.
5. **Calcul hors du fil principal**. `reconstruireCorps` coûte de quelques à quelques dizaines de ms
   par bâtiment. Si le plan saccade pendant la lecture, il faut passer le calcul dans un Web Worker.
   La lecture réseau peut rester où elle est.
6. **Couleur des toits sur l'orthophoto en tâche de fond**.
   - Aujourd'hui, `couleursToitsDepuisOrtho` lit tout à l'import, dans un délai de 20 s, et
     n'aboutit pas pour tout un voisinage de plusieurs kilomètres.
   - À faire : même file, même marque (par exemple `couleurToitLue`), tuiles d'un niveau de détail
     moyen partagées entre bâtiments (estimation : 5 à 10 min pour 10 000 bâtiments).
7. **Questions « à cheval »** nées d'un lot de fond. Un bâtiment mitoyen lu en fond peut créer un
   doute (`toitACheval`), mais la question n'est posée qu'à l'ouverture, à l'import et à
   l'actualisation. Les mitoyens sont presque toujours parmi les 30 premiers. Sinon, appeler
   `questionsACheval` à la fin de la lecture.
8. **Bilan de fin**. Un toast du type « 2 400 toits lus sur le LiDAR, 120 gardés d'après la BD TOPO ».
   Il réutilise `texteBilanToitsLidar`, avec un bilan cumulé sur les lots.
9. **Relire après un changement de règle**. Passer `VERSION_LECTURE_TOITS` quand une règle de toit
   change assez pour mériter de tout relire. La file reprend alors seule les bâtiments marqués avec
   une version plus ancienne. À documenter dans le skill `toits`.
10. **Couleur des murs (Panoramax)**, laissée de côté pour l'instant (décision de l'utilisateur).
    - Une recherche et deux photos par bâtiment, seulement là où des photos existent.
    - Pour 10 000 bâtiments, cela représenterait des heures et plusieurs Go.
    - Quand elle sera reprise : la limiter à environ 500 m (1 000 bâtiments, 15 à 30 min), avec la
      même file et une marque à part.
11. **Plafond du voisinage**. La PR qui relève le plafond à 10 000 objets par famille augmente
    d'autant le travail de la file. Vérifier ensemble le temps de lecture et la taille du projet.

## Points de vigilance

- **AE 101 ne bouge pas** : la lecture de fond utilise la même chaîne que l'import
  (`toitsDepuisLidar`), sans règle nouvelle. Le script d'identité du skill `toits` le vérifie.
- **Mitoyens en fond** : ils sont reconnus par leur clé (`estMitoyen`), puisque le lot se lit sur
  des copies. Le calcul reste le calcul entier, grille gardée, comme à l'import.
- **Ctrl+Z** restaure un instantané d'avant une écriture de fond. Les bâtiments perdent alors leur
  marque et seront relus. Le coût est accepté pour l'instant.
