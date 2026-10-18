# Façades — calage des photos et détection des ouvertures

Statut : **spécification, aucun code**. Rédigée le 13 octobre 2026, à la demande de l'utilisateur :
**l'audit devient le moteur des façades** (`spec-audit.md`, partie A §7). Cette spec reprend la méthode
du relevé (`spec-releve-facade.md` §5 à §7), dit ce qu'elle ne sait pas faire, et la fait évoluer.
Le relevé existant garde son parcours : chaque amélioration lui profite aussi.

---

## 1. Ce que l'on veut

- **Sur la parcelle principale** (100 %, `spec-regles-toits.md` §1) : chaque façade photographiée
  donne ses ouvertures réelles (type, position, dimensions), avec le moins de gestes possible.
  L'utilisateur confirme ; il ne redessine pas.
- **Sur le voisinage** : les façades relevées en audit servent de **vérité terrain** pour régler la
  disposition automatique des ouvertures (`facade/ouvertures.ts::ouverturesAutomatiques`), utilisée
  pour tous les bâtiments sans relevé (§12).

Le critère de réussite se mesure en gestes : **moins de trois corrections par façade** sur une photo
prise à 15 m ou moins (§14).

L'utilisateur l'a demandé le 13 octobre : **améliorer l'algorithme et le déroulé actuels**, pas en
écrire un autre à côté. Chaque étape (§16) remplace un morceau du relevé d'aujourd'hui, mesurée sur le
banc avant et après. **Claude aide** à proposer le calage et les ouvertures quand l'algorithme n'est pas
sûr de lui (§12 bis).

## 2. La méthode actuelle, et ses limites

### 2.1 Ce qui existe

| Temps | Aujourd'hui | Code |
|---|---|---|
| Focale | EXIF `FocalLengthIn35mmFilm` d'une photo importée ; sinon 67° sur le grand côté | `facade/exif.ts`, `facade/cadrage.ts::CHAMP_GRAND_COTE_DEFAUT` |
| Coins | **proposés** comme si le mur était centré dans l'image, téléphone d'aplomb, œil à 1,5 m, à la distance mesurée ; sinon un cadre à 12 % des bords. **Posés au doigt**, avec une loupe. | `facade/analyse.ts::coinsProposes` |
| Hauteur | rapport du rectangle d'après la perspective et la focale (Zhang et He), mis à l'échelle par la largeur du plan | `facade/analyse.ts::mesurerHauteur` |
| Redressement | homographie des quatre coins, 100 px/m, grand côté de 1 024 px au plus, masque de ce qui a été vu | `facade/homographie.ts`, `analyserReleve` |
| Plusieurs photos | mosaïque de gauche à droite, recalée par corrélation normalisée | `facade/mosaique.ts` |
| Détection | écart à la **teinte médiane du mur** (une seule pour toute la façade), seuil `max(28, 3 × écart médian)`, morphologie, taches, filtres de taille, affinage des bords, alignement des linteaux et appuis à 7 cm | `facade/detection.ts::detecterOuvertures` |
| Classement | par la taille et la hauteur d'appui seulement | `facade/detection.ts::classer` |

Sur les images de test, les cotes sont justes à 1 ou 2 cm. Cette précision vaut pour des images de
synthèse et des coins bien placés.

### 2.2 Ce qui ne va pas sur le terrain

| # | Limite | Effet |
|---|---|---|
| L1 | **Coins proposés naïfs** : le mur est supposé centré et le téléphone d'aplomb | quatre coins à déplacer à chaque photo |
| L2 | **Focale par défaut** quand l'EXIF manque, ou perdue à la réduction de la photo d'audit | la hauteur mesurée est fausse d'autant |
| L3 | **Distorsion** de l'objectif grand-angle (0,5×) non corrigée | arêtes courbes aux bords : coins et linteaux faux |
| L4 | **Une seule teinte de mur** | un soubassement en pierre, des bandeaux, de la brique ou une meulière font de faux candidats, ou relèvent le seuil au point de manquer les baies |
| L5 | **Ombres** portées (débord, balcon, arbre, linteau) | fausses baies, baies trop hautes |
| L6 | **Occlusions** (voiture, haie, arbre, clôture) | baies manquées ou tronquées |
| L7 | **Ton sur ton** : volets ou porte de garage de la couleur du mur, menuiseries blanches sur enduit blanc | baies manquées |
| L8 | **Une photo, un point de vue** : en dehors de la mosaïque, rien ne combine une vue de face et une vue de biais | une baie cachée sur une photo n'est pas reprise de l'autre |
| L9 | **Pas de structure** : seuls linteaux et appuis s'alignent | pas de travées, des largeurs qui varient de quelques centimètres dans une même rangée |
| L10 | **Classement par la taille seule** | volets battants pris pour des baies, coffre de volet roulant compté dans la hauteur |
| L11 | **Pas de confiance** montrée ni de trace des corrections | on ne sait pas mesurer le détecteur, ni le régler |

### 2.3 Le déroulé actuel, et le déroulé visé

