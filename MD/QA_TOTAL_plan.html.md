# QA total (dynamique) — `plan.html`

**Date : 27 août 2026**
**Périmètre : exécution complète de l'application dans un navigateur, sur le jeu de données par défaut (parcelle AE 101, 35 objets, 11 mesures)**
**Statut global : 🟢 PASS — 3 défauts trouvés, 3 corrigés**

---

## 1. Synthèse

| Niveau | Nombre | Statut |
|---|---:|---|
| 🔴 CRITIQUE | 0 | — |
| 🟠 MAJEUR | 1 | Corrigé (confirmation avant « Réinitialiser tout ») |
| 🟡 MINEUR | 2 | Corrigés (tableau d’affichage, déclaration de `highlight`) |
| 🟢 OK | 26 zones | Parcourues sans erreur JS |

Aucune erreur JavaScript sur l'ensemble du parcours, chargement neuf compris.
Les trois défauts trouvés sont d’ergonomie et de robustesse, pas de calcul : la géométrie, les
exports et l'aller-retour JSON sont sortis indemnes.

---

## 2. Méthode

- Serveur local (`servir.ps1`, relecture du fichier à chaque requête) — obligatoire, `file://`
  bloque les appels IGN.
- Chargement avec paramètre anti-cache, puis **relecture du fichier réellement servi** (`curl`
  + `grep` d'un marqueur récent) avant de croire ce que montre le navigateur.
- Erreurs et messages relus **après un chargement neuf** : l'historique console d'un onglet garde
  les erreurs d'avant correction et donne de faux positifs.
- Vérification par l'état observable (DOM, `getComputedStyle`, compteurs d'éléments, longueurs de
  chaînes exportées), pas par lecture d'écran.

---

## 3. Couverture

| Zone | Vérification | Résultat |
|---|---|---|
| Boot | 35 objets, 13 catégories, titre + « 📍 Le Vésinet — 48,9052° N, 2,1328° E » | 🟢 |
| Sélecteur d'objets | filtres par famille, filtre par défaut `terrain` (14 boutons), puce de sélection courante | 🟢 |
| Onglets du panneau | Édition / Affichage / Mesure / PLU / Export | 🟢 |
| Panneau d'attributs | 10 types d'objets ouverts un par un | 🟢 |
| Ajout / duplication / suppression | 35 → 40 → 35 | 🟢 |
| Annuler (Ctrl+Z) | déroulé complet jusqu'au bouton désactivé | 🟢 |
| Tableau « Affichage par objet » | bascules par objet et par colonne, masquage → `display:none` sur le tracé | 🟢 (défaut F2) |
| Grille 2D | 16 lignes → 0 → 16 | 🟢 |
| Flèche du Nord | bascule | 🟢 |
| Mesures | 12 lignes, recalcul, vidage confirmé | 🟢 |
| Export résumé / SVG / DXF / PDF | résumé 5 323 caractères, fichiers assemblés | 🟢 |
| Dossier PDF | « 3 page(s) — plan de masse + 2 terrasse(s), 1 équipement(s) coté(s) » | 🟢 |
| Export JSON | « 35 objet(s), 11 mesure(s) » | 🟢 |
| Aller-retour JSON | `objetsIdentiques: true`, `mesuresIdentiques: true`, `ortho` et `affichage` conservés | 🟢 |
| Onglet Terrasse (7 sous-onglets) | Méthode : 15 308 caractères | 🟢 |
| Vue 3D | toutes les cases, bascule sans terrasse | 🟢 |
| Soleil | jour 227 / nuit 40 / sans lumière d'appoint 56 ; semaine d'hiver « ↑ 18° — vient du S » | 🟢 |
| Points de vue | 6 enregistrés + création « Point de vue 7 », annulable | 🟢 |
| Orthophoto | activation, opacités, 4 tuiles, niveau 19 (descente auto après le 404 attendu en z20) | 🟢 |
| Import cadastre | ouverture / annulation de la modale | 🟢 |
| Actualiser IGN | 2 radios + 4 cases, exécution « parcelle seule » | 🟢 |
| Voisinage | bascule haut-droite, objets retirés du plan **et** des filtres | 🟢 |
| Réinitialiser la position | message clair sur un objet créé après chargement, pas de plantage | 🟢 |
| Réinitialiser tout | restauration objets + mesures, annulable | 🟢 (défaut F1) |
| PLU | zonage, servitudes, SPR, lien territoire | 🟢 |
| Chargement neuf après corrections | 0 erreur, 35 objets, 19 tracés, 14 boutons | 🟢 |

