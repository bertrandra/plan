# QA statique complet — `plan.html`

**Date : 26 août 2026**  
**Périmètre : analyse statique du fichier `plan.html`**  
**Statut global : 🔴 FAIL pour release**

---

## 1. Synthèse

| Niveau | Nombre | Statut |
|---|---:|---|
| 🔴 CRITIQUE | 1 | À corriger avant utilisation fiable |
| 🟠 MAJEUR | 7 | À corriger avant livraison |
| 🟡 MINEUR | 4 | À corriger ensuite |
| 🟢 OK | nombreux | Fonctions correctement structurées |

Le socle est globalement solide sur la géométrie, la reconstruction DOM, l'export GLB et l'architecture 3D.

Les principaux risques concernent la **gestion d'état**, le couple **Dirty / Undo / Reset**, ainsi que le **cycle de vie Three.js / GPU**.

---

# 2. 🔴 CRITIQUE

## C1 — « Réinitialiser la position » peut planter sur les objets créés après le chargement

**Lignes : 3083–3094**

Le code recherche l'objet dans `initialState` :

```js
const init = initialState.find(o=>o.key===selectedKey);
```

`initialState` est créé au chargement, ligne 1023 :

```js
const initialState = JSON.parse(JSON.stringify(objects));
```

Pour un objet créé, dupliqué ou importé après le chargement, `init` peut être `undefined`.

Le code tente ensuite d'accéder à :

```js
init.center
init.pts
```

### Impact

Séquence problématique :

1. créer un nouvel objet ;
2. le sélectionner ;
3. cliquer « Réinitialiser la position ».

→ exception JavaScript possible.

### Correction

Ajouter un garde-fou :

```js
const init = initialState.find(o => o.key === selectedKey);

if (!init) {
  showToast('Aucune position initiale enregistrée pour cet objet.');
  return;
}
```

Correction préférable : stocker une position de référence au moment de la création de chaque objet.

---

# 3. 🟠 MAJEURS

## M1 — Le système « modifications non enregistrées » ne détecte pas toutes les modifications

**Référence principale : lignes 851–856**

`dirty` est principalement activé dans `pushHistory()` :

```js
function pushHistory(){
  history.push(snapshotState());
  ...
  dirty = true;
}
```

Mais plusieurs modifications persistantes ne déclenchent pas `pushHistory()`.

### Exemples

Nom — lignes 1874–1882 :

```js
obj.name = inp.value;
```

Couleur — lignes 1938–1944 :

```js
obj.fill = colorInp.value;
```

Fonction — lignes 1953–1959 :

```js
obj.fonction = fnSelect.value;
```

Matière — lignes 1967–1970 :

```js
obj.matiere = matInp.value;
```

Élévation — lignes 1995–1999 :

```js
obj.elevation = ...
```

Textures — lignes 2027–2047.

### Impact

L'utilisateur peut modifier le projet sans que l'application considère nécessairement qu'il existe des modifications non enregistrées.

### Correction

Créer un mécanisme central :

```js
function markDirty() {
  dirty = true;
  refreshProjectStatus();
}
```

Et idéalement encapsuler les mutations :

```js
function mutate(fn) {
  pushHistory();
  fn();
  render();
}
```

Toutes les mutations persistantes doivent passer par ce mécanisme.

---

## M2 — Les paramètres Construction ne sont pas annulables correctement par Undo

Les paramètres de construction sont modifiés directement, par exemple :

**lignes 6762–6786**

```js
c.avecLambourde = ...
c.lambourdeSection = ...
c.lambourdeEntraxe = ...
```

Le problème est identique pour :

- vis ;
- plots ;
- charges ;
- entraxes ;
- sections ;
- essence ;
- épaisseurs ;
- lames ;
- finitions ;
- prix ;
- débits.

### Impact

Ctrl+Z peut ne pas restaurer les modifications de construction.

### Correction

Toute modification de `construction` doit créer un snapshot avant mutation.

---

## M3 — Les mesures ne participent pas correctement à Undo / Dirty / Reset

Les mesures constituent une structure d'état séparée :

```js
let measures = (seed.measures || []).map(m=>({...m}));
```

**Ligne 4092.**

Ajout :

**lignes 4311–4326**