| | Aujourd'hui (relevé, `spec-releve-facade.md` §4.2) | Visé (audit et relevé) |
|---|---|---|
| Choisir le mur | dans une liste, ou proposé par la boussole | **reconnu en direct** par la position et la boussole (`spec-audit.md` §6.1) ; la photo s'y range |
| Se placer | distance mesurée (cadrage, WebXR), plan de prise | idem, la distance venant aussi du GPS |
| Prendre | une photo, ou une série de gauche à droite | idem, plus des vues de biais et un gros plan du parement |
| Coins | proposés au centre de l'image, **posés au doigt** | **trouvés** par les points de fuite ; au doigt seulement s'ils ne sont pas trouvés, et Claude peut aider (§12 bis) |
| Analyse | une seconde, une photo ou une mosaïque | idem, plus la fusion des vues, en tâche de fond pendant que l'on photographie la façade suivante |
| Vérifier | chaque ouverture corrigée au doigt, une à une | **seules les ouvertures peu sûres** sont montrées en pointillé ; gestes par travée et par niveau ; Claude a pu proposer les manquantes (§12 bis) |
| Valider | façade par façade, un pas d'historique chacune | façade par façade dans le relevé ; **toutes ensemble** dans l'audit de parcelle (`spec-audit.md` §14) |
| Après | rien | chaque correction est tracée et nourrit le banc (§12, §14) |

Le parcours du relevé garde ses six temps. Ce qui change, c'est ce que chaque temps sait faire seul.

## 3. La chaîne visée

```
photos situées (spec-audit §5)
  1. préparation        focale, distorsion, inclinaison, résolution utile          §4
  2. calage grossier    la prise de vue projette le mur : une zone de recherche    §5
  3. calage fin         segments, points de fuite : les coins trouvés, le cap corrigé §6
  4. redressement       homographie (existant), précision estimée                  §7
  5. fusion             plusieurs vues, masque d'occlusion                         §8
  6. candidats          teinte locale, contours, filtre d'ombre                    §9
  7. structure          niveaux, travées, régularisation, complétion               §10
  8. classement         type, volets, coffre, balcon                               §11
  8 bis. renfort Claude si l'un des temps 3, 6 ou 8 n'est pas sûr                    §12 bis
  9. vérification       au doigt, confiance montrée, corrections tracées           §12
 10. enregistrement     ReleveFacade enrichi, corpus                               §13
```

Chaque temps rend **ce qu'il a trouvé et à quel point il en est sûr**. Un temps qui ne conclut pas
laisse la main au suivant, ou à l'utilisateur, comme aujourd'hui : on ne devine pas en silence.

## 4. Préparation

- **Focale** :
  - lue dans l'EXIF **au moment de la prise, avant la réduction**, qui l'efface (corrige L2) ;
  - à défaut, une valeur par modèle de téléphone apprise sur les photos précédentes de l'appareil
    (même `Model` EXIF), puis les 67° par défaut ;
  - la source est gardée (`sourceFocale` : `exif`, `appareil`, `defaut`). La hauteur mesurée avec une
    focale par défaut est dite « estimée ».
- **Distorsion** (corrige L3) : si la focale équivalente est sous 20 mm (objectif 0,5×), une
  correction radiale à un coefficient. Ce coefficient est estimé sur les segments presque verticaux
  de la photo (arêtes de mur, tableaux), qu'il doit rendre droits. Au-delà de 20 mm, les téléphones
  corrigent déjà : rien n'est fait.
- **Inclinaison et roulis** : `beta` et `gamma` de l'orientation au retour de l'appareil photo
  (`spec-audit.md` §5). Ils donnent une première idée du point de fuite vertical.
- **Résolution utile** : l'analyse se fait sur la photo **pleine définition**, en mémoire, au moment
  de la prise. On ne garde ensuite que la photo réduite (1 280 px, 300 Ko) et l'élévation
  redressée. On note les **pixels par mètre au mur** sur la photo source (distance et focale) : c'est
  la précision réelle des cotes (§7).

## 5. Calage grossier : la prise de vue projette le mur

Entrées :
- le mur du plan (ses deux bouts, l'égout du modèle, le pignon s'il y en a un) ;
- la prise de vue : position et précision, azimut et sa source, inclinaison, roulis, focale ;
- une hauteur d'objectif de 1,5 m (téléphone tenu à la main).

On projette les coins du mur dans la photo par un modèle sténopé. On fait de même aux bornes de
l'incertitude : ± la précision du GPS en position, ± 15° en azimut (boussole), ± 25° (sens de la
marche). Le résultat n'est **pas** une proposition de coins. C'est une **zone de recherche** par coin,
et une hypothèse de départ (corrige L1).

Ordres de grandeur : à 15 m, 15° d'azimut déplacent l'image du mur d'un quart de la largeur de la
photo. Le calage grossier ne suffit donc jamais seul. Il borne le calage fin et le rend rapide.

Sans prise de vue (photo importée sans EXIF de position), la zone de recherche est l'image entière.

## 6. Calage fin : trouver le mur dans l'image

But : les quatre coins (et les deux points du décrochement d'un mur en L, `spec-releve-facade.md`
§6.2) **trouvés**, que l'utilisateur n'a qu'à confirmer.

1. **Segments** : détection de segments de droite sur le gradient (du type LSD), dans les zones de
   recherche.
