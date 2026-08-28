# PLAN — Spécification fonctionnelle et technique
## Capture intelligente d’une façade avec un seul iPhone

**Version : V1.0 — Pilote**

---

## 1. Objectif

Permettre à un utilisateur de capturer automatiquement une façade de maison avec **un seul iPhone**, en étant guidé par Plan vers plusieurs points de prise de vue.

Les captures doivent permettre de :

1. identifier la façade ;
2. positionner approximativement l'utilisateur ;
3. guider l'utilisateur vers les points de capture ;
4. contrôler l’orientation du téléphone ;
5. contrôler le cadrage ;
6. capturer les photos ;
7. enregistrer les métadonnées de chaque prise de vue ;
8. préparer les images pour créer une **skin réaliste de façade** ;
9. appliquer cette skin au modèle 3D existant de Plan.

### Principe fondamental

Le GPS n'est **pas utilisé comme instrument de précision**.

Il sert à initialiser la position.

La précision locale est obtenue avec :

- caméra ;
- IMU ;
- ARKit ;
- éventuellement LiDAR ;
- analyse de l'image.

---

## 2. Expérience utilisateur

### Étape 0 — Autorisations

Au premier lancement :

- autorisation caméra ;
- autorisation localisation ;
- autorisation mouvement/capteurs ;
- autorisation AR.

Message utilisateur :

> Plan utilise votre caméra et votre position uniquement pour vous guider autour de votre maison et reconstruire votre façade.

---

## 3. Détection de la parcelle

Plan connaît déjà :

- coordonnées de la parcelle ;
- géométrie cadastrale ;
- bâtiment ;
- géométrie 3D éventuelle ;
- orientation du bâtiment.

Le téléphone fournit :

```text
GPS latitude
GPS longitude
heading
altitude éventuelle
accuracy
```

Plan détermine :

```text
distance utilisateur → bâtiment
direction utilisateur → bâtiment
façade potentiellement visible
```

Le GPS sert uniquement à cette première estimation.

---

## 4. Sélection de la façade

Le modèle 3D du bâtiment contient idéalement des surfaces :

```typescript
type Facade = {
    id: string;
    normal: Vector3;
    center: Vector3;
    width: number;
    height: number;
    orientation: number;
};
```

Exemple :

```text
FAÇADE SUD
Orientation : 182°
Largeur : 11.8 m
Hauteur : 6.4 m
```

---

## 5. Génération automatique des points de capture

Plan génère automatiquement les positions recommandées.

Pour une façade simple :

```text
              P3
               ●

      P2       P4
       ●        ●

P1 ● ┌─────────────────┐ ● P5
     │                 │
     │     FAÇADE      │
     │                 │
     └─────────────────┘
```

### Points minimum

- P1 : angle gauche ;
- P2 : gauche ;
- P3 : centre ;
- P4 : droite ;
- P5 : angle droit.

### Paramètres

```typescript
type CapturePoint = {
    id: string;
    position: Vector3;
    target: Vector3;
    distance: number;
    horizontalAngle: number;
    verticalAngle: number;
    toleranceDistance: number;
    toleranceAngle: number;
};
```

Les valeurs sont calculées dynamiquement selon :

- largeur façade ;
- hauteur façade ;
- distance disponible ;
- obstacles ;
- champ de vision caméra.

---

## 6. Guidage utilisateur

L'écran affiche une interface AR.

Exemple :

```text
┌─────────────────────────────┐
│ PLAN                        │
│                             │
│       ┌─────────────┐       │
│       │   FAÇADE    │       │
│       │      ✓      │       │
│       └─────────────┘       │
│                             │
│        ● POINT 3            │
│                             │
│ ← 1,8 m                     │
│                             │
│ Tournez de 12° →            │
│                             │
│ ✓ Position                  │
│ ✓ Orientation               │
│ ✓ Cadrage                   │
│                             │
│       PRENDRE LA PHOTO      │
└─────────────────────────────┘
```

---

## 7. Positionnement

### Niveau 1 — GPS

Utilisé pour :

- initialiser la position ;
- détecter que l'utilisateur est à proximité ;
- déterminer le côté du bâtiment.

Précision attendue :

**quelques mètres**.

Cela est acceptable.

### Niveau 2 — ARKit

Une fois proche du bâtiment :

- suivi de mouvement ;
- position relative ;
- orientation ;
- déplacement ;
- estimation de profondeur.

ARKit devient la référence locale.

### Niveau 3 — Vision

La caméra vérifie :

