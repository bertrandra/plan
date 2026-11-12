# Copie figée de Plan

Ces fichiers sont copiés de Plan (`src/`, même arborescence) au commit `e6b5cec2`, le 11 novembre 2026,
et ne bougent plus avec lui (décision du propriétaire : le banc a son propre code). Ils servent :

- au redressement d'une photo par ses points de fuite (`facade/vision/redressementFuites.ts`,
  `segments.ts`, `verticales.ts`, `homographie.ts`, `cadrage.ts`) ;
- à la recherche des baies pour le brouillon (`facade/detection/baies/`, le vote de trois détecteurs).

Seuls changements : `classement.ts` réduit à la règle de taille (`classer`) et `model/typesReleve.ts` réduit
au type des baies, pour couper les dépendances vers le reste de Plan. Pour reprendre une version plus récente,
recopier les fichiers depuis Plan et changer le commit ci-dessus.