2. **Points de fuite** :
   - le **vertical**, depuis les segments presque verticaux, borné par l'inclinaison et le roulis ;
   - l'**horizontal du mur**, depuis les segments orientés comme le mur projeté (± 20°).
   La direction de ce second point de fuite donne l'angle sous lequel on voit le mur, donc
   l'**azimut réel** de la prise. C'est le calage de la boussole : l'azimut corrigé remplace celui
   du téléphone pour la suite et pour la couleur (`spec-audit.md` §6).
3. **Les arêtes du mur** :
   - **côtés** : les longs segments verticaux près des côtés prévus (angle du bâtiment contre le ciel,
     le voisin ou un mur en retour) ;
   - **égout** : le long segment orienté vers le point de fuite horizontal près de l'égout prévu
     (gouttière, ombre du débord) ;
   - **pied** : la ligne du sol. Elle est souvent cachée (clôture, voiture, haie). À défaut, elle est
     **prédite** d'après la hauteur de l'objectif et l'inclinaison, et marquée comme telle.
4. **Choix de l'hypothèse** : chaque quadrilatère candidat reçoit une note qui combine :
   - le soutien des segments sur ses quatre côtés ;
   - l'accord avec le plan : la largeur est connue, la hauteur doit rester à ± 25 % de celle du
     modèle (l'avis du §6.0 du relevé) ;
   - l'accord avec la prise de vue (§5).
   La meilleure est gardée si sa note passe un seuil. Sinon, on revient aux coins du calage grossier,
   et l'utilisateur les pose, comme aujourd'hui.
5. **Ce qui est rendu** :
   - les coins, chacun avec sa source (`trouve`, `predit`, `doigt`) ;
   - l'azimut corrigé et la distance au mur ;
   - une note de confiance.
   À l'écran, un coin trouvé est plein, un coin prédit en pointillé ; la loupe reste.

**Contour décalé.** Si le meilleur quadrilatère ne s'accorde avec la largeur du plan qu'en décalant le
mur de plus de 0,5 m, le contour BD TOPO est probablement décalé. L'audit le note (`contour.decale`,
`spec-audit.md` §8.2) au lieu de tordre la façade.

## 7. Redressement

L'homographie existante ne change pas : 100 px/m, grand côté de 1 024 px au plus, bande au-dessus de
l'égout pour le pignon, ciel repeint à la teinte du mur. Deux ajouts :

- **Précision estimée** : les pixels par mètre au mur sur la photo source (§4). Une élévation à 100
  px/m tirée d'une photo qui n'en avait que 40 n'est pas précise au centimètre. Les cotes sont
  arrondies au centimètre, mais la précision annoncée est celle de la source (environ 2,5 cm à 40
  px/m).
- **Carte de qualité** par pixel de l'élévation : résolution source, angle d'incidence (de face, c'est
  mieux), surexposition. Elle sert à la fusion (§8).

- **Pas de chaîne en haute définition** (essai du 18 octobre 2026, skill `facades` §4) : relever sur une
  photo de 2 560 px, avec une élévation jusqu'à 2 048 px, ne gagne que 2 mm au calage fin, rien en
  détection (cartes à 5 cm le pixel), dégrade la fusion et triple le temps. La photo reste à 1 280 px,
  l'élévation et la copie pour Claude à 1 024 px.

## 8. Fusion de plusieurs vues

Aujourd'hui, seule la mosaïque de gauche à droite existe. On ajoute les **vues de face et de biais
d'une même partie du mur** (corrige L8 et L6).

1. Chaque photo est redressée dans le **même repère de l'élévation**, par ses propres coins.
2. **Recalage fin** entre les élévations : décalage en x et en y par corrélation normalisée, comme la
   mosaïque, mais en deux dimensions et sur une petite plage (quelques décimètres).
3. **Occlusions par la parallaxe** : ce qui est devant le mur (voiture, haie, arbre, poteau) n'est
   pas dans son plan. Il se déplace d'une élévation à l'autre ; le mur, non. Les pixels où les vues ne
   s'accordent pas sont marqués dans un **masque d'occlusion**.
4. **Composition** : pour chaque pixel, la vue de meilleure qualité (§7) hors occlusion ; avec trois
   vues ou plus, la médiane.
5. Ce qui reste caché dans toutes les vues reste dans le masque. Aucune ouverture n'y est
   **détectée** ; une ouverture peut y être **complétée** par la structure (§10), marquée « devinée ».

## 9. Les candidats ouvertures

L'écart à la teinte du mur reste un indice, mais il n'est plus seul.

**A. Écart à la teinte locale** (corrige L4). La teinte de référence n'est plus la médiane de toute la
façade, mais un **fond** estimé par une médiane sur une grande fenêtre glissante (1,5 m), plus grande
qu'une baie. Un soubassement, un bandeau ou un pignon d'une autre couleur deviennent le fond de leur
zone. Le seuil est calculé zone par zone, avec la même règle qu'aujourd'hui (`max(28, 3 × écart
médian)`).

**B. Profils de contours** (corrige L4 et L7). Après redressement, les bords d'une baie sont
horizontaux et verticaux. Dans chaque bande horizontale, la somme des gradients verticaux par colonne
donne des pics aux tableaux ; dans chaque bande verticale, la somme des gradients horizontaux par ligne
donne des pics aux linteaux et aux appuis. Une baie ton sur ton, ou percée dans de la brique, se lit
ainsi par ses arêtes, même quand sa couleur ne se détache pas.