---

## 4. 🟠 F1 — « Réinitialiser tout » agissait sans confirmation *(corrigé)*

**Ligne 3478**

Le bouton efface d'un clic tout le travail fait depuis le chargement — objets **et** mesures —
sans rien demander. Deux incohérences dans la même application :

- « Supprimer le projet » et « Supprimer toutes les mesures enregistrées » demandent
  confirmation, alors que la seconde n'est qu'une **partie** de ce que fait « Réinitialiser tout » ;
- l'action est annulable par Ctrl+Z (vérifié : 35 → 36 → 35), mais rien ne le dit à l'utilisateur
  au moment où il perd son travail.

**Correction appliquée** — passage par `showConfirm()`, le message précisant que l'annulation
existe :

```js
showConfirm('Reinitialiser tout le plan ? Les objets et les mesures reviennent a leur etat du chargement (annulable par Ctrl+Z).', ()=>{
  pushHistory();
  restoreState({ objects: initialState, measures: initialMeasures });
});
```

**Vérifié après correction :** la boîte s'ouvre ; « Annuler » ne touche à rien ; « Confirmer »
restaure bien (37 → 36 lignes de tableau, soit 35 objets).

---

## 5. 🟡 F2 — Le tableau « Affichage par objet » se reconstruisait à chaque clic *(corrigé)*

**Lignes 2911–2993**

Chaque case appelle `render()`, qui rappelle `renderDispTable()`, qui faisait `tbl.innerHTML = ''` :
la case qu'on venait de cocher était **détachée du DOM** au moment même où elle traitait son propre
événement. Conséquences : le focus clavier repartait au début de la page à chaque case cochée, et
toute vérification portant sur l'élément cliqué mesurait un élément mort — c'est ce qui a produit
le faux positif décrit au §7.

C'est la même faiblesse que celle déjà corrigée sur la liste des parcelles voisines
(reconstruction complète au lieu d'une mise à jour ciblée).

**Correction appliquée** — le tableau n'est reconstruit que si la liste d'objets change
(signature `clé + nom`, ligne 2936) ; sinon les cases sont simplement remises à jour. Et, parce que
les lignes survivent désormais aux `render()` successifs alors que `restoreState()` remplace les
objets par des copies, chaque case retient **la clé** de son objet et non l'objet lui-même :

```js
const cle = obj.key;
const cible = ()=>objects.find(o=>o.key === cle);
cb.addEventListener('change', ()=>{ const o=cible(); if(!o) return; o[col.field]=cb.checked; markDirty(); render(); });
```

Sans cette précaution, après une réinitialisation les cases auraient écrit dans des objets détachés
du plan — un bug silencieux, plus gênant que celui corrigé.

**Vérifié après correction :** la case reste le même élément après `render()` (`memeElement: true`),
garde le focus (`focusApresRender: true`), masque bien le tracé (`display: inline → none → inline`) ;
le tableau se reconstruit quand il le faut (duplication : 36 → 37 lignes, signature modifiée) ; et
après « Réinitialiser tout » les cases pilotent toujours les objets vivants.

---

## 6. 🟡 F3 — `highlight` était lu par une fonction appelée avant sa déclaration *(corrigé)*

**Avant : déclaration ligne 3016 ; `rebuildSelector()` appelée pendant le boot bien plus haut**

Balayage systématique de la classe de bug livrée cette semaine (zone morte temporelle) : toutes les
déclarations `let`/`const` de premier niveau situées après le premier appel de `rebuildSelector()`
ont été croisées avec le corps des fonctions exécutées pendant le boot. **Une seule occurrence** en
ressort, `highlight`.

Elle était sans effet visible — la lecture se fait dans le gestionnaire de clic d'un bouton, jamais
évaluée pendant le boot — mais c'est exactement le motif qui a planté l'application chez
l'utilisateur avec `voisinageVisible`. Les trois variables sont désormais déclarées ensemble en tête
de la section « Selector buttons » (lignes 1460–1462), avec le commentaire qui explique pourquoi
elles ne sont pas rangées près du code qui les pilote :

```js
let voisinageVisible = true;
let grilleVisible = true;
let highlight = {type:null, index:null};
```

Note de méthode retenue au passage : `DISP_COLS` avait été hissé au niveau global pendant la
correction F2, recréant ce même motif ; le tableau des colonnes a été remis en variable locale.

**Vérifié :** chargement d'un plan contenant réellement un objet `voisinage` (le jeu de démonstration
n'en a aucun, et c'est ce qui avait masqué le plantage) — aucune erreur, bascule du voisinage
fonctionnelle (`display: inline → none → inline`), 14 boutons, 36 lignes de tableau. Fichier de
reproduction supprimé après le test.

