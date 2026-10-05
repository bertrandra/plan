# Spécification — La palette dans backprod : une par produit, une par tenant

**Statut :** proposition, à relire côté plateforme avant toute ligne de code.
**Public :** l'équipe backprod (implémentation), et Plan (premier produit consommateur).
**Rédigée le :** 3 octobre 2026, contre `plan@de7490d` et `backprod@30c5c50`.
**Prolonge :** `spec-connexion-plateforme.md` (§14.1 et décision ouverte n° 3, « Branding »),
`spec-demos-admin.md` (§ Palette de l'interface).
**Côté plateforme, s'appuie sur :** `backprod/src/Skin/*` (l'habillage existant),
`backprod/src/Staff/*` (la console), `backprod/src/Product/Domain/ProductManifest.php`,
`backprod/docs/identities-and-permissions.md`.

---

## 0. En une page

Plan a aujourd'hui **une** palette : un fichier JSON posé à côté de l'application
(`admin/palette`), réglé par un mot de passe d'admin propre à Plan, et appliqué à tout le monde.
Cette spécification la fait passer dans la plateforme, avec deux niveaux :

| Niveau | Qui la règle | S'applique à | Remplace |
|---|---|---|---|
| **Palette du produit** (« palette admin ») | `PLATFORM_ADMIN`, depuis la console ou l'écran palette de Plan | tous les tenants du produit, et la page de connexion | le fichier `admin/palette` de Plan |
| **Palette du tenant** | `PLATFORM_ADMIN` en v1 ; `TENANT_ADMIN` en v2 (`skin.manage` + `white_label`) | les membres d'un tenant, pour ce produit | rien : c'est nouveau |

Sous les deux, les **couleurs d'origine** restent dans le code du produit (`src/styles/jetons.ts`
pour Plan). Chaque jeton se résout séparément, du plus particulier au plus général :

```text
couleur affichée(jeton, thème) = palette du tenant  [si elle porte ce jeton]
                               ? palette du produit [si elle porte ce jeton]
                               ? origine du produit
```

Une palette n'enregistre donc **que ses écarts**. Un jeton ajouté demain au produit hérite tout
seul de son origine, partout.

Ce qui ne change pas : une palette règle l'**écran**, jamais un nombre ni un fichier produit. Les
six empreintes de `tests/fixtures/golden/` restent identiques quelle que soit la palette (§9.3).

---

## 1. Le principe à reproduire : ce que Plan fait aujourd'hui

Cette section décrit le mécanisme existant, pour que backprod le reproduise sans le ré-inventer.
Les fichiers cités sont ceux de Plan.

### 1.1 Les jetons

L'interface ne connaît aucune couleur en dur : elle lit **29 jetons** en variables CSS
(`--ink`, `--paper`, `--accent`…), chacun avec une valeur **claire** et une **sombre**.

- **Source de vérité :** `src/styles/jetons.ts` (`JETONS`, `ROLES_JETONS`, `FAMILLES_JETONS`).
- **Déclaration :** `src/styles/app.css`, dans un bloc `:root` (clair) et un bloc
  `prefers-color-scheme: dark` (sombre).
- **Contrôle :** un test vérifie que les deux concordent. Il refuse aussi toute couleur
  hexadécimale hors de ces blocs.

Ils sont rangés en 7 familles :

| Famille | Jetons |
|---|---|
| Encres | `ink`, `ink-soft`, `on-ink` |
| Papiers | `paper`, `paper-deep`, `stage-bg`, `stage-trame`, `panel-bg`, `panel-2`, `segment-bg`, `input-bg` |
| Traits | `border`, `rule`, `hairline` |
| Bois (accent) | `accent`, `on-accent`, `accent-light`, `on-accent-light` |
| États | `ok`, `alerte`, `danger`, `danger-bg` |
| Notifications | `toast-bg`, `on-toast` |
| Scènes | `fond-3d`, `camera-bg`, `on-camera`, `camera-ok`, `camera-alerte` |

**Paires de contraste.** `PAIRES_CONTRASTE` en liste 20 : texte sur fond, avec un minimum WCAG.
- Le minimum est 4,5 pour le texte.
- Il est de 3 pour les grands chiffres et les bordures (`ok`, `alerte`…).

### 1.2 Le document

```json
{
  "format": "plan-palette",
  "version": 1,
  "modifieLe": "2026-10-03T12:00:00.000Z",
  "couleurs": {
    "clair":  { "ink": "#2B2117", "accent": "#7A5C31", "…": "…" },
    "sombre": { "ink": "#F1E7D0", "accent": "#E0B564", "…": "…" }
  }
}
```

### 1.3 Les quatre règles qui font sa solidité

1. **Une couleur est `#RRGGBB` et rien d'autre.** Six chiffres hexadécimaux ne peuvent pas
   exprimer `red;} body{display:none}` : la validation est aussi la protection contre l'injection
   CSS. Le même raisonnement est déjà écrit dans `backprod/src/Skin/Controller/SkinRoute.php`.