**C. Filtre d'ombre** (corrige L5). Une ombre baisse la luminance sans changer la chromaticité
(`r/(r+g+b)`, `g/(r+g+b)`). Un candidat qui ne diffère du fond que par la luminance, et qui n'a pas
d'arête verticale franche sur ses côtés, est une ombre. Il est écarté, ou rogné quand l'ombre colle au
linteau.

**C bis. Ébrasements** (18 octobre 2026, `facade/detectionEbrasements.ts`). Une baie en retrait d'un mur
épais, vue de biais, montre d'un côté la face de son ébrasement : même teinte que le mur, autre luminosité,
comme une ombre, mais **unie** (sans le grain ni les joints du parement) et **collée à un seul côté** de la
vitre. Le filtre d'ombre la retirait, et la baie se réduisait à la vitre. Une bande de cet aspect sur toute
la hauteur d'un côté, et pas de l'autre, appartient à la baie de maçonnerie : la boîte s'étend jusqu'au nu
du mur (seuils `facades.detection.ebrasement*`). Les côtés seulement : en haut et en bas, une ligne ne
traverse qu'une assise et un bloc de pierre uni y ressemble à une face.

**Fusion des indices.** Un candidat est gardé s'il a un indice fort (A ou B net sur ses quatre côtés) ou
deux indices faibles. Sa **confiance** combine :
- le remplissage de la boîte (indice d'aujourd'hui) ;
- la rectangularité ;
- le soutien des arêtes sur ses quatre côtés ;
- la qualité de l'élévation sous lui (§7).

Les filtres de taille d'aujourd'hui restent (0,35 à 5,5 m de large, 0,4 à 3,2 m de haut, remplissage de
55 % au moins, pas de bande qui traverse la façade). Ils deviennent des réglages nommés, au même titre
que ceux des toits (`spec-regles-toits.md` §6) : `facades.detection.largeurMinM`, etc.

L'**affinage des bords au centimètre** (aujourd'hui) se fait désormais sur les profils de contours (B)
quand ils sont nets, sinon comme aujourd'hui.

## 10. La structure de la façade

Une façade est régulière : des **niveaux** (rangées) et des **travées** (colonnes). La structure
corrige L9 et rend la détection plus sûre.