- présence de la façade ;
- orientation ;
- cadrage ;
- éléments architecturaux ;
- cohérence avec les autres photos.

---

## 8. Validation d'une position

Une photo peut être prise uniquement lorsque :

```typescript
positionValid === true
orientationValid === true
framingValid === true
imageQualityValid === true
```

Exemple :

```typescript
type CaptureValidation = {
    position: boolean;
    orientation: boolean;
    framing: boolean;
    sharpness: boolean;
    exposure: boolean;
    facadeDetected: boolean;
};
```

---

## 9. Capture

Chaque capture produit :

```typescript
type FacadePhoto = {
    id: string;
    image: Blob;

    gps: {
        latitude: number;
        longitude: number;
        accuracy: number;
    };

    camera: {
        focalLength: number;
        width: number;
        height: number;
        orientation: number;
    };

    ar: {
        position: number[];
        rotation: number[];
    };

    capturePointId: string;

    timestamp: string;
};
```

---

## 10. Contrôle qualité automatique

Avant validation :

### Image

- netteté ;
- exposition ;
- contraste ;
- résolution ;
- flou de mouvement.

### Géométrie

- façade suffisamment visible ;
- perspective acceptable ;
- chevauchement avec les autres photos.

### Capture

- position ;
- orientation ;
- distance.

Si insuffisant :

> ⚠️ Photo insuffisante  
> Reculez de 1,2 m.

ou :

> ⚠️ Façade partiellement masquée  
> Déplacez-vous légèrement vers la gauche.

---

## 11. Mode LiDAR

Si l'iPhone dispose d'un LiDAR :

```typescript
const capabilities = {
    lidar: true
};
```

Plan active automatiquement les fonctions supplémentaires :

- profondeur ;
- surfaces ;
- géométrie locale ;
- estimation des distances ;
- meilleure segmentation façade.

Le LiDAR est **optionnel**.

La V1 doit fonctionner sans LiDAR.

---

## 12. Reconstruction de la façade

La reconstruction ne doit pas nécessairement être effectuée sur l'iPhone.

Architecture recommandée :

```text
iPhone
   │
   │ photos + métadonnées
   ▼
Plan API
   │
   ├── image processing
   ├── computer vision
   ├── facade segmentation
   ├── camera estimation
   ├── texture generation
   └── UV projection
   │
   ▼
Facade Skin
   │
   ▼
GLB / textures
```

---

## 13. Concept de « Facade Skin »

La géométrie existante du bâtiment est conservée.

La photo fournit l'apparence.

```text
BUILDING 3D
     +
PHOTO
     ↓
FACADE SKIN
     ↓
TEXTURED BUILDING
```

La skin doit pouvoir être indépendante de la géométrie.

```typescript
type FacadeSkin = {
    facadeId: string;

    texture: string;

    resolution: {
        width: number;
        height: number;
    };

    uvTransform: number[];

    sourcePhotos: string[];

    confidence: number;
};
```

---

## 14. Three.js

Le modèle final est chargé dans Three.js.

```typescript
const model = await loader.loadAsync(buildingUrl);

scene.add(model.scene);
```

La texture est appliquée à la surface correspondante.

```typescript
facadeMesh.material.map = facadeTexture;
facadeMesh.material.needsUpdate = true;
```

---

## 15. Gestion des variantes

Une fois la façade reconstruite, Plan peut créer des variantes :

```text
FAÇADE EXISTANTE

        ↓

┌──────────────────────────┐
│ Enduit blanc             │
│ Pierre                   │
│ Bois                     │
│ Brique                   │
│ Nouvelle couleur         │
│ Nouvelles fenêtres       │
│ Nouveaux volets          │
│ Végétalisation           │
└──────────────────────────┘
```

La géométrie et la skin d'origine sont conservées.

---

## 16. Architecture logicielle

### Front-end

```text
TypeScript
   │
   ├── Camera
   ├── GPS
   ├── AR
   ├── Capture
   ├── Validation
   ├── UI
   └── Three.js
```

### Backend

```text
API
 │
 ├── Image processing
 ├── Computer vision
 ├── Facade reconstruction
 ├── Texture generation
 ├── Asset management
 └── 3D processing
```

---

## 17. Modèle de données

```typescript
interface FacadeCaptureSession {
    id: string;

    buildingId: string;
    facadeId: string;

    device: {
        model: string;
        lidar: boolean;
        osVersion: string;
    };

    capturePoints: CapturePoint[];

    photos: FacadePhoto[];

    status:
        | "created"
        | "capturing"
        | "processing"
        | "completed"
        | "failed";

    result?: FacadeSkin;
}
```