2. **La lecture est tolérante.** `lireDocumentPalette` part des couleurs d'origine et ne
   remplace que ce qui est valide. Un jeton inconnu est ignoré, une valeur mal formée aussi, et un
   jeton absent garde son origine. **Une palette abîmée ne peut pas casser l'interface** : au pire,
   elle n'a pas d'effet.
3. **L'écriture est stricte.** Le serveur (`deploy/admin.php`) refuse :
   - un document qui n'est pas une palette ;
   - un thème autre que `clair` ou `sombre` ;
   - une couleur mal formée ;
   - plus de 64 Ko.
4. **L'application ne pose que les écarts.** `cssPalette` produit une feuille ajoutée **après**
   `app.css`, qui ne contient que les jetons différents de l'origine.
   - Une palette égale à l'origine donne une feuille vide.
   - Le bloc clair est enfermé dans `@media not all and (prefers-color-scheme: dark)`. Sinon un
     `:root` nu, posé après la feuille, l'emporterait aussi sur le thème sombre.

### 1.4 Le cycle de vie

```text
démarrage de chaque page
  → GET admin/palette            (sans session, Cache-Control: no-cache)
      404 → couleurs d'origine, rien à faire
      200 → lireDocumentPalette → appliquerPalette :
              1. <style id="paletteServeur"> = cssPalette(couleurs)
              2. poserEncres(couleurs[thème affiché])      (le plan SVG, §1.5)
              3. évènement « plan:encres » → l'atelier redessine le plan
```

La page s'affiche d'abord avec les couleurs d'origine. La palette se pose dès qu'elle arrive,
sans bloquer le démarrage.

### 1.5 Le plan SVG

Le plan est dessiné à la main en SVG et ne lit pas les variables CSS. Ses encres
(`src/render/theme.ts`) sont reprises dans 6 jetons du thème affiché :
- `ink` : trait et pastilles ;
- `on-ink` : texte des pastilles ;
- `rule` : grille ;
- `paper` : halo des étiquettes ;
- `accent` et `panel-bg` : poignées.

L'atelier redessine le plan quand ces encres changent. **Les exports n'importent de `render/` que
de la géométrie** : leurs encres sont figées, et les empreintes le prouvent.

### 1.6 L'écran de réglage (`?palette`)

Ce que l'écran offre aujourd'hui, et qu'il faut garder :
- **Liste des jetons** par famille. Chacun a, par thème, un sélecteur du système, un sélecteur
  avancé (TSV, TSL, RVB) et un code `#RRGGBB`, plus un état écrit (« contraste 2,67 »,
  « non enregistrée », « modifiée »).
- **Filtres** Toutes / Modifiées / Contraste insuffisant, et recherche.
- **Aperçu** collé à côté de la liste : de vraies commandes de Plan, ou une planche d'ambiance.
- **Contrastes** : tableau des 20 paires, verdict écrit en toutes lettres.
- **Modèles** : 8 palettes toutes faites (`src/styles/modeles/*.json`).
- **Fichier** : importer et exporter le JSON.
- **Revenir** : annuler les modifications, ou revenir aux couleurs d'origine.
- **« Enregistrer… »** ouvre un **récapitulatif** de ce qui part, avant et après, avec
  l'avertissement si des contrastes restent insuffisants. Rien n'est envoyé avant confirmation.
- **Le serveur ne refuse pas un contraste insuffisant.** Seul l'écran prévient : l'opérateur peut
  avoir une raison.

---

## 2. La différence : aujourd'hui, demain, et l'habillage existant

### 2.1 Plan aujourd'hui → backprod demain

| | Plan aujourd'hui (`admin/palette`) | backprod (cette spec) |
|---|---|---|
| Stockage | un fichier `.palette.json` (+ `.bak`) à côté des démos | PostgreSQL : une ligne par produit, une par (tenant, produit), et un historique |
| Qui écrit | quiconque connaît le mot de passe d'admin de Plan | une **permission** de la plateforme : `staff.palette.manage` (v1), `skin.manage` + `white_label` (v2) |
| Portée | une palette pour tout le monde | produit, puis tenant, résolues jeton par jeton |
| Qui lit | tout le monde, sans session | palette du produit : publique ; palette du tenant : membres du tenant |
| Liste des jetons | codée dans Plan | **déclarée par le produit** dans son manifeste ; backprod ne connaît aucun nom de jeton (§4) |
| Ce qu'on stocke | toutes les couleurs | **seulement les écarts** à l'origine (ou au niveau du dessus) |
| Historique | un seul `.bak` | toutes les révisions, restaurables (§5.3) |
| Écritures concurrentes | la dernière gagne | `If-Match` sur la révision, `409 PALETTE_STALE` (§6.6) |
| Trace | aucune | audit à chaque écriture ; motif `X-Access-*` quand le personnel entre chez un tenant |
| Format | `plan-palette`, thèmes `clair`/`sombre` | `palette` générique, thèmes `light`/`dark` ; Plan convertit à l'import et à l'export |