1. **Niveaux** : linteaux et appuis regroupés (7 cm, comme aujourd'hui) en rangées. Une rangée a sa
   hauteur d'appui et sa hauteur de linteau. La hauteur d'étage, de 2,5 à 3,2 m, est contrôlée.
2. **Travées** : les centres des baies regroupés d'une rangée à l'autre (10 cm). Les baies d'une
   travée prennent la **largeur médiane** de la travée, si elles en sont à moins de 5 cm.
3. **Même rangée, même type, même hauteur** : la médiane, à moins de 5 cm.
4. **Symétrie** : si les centres sont symétriques autour du milieu de la façade à 10 cm près, la
   façade est marquée symétrique. Cela sert à compléter, jamais à déplacer.
5. **Complétion** : une travée qui a des baies sur deux rangées, et sur la troisième une zone
   **cachée** (§8) ou de faible confiance, reçoit une baie **devinée** au croisement. On ne complète
   jamais dans une zone visible et nettement « mur ».
6. **Garde-fou** : la régularisation ne déplace jamais un bord de plus de 10 cm de sa mesure. Au-delà,
   la mesure l'emporte : une façade peut être irrégulière.

Le résultat, une **grille** `{ niveaux: [{ appuiM, linteauM }], travees: [{ xM, largeurM }] }`, est
gardée avec le relevé. Chaque ouverture renvoie à sa rangée et à sa travée.

## 11. Le classement

Les quatre types d'aujourd'hui restent : `fenetre`, `porte-fenetre`, `porte`, `garage`. Les règles de
taille restent :
- au sol et 1,8 m de haut ou plus : porte ; porte-fenêtre à 1,1 m de large ou plus ; garage à 2,1 m ;
- appui sous 0,45 m et 1,9 m de haut ou plus : porte-fenêtre ;
- sinon : fenêtre.

S'ajoutent des **détails**, facultatifs, que la 3D dessine depuis le lot G17 (`three/detailsOuvertures.ts`) et
dont le banc mesure la justesse :

| Détail | Comment on le reconnaît | Ce qu'il change |
|---|---|---|
| **Volets battants** | deux rectangles de même teinte, chacun d'environ la moitié de la baie, collés à ses tableaux | ils sont **fusionnés** dans la baie (`volets: 'battants'`), au lieu de faire deux fausses baies (corrige L10) |
| **Volet roulant** | une bande en haut de la baie, de 15 à 30 cm, de texture différente (le coffre) | le coffre est **retiré** de la hauteur de la baie (`volets: 'roulant'`) |
| **Persiennes fermées** | des rayures horizontales régulières dans la baie | la baie existe ; `volets: 'persiennes'`, `ferme: true` |
| **Balcon, garde-corps** | une bande horizontale sous une porte-fenêtre, qui déborde de ses tableaux | `allege: 'balcon'` ou `'garde-corps'` |
| **Forme** | haut en arc (cintre), ou baie ronde (œil-de-bœuf) | `forme: 'cintre'` ou `'rond'` |

Claude analyste (`spec-regles-toits.md` §14) les propose sur la photo, façade par façade (prompt
d'analyse version 9) : volets et **leur couleur**, coffre, forme, et des détails que le classement ne lit pas
(encore) sur les pixels :

| Détail | Vocabulaire (`DetailsOuverture`) | Pour quelles ouvertures | En 3D, de près |
|---|---|---|---|
| **Vitrage** | `vitrage` : `plein`, `petits-bois`, `imposte-petits-bois` | fenêtre, porte-fenêtre | petits bois, ou vantaux seuls ; l'imposte a sa traverse et ses petits bois au-dessus |
| **Ouvrant** | `ouvrant` : `battants`, `coulissant`, `guillotine`, `soufflet`, `fixe` | fenêtre (porte-fenêtre : ni guillotine ni soufflet) | meneau central, traverse de guillotine, rien sur un fixe |
| **Porte d'entrée** | `remplissage` : `pleine`, `vitree`, `semi-vitree` | porte | la vitre à la place d'un ou des deux panneaux |
| **Porte de garage** | `garage` : `sectionnelle`, `basculante`, `battants`, `enroulable` | garage | lames de 50 cm, panneau lisse, joint vertical, lames de 10 cm |
| **Couleur des volets** | `couleurVolets` (hexadécimal) | une baie qui a des volets | le matériau des volets |

Claude décrit la majorité des ouvertures d'une façade : l'effet `detailsOuvertures` (`regles/decisions.ts`)
ne complète, sur le relevé coché à l'écriture, que les ouvertures du type concerné et que ce qu'elles n'ont
pas (`model/ouverturesVues.ts::completerDetails`). Une ouverture sans ces détails se dessine comme avant
(petits bois selon l'époque).

## 12. La vérification, et ce qu'elle apprend

- Chaque ouverture s'affiche avec sa confiance :
  - **pleine** : mesurée, confiance d'au moins 0,7 ;
  - **en pointillé** : faible confiance, ou devinée (§10).
  Les gestes d'aujourd'hui restent : déplacer, redimensionner par les coins, changer le type, retirer,
  ajouter.
- Nouveaux gestes, en une touche :
  - « Même taille pour la travée », « Même hauteur pour le niveau » ;
  - « Ajouter dans la grille » : la baie apparaît au croisement libre le plus proche.
- **Chaque correction est tracée** dans le fichier de l'audit : ajout, retrait, déplacement (avec
  l'écart), changement de type. C'est ce qui fait de l'audit le moteur : les corrections mesurent la
  précision et le rappel du détecteur, et désignent le réglage à toucher (§14).

## 12 bis. Claude en renfort du calage et de la détection

Claude analyste (`spec-regles-toits.md` §14, Claude Haiku 5.5) aide **quand l'algorithme n'est pas
sûr de lui**, jamais à sa place. Il **propose** ; Plan **recale** et **mesure** ; l'utilisateur
**valide**.

**Quand il est appelé**

| Situation | Signal de l'algorithme |
|---|---|
| Coins non trouvés | note du calage fin sous le seuil (§6), ou plus d'un coin seulement prédit |
| Façade mal vue | plus de 30 % de l'élévation dans le masque d'occlusion (§8) |
| Détection peu sûre | moins de 70 % des ouvertures au-dessus de 0,7 de confiance, ou une travée incomplète hors zone cachée (§10) |
| Ton sur ton, brique, pierre | peu de candidats par la teinte (A) et des profils de contours ambigus (B, §9) |
| Désaccord | « Ce que je vois » de l'utilisateur, ou le nombre de baies attendu par la grille, contredit la détection |
| Détails | classement des volets, du coffre, du balcon, de la forme (§11) |

Ailleurs, l'algorithme suffit et Claude n'est pas appelé : coût et délai nuls.

**Ce qu'il reçoit**
- La photo réduite, avec le **quadrilatère prédit** (§5) dessiné dessus et une grille de repères
  numérotée. Un modèle de langage situe mieux un point par rapport à des repères visibles qu'en pixels
  bruts.
- L'**élévation redressée** à l'échelle, avec une graduation en mètres, les ouvertures déjà détectées
  dessinées et numérotées, et le masque d'occlusion.
- Le **rendu du modèle** depuis la même prise de vue (`spec-regles-toits.md` §14.1).
- Ce qui est connu : largeur du mur, hauteur du modèle, nombre de niveaux.

**Ce qu'il rend**, dans la forme d'un schéma JSON (ramenée par le serveur, `spec-regles-toits.md` §14.2,
point 1), avec `indetermine` partout :
- **Calage** : la position approximative des quatre coins, en repères de la grille ; le mur vu, si ce
  n'est pas celui que l'on croit.
- **Ouvertures** :
  - pour chaque ouverture détectée : garder, retirer (une ombre, un volet, une tache), corriger le type ;
  - les ouvertures **manquées**, en boîtes approximatives sur l'élévation, en mètres ;
  - les détails (volets, coffre, balcon, forme) ;
  - pour chaque réponse, l'**indice** vu (« coffre de volet roulant visible au-dessus de la fenêtre 3 »).

**Ce que Plan en fait**
1. **Recalage** : une position donnée par Claude n'est jamais une cote. C'est une **graine** :
   - un coin proposé est rattaché au croisement de segments le plus proche (§6) ;
   - une boîte proposée est ajustée sur les profils de contours (§9), puis passe par la structure
     (§10).
   Une graine que rien ne soutient dans l'image (aucun segment, aucune arête à moins de 30 cm) est
   rejetée, ou laissée en pointillé.
2. **Origine marquée** : chaque coin ou ouverture venue de Claude porte `source: 'claude'`, puis
   `corrigee` si l'utilisateur la retouche. L'écran le dit sur demande (« proposée par l'analyse »).
3. **Mêmes garde-fous que pour les toits** (`spec-regles-toits.md` §14.2) : trois passes et un vote,
   contrôle croisé avec les mesures, pas de pré-acceptation sous 95 % d'accord mesuré.
4. **Mesure de son apport** : le banc (§14) compte, par situation, combien de propositions de Claude
   ont été gardées, corrigées ou retirées. Un renfort qui n'améliore pas le banc est coupé pour cette
   situation.

**Quand**
- **Dans l'audit de parcelle** : avec le batch de la phase 2 (`spec-audit.md` §13.2), sans délai de
  plus.
- **Dans le relevé**, hors audit : un bouton « Demander de l'aide » à l'étape des coins ou à la
  vérification, en appel immédiat. Il n'est proposé que si l'un des signaux ci-dessus est levé.
- Les photos ne partent qu'avec l'accord de l'utilisateur (`spec-audit.md`, question 12).

**Coût** : une ou deux images par façade concernée, environ 4 000 tokens d'entrée et 500 de sortie par
passe, soit environ 0,0005 $ par façade et par passe en Batch avec Claude Haiku 5.5. Avec trois passes,
quelques dixièmes de centime par façade aidée.

**Mise en œuvre (lot L18, 14 octobre 2026)** — ce que le code a tranché :
- `facade/renfort.ts` (signaux, grille de repères de 0 à 10, schéma, vote) et
  `facade/renfortRecalage.ts` (recalage, application) ; prompt et schéma versionnés à part de ceux de
  l'analyse : `deploy/prompt-renfort.md`, `deploy/schema-renfort.json`.
- **Ton sur ton** : la détection ne voit pas la teinte d'une baie qu'elle n'a pas trouvée ; le signal
  retient ce qui en reste visible, un mur de plus de 4 m sans ouverture ou une confiance médiane des
  ouvertures sous 0,55.
- **Coins** : la recherche du croisement va jusqu'à un demi-repère de la graine (sa précision : un
  repère vaut un dixième de la photo) ; la règle des 30 cm s'applique au soutien (chaque segment
  passe à moins de 30 cm du croisement), et un segment de moins de 15 % du côté attendu (un joint,
  une pierre) ne compte pas. Un coin recalé ne remplace qu'un coin prédit.
- **Boîtes** : soutenues sur au moins trois côtés, proposées cochées ; sur un ou deux, en pointillé ;
  sur aucun, rejetées. Claude ne retire qu'une baie de confiance inférieure à 0,7 (elle reste
  proposée, décochée) ; une baie devinée du même type, recouverte à moitié, est confirmée.
- **Audit** : les requêtes du renfort portent leur usage dans le batch de l'analyse (le serveur
  choisit leur prompt et leur schéma) ; elles ne prennent que la place que l'analyse des maisons
  laisse dans un batch de 60 requêtes. Le recalage des coins n'y est pas appliqué : refaire
  l'analyse de la façade sur de nouveaux coins reste à faire.
