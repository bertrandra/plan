# Journal des modifications

Format [Keep a Changelog 1.1](https://keepachangelog.com/fr/1.1.0/), versionnement selon
[`MD/RELEASE.md`](MD/RELEASE.md). Les versions les plus récentes en premier.

## [1.0.0] — 2026-08-28

Première version numérotée. Elle **fige l'application mono-page existante telle qu'elle est** et
lui donne une identité de version : aucune fonction du plan, aucun calcul et aucune géométrie ne
changent par rapport à l'état du 27 août. Les empreintes de référence sont capturées dans
`tests/fixtures/golden/`.

### Ajouté

- Numéro de version affiché à droite de la barre de projet (`v1.0.0`), avec le détail — build,
  version de schéma, version d'API — dans l'infobulle.
- Estampille de version dans les fichiers de projet : `meta.appVersion`, `meta.schemaVersion` et
  `meta.writtenAt`, à l'export JSON comme à l'enregistrement serveur.
- Estampille dans les exports : commentaire `999` en tête du DXF, attributs `data-app-version` et
  `data-schema-version` sur la racine SVG, dictionnaire `/Info` (`/Producer`, `/Creator`,
  `/CreationDate`) et pied de page sur chaque page des PDF, première ligne du résumé texte.
- En-têtes `X-App-Version` et `X-Schema-Version` sur toutes les requêtes vers `api.php`.
- Refus explicite d'un fichier de projet enregistré par une version plus récente : le plan en
  cours est laissé intact et le message invite à recharger la page. Charger partiellement un tel
  fichier puis l'enregistrer effacerait sans bruit les champs inconnus.
- Confirmation avant « Réinitialiser tout », qui efface d'un clic tout le travail fait depuis le
  chargement, mesures comprises.

### Corrigé

- Plantage au démarrage sur un plan contenant des objets de voisinage : trois variables d'état
  d'affichage étaient déclarées après la fonction qui les lit pendant le boot.
- Le tableau « Affichage par objet » se reconstruisait à chaque case cochée, détachant du DOM la
  case en cours d'utilisation et faisant perdre le focus clavier.

### Interne

- Empreintes de référence des six exports et fixture des quantités calculées
  (`tests/fixtures/golden/`), servant de garde-fou aux versions suivantes.
- `api.php` conserve la version du client qui a écrit chaque projet.
