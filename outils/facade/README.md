# facade.html — façade redressée (outil autonome)

Page unique, pour téléphone, construite à la racine du dépôt (`facade.html`). Elle se copie et
s'ouvre telle quelle (fichier local ou n'importe quel hébergement) : aucun réseau, aucun serveur.

1. **Le mur** : sa largeur (mesurée), la hauteur si on la connaît (sinon mesurée), les marges.
2. **Les photos** : une si le mur tient, sinon plusieurs de gauche à droite, un tiers de
   recouvrement. Pour chacune, les quatre coins (égout en haut, pied en bas).
3. **L'objectif** : champ du grand côté (67° par défaut, EXIF s'il existe, ou étalonnage sur une
   photo d'un objet de longueur connue à distance mesurée).
4. **Le résultat** : rendu à la résolution native des photos, JPEG / PNG / partage.

Le calcul réutilise `src/facade/` sans le modifier (`exif`, `cadrage`, `homographie`,
`mosaique.decalage`, `analyse.mesurerHauteur`) ; le calage se fait sur des aperçus de 2 400 px
comme dans Plan, et le rendu final va chercher chaque pixel sur la photo d'origine.

```bash
node outils/facade/construire.mjs              # reconstruit facade.html
node outils/facade/construire.mjs --verifier   # banc synthétique (hauteur, places, rendu)
npx tsc -p outils/facade --noEmit              # types
```