### 2.2 Palette et habillage (`tenant_skins`) : deux choses, une seule ligne

backprod a déjà un **habillage** par (tenant, produit) : `primary_color`, `accent_color`,
`logo_asset_id`. Il est lu par tout membre (`GET /tenant/skin`) et écrit avec `skin.manage` **et**
la capacité `white_label`.

| | Habillage existant | Palette |
|---|---|---|
| Granularité | 2 couleurs génériques | tous les jetons du produit (29 pour Plan) × 2 thèmes |
| Sens | « la couleur de ma marque » | « l'interface entière de ce produit » |
| Niveau produit | non | oui (la palette admin) |
| Qui la consomme | le shell de la plateforme (`BrandingScreen`) | le produit |

**Décision proposée : la palette du tenant vit dans la même ligne que l'habillage**
(`tenant_skins.palette`). C'est le même objet métier (« comment ce tenant veut voir ce produit »),
avec la même clé, la même lecture par appartenance et la même double garde en écriture. Les deux
couleurs de l'habillage restent ce qu'elles sont. Le produit peut en déduire une valeur par défaut
(§4.3), mais les deux mécanismes ne se mélangent pas.

---

## 3. Qui peut quoi

Plan ne branche jamais sur un **nom de rôle** (`spec-connexion-plateforme.md` §4.1) : tout passe
par des **permissions**.

### 3.1 Permissions

| Permission | Nouvelle ? | Rôles | Ce qu'elle ouvre |
|---|---|---|---|
| `staff.palette.manage` | **oui** | `PLATFORM_ADMIN` seulement | lire et écrire la palette d'un produit et celle de n'importe quel tenant, restaurer une révision |
| `staff.tenants.read` | non | les 4 rôles plateforme | lister les tenants (choisir celui dont on règle la palette) |
| `skin.manage` + capacité `white_label` | non | `TENANT_ADMIN` | **v2** : régler la palette de son propre tenant |
| *(appartenance)* | — | tout membre | lire la palette résolue de son tenant |
| *(aucune)* | — | public | lire la palette du produit |

**Pourquoi une permission neuve plutôt que `staff.products.manage`.** Celle-ci ouvre la facturation,
les clés et les webhooks d'un produit. Confier les couleurs à quelqu'un ne doit pas lui confier les
clés. La permission est ajoutée par migration, comme `skin.manage` l'a été
(`Version20260909120000.php`), et rattachée au seul `PLATFORM_ADMIN`.

### 3.2 Les arêtes vives

- **Le personnel n'a pas de `RequestContext`.** Le `PLATFORM_ADMIN` n'agit jamais « en tant que »
  tenant. Il passe par des routes `/staff/*` qui **nomment** le tenant en paramètre ; la permission
  autorise et l'accès est journalisé (`StaffContext`, non-négociable #21).
- **Entrer chez un tenant laisse une trace motivée.** Lire ou écrire la palette d'un tenant précis
  depuis la console exige `X-Access-Purpose` (en pratique `SUPPORT_REQUEST`) et `X-Access-Reason`
  (8 à 500 caractères), comme les autres lectures chez un client. La palette du produit n'en
  demande pas : elle n'appartient à aucun client.
- **`white_label` ne bride pas le personnel.** La capacité dit « l'offre du tenant inclut le
  libre-service de la marque ». Le `PLATFORM_ADMIN` peut poser une palette à un tenant qui ne l'a
  pas achetée (accord commercial, démonstration). Elle s'applique quand même, puisque la lecture ne
  demande que l'appartenance, comme pour l'habillage. *Décision ouverte n° 2.*

---

## 4. Le schéma des jetons appartient au produit

backprod est une plateforme multi-produits : *« Never write product-specific branching »*
(`backprod/CLAUDE.md`). Elle ne peut donc pas connaître `ink` ou `stage-trame`. C'est le produit
qui déclare ses jetons, par le canal qui existe déjà pour ses versions de schéma : son
**manifeste**.

### 4.1 Le manifeste déclare la palette

`GET https://plan.raillard.org/.well-known/product.json` gagne une clé `palette` :

```json
{
  "product": "plan",
  "app_version": "2.3.0",
  "schema_versions": [1, 2, 3],
  "palette": {
    "version": 1,
    "themes": ["light", "dark"],
    "tokens": [
      { "name": "ink",    "group": "text",   "label": "Texte courant, titres",
        "defaults": { "light": "#2b2117", "dark": "#f1e7d0" } },
      { "name": "paper",  "group": "ground", "label": "Fond de page",
        "defaults": { "light": "#f7f2e7", "dark": "#1c1610" } },
      "… 27 autres …"
    ],
    "contrast_pairs": [
      { "text": "ink", "ground": "paper", "min": 4.5 },
      "… 19 autres …"
    ]
  }
}
```