```js
measures.push(...)
```

Suppression :

**ligne 4367**

```js
measures = measures.filter(...)
```

Modification d'affichage :

**lignes 4362–4363**

```js
m.show = cb.checked
```

Ces opérations ne sont pas systématiquement enregistrées dans l'historique.

Par ailleurs, `snapshotState()` sauvegarde uniquement les objets :

```js
return serializeObjects(objects);
```

**Lignes 843–847.**

### Impact

Un Undo ne restaure pas nécessairement l'état complet du projet lorsque les mesures sont concernées.

### Correction

Le snapshot doit inclure au minimum :

```js
{
  objects: serializeObjects(objects),
  measures: serializeMeasures(measures)
}
```

Et `undo()` doit restaurer les deux.

---

## M4 — « Réinitialiser tout » ne réinitialise pas réellement tout

**Lignes 3098–3117**

La fonction restaure certaines propriétés géométriques et d'affichage mais pas nécessairement l'ensemble des propriétés persistées.

`serializeObjects()` contient notamment :

- elevation ;
- altitude ;
- textures ;
- construction ;
- clôture ;
- parasol ;
- coordonnées GPS ;
- etc.

**Lignes 4654–4682.**

### Autres problèmes

Les objets ajoutés après le chargement ne sont pas supprimés.

Les objets supprimés après le chargement ne sont pas recréés.

### Correction

Utiliser une restauration complète d'un snapshot :

```js
restoreState(initialState);
```

avec un snapshot complet du projet.

---

## M5 — Le fallback API peut masquer une perte de projet

**Lignes 813–832**

En cas d'échec de chargement, le code peut revenir vers les données DEMO :

```js
apiAvailable:false,
...
objects: DEMO_OBJECTS
```

### Impact

Une panne API peut donner l'impression que le projet réel a été remplacé ou perdu.

### Correction

Différencier :

- API absente ;
- API temporairement inaccessible ;
- projet introuvable ;
- JSON invalide.

Afficher une erreur explicite et proposer « Réessayer » plutôt que remplacer silencieusement le projet par DEMO.

---

## M6 — Risque de fuite mémoire GPU Three.js

**Lignes 7304–7310**

`disposeThreeScene()` libère le renderer mais ne dispose pas systématiquement :

- géométries ;
- matériaux ;
- textures ;
- autres ressources GPU.

La scène est régulièrement reconstruite, notamment via :

```js
disposeThreeScene();
```

**Ligne 7646.**

### Impact

Après de nombreuses reconstructions 3D et utilisations de textures, la mémoire GPU peut augmenter fortement.

### Correction

Parcourir la scène avant destruction :

```js
scene.traverse(obj => {
  if (!obj.isMesh) return;

  obj.geometry?.dispose();

  const materials = Array.isArray(obj.material)
    ? obj.material
    : [obj.material];

  materials.forEach(mat => {
    Object.values(mat).forEach(v => {
      if (v && v.isTexture) v.dispose();
    });
    mat.dispose();
  });
});
```

Puis appeler `renderer.dispose()`.

---

## M7 — Injection HTML possible dans la fenêtre d'impression Implantation

**Lignes 8901–8918**

Le nom d'objet est injecté dans `document.write()`.

Le nom est éditable par l'utilisateur, notamment lignes 1873–1878.

### Impact

Un nom contenant du HTML peut être interprété dans la nouvelle fenêtre.

### Correction

Éviter `document.write()` avec des données utilisateur.

Utiliser `textContent` ou un échappement HTML robuste.

---

# 4. 🟡 MINEURS

## m1 — Réimport immédiat du même fichier SVG

**Lignes 4452–4458**

La valeur du champ `<input type=file>` n'est pas systématiquement remise à zéro.

### Impact

Sélectionner deux fois le même fichier peut ne pas déclencher `change`.

### Correction

Après traitement :

```js
e.target.value = '';
```

---

## m2 — `signedArea()` est déclarée deux fois

Deux définitions :

- ligne 1764 ;
- ligne 5332.

Les implémentations sont équivalentes.

### Correction

Conserver une seule définition.

---

## m3 — Parser SVG externe incomplet

**Lignes 4542–4554**

Le parser traite principalement :

