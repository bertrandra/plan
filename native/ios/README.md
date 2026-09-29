# Plan Capture — module natif iOS du relevé de façade

Safari n'expose pas le LiDAR de l'iPhone à une page web. Ce module est une application iOS
minimale qui **héberge Plan tel quel** dans une vue web transparente posée sur une vue ARKit :

- pendant la visée, la page s'efface (`html.releveNatif`) et laisse voir la caméra AR ;
- la **distance au mur** mesurée par le LiDAR au centre de l'image est envoyée à la page dix fois
  par seconde (médiane d'une fenêtre 7 × 7 de la carte de profondeur, avec sa confiance ARKit) ;
- la **photo** est prise ici, avec la **focale exacte** de l'objectif (intrinsèques ARKit), et
  livrée à la page, qui la redresse comme n'importe quelle photo.

Sans LiDAR (iPhone non Pro), le module reste utile : la photo arrive avec sa focale exacte, et la
distance est estimée au cadrage comme dans le navigateur.

Rien d'autre ne change dans Plan : le même `plan.html` tourne dans Safari et ici. La page détecte le
module par la présence de `window.webkit.messageHandlers.planCapture`.

## Contrat page ↔ natif

| Sens | Forme | Contenu |
|---|---|---|
| page → natif | `window.webkit.messageHandlers.planCapture.postMessage({ action })` | `demarrer` (lance la session AR et la mesure), `arreter`, `photo` |
| natif → page | `CustomEvent('plan:profondeur', { detail })` | `{ distance: mètres, confiance: 0..2, largeurPx, hauteurPx, focalePx }` — la page ignore une confiance < 1 ; la géométrie de l'image (portrait, réduite comme la photo) lui sert à calculer ce que la photo couvrira |
| natif → page | `CustomEvent('plan:photo', { detail })` | `{ dataUrl: 'data:image/jpeg;base64,…', focalePx }` — focale en pixels de l'image livrée |

Côté page : `src/ui/releve/profondeur.ts` (écoute et commandes) et `src/ui/releve/camera.ts`
(`lirePhotoNative`).

## Construire

Ce dossier contient les sources, pas de projet Xcode : il se crée en deux minutes et n'a rien à
versionner d'intéressant.

1. Xcode 15 ou plus → *File › New › Project › iOS App*, interface **SwiftUI**, langage **Swift**,
   nom `PlanCapture`, cible iOS 16.
2. Remplacer le fichier d'application généré par `PlanCapture/PlanCaptureApp.swift`, ajouter
   `PlanCapture/CaptureViewController.swift`.
3. Dans *Info* de la cible, ajouter :
   - `NSCameraUsageDescription` : « Plan utilise la caméra pour photographier votre façade et mesurer la distance au mur. »
   - `PlanURL` (chaîne) : l'adresse de Plan, par défaut `https://plan.raillard.org/` ; pour un essai
     local, l'adresse du poste de développement sur le réseau (`http://192.168.x.y:5199/`), avec
     l'exception ATS correspondante.
   - `UIRequiredDeviceCapabilities` : `arkit`.
4. Signer avec une équipe de développement et lancer sur un iPhone (le simulateur n'a ni caméra
   ni LiDAR).

## Ce qui a été vérifié, et ce qui ne l'a pas été

Le côté page est testé (écoute des deux événements, repli sans module). **Ces sources Swift n'ont
pas été compilées** : elles ont été écrites sur un poste Windows, sans Xcode. Les API utilisées sont
celles d'ARKit depuis iOS 14 (`sceneDepth`, `confidenceMap`, `intrinsics`) et de WebKit
(`WKScriptMessageHandler`, `evaluateJavaScript`). À la première compilation, vérifier en priorité :

- l'orientation de la photo (`.oriented(.right)` suppose le téléphone tenu en portrait) ;
- la transparence de la vue web au-dessus de l'AR (`isOpaque = false`) ;
- l'échelle de la focale envoyée après réduction (`focalePx`).