**Règles :**
- `name` : `^[a-z][a-z0-9-]{0,47}$`. Au plus 128 jetons. `defaults` porte une couleur par thème.
- Le manifeste est **lu, jamais obéi** (`ProductManifest.php`). La console montre l'écart entre
  ce que le produit déclare et ce que la base tient, et un opérateur l'applique par un second
  appel délibéré : `PUT /staff/products/{productId}/palette/schema`. C'est le même geste que pour
  `schema_versions`, et pour la même raison : un `app_url` erroné ou compromis ne doit pas
  reconfigurer un produit.
- Plan engendre cette clé depuis `jetons.ts` au build (`scripts/livraison.mjs`), avec un test qui
  la confronte à `JETONS` et à `PAIRES_CONTRASTE`. **Plan ne sert aujourd'hui aucun
  `.well-known/product.json`** : c'est un manque à combler, de toute façon (§10, étape P1).

### 4.2 À quoi sert le schéma côté plateforme

1. **Valider une écriture** : un jeton inconnu du schéma est refusé `400` (§6.5).
2. **Calculer les contrastes** à renvoyer en avertissement, jamais en refus (§6.4).
3. **Donner à la console de quoi afficher** une liste de jetons nommés et groupés, même sans
   l'aperçu riche de Plan.
4. **Résoudre** la palette effective sans que le produit envoie ses origines à chaque lecture.

### 4.3 L'habillage nourrit-il la palette ?

Optionnel. Le schéma peut marquer un jeton `"from_skin": "accent_color"`. Le jeton prend alors la
couleur d'accent de l'habillage, si elle existe, avant l'origine du produit, mais après la palette
explicite du tenant. Pour Plan, c'est naturellement `accent`. **Hors v1** ; noté pour que le schéma
le permette sans migration.

---

## 5. Modèle de données (PostgreSQL)

### 5.1 Tables

```sql
-- Ce que le produit a declare, une fois applique par un operateur (§4.1).
CREATE TABLE product_palette_schemas (
    product_id   UUID PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    version      INTEGER NOT NULL,
    schema       JSONB   NOT NULL,          -- {themes, tokens[], contrast_pairs[]}
    updated_by   UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La palette « admin » : une par produit, seulement ses ecarts.
CREATE TABLE product_palettes (
    product_id   UUID PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    overrides    JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- {"light": {"ink": "#…"}, "dark": {…}}
    revision     INTEGER NOT NULL DEFAULT 0,
    updated_by   UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_palettes_size CHECK (pg_column_size(overrides) <= 65536)
);

-- La palette du tenant : dans la ligne d'habillage existante (§2.2).
ALTER TABLE tenant_skins
    ADD COLUMN palette          JSONB   NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN palette_revision INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT tenant_skins_palette_size CHECK (pg_column_size(palette) <= 65536);

-- L'historique : chaque ecriture, restaurable. Remplace le `.bak` unique de Plan.
CREATE TABLE palette_revisions (
    id           BIGSERIAL PRIMARY KEY,
    product_id   UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    tenant_id    UUID     REFERENCES tenants (id)  ON DELETE CASCADE,   -- NULL = palette du produit
    revision     INTEGER NOT NULL,
    overrides    JSONB   NOT NULL,
    origin       TEXT    NOT NULL CHECK (origin IN ('STAFF', 'TENANT', 'RESTORE', 'RESET')),
    actor_id     UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, tenant_id, revision)
);
CREATE INDEX palette_revisions_scope ON palette_revisions (product_id, tenant_id, revision DESC);
```

### 5.2 Invariants

- `overrides` ne contient que des thèmes du schéma, que des jetons du schéma et que des valeurs
  `^#[0-9a-f]{6}$`, **en minuscules** comme l'habillage. Plan, qui écrit en majuscules, normalise
  à l'envoi et à la lecture.
- Un écart égal à la valeur qu'il recouvre n'est pas stocké : l'écriture le retire.
  « Revenir à l'origine » d'un jeton, c'est l'ôter.
- `revision` croît de 1 à chaque écriture effective. Une écriture qui ne change rien ne crée ni
  révision ni ligne d'historique, et répond `200` avec la révision inchangée.
- Une ligne `tenant_skins` sans palette a `palette = '{}'` : c'est la réponse « aucune », pas un
  `404`, comme pour l'habillage.

### 5.3 Rétention

On garde **les 50 dernières révisions** par portée (produit, ou tenant × produit). Elles sont
élaguées par la file de jobs, qui sait déjà « ranger derrière elle ». À 64 Ko au plus chacune,
c'est 3,2 Mo par portée au pire. En pratique, quelques Ko : seuls les écarts sont stockés.

---

## 6. API

Toutes les réponses d'erreur gardent l'enveloppe de la plateforme
`{ error: { code, message, details, request_id } }`.

### 6.1 Format d'échange

```json
{
  "palette": {
    "scope": "product",
    "product": "plan",
    "tenant_id": null,
    "schema_version": 1,
    "revision": 7,
    "updated_at": "2026-10-03T12:00:00Z",
    "updated_by": { "id": "…", "display_name": "…" },
    "overrides": { "light": { "accent": "#1f7a4d" }, "dark": { "accent": "#5fd39a" } }
  }
}
```

