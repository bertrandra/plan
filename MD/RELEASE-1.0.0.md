# Version 1.0.0 — dossier de mise en production

**Date de figeage :** 28 août 2026
**Artefacts :** `plan.html` (779 126 octets, 13 571 lignes) et `api.php` (6 242 octets)
**Contenu :** l'application mono-page existante, gelée telle quelle, dotée de son identité de version
**Statut :** prête à déployer — l'étape de déploiement appartient à l'utilisateur

Cette version applique la ligne de base décrite dans [`RELEASE.md`](RELEASE.md) §2.3 : *« le
`plan.html` mono-page actuel, figé et étiqueté tel quel »*. Aucun comportement du plan ne change ;
tout ce qui a été ajouté sert à savoir, plus tard, **quelle version a produit quoi**.

---

## 1. Ce que porte la version

| Contrat | Identifiant | Valeur |
|---|---|---|
| Application | `APP_VERSION` | `1.0.0` |
| Schéma de projet | `SCHEMA_VERSION` | `1` |
| API | `API_VERSION` | `v1` |
| Build | `BUILD_AT` / `BUILD_SHA` | `2026-08-28` / *aucun (pas de dépôt git)* |

Les trois constantes sont déclarées **en tête du premier script**, avant tout usage : c'est
l'emplacement imposé par le plantage corrigé la veille, où une variable d'état rangée « près de
son code » était lue par le boot bien avant sa déclaration.

### Où la version apparaît (RELEASE.md §5.2)

| Surface | Forme | Vérifié |
|---|---|---|
| Barre de projet, à droite | `v1.0.0`, infobulle `1.0.0 · 2026-08-28 — schéma de projet 1, API v1` | ✅ modes serveur et local |
| Requêtes vers `api.php` | en-têtes `X-App-Version`, `X-Schema-Version` | ✅ code ; ⚠️ non exercé (pas de PHP en local) |
| Projet enregistré | `meta.appVersion`, `meta.schemaVersion`, `meta.writtenAt` | ✅ export JSON ; ⚠️ serveur non exercé |
| PDF | `/Info` (`/Producer`, `/Creator`, `/CreationDate`) + pied de page sur **chaque** page | ✅ 2 PDF, 5 pages |
| SVG | `data-app-version`, `data-schema-version` sur la racine | ✅ |
| DXF | commentaire `999` en première ligne | ✅ |
| Résumé texte | première ligne | ✅ |
| GLB | `asset.generator` | ❌ non fait — voir §5 |

---

## 2. Garde-fou de schéma (RELEASE.md §3.2)

Un fichier dont `meta.schemaVersion` dépasse `SCHEMA_VERSION` est **refusé**, jamais chargé
partiellement : un chargement partiel suivi d'un enregistrement effacerait sans bruit les champs
que ce client ne connaît pas.

Vérifié : un projet à `schemaVersion: 99` produit
« Import refusé : Ce projet a été enregistré par une version plus récente de l'application
(schéma 99). Rechargez la page pour obtenir la dernière version. », et le plan en cours reste
intact (35 objets avant et après). Un fichier à `schemaVersion: 1` et un fichier **sans** `meta`
s'importent normalement — l'absence du champ vaut version 1.

Le message distingue un fichier refusé d'un fichier illisible : le préfixe générique
« fichier illisible » aurait envoyé l'utilisateur chercher une corruption inexistante.

---

## 3. Empreintes de référence (porte d'entrée du gel)

Six exports capturés sur le jeu de démonstration, hachés en SHA-256 après neutralisation des
horodatages, **reproduits à l'identique sur deux exécutions** :
[`../tests/fixtures/golden/EMPREINTES.md`](../tests/fixtures/golden/EMPREINTES.md).

Les quantités calculées (surfaces et longueurs, objet par objet, emprise totale 408,4 m² =
56,5 % de la parcelle) sont figées séparément dans `quantites-demo.txt` : quand une empreinte
bougera, ce fichier dira **quel nombre** a changé.

Structure des PDF revérifiée après l'ajout du dictionnaire `/Info` — c'est exactement le genre
d'ajout qui casse un PDF écrit à la main : table xref complète (15 puis 16 entrées), chaque
décalage pointant sur le bon objet, chaque `/Length` de flux concordant avec son `endstream`.

---

## 4. Liste de contrôle RELEASE.md §8.2

| Point | État |
|---|---|
| `main` vert : tsc, eslint, vitest, fixtures | **sans objet** — ni dépôt, ni chaîne d'outils (voir §5) |
| Incrément proposé par l'outillage, confirmé | ✅ `1.0.0`, ligne de base §2.3 |
| Diff des empreintes relu | ✅ première capture — c'est la référence |
| Bump de schéma ? migration + fixtures | **sans objet** — schéma 1, aucune migration |
| `CHANGELOG.md` en français, daté | ✅ [`../CHANGELOG.md`](../CHANGELOG.md) |
| Version bumpée, commitée, étiquetée | ⚠️ version dans le fichier ; **pas de tag** faute de dépôt |
| Build propre, taille ≤ 1,2 Mo | ✅ 779 Ko |
| Déployé en pré-production | ❌ pas d'environnement de pré-production |
| Liste de fumée manuelle | ✅ campagne QA du 27 août + revérifications de ce jour |
| Isolation multi-tenant | **sans objet** (2.0.0) |
| `minClientVersion` mis à jour | ❌ le serveur n'a pas encore de configuration de version |
| Déployé en production | ⏳ **à faire par l'utilisateur** |
| Post-déploiement : ouvrir un projet existant, modifier, enregistrer, recharger | ⏳ après déploiement |
| Release GitHub publiée | ❌ pas de dépôt |

---

## 5. Écarts assumés

1. **Pas de dépôt git.** Sans dépôt, pas de tag, pas de SHA de build, pas de release publiée, et
   surtout aucun filet quand un fichier revient en arrière — ce qui s'est produit le 27 août, où
   `plan.html` a perdu deux correctifs et retrouvé un plantage déjà corrigé. C'est le premier
   manque à combler, avant toute autre étape de la feuille de route.
2. **`api.php` non exercé.** Le serveur de développement local ne sait pas exécuter PHP : les
   trois lignes ajoutées (persistance de `appVersion` et `schemaVersion`) sont relues mais jamais
   lancées. À vérifier au premier enregistrement après déploiement.
3. **`asset.generator` du GLB non renseigné.** L'exporteur glTF de Three.js écrit ce champ ;
   l'écraser suppose de reprendre le binaire après coup. Reporté, sans conséquence sur les
   contrats protégés.
4. **Rendu visuel des PDF jamais regardé.** Ils sont validés par leur structure et par le fait que
   les cotes ne tombent pas dans un contour, pas par l'œil.
5. **Client périmé (RELEASE.md §5.3).** `minClientVersion`, le blocage des écritures et le
   `409` côté serveur ne sont pas implémentés : un onglet resté ouvert plusieurs versions durant
   peut encore écrire. Sans schéma qui bouge, le risque reste théorique — il devient réel au
   premier passage à `SCHEMA_VERSION = 2`.

---

## 6. Déploiement

L'artefact est le fichier lui-même : déposer `plan.html` et `api.php` sur `plan.raillard.org`,
en conservant une copie de la version précédente pour pouvoir revenir en arrière (§8.4 : le retour
arrière consiste à republier le fichier précédent — sans bump de schéma dans cette version, il est
sans risque).

Après déploiement, dérouler les quatre gestes de la fin de liste : ouvrir un projet existant, le
modifier, l'enregistrer, recharger — et vérifier que `v1.0.0` s'affiche bien à droite de la barre
de projet.