---

## 18. Workflow complet

```text
1. Ouvrir Plan
        ↓
2. Localisation GPS
        ↓
3. Identifier bâtiment
        ↓
4. Identifier façade
        ↓
5. Générer points de capture
        ↓
6. Guider utilisateur
        ↓
7. ARKit
        ↓
8. Contrôle caméra
        ↓
9. Photo P1
        ↓
10. Photo P2
        ↓
11. Photo P3
        ↓
12. Photo P4
        ↓
13. Photo P5
        ↓
14. Contrôle qualité
        ↓
15. Upload
        ↓
16. Reconstruction
        ↓
17. Facade Skin
        ↓
18. Application Three.js
        ↓
19. Façade 3D réaliste
        ↓
20. Transformation / projet
```

---

## 19. Critères de réussite du pilote

Le pilote est considéré comme réussi si un utilisateur non technicien peut :

1. ouvrir Plan ;
2. sélectionner sa maison ;
3. être guidé vers une façade ;
4. réaliser les 5 prises de vue sans assistance ;
5. obtenir une façade 3D texturée ;
6. reconnaître immédiatement sa maison ;
7. visualiser une transformation.

### KPI principal

**Temps entre “je commence” et “je vois ma maison en 3D”.**

Objectif pilote :

**< 5 minutes.**

---

## 20. Principe produit

La technologie doit rester invisible.

L'utilisateur ne doit jamais comprendre :

- GPS ;
- ARKit ;
- photogrammétrie ;
- UV ;
- mesh ;
- texture ;
- API.

Il doit simplement vivre :

> **Je filme ma maison → Plan la comprend → je peux commencer à imaginer mon projet.**

---

## 21. Évolution V2

Après validation du pilote :

- capture toiture ;
- plusieurs façades ;
- fenêtres automatiquement détectées ;
- portes ;
- volets ;
- matériaux ;
- végétation ;
- mobilier extérieur ;
- terrasse ;
- pergola ;
- extension ;
- comparaison avant/après ;
- génération automatique de variantes ;
- mode AR permettant de visualiser le projet directement devant la maison.

---

## Positionnement de la fonctionnalité

### PLAN FAÇADE SCAN

**Promesse :**

> **Scannez votre maison. Transformez-la. Visualisez votre projet en 3D.**

Cette fonctionnalité peut devenir l'un des principaux éléments différenciants de Plan.


---

# 22. Architecture de déploiement — Web App puis module mobile

## 22.1 Recommandation

La fonctionnalité **PLAN Façade Scan** ne nécessite pas de transformer l'ensemble de Plan en application mobile.

L'architecture recommandée est hybride :

```text
                         PLAN
                 Web App TypeScript
                        │
          ┌─────────────┴─────────────┐
          │                           │
     Desktop / Web               iPhone Scan
          │                           │
          │                    Camera + GPS
          │                    ARKit + IMU
          │                    LiDAR si disponible
          │                           │
          └─────────────┬─────────────┘
                        ↓
                    Plan API
                        ↓
                 Facade Processing
                        ↓
                   Facade Skin
                        ↓
                    Three.js
```

## 22.2 Phase 1 — Web App / PWA

Le pilote doit être réalisable en **Web App TypeScript**, idéalement sous forme de PWA.

L'utilisateur peut ouvrir Plan directement sur iPhone et, si nécessaire, ajouter Plan à l'écran d'accueil.

### Objectifs

Valider sans application native :

- accès caméra ;
- GPS ;
- orientation disponible sur le navigateur ;
- capture des photos ;
- guidage basique ;
- upload ;
- traitement serveur ;
- génération de Facade Skin ;
- affichage Three.js ;
- expérience utilisateur.

### Avantage

Cette phase permet de tester le concept commercial et technique avant d'investir dans une application native.

---

## 22.3 Limites de la Web App

Une Web App peut gérer correctement :

- caméra ;
- GPS ;
- photos ;
- données EXIF selon le contexte ;
- Three.js ;
- WebGL/WebGPU selon le navigateur ;
- upload ;
- interface utilisateur.

En revanche, elle est moins adaptée à l'exploitation complète des capacités natives de l'iPhone, notamment :

- ARKit ;
- suivi spatial avancé ;
- accès uniforme aux capteurs ;
- LiDAR ;
- contrôle fin de la caméra.

La Web App doit donc considérer le GPS comme une aide à la localisation, et non comme un système de positionnement précis.

---

## 22.4 Phase 2 — Module iOS natif

