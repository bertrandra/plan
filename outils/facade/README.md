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
4. **Coutures** : chaque jointure entre deux photos suit le chemin où elles se ressemblent le plus
   (programmation dynamique sur la bande commune), adoucie sur quelques pixels ; une saillie (porche,
   pignon) n'apparaît donc pas en double. Les photos s'assemblent côte à côte ou l'une au-dessus de
   l'autre.
5. **Rendu** : chaque pixel est repris sur la photo d'origine, à pleine résolution (16 Mpx au plus).

En plus :

- **Repli manuel** (« Ajuster ») : quatre coins d'un rectangle du mur posés au doigt, avec loupe ;
  ou « Autre façade » sur une photo d'angle ; ou retour à l'automatique. Sans EXIF, les coins
  donnent aussi l'objectif.
- **Grand-angle non corrigé** (certains Android) : la distorsion radiale est estimée sur la photo
  (celle qui rend les droites du bâtiment le plus concourantes) et corrigée ; un iPhone rend 0.
- **Photos gardées sur l'appareil** (IndexedDB) : elles reviennent si Safari recharge la page.
- **Échelle facultative** : une longueur connue posée sur le résultat donne les px/m, puis des
  mesures et une barre d'échelle sur l'image enregistrée.
- **Fenêtres et portes** (case à cocher, `baies.ts`) : trois détecteurs indépendants cherchent les
  baies sur la façade redressée, chacun à sa façon — des rectangles d'arêtes notés par une
  vingtaine d'indices (`baies/propositions.ts`), les mailles fermées de la menuiserie
  (`baies/mailles.ts`), les travées et les alignements (`baies/travees.ts`) — et un vote retient ce
  sur quoi deux d'entre eux s'accordent. La boîte est le hors-tout de la menuiserie, cadre compris.
  Type selon la règle de Plan (`classer`) une fois le sol situé par une porte. Cotes avec
  l'échelle ; ajout, recadrage, retrait, changement de type au doigt ; export CSV. Mesuré sur un
  banc de façades annotées (`banc/README.md`) : 0,86 sur 1, contre 0,34 pour le premier détecteur
  (régions lisses), et 0,80 sur des images tenues à l'écart.
- **Calcul en arrière-plan** (Web Worker lancé depuis le texte embarqué), avec repli sur la page.

Fichiers : `auto.ts` (calcul pur), `baies.ts` et `baies/` (fenêtres et portes), `banc/` (leur banc d'essai), `operations.ts` (les opérations, appelables par message),
`travail.ts` (le Worker), `editeur.ts` (poignées, loupe), `stockage.ts` (IndexedDB), `main.ts`
(l'interface), `modele.html`.

Limite : un seul plan est redressé exactement ; ce qui avance ou recule reste droit mais n'est pas
à la même échelle que le mur.

```bash
node outils/facade/construire.mjs              # reconstruit facade.html
node outils/facade/construire.mjs --verifier   # banc synthétique (une minute environ)
npx tsc -p outils/facade --noEmit              # types
node outils/facade/construire.mjs --artifact <fichier>   # variante sans squelette, pour claude.ai
```
