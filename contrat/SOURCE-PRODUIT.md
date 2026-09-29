# Ce que Plan publie pour la plateforme

`backprod.openapi.json` va de la plateforme vers Plan : c'est ce qu'elle promet.
`plan-produit.json` va dans l'autre sens : c'est ce que **Plan** attend d'elle, et que seul le code
de Plan peut dire. Il est engendré par `tests/unit/contrat-produit.test.ts`, qui échoue dès que le
fichier ne suit plus le code.

| Clé | Ce qu'elle dit | Ce que backprod en fait |
|---|---|---|
| `schema_versions` | Tous les schémas que ce programme peut écrire (un plan sans relevé s'écrit encore en 1) | La configuration `project_schema_versions` du produit Plan doit les contenir **tous**, sinon l'enregistrement répond `422 UNSUPPORTED_SCHEMA_VERSION` |
| `current_schema_version` | Le plus haut | Idem |
| `demo_project` | Nom, schéma et document de la démonstration, tels que Plan les enregistre au premier pas | Le monde d'essai sème ce document-là, et non un document de remplacement que Plan ne sait pas ouvrir |
| `app_version` | La version qui a écrit le fichier | Traçabilité |

## Pourquoi ce fichier existe

Le 29 septembre 2026, la démonstration ne s'ouvrait plus : Plan 2.2.0 écrivait le schéma 2, et la
plateforme n'acceptait que `[1]` pour Plan. Rien ne le signalait ni d'un côté ni de l'autre : la
plateforme ne connaît pas la forme des documents, et Plan ne connaît pas sa configuration. Les deux
moitiés du remède sont :

1. **Côté Plan** : un document s'écrit au plus petit schéma qui le décrit (`src/model/migrations.ts`),
   et un refus `422` se dit en clair (`src/io/depotPlateforme.ts`).
2. **Côté backprod** : recopier ce fichier, et vérifier par un test que la configuration du produit
   Plan (monde d'essai et production) accepte `schema_versions`, et que la démonstration semée est
   `demo_project.document`.

## À chaque montée de schéma

Dans cet ordre : régénérer le fichier (`REECRIRE_CONTRAT=1 npx vitest run tests/unit/contrat-produit.test.ts`),
le recopier dans backprod, **ajouter le nouveau numéro à `project_schema_versions` en production**,
puis seulement déployer Plan (`MD/RELEASE.md` §8.2).
