# La fumée du banc : son routeur et son réseau témoin

Ce dossier sert `scripts/fumee-banc.mjs` (l’écran d’import Panoramax joué dans un navigateur, à chaque PR). Rien d’ici ne part
dans la livraison, et il n’y a aucun secret : le mot de passe d’essai et les données du banc sont fabriqués sur place, dans un dossier
temporaire, à chaque exécution.

- `routeur.php` : pour `php -S`, la page du banc à `?banc` avec la politique de contenu de son `.htaccess`, comme en ligne.
- `reseau/` : les réponses rejouées à la place du réseau (un `index.json`, un corps compressé par requête), pour un lieu,
  « 2 allée des Limites, Le Vésinet » (parcelle AE 101) : le géocodage et le WFS de la Géoplateforme de l’IGN (Parcellaire Express,
  bâtiments de la BD TOPO, lus par cases de 800 m : deux cases, deux pages chacune), les tuiles de couverture et la recherche de Panoramax, les images de trois panoramiques. Les tuiles du
  fond de carte n’y sont pas : une tuile unie les remplace. Une image sans témoin reçoit une image de synthèse.

## Les photos

Trois panoramiques 360 de Panoramax (instance de l’IGN, `panoramax.ign.fr`), pris le 21 mars 2018 boulevard de Belgique, au Vésinet :

| Photo | Ce qui est gardé |
|---|---|
| `1c1a0a04-cd8d-4f8d-a24d-3e23745b1ee2` | version réduite (ramenée à 1 024 px) et grande version (ramenée à 2 048 px) |
| `94cb8359-d4ad-4a41-8f76-f72734a1f5ca` | version réduite (ramenée à 1 024 px) |
| `a5d91cc3-7d03-43eb-b584-6056510827cc` | version réduite (ramenée à 1 024 px) |

- **Auteur** : Geovelo (compte `simon_geovelo`), tel que Panoramax le donne (`providers`, `geovisio:producer`).
- **Licence** : Licence Ouverte 2.0 d’Etalab (`etalab-2.0`), telle que Panoramax la donne pour ces photos ; elle permet de les
  reproduire et de les modifier en citant l’auteur et la date. Elles sont ici réduites et recompressées (JPEG, qualité 0,6).

Les données de l’IGN (géocodage, Parcellaire Express, BD TOPO) sont aussi sous Licence Ouverte 2.0 ; la couverture et la recherche
viennent de l’API de Panoramax (`api.panoramax.xyz`).

## Refaire le témoin

```bash
npm run build:banc
FUMEE_RESEAU=enregistrer NODE_PATH=$(npm root -g) node scripts/fumee-banc.mjs
```

Avec `FUMEE_BANC_PASSAGES=tous` quand la CI joue tous les passages : la liste est triée par note, et le point joué n’est pas le même
à tous les écrans (une photo jouée sans témoin n’a qu’une image de synthèse, et son aperçu échoue). Après l’enregistrement, retirer de
`reseau/index.json` les requêtes qui ne partent plus (une ancienne forme de la lecture des bâtiments, par exemple) et leur fichier.

Le passage joue le vrai réseau dans quatre écrans (ou tous), range ce que le navigateur a reçu, puis l’allège : sans les tuiles du fond, avec
les seules images des photos jouées, réduites. Si d’autres photos sont gardées, mettre à jour le tableau ci-dessus (auteur et licence
se lisent dans la réponse de la recherche, `properties.license` et `providers`).