Si le pilote est validé, créer une application iOS légère dédiée au scan.

### Rôle de l'application

L'application native ne remplace pas Plan.

Elle sert principalement de :

**"Capture Engine"**

Elle fournit :

- caméra ;
- GPS ;
- ARKit ;
- IMU ;
- LiDAR si disponible ;
- position de caméra ;
- orientation ;
- profondeur ;
- images ;
- métadonnées.

Les données sont ensuite envoyées à l'API Plan.

---

## 22.5 Principe d'architecture

```text
iPhone
  │
  ├── Camera
  ├── GPS
  ├── ARKit
  ├── IMU
  └── LiDAR
       │
       ▼
Facade Capture Package
       │
       ▼
     PLAN API
       │
       ├── Computer Vision
       ├── Facade Segmentation
       ├── Camera Estimation
       ├── Texture Generation
       └── UV Projection
       │
       ▼
  Facade Skin
       │
       ▼
     GLB + Texture
       │
       ▼
 Web App TypeScript
       │
       ▼
     Three.js
```

---

## 22.6 Séparation des responsabilités

### Web App TypeScript

Responsable de :

- UX ;
- navigation ;
- visualisation ;
- projet ;
- modification de façade ;
- 3D ;
- Three.js ;
- comparaison avant/après ;
- présentation commerciale.

### Application iOS

Responsable de :

- capture ;
- positionnement ;
- AR ;
- capteurs ;
- profondeur ;
- acquisition d'images.

### Backend

Responsable de :

- traitement des images ;
- computer vision ;
- reconstruction ;
- génération des textures ;
- stockage des assets ;
- traitement 3D.

---

## 22.7 Principe produit

L'utilisateur ne doit pas percevoir cette séparation technique.

Son expérience reste :

```text
Je sélectionne ma maison
        ↓
Plan me guide
        ↓
Je prends quelques photos
        ↓
Plan comprend ma façade
        ↓
Je vois ma maison en 3D
        ↓
Je transforme ma façade
```

---

## 22.8 Stratégie de développement recommandée

### MVP

**Web App/PWA + TypeScript + Three.js + API**

Pas d'application native au départ.

### V1 commerciale

**Web App Plan + application iOS Capture**

L'application iOS est spécialisée dans la capture et l'AR.

### V2

Ajouter :

- Android / ARCore ;
- scan multi-façades ;
- scan toiture ;
- LiDAR avancé ;
- visualisation AR du projet directement sur la maison.

---

## 22.9 Décision d'architecture

### Décision

**NE PAS créer immédiatement une application mobile complète Plan.**

Créer d'abord :

> **PLAN Web App + Facade Scan PWA**

Puis, lorsque les limites de la Web App sont atteintes :

> **PLAN Web App + PLAN Capture iOS**

Cette stratégie minimise le coût et le risque tout en permettant de tester rapidement le potentiel de la fonctionnalité.


---

# 23. Performance — Temps de génération

## 23.1 Objectif principal

L'expérience doit privilégier la **perception d'instantanéité**.

**T0 = dernière photo prise**

Objectifs :

- **T+3 s** : affichage « Analyse de votre façade… »
- **T+10 s** : première façade texturée visible
- **T+15 s** : modèle 3D interactif complet
- amélioration haute qualité ensuite en arrière-plan

---

## 23.2 Mode instantané — V1 recommandé

La V1 ne reconstruit pas entièrement le bâtiment à partir des photos. Elle exploite la géométrie 3D déjà disponible dans Plan.

```text
5 PHOTOS
   ↓
sélection / contrôle
   ↓
correction perspective
   ↓
détection façade
   ↓
fusion texture
   ↓
projection UV
   ↓
Three.js
   ↓
FAÇADE 3D
```

### Temps cible

| Étape | Objectif |
|---|---:|
| Analyse des 5 photos | 1–3 s |
| Détection façade / points caractéristiques | 1–3 s |
| Estimation caméra / alignement | 2–5 s |
| Création texture | 2–5 s |
| Projection UV | < 1 s |
| Chargement Three.js | 1–2 s |
| **Première génération** | **5–15 s** |
| **Objectif idéal** | **≈ 10 s** |

Ces valeurs sont des objectifs d'architecture et devront être mesurées sur les appareils ciblés.

---

## 23.3 Mode qualité

Après l'affichage initial, Plan peut lancer un traitement supplémentaire :

- détection précise des fenêtres ;
- portes ;
- angles ;
- occlusions ;
- correction avancée de perspective ;
- meilleure fusion des photos ;
- suppression des artefacts ;
- amélioration de texture ;
- recalage plus précis ;
- génération d'une skin haute résolution.