- **Relevé** : appel immédiat par `POST admin/claude/messages` (trois requêtes au plus, en
  parallèle, au tarif normal).
- **Banc** : les réponses de Claude sont encore **simulées** (erreurs typiques imitées) ; elles
  mesurent le recalage, pas Claude. Le taux d'accord de Claude sur les façades n'étant pas mesuré,
  ses propositions arrivent décochées.

**Mise en œuvre (lot G20, partie sans corpus, 14 octobre 2026)** :
- **Le masque hachuré** : à la vérification, ce qui reste caché sur toutes les vues d'une fusion (§8)
  se hachure sur l'élévation, sous les ouvertures, avec une légende (`zones/releve/masque.ts` : le
  masque, pixel par pixel, devient des rectangles de 10 cm en fractions du mur, qui suivent une
  hauteur corrigée). Le masque n'est pas enregistré : il appartient à la série de photos, pas au
  relevé.
- **L'aide sur plusieurs vues** : « Demander de l'aide » est proposé aussi quand l'élévation vient
  d'une fusion. Claude reçoit la vue de référence (la mieux définie) et l'élévation fondue, masque
  hachuré dessus. Le signal « façade mal vue » se lève dans le relevé dès que le masque couvre **10 %**
  du mur (`MASQUE_NOTABLE`), et non 30 % : la personne a déjà pris plusieurs vues pour voir derrière
  l'obstacle, et ce qui reste caché partout est là où une baie se devine sans se voir. Le seuil de
  30 % reste celui de `signauxRenfort` (audit, banc). Jamais sur des morceaux côte à côte.
- Restent pour le corpus : les vraies réponses et les taux d'accord par situation, le recalage des
  coins dans l'audit, la fin du renfort à chaque façade (D22).

## 13. Ce qui est enregistré