Une lecture **résolue** ajoute :

```json
{
  "resolved": { "light": { "ink": "#2b2117", "…": "…" }, "dark": { "…": "…" } },
  "sources":  { "light": { "accent": "tenant", "ink": "product", "paper": "origin" }, "dark": { "…": "…" } },
  "contrast_warnings": [
    { "theme": "light", "text": "ink-soft", "ground": "panel-bg", "ratio": 2.67, "min": 4.5 }
  ]
}
```

`sources` permet à un écran d'écrire « hérité du produit » sous un jeton : c'est ce qui rend
lisibles les deux niveaux.

### 6.2 Lecture par le produit

| Méthode | Chemin | Politique | Réponse |
|---|---|---|---|
| `GET` | `/api/v1/public/products/{code}/palette` | **PUBLIC** | la palette du produit, résolue sur l'origine. Plan l'applique **avant** la connexion : page de connexion, vitrine, « Plan n'est pas ouvert à ce compte » |
| `GET` | `/api/v1/tenant/palette` | membre (`RequestContext`, `X-Product`) | `overrides` du tenant, palette du produit, `resolved` et `sources` |

- **Cache.** Le `GET` public renvoie `ETag: "<product revision>"` et `Cache-Control: public,
  max-age=60, must-revalidate`. Le `GET` tenant renvoie `ETag:
  "<product revision>.<tenant revision>"` et `Cache-Control: private, no-cache`. Un `304` coûte
  presque rien, et une palette changée se voit à la page suivante.
- **Pourquoi un `GET /tenant/palette` à part, plutôt qu'un champ dans `GET /tenant/skin`.** La
  réponse résolue dépend du produit et du schéma ; l'habillage est lu par le shell, qui n'en a que
  faire. Le stockage reste commun (§5.1).
- **Pourquoi pas dans `/me/context`.** Ce contexte est la réponse d'autorisation ; une palette de
  64 Ko n'a rien à y faire, et l'enveloppe est contractuelle.

### 6.3 Écriture par le personnel (`staff.palette.manage`)