### Temps cible

**15–45 secondes** selon l'appareil et la complexité de la façade.

Le traitement haute qualité ne doit pas bloquer l'utilisateur.

---

## 23.4 Reconstruction complète — optionnelle

La reconstruction complète du mesh à partir des photos est considérée comme une fonction avancée.

```text
Photos
 ↓
Feature Matching
 ↓
Camera Poses
 ↓
Point Cloud
 ↓
Mesh
 ↓
UV
 ↓
Texture
```

Cette opération peut nécessiter **30 secondes à plusieurs minutes**, selon :

- nombre de photos ;
- résolution ;
- puissance de l'iPhone ;
- utilisation du LiDAR ;
- algorithme ;
- complexité du bâtiment.

Elle n'est **pas requise pour la V1**.

---

## 23.5 Principe d'architecture de performance

Le pipeline doit être **progressif**.

```text
                    T0
                    │
              dernière photo
                    │
                    ▼
             QUICK PROCESS
                    │
                 ~10 s
                    │
                    ▼
          FAÇADE 3D UTILISABLE
                    │
                    │
             traitement async
                    │
                    ▼
          HIGH QUALITY SKIN
```

L'utilisateur ne doit jamais attendre la fin du traitement haute qualité pour accéder au modèle.

---

## 23.6 Priorité au traitement local

Pour le mode instantané, privilégier :

- TypeScript ;
- JavaScript ;
- Web Workers ;
- WebAssembly ;
- WebGL/WebGPU ;
- traitement local des images ;
- Three.js.

Le backend ne doit pas être une dépendance obligatoire pour afficher la première version de la façade.

```text
PHOTO
  ↓
LOCAL PROCESSING
  ↓
FACADE SKIN
  ↓
THREE.JS
```

Le backend peut ensuite être utilisé pour :

- traitement haute qualité ;
- IA plus lourde ;
- stockage ;
- synchronisation ;
- partage ;
- génération de variantes ;
- archivage du projet.

---

## 23.7 Web Worker

Les traitements lourds côté navigateur doivent être déportés dans des Web Workers afin de ne pas bloquer l'interface.

```typescript
const worker = new Worker(
    new URL("./facade.worker.ts", import.meta.url),
    { type: "module" }
);

worker.postMessage({
    type: "PROCESS_FACADE",
    photos,
    facade
});
```

L'interface Three.js doit rester fluide pendant le traitement.

---

## 23.8 Progressive Rendering

Le rendu doit évoluer progressivement :

### Niveau 1 — Preview

Texture basse résolution.

**Objectif : < 5 s**

### Niveau 2 — Interactive

Texture correcte + modèle 3D complet.

**Objectif : < 15 s**

### Niveau 3 — High Quality

Texture haute résolution + corrections avancées.

**Objectif : < 45 s**

---

## 23.9 Expérience utilisateur

Pendant le traitement :

```text
┌─────────────────────────────┐
│                             │
│       VOTRE MAISON          │
│          EN 3D              │
│                             │
│       ███████░░░            │
│                             │
│ Analyse de votre façade…    │
│                             │
│ ✓ Photos analysées          │
│ ✓ Façade identifiée         │
│ ● Génération du rendu       │
│ ○ Optimisation              │
└─────────────────────────────┘
```

Dès que le modèle est suffisamment bon :

> **Votre façade est prête.**

L'utilisateur peut immédiatement :

- tourner autour du bâtiment ;
- zoomer ;
- sélectionner une façade ;
- changer un matériau ;
- commencer une transformation.

---

## 23.10 Critère de réussite performance

Le pilote est considéré comme performant si, sur un iPhone récent :

- 90 % des captures produisent une preview en **< 10 s** ;
- 90 % produisent un modèle interactif en **< 15 s** ;
- le traitement haute qualité reste inférieur à **45 s** dans la majorité des cas ;
- l'interface reste interactive pendant le traitement.

---

## 23.11 Décision d'architecture

**La V1 ne doit pas chercher à reconstruire entièrement la maison depuis les photos.**

Elle doit exploiter :

> **Géométrie 3D Plan + photos réelles = Facade Skin**

Cette stratégie réduit fortement le temps de génération et permet de réaliser une première version directement sur l'iPhone avec TypeScript/JavaScript.

Le pipeline serveur reste disponible comme accélérateur et comme moteur de qualité supérieure, mais ne doit pas bloquer le premier rendu.