Tous les ajouts sont **facultatifs** : un relevé d'aujourd'hui garde exactement son sens.

```ts
interface ReleveFacade {
  // inchange : cote, largeur, hauteur, texture, photoLocale, hauteurTexture, ouvertures, distance,
  // sourceDistance, releveLe, partieBasse
  /** Comment les photos ont ete calees. */
  calage?: {
    photos: {
      prise?: PrisePhoto;                       // spec-audit §5
      coins: P2[];
      sourceCoins: ('trouve' | 'predit' | 'claude' | 'doigt')[];
      focale35?: number;
      sourceFocale: 'exif' | 'appareil' | 'defaut';
      pxParMSource: number;                     // la precision reelle (§4, §7)
    }[];
    azimutCorrigeDeg?: number;                  // §6, point de fuite
    confiance: number;
  };
  /** La structure de la facade (§10). */
  grille?: { niveaux: { appuiM: number; linteauM: number }[]; travees: { xM: number; largeurM: number }[] };
}

interface OuvertureFacade {
  // inchange : type, x, y, l, h
  confiance?: number;
  source?: 'detectee' | 'devinee' | 'claude' | 'ajoutee' | 'corrigee';
  niveau?: number; travee?: number;
  details?: {
    volets?: 'aucun' | 'battants' | 'roulant' | 'persiennes';
    ferme?: boolean;
    allege?: 'pleine' | 'balcon' | 'garde-corps';
    forme?: 'rect' | 'cintre' | 'rond';
  };
}
```

## 14. Banc d'essai et critères

- **Corpus de façades** dans `tests/fixtures/facades/` :
  - les images de synthèse d'aujourd'hui (elles doivent rester justes à 1 ou 2 cm) ;
  - les façades réelles des audits, chacune avec sa photo réduite, son calage et ses ouvertures
    **corrigées**, qui servent de vérité.
  Le banc mesure l'algorithme **seul**, puis **avec le renfort de Claude** (§12 bis) : on sait ce que
  chacun apporte.
- **Mesures** :
  - calage : part des coins trouvés automatiquement, erreur des coins en centimètres sur l'élévation,
    erreur de l'azimut corrigé ;
  - détection : précision et rappel (une baie est retrouvée si son recouvrement avec la vraie dépasse
    50 %), erreur médiane des cotes en centimètres ;
  - effort : nombre de corrections par façade.
- **Objectifs de la première version** (photo à 15 m ou moins) :
  - 70 % des coins trouvés sans geste ;
  - rappel d'au moins 85 % et précision d'au moins 90 % ;
  - erreur médiane des cotes de 5 cm au plus ;
  - moins de trois corrections par façade.
- Un script de banc, sur le modèle de `banc.ts` des toits, rejoue le corpus et écrit le tableau. Toute
  PR qui touche la détection montre le tableau avant et après.
- Non-régression : un relevé validé ne change jamais tout seul ; les tests d'aujourd'hui sur les
  images de synthèse restent.

## 15. L'audit, moteur des façades du voisinage

Les bâtiments sans relevé (tout le voisinage, et la parcelle avant son audit) reçoivent leurs
ouvertures de `ouverturesAutomatiques` :
- des fenêtres de 1,00 × 1,20 m à 0,90 m d'appui (`FENETRE`) ;
- un entraxe de 2,40 m (`ENTRAXE_FENETRES_M`), au plus 8 par mur ;
- une porte de 0,90 × 2,10 m (`PORTE`) au rez-de-chaussée du plus long mur ;
- des niveaux de 2,7 m, aucun sous 2,2 m ni sur un mur de moins de 2 m.

Ces valeurs sont des choix d'une fois. Les façades relevées en audit permettent de les **mesurer** et de
les **régler par profil**, comme les seuils des toits (`spec-regles-toits.md` §6) :

1. **Ce qui est mesuré** sur chaque façade relevée : largeur et hauteur des fenêtres, appui, entraxe,
   part vitrée (surface des baies sur surface du mur), nombre de baies par niveau, place de la porte,
   présence d'un garage. On distingue la façade sur rue, l'arrière et les pignons (souvent aveugles
   côté voisin).