- `M`
- `L`
- `C`

Des commandes SVG comme :

- `H`
- `V`
- `Q`
- `S`
- `T`
- `A`

peuvent être mal interprétées.

### Correction

Soit documenter clairement la limitation, soit utiliser un parser SVG path complet.

---

## m4 — PDF et caractères Unicode

**Lignes 3687–3693**

`pdfEscape()` ne couvre pas nécessairement tous les caractères Unicode.

### Correction

Utiliser une police Unicode embarquée ou une bibliothèque PDF plus complète.

---

# 5. 🟢 OK

## O1 — Syntaxe JavaScript

Le contrôle syntaxique JavaScript effectué sur les scripts extraits du HTML ne détecte aucune erreur de syntaxe.

---

## O2 — Références DOM

Contrôle réalisé sur :

- 135 IDs HTML ;
- 126 références `getElementById()` ;
- 64 listeners directs.

Aucune référence DOM manifestement orpheline n'a été identifiée, hors deux IDs créés dynamiquement :

- `pdfOpenLink`
- `svgOpenLink`

---

## O3 — Architecture Undo

L'approche de reconstruction à partir de snapshots est bonne :

```js
serializeObjects(objects)
```

puis :

```js
normalizeObjects(snapshot)
createObjectDOM()
rebuildHandles()
```

**Lignes 858–887.**

Le problème est principalement le périmètre incomplet du snapshot et l'absence de `pushHistory()` sur certaines mutations.

---

## O4 — Export GLB

La chaîne GLB attend correctement le chargement des textures avant l'appel à `GLTFExporter.parse()`.

Un timeout de sécurité existe également pour éviter un blocage permanent du bouton d'export.

---

## O5 — Visionneuse GLB

La visionneuse relit le GLB réellement exporté plutôt que de reconstruire une scène indépendante.

C'est une bonne architecture de validation du livrable.

---

## O6 — Export PDF

Le téléchargement dispose d'un fallback avec lien d'ouverture manuelle, ce qui améliore la robustesse face aux restrictions des navigateurs.

---

## O7 — Optimisation terrasse

Le moteur compare différentes configurations et fournit une indication de densité / coût.

Le logiciel précise également que le résultat est un pré-dimensionnement indicatif et non une note de calcul.

---

# 6. Plan de correction recommandé

## P0 — Avant toute nouvelle release

### 1. Corriger `resetPos`

Ajouter une protection contre `initialState === undefined`.

### 2. Repenser Dirty / History

Créer un système central de mutation :

```js
mutate(fn)
```

et faire passer toutes les modifications persistantes par celui-ci.

---

## P1 — Avant livraison

### 3. Étendre le snapshot

Inclure :

```js
{
  objects,
  measures,
  construction,
  projectSettings
}
```

selon la structure réelle de l'application.

### 4. Refaire `Réinitialiser tout`

Restaurer un snapshot complet plutôt que recopier manuellement quelques propriétés.

### 5. Sécuriser le chargement API

Ne jamais basculer silencieusement vers DEMO lorsqu'un projet réel ne peut pas être chargé.

### 6. Nettoyer les ressources Three.js

Disposer géométries, matériaux et textures.

---

## P2 — Durcissement

### 7. Sécuriser l'impression

Supprimer les injections via `document.write()`.

### 8. Corriger l'import SVG

Réinitialiser le file input et améliorer le parser des paths.

### 9. Nettoyer le code

Supprimer la double définition de `signedArea()`.

### 10. Améliorer Unicode PDF

---

# 7. Verdict

## 🔴 RELEASE : FAIL

Le logiciel présente un socle technique exploitable mais ne doit pas être considéré comme totalement QA-ready tant que les problèmes suivants ne sont pas corrigés :

1. **Dirty incomplet**
2. **Undo incomplet**
3. **Reset incomplet**
4. **Mesures hors snapshot**
5. **Risque de fallback silencieux vers DEMO**
6. **Gestion mémoire Three.js**

Le problème prioritaire est la **cohérence globale de l'état du projet**.

Une fois ce chantier corrigé, un **QA statique V2** doit être réalisé, suivi d'un **QA fonctionnel navigateur** avec tests systématiques de chaque parcours utilisateur.