| Méthode | Chemin | Motif `X-Access-*` | Effet |
|---|---|---|---|
| `GET` | `/api/v1/staff/products/{productId}/palette` | non | palette du produit, résolue, avec avertissements |
| `PUT` | `/api/v1/staff/products/{productId}/palette` | non | remplace les écarts du produit |
| `DELETE` | `/api/v1/staff/products/{productId}/palette` | non | revient à l'origine (révision `RESET`) |
| `GET` | `/api/v1/staff/products/{productId}/palette/schema` | non | le schéma tenu, et celui que le manifeste propose (lu à part, lent : jusqu'à 10 s) |
| `PUT` | `/api/v1/staff/products/{productId}/palette/schema` | non | applique le schéma du manifeste |
| `GET` | `/api/v1/staff/tenants/{tenantId}/products/{productId}/palette` | **oui** | la palette du tenant : ses écarts, celle du produit, la résolue |
| `PUT` | `/api/v1/staff/tenants/{tenantId}/products/{productId}/palette` | **oui** | remplace les écarts du tenant |
| `DELETE` | `/api/v1/staff/tenants/{tenantId}/products/{productId}/palette` | **oui** | le tenant revient à la palette du produit |
| `GET` | `/api/v1/staff/products/{productId}/palettes` | non | les tenants qui ont une palette propre : `tenant_id`, `slug`, `name`, `revision`, `updated_at`, nombre d'écarts — **sans les couleurs** |
| `GET` | `…/palette/revisions` (sur les deux portées) | comme la portée | l'historique, du plus récent au plus ancien, paginé |
| `POST` | `…/palette/revisions/{revision}/restore` | comme la portée | recopie une révision en une **nouvelle** révision (`RESTORE`) ; l'historique ne se réécrit jamais |

Corps d'un `PUT` :

```json
{ "overrides": { "light": { "accent": "#1f7a4d" }, "dark": {} } }
```

- C'est un **`PUT` de l'ensemble des écarts**, pas un `PATCH` jeton à jeton : l'écran envoie ce
  que le récapitulatif a montré, ni plus ni moins.
- Réponse `200` : la palette résolue (§6.1), avec la nouvelle révision.
- **Audit.** Chaque écriture enregistre `StaffAccess` avec l'action `CONFIGURE_PALETTE`,
  `RESET_PALETTE` ou `RESTORE_PALETTE`. Les métadonnées portent la portée, la révision et la liste
  `{theme, token, before, after}`. C'est le récapitulatif de Plan, gardé par la plateforme.

### 6.4 Contrastes : avertir, ne pas refuser

La plateforme calcule les rapports des `contrast_pairs` du schéma sur la palette **résolue**
(formule WCAG 2.x, luminance relative) et les renvoie dans `contrast_warnings`.
- Elle **n'en refuse aucun.** C'est la règle de Plan aujourd'hui : l'opérateur peut avoir une
  raison (charte imposée, démonstration), et l'écran le prévient avant d'envoyer.
- Une palette de **tenant** se vérifie **résolue sur celle du produit** : un tenant qui ne change
  que `paper` peut casser une paire dont l'autre moitié vient du produit.

### 6.5 Validation et erreurs

| Code | HTTP | Quand | `details` |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | thème inconnu, jeton absent du schéma, valeur hors `#rrggbb` | `field` (`overrides.light.ink`), `requirement` |
| `PALETTE_SCHEMA_MISSING` | 409 | écriture sur un produit dont aucun schéma n'est appliqué | `product` |
| `PALETTE_STALE` | 409 | `If-Match` ne correspond plus à la révision tenue | `revision` (la tenue) |
| `PAYLOAD_TOO_LARGE` | 413 | corps > 64 Ko | `limit` |
| `ACCESS_MOTIVE_REQUIRED` | 400 | route tenant sans `X-Access-Purpose`/`X-Access-Reason` | ce que `AccessMotive` dit déjà |
| `PERMISSION_DENIED` | 403 | sans `staff.palette.manage` (ou, en v2, sans `skin.manage`) | `permission` |
| `ENTITLEMENT_REQUIRED` | 403 | v2 : tenant sans `white_label` | `capability` |
| `NOT_FOUND` | 404 | produit inconnu, ou tenant qui ne détient pas ce produit | — |

**Écriture stricte, lecture tolérante** (§1.3) :
- Le serveur refuse tout jeton inconnu à l'écriture.
- Si le schéma perd plus tard un jeton, les écarts qui le nomment **restent stockés mais ne sont
  plus servis**. Un retour en arrière du produit les retrouve.

### 6.6 Concurrence

Deux opérateurs ouvrent la même palette ; le second écraserait le premier sans le savoir.
- Les `PUT` et `DELETE` exigent `If-Match: "<revision>"`. Sans lui, la réponse est `428`
  (`PRECONDITION_REQUIRED`) ; périmé, elle est `409 PALETTE_STALE`, qui renvoie la révision tenue.
- L'écran recharge alors et montre la différence avant de proposer d'enregistrer de nouveau.

### 6.7 v2 — le `TENANT_ADMIN` règle sa propre palette

| Méthode | Chemin | Garde |
|---|---|---|
| `PUT` | `/api/v1/tenant/palette` | `skin.manage` **et** capacité `white_label`, comme l'habillage |
| `DELETE` | `/api/v1/tenant/palette` | idem |
| `GET` | `/api/v1/tenant/palette/revisions` | `skin.manage` |

Mêmes corps, mêmes erreurs, même audit (`origin = 'TENANT'`). Le produit montre les deux refus
différemment, comme `ui-roadmap.md` l'exige déjà pour l'habillage :
- sans la permission : la phrase « un administrateur de l'organisation » ;
- sans la capacité : la phrase de montée en gamme.

---

## 7. Côté Plan : ce qui change dans le produit

### 7.1 Au démarrage

```text
page chargée
  → GET /api/v1/public/products/plan/palette        (sans jeton)
      → appliquerPalette(produit)                    la porte, la vitrine sont déjà aux couleurs
  → session, GET /me/context                        (inchangé)
  → GET /api/v1/tenant/palette                       (Bearer, X-Product: plan)
      → appliquerPalette(resolved)                   remplace la précédente, une seule feuille
```

- `app/paletteServeur.ts` garde sa forme : il change seulement de source.
- `appliquerPalette` reçoit des couleurs complètes, déjà résolues. `cssPalette` continue de ne
  poser que les écarts à `jetons.ts`, et `poserEncres` + `plan:encres` redessinent le plan.
- Thèmes : `light` ↔ `clair` et `dark` ↔ `sombre`, convertis à l'entrée dans
  `styles/paletteServeur.ts`.
- **Le flash.** Entre la première peinture et l'arrivée de la palette du tenant, la page montre
  la palette du produit. C'est accepté en v1 ; le seul moyen de l'éviter serait de bloquer le rendu
  sur un appel réseau.
- **`admin/palette` est retiré** une fois la route publique en service. Pendant la transition, Plan
  lit la plateforme d'abord et le fichier ensuite, et le jour du basculement le fichier est
  recopié tel quel comme palette du produit (§10, étape P4).

### 7.2 L'écran `?palette` devient un écran du personnel

L'écran garde tout ce que §1.6 décrit ; il gagne **un choix de portée** et perd le mot de passe.

1. **Entrée.** `?palette` ouvre la porte de connexion de la plateforme, plus celle de l'admin de
   Plan. Une fois connecté :
   - Plan appelle `GET /api/v1/staff/me` et regarde si la permission `staff.palette.manage` est
     présente. Il ne lit jamais le nom du rôle.
   - Sans elle : « Cet écran est réservé aux administrateurs de la plateforme. »
   - **L'écran ne passe pas par `/me/context`** : un `PLATFORM_ADMIN` n'a pas forcément de tenant,
     et `NO_TENANT_ACCESS` l'en chasserait.
2. **Portée**, en tête d'écran : « Palette du produit » (par défaut) ou « Palette d'un tenant ».
   - Le second choix ouvre une liste (`GET /staff/tenants`, filtrée sur ceux qui détiennent Plan),
     avec recherche par nom ou slug.
   - Les tenants qui ont déjà une palette propre viennent en tête (`GET /staff/products/{id}/palettes`).
   - Choisir un tenant demande le **motif** (`SUPPORT_REQUEST` et une référence, 8 caractères au
     moins) une fois par séance d'écran. Il voyage ensuite sur chaque appel, sans être redemandé.
3. **Héritage visible.** En portée tenant, la liste montre pour chaque jeton :
   - la valeur héritée du produit, et la source (« produit », « origine ») ;
   - l'état « propre au tenant » quand le tenant la remplace ; « Revenir » sur une ligne retire
     alors l'écart du tenant, et la ligne retrouve la valeur du produit.
4. **Filtres** : Toutes / **Propres à ce niveau** (remplace « Modifiées ») / Contraste insuffisant.
5. **Enregistrer…** Le récapitulatif liste les écarts **de ce niveau**, envoie
   `PUT … If-Match`, et affiche `contrast_warnings` tels que le serveur les a calculés.
6. **Historique**, nouveau menu : les révisions (date, auteur, nombre d'écarts), un aperçu
   avant/après, et « Restaurer cette version ».
7. **Modèles, Importer, Exporter** : inchangés. L'export reste `plan-palette` ; un fichier exporté
   en portée tenant ne contient que les écarts du tenant, et le dit dans son nom
   (`palette-plan-<slug>.json`).

**Pourquoi l'écran reste dans Plan, et pas dans la console.** L'aperçu montre de **vraies**
commandes de Plan, et le plan SVG suit. La console ne peut pas rendre les composants d'un autre
produit. Elle garde un écran de **secours** générique, à partir du schéma : liste de jetons,
sélecteur, code, avertissements, historique, sans aperçu métier. Il sert à corriger une palette
quand l'hôte du produit est en panne.

### 7.3 Ce que Plan ne doit jamais faire

- Décider sur le nom `PLATFORM_ADMIN` : seule la permission compte.
- Stocker le motif d'accès ailleurs qu'en mémoire, le temps de l'écran.
- Laisser une palette changer un export (§9.3).
- Bloquer le démarrage sur la palette : sans réponse, ce sont les couleurs d'origine.

---

## 8. Sécurité

| Risque | Parade |
|---|---|
| Injection CSS par une valeur | `^#[0-9a-f]{6}$` validé en entrée, par `CHECK` en base et à la lecture par le produit : trois verrous, chacun suffisant |
| Injection par un nom de jeton | noms limités à `^[a-z][a-z0-9-]{0,47}$` et pris dans le schéma ; le produit ne pose que des noms qu'il connaît (`jetons.ts`) |
| Un tenant lit la palette d'un autre | `GET /tenant/palette` prend le tenant de la session, jamais de la requête ; un tenant étranger répond `404` |
| Le personnel entre chez un tenant sans trace | motif `X-Access-*` obligatoire sur les routes tenant, écrit avec l'accès |
| Un manifeste compromis reconfigure un produit | le manifeste est **proposé**, appliqué par un opérateur (§4.1) |
| Une palette illisible (contraste) | avertissement calculé par le serveur, montré avant l'envoi ; restauration en un geste |
| Requête énorme | 64 Ko, refusés `413` avant lecture complète (comme `admin.php`) |
| CORS : l'écran de Plan appelle `/staff/*` depuis `plan.raillard.org` | l'origine de Plan doit figurer dans la liste CORS **des routes staff** ; à vérifier, c'est le premier risque (§11) |

---

## 9. Tests

### 9.1 backprod

- **Résolution** : tenant, puis produit, puis origine, jeton par jeton et thème par thème. Un jeton
  retiré du schéma n'est plus servi ; un jeton ajouté hérite de son origine.
- **Validation** : chaque ligne du tableau §6.5 a son test, et le `CHECK` en base est prouvé par
  une écriture qui contourne le service.
- **Garde** : sans `staff.palette.manage` → `403`. `SUPPORT_ADMIN`, `FINANCE_ADMIN` et
  `SALES_ADMIN` sont refusés. `TENANT_ADMIN` est refusé sur `/staff/*`, et en v2 il est refusé
  sans `white_label` avec un message **différent** de celui du refus de permission.
- **Motif** : route tenant sans `X-Access-Purpose` → `ACCESS_MOTIVE_REQUIRED`, et rien n'est
  journalisé comme lu.
- **Concurrence** : deux `PUT` sur la même révision → le second répond `409 PALETTE_STALE`.
- **Historique** : une restauration crée une révision nouvelle ; les 51e et suivantes sont élaguées.
- **Isolation** : la suite d'isolation existante gagne `GET /tenant/palette` (tenant A ne voit
  jamais B).
- **Contrat** : `openapi.json` décrit chaque route ; le `gate:client` de Plan les épingle.

### 9.2 Plan

- `styles/paletteServeur.ts` : conversion `light`/`dark` ↔ `clair`/`sombre`, normalisation de
  casse, et lecture tolérante d'une réponse partielle ou abîmée.
- Le manifeste engendré concorde avec `JETONS` et `PAIRES_CONTRASTE` (même test que
  `tests/unit/styles/jetons.test.ts`).
- Écran : portée produit puis tenant, héritage affiché, retrait d'un écart, `409` → rechargement,
  motif demandé une seule fois.
- Fumée : la page de connexion prend la palette du produit ; un membre du tenant A voit sa
  palette, un membre de B celle du produit.

### 9.3 L'invariant des empreintes

Les six empreintes de `tests/fixtures/golden/` sont recalculées avec une palette de produit **et**
une palette de tenant extrêmes. Elles doivent rester identiques au bit près. Un écart serait un
changement de version majeure (`MD/RELEASE.md`), donc un défaut de cette fonctionnalité.

---

## 10. Ordre de travail

Chaque étape laisse les deux systèmes utilisables.

| # | Côté | Étape | Livre |
|---|---|---|---|
| B1 | backprod | migration : 3 tables, colonne `tenant_skins.palette`, permission `staff.palette.manage` | rien de visible |
| P1 | Plan | servir `/.well-known/product.json` avec `schema_versions` **et** `palette`, engendré au build | le manifeste |
| B2 | backprod | lecture et application du schéma (`…/palette/schema`), écran console « Palette » en mode secours | le schéma en base |
| B3 | backprod | palette du produit : lecture publique et routes staff, audit, historique | la « palette admin » |
| P2 | Plan | lire `public/products/plan/palette` avant `admin/palette` ; écran `?palette` en portée produit, connecté à la plateforme | Plan suit la palette admin |
| B4 | backprod | palette du tenant : routes staff avec motif, `GET /tenant/palette` | les palettes par tenant |
| P3 | Plan | lire `/tenant/palette` après le contexte ; portée tenant dans l'écran, héritage, historique | v1 complète |
| P4 | Plan | recopier `.palette.json` comme palette du produit, puis retirer `admin/palette` et sa route PHP | un seul système |
| B5 | backprod | v2 : `PUT /tenant/palette` pour `TENANT_ADMIN` (`skin.manage` + `white_label`) | le libre-service |

Les étapes B1 à B4 et P1 à P3 sont la **v1** demandée : tout est réglé par le profil
`PLATFORM_ADMIN`.

---

## 11. Décisions ouvertes

| # | Question | Proposition |
|---|---|---|
| 1 | Une session ouverte sur la page de Plan (`X-Product: plan`) est-elle acceptée par les routes `/staff/*`, et l'origine de Plan est-elle permise par leur CORS ? La politique `STAFF` ne lit que l'identité (`RequestContextMiddleware`), mais l'audience du jeton et la liste CORS restent **à vérifier** | Oui sur les deux. Sinon l'écran riche reste dans Plan et passe par une session de console, ce qui est plus lourd |
| 2 | Une palette posée par le personnel s'applique-t-elle à un tenant qui n'a pas `white_label` ? | Oui : la capacité borne le libre-service, pas la décision de l'opérateur. C'est cohérent avec l'habillage, lu sans capacité |
| 3 | Motif `X-Access-*` aussi pour **écrire** la palette d'un tenant, ou seulement pour la lire ? | Pour les deux : écrire chez un client est au moins aussi sensible que lire |
| 4 | Le schéma des jetons vient du manifeste (proposé ici) ou d'une saisie dans la console ? | Manifeste : le produit est l'autorité sur ses jetons, comme sur ses versions de schéma |
| 5 | Les polices et les rayons (`--serif`, `--r-*`) entrent-ils dans la palette ? | Pas en v1. Le format le permettrait (`tokens[].kind`), mais une police n'a pas de `#rrggbb` qui la protège ; il faudra une liste fermée de valeurs |
| 6 | Le shell de la plateforme applique-t-il lui aussi la palette du produit à ses propres écrans ? | Non : la palette est celle d'un produit ; le shell garde l'habillage |

---

## 12. Définition de « fini » (v1)

- Un `PLATFORM_ADMIN` règle la palette de Plan depuis `?palette`, l'enregistre, et **tous** les
  tenants la voient au chargement suivant, page de connexion comprise.
- Il choisit un tenant, donne un motif, règle quelques jetons ; les membres de ce tenant voient
  ces jetons par-dessus la palette du produit, et les autres tenants rien de différent.
- Chaque écriture est dans l'audit avec ses différences, et toute révision se restaure en un geste.
- Un `SUPPORT_ADMIN`, un `TENANT_ADMIN` ou un membre qui ouvre `?palette` est refusé, avec une
  phrase qui dit pourquoi.
- Le fichier `admin/palette` n'existe plus, et sa palette est devenue celle du produit.
- Les six empreintes sont inchangées.