2. **Les profils** : les mêmes déclencheurs mesurables que les toits (région, époque des fichiers
   fonciers, usage et nombre d'étages BD TOPO). Par exemple :
   `facades.profils["pavillon-idf"] = { fenetre: { l: 1.1, h: 1.35, appui: 0.95 }, entraxe: 2.6, pignonAveugle: true }`.
   Les constantes d'aujourd'hui deviennent le profil par défaut.

   **Fait (lot G12)** : `regles/facades/reglages.json` (format `plan-reglages-facades`), compilé dans
   le fichier livré. Ses `seuils` sont le profil par défaut, au bit près les constantes d'avant
   (`FENETRE_LARGEUR_M`, `FENETRE_HAUTEUR_M`, `FENETRE_APPUI_M`, `PORTE_LARGEUR_M`,
   `PORTE_HAUTEUR_M`, `ENTRAXE_FENETRES_M`, `FENETRES_MAX_PAR_MUR`, `HAUTEUR_NIVEAU_M`,
   `HAUTEUR_NIVEAU_MIN_M`, `LARGEUR_MUR_MIN_M`, `HAUTEUR_PIGNON_FENETRE_M`), chacun avec son unité, le
   module qui le lit et sa raison. Un profil s'écrit
   `{ "id": "pavillon-idf", "quand": { "departements": ["78"], "usages": ["Résidentiel"] }, "surcharges": { "FENETRE_LARGEUR_M": 1.1, "ENTRAXE_FENETRES_M": 2.6 }, "pourquoi": "…", "cas": ["…"] }`.
   Le vocabulaire est fermé (D19) : `departements` (tiré de l'IDU de la parcelle du projet),
   `epoque` (année de `date_d_apparition`, plage), `usages` (`usage_1` de la BD TOPO), `etages`
   (plage), `mitoyennete` (`aucune`, `partielle` dès 5 % du périmètre collé à un autre bâtiment,
   `forte` dès 40 %). Une valeur inconnue ne remplit aucune condition. Un profil s'applique **en
   entier** (ses dimensions vont ensemble) ; le plus précis (le plus de conditions) l'emporte, et
   deux profils de même précision qui peuvent tomber sur le même bâtiment font refuser le fichier
   (test en CI). Le profil retenu se range sur le bâtiment (`profilFacades : { id, version }`) ;
   l'empreinte du fichier entre dans `VERSION_LECTURE_FACADES` (`regles/facades/reglages.ts`,
   `LECTURES_FACADES`) : une valeur ou un profil changé fait rechoisir les profils en tâche de fond
   (`app/profilsFacadesFond.ts`), sauf sur la parcelle du projet et les bâtiments vérifiés sur
   place. Les dimensions réglées à la main (inspecteur « Fenêtres (3D) », apparence du voisinage)
   l'emportent sur le profil. Le booléen `pignonAveugle` de l'exemple ci-dessus attend son premier
   profil (G14) : la disposition ne sait pas encore laisser un pignon aveugle.

   Les empreintes golden qui voient les fenêtres : `glb-structure.json` (la Vue 3D, point de fumée
   24). `dossier.pdf`, `plan.pdf`, `plan.svg`, `plan.dxf` et `projet.json` ne les dessinent pas (un
   projet sans profil retenu s'enregistre comme avant).
3. **Le contrôle** : sur les façades relevées, la disposition automatique est comparée au relevé :
   nombre de baies par façade (± 1), part vitrée (± 20 %), hauteur des niveaux. C'est le **taux de
   conformité des façades**, suivi comme celui des toits (`spec-regles-toits.md` §13.5).
4. **La règle du jeu** est celle des toits : un réglage ne change qu'avec le corpus rejoué, et la
   parcelle principale n'est jamais touchée. Ses relevés l'emportent toujours sur l'automatique.

## 16. Étapes

Une PR par étape, chacune avec le banc avant et après (§14).

| Étape | Contenu | Corrige |
|---|---|---|
| 1 | Préparation : focale avant réduction, focale par appareil, inclinaison, pixels par mètre source | L2 |
| 2 | Calage grossier par la prise de vue : coins prédits à la place des coins centrés quand la prise est connue | L1 |
| 3 | Calage fin : segments, points de fuite, coins trouvés, azimut corrigé, contour décalé signalé | L1 |
| 4 | Distorsion du grand-angle | L3 |
| 5 | Fusion de plusieurs vues, masque d'occlusion | L6, L8 |
| 6 | Candidats : teinte locale, profils de contours, filtre d'ombre, confiance | L4, L5, L7 |
| 7 | Structure : niveaux, travées, régularisation, complétion devinée | L9 |
| 8 | Classement enrichi : volets, coffre, balcon, forme | L10 |
| 9 | Corrections tracées, corpus de façades, script de banc | L11 |
| 9 bis | Renfort Claude sur signal : graines de coins et d'ouvertures, recalage, origine marquée, apport mesuré sur le banc (§12 bis) | L1, L6, L7, L10 |
| 10 | Profils de façades dans les réglages, calibrés par le corpus (voisinage) | §15 |

Les étapes 1 à 3 profitent tout de suite au relevé existant. AE 101 et les empreintes golden ne
bougent pas : une façade ne change ni le calcul des toits ni les quantités. Le toit lu sur une façade
ne remplace celui du bâtiment que dans le projet, et sur le choix de l'utilisateur.

## 17. Questions

1. **Analyse en pleine définition** au moment de la prise, et seule la photo réduite gardée (§4) ?
   Proposition : oui. La précision des cotes en dépend, et le fichier reste léger.
2. **Ouvertures devinées** dans les zones cachées (§10) : proposées en pointillé, ou jamais ?
   Proposition : proposées, décochées si leur confiance est faible.
3. **Détails** (volets, coffre, balcon, forme, §11) : dans le modèle dès l'étape 8, même si la 3D ne
   les dessine pas encore ? Proposition : oui. Le coffre retiré de la hauteur et les volets fusionnés
   changent déjà les cotes.
4. **Profils de façades** (§15) : dans le même fichier de réglages que les toits ? Proposition : oui,
   une section `facades`.
5. **Renfort de Claude** (§12 bis) : appelé seulement sur signal de l'algorithme, ou à chaque façade
   pour mesurer son apport au début ? Proposition : à chaque façade pendant les premiers audits (le
   banc le mesure), puis seulement sur signal.