---

## 7. Faux positif de cette campagne

Une transparence de parcelle « bloquée à 1 » a été signalée en cours de session : c'était un artefact
de test, pas un défaut. Deux causes cumulées — la case cliquée était détachée par la reconstruction
du tableau (F2), et le sélecteur utilisé (`polygon[data-role="obj"]`) ne visait pas le bon élément
(`polygon[data-key="parcelle"]`). L'opacité de parcelle fonctionne et se sauvegarde
(`ortho:{actif:true,opacite:0.6,parcelleOpacite:0.15}`).

---

## 8. Non couvert

- **Rendu visuel des PDF** : jamais regardé. Les fichiers sont validés par leur structure (table
  xref, longueurs de flux, coordonnées toutes dans la boîte A4, aucun texte de cote à l'intérieur
  d'un contour), pas par l'œil. Une relecture humaine d'un dossier imprimé reste à faire.
- **Export PNG et export GLB** : vérifiés plus tôt dans la session (analyse du bloc JSON du GLB,
  200 maillages), non rejoués dans cette campagne.
- **Écriture serveur** (`api.php`) : sauvegarde et suppression de projet non exercées, pour ne pas
  toucher aux fichiers de projet existants.
- **Import cadastre complet** : la modale est ouverte et annulée ; un import réel créant un nouveau
  projet n'a pas été lancé.

---

## 9. Incident : le fichier est revenu en arrière après la campagne

Entre la fin de la QA et la correction de F3, `plan.html` sur le disque était revenu à un état
antérieur (13 455 lignes, horodatage 19:57) : les corrections F1 et F2 avaient disparu **et le
plantage au démarrage était de retour** — `voisinageVisible` de nouveau déclaré ligne 7399 alors
que `rebuildSelector()` le lit ligne 1475.

Cause non établie. Aucune copie de conflit dans le dossier ; le dossier est synchronisé par
OneDrive et le fichier peut aussi avoir été écrasé par un éditeur gardant un tampon ancien.

Les quatre correctifs ont été réappliqués et revérifiés (fichier de 13 487 lignes) :

| Correctif | Ligne | État |
|---|---:|---|
| Déclarations `voisinageVisible` / `grilleVisible` / `highlight` en tête de section | 1460–1462 | ✅ |
| `renderDispTable()` mis à jour sur place | 2911 | ✅ |
| Confirmation avant « Réinitialiser tout » | 3478 | ✅ |

**Leçon de méthode :** ne pas supposer qu'une modification vérifiée dans le navigateur est encore
sur le disque une heure plus tard. Avant toute reprise, `grep` d'un marqueur récent dans le fichier
**et** dans ce que sert réellement le serveur.
