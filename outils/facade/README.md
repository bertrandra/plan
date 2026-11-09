# facade.html — façade redressée (outil autonome)

Page unique pour téléphone, construite à la racine du dépôt (`facade.html`). Aucun réseau, aucun
serveur, aucune saisie : on prend ses photos, on touche « Redresser et fusionner », on enregistre.

1. **Objectif** : champ lu dans l'EXIF (`FocalLengthIn35mmFilm`, via `src/facade/exif.ts`) ; 0,5×
   donne environ 108°. Sans EXIF (photo transférée par une messagerie), il est estimé : les points
   de fuite des verticales et des horizontales du mur, orthogonales, vérifient (v − c)·(h − c) = −f².
2. **Redressement** (`auto.ts`) : segments de droite (croissance de régions de même orientation du
   gradient), point de fuite vertical puis horizontal sur la sphère de Gauss, rotation qui met
   l'appareil face au mur ; le cadre retenu est celui des lignes trouvées.
3. **Fusion** : deux vues redressées d'un même mur ne diffèrent que d'une similitude ; coins de
   Harris, descripteurs cherchés à neuf échelles, RANSAC. Fondu progressif et gain par photo.
4. **Rendu** : chaque pixel est repris sur la photo d'origine, à pleine résolution (16 Mpx au plus).

Limite : un seul plan est redressé exactement ; ce qui avance ou recule (porche, pignon en saillie)
reste droit mais peut montrer un léger décalage aux jointures entre photos.

```bash
node outils/facade/construire.mjs              # reconstruit facade.html
node outils/facade/construire.mjs --verifier   # banc synthétique (une minute environ)
npx tsc -p outils/facade --noEmit              # types
node outils/facade/construire.mjs --artifact <fichier>   # variante sans squelette, pour claude.ai
```
