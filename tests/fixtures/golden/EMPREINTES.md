# Empreintes de référence — version 1.0.0

Capturées le **28 août 2026** sur le jeu de démonstration embarqué (parcelle AE 101,
35 objets, 11 mesures), `plan.html` v1.0.0, sans appel réseau (mode local).

Ces empreintes sont la porte d'entrée du gel 1.0.0 exigé par [`../../../MD/RELEASE.md`](../../../MD/RELEASE.md) §2.3.
**Règle qui porte tout le reste (RELEASE.md §2.1) : une empreinte qui bouge sans qu'une
fonctionnalité voulue l'explique est un changement MAJEUR, pas une correction.**

## Empreintes

SHA-256 du contenu **normalisé** (voir plus bas), sur le jeu de démonstration :

| Export | Octets | SHA-256 (normalisé) |
|---|---:|---|
| Résumé texte | 15 313 | `318d0cf113f2c681cbe82c54a0fe00029b7153e86d4b4202fd1cbf2145a082e6` |
| SVG | 24 732 | `f5922c20f4ca4df1e43f0d998c7fad28760189671644a2fe784b0f71e9c42a34` |
| DXF | 5 362 | `ec7a1e32267514a52016e60c06dd535f41d54649a07b4b2dadbb95d7c48608ec` |
| Projet JSON | 71 924 | `bb9719159d0b1a75aa6e853c0391f6c9902fd1e4e9df7cf8f80b3654917d06a6` |
| PDF (plan, 2 pages) | 16 162 | `c956c8813f165966f6a2cf5a79f6884e9f17ec035f2909a2cfc6994a4ffd857d` |
| PDF dossier (3 pages) | 15 254 | `ea303be4e40a535137b9b09067fb898435fc61b9a71d329129db981e049b0dc2` |

Reproduites à l'identique sur deux exécutions successives : la capture est déterministe une
fois les horodatages neutralisés.

## Normalisation

Trois substitutions, appliquées au texte de l'export avant le hachage. Elles remplacent
chaque valeur volatile par un motif **de même longueur**, sinon les décalages internes du PDF
(table xref) changeraient et rendraient l'empreinte inutilisable :

```js
s.replace(/\d{2}\/\d{2}\/\d{4}/g, 'JJ/MM/AAAA')          // dates affichées
 .replace(/D:\d{14}/g, 'D:AAAAMMJJHHMMSS')                // /CreationDate du PDF
 .replace(/"(exportedAt|writtenAt)":\s*"[^"]*"/g, '"$1":"HORODATAGE"')
```

## Quantités

[`quantites-demo.txt`](quantites-demo.txt) fige les surfaces et longueurs calculées, objet par
objet. C'est le fichier à regarder en premier quand une empreinte bouge : il dit **quel nombre**
a changé, là où le SHA-256 dit seulement que quelque chose a changé.

Emprise totale hors parcelle de référence : **408,4 m² (56,5 % de la parcelle)**.

## Comment rejouer la capture

Sans outillage de test à ce stade (ni Node, ni CI — voir `MD/RELEASE-1.0.0.md`), la capture se
fait dans le navigateur, page servie par `servir.ps1` :

1. Charger `plan.html` sans projet serveur (jeu de démonstration).
2. Intercepter `URL.createObjectURL` pour récupérer les blobs sans écrire de fichier, et
   neutraliser le clic des ancres `download`.
3. Déclencher les six exports, lire chaque blob en texte, normaliser, hacher en SHA-256 via
   `crypto.subtle`.

Toute divergence se compare d'abord à `quantites-demo.txt`, ensuite au diff de l'export lui-même.
