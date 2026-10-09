# Voir chez vous — la réalité augmentée

**Version :** 1.0 — non publiée. Module `three/ar.ts`, commande `visionneuse.ar`.

## 1. Ce que fait la fonction

Depuis la **visionneuse GLB**, « Voir chez vous (réalité augmentée) » pose le modèle 3D de la
terrasse grandeur nature dans l'image de la caméra d'un téléphone ou d'une tablette. Le modèle est
le `.glb` que la visionneuse a déjà en mémoire (`glb.dernierExporte`) : rien n'est téléversé, il est
servi au composant par une URL `blob:`.

Le composant est `<model-viewer>` (Google), chargé à la demande depuis le CDN jsDelivr comme l'est
three.js, à une version épinglée (`MODEL_VIEWER_URL`, 3.5.0) :

| Appareil | Mode | Ce qui se passe |
|---|---|---|
| Android, Chrome | `webxr` | l'AR s'ouvre dans la page ; on pose la terrasse sur le sol |
| iPhone, iPad, Safari | `quick-look` | model-viewer produit un USDZ depuis le `.glb` et l'ouvre dans Quick Look |
| Ordinateur | — | le modèle se montre, le conseil dit sur quoi l'ouvrir ; pas de bouton AR |

Le mode Scene Viewer d'Android n'est pas demandé : il exige une URL publique du modèle.

## 2. L'interface

Une superposition plein écran (`.voileAR`, Z8 par nature) : le nom de la terrasse et Fermer en
tête, le modèle au milieu (orbite au doigt), le bouton « Voir chez vous » posé sur le modèle (le
`slot="ar-button"` de model-viewer, qui ne s'affiche que si un mode est possible), le conseil dessous
(`conseilAR`). Échap ferme. La fermeture libère l'URL du modèle.

La commande est grisée sans modèle généré ou pendant une génération. Elle est exposée dans la
visionneuse pour les trois classes d'écran (`app/exposition.ts`).

## 3. Serveur

La CSP livrée permet `blob:` dans `connect-src` : model-viewer lit le modèle par `fetch` sur l'URL
blob. jsDelivr est déjà permis dans `script-src`.

## 4. Vérifié

`tests/unit/three/ar.test.ts` : capacités par appareil, attributs posés sur model-viewer, conseil,
fermeture et libération de l'URL, chargement unique à la version épinglée. L'AR elle-même ne se
vérifie qu'en main : un téléphone, le projet ouvert, Visionneuse › Générer › Voir chez vous.
