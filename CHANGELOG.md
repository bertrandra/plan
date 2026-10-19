# Journal des modifications

Format [Keep a Changelog 1.1](https://keepachangelog.com/fr/1.1.0/), versionnement selon
[`MD/RELEASE.md`](MD/RELEASE.md). Les versions les plus récentes en premier.

## [Non publié]

### Ajouté

- **Audit de la parcelle : chaque photo de façade redressée est gardée dans le fichier, avec la version de la chaîne.** Le fichier d’un audit gardait déjà les photos (réduites à 1 280 px), leurs coins, les corrections et le mur fusionné ; il garde maintenant aussi chaque photo redressée seule (JPEG, 1 024 px au plus, entre les coins retenus, sur l’image corrigée du grand-angle) et la version de la chaîne des façades qui les a faites (`VERSION_CHAINE_FACADES`, `zones/releve/chaine.ts`). Quand la chaîne évolue, un rejeu repart des photos et des corrections, et les images d’origine disent ce qui a changé. Environ 100 Ko de plus par photo de façade, loin de la limite de 25 Mo d’un fichier d’audit. Les fichiers d’avant se relisent tels quels. Aucune quantité ni aucun export ne change.

- **Admin › Calibrer la détection : chaque étape en image, et un cas tiré d’un bâtiment.** Après « Redresser le mur », l’éditeur d’un cas montre ce que chaque étape a donné : (1) les coins du mur sur chaque photo, d’où ils viennent, leurs verticales et le motif d’un doute ; (2) chaque photo redressée seule ; (3) la fusion des vues — laquelle sert de référence, lesquelles sont fusionnées ou restées à part et pourquoi, et la part du mur cachée sur toutes les vues, hachurée ; (4) les ouvertures proposées par la détection, les devinées en pointillé ; (5) l’image posée sur la façade en 3D, telle que photographiée et sans les ombres de la photo, côte à côte ; (6) la silhouette du haut du mur : celle mesurée au-dessus de l’égout et le modèle de toit qui la porte le mieux (triangle d’un pignon, trapèze, rampe, ligne droite), avec la hauteur du faîtage. Un cas se crée aussi depuis une façade relevée d’un bâtiment : celle d’un projet du serveur, ou d’un fichier de projet (« Exporter le projet (JSON) ») ; il reprend le mur redressé, ses dimensions et les ouvertures validées au relevé, comme point de départ de la vérité (`app/casDeReleve.ts`). L’import depuis un audit reste à côté. Aucune quantité ni aucun export ne change.

- **Vue 3D : les façades sans les ombres de la photo.** La photo plaquée sur une façade relevée portait les ombres de l’heure où elle avait été prise (débord du toit, balcon, arbre), et la Vue 3D posait ensuite les siennes, à l’heure choisie : des ombres en double, souvent contraires. La nouvelle case « Façades sans ombres » (Vue 3D › Scène, cochée par défaut, sous « Textures ») les estompe : l’éclairage du mur se lit sur le mur seul, baies mises de côté, et chaque zone à l’ombre est éclaircie vers le mur au soleil, en gardant sa teinte (`facade/sansOmbres.ts`, huit réglages nommés `facades.texture.*`). Un autre parement (soubassement en pierre, bandeau) n’est pas pris pour une ombre, un pixel n’est jamais porté au-delà du mur au soleil (pas de liseré au bord des ombres), et le toit au-dessus de l’égout ne bouge pas. Mesuré sur le banc des façades : l’écart au mur sans ombre passe, dans les ombres, de 34 à 14 % (débord et balcon) et de 35 à 15 % (arbre) ; un mur sans ombre change de moins de 1 % (meulière, brique, soubassement) ; environ 100 ms par façade, une fois par photo. C’est une préférence d’affichage, comme « Vent » : ni Ctrl+Z ni « projet modifié » ; la photo enregistrée, la détection, les cotes et l’export .glb (qui emporte la photo telle qu’elle a été relevée) ne changent pas. Aucune quantité ni aucun export ne change.

- **Propositions de l’audit : « Voir dans la 3D » sur chaque ligne.** Le bouton œil d’une ligne surligne en orange ce qu’elle vise, dans « Avant » comme dans « Après » : le mur d’une façade (avec un voile sur sa face), le corps de toit qu’une ligne relit seul, ou le contour du bâtiment ; la caméra se tourne vers lui (de face pour un mur). La ligne choisie se montre aussi dans « Après » même décochée : la photo d’une façade dont le relevé arrive décoché (les coins du mur n’ont pas été trouvés, la photo est seule) se juge sur le mur avant de la cocher. Un second clic, la fermeture de l’écran ou « Valider » effacent la surbrillance ; rien n’est écrit pour une ligne seulement vue (`app/audit/parcelle/surbrillance.ts`, `three/scene.ts::surlignerDans3d`).
- **Audit : deux triangles sur deux murs voisins d’un même corps, un pignon traversant.** Un corps ne peut pas avoir son faîtage perpendiculaire à deux murs voisins : le mur le plus large dit le sens du faîtage, le triangle de l’autre devient un pignon traversant qui coupe son pan et monte au faîtage du corps (décision de l’utilisateur, 19 octobre 2026 ; `facade/regles/toits/pignons.ts::pignonTraversant`, `silhouettes.ts` : `traversants`). Sur AE 101, l’aile nord-est prend un pignon sur sa façade est (côté 14, l’œil-de-bœuf) sous le faîtage que dit la façade nord. La proposition « Forme du toit » le dit, explique comment le changer, et porte sous elle la silhouette de chaque mur de ce corps : forcer « ligne droite » sur la façade du pignon le retire ; la forcer sur le mur le plus large fait tourner le faîtage, s’il tient sur la mesure LiDAR (sinon rien n’est proposé, le choix reste dans « Sources »).
- **Audit : la silhouette de chaque façade se réconcilie, la photo gagne sur le LiDAR, et le toit suit.** Le LiDAR dit maintenant, mur par mur, la silhouette que ses corps montrent au-dessus du mur (triangle d’un pignon, ligne droite d’un long pan, rampe, marches, plusieurs sommets), lue sur le corps qui porte le mur : une saillie devant un pignon montre le pignon (AE 101, côté 3 : un triangle, plus une ligne droite à 3,4 m). Cette silhouette s’arbitre contre celle de la photo et celle de Claude ; la photo et Claude l’emportent (`regles/reconciliation.json`, `silhouetteFacade` prioritaire, décision automatique dès un score de 1). La forme, les bouts et le sens du faîtage de chaque corps se déduisent ensuite des silhouettes **retenues** (`constatsReconcilies`), et non plus source par source : une silhouette de photo qui a perdu contre celle de Claude ne parle plus du toit. La proposition « Forme du toit » montre, sous elle, l’arbitrage de la silhouette de chaque mur de ce corps (`facade/regles/toits/silhouetteDesCorps.ts`, `app/audit/parcelle/constats.ts`). Aucune quantité ni aucun export ne change ; AE 101 identique.
- **Vue 3D : la photo d’une façade épouse la silhouette du mur, à l’échelle.** Sur un bâtiment dont le toit est connu corps par corps, la photo plaquée ne s’arrête plus à l’égout en rectangle : elle suit le haut du mur sous les corps (triangle d’un pignon jusqu’au faîtage, marches de deux corps de hauteurs différentes), coupée là où la photo s’arrête. Les mètres de la photo restent ceux du mur (`facade/profil.ts::silhouetteDuMur`, `facade/toitCorps.ts::hauteurDuToitEn`). Aucune quantité ni aucun export ne change.

- **Audit : quatre coins posés au doigt sur une photo valent pour toutes les photos du mur.** Les photos d’une même façade sont redressées par leurs points de fuite et assemblées ; les coins posés sur l’une sont reportés sur les autres, puis chaque côté se cale sur l’arête qu’il longe dans la photo (`zones/releve/coinsAuto.ts::reporterCoins`, `caleSurLesAretes`). Toutes montrent alors le même mur et se croisent à la fusion (vote des ouvertures). Banc, scènes à plusieurs vues : 0 à 1 cm sur les coins vus, 7 à 17 cm sur un coin caché par une voiture ; un pied caché par une haie haute reste où le report le met (56 à 65 cm), et la fusion refuse une paire qui ne s’accorde pas. Le report ne part pas d’un mur « trouvé » sur les arêtes : sur AE 101, un tel mur s’arrêtait à un poteau du pan de bois, et le report le recopiait.

- **Calibrer la détection : un cas depuis un audit de parcelle, sans mètre.** Le bouton « Créer un cas depuis un audit » liste les audits de parcelle reçus, puis leurs façades photographiées ; la façade choisie devient un cas brouillon avec ses photos, la largeur du côté du cadastre et la hauteur du mur sous le toit lue par le LiDAR (relue sur le cas figé du bâtiment, même pour un ancien fichier). L’éditeur cherche aussitôt les coins sur l’assemblage des photos redressées, à la proportion du mur du plan (`app/audit/parcelle/casDeCalibration.ts`, `facade/mosaiqueFuites.ts::rectangleSurLesAretes`).

- **Relevé de façade : une baie en retrait garde toute sa largeur.** Dans un mur épais (pierre, meulière), la menuiserie est au fond de la baie, et une photo prise de biais montre, d’un côté, la face de l’ébrasement entre le nu du mur et la vitre. La détection la prenait pour une ombre (même teinte, autre luminosité) et rendait la vitre seule : une baie trop étroite de la largeur de l’ébrasement visible. Elle reconnaît maintenant cette face (une bande unie, de la teinte du mur, collée à un seul côté de la baie) et étend la baie jusqu’au nu du mur (`facade/detectionEbrasements.ts`, cinq seuils nommés `facades.detection.ebrasement*`). Le banc des façades gagne la profondeur des baies (rendu en lancer de rayons) et la scène `21-ebrasements-profonds-biais` (pierre, retrait de 40 cm, prise à 35°) : cotes de 11,5 → 4 cm, corrections de 6 → 4, aucune fausse baie ; les 21 autres scènes restent identiques. La même scène montre que les points de fuite lus sur les fenêtres restent justes malgré les arêtes des ébrasements (azimut à 0°). Aucune quantité ni aucun export ne change.

- **Vue 3D : du vent dans les arbres, et `?fps=on` pour lire la perf de l’affichage.** Les arbres se balancent (le tronc et les branches d’autant plus qu’ils sont hauts, chaque arbre à sa phase, une rafale lente) et leurs feuilles frémissent ; un résineux est plus raide qu’un feuillu. C’est une préférence d’affichage « Vent » (Vue 3D › Scène), cochée par défaut : ni Ctrl+Z ni « projet modifié », sans effet sur l’export .glb ni sur les ombres portées. Avec `?fps=on` dans l’adresse, un bandeau en bas à gauche du canevas donne les images par seconde, le temps de rendu côté processeur, les appels de dessin et les triangles (« au repos » quand rien ne se redessine) ; sans le paramètre, aucun compteur n’est touché.

- **Une bibliothèque de quarante essences, dix par taille, dans un fichier de données.** `data/admin/arbres.json` (celui que l’écran Admin › Arbres lit et enregistre déjà) livre petits (jusqu’à 6 m : buis, hortensia, lilas, pommier, pêcher…), moyens (6 à 12 m : olivier, cerisier à fleurs, if, houx…), grands (12 à 20 m : pin sylvestre, charme, bouleau, saule pleureur, pin parasol, cyprès de Provence…) et très grands (plus de 20 m : chêne, hêtre, platane, épicéa, cèdre du Liban, séquoia, peuplier d’Italie…), avec des silhouettes qui leur ressemblent (saule qui retombe, peuplier qui se dresse, cèdre étagé). L’écran admin range sa liste par taille, et le choix « Essence » de l’inspecteur présente la sienne de même. La taille se déduit de la hauteur proposée.

- **Les formes du catalogue se lisent sur le LiDAR pour tous les toits, sans audit.** Jusqu’ici, un Mansart, un gambrel, un berceau, une carène, un papillon, une demi-croupe ou un toit de révolution (cône, pyramide, dôme, impériale, flèche) n’était reconnu qu’à l’audit d’une parcelle, quand Claude ou vous le disiez. La lecture des toits les pose désormais d’elle-même quand la mesure les porte nettement mieux que les pentes droites (écart sous 0,4 m et au plus 0,6 fois celui des formes simples, `regles/toits/formes.json`), avant le fait du bâtiment et les garde-fous (`facade/regles/toits/catalogue.ts`). Deux exceptions, nées du banc : le **coyau** attend qu’on le demande, parce que le lissage de la surface imite son pied adouci ; et un **toit de révolution dont l’égout passe la hauteur BD TOPO de plus d’un mètre** est un arbre (`DEPASSEMENT_REVOLUTION_M`, un cône lu sur une couronne au Vésinet). Banc sur six villages (Le Vésinet, Hucqueliers, Gordes, Versailles, Eguisheim, Beuvron-en-Auge) : trois bâtiments changent, tous en demi-croupes, aucun nouveau suspect ; AE 101 identique. Aucun Mansart n’est encore reconnu à Versailles : les toits supposés tels n’ont pas de brisis visible dans la mesure (chantier ouvert). Les seuils des formes entrent dans la version de lecture (`formes` dans `LECTURES_TOITS`, version 4) : **les toits déjà lus seront relus à l’ouverture**, sauf ceux vérifiés sur place. Aucune quantité ni aucun export ne change.

- **Ce que Claude dit d’une maison sert davantage au projet (prompt version 9, schéma version 5).** Une analyse de l’audit a été passée au crible, champ par champ : la moitié de sa sortie n’était qu’une ligne « Vu par Claude ». Désormais, toujours décoché tant que le taux d’accord n’est pas mesuré :
  - **la teinte des murs** : Claude la nomme sur les photos (`teinteMurs` : blanc, crème, beige, ocre, rose, gris clair, gris foncé, brun, rouge brique) et la ligne « Murs de … » propose sa couleur quand celle du projet est d’une autre famille ; la couleur lue sur les pixels de vos photos, plus juste, l’emporte et efface la ligne de Claude. Son **décor** (`decorMurs` : colombages, chaînages de brique, bandeaux) se dit en observation ;
  - **la toiture-terrasse** se complète : une couverture de toit plat vue (gravillons, membrane, végétale) devient son revêtement et suffit à proposer la terrasse quand les passes ne la nient pas ; l’acrotère vu parmi les éléments du toit compte quand le champ de la terrasse ne le dit pas ; un garde-corps vu, sur une terrasse accessible ;
  - **les fenêtres, les portes et les volets se reconnaissent par type** : pour chaque façade, Claude dit le vitrage (verre plein, petits carreaux, verre plein sous une imposte à petits carreaux), l’ouvrant (à la française, coulissant, à guillotine, à soufflet, fixe), la porte d’entrée (pleine, vitrée, semi-vitrée), la porte de garage (sectionnelle, basculante, à battants, enroulable), les volets (battants, roulants, persiennes, un coffre qui dit un volet roulant) et leur couleur (blanc, crème, gris clair ou foncé, bleu, vert, rouge, brun, bois naturel, noir), et les baies cintrées. La ligne « Ouvertures de la façade … » les écrit par un effet nouveau (`detailsOuvertures`) sur le relevé coché au moment de l’écriture, mesure ou renfort : chaque ouverture reçoit ce qui vaut pour son type (pas de petits bois sur une porte, pas de couleur de volets sans volets, pas de guillotine sur une porte-fenêtre) et qu’elle n’a pas déjà ; le renfort, ouverture par ouverture, l’emporte. La Vue 3D les dessine de près : petits bois ou vantaux seuls selon le vitrage et l’ouvrant vus (sinon l’époque, comme avant), traverse d’une guillotine, imposte à petits bois, vitre d’une porte vitrée ou semi-vitrée, panneau lisse, joint ou lames fines d’un garage, volets à leur couleur. Une ouverture sans ces détails se dessine exactement comme avant ;
  - **les ouvertures par niveau** sont votées et dites en observation (« 2 niveaux d’ouvertures (3 + 2) ») ; sur un long pan, elles mettent une réserve sur une hauteur à l’égout qui ne les loge pas (au moins `HAUTEUR_NIVEAU_MIN_M` par niveau, le seuil de la disposition des fenêtres) ;
  - **les images hors sujet** (`imagesHorsSujet`) : Claude donne le numéro des photos qui ne montrent pas le bâtiment (la maison voisine prise pour l’abri de jardin), et la liste de contrôle dit de les reprendre ;
  - **la confiance de Claude** : quand il se dit peu sûr (`faible`), chacune de ses lignes le dit dans sa réserve.

  Les analyses d’avant restent lisibles : un champ qu’aucune passe ne donne ne compte pas comme un désaccord et ne déclenche pas d’escalade. Restent à faire : les formes du catalogue (Mansart, demi-croupe, coyau, toits de révolution, pignon à redents) que Claude voit mais que le moteur des toits ne sait pas encore relire sur la mesure. Aucune quantité ni aucun export ne change.

- **Inspecteur : régler un appentis ouvert ou fermé directement sur un bâtiment.** Quand le toit est en « Corps et pignons (LiDAR) » et qu’un corps est un appentis (galerie, porche), la section « Facades et toit » gagne le choix « Appentis » : sans indication, ouvert (poteaux, pas de mur extérieur) ou fermé (murs jusqu’au sol). Il s’écrit sur tous les appentis du bâtiment, avec Ctrl+Z, comme la ligne « Appentis de … » de l’avant / après, sans passer par l’audit. Aucune quantité ni aucun export ne change ; un bâtiment sans réglage garde son dessin.

- **Audit, avant / après : la ligne d’une façade relevée dit ce qu’elle compte.** Au lieu de « 6 ouvertures relevées, texture de la photo », elle détaille les types et les volets lus : « 6 ouvertures relevées (4 fenêtres, 1 porte-fenêtre, 1 porte ; volets sur 4), texture de la photo ». Le dessin 3D ne change pas.

- **Audit : à la prise de vue, un message dit quand la fusion des photos d’une façade est impossible.** Dès la deuxième photo d’une façade, Plan la redresse et tente la fusion sur place ; si elle échoue (ou ne recale pas une photo), l’écran de prise affiche « Fusion des photos impossible : reprenez la façade avec des chevauchements entre les photos » (en nommant la photo quand la fusion n’est que partielle), pendant qu’on peut encore la reprendre. Le message s’efface à la photo suivante, le temps du nouveau calcul.

- **Calibration admin : l’automatique est la valeur par défaut, ouvertures comprises.** Ajouter une photo à un cas cherche les coins, redresse, fusionne et part de la détection pour les ouvertures (un cas déjà annoté n’est jamais écrasé) ; une case « Automatique » la désactive pour retrouver la pose des coins à la main. Les ouvertures proposées sont à relire avant de marquer le cas « relu sur la photo ».

- **Admin › « Calibrer la détection » : ajouter des photos les redresse et les fusionne tout seul.** Chaque photo ajoutée à un cas voit ses quatre coins cherchés sur les arêtes du mur (le calage fin du relevé, sans capteurs : cadre à 70 % de la largeur, puis arêtes), puis le mur est redressé, les photos sont fusionnées dès la deuxième et la détection propose ses ouvertures, sans passer par la pose des coins. Quand l’automatique doute, la photo est gardée : sa vignette dit « coins devinés, à vérifier » (ou « coins trouvés », « posés à la main » après une correction au doigt) et un message dit quelle vue n’est pas fusionnée, et pourquoi, ou quelle part du mur reste cachée. « Redresser le mur » rejoue le tout après une correction. Retirer une photo ne décale plus les dimensions et l’origine des coins des suivantes. Rien ne change pour l’utilisateur final : ni quantité, ni export, ni empreinte.

- **Audit : « Je confirme » sur ce que Claude a vu du toit, et ses silhouettes de façade enfin lues à l’écran.** Les silhouettes que Claude lit au-dessus de l’égout de chaque façade (pignon, trapèze, rampe…) servaient déjà à l’arbitrage, mais ne laissaient aucune ligne à l’écran : sur l’audit du bac à sable, Claude voyait des pignons sur six murs de la maison et l’écran « Vu par Claude » n’en disait rien. Une ligne « Toit lu sur les silhouettes des façades » dit maintenant ce que chaque mur montre, ce qu’il ferme (bouts, sens du faîtage) et la contradiction éventuelle entre murs. Les lignes sur le toit (forme, bouts, silhouettes) portent un bouton « Je confirme » : il note l’observation dans « Ce que je vois », celle de la personne, qui l’emporte sur Claude ; le moteur des toits la relit alors sur la mesure LiDAR et, s’il sait la dessiner, une proposition arrive à cocher. Rien n’est écrit dans le projet avant « Valider ». Sans mesure LiDAR sur le bâtiment, la ligne le dit d’avance (la confirmation est gardée avec l’audit, le toit ne se redessine pas) ; une contradiction entre murs se lit mais ne se confirme pas. En consultation (lecture seule), on lit sans confirmer.

- **Admin › « Calibrer la détection » (`?admin&ecran=calibration`) : photographier des façades, annoter leurs ouvertures, et laisser Plan chercher les réglages qui font le mieux.** Un cas est une façade : une à quatre photos prises ou choisies sur place, les quatre coins placés sur chacune, la largeur et la hauteur réelles ; le mur redressé montre ce que la détection propose, on retire les fausses ouvertures, on trace les manquées au doigt, on ajuste les cotes, puis on marque le cas « relu sur la photo ». Sur les cas validés, l’écran mesure précision, rappel, cotes et fiabilité de la confiance, puis la calibration essaie, réglage par réglage (les 8 plus décisifs par défaut, les 50 au choix, de la moitié au double de la valeur livrée), des valeurs voisines et ne garde que ce qui fait monter le score d’au moins 0,01 (F1, moins un peu de Brier). Le redressement est fait une seule fois ; seule la détection se rejoue. « Appliquer » enregistre les réglages sur le serveur, dans `data/admin/calibration.json` (les photos annotées dans `data/admin/calibration-cas/`) ; chaque page les lit au démarrage et la détection s’en sert. Les valeurs livrées restent la base : « Revenir aux valeurs livrées » les remet, l’historique est gardé. Sous 20 cas validés l’écran prévient que les propositions sont indicatives (un réglage ajusté sur si peu de façades surapprend). Les routes sont les mêmes en PHP et en Node : `admin/calibration` (lecture sans session, écriture avec) et `admin/calibration-cas` (avec session). Rien ne change tant qu’aucune calibration n’est appliquée : ni quantité, ni export, ni empreinte.

- **Audit de la parcelle : placer les quatre coins à la main quand le redressement se trompe, et corriger l’échelle.** Chaque photo de la façade dépliée a un bouton « Placer les 4 coins » (mis en avant quand le redressement a échoué) : les quatre poignées partent des coins calculés, une loupe aide au doigt, et un champ donne la largeur réelle du mur pour l’échelle. « Appliquer » écrit la correction dans la capture puis rejoue la façade ; elle prime sur le calcul et survit à tout rejeu. « Revenir à l’automatique » la retire. Pas d’accroche automatique aux arêtes pour l’instant.

- **Les baies d’une façade fusionnée sont jugées par un vote entre les vues.** Chaque photo redressée du groupe est aussi lue seule : une baie que plusieurs photos voient mais que peu retrouvent (une haie, une voiture) perd de la confiance et n’est plus cochée d’office ; une baie retrouvée par toutes en gagne un peu ; une baie que plusieurs photos voient et que la fusion a ratée est ajoutée. Sur le banc de synthèse rien ne change (il n’y reste aucun faux positif à retirer) : le gain se mesurera sur le corpus réel.

- **Un corpus de façades réelles et sa mesure.** `tests/fixtures/facades-reel/` reçoit des photos réelles annotées ; `reel.ts extraire` tire des brouillons d’un fichier d’audit (à relire sur la photo avant de les passer à « valide »), `reel.ts mesurer` donne précision, rappel, cotes, et la **fiabilité de la confiance** (courbe, écart de calibration, Brier), avec et sans fusion + vote. Aucune photo réelle annotée n’est encore dans le dépôt : le corpus est à constituer. Premier constat sur le banc de synthèse : les baies de confiance 0,6–0,8 (surtout devinées) ne sont justes que dans 38 % des cas.

- **Audit de la parcelle : toutes les photos d’une façade sont redressées, puis fusionnées, et un bouton « Rejouer redressement + fusion » refait le tout.** Chaque photo est redressée par calcul (aucun appel à Claude) : les coins sont cherchés sur les arêtes, les verticales du mur redressé doivent tenir sous 0,5° ; sinon les quatre coins calculés d’après la prise de vue prennent le relais, puis la photo est marquée « échec » avec son motif (« placez les quatre coins à la main »). Chaque photo porte son statut — redressée automatiquement, avec vos points, ou échec. À partir de deux photos redressées, la façade est fusionnée par des points ORB et un recalage RANSAC (critères nommés dans `CRITERES_FUSION`) : fusionnée, partielle (le plus grand groupe recalable, les autres restent seules) ou photos indépendantes, avec le motif. Une photo n’est jamais supprimée : si la fusion échoue, elle reste redressée seule. Les photos d’origine ne changent jamais, et vos corrections (les quatre coins, la largeur réelle du mur pour l’échelle) priment sur le calcul et survivent au rejeu, tout comme dans le fichier d’audit. Le bouton se trouve dans la liste de contrôle, pour tout l’audit ou pour une façade dépliée, et ne remplace que les images dérivées ; rejoué deux fois, il donne le même résultat. Pas encore d’écran pour poser les coins du doigt avec accroche : seules les données et le calcul les prennent en compte.

- **La grande ardoise posée en losange est une couverture de plus, partout où une couverture se choisit.** Se choisit dans l’inspecteur (Couverture › « Grande ardoise en losange »), se note dans « Ce que je vois » (Matériaux), s’arbitre comme toute couverture (valeur de la réconciliation, ligne de l’avant/après) et se dessine en 3D avec sa propre texture : des ardoises carrées posées sur la pointe, des losanges de 50 cm de diagonale, deux par mètre, des rangs décalés d’une demi-diagonale, des joints en diagonale, chaque ardoise de sa nuance et la pointe du haut ombrée par le recouvrement ; mate comme l’ardoise, et grise comme elle pour la cheminée et la brillance. Claude la reconnaît : le schéma de l’analyse admet `ardoise-losange` et le prompt la décrit (prompt version 8, schéma version 4) ; les analyses d’avant restent lisibles. Aucune quantité ni aucun export ne change ; un toit déjà enregistré garde sa couverture.

- **Un appentis est ouvert ou fermé : une option de l’avant/après, pour les galeries et les porches (maisons de type colonial).** Un appentis ouvert n’a pas de mur extérieur : des poteaux (14 cm, tous les 2,5 m au plus) le portent le long de son égout, sans mur de bout ; fermé, ses murs descendent jusqu’au sol, au bout comme sous l’égout. Sans indication, le dessin reste celui d’avant (`CorpsToit.ouvert`, absent). « Ce que je vois » gagne la ligne « Appentis (galerie, porche) » ; la ligne « Appentis de … » de l’avant/après écrit l’option sur tous les appentis du bâtiment, et on peut la forcer depuis le panneau « Sources » même quand personne ne l’a notée. Ni le LiDAR ni la photo de rue ne le disent : Claude n’est pas encore une source de cette option. Pour un contour de biais, un appentis hors du contour n’est pas dessiné (limite d’avant). Aucune quantité ni aucun export ne change.

- **Admin › « Les principes de Plan » (`?admin&ecran=principes`) explique tout le fonctionnement, principe par principe.** Quinze principes en cinq familles (les bases, d’où viennent les nombres, l’audit sur place, le plan et la 3D, travailler sur Plan) : la reproductibilité, les couches du code, règle/réglage/fait, l’arbitrage des sources, la lecture du toit sur le LiDAR, les formes dessinées par le code, l’audit, Claude analyste, qui décide, les façades, le plan et la 3D, préférence ou donnée, l’interface, l’administration, la livraison. Chacun se lit sous trois angles : le **processus** (les étapes numérotées), les **actions** (qui fait quoi — vous, Plan, Claude ou l’administrateur — et ce que cela déclenche, avec un lien vers l’écran quand il existe) et ce qui se **passe derrière** (le fichier du dépôt ou la donnée). Un sommaire par famille, un choix de l’angle à montrer, une recherche sans accents, des renvois entre principes. La liste est à plat (`model/principes.ts`) ; un test refuse un renvoi inconnu et un fichier cité qui n’existe plus. Aucune quantité ni aucun export ne change.

- **Les lucarnes se proposent dans l’avant/après, et les poids de la réconciliation se règlent à l’écran.** Le LiDAR ne voit pas les lucarnes (une cellule de 50 cm est plus large qu’elles) : leur nombre s’arbitre entre ce que vous avez vu sur place et ce que Claude voit, comme les cheminées, et la ligne « Lucarnes de … » écrit des lucarnes posées à égale distance sur le pan dit (rue, jardin, les deux), du type vu par Claude. Leur place exacte et leur largeur sont celles de leur type : la ligne arrive toujours décochée et le dit, à ajuster dans l’inspecteur. Admin › Règles › « Réglages et faits » › Réconciliation des sources gagne un tableau des poids : un champ par source et par attribut qui n’écrit que sa ligne du fichier, et un recalage sur des audits reçus (fichiers téléchargés d’Admin › Audits) : pour chaque source et chaque attribut, la part des fois où sa valeur est celle que la personne a gardée ; une source souvent juste pèse plus, une source souvent écartée pèse moins (au plus de moitié, huit décisions au moins), ce que la personne a vu sur place n’est jamais recalé. Les poids proposés s’appliquent un à un ou tous ensemble au brouillon, que l’on télécharge pour le poser dans le dépôt. Aucune quantité ni aucun export ne change.

- **La lecture du LiDAR reconnaît la carène et le nombre de faces d’une pyramide.** Un pan bombé dont les bouts sont fermés par un pan est une carène : la 3D dessine maintenant ces croupes courbes (`facade/toitSpeciaux.ts`, facettes en triangles sur une grille ; avant, la carène du catalogue se dessinait comme un berceau) et la lecture essaie plusieurs profondeurs de croupe contre la mesure. Un toit sur plan carré se lit pyramide à 5, 6 ou 8 faces (4 si elle est élancée : une flèche), la hauteur d’un toit à n faces se mesurant à l’apothème de la face. Carène et polygonal rejoignent les valeurs que l’arbitrage de la forme connaît. Le LiDAR seul ne décide toujours pas de la forme. Les lucarnes restent hors de portée du LiDAR (une cellule de 50 cm est plus large qu’une lucarne) : elles viennent de Claude et de la personne. Aucune toiture déjà lue ne change.

- **L’arbitrage décide aussi des cheminées et des ouvertures de façade.** Le nombre de cheminées se tranche entre ce que vous avez vu sur place et ce que Claude voit ; ce qui s’écrit, ce sont les souches (position, matériau) du constat retenu, posées sur le plus grand corps en pente, et vous pouvez forcer un nombre. Le relevé des ouvertures d’une façade se tranche entre les contours de la photo et le relevé renforcé par Claude : la photo seule décide (score 2, comme pour une ouverture que personne ne conteste), Claude la corrobore ou la contredit, un relevé fait à la main est un veto qui laisse la décision à la personne, et le relevé écrit est celui du constat retenu, texture comprise. La ligne « avec l’aide de Claude » reste proposée, décochée, pour ce que Claude affine (types, détails). Le moteur gagne une notion : les sources admises seules, par attribut (`seules` dans `regles/reconciliation.json`). Le constat porte désormais une charge (`Constat.charge`) que le moteur ignore et que la proposition écrit. Aucune quantité ni aucun export ne change.

- **Toutes les formes de toit du catalogue sont dessinées, nommées, et lues sur le LiDAR quand il les porte.** Papillon (deux pans qui descendent vers une noue), coyau, berceau, carène, toits de révolution (conique, polygonal, flèche, dôme, impériale), et, par les corps accolés, shed, toit en M, deux pans décalés ; l’asymétrique et le pavillon sont nommés (`facade/toitSpeciaux.ts`, `model/formeToit.ts`). Trois lucarnes de plus : œil-de-bœuf, outeau, lanterneau ; et l’acrotère des toits-terrasses. Le catalogue de l’écran « De l’IGN à ma maison » compte vingt-neuf vignettes calculées par le code de la 3D, et le modèle reconnaît chacune sous son nom. La lecture des formes (`facade/lectureFormes.ts`, seuils dans `regles/toits/formes.json`, visibles dans Admin › Règles) cherche sur la surface mesurée un profil qui se brise, s’adoucit ou se courbe, un milieu plus bas que les bords, un faîtage qui baisse à un bout, un cône ou un dôme sur plan carré ; chaque forme est dessinée par le code de la 3D et n’est gardée que si elle colle à la mesure bien mieux que le corps des formes simples. Elle devient un constat LiDAR de l’audit, puis la proposition qui écrit le corps. Aucun faux positif sur les quatorze bâtiments réels du corpus ; aucune toiture déjà lue ne change.
- **L’arbitrage décide aussi du matériau des murs, de la couverture et de la hauteur totale.** La valeur notée sur place l’emporte par son poids (D21), Claude n’est qu’un constat de plus, la personne peut retenir ou forcer l’une des valeurs, et les lignes sont rangées par bâtiment. La hauteur totale d’un bâtiment sans corps se tranche entre l’IGN et le LiDAR. `scripts/taux-automatique.ts` dit, sur des audits reçus, combien de décisions le moteur a tranchées seul, combien la personne en a refusées, et pourquoi les autres ont attendu. Le tri d’une promenade propose un fait candidat depuis « Ce que je vois » et la photo du cas, avec ce qu’il suppose et ce qu’un fait ne sait pas dire.

- **L’écran « De l’IGN à ma maison » se lit en direct dans les données.** Les poids des sources, les seuils de la réconciliation et ceux de `regles/toits/reglages.json` (valeur, unité, pourquoi), les versions du prompt et du schéma, la lecture des toits et les empreintes viennent des fichiers et des registres, plus du texte écrit à la main (`app/chaineVivante.ts`). Une source, un attribut arbitré, une étape de lecture du LiDAR, un sujet de l’audit ou une forme du catalogue ajouté aux données y apparaît tout seul (« Lu des données »). Ce qui ne se lit plus (un seuil retiré, une forme sortie du catalogue) est dit sur l’écran, et les tests refusent qu’une ligne cite un fichier qui n’existe plus.

- **Admin › « De l’IGN à ma maison » : le schéma de bout en bout (`?admin&ecran=chaine`).** Sept étapes en flèche (sources, polygone, découpage du toit en corps, objets 3D, textures, réconciliation, processus d’audit), chacune détaillée : ce que chaque ligne est, si elle se décide seule, à la main ou aux deux (filtre par mode), où elle vit dans le code, un lien vers l’écran qui la règle quand il existe, et un renvoi vers la ligne liée. La chaîne est une liste à plat de nœuds (identifiant, parent, genre, mode, écran, renvoi) dont l’arbre se déduit (`model/chaine.ts`) : ajouter ou déplacer une branche ne touche qu’une ligne, et `verifierChaine` refuse l’identifiant répété, le parent ou le renvoi inconnu, le cycle. Un catalogue de douze vignettes isométriques (`facade/catalogueToits.ts`) montre les formes que la 3D dessine, calculées par le même code que la 3D : deux pans, quatre pans, un pan, plat, demi-croupe (croupe meunière), gambrel, Mansart, et les lucarnes jacobine, capucine, chien-assis, rampante et meunière. Rien ne change pour l’utilisateur final ni pour les exports.

- **Les sources se réconcilient : un moteur de règles et de décision arbitre IGN, LiDAR, photos de façade, Claude et ce que vous voyez, attribut par attribut.** Pour chaque bâtiment (hauteur à l'égout, forme du toit, bouts, sens du faîtage, silhouette des façades…), chaque source dit sa valeur avec sa confiance et la règle qui l'a lue ; les valeurs qui s'accordent forment un groupe, pesé par le poids de la source (`regles/reconciliation.json`, seuils `SCORE_AUTO_MIN`, `MARGE_AUTO_MIN`). Le moteur décide seul quand c'est sûr, sinon il vous laisse décider et dit pourquoi. L'écran des propositions montre les sources de chaque décision (Retenu / Écarté, avec le seuil de la règle LiDAR) et un panneau « Sources » par bâtiment : « Retenir » un groupe, « Forcer » une valeur, « Reprendre le choix du moteur » ; décider coche la proposition, rien n'est écrit avant « Valider ». Une ligne dit combien de décisions sont automatiques. Admin › Règles › « Sources et arbitrage » montre les poids, les seuils et les règles LiDAR. Spécification : `MD/spec-reconciliation.md`. Aucun export ni aucune quantité ne change.

- **La 3D dessine le Mansart, le gambrel, la demi-croupe et les lucarnes, et les intègre à la toiture.** Un corps qui porte un `profil` brisé (brisis raide puis terrasson), des bouts en `brisis` ou en `demi-croupe`, ou des `lucarnes` (jacobine, capucine, chien-assis, rampante, meunière) se dessine en facettes planes, avec le débord de l'égout, et la hauteur du toit en un point (donc les murs et les fenêtres) suit les mêmes plans (`facade/toitFormes.ts`, `three/toitCorps3d.ts`) ; sur un contour de biais, les facettes sont découpées comme les autres, et les faces et joues des lucarnes se posent sur le toit. Un corps sans ces champs garde le dessin d'avant à l'identique (AE 101 inchangé, aucune empreinte ne bouge). Aucune règle ne produit encore ces champs : les lire sur le LiDAR ou depuis les propositions de Claude (lots G4, G5, G7) reste à faire.

- **L’audit dit quand les photos partent à l’analyse, et Admin › Audits les relance.** À l’écran des propositions, le toast annonce « Photos soumises à l’analyse des façades à HH:MM : n photo(s) sur m façade(s) », puis « Analyse des photos terminée à HH:MM : … coins trouvés sur … » (l’envoi à Claude garde son propre toast). Dans le détail d’un audit reçu, un bouton « Relancer l’analyse des photos » se tient à côté de « Rejouer l’analyse » : il ouvre l’audit dans le projet (même parcelle, écriture permise) sans ses mesures ni ses décisions, si bien que ses photos repassent par les mesures d’aujourd’hui (relevé des façades, silhouettes, toit) et se poussent sur les façades du projet, annulable par Ctrl+Z. « Rejouer l’analyse » ne change pas : il ne renvoie que l’analyse de Claude.

- **La silhouette des façades dit le sens du faîtage et la forme du toit, dans les mots de Claude.** Chaque façade porte `silhouette` (`triangle`, `trapeze`, `rampe`, `ligne-droite`, `marches`, `plusieurs-sommets`, les mots de « Lire les pignons d’abord ») et `bout` (`pignon`, `croupe`, `demi-croupe`, `brisis`, `sans-objet`, le même `bout` que `bouts.gauche`) : prompt version 7, schéma version 3. Plan mesure aussi la silhouette sur la photo (silhouette au-dessus de l’égout). Le moteur des toits (`facade/regles/toits/silhouettes.ts`) en tire le **sens du faîtage** (perpendiculaire à un mur de bout, parallèle à un long pan ; le sens que soutiennent les murs les plus larges) et les **bouts** (un mur de bout l’emporte sur un long pan : un trapèze dit des croupes, une ligne droite des pignons), puis la toiture se **recalcule** sur la mesure LiDAR avec ces paramètres (`corpsSousContrainte`, fait en contrainte `faitage` par azimut + `bouts` + `forme`) : un faîtage qui tourne de 90° refait le toit dans l’autre sens. Une demi-croupe ou un brisis donnent le sens, jamais les bouts (le moteur ne sait pas les produire). La ligne « Forme du toit » arrive sur l’écran des propositions avec son avant/après dans la Vue 3D, décochée avec ses raisons ; quand les murs et la vue d’ensemble de Claude divergent, les murs l’emportent et la ligne le dit. Les seuils (tolérance d’un mur de bout, part d’un second sens) et la table de lecture (silhouette + bout → rôle du mur et ce qu’il dit) sont une donnée du moteur de règles, `regles/toits/silhouettes.json`, lue par `src/regles/toits/silhouettes.ts` et montrée et éditable dans Admin › Règles › « Réglages et faits » (un fichier de plus : il ne change aucune toiture déjà lue, donc aucune ligne de version de lecture).

- **Les photos de l’audit alimentent les façades toutes seules.** Dès que la mesure d’une photo de façade est prête (coins trouvés, confiance suffisante, aucune réserve), son relevé (ouvertures et texture) est écrit sur la façade du projet, sans « Valider », en un seul pas d’historique que Ctrl+Z défait. Un relevé fait à la main n’est jamais écrasé : la ligne reste une proposition décochée. Le relevé posé par l’audit porte la marque `depuisAudit` ; une mesure plus récente le remplace, un relevé refait à la main la fait tomber.

- **Conformité des façades (lot G13).** Sur chaque façade relevée d'un audit reçu, la disposition automatique des
  fenêtres est posée sur le même mur (`ouverturesDUnMur`, extrait de `ouverturesAutomatiques` sans en changer un
  résultat) et comparée au relevé : baies à ± 1, part vitrée à ± 20 %, hauteur des niveaux à 30 cm. Admin ›
  Conformité montre le taux (tuile, colonne « Façades » par région, onglet « Façades » avec le relevé et la
  disposition côte à côte, historique) et la mesure rangée sur le serveur le porte. C'est une mesure : elle ne change
  aucune valeur produite par Plan, et dit où un profil de façades (G14) servirait.
- **Un modèle plus fin départage les passes de Claude qui se désaccordent (D20).** Quand les trois passes ne
  s'accordent pas sur un attribut d'un bâtiment, ce bâtiment repart seul (première passe, mêmes images) par l'appel
  immédiat, usage `escalade`, sous les plafonds de l'organisation. La réponse ne tranche que les attributs sans
  unanimité ; la ligne arrive décochée et le dit (« un modèle plus fin a tranché : à vérifier »). Un plafond atteint ou
  un échec garde le vote des trois passes. Le modèle est celui réglé pour « Escalade » (Haiku par défaut : à passer à
  un modèle plus fin dans les réglages pour que l'escalade serve à quelque chose).
- **La valeur notée sur place l'emporte sur celle de Claude (D21).** Sur le matériau des murs, la couverture, les
  cheminées et le toit-terrasse, la ligne de Claude arrive décochée avec la raison, et cocher l'une décoche l'autre.

- **Admin › Règles : le brouillon s'essaie avant la PR.** « Enregistrer sur le serveur » garde le prompt, le
  schéma et l'état de l'éditeur côté serveur (`admin/claude/regles`, PHP et Node, administrateur seul) ;
  « Reprendre celui du serveur » le rouvre d'un autre navigateur. Il ne remplace jamais le prompt livré : seule une
  demande de l'administrateur qui le nomme (`essai: "brouillon"`) le lit. **`?regles=local`** (le mode d'essai des
  faits) fait partir l'analyse de l'audit avec le prompt du brouillon, et le dit ; le batch garde une copie du texte
  envoyé (la réponse se ramène à *son* schéma, même si le brouillon change ensuite), et le journal, la fiche et la
  trace portent la marque d'essai.
- **Admin › Audits : rejouer un audit avec le prompt édité, et comparer les réponses.** Case « Avec le brouillon
  des règles (vN) » à côté du modèle du rejeu ; la liste des analyses dit « brouillon 6 » dans la colonne du prompt.
  Une analyse ouverte se compare à une autre du même audit : le vote des trois passes de chaque bâtiment, attribut
  par attribut (forme, bouts, lucarnes, couverture, façades, champs des sujets ajoutés…), ne montre que ce qui change,
  avec l'accord de chaque côté.
- **Admin › Règles édite aussi les réglages et les faits** (onglet « Réglages et faits ») : un seuil change de valeur ou
  de raison sans reformater le fichier (le diff d'une PR montre sa ligne), le lecteur du code contrôle le texte, et
  l'écran dit si l'empreinte change (les toits déjà lus seront relus) en donnant la ligne de version à ajouter à
  `LECTURES_TOITS` ou `LECTURES_FACADES`. Un fichier que le moteur refuserait ne se télécharge pas ; les faits
  (`regles/toits/faits.json`) s'éditent en texte, avec la liste de leurs bâtiments.
- **Le vote des passes lit les sujets ajoutés.** Un champ `{ indices, valeur }` ou `{ indices, nombre }` déclaré
  par une description est lu et voté sans code propre (`VoteAnalyse.simples`, `src/regles/sujets/vote.ts`) ; un
  champ mal formé refuse la passe, un champ absent d'une réponse gardée d'avant le sujet est ignoré. Un sujet
  ajouté depuis Admin › Règles se dit aussi en observation (« Chiens-assis vu : 2 ») sans module.

- **Admin › Règles (`?admin&ecran=regles`) : le prompt et le schéma de Claude, composés par les sujets, en
  direct.** Chaque sujet de l'audit a une description (ce que Claude lit, comment il répond, son vocabulaire,
  ses confusions) ; `deploy/prompt-analyse.md` et `deploy/schema-analyse.json` sont désormais **générés** depuis
  elles (`npm run regles:generer`, `regles:verifier`), à l'octet identiques à ceux d'avant (prompt version 4, schéma
  version 1). L'écran montre les sujets (ce qu'ils proposent au projet et ce qu'ils écrivent, l'accord mesuré de
  Claude), laisse en exclure un du prompt, éditer ses textes et son schéma, ou **ajouter un sujet en brouillon**
  (un chien-assis, un objet du jardin) : le prompt et le schéma se recalculent à chaque frappe, avec les lignes qui
  changent par rapport au livré, la version à poser et les contrôles (schéma fermé, une consigne par champ, termes
  définis, rangs uniques). On télécharge le module du sujet et les deux fichiers ; rien n'est écrit sur le serveur,
  le brouillon reste dans le navigateur. Un texte changé sous la même version est refusé par un test.

- **Audit : la forme du toit vue par Claude devient une proposition à décider.** Ce que Claude lit sur
  les pignons et les croupes (forme, bouts) est relu sur la mesure LiDAR par le même mécanisme que les
  faits (`corpsSousContrainte`) : le corps principal est relu parmi les seules formes vues, les autres
  corps ne bougent pas. La ligne « Forme du toit de … » montre l'avant (la forme lue aujourd'hui) et
  l'après, l'écart à la mesure avec cette forme (aujourd'hui / après) et les écarts que Claude a relevés
  entre le rendu et la photo ; elle arrive décochée. Rien n'est fabriqué : une forme que Plan ne sait pas
  lire (Mansart, demi-croupe…), des bouts qui se contredisent, un écart au-delà de 0,8 m ou l'absence de
  mesure LiDAR laissent la ligne dans « Vu par Claude ». Cochée et validée, elle remplace les corps du
  bâtiment (Ctrl+Z). « Forme du toit » est un cinquième attribut dont le taux d'accord se mesurera.

- **Claude lit les pignons d'abord** (prompt d'analyse, version 4) : la silhouette du haut de chaque
  façade (triangle, trapèze, rampe, marches) dit la forme du toit et ses bouts, et chaque désaccord
  entre le rendu et la photo va dans les écarts. Le schéma de la réponse ne change pas.
- **Contour noir sur le rendu de la façade pour Claude** : arêtes des murs, du pignon et du toit,
  épaissies, pour que la limite façade / pignon / toit se lise sans hésiter.

- **Les arbres sont générés par EZ-tree, depuis une bibliothèque d'essences que l'administrateur crée**
  (`MD/spec-arbres-3d.md` 2.0). Nouvel écran Admin › Arbres (`?admin&ecran=arbres`) : on y crée des
  essences (un nom, caduc ou persistant, des dimensions, les réglages d'EZ-tree à partir des quinze modèles
  ou d'un arbre vierge) avec un aperçu 3D, ses triangles et le temps de génération. La bibliothèque vit sur le
  serveur (`admin/arbres`, lisible sans session, PHP et Node). L'inspecteur d'un arbre ne propose plus qu'une
  liste « Essence », avec le diamètre du feuillage ; choisir une essence propose sa hauteur et son diamètre.
  Les arbres d'une même essence se dessinent en `InstancedMesh`. EZ-tree (4 Mo) ne se charge que si la
  bibliothèque n'est pas vide ; sans lui ni essence, l'arbre est un tronc et une boule.

- **Une bibliothèque d'essences livrée avec Plan : 145 arbres, arbustes et haies** (`MD/spec-arbres-3d.md`
  §2.1). Feuillus caducs (chênes, hêtres, érables, tilleuls, platane, bouleaux, saules, peupliers…),
  fruitiers, ornement, conifères (pins, épicéas, sapins, cèdres, cyprès, thuyas, if, mélèze…), persistants
  (chêne vert, olivier, lauriers, houx, buis…) et haies. Elle sert tant que le serveur n'a enregistré aucune
  bibliothèque ; une bibliothèque enregistrée la remplace. L'import du cadastre propose l'essence d'après la
  nature de la zone (verger : pommier, conifères : pin sylvestre, haie : charme…). Admin › Arbres : bouton
  « Reprendre les essences par défaut » pour les retoucher ; le serveur accepte désormais 200 essences et
  512 Ko. EZ-tree (4 Mo) se charge donc à l'ouverture de la Vue 3D même sans bibliothèque du serveur.

### Modifié

- **Façades : une seule chaîne de redressement, de fusion et de cotes pour l’audit, le relevé et la calibration.** Les calculs étaient déjà communs (`src/facade/`), mais chaque écran les enchaînait à sa façon : les replis de l’audit (champ de l’objectif lu sur les points de fuite sans EXIF, coins de la prise de vue quand les verticales penchent, côtés ramenés sur les verticales, report du mur posé au doigt sur les autres photos) n’existaient ni au relevé ni à la calibration, et la calibration cherchait ses coins par une autre méthode. Tous passent maintenant par `zones/releve/chaine.ts` et `facade/analyseMur.ts`. Le relevé gagne les replis de l’audit, sans jamais toucher un coin posé au doigt, et des coins qui ne forment pas un mur cèdent la place à ceux de la prise de vue plutôt que de ne rien rendre. La calibration trouve ses coins comme l’audit (et lit encore le mur sur l’assemblage des vues pour les photos sans prise de vue). Les essais de coins se jugent sur une élévation réduite (512 px) : l’analyse, seule coûteuse, ne se fait qu’une fois. Mesuré sur les 22 scènes du banc : l’audit rend les mêmes relevés, 10 % plus vite (médiane 489 → 462 ms) ; la calibration trouve des coins égaux ou meilleurs (scènes 13, 14, 16, 17, 19 : de 14–600 % de la largeur d’écart à 2–11 %), pour 30 ms de plus en médiane ; le relevé paie 28 ms par photo pour ses replis. Aucune quantité ni aucun export ne change.

- **Audit : la silhouette des façades décide de la forme du toit.** Pour la forme du toit, ses bouts et le sens du faîtage, ce que disent les silhouettes des murs (photo de façade, Claude ; `regles/toits/silhouettes.json`) l’emporte sur le LiDAR, quel que soit son poids : seules les silhouettes, et ce qui a été vu sur place, se départagent (`prioritaires` dans `regles/reconciliation.json`, `facade/regles/reconciliation.ts`). La forme que Claude tire des silhouettes remplace aussi celle qu’il donne pour l’ensemble, sauf quand seules des lignes droites de longs pans la disent (le haut d’un deux-pans comme d’un appentis : l’abri d’AE 101 serait passé en deux pans). Une source qui n’a pas le droit d’être seule (Claude, la photo) laisse encore la décision à la personne, la silhouette proposée. Le LiDAR garde les hauteurs. **Corps par corps** : chaque façade est rattachée au corps du toit qui la porte (le côté de corps qui longe le mur, à 1 m près et sur la moitié de sa largeur : `facade/regles/toits/murDuCorps.ts`, seuils `MUR_CORPS_*` de `regles/toits/silhouettes.json`) ; ses silhouettes ne parlent que de lui. Le corps principal garde les lignes d’arbitrage du bâtiment ; chaque autre corps a les siennes (forme, bouts, sens, contre sa lecture LiDAR), et une proposition qui ne relit que lui (effet `corpsDuToit`, les autres corps ne bougent pas). Sur AE 101 (quatre corps, pignons à l’est et au nord), le bâtiment entier voyait « deux sens de faîtage » ; corps par corps, les silhouettes de Claude confirment chacune le sens lu par le LiDAR (74° le corps principal, 164° les ailes) et rien n’est proposé : le modèle reste. Aucune toiture déjà lue ne change : ce sont les propositions de l’audit.

- **Photos sans EXIF : la focale se lit sur les points de fuite.** Les photos de l’audit d’AE 101 (octobre 2026) étaient prises à l’ultra grand-angle (0,5x) : une focale moitié de celle supposée (67°), qui faussait le redressement par les fuites, ses proportions, et l’inclinaison lue sur les verticales. La verticale et l’horizontale du mur sont orthogonales : leurs deux points de fuite donnent la focale (`facade/redressementFuites.ts::focaleDesFuites`), quand la photo est prise vers le haut et de biais ; sinon (photo d’aplomb, de face), la focale d’un téléphone, comme avant. Le relevé de l’audit la prend quand la photo n’a pas d’EXIF (`priseDeLaPhoto`). Sur AE 101 : l’assemblage par les fuites (calibration, report des coins) relie 4 paires de photos sur 4 (3 avant) ; dans l’audit, le mur est trouvé sur 5 façades sur 12 (3 avant), le mur ouest n’empiète plus sur le toit, et 19 ouvertures sont relevées (15 avant). Les deux façades est gagnées ne montrent pas un mur net : le calage des photos prises de loin reste à faire. Banc des façades inchangé.

- **Relevé de façade : les fenêtres d’un étage sous le même linteau, une travée sur le même axe.** La régularisation égalisait déjà les largeurs (travée) et les hauteurs (rangée) ; elle aligne maintenant les places, à 5 cm au plus et à partir de trois baies (la médiane de deux est leur moyenne, qui tirerait la bonne vers l’autre), sans jamais déplacer un bord de plus de 10 cm (`facade/structure.ts::regulariser`). Banc inchangé (les baies y sont déjà au centimètre) ; c’est pour les quelques centimètres d’écart d’une photo réelle.

- **Audit de parcelle : la hauteur du mur est celle du LiDAR.** Le relevé des façades et le fichier de l’audit prenaient la hauteur du prisme (3,4 m) ; ils prennent maintenant celle du mur sous le toit lue par le LiDAR, comme la liste des façades. Le calage sur l’assemblage des photos reste coupé dans l’audit (`SERIE_DANS_L_AUDIT`) : sur des photos prises de loin, il cadrait une fenêtre ou un pan de bois plutôt que le mur. Aucune quantité ni aucun export ne change.

- **Admin › Calibrer la détection : les coins se lisent sur l’assemblage des photos redressées par leurs points de fuite.** Sur les cas du bac à sable (Hardencourt, 16 photos), les coins du mur n’étaient trouvés que sur une photo : les photos réelles montrent rarement le mur entier, et le calage par les coins y prenait une fenêtre ou un volet pour le mur ; aucune fusion ne tenait. Chaque photo est maintenant redressée par ses seuls points de fuite (`facade/redressementFuites.ts` : verticales et horizontales du mur, focale d’un téléphone supposée), les vues redressées s’assemblent en mosaïque par points communs à échelle libre (`facade/mosaiqueFuites.ts`), le mur y est lu de l’égout au pied, puis ses coins sont reportés dans chaque photo, même hors du cadre. Sur les quatre cas : 16 photos redressées sur 16, deux cas entièrement fusionnés (3 photos sur 3), un en partie ; la hauteur du mur suit les proportions lues, à la largeur donnée. Les coins posés à la main, et ceux trouvés sur les arêtes d’une photo qui montre le mur entier, ne sont pas repris ; un quadrilatère croisé n’est plus pris pour un mur. Nouveau bouton « Retrouver les coins sur toutes les photos », pour les cas déjà enregistrés. L’audit de la parcelle et le relevé ne changent pas.

- **Audit : huit photos partout.** Une promenade garde jusqu’à huit photos par cas (six auparavant) ; l’audit de la parcelle, huit pour le toit d’un bâtiment, la clôture et le portail (quatre auparavant), comme pour une façade et dans l’éditeur de calibration. Huit photos d’un cas pèsent environ 3,2 Mo.

- **Admin › Calibrer la détection : jusqu’à huit photos par façade** (quatre auparavant), comme l’audit de la parcelle et le serveur, qui les acceptaient déjà.
- **Admin › Audits : « Rejouer l’analyse » demande une confirmation.** Le rejeu renvoie les photos de l’audit à Claude (un appel facturé qui s’ajoute aux analyses gardées) : le bouton ouvre d’abord, sur la carte, une question qui dit le modèle et le prompt (livré ou brouillon des règles), avec « Confirmer le rejeu » et « Annuler », comme pour le retrait d’un audit. Rien ne part avant la confirmation. « Relancer l’analyse des photos », qui est locale et gratuite, ne demande rien.

- **Le code n’a plus aucune essence d’arbre.** Les 145 essences de `model/especesParDefaut.ts` (et les presets de base) sont retirées : sans fichier sur le serveur (`data/admin/arbres.json`), les arbres se dessinent en tronc et boule. La livraison pose le fichier dans `data/admin/` ; une installation qui a déjà un `data/` copie ce seul fichier. Un arbre dont l’essence n’est plus dans la bibliothèque suit la première (le chêne pédonculé). Le bouton « Reprendre les essences par défaut » disparaît de l’écran admin. Aucune quantité ni aucun export ne change ; les témoins se capturent sans bibliothèque.

- **La fusion de plusieurs vues d’une façade recale par ORB + RANSAC.** L’ancien recalage en deux dimensions (corrélation sur une grille de décalages) est remplacé par une similitude trouvée sur des points ORB (`facade/orb.ts`, `facade/ransac.ts`, `facade/recalageOrb.ts`), acceptée seulement si elle tient des critères nommés et une corrélation de contrôle. Le banc de façades retrouve les chiffres d’avant (rappel 80 % → 100 %, précision 80 % → 96 %, 0,3 correction par façade). L’effacement des obstacles par la parallaxe et la composition par qualité sont gardés : sans eux le rappel tombait de 1,0 à 0,83. L’assemblage en morceaux côte à côte (`mosaique.ts`) est inchangé.

- **Prompt d'analyse version 5 : les termes du schéma que le texte ne définissait pas le sont.** Les contrôles
  d'Admin › Règles signalaient trois alertes : les matériaux de couverture (`tuile-plate`, `tuile-canal`,
  `tuile-mecanique`, `ardoise`, `zinc`, `bac-acier`, `membrane`, `gravillons`, `vegetale`), le sens du faîtage
  (`parallele-rue`, `perpendiculaire-rue`, `sans-faitage`) et `chassis-eclairage` n'étaient définis nulle part, et
  Claude les devinait de son vocabulaire. Le schéma ne change pas (version 1). **Le texte envoyé à Claude change** :
  ses réponses sur la couverture, le faîtage et les châssis peuvent changer, donc les propositions d'un rejeu aussi
  (le rejeu avec le brouillon d'Admin › Règles est fait pour le mesurer) ; aucun calcul de Plan ne bouge.
- **Les sujets de l'audit portent le même identifiant côté description et côté module.** La description disait
  `attributs`, le module `id` : le module reprend l'id de sa description (`materiau` devient `facades`, attribut
  `materiauMurs`), son nom à l'écran est celui de la description, et l'attribut dont l'accord se mesure est
  `Sujet.attribut`. Les observations sont dites par le registre (`Sujet.observer`, comme `proposer`) : lucarnes,
  éléments du toit et écarts y entrent, et `observationsClaude.ts` ne code plus la forme, les bouts, les lucarnes ni
  les éléments. Les lignes montrées et leurs identifiants sont inchangés.

- **Le moteur de règles est rangé en un seul endroit, nommé `regles/`** (`MD/architecture.md` §5.2.4,
  `CLAUDE.md`) : un dossier par couche, `src/regles/` (réglages, profils, faits, décisions, conformité),
  `src/facade/regles/` (appliquer un fait ou un profil, garde-fous, rejeu) et `src/app/regles/sujets/`
  (ce que l'audit sait proposer, un module par sujet, un registre `SUJETS`). Les modules ont été déplacés
  et leurs imports réécrits, sans changer une ligne de calcul : AE 101 et les empreintes golden sont
  identiques. Ajouter un sujet (chien-assis, objet du jardin) = un module, une ligne du registre, son
  effet et son attribut ; la liste est dans l'architecture.

- **Rendu de la façade pour Claude : la façade seule.** Trois plans de coupe retirent ce qui avance
  devant le mur (une dépendance du même bâtiment, un corps bas) et ce qui dépasse de ses bouts.
- **Audit, vue de la façade choisie : à hauteur d'homme.** La caméra descend à 1,7 m au lieu de la
  mi-hauteur du bâtiment, le regard reste horizontal et la distance garde le haut du mur dans l'image.

- **Les anciens dessins d'arbres sont supprimés** (lobes, dôme, touffes, taillé, maquette d'architecte,
  feuilles instanciées, port, essence caduc/persistant, texture du feuillage), sans correspondance : un
  ancien plan dessine ses arbres avec la première essence de la bibliothèque. La hauteur d'un arbre est
  maintenant celle de l'arbre entier. L'export GLB emporte les arbres en instances
  (`EXT_mesh_gpu_instancing`) ; `glb-structure.json` et `cadastre-objets.json` recapturés
  (`tests/fixtures/golden/EMPREINTES.md`).

- **three.js passe de la r128 à la 0.186.1** (la dernière). Les builds UMD et `examples/js` n'existent plus : la
  bibliothèque arrive en modules ES depuis jsDelivr (`src/three/bibliotheque.ts`), par une table d'import
  inline dans `index.html` ; elle reste non empaquetée et ne se charge qu'à l'ouverture de la Vue 3D. La
  politique de contenu ne nomme plus que `cdn.jsdelivr.net` (cdnjs est retiré, ainsi que des origines de la
  capacité `plan.3d`) ; la table d'import entre dans `script-src` par son empreinte.
  - **Le rendu est inchangé**, vérifié au banc visuel d'AE 101 (écart au bruit de compression, en Normale
    comme en Soignée) : gestion des couleurs coupée, sortie linéaire, lumières × π (les lumières sont
    physiques depuis la r165), courbe de film conservée ; en Soignée, l'occlusion passe par une passe de rendu,
    la SSAO puis une passe de sortie qui laisse le ciel sans courbe, comme avant.
  - **Le .glb téléchargé change d'octets, pas de contenu utile** (`tests/fixtures/golden/EMPREINTES.md`) : les
    mailles à plusieurs matériaux sont désormais indexées par groupe (la r128 faisait dessiner à chaque
    matériau toute la maille), l'extension `EXT_materials_bump` apparaît, et les images JPEG restent des JPEG.
    Nœuds, mailles, matériaux, textures et images inchangés ; `glb-structure.json` recapturé. Les six empreintes
    des exports de chiffrage ne bougent pas.
  - Outillage : `servirThreeLocal` sert les modules depuis `node_modules/three` quelle que soit la version ;
    `BANC_QUALITE_VUES=soignee` rend les images du banc à ce niveau.

### Corrigé

- **Une propriété de plusieurs parcelles reste un seul terrain, avec une seule clôture.** À l’import, les parcelles cochées « propriété » sont bien fusionnées en un seul terrain ; mais toute relecture du voisinage qui suivait (Actualiser depuis l’IGN avec le voisinage, le chargement autour de vous dans l’audit) ne reconnaissait que la parcelle principale, et reposait les autres parcelles de la propriété en voisines par-dessus le terrain. Elles sont maintenant reconnues comme déjà dans le plan (`model/cadastre.ts`), et une actualisation retire celles qu’une relecture d’avant avait posées. La fusion elle-même accepte aussi deux parcelles dont l’une a un sommet à quelques centimètres du coin commun (Gordes, BK 154 + BK 158, refusées jusqu’ici). Sur trois communes (Le Vésinet, Versailles, Gordes), toutes les paires et tous les triplets mitoyens fusionnent, sauf ceux qui ne se touchent que par un coin ou qui entourent une autre parcelle. Aucune quantité ni aucun export ne change.

- **Appentis ouvert (galerie, porche) : plus de mur ni de fenêtres, et le toit s’arrête au nu des murs de la maison.** Un appentis réglé « ouvert » gardait un prisme plein du sol à son égout, devant le mur de la maison, et les fenêtres de ce mur : ses poteaux étaient dessinés, mais la galerie restait une boîte fermée. Il n’a plus ni prisme ni fenêtres : sous lui, on voit le mur et les fenêtres du corps qui le porte. Un appentis adossé à un autre corps n’a plus de rive aux bouts ni de débord au-delà de son mur haut : sur AE 101 (Le Vésinet), le toit de la galerie sud dépassait le coin de la maison. Une première correction, qui coupait la galerie au mur du contour, l’arrêtait 85 cm avant le coin du mur dessiné : elle est retirée, la référence d’AE 101 est revenue à celle du 14 octobre, et les toits déjà lus seront relus à l’ouverture.

- **Audit de la parcelle : les photos de façade se redressent sur leurs verticales.** Sur l’audit d’AE 101 (18 octobre), une photo sur deux échouait au contrôle des verticales et aucune façade n’avait ses coins trouvés : trois causes. L’attitude du téléphone (inclinaison, roulis) est lue au retour de l’appareil photo, téléphone baissé, pas au déclenchement (−17 à −48° pour des photos prises vers le haut) : elle n’est plus reprise, le calage la lit sur la photo. Les coins prédits n’étaient plus ramenés au bord du cadre pour le calcul (ils ne décrivaient plus le mur). La distance tirée du GPS (2,7 m pour un pignon vu en entier, à 5 m près) n’est gardée que si elle dépasse deux fois la précision annoncée. Enfin, quand les arêtes du mur restent introuvables, les côtés du cadre prédit passent par le point de fuite des verticales lues sur la photo (`facade/verticales.ts`). Sur cet audit : 16 photos redressées sur 17 (8 avant), 3 façades aux coins trouvés sur 12 (aucune avant). La fusion des paires reste refusée : sans arêtes trouvées, les photos d’un même mur ne sont pas à la même échelle, et le relevé reste proposé décoché (« coins prédits »).
- **Admin › Audits : un rejeu ne part plus sans un bâtiment de l’audit.** Le 18 octobre, sur le bac à sable (AE 101), un rejeu est parti avec le seul abri de jardin : le projet ouvert ne reconnaissait pas la maison comme bâtiment de la parcelle (3 requêtes au lieu de 6, 15 images au lieu de 111), et l’analyse, facturée, n’avait aucune ligne pour elle, sans un mot. Le rejeu compare maintenant les bâtiments qui ont des photos dans l’audit à ceux du projet ouvert : s’il en manque un, il refuse de partir et dit lequel (« « Maison » (12 photos) n’est pas reconnu comme bâtiment de la parcelle… »), en demandant de vérifier qu’il est posé sur la parcelle et qu’il n’est pas marqué voisin.

- **Calibrer la détection sur téléphone.** La barre d’état collée en bas recouvrait le formulaire : elle défile maintenant avec la page. Les champs font 16 px au moins (le navigateur du téléphone ne zoome plus la page au focus). Le mur redressé ne bloque plus le défilement du doigt : on tape « Tracer une ouverture » pour dessiner un rectangle, et le tracé coupé laisse le doigt faire défiler. « Calcul… » s’affiche avant que le redressement n’occupe le fil. Parcours rejoué dans Chromium en émulation iPhone 13 (390 px, tactile) : prise d’une photo de 12 Mpx, pose des coins, redressement, annotation, enregistrement.

- **Écran de prise : une façade choisie se voit de face.** À la sélection (touchée ou prise dans la liste),
  la caméra arrive en élévation, comme le rendu pour Claude : perpendiculaire au mur, à mi-hauteur,
  regard horizontal, la façade entière dans la partie visible au-dessus de l'écran de prise. L'inclinaison
  est figée ; la vue pivote sur l'axe vertical du bâtiment choisi (pas autour de lui ou doigt), à la
  distance de l'arrivée.
- **Le rendu du modèle que reçoit Claude est l'élévation de la façade, de face et sans obstacle** (audit
  de la parcelle, relevé du 16 octobre sur AE 101 : le rendu montrait la façade de biais ou de très loin,
  sous la façade surlignée, le point GPS et le trait renforcé, avec une annexe ou le relief devant le mur).
  La caméra se pose sur la normale du mur, en son milieu, à l'horizontale et à mi-hauteur : les verticales
  restent verticales et les ouvertures gardent leur forme. Pendant l'image, les repères de l'audit sont
  cachés et seul le bâtiment visé reste avec le sol (plus d'autre bâtiment de la parcelle). La pose ne
  dépend plus de la position ni du cap de la photo. Les analyses déjà faites gardent leurs anciens
  rendus ; « Rejouer l'analyse » les redessine.

- **Analyse par Claude : ce que le rejeu d'AE 101 a montré** (`MD/spec-audit.md` §13.2). Quatre
  corrections, lues dans le fichier du rejeu (Haiku 5.5, 2 bâtiments, 6 requêtes, 0,011 $) :
  - **Une passe perdue** : la maison de huit murs a dépassé `max_tokens` (8 000) à la deuxième passe, et
    son vote s'est fait sur deux passes (28 % de la facture pour rien). Le plafond passe à 16 000 ;
    on ne paie que ce que le modèle écrit (`deploy/analyse.php`, `buildsg/analyseAdmin.mjs`).
  - **Un rendu du modèle cité sans avoir été reçu** : aucune des 66 images n'était un rendu, et Haiku
    écrivait « le rendu du modèle ne montre pas le colombage ». Le texte de la requête dit maintenant
    « Aucun rendu du modèle n'est joint » quand c'est le cas, et le prompt (version 3) interdit d'en
    citer un. Quand la prise de vue permettait d'en joindre un et que le dessin a échoué, un message
    le dit à la personne avant l'envoi.
  - **Trois murs « est » en une seule réponse** : les étiquettes des façades étaient l'orientation
    seule, et le vote regroupe par étiquette. Un bâtiment qui a plusieurs murs de même orientation les
    nomme avec le numéro de leur côté dans le polygone (« est (côté 3) », comme « Côté 3 » de
    l'inspecteur) ; les autres gardent leur nom simple. Photos, modèle JSON, mesures et renfort s'en
    servent.

- **Admin › « Audits » : l'avant et l'après d'un audit reçu** (`MD/spec-audit.md` 15.4). Le bouton
  « Avant / Après » de la carte d'un audit de parcelle ouvre, sur la Vue 3D du projet (même parcelle),
  l'écran des propositions de l'audit : les mêmes deux vues « Avant » et « Après », les mêmes lignes,
  avec la décision de l'audit sur chacune (validée, refusée, en attente), en lecture seule. C'est la
  base des décisions à venir. Un seul code : la consultation est une session d'audit à part, dont la
  validation est figée sur les propositions du fichier ; l'aperçu est celui de l'audit. Le projet et
  l'audit en cours ne sont pas touchés.
- **« Fermer » sur la prise et sur les propositions de l'audit** (`MD/spec-audit.md` §12.1). La liste
  était le seul endroit pour sortir de l'audit : le bouton est maintenant à droite du titre des deux
  écrans posés sur la Vue 3D.
- **Une façade choisie fixe la vue de prise** (audit de la parcelle, `MD/spec-audit.md` §12.1).
  Toucher une façade dans la Vue 3D, ou la prendre dans la liste, fige la position : la caméra se tient
  à distance fixe du bâtiment, qu'elle montre en entier, face à la façade choisie, et ne suit plus le
  GPS. Seule tourne la rotation sur l'axe vertical du bâtiment, pour voir défiler ses façades : avec
  vos pas autour de lui, ou au doigt quand il n'y a pas de GPS ou qu'il est trop imprécis (au-delà de
  12 m). Ni zoom, ni déplacement, ni inclinaison pendant les photos de cette façade. « Suivre ma
  position » ou « Ce n'est pas cette façade » rendent la vue.
- **Verrouiller un bâtiment pour la prise** (audit de la parcelle, `MD/spec-audit.md` §12.2). Quand la
  parcelle porte une annexe à côté de la maison, l'écran de prise propose un bouton par bâtiment
  (« Verrouiller : Maison, Annexe »). C'est un geste volontaire : verrouillé, seul ce bâtiment est
  reconnu devant vous et touché dans la Vue 3D, qui ne montre que lui. Toucher le bouton verrouillé
  rend la main ; choisir une façade d'un autre bâtiment dans la liste déplace le verrou. Il ne vaut que
  sur l'écran de prise, et tombe à la fermeture de l'audit.
- **L'avant et l'après des propositions d'un audit, en deux vues 3D** (`MD/spec-audit.md` §14 ;
  `three/comparaison3d.ts`). L'écran des propositions s'ouvre désormais sur « Les deux » : la Vue 3D
  montre côte à côte « Avant », le projet tel qu'il est, et « Après », avec les propositions cochées
  (l'une au-dessus de l'autre au téléphone), dans la part de l'écran que la liste laisse libre — la
  carte du bas au doigt, le panneau de droite sur un écran en largeur, et la caméra cadre la maison
  à la forme de l'une des vues. Les deux vues tournent, zooment et se déplacent ensemble :
  c'est la même caméra, rendue deux fois dans un seul contexte WebGL. Cocher ou décocher une ligne,
  ou l'arrivée des propositions de Claude, met « Après » à jour ; la clôture proposée s'y voit aussi.
  « Avant » et « Après » seuls restent proposés. Rien n'est écrit avant « Valider » ; à l'arrêt, la
  vue ne se redessine que quand la caméra bouge. Point de fumée 90.
- **Admin › « Audits » : l'outil du bureau après les audits** (`MD/spec-audit.md` 15.4 et 15.5).
  L'ancien « Audits de parcelle » regroupe, en deux sections, les audits de parcelle et les
  promenades des toits (que l'administrateur dépose par « Ajouter un fichier d'audit… »). Chaque carte
  dit sa conclusion (propositions de Claude et des mesures : validées, refusées, en attente ; cas par
  statut) ; « Détails » montre les photos, le tableau des propositions et leur décision, et pour un
  audit de parcelle ses analyses par Claude et leurs rejeux côte à côte (modèle, versions du prompt
  et du schéma, réussies, vides, ouvertures, pignons, lucarnes, écarts, déterminés, coût, durée ;
  export CSV). Une analyse s'ouvre en entier : ce qui est parti chez Claude (le texte du prompt
  envoyé, chaque requête, ses textes et ses images) et ce qu'il a rendu (la réponse brute, la sortie
  remise en forme, l'erreur, les tokens, le coût) ; export JSON. **« Rejouer l'analyse »** renvoie
  l'analyse d'un audit stocké avec le prompt et le schéma actuels et le modèle choisi, sur le projet
  ouvert de la même parcelle, sans refaire la visite : usage `rejeu`, sous les mêmes plafonds qu'une
  analyse, réservé à l'administrateur. Le serveur garde l'entrant et le sortant de chaque analyse et
  rejeu dans le dossier de l'audit ; le journal de Claude, lui, ne garde toujours ni photo ni réponse.
  Après « Valider », l'audit repart au serveur avec ses décisions.
- **La caméra et la présentation de la Vue 3D** (`MD/roadmap-realisme-3d.md`, R6 ;
  `three/presentation.ts`). À hauteur d'homme, la focale s'ouvre à 55°, celle d'un œil qui regarde
  devant lui ; elle revient en douceur aux 45° de la vue d'ensemble en prenant de la hauteur (la prise
  de vue de l'audit garde la sienne). Un groupe « Présentation » dans les réglages de la vue 3D :
  « Heure dorée » place le soleil cinquante minutes avant son coucher, au jour choisi ; « Promenade »
  enchaîne les points de vue enregistrés d'un mouvement doux, et un geste sur la vue l'arrête ;
  « Capture HD » télécharge la vue à trois fois la définition de l'écran, pour le client. Ni
  annulation, ni « projet modifié » ; aucun export touché.
- **Objets d'échelle dans la Vue 3D** (`MD/roadmap-realisme-3d.md`, R5 ; `three/objetsEchelle.ts`). Une
  case « Objets d'échelle » dans les réglages de la vue 3D (groupe « Scène »), décochée par défaut :
  une voiture garée côté rue (le bord de la parcelle qu'aucune voisine ne borde) et une silhouette de
  1,75 m dans la parcelle. Ils donnent la taille des choses d'un coup d'œil, et ne partent jamais dans
  le .glb. Le banc visuel les montre avec `BANC_ECHELLE=1`.
- **Les matériaux vivants** (`MD/roadmap-realisme-3d.md`, R3 ; `three/materiauxVivants.ts`,
  `three/vieillissement.ts`). Les textures dessinées des murs (brique, pierre, meulière, béton, enduit,
  bois) et des couvertures prennent du relief : une carte de normales tirée de leur dessin, joints en
  creux, tuiles qui se recouvrent, que la lumière rasante fait vivre. Les murs proches vieillissent :
  une coulure sous chaque appui, une salissure au-dessus du soubassement, deux descentes d'eau
  pluviale aux bouts du plus long mur. Hors qualité Économe, à l'écran seulement : le relief est retiré
  le temps d'un export, les voiles et les descentes ne partent pas dans le .glb (empreinte inchangée).
- **Les façades de près** (`MD/roadmap-realisme-3d.md`, R2 ; `three/fenetresRelief.ts`). Sur la
  parcelle du projet et ses abords (45 m), hors qualité Économe, les baies se creusent : encadrement en
  pierre claire saillant (tableaux et linteau), appui qui déborde, menuiserie et vitre au nu du mur ;
  petits bois selon l'époque (BD TOPO : deux vantaux à trois carreaux avant 1950, deux vantaux sans
  carreaux jusqu'en 1975). La porte d'entrée a deux panneaux en relief (et une imposte vitrée si elle
  est haute), la porte de garage ses lames. La maçonnerie suit l'époque : corniche sous l'égout avant
  1975, bandeaux d'étage avant 1950 (interrompus au droit des baies), chaînes d'angle en harpe avant
  1930. **Le .glb garde les baies à plat d'avant** : le relief et la maçonnerie sont propres à l'écran,
  l'empreinte `glb-structure.json` ne bouge pas (point 24).
- **La lumière de la Vue 3D** (`MD/roadmap-realisme-3d.md`, R1 ; `three/rendu.ts`). Une courbe de
  film (ACES) : les blancs ne brûlent plus, les ombres gardent du détail. Un ciel dégradé qui suit
  l'heure du soleil — bleu le jour, doré au couchant, nuit profonde — avec une lueur autour du soleil ;
  une brume légère qui fond le voisinage lointain dans l'horizon. En Normale et Soignée, le ciel éclaire
  aussi la scène (les faces tournées vers lui en prennent le bleu, et les vitres le refléteront) ; en
  Soignée, l'occlusion ambiante assombrit les coins et le pied des murs, de près. La carte d'ombre est
  resserrée sur la parcelle du projet : les ombres sont nettes au pied des murs. **Rien ne change dans
  les exports** : les couleurs des matériaux ne sont pas touchées (la courbe agit au rendu), le ciel
  reste hors du .glb, et l'empreinte `glb-structure.json` est identique (point 24 de la fumée).
- **Réglage « Qualité » de la Vue 3D** (`MD/roadmap-realisme-3d.md`, R0 ; `three/qualite.ts`). Dans
  les réglages de la vue 3D (groupe « Scène ») : Économe, Normale ou Soignée. C'est une préférence de
  l'appareil, rangée dans le navigateur et jamais dans le projet : Économe est proposée d'office sur un
  appareil tactile modeste (quatre cœurs ou 2 Go au plus), Normale ailleurs ; Soignée se demande.
  Normale est la Vue 3D d'avant, à l'identique. Économe coupe le lissage des arêtes et les ombres par
  défaut, et réduit la carte d'ombre ; Soignée suit la pleine définition de l'écran et affine les
  ombres. Choisir un niveau remet la case « Ombres » à ce qu'il propose.
- **Banc visuel de la Vue 3D** (`scripts/banc-visuel.mjs`, R0). Les mêmes vues d'AE 101 et de sa rue
  (aérienne, depuis la rue, depuis le jardin), à 390 et 1 440 px, en clair et en sombre, et le coût de
  la scène par niveau de qualité (construction, temps d'une image, triangles) ; références dans
  `tests/fixtures/visuel/`. Le réseau de l'IGN y est rejoué depuis des données témoin, comme pour la
  fumée.
- **Le modèle de chaque usage, choisi par l'administrateur** (`MD/spec-audit.md` §13.2 et §13.3,
  demande de l'utilisateur). Dans le tableau de bord de la consommation (`?admin&ecran=consommation`),
  l'onglet « Réglages » (l'ancien « Tarifs et plafonds ») commence par une section « Modèles » : une
  liste déroulante par usage (« Analyse des audits », « Renfort des façades », « Aide immédiate »,
  « Escalade », « Cas candidats »), qui ne propose que les modèles admis par le serveur, avec leur nom
  et leur prix d'entrée et de sortie au million de tokens. « Enregistrer les modèles » l'envoie au
  serveur (`GET|PUT admin/claude/modeles`, nouveau, dans `deploy/analyse.php` et
  `buildsg/analyseAdmin.mjs`) ; il le garde dans `claude/modeles.json`, version précédente en `.bak`,
  et refuse un modèle hors de sa liste. Le message rappelle que les analyses déjà lancées gardent leur
  modèle. Une demande qui nomme son modèle le garde, comme avant.
- **« Par modèle » dans le tableau de bord** : les modèles comparés sur la période et les filtres
  choisis. La part des réponses vides d'abord, en barres ; puis requêtes, batchs, appels immédiats,
  images, tokens, coût, coût par façade et échecs ; puis ce que les réponses contiennent
  (ouvertures, manquées signalées, en trop, pignons et croupes, lucarnes, éléments de toit, écarts au
  modèle, coins situés, attributs tranchés), en total ou par réponse lue. « Exporter en CSV » rend
  cette vue. Pour cela, le journal du serveur garde désormais, à chaque réponse qu'il relit, ces comptes
  (champ `trouve`, jamais la réponse elle-même) et l'identifiant du batch ; une ligne d'avant reste
  lisible, ses réponses sont dites « sans comptes » et laissées hors du calcul.

- **L'audit de parcelle sauvegardé sur le serveur pendant la capture, et catalogué par
  l'administrateur** (`MD/spec-audit.md` §15). Le brouillon de l'appareil se perdait avec le
  téléphone ; désormais, quand une session admin ou le jeton de la plateforme le permettent :
  - l'audit part sur le serveur de Plan **cinq secondes après la dernière photo rangée** (un envoi
    par rafale), à « Lancer l'analyse », et à la demande, par la commande « Envoyer l'audit au
    serveur » de la liste de contrôle, qui dit où il en est (« Envoyé à 17:42 », « En attente de
    réseau, nouvel essai à 17:45 », l'erreur en clair, ou la taille quand il dépasse les 48 Mo du
    serveur) ; hors ligne, il réessaie de plus en plus espacé, et dès que le réseau revient, sans
    jamais bloquer la capture ;
  - chaque envoi **remplace le même dépôt** (`PUT admin/audits/<id>`, nouveau, par son secret de
    retrait ou la session admin), gardé avec la capture comme celui du corpus ;
  - le dépôt est **marqué `sauvegarde`** (en-tête `X-Plan-Depot`) ; le partage « pour améliorer
    Plan » reste un dépôt `corpus` à part, cochable et retirable (décision D7). Le format du fichier
    ne change pas. Un utilisateur qui décoche le partage retire aussi sa sauvegarde, et sans son
    accord rien ne part de soi-même ; l'administrateur garde toujours la sienne. L'écran Conformité
    ignore les sauvegardes ;
  - **Admin › « Audits de parcelle »** (à côté de « Conformité », admin des démos) liste les audits
    reçus : date, parcelle, adresse, photos, phase (capture ou analyse), sauvegarde ou partage ; pour
    chacun, « Ouvrir dans ce projet » (même IDU ; reprend l'audit par le chemin de l'import, à la
    phase où il en était, en capture s'il n'était pas fini, avec la question de remplacement),
    « Télécharger » le fichier tel qu'il est arrivé, et « Retirer », confirmé sur la carte ;
  - l'import d'un fichier dont la capture n'était pas terminée le reprend sur la liste de contrôle ;
  - côté serveur (`deploy/analyse.php` et `buildsg/analyseAdmin.mjs`, même contrat) : la fiche d'un
    audit dit sa marque, ses photos, sa phase et le début de la visite ; si PHP a jeté le corps d'un
    audit, la réponse nomme `post_max_size` au lieu de « JSON illisible ». Sur un hébergement PHP,
    porter `memory_limit` à 256M (un audit de 40 Mo en demande environ 120) et `post_max_size` à 64M.

- **Les pignons d'une façade, dits par un fait de toit** (`MD/spec-regles-toits.md` §5.2) :
  `pignons: [{ facade: { azimutDeg }, position: "bouts", haut: "faitage" }]` tient un pignon
  traversant à chaque bout du pan de cette façade, jusqu'au point haut du faîtage, à la largeur
  donnée (`largeurM`) ou, sans elle, à celle que lit la mesure. Premier cas : **AE 101**, « deux
  pignons à gauche et à droite de la façade sud, de 3,7 m environ, qui montent au faîtage » (le
  propriétaire, 14 octobre 2026). La lecture LiDAR que sert l'IGN pour cette maison a changé
  l'après-midi même, et le calcul seul n'y trouvait plus que le pignon ouest : le toit sud était
  cassé. La référence d'AE 101 sous ses faits change (pignons de 3,7 m au faîtage, pan relu sans
  eux) ; le calcul seul ne change pas, ni aucun autre bâtiment. Les toits déjà lus seront relus à
  l'ouverture.

- **Un appentis adossé le long d'une façade, dit par un fait de toit** (`MD/spec-regles-toits.md`
  §5.1). Un porche, une galerie couverte, un auvent que le contour BD TOPO ne contient pas se
  décrivent dans `regles/toits/faits.json` : `appentis: [{ facade: { azimutDeg }, longueur: "toute" }]`,
  la façade nommée par sa normale (180 : la façade sud). Plan ajoute un pan d'appentis contre ce côté
  du bâtiment, sur toute sa longueur, et en lit la profondeur, la hauteur contre le mur et l'égout sur
  le LiDAR quand le fait ne les donne pas ; sans mesure ni cotes, il n'invente rien. Premier fait :
  **AE 101 (2 allée des Limites, Le Vésinet)**, la galerie de la façade sud que le propriétaire a vue
  le 14 octobre 2026 (1,25 m, 3,2 m contre le mur, égout 2,4 m). La référence d'AE 101 change une
  fois, par sa décision ; le calcul des toits lui-même ne change pas, ni aucun autre bâtiment. Les
  toits déjà lus seront relus à l'ouverture.

- **Roadmap du réalisme 3D, étape R5 bis : orthophoto haute résolution.**
  - Le point de départ : la BD ORTHO, prise à environ 20 cm par pixel et agrandie au zoom 20.
  - Les sources plus fines : orthophoto haute résolution de l'IGN, PCRS image des collectivités.
  - Ce qui serait fait, et huit questions de pertinence à trancher avant de décider (O1 à O8) :
    couverture, gain visible, date, calage, coût, apport aux lectures automatiques, licence,
    exports.
  - Une nouvelle décision, V7.

- **Roadmap du réalisme de la Vue 3D** (`MD/roadmap-realisme-3d.md`), en sept étapes de R0 à R6 :
  - R0 : banc visuel et réglage Qualité ;
  - R1 : lumière (tone mapping, ciel, ombres, occlusion, brume) ;
  - R2 : fenêtres en creux et maçonnerie ;
  - R3 : matériaux vivants ;
  - R4 : photos de l'audit en texture sur la parcelle ;
  - R5 : abords ;
  - R6 : caméra et présentation.

  Les règles du chantier : rien ne change dans les exports, poids et fluidité sous contrôle. Les
  décisions V1 à V6 sont prises avec leur défaut.

- **Les cas candidats Panoramax** (lot G3 bis de la vague 3, `MD/plan-vague-3-generaliser.md`,
  `MD/spec-regles-toits.md` §13.3 phase 4 et §14.5, usage 3 de Claude analyste). Un script du skill
  `regles-toits` (`scripts/candidats.ts`) parcourt les photos de rue Panoramax d'un village relevé
  par `village.mjs` : pour chaque bâtiment, les photos qui voient son toit (même choix que la couleur
  des murs, avec du recul et le faîte dans le cadre), trois passes de Claude par les routes de
  l'analyse et leur vote, puis les bâtiments qui ont probablement une forme que Plan ne sait pas
  encore faire (Mansart, gambrel, demi-croupes, lucarnes…). Ils entrent au corpus
  (`tests/fixtures/toits/candidats/<village>.json`) au statut « proposé », avec la forme visée dans
  le vocabulaire du modèle de toit, le vote et les photos qui en sont la preuve, à trier sur images ;
  un candidat trié n'est plus jamais réécrit. Rien ne s'applique au calcul : AE 101, le banc des
  villages et les empreintes n'ont pas bougé. `--essai` liste sans appeler Claude ce qui serait
  envoyé. `village.mjs` écrit désormais l'origine du repère du plan dans le fichier du village.
- **Un usage « Cas candidats » pour l'analyse par Claude** (`deploy/analyse.php`,
  `buildsg/analyseAdmin.mjs`) : mêmes plafonds, même prompt et même schéma que l'analyse d'une
  maison, mais une ligne de journal à part ; l'écran « Consommation » en montre le coût dans la
  répartition par usage.

- **Le modèle de toit étendu** (lot G1 de la vague 3, `MD/plan-vague-3-generaliser.md`,
  `MD/spec-regles-toits.md` §4). Un corps de toit peut porter, tous facultatifs, son **profil** en
  travers (droit, brisé, à coyau, courbe), ce qui ferme ses **bouts** (pignon, croupe, demi-croupe,
  brisis, redents), ses **lucarnes** et ses **bords** observés (débord, saillie de rive, coyau, queue
  de vache). Ils se relisent vérifiés (un champ mal formé est retiré, le corps reste) et ne
  s'écrivent que s'ils disent autre chose que leur absence (`model/corpsToitEtendu.ts`). La forme
  d'ensemble d'un toit gagne les formes du catalogue (demi-croupes, pavillon, Mansart, gambrel,
  asymétrique, deux pans décalés, en M, papillon, coyau, shed, berceau, carène, conique, polygonal,
  flèche, dôme, impériale), **déduite des corps** par `model/formeToit.ts` et écrite dans le même
  vocabulaire que « Ce que je vois ». Aucun calcul ne les produit encore et la 3D dessine à leur
  place la forme simple la plus proche ; les menus de l'inspecteur et du relevé ne proposent que les
  formes simples. Un fichier ancien se relit et se réécrit à l'identique ; AE 101, le banc des
  villages et les empreintes n'ont pas bougé.

- **Le moteur des profils de toits** (lot G15 de `MD/plan-vague-3-generaliser.md`,
  `MD/spec-regles-toits.md` §6 et §9.1). Un profil de `regles/toits/reglages.json` change quelques
  seuils de la lecture des toits pour les bâtiments qui remplissent toutes ses conditions.
  - **Un vocabulaire fermé** (`model/profilsToits.ts`) : département (tiré du code INSEE ou de l'IDU
    de la parcelle du projet), latitude, matériau des murs ou de la toiture (fichiers fonciers),
    hauteur, surface, mitoyenneté (part du contour collée à un autre bâtiment : aucune, partielle,
    forte), forme du contour (rectangle, composée, trapèze, biais), époque. Jamais une adresse ni un
    bâtiment : une condition hors du vocabulaire, un seuil inconnu, un profil sans condition ou qui
    ne cite pas deux cas font refuser le fichier.
  - **Le plus précis l'emporte**, seuil par seuil (le plus de conditions) ; deux profils de même
    précision sur le même seuil, qui peuvent toucher le même bâtiment, font refuser le fichier, et
    la CI le dit (`tests/unit/model/reglagesToits.test.ts`).
  - **Appliqué partout où un toit se lit** (`facade/profilsToits.ts`) : à l'import et en tâche de
    fond (`app/toitsLidar.ts`, recalage compris), à la réponse « un toit par parcelle », au rejeu
    des cas d'audit et au banc des villages (`banc.ts --profils <fichier>` essaie des profils avant
    de les écrire). Les modules de la lecture lisent leurs seuils à chaque appel
    (`SEUILS_TOITS`), plus une copie prise au chargement : un test le vérifie.
  - **Le fichier livré ne contient aucun profil** : AE 101, le banc des cinq villages (corps au bit
    près) et les empreintes golden sont identiques, l'empreinte des réglages et la version de
    lecture des toits (1) aussi ; rien n'est relu. L'empreinte des profils (conditions, surcharges,
    bornes du vocabulaire) entre dans `VERSION_LECTURE_TOITS` dès le premier profil.

- **Profils de façades** (lot G12 de la vague 3, `MD/spec-facades-calage-detection.md` §15.2,
  décisions D18 et D19). Les dimensions et les seuils de la disposition automatique des ouvertures
  (fenêtre de 1,00 × 1,20 m à 0,90 m d'appui, porte de 0,90 × 2,10 m, entraxe de 2,40 m, au plus
  8 fenêtres par niveau, niveaux de 2,7 m, rien sous 2,2 m de niveau ni sur un mur de moins de 2 m,
  fenêtre de pignon à partir de 1,8 m) sortent du code dans `regles/facades/reglages.json`, compilé
  dans le fichier livré comme les réglages des toits. Ils forment le **profil par défaut**, seul
  profil livré : rien ne change dans la 3D, l'export GLB ni les empreintes. Un profil se déclenche
  sur un vocabulaire fermé (département tiré de l'IDU, époque `date_d_apparition`, usage
  `usage_1`, nombre d'étages, mitoyenneté) ; le plus précis l'emporte, deux profils de même
  précision qui peuvent tomber sur le même bâtiment font refuser le fichier
  (`model/reglagesFacades.ts`, `facade/profilsFacades.ts`). Le profil retenu se range sur le
  bâtiment avec la version de lecture (`VERSION_LECTURE_FACADES`, où entre l'empreinte du fichier) :
  un profil ajouté ou changé fait rechoisir les profils en tâche de fond
  (`app/profilsFacadesFond.ts`), jamais sur la parcelle du projet ni sur un bâtiment vérifié sur
  place. Les dimensions réglées par l'utilisateur (inspecteur, apparence du voisinage) l'emportent
  sur le profil.
- **Mesurer une façade relevée** (lot G11 de la vague 3, `MD/spec-facades-calage-detection.md`
  §15.1). `model/mesureFacade.ts` lit un relevé (ouvertures, grille, largeur, hauteur) et en tire la
  largeur, la hauteur et l'appui des fenêtres (médianes, l'appui depuis le plancher de leur niveau),
  l'entraxe, la part vitrée, les baies par niveau, la hauteur d'un niveau, la place de la porte, le
  garage, et le type de la façade (sur rue, arrière, pignon, côté voisin) quand le contexte le dit
  (`facade/contexteFacade.ts` : toit du cas figé, voisins, photo de rue). Le script
  `.claude/skills/facades/scripts/mesures.ts` les donne sur le banc de façades (vérité → relevé :
  1 cm d'écart médian sur les fenêtres) et sur les audits de parcelle ; le rejeu des audits du skill
  `toits` mesure aussi les façades d'un fichier `plan-audit-parcelle`. Rien de ce que Plan calcule ne
  change : ces mesures préparent les profils de façades (G12) et le taux de conformité (G13).

- **Le banc des formes de toit** (lot G2 de `MD/plan-vague-3-generaliser.md`, `MD/spec-regles-toits.md`
  §8.2, décision D16). Outil de développement : rien ne change dans ce que Plan calcule.
  - `banc.ts` (skill `toits`) compte, par village, les formes produites (catalogue §3.1 : plat,
    appentis, deux pans, croupes, pavillon…), par bâtiment (la forme de son corps principal) et par
    corps. La forme se déduit des corps par `model/formeToit.ts` dès que le lot G1 est là, sinon par
    sa copie locale (`tests/banc/toits/formes.ts`), vérifiée identique sur les 646 corps des cinq
    villages et par un test qui s'active avec G1.
  - `--enregistrer` écrit une référence (formes de chaque bâtiment, compteurs) ; `--reference` liste
    ensuite les compteurs qui ont bougé, les bâtiments dont la forme change (« appentis ->
    deux-pans »), ceux dont seul un corps change, et dessine la planche de leurs cartes
    (`rendu.py --montage`, la forme écrite dans la légende). Les lignes d'avant restent les mêmes,
    pour comparer les listes d'hier par `diff`.
  - Les villages de D16 : `villages.json` (Versailles quartier Notre-Dame, Eguisheim, Beuvron-en-Auge ;
    Riquewihr et Lyons-la-Forêt en réserve) et `couverture.ts`, qui géocode chaque adresse, vérifie
    la couverture LiDAR HD par `dallesLidarSur` et écrit la commande `village.mjs` qui le capture.
    Les cinq sont couverts ; les trois retenus ont été capturés et mesurés (98, 327 et 119
    bâtiments). Le tableau du skill `toits` (§5) gagne Le Vésinet, ces trois villages et les
    colonnes des formes.

- **Les indicateurs de conformité et l'écran Admin › « Conformité »** (lot G3 du plan de la vague 3,
  `MD/spec-regles-toits.md` §13.5, `MD/spec-facades-calage-detection.md` §15.3).
  - **Le jugement d'un cas** (`model/conformite.ts`, `facade/conformite.ts`) : un cas observé est
    conforme quand le calcul d'aujourd'hui satisfait ce que vous avez vu — son attendu validé (corps
    au centimètre, couleur et source des murs, comme le test du corpus) et « Ce que je vois » (forme,
    bouts, lucarnes, cheminées, toit-terrasse ; le sens du faîtage, dit par rapport à la rue, et les
    matériaux sont notés mais ne se comparent pas au calcul). Une forme que Plan ne calcule pas
    encore (Mansart, gambrel, demi-croupe…), des lucarnes ou des cheminées vues comptent « hors
    calcul ». Un cas qui ne note que des problèmes est non conforme tant que le rejeu redonne ce que
    le terrain a donné, « à revoir » si le calcul a changé depuis. Les taux se lisent par forme, par
    région (le département tiré de l'IDU, `model/departements.ts`) et par problème.
  - **Le corpus du dépôt** est rejoué par `npx tsx .claude/skills/toits/scripts/conformite.ts`
    (`--ecrire` réécrit `regles/conformite.json`, qu'un test garde à jour : une PR qui change le taux
    le montre dans son diff). **Taux de départ sur les deux promenades de démonstration : 50 %** (AE
    101 conforme ; le pavillon de la longère d'Hucqueliers, toujours découpé en morceaux, non).
  - **L'écran** (`?admin&ecran=conformite`, menu Admin › Conformité, à côté de la consommation de
    Claude) : le corpus et les audits de parcelle partagés reçus sur le serveur, rejoués dans la page
    un à un ; le taux, le critère de la phase 1 (50 cas observés, dont 10 hors calcul) ; six
    onglets : par forme, par région, par problème, les cas un à un avec ce qui ne tient pas, l'accord
    de Claude par attribut et l'historique. Le taux de conformité des façades (lot G13) et l'accord
    de Claude (lot G18) ont leur place, marquée « À venir ». Un audit illisible est nommé sans
    arrêter les autres.
  - **Les mesures sur le serveur de Plan** : « Enregistrer la mesure » range ce que l'écran montre
    (`POST admin/conformite`, `deploy/analyse.php` et `buildsg/analyseAdmin.mjs`, même contrat,
    administrateur seul), dans `conformite/mesures.json` avec les données de l'admin ; le serveur
    garde les 200 dernières. Aucune valeur calculée ne change : AE 101, le banc et les empreintes
    golden sont identiques.

- **Les détails des ouvertures, en 3D et au banc des façades** (lot G17 du plan de la vague 3,
  `MD/plan-vague-3-generaliser.md` ; `MD/spec-facades-calage-detection.md` §11 ; suite du lot L15).
  - **En 3D** (`three/detailsOuvertures.ts`) : ce que le relevé a reconnu sur une ouverture se
    dessine sur son mur. Volets battants : deux vantaux d'une demi-baie, ouverts contre le mur de
    part et d'autre du cadre, ou fermés devant la vitre ; persiennes : les mêmes, à lames
    inclinées ; volet roulant : le coffre au-dessus du linteau, et le tablier baissé s'il est
    fermé ; balcon : une dalle au niveau de l'appui qui déborde des tableaux, et son garde-corps
    sur trois côtés ; garde-corps seul : devant la baie, à hauteur d'appui ; baie cintrée (plein
    cintre, ou arc surbaissé sur une baie basse) et œil-de-bœuf : le cadre et la vitre suivent
    leur contour, sur le mur photographié comme sur la disposition réglée une par une. Les cotes
    des détails sont les proportions courantes, pas des mesures. **Une ouverture sans détails se
    dessine exactement comme avant** : la démonstration garde son GLB au nœud près (point 24).
  - **Au banc** (skill `facades`) : une section « Détails des ouvertures » compte, pour les
    volets, l'allège et la forme, les détails lus justes, manqués et lus à tort, sur l'élévation,
    la chaîne du relevé et la fusion. La vérité vient de la scène (`detailsVrais` : son rendu, ses
    balcons, la forme de ses baies) ; le générateur peint maintenant les baies cintrées et rondes,
    les persiennes ouvertes et fermées, et le garde-corps sans dalle. Une scène de plus,
    `20-details-cintres-persiennes-garde-corps`. Chaîne du relevé, sur les 21 scènes : volets
    11/16 (aucun volet roulant ton sur ton lu, scène 06), allège 1/3, forme 2/2.
  - **La baie devinée en pointillé se joue au navigateur** (point de fumée 68) : les deux photos de
    synthèse de la scène 19 du banc (une haie haute qui cache une fenêtre sur les deux vues),
    rendues en PNG par `.claude/skills/facades/scripts/photos.ts`, importées dans le relevé. Points
    80 et 81 : les détails de la scène 20 dans la fiche des ouvertures, puis en 3D.

- **Le masque d'occlusion hachuré dans l'élévation du relevé** (lot G20 de
  `MD/plan-vague-3-generaliser.md`, partie sans corpus ; `MD/spec-facades-calage-detection.md` §8 et
  §12 bis). Quand plusieurs vues d'un même mur sont fondues (« Vues du mur entier »), ce qui reste
  caché sur toutes les photos (une voiture, une haie) se hachure à l'étape « Vérifier », sous les
  ouvertures, qui restent à saisir, avec une légende courte (« Hachuré : caché sur toutes les photos
  par ce qui est devant le mur (voiture, haie…), 17 % du mur. »). Les couleurs passent par les jetons
  du relevé (`--camera-bg`, `--camera-alerte`), le motif porte l'information avec les mots
  (`zones/releve/masque.ts`, `Elevation.tsx`).
  - **« Demander de l'aide » est proposé aussi sur plusieurs vues** : jusqu'ici, il ne l'était que
    sur une photo seule. Claude reçoit la vue de référence de la fusion (la mieux définie) et
    l'élévation fondue, le masque hachuré dessus (le prompt du renfort dit déjà de ne rien inventer
    dans une zone hachurée). L'aide est proposée dès qu'un signal est levé, et dès que le masque
    couvre un dixième du mur (`MASQUE_NOTABLE`, `zones/releve/aide.ts`) : la note le dit telle
    quelle (« 17 % du mur caché sur toutes les photos »). Rien ne change pour l'audit, ni pour des
    morceaux côte à côte. `RENFORT_A_CHAQUE_FACADE` et les taux d'accord, qui attendent le corpus,
    ne bougent pas.
  - L'avis « La photo couvrait … % du mur ; le reste est complété à la teinte du mur » ne compte plus
    le masque d'une fusion, que la texture montre tel quel (« Les photos couvraient … »).
  - L'élévation de la vérification ne se tasse plus au téléphone : dans la colonne du relevé, qui
    défile, elle était écrasée à quelques dizaines de pixels sous les cartes de la hauteur et du toit.
  - Aucune valeur calculée ne change : banc des façades identique. Point de fumée 82.

- **Le fichier de l'audit de parcelle, son import et son partage pour le corpus** (lot L21 du plan
  de mise en œuvre, `MD/spec-audit.md` §15, décision D7).
  - **Le fichier** `plan-audit-parcelle` version 1 (`model/fichierAuditParcelle.ts`) : la parcelle
    (IDU, adresse, origine), les versions du code et des règles, pour chaque bâtiment un cas figé
    (contour, BD TOPO, voisins, grille LiDAR relue à l'écriture, sorties du jour), « Ce que je
    vois », et pour chaque façade ses photos avec leur prise de vue, ses mesures (relevé avec son
    calage, couleur, hauteur) ; la clôture et le portail ; chaque proposition avec ses indices et sa
    décision, validée ou refusée. Il recopie sans recalculer : relu, il redonne le même audit.
    L'administrateur le partage ou le télécharge depuis l'écran des propositions (« Fichier de
    l'audit »).
  - **Fichier › Importer un audit de parcelle…** reprend un fichier de la même parcelle à l'étape des
    propositions : un fichier d'une autre parcelle est refusé et le dit ; les bâtiments d'un autre
    projet de la même parcelle sont retrouvés par leur identifiant BD TOPO ; les mesures du fichier
    tiennent lieu de calcul ; les cases suivent ses décisions, sans jamais cocher une ligne qui
    remplacerait un choix fait à la main ; un audit en cours sur l'appareil n'est remplacé qu'après
    confirmation. Rien n'entre dans le projet avant « Valider », que Ctrl+Z défait en un pas.
  - **« Partager cet audit pour améliorer Plan »**, sur l'écran des propositions : **cochée par
    défaut** (décision de l'utilisateur du 13 octobre), révocable. À chaque validation, le fichier,
    photos comprises, part sur le serveur de Plan et remplace le précédent ; décocher le retire. La
    case n'est montrée qu'avec une session admin ou un jeton de la plateforme : sans eux, rien ne
    quitte l'appareil.
  - **Le serveur** : `admin/audits` dans `deploy/analyse.php` et `buildsg/analyseAdmin.mjs` (même
    contrat), par la session admin ou le jeton de la plateforme vérifié auprès d'elle
    (`plateformeUrl` de la configuration, `BACKPROD_API_URL` sous Node). Les audits se rangent tels
    qu'ils sont arrivés dans `audits/` du dossier des données de l'admin ; l'envoi rend un secret de
    retrait dont le serveur ne garde que l'empreinte ; la liste et la lecture sont à
    l'administrateur. `.htaccess` passe l'en-tête `Authorization` à PHP.
  - Une validation garde les propositions telles qu'elles étaient : une fois écrites, elles ne se
    proposent plus, et le fichier doit les redire. Points de fumée 74 et 75.

- **Plan de la vague 3, « Généraliser »** (`MD/plan-vague-3-generaliser.md`) : les formes de toit
  nouvelles (lucarnes, Mansart et gambrel, demi-croupe, cheminées lues sur le LiDAR, asymétrique),
  les profils de façades du voisinage, les profils de toits régionaux et les suites des lots L15,
  L17 et L18, découpés en lots G1 à G20 ; ce qui peut avancer sans audits réels (vague 3a) et ce qui
  les attend (vagues 3b et 3c) ; décisions D15 à D23 avec leur défaut.

- **Claude en renfort du calage et de la détection des façades** (lot L18 du plan de mise en œuvre,
  `MD/spec-facades-calage-detection.md` §12 bis). Claude aide quand l'algorithme n'est pas sûr de
  lui, jamais à sa place : il propose, Plan recale et mesure, vous validez.
  - **Signaux** (`facade/renfort.ts`) : coins non trouvés (note du calage fin sous 0,5, ou plus d'un
    coin prédit), façade cachée à plus de 30 %, détection peu sûre (moins de 70 % des ouvertures à
    0,7 de confiance, ou une baie devinée en pointillé), ton sur ton (mur de plus de 4 m sans
    ouverture, ou confiance médiane sous 0,55), désaccord avec le nombre attendu, volets fermés.
  - **Ce que Claude reçoit** (`render/imagesRenfort.ts`) : la photo réduite avec une grille de repères
    numérotée de 0 à 10 et le quadrilatère du mur (plein si les coins ont été trouvés, en tirets
    sinon), l'élévation graduée en mètres avec les ouvertures détectées numérotées, et ce que Plan
    sait du mur. **Ce qu'il rend** : un nouveau schéma versionné (`deploy/schema-renfort.json`,
    `deploy/prompt-renfort.md`, version 1) — coins en repères de la grille, avis sur chaque
    ouverture (garder, retirer et pourquoi, type, volets, coffre, balcon, forme), ouvertures
    manquées en boîtes en mètres, `indetermine` partout. Trois passes et un vote.
  - **Des graines, jamais des cotes** (`facade/renfortRecalage.ts`) : un coin proposé est rattaché au
    croisement de deux longs segments de la photo (au plus un demi-repère de la graine, chaque
    segment à moins de 30 cm du croisement) ; une boîte est ajustée sur les profils de contours de
    l'élévation (chaque bord à moins de 30 cm), puis régularisée par la structure. Soutenue sur au
    moins trois côtés, elle est proposée cochée ; sur un ou deux, en pointillé ; sur aucun, rejetée.
    Claude ne retire qu'une baie déjà peu sûre (elle reste proposée, décochée), ne touche jamais à ce
    que le doigt a posé, et confirme une baie devinée du même type au même endroit. Origine marquée :
    `source: 'claude'` (puis `corrigee` si vous la retouchez), coins « proposé par Claude, recalé sur
    la photo ».
  - **Dans le relevé** : un bouton « Demander de l'aide » à l'étape des coins et à la vérification,
    proposé seulement quand un signal est levé et que le serveur de l'analyse est joignable ; appel
    immédiat, trois passes au tarif normal ; le premier appel demande l'accord d'envoyer la photo
    pour ce projet (le même que celui de l'audit, « partager » coché par défaut). Seuls les coins
    prédits sont remplacés ; les ajouts de Claude entrent dans la proposition, pour que les
    corrections tracées à la validation restent les vôtres.
  - **Dans l'audit de la parcelle** : pendant les premiers audits, chaque façade relevée par les
    mesures reçoit le renfort, signal ou non, pour mesurer son apport (décision D11) : trois
    requêtes par façade dans le batch de l'analyse, sans délai de plus, et seulement dans la place
    que l'analyse des maisons laisse (60 requêtes par batch). À la lecture des résultats, les
    graines sont recalées sur l'élévation (texture du relevé) ; le relevé renforcé est proposé,
    décoché tant que le taux d'accord de Claude sur les façades n'est pas mesuré.
  - **Serveur** (`deploy/analyse.php`, `buildsg/analyseAdmin.mjs`, mêmes routes) : une requête peut
    porter son usage (`renfort`) dans un batch, avec son prompt, son schéma et son modèle ; le journal
    l'inscrit sous son usage ; nouvelle route `POST admin/claude/messages`, l'appel immédiat (trois
    requêtes au plus, en parallèle, mêmes plafonds, coût sans la remise Batch, une ligne de journal
    par requête) ; `etat` dit les versions du renfort.
  - **Banc** (skill `facades`) : l'algorithme seul, puis avec des réponses de Claude **simulées**
    (`tests/fixtures/facades/claude/`, écrites par `simuler-claude.ts` : erreurs typiques imitées de
    façon déterministe, en attendant les vraies réponses des audits). Sur les 20 scènes : rappel
    89 % → 96 %, précision 93 % → 96 %, corrections 1,8 → 1,4 par façade ; 7 boîtes ajoutées cochées,
    toutes vraies, la fenêtre inventée par deux passes sur trois rejetée faute d'arête ; graines de
    coins à 27 cm (médiane) recalées à 0,3 cm (64 sur 80 rattachées). La détection et le calage de
    l'algorithme ne changent pas : leur tableau est identique.

- **Relevé de façade : la structure et le classement des ouvertures** (lot L15 du plan de mise en
  œuvre, `MD/spec-facades-calage-detection.md` §10 à §13).
  - **Niveaux et travées** (`facade/structure.ts`) : les ouvertures se rangent en rangées (appui et
    linteau de leurs fenêtres) et en travées (centres à 10 cm près) ; la façade est dite symétrique,
    les hauteurs d'étage contrôlées (2,5 à 3,2 m). Une baie à 5 cm de la médiane de sa travée
    (largeur) ou de son niveau (hauteur), à type égal, en prend la valeur, sans jamais bouger un bord
    de plus de 10 cm de sa mesure.
  - **Complétion devinée** : un croisement de la grille sans baie, caché sur toutes les vues ou peu
    sûr, reçoit une baie devinée, jamais dans un mur vu et net. Sûre, elle est proposée cochée, en
    pointillé ; peu sûre, elle reste en pointillé et décochée : une touche la garde, la case
    « Garder cette baie devinée » la rend au pointillé.
  - **Détails des ouvertures** (`facade/classement.ts`, `OuvertureFacade.details`) : volets battants
    fusionnés dans la baie, coffre de volet roulant retiré de sa hauteur, persiennes fermées, balcon
    ou garde-corps (une haute baie d'étage au-dessus d'un balcon est une porte-fenêtre), grande baie
    au sol vitrée (porte-fenêtre, pas garage), haut cintré ou œil-de-bœuf. Chaque lecture est
    prudente : sur une brique, une pierre, un bandeau qui court sur la façade ou une haie, elle ne
    dit rien. Les seuils sont des réglages nommés (`facades.structure.*`, `facades.classement.*`).
  - **Confiance et source** de chaque ouverture (`detectee`, `devinee`, `ajoutee`, `corrigee`) :
    pleine à 0,7 et plus, en pointillé en dessous ; retouchée au doigt, elle est vérifiée et redevient
    pleine. La fiche de l'ouverture dit d'où elle vient et ce qui a été reconnu.
  - **Gestes en une touche** : « Même taille pour la travée », « Même hauteur pour le niveau »
    (grisés, avec leur raison, quand il n'y a rien à égaliser), « Ajouter dans la grille » (la baie
    au croisement libre le plus proche, à la taille de sa travée et de son niveau).
  - **Ce qui est enregistré** : la grille recalculée sur les ouvertures retenues
    (`ReleveFacade.grille`), la rangée et la travée de chaque ouverture, et les corrections tracées
    par rapport à la proposition de l'analyse (`ReleveFacade.corrections` : ajout, retrait,
    déplacement avec l'écart, changement de type) ; c'est ce qui mesurera le détecteur sur les
    audits. Champs facultatifs : un relevé d'avant garde exactement son sens. L'audit de la parcelle
    garde lui aussi confiance, source et détails des ouvertures qu'il propose.
  - **Banc** : une scène de plus (`19-vues-haie-haute-baie-cachee`, une baie cachée sur les deux
    vues). Avant / après sur le corpus de 20 scènes, chaîne du relevé : précision 93 % et rappel
    89 % inchangés, erreur médiane des cotes 1 cm, types justes 100/102 → 102/102, corrections par
    façade 2 → 1,8 ; fusion de plusieurs vues : rappel 96 % → 100 %, corrections 0,5 → 0,3 par
    façade. Aucune scène ne perd. Point de fumée 67.

- **Audit de la parcelle, phases 2 et 3 sans Claude : propositions et validation** (lot L11 du
  plan de mise en œuvre, `MD/spec-audit.md` §13.1 et §14). « Lancer l'analyse » ouvre maintenant les
  propositions, posées sur la Vue 3D ; une capture terminée y revient par « Voir les propositions ».
  - **Les mesures du téléphone** (`app/audit/parcelle/mesures.ts`), sans serveur : pour chaque
    façade photographiée, le relevé (coins prédits par la prise de vue puis cherchés sur la photo,
    lots L6 à L8 ; redressement, ouvertures, texture), la hauteur à l'égout mesurée quand les coins
    ont été trouvés, la couleur du mur lue sur les photos prises à la boussole (lot L3).
  - **Les propositions** (`model/propositions.ts`, `app/audit/parcelle/propositions.ts`) : le relevé
    de chaque façade, la hauteur à l'égout (médiane des façades mesurées), la couleur des murs lue
    sur vos photos, le matériau des murs et de la couverture vus, les cheminées vues (posées dans le
    plus grand corps en pente, au faîtage, à mi-pan, dans le pignon ou adossées, 40 cm au-dessus du
    faîtage) et la toiture-terrasse vue (sur le plus grand corps plat, édicules compris), la clôture
    côté rue et le portail. Chacune dit son avant, son après et son origine ; la structure porte
    déjà la source (`mesure` ou `claude`), les indices et la confiance pour les propositions de
    Claude (lot L17).
  - **Cases à cocher** : une valeur choisie à la main (source des murs, couverture, relevé déjà fait,
    côté de clôture réglé, portail à une autre largeur, hauteur saisie) n'est jamais remplacée en
    silence : sa ligne arrive décochée et dit « Remplace votre choix : … ». Un relevé dont les coins
    n'ont pas été trouvés arrive décoché, comme une proposition de faible confiance.
  - **Avant / Après** : la Vue 3D montre les bâtiments avec les propositions cochées, sur des copies
    (`three/scene.ts::remplacerObjets3d` accepte d'autres objets que ceux du plan) ; le projet n'est
    pas touché tant qu'on ne valide pas, ni par l'aperçu, ni par l'enregistrement.
  - **Valider** écrit tout ce qui est coché en un seul pas d'historique : Ctrl+Z le défait, le projet
    est marqué modifié. La décision (acceptées, refusées) est gardée avec la capture pour le
    fichier de l'audit (lot L21).
  - **Vérifié sur place** : un bâtiment dont toutes les façades ont été photographiées (ou sont
    mitoyennes ou inaccessibles), dont le toit a été vu et dont toutes les propositions sont cochées
    est marqué `verifieSurPlace` avec la date ; l'inspecteur le dit (Apparence). Champ facultatif :
    un projet sans audit garde sa forme d'avant.
  - **Couleur des murs** : `couleurMurs.terrain` (la couleur lue sur vos photos, validée) passe avant
    la photo de rue, et `couleurMurs.materiau` (le matériau vu sur place) avant celui des fichiers
    fonciers ; une relecture Panoramax ne les touche pas. Les toits ne changent pas : AE 101 et les
    empreintes sont identiques. Points de fumée 62 et 63.

- **Analyse de l'audit de la parcelle par Claude** (lot L17 du plan de mise en œuvre,
  `MD/spec-audit.md` §13.2, `MD/spec-regles-toits.md` §14 ; décisions D1, D2 et D7).
  - **L'accord** : à la fin de la capture, l'écran des propositions demande l'accord d'envoyer les
    photos (« Envoyer mes photos à l'analyse » ou « Seulement les mesures »), avec la case « Partager
    cet audit pour améliorer Plan », cochée par défaut (lue par le fichier de l'audit, lot L21).
    L'accord vaut pour le projet, est gardé sur l'appareil (pas dans le projet, qui ne devient pas
    « modifié »), est rappelé par un toast à chaque envoi et se retire par « Retirer l'accord » : plus
    rien ne part, et les propositions de Claude disparaissent. Sans accord, sans réseau ou sans compte
    de la plateforme, seules les mesures deviennent des propositions, et l'écran le dit.
  - **Les entrées préparées** (`app/audit/parcelle/entreesAnalyse.ts`) : par bâtiment photographié,
    chaque photo réduite à 1 024 px avec sa prise de vue (« prise à 8 m, vers 245° »), le rendu du
    modèle depuis la même prise de vue (Vue 3D hors écran, `three/renduPrise.ts`), les photos du toit,
    l'orthophoto recadrée sur le contour et la carte des hauteurs LiDAR (`render/imagesAnalyse.ts`),
    puis les indices LiDAR chiffrés (montée, bande raide aux bords, sommets, creux, corps), le modèle
    actuel en JSON compact, les mesures du téléphone et « Ce que je vois ».
  - **Trois passes et un vote** (`model/analyseClaude.ts`) : trois requêtes identiques par bâtiment,
    envoyées par les routes batches de `analyse.php` ; le vote retient, attribut par attribut, la
    valeur donnée par plus de la moitié des passes, sinon `indetermine`, et le contrôle croisé
    confronte la réponse aux indices LiDAR (toit plat qui monte, Mansart sans bande raide…).
  - **Les propositions de Claude** (`app/audit/parcelle/propositionsClaude.ts`), source `claude`,
    ajoutées à la liste après celles des mesures : couverture, cheminées, toiture-terrasse et matériau
    des murs (le parement lu sur les façades), chacune avec ses indices (quelle image, ce qu'il y a
    vu) et la part des passes d'accord. Tant que le taux d'accord de Claude n'est pas mesuré à 95 %
    sur un attribut (corpus, lots L19 à L21), elles arrivent décochées et le disent ; une
    contradiction avec le LiDAR aussi. Le schéma de sortie, version 1, couvre aussi les façades
    (ouvertures manquées ou en trop, volets, coffre, balcon, forme, matériau) ; ses écarts restent
    des indices. Une proposition de Claude laissée décochée alors qu'une autre, cochée, écrit le
    même attribut (l'ardoise notée sur place contre le zinc vu par Claude) a été tranchée : elle ne
    retient pas le bâtiment hors du « vérifié sur place ».
  - **Le suivi** : le batch est relu toutes les vingt secondes, et survit à un rechargement (il vit
    dans le brouillon de la capture) ; un toast, et une notification du navigateur quand l'onglet est
    en arrière-plan, disent quand les propositions sont prêtes. Des photos changées depuis l'envoi
    font proposer « Relancer l'analyse ».
  - **Côté serveur** (`deploy/analyse.php`, `buildsg/analyseAdmin.mjs`) : ouvert aux utilisateurs
    de la plateforme par leur jeton, vérifié auprès d'elle (`/api/v1/me/context`, droit d'écrire les
    projets) ; l'organisation de la plateforme est celle des plafonds et du journal, et ne lit que ses
    batches ; tarifs, plafonds et consommation restent à l'administrateur. Le journal compte les
    façades de chaque requête, et le tableau de bord montre le coût par façade de chaque parcelle.
    Points de fumée 69 et 70.

- **Le 100 % protégé** (lot L12 du plan de mise en œuvre, `MD/spec-regles-toits.md` §1,
  `MD/spec-audit.md` §14.5) : un bâtiment marqué « vérifié sur place » par un audit de la parcelle
  n'est plus recalculé par Plan (`model/toitVerifie.ts`).
  - **La relecture des toits** en tâche de fond (`VERSION_LECTURE_TOITS`, `app/toitsFond.ts`) le
    saute : sa copie est lue avec les règles du jour et comparée à ce qui est dans le plan (contour,
    hauteur à l'égout, forme, corps un à un, au décimètre), mais rien ne s'écrit que la marque de
    lecture. Le bilan de fin dit seulement si « le nouveau calcul serait d'accord » ou « différent » :
    c'est la mesure d'une règle, sans toucher au projet. La lecture LiDAR d'un import ou d'une
    actualisation (`app/toitsLidar.ts`, option `verifies`) l'écarte de même.
  - **Fichier › Actualiser le projet** le conserve tel quel : ni supprimé et recréé depuis la
    BD TOPO, ni relu (contour, toit, LiDAR, couleur des toits et des murs), ni ramené aux valeurs par
    défaut ; le bâtiment frais qui porte son identifiant n'est pas ajouté à côté. La question le dit
    (un point de plus) et propose une case, décochée, « Recalculer aussi « Maison », vérifié sur
    place le 13/10/2026 » (ou « les n bâtiments vérifiés sur place ») : cochée, il est actualisé
    comme les autres. L'actualisation IGN (Fichier › Actualiser depuis l'IGN) le conserve aussi, sans
    case pour l'instant. Le bilan compte les bâtiments conservés.
  - Un dialogue de choix (`shell/dialogues.ts`) peut porter une case à cocher (`case`), dessinée
    sous ses points (`dialogue.case`). AE 101 et les empreintes sont identiques. Point de fumée 64.

- **Faits des toits et skill `regles-toits`** (lot L20 du plan de mise en œuvre,
  `MD/spec-regles-toits.md` §5, §9 et §10).
  - **`regles/toits/faits.json`** : une vérité observée sur un bâtiment, rangée par sa clé BD TOPO
    (`cleabs`), qui vaut dans tous les projets qui le contiennent. En **contrainte** (par défaut), le
    corps principal qui ne dit pas ce que l'on a vu (forme, sens du faîtage, bouts, nombre de corps
    au plus, fourchettes de hauteur) est relu sur la mesure parmi les seules formes admises ; la
    mesure donne les hauteurs, et un toit déjà d'accord ne bouge pas. En **remplacement**, le fait
    donne aussi les dimensions : un corps sur la boîte orientée du contour, sans lecture, même sans
    LiDAR. L'ordre est celui de la spec : calcul, fait, garde-fous de vraisemblance. Le fichier est
    vérifié (vocabulaire fermé, `model/faitsToits.ts`), compilé dans le fichier livré, et appliqué à
    l'import, en tâche de fond et au rejeu des cas d'audit (`facade/faitsToits.ts`). Son empreinte
    entre dans `VERSION_LECTURE_TOITS` : un fait ajouté demande une version de lecture nouvelle, et la
    CI le rappelle. Le fichier est livré **vide** : aucun toit ne change, la version de lecture reste 1.
  - **Mode d'essai `?regles=local`** (administrateur) : menu Admin › « Essayer des faits de toits… »
    charge un fichier de faits depuis votre poste, à la place de celui du dépôt, le temps de la page.
    Les toits concernés sont relus en tâche de fond ; rien n'est enregistré, et à la prochaine
    ouverture ils sont relus avec les faits livrés. Les réglages ne s'essaient pas encore ainsi.
  - **Skill `.claude/skills/regles-toits/`** : traiter un fichier de promenade de bout en bout (tri des
    cas : hors toit, fait, réglage, règle, question ; attendu ; images avant et après ; PR), en
    s'appuyant sur le skill `toits`. Scripts : `trier.ts` (premier tri, seuils en jeu, squelette de
    fait), `faits.ts` (faits comptés par forme, signal au-delà de cinq faits qui disent la même chose,
    ligne de version de lecture à ajouter) ; `audit.ts --faits` rejoue avec les faits proposés pour
    les cartes d'après. Premier passage sur le corpus : le cas d'Hucqueliers est classé « règle »
    (chantier ouvert des ailes recouvertes), sans fait.
  - AE 101 identique, banc des quatre villages identique, empreintes golden inchangées.

- **Audit de la parcelle, phase 1 : la capture** (lot L9 du plan de mise en œuvre,
  `MD/spec-audit.md` §11, §12 et §8.1). Dans un projet, Fichier › « Auditer la parcelle… »
  (feuille du projet au doigt) ouvre la visite sur place, téléphone en main. La commande demande le
  droit d'écrire le projet ; sans parcelle cadastrale, elle est grisée : « Importez d'abord la
  parcelle depuis son adresse. »
  - **La liste de contrôle**, plein écran : pour chaque bâtiment de la parcelle puis des mitoyens,
    chaque façade (à photographier, photographiée avec son nombre de photos, inaccessible d'une
    touche ; mitoyenne, collée à un autre bâtiment ou posée sur une limite voisine, rien à
    photographier ; celle d'un mitoyen qui donne chez un autre voisin, supposée inaccessible), le
    toit, les cheminées, la toiture-terrasse s'il y en a une, les matériaux ; puis la clôture côté
    rue (type, hauteur, soubassement, photo) et le portail (nature, position, largeur, photo). Un
    compteur dit ce qui reste (« 7 façades sur 9, toit vu, clôture à faire »), et la liste de ce qui
    manque, sans bloquer.
  - **Photographier en marchant** : l'écran de prise se pose sur la Vue 3D. Le GPS et la boussole
    reconnaissent la façade que vous avez devant vous parmi celles de la liste (lot L2), elle est
    surlignée dans la scène et nommée (« Vous êtes devant la façade sud de Maison, 9,2 m — 0 photo »),
    avec le plan de prise (« une photo suffit », « 3 photos, de gauche à droite ») ; la photo située
    (lot L1) s'y range d'elle-même. « Ce n'est pas cette façade » propose la suivante ; sans
    position, « Photographier » sur la ligne d'une façade la choisit.
  - **« Ce que je vois »** : un composant partagé (forme parmi le catalogue des toits, sens du
    faîtage, bouts, lucarnes, cheminées une à une, toiture-terrasse, matériaux des murs et de la
    couverture). Toucher un choix retenu le retire : on n'écrit que ce que l'on a vu. La fiche de la
    promenade le montre aussi, en section facultative, et l'écrit dans le cas (`vu`).
  - **Rien n'entre dans le projet** à cette phase : la capture vit dans le brouillon de l'appareil
    (table `parcelles`, à côté des promenades), se reprend à la réouverture (« Reprendre l'audit du
    … » ou « Le jeter »), et « Lancer l'analyse », proposé dès qu'une façade est photographiée,
    termine la capture pour l'analyse qui viendra (lot L11). Points de fumée 60 et 61.
  - Une commande grisée peut dire ce qu'il faut faire d'abord (`raisonInactive` du registre) ; au
    doigt, la raison s'écrit sous l'entrée du menu.

- **Corpus d'audit et réglages des toits** (lot L19 du plan de mise en œuvre, `MD/spec-audit.md`
  §21 à §23, `MD/spec-regles-toits.md` §6 et §8).
  - **Rejeu d'une promenade** : `.claude/skills/toits/scripts/audit.ts <fichier | dossier>` relit un
    fichier de promenade (version 1 ou 2), rejoue chaque cas sans réseau avec le code courant, et le
    compare à ce que le code avait produit sur le terrain et à l'attendu validé. Il écrit un tableau et
    les fichiers de `rendu.py` (rejeu et terrain côte à côte). Il propose `facade.couleur`, sans le
    cocher, quand une façade lue sur une photo du cas s'écarte de la couleur des murs retenue de plus
    que le seuil de `model/couleurMur.ts` (§18.4). Le calcul pur est dans `facade/audit.ts` ; les
    garde-fous de végétation et d'égout passent dans `facade/vraisemblance.ts`, partagés avec
    l'import (aucun changement de règle).
  - **Corpus** `tests/fixtures/audit/` et test `tests/unit/facade/audit.test.ts` : chaque cas
    `valide` est rejoué en CI (corps au centimètre, couleur et source des murs) ; les cas `a_corriger`
    et `corrige` sont listés en `it.todo`. Deux premiers fichiers, reconstitués depuis des relevés
    réels (pas encore une promenade) : AE 101, la maison de référence, validée (format version 1), et
    le pavillon est de la longère d'Hucqueliers, à corriger (format version 2).
  - **Réglages des toits** : les 74 seuils de la lecture des toits (surface mesurée, rectangles,
    formes simples, corps et pignons, recalage, complétion, végétation, bâtiments à cheval) sortent
    du code dans `regles/toits/reglages.json`, avec leur unité, leur raison et les cas qui les
    justifient, **sans changer une seule valeur**. Le fichier est compilé dans le fichier livré
    (`model/reglagesToits.ts`) ; son empreinte entre dans `VERSION_LECTURE_TOITS`
    (`LECTURES_TOITS`) : une valeur changée sans nouvelle version de lecture fait échouer la CI, et
    relit de toute façon les toits déjà lus. La version de lecture reste 1 : rien n'est relu. Le
    fichier de promenade note l'empreinte des réglages (`promenade.regles.reglagesToits`). Banc des
    quatre villages et AE 101 identiques au bit près ; empreintes golden inchangées.

- **Fusion de plusieurs vues d'une façade** (lot L13 du plan de mise en œuvre,
  `MD/spec-facades-calage-detection.md` §8). Une voiture, une haie ou un poteau cachent une baie sur
  une photo, pas sur une autre prise d'ailleurs : le relevé sait maintenant fondre des vues du mur
  entier, de face et de biais, en plus de la mosaïque de morceaux côte à côte.
  - `facade/fusion.ts` : chaque photo est redressée par ses propres coins dans le même repère de
    l'élévation, avec une carte de qualité par pixel (résolution de la photo source au mur dans le sens
    le moins bien vu, incidence, surexposition) ; un recalage fin par corrélation normalisée, en deux
    dimensions, sur 30 cm au plus, repris sur chaque tiers du mur ; les occlusions par la parallaxe
    (le centre optique de chaque vue se tire de son homographie : ce qui est devant le mur se retrouve
    sur l'autre vue à un recul de 15 cm à 3 m, vérifié dans les deux sens, puis étendu à l'obstacle
    entier) ; la composition par la vue de meilleure qualité hors obstacle, la médiane à partir de
    trois vues libres. Ce qui reste caché partout forme le masque d'occlusion : aucune ouverture n'y
    est cherchée.
  - **Relevé** : avec deux photos ou plus, un choix « Morceaux côte à côte / Vues du mur entier ».
    En vues, chaque photo reçoit les coins du mur entier (cherchés par le calage fin), la consigne le
    dit, l'analyse fond les vues, et un avis signale une vue qui se raccorde mal ou une part du mur
    cachée partout. Le calage garde la résolution de chaque vue. Point de fumée 65.
  - **Banc de façades** : des vues de plus dans le générateur (`synthese.vues`, coins décalés de
    quelques pixels), la vérité des occlusions (`cacheDepuis`), trois scènes (`16` à `18` : voiture,
    haie, deux vues seulement) et une section « une vue → fusion ». Sur ces trois scènes : rappel de
    74 à 100 %, précision de 82 à 95 %, corrections de 2,7 à 0,3 par façade ; le mur caché sur la vue
    principale rendu à 69 % au lieu de 12 %. Les seize scènes d'avant ne bougent pas.

- **Distorsion du grand-angle corrigée** (lot L8 du plan de mise en œuvre,
  `MD/spec-facades-calage-detection.md` §4). Une photo prise à l'ultra grand-angle (focale
  équivalente sous 20 mm) que le téléphone n'a pas redressée courbe les arêtes du mur, ce que le
  calage et le redressement, qui supposent un sténopé, ne savent pas lire.
  - `facade/distorsion.ts` estime un coefficient radial (forme « division ») sur les arêtes presque
    verticales de la photo, qu'il doit rendre droites, et ne corrige que si le gain est net : une photo
    déjà corrigée, ou sans arêtes, reste telle quelle. Au-delà de 20 mm, rien n'est fait. L'image
    corrigée garde sa taille et ses quatre coins ; la focale suit. `facade/segments.ts` rend aussi les
    traces de gradient, courbes comprises (`detecterTraces`), sans changer ses segments.
  - **Relevé** : la correction se fait dans le worker du calage fin, juste avant la recherche des
    coins, et pour chaque photo d'une série prise au grand-angle. La photo montrée devient la photo
    corrigée, les coins déjà posés y sont ramenés, et une note le dit.
  - **Banc de façades** : la distorsion de l'objectif dans le générateur (forme polynomiale, exprès
    différente de celle de la correction), trois scènes (`13` à `15`, dont un témoin déjà corrigé) et
    une section « avant → après ». Sur un 13 mm en barillet de 15 % : cotes de 6 à 1 cm, coins du
    calage fin de 167 cm au pire à 2 cm ; le témoin et les treize scènes d'avant ne bougent pas.
    Point de fumée 59.

- **Calage fin des photos de façade : les coins trouvés sur la photo** (lot L7 du plan de mise en
  œuvre, `MD/spec-facades-calage-detection.md` §6). Les coins ne sont plus seulement prédits par la
  prise de vue : ils sont cherchés sur les arêtes de la photo.
  - `facade/segments.ts` détecte les segments de droite sur le gradient de couleur (du type LSD) ;
    `facade/pointsFuite.ts` lit le point de fuite vertical, qui corrige l'inclinaison et le roulis
    dans les bornes de l'accéléromètre, et le point de fuite horizontal du mur, qui corrige l'azimut
    dans celles de la boussole (le calage de la boussole) ; `facade/calageFin.ts` cherche les côtés,
    l'égout et le pied du mur dans les zones de recherche du calage grossier, et note chaque
    hypothèse : soutien des segments, contraste et teinte de chaque côté, accord avec la largeur du
    plan et la hauteur à 25 % près, accord avec la prise de vue, hauteur de l'objectif qu'elle
    suppose. Sous le seuil, les coins prédits restent. Le pied caché (haie, voiture) est prédit
    d'après la hauteur du téléphone, et marqué comme tel.
  - **Relevé** : dans l'éditeur des coins, un coin trouvé est un rond plein, un coin prédit un rond
    en pointillé, un coin déplacé au doigt l'est pour de bon (la recherche ne le reprend pas) ; la
    loupe reste. Une note dit ce qui a été trouvé. Le calcul tourne dans un worker, inclus dans le
    fichier livré : l'écran ne gèle pas. Le relevé garde la source de chaque coin, l'azimut corrigé et
    la note du calage (`ReleveFacade.calage`, facultatif).
  - **Contour décalé** : quand une distance mesurée (réalité augmentée, photo de rue) le permet, la
    largeur vue sur la photo est comparée à celle du plan ; au-delà de 0,5 m, un avis dit que le
    contour du bâtiment est sans doute décalé, et la façade garde la largeur du plan.
  - **Banc de façades** : une section « Calage fin », depuis le relevé et depuis l'audit, et une scène
    `12-haie-pied-cache-roulis`. Coins proposés par le relevé à 10 cm au plus : de 4 sur 44 (médiane
    38 cm) à **44 sur 44** (médiane 0,5 cm), dont 40 trouvés sur la photo et 4 prédits ; calage de
    l'audit avec des capteurs typiques : de 0 à 44 sur 44. Les détections d'ouvertures ne changent
    pas. Point de fumée 58.

- **Tableau de bord de la consommation de Claude** (lot L16 bis, `MD/spec-audit.md` §13.3).
  Admin › Consommation de Claude (`?admin&ecran=consommation`), pour l'administrateur seulement,
  ouvert par une commande du registre (`admin.consommation`) inscrite dans les trois classes
  d'écran. Il relit le journal d'`analyse.php` par une nouvelle route, `GET admin/consommation`
  (Apache et Node, même réponse), filtrée par période, organisation, modèle, usage et parcelle :
  - dans le temps : tokens ou dollars par jour, semaine ou mois, en aires empilées par modèle,
    avec une infobulle au survol ou au doigt et le tableau des valeurs ;
  - par parcelle (tableau trié sur chaque colonne), par usage (part du coût, part du Batch), par
    organisation (jour et mois face aux plafonds) ;
  - chiffres clés : coût, tokens, coût moyen par parcelle face à l'estimation de 1 à 2 centimes,
    part de l'escalade, part lue en cache, taux d'échec ;
  - alertes sur les sept derniers jours : organisation à 80 % de son plafond du jour ou du mois,
    coût moyen par parcelle au-delà de deux fois l'estimation, plus de 5 % d'échecs ;
  - export CSV de la vue affichée (point-virgule, virgule décimale, formules neutralisées) ;
  - tarifs et plafonds réglés depuis l'écran : un tarif s'ajoute daté d'aujourd'hui ou plus tard,
    seule une ligne à venir se retire.

  Graphiques en SVG dessinés par la page, avec trois nouveaux jetons de couleur (`--serie-1` à
  `--serie-3`, un par modèle, validés pour les daltoniens en clair et en sombre), chaque couleur
  nommée à côté. Les modèles de palette les reprennent tels quels.

- **Audit, la couleur de la façade sur la photo** (lot L3 du plan de mise en œuvre,
  `MD/spec-audit.md` §6.2 et §18.4). Chaque photo jointe à la fiche d'un bâtiment marqué est lue en
  tâche de fond : Plan retrouve la façade de ce bâtiment devant la prise de vue (lot L2), pose ses
  points sur la photo par la géométrie de la prise (position, boussole, focale, inclinaison et
  roulis du téléphone) et en lit la teinte avec la règle de Panoramax (`model/couleurMur.ts`) :
  - seule la **moitié centrale du mur** est lue, pour absorber l'erreur de la boussole ;
  - une **clôture** en limite de parcelle est écartée : pas de ligne de vue sous 2,5 m à une
    limite ; le ciel, le feuillage, les fenêtres et les ombres aussi.

  Sous la photo, la fiche dit « Façade sud : #C9B49A, lue sur la photo », avec une pastille de la
  teinte. Quand la lecture ne conclut pas, ou que la direction vient du sens de la marche, elle
  demande « **Touchez la façade sur la photo** » : la photo s'affiche en entier, et la teinte est
  lue autour du doigt. Les fenêtres et les ombres y sont écartées par l'écart à la médiane, comme
  dans le relevé. « Plus tard » range la demande ; « Toucher la façade » la rappelle.
  Sans direction de prise de vue, ou sans façade du bâtiment devant elle (3 à 40 m, de face), la
  photo reste une photo. La couleur lue se range dans le cas (`lectures.facades` : mur, couleur,
  source `automatique` ou `toucher`, rang de la photo, pixels lus) et part dans le fichier de la
  promenade : une vérité terrain pour la lecture Panoramax, rien n'est changé sur le bâtiment
  (`render/couleurPhotoAudit.ts`, `app/audit/couleurFacade.ts`).

- **Calage grossier des photos de façade** (lot L6 du plan de mise en œuvre,
  `MD/spec-facades-calage-detection.md` §4 et §5). `facade/calage.ts` projette les coins du mur dans
  la photo par un sténopé, depuis la prise de vue (position, azimut, inclinaison, roulis, focale,
  objectif à 1,5 m). Aux bornes de l'incertitude, il donne une **zone de recherche** par coin :
  précision du GPS, 15° pour la boussole, 25° pour le sens de la marche, quelques degrés d'attitude,
  ±50 % de focale quand elle est estimée. Ces zones serviront au calage fin (lot L7).
  - **Relevé** : les coins proposés tiennent compte de l'inclinaison et du roulis du téléphone au
    déclenchement, et du biais que donne la boussole. Avant, le mur était supposé centré et le
    téléphone d'aplomb. Au banc, l'erreur médiane des coins proposés passe de 146 à 36 cm.
  - **Audit** : les coins d'une photo située sont prédits par sa prise de vue
    (`coinsDeLaPhoto`), centrés sans azimut. La photo garde la taille de sa source, avant
    réduction.
  - **Précision annoncée** : l'écran de vérification du relevé dit la précision des cotes, un pixel
    de la photo au mur (« Cotes précises à environ 2,5 cm : la photo ne voyait le mur qu'à 40 pixels
    par mètre »). Le relevé garde les coins et les pixels par mètre de chaque photo
    (`ReleveFacade.calage`, facultatif).
  - **Banc de façades** : il mesure aussi le calage grossier, avec des capteurs exacts (36 coins
    sur 40 à moins de 10 cm) et typiques (tous les coins vrais dans leur zone de recherche).

- **Audit, la façade devant vous** (lot L2 du plan de mise en œuvre, `MD/spec-audit.md` §6.1 et
  §12.2). En mode audit, Plan reconnaît en direct la façade que vous avez devant vous : celle dont
  vous voyez le côté extérieur, à 3 à 40 m, sans autre bâtiment entre vous et elle, puis, parmi
  celles-là, celle que désigne la boussole (à 50° près ; à égalité, la plus proche). Sans boussole,
  c'est la plus proche devant laquelle vous êtes. Elle est **surlignée en ambre dans la Vue 3D** et
  nommée en tête de la barre d'audit : « Vous êtes devant la façade sud, 9,2 m ».
  Le relevé d'une façade s'en sert aussi : quand votre position est suivie (« Ma position (3D) »),
  il propose le mur devant lequel vous vous tenez, avec sa distance ; sinon, comme avant, celui qui
  fait face au cap de la boussole (`facade/priseDeVue.ts`).

- **Décisions D1, D2 et D13 tranchées** (`MD/plan-mise-en-oeuvre-audit.md`, specs, aucun code) :
  - l'analyse par Claude passe par `analyse.php`, sur le serveur de Plan, d'abord pour l'admin ;
  - l'accord pour envoyer les photos est donné une fois par projet, et révocable ;
  - les réglages et les faits des toits vivent dans le dépôt.

  Les lots L17 et L19 sont débloqués.

- **Cheminées et toits-terrasses dans les corps de toit, et en Vue 3D** (lot L10 de
  `MD/plan-mise-en-oeuvre-audit.md`, `MD/spec-regles-toits.md` §2.6, §2.7, §4). Un corps
  (`CorpsToit`) peut porter des souches (`cheminees` : centre, section, hauteur du débouché au-dessus
  du sol, position faîtage, pan, pignon ou façade, conduits, matériau, couronnement, source) et, s'il
  est plat, sa toiture-terrasse (`terrasse` : accessible, revêtement, acrotère, garde-corps,
  édicules, source). Les deux champs sont facultatifs : un fichier ancien garde son sens, et
  l'enregistrement les écrit tels quels (une liste vide de cheminées ne s'écrit pas).
  - En 3D (`three/cheminees3d.ts`) : la souche part du pan, le pied de chaque face à la hauteur du
    toit sous ses coins ; au faîtage, elle est centrée sur sa ligne ; dans un pignon, au nu du mur
    de bout ; adossée, elle monte du sol jusqu'à son sommet, contre le mur extérieur le plus proche.
    En haut, une dalle de couronnement qui déborde de 5 cm, et des mitrons, un par conduit, quand
    ils ont été vus. Couleur du matériau (brique, pierre, métal), sinon celle des murs.
  - En 3D (`three/terrasse3d.ts`) : l'acrotère en liseré sur les façades seulement (pas contre un
    autre corps), coupé d'onglet aux angles ; les édicules, de la terrasse à leur sommet, à toit plat
    en gravillons.
  - L'inspecteur le dit après le corps : « 2 cheminées », « terrasse accessible, acrotère de
    0,60 m, un édicule ».
  - Ces données ne viennent que d'une observation : aucune détection LiDAR, aucun bâtiment existant
    ne change (AE 101 identique, empreintes inchangées, GLB de la démonstration identique).

- **Serveur de l'analyse par Claude** (lot L16, `MD/spec-audit.md` §13.2 et §13.3, aucun écran).
  `deploy/analyse.php`, à côté d'`admin.php`, et son équivalent Node pour le serveur SiteGround
  (`buildsg/analyseAdmin.mjs`) relaient l'API Message Batches d'Anthropic sous `admin/claude/…`,
  pour l'administrateur seulement pour l'instant :
  - créer un batch (Claude Haiku 5.5, Claude Sonnet 5.5 en escalade), suivre son état, lire ses
    résultats ;
  - la clé (`anthropicCle`, ou `ANTHROPIC_API_KEY` sous Node) ne quitte jamais le serveur, et la
    page n'envoie que les images et le texte de la maison : le prompt, le schéma de sortie et
    l'effort sont fixés par le serveur ;
  - plafonds par organisation, par jour et par mois, qui comptent aussi les batches encore en
    cours (`claude/plafonds.json`) ;
  - une ligne de journal par appel (`claude/journal-AAAA-MM.jsonl`) : parcelle, modèle, usage,
    passe, tokens renvoyés par l'API, nombre d'images, coût et statut, sans photo ni réponse ;
  - table des tarifs datée (`claude/tarifs.json`), posée au premier usage depuis
    `deploy/claude-tarifs.json`, prix vérifiés sur la page officielle le 13 octobre 2026 ; un tarif
    passé ne se réécrit pas.

  Le prompt « béton » (version 0, `deploy/prompt-analyse.md`) et son schéma de sortie structurée
  (`deploy/schema-analyse.json`) sont versionnés, et leurs versions suivent chaque ligne du journal.

- **Audit, photo située complète** (lot L1 du plan de mise en œuvre, `MD/spec-audit.md` §5 et §19).
  La fiche d'un bâtiment marqué garde **jusqu'à six photos**, en vignettes, chacune avec
  « Retirer » et le texte de sa prise de vue. Chaque photo garde en plus :
  - la **focale équivalente 24×36 et le modèle d'appareil**, lus dans l'EXIF avant la réduction
    qui l'efface. Si l'EXIF n'a pas de focale, Plan reprend celle déjà lue pour ce modèle sur ce
    navigateur ; sinon il retient le champ par défaut du relevé (67°), annoncé « estimé » ;
  - l'**inclinaison** de la visée et le **roulis** de l'image, lus sur l'orientation du téléphone
    au retour de l'appareil photo.

  Le fichier de la promenade passe en **version 2** (`constat.photos[]`). Un fichier de version 1 se
  relit tel quel : sa photo unique devient la première de la liste (`lireFichierPromenade`).

- **Audit, brouillon local de la promenade** (lot L4, `MD/spec-audit.md` §10). Les marques, les cas
  figés et leurs photos sont écrits au fur et à mesure dans le téléphone (IndexedDB,
  `io/brouillonAudit.ts`), et tout de suite quand l'écran se verrouille ou que l'onglet passe en
  arrière-plan : un onglet tué par le système ne fait plus perdre la visite.
  - À la réouverture de `?mode=audit`, un dialogue propose « Reprendre l'audit du … » ou « Le
    jeter ». Le départ attend la réponse : un audit repris repart de sa propre parcelle, pour que
    les contours déjà figés restent dans le même repère. La grille LiDAR ou l'adresse qui manquaient
    à un cas sont relues quand son bâtiment revient dans le plan.
  - Après le partage (ou le téléchargement) du fichier, Plan propose « Effacer le brouillon » ;
    rien n'est effacé sans cette confirmation.
  - Navigation privée, stockage bloqué ou téléphone plein : l'audit continue, et un message dit une
    fois qu'il faut partager le fichier avant de fermer l'onglet.

- **Banc de façades** (lot L5 du plan de mise en œuvre, `MD/spec-facades-calage-detection.md`
  §14). Il est monté avant toute modification de la détection des ouvertures, qui ne change pas :
  - un générateur de façades de synthèse difficiles (`tests/banc/facades/`) : brique, soubassement
    en pierre, meulière, ombres de débord, de balcon et d'arbre, volets battants, coffres et tabliers
    de volets roulants, voiture ou haie devant, prise de biais, focale inconnue ;
  - un corpus de douze scènes (`tests/fixtures/facades/`), dont la vérité donne les ouvertures et
    les coins. Les deux images des tests d'origine en font partie et restent justes à 1 ou 2 cm ;
  - un script de mesure (`npx tsx .claude/skills/facades/scripts/banc.ts`). Il rejoue
    `facade/detection.ts` et `facade/analyse.ts` tels qu'ils sont, et mesure la précision, le
    rappel (recouvrement de plus de 50 %), l'erreur médiane des cotes, les corrections par façade et
    l'erreur des coins proposés ;
  - le skill `facades`, qui dit comment lancer le banc et lire son tableau. Il donne les chiffres
    de départ : rappel 65 %, précision 78 %, cotes à 1 cm, 4,2 corrections par façade, aucun coin
    proposé à moins de 10 cm.

- **Audit, photo située complète** (lot L1 du plan de mise en œuvre, `MD/spec-audit.md` §5 et §19).
  La fiche d'un bâtiment marqué garde **jusqu'à six photos**, en vignettes, chacune avec
  « Retirer » et le texte de sa prise de vue. Chaque photo garde en plus :
  - la **focale équivalente 24×36 et le modèle d'appareil**, lus dans l'EXIF avant la réduction
    qui l'efface. Si l'EXIF n'a pas de focale, Plan reprend celle déjà lue pour ce modèle sur ce
    navigateur ; sinon il retient le champ par défaut du relevé (67°), annoncé « estimé » ;
  - l'**inclinaison** de la visée et le **roulis** de l'image, lus sur l'orientation du téléphone
    au retour de l'appareil photo.

  Le fichier de la promenade passe en **version 2** (`constat.photos[]`). Un fichier de version 1 se
  relit tel quel : sa photo unique devient la première de la liste (`lireFichierPromenade`).

- **Spec : tableau de bord de la consommation de Claude** (`MD/spec-audit.md` §13.3, aucun code).
  `analyse.php` journalise chaque appel : parcelle, modèle, usage, tokens renvoyés par l'API, coût
  calculé avec une table des tarifs datée. Journal, tarifs et plafonds sont des JSON stockés sur le
  serveur de Plan, comme la palette. L'écran Admin › Consommation Claude montre :
  - les tokens et le coût dans le temps, par modèle ;
  - le détail par parcelle, par usage et par organisation ;
  - les chiffres clés, à côté du taux d'accord.

  Il émet aussi des alertes de plafond et de dérive, et exporte en CSV. Il est ajouté au plan de
  mise en œuvre (lot L16 bis).

- **Plan de mise en œuvre de l'audit, des façades et des règles des toits**
  (`MD/plan-mise-en-oeuvre-audit.md`, aucun code). Il découpe les trois specs en 21 lots, une PR
  chacun, regroupés en jalons :
  - socle commun : photo située, façade reconnue, couleur sur photo, brouillon ;
  - calage des photos ;
  - audit de la parcelle sans Claude ;
  - détection des ouvertures ;
  - analyse par Claude ;
  - corpus et règles ;
  - généralisation.

  Il donne leurs dépendances, ce que chacun doit prouver, les décisions qui bloquent et les défauts
  retenus en attendant, les risques et le premier pas.

- **Spec de l'audit : deux processus, les mêmes outils ; calage et détection des façades**
  (`MD/spec-audit.md` réorganisée, `MD/spec-facades-calage-detection.md` nouvelle, aucun code).
  - L'audit de la parcelle principale (tout utilisateur, dans son projet) et la promenade
    (administrateur) partagent leurs outils : Vue 3D qui suit, photo située, façade reconnue à la prise
    de vue, couleur lue sur la photo, relevé, « Ce que je vois », cas figé, brouillon.
  - L'audit de parcelle se fait en trois phases : capture (photos rangées d'elles-mêmes sur la façade
    que l'on a devant soi, observations), analyse (mesures dans le téléphone, puis batch Claude qui
    rédige les propositions), validation des propositions dans la Vue 3D, avant et après, qui met le
    projet à jour en un seul pas d'annulation.
  - Le calage des photos et la détection des ouvertures sont repris pour en faire le moteur des
    façades : coins trouvés par les points de fuite et cap corrigé, fusion de plusieurs vues pour voir
    derrière une voiture ou une haie, teinte locale et profils de contours, filtre d'ombre, structure en
    niveaux et travées, volets et coffres reconnus, confiance montrée, corrections tracées, banc de
    mesure. Claude aide quand l'algorithme n'est pas sûr ; ses propositions sont recalées sur l'image.
  - Les façades relevées règlent ensuite, par profil, les fenêtres automatiques du voisinage.

- **Spec des toits : deux exigences, cheminées et toits-terrasses** (`MD/spec-regles-toits.md`,
  `MD/spec-audit.md`, aucun code).
  - Le voisinage vise le modèle automatique le plus juste possible, calibré par l'audit, mais pas à
    100 %. La parcelle principale, et très probablement les mitoyens, visent le 100 % : faits, relevés
    et audit de la parcelle, figés dans le projet. Un changement de règle ne les recalcule plus.
  - La cheminée est décrite en détail : souche, conduits, couronnement, positions (faîtage, pan,
    pignon, adossée en façade), dimensions vraisemblables, ce que le LiDAR, l'orthophoto et la photo
    en voient, modèle de données et assertions.
  - La toiture-terrasse aussi : inaccessible, accessible, végétalisée, technique ; acrotère,
    garde-corps, édicules, lanterneaux ; terrasse partielle ; modèle de données et assertions.
  - Deux problèmes à cocher de plus dans l'audit : `toit.cheminee` et `toit.terrasse`.
  - L'audit de la parcelle principale est ouvert à tout utilisateur, dans son projet. Il propose des
    changements (ouvertures, hauteurs, couleur, cheminées, terrasse, clôture) ; ceux que l'utilisateur
    accepte mettent à jour le modèle en un seul pas d'annulation. La promenade reste réservée à
    l'administrateur.

- **Spec du mode audit : captures opportunistes et audit de la parcelle principale** (`MD/spec-audit.md`
  §12 et §13, aucun code). Chaque photo d'un cas est exploitée au maximum :
  - plusieurs photos par cas, chacune avec position GPS, azimut, focale et inclinaison ;
  - le mur photographié proposé sur la photo ;
  - la couleur de la façade lue, automatiquement ou d'un toucher ;
  - sur la parcelle principale, le relevé de la façade : texture redressée, ouvertures réelles,
    hauteur mesurée.

  Un mode à part, l'audit de la parcelle principale, fait le tour d'une maison avec une liste de
  contrôle : toutes les façades, le toit, les matériaux, la clôture et le portail. Il produit un
  fichier qui nourrit le corpus et peut s'importer dans le projet de la même parcelle.

- **Spécification des règles des toits** (`MD/spec-regles-toits.md`, aucun code). Elle couvre :
  - le vocabulaire complet du toit (versants, croupe et demi-croupe, brisis et terrasson, arêtier, noue, ligne de bris, rives, lucarnes, cheminées, débords), avec ce que le LiDAR peut voir de chacun ;
  - le catalogue de 21 formes, du plus simple au plus rare (plat, monopente, deux pans, croupe, pavillon, demi-croupe, Mansart, asymétrique, toit en M, papillon, gambrel, coyau, shed, berceau, carène, conique, dôme, impériale…), avec leurs confusions ;
  - les trois niveaux d'une observation de terrain : fait sur un bâtiment, réglage par profil (JSON), règle dans le code ;
  - l'attendu testable écrit depuis ce que l'on a vu ;
  - le corpus de non-régression et le skill qui formalise un cas d'audit ;
  - l'analyse assistée par Claude (photo, rendu du modèle au même point de vue, orthophoto, LiDAR) : réponse fermée, vote à trois passes, contrôle croisé, taux d'accord mesuré, statut « proposé », et un coût estimé à environ un demi-centime par maison avec Claude Haiku 5.5 ;
  - une roadmap de transformation en six phases (observer, mesurer sans changer, corriger par les faits, généraliser les formes puis les profils, régime de croisière), avec ses critères de passage et ses indicateurs ; à chaque phase, le rôle de Claude Code (le développeur) et de Claude analyste (en ombre, mesuré, en service, sur Panoramax, puis systématique).

- **Mode audit : boussole, vue à 70 m, photo située.** Dans la Vue 3D, le centre de rotation et de zoom
  est votre position : il vous suit à chaque pas, et la caméra garde le zoom et la rotation que vous
  lui avez donnés. « Me suivre » recadre derrière vous, dans l'axe de votre cap, pour voir 70 m
  devant, et tourne avec la boussole du téléphone (à défaut, avec le sens de la marche). Tourner la
  vue d'un doigt lâche le cap, le pincement non. Les bâtiments sont lus jusqu'à 70 m (40 m avant).
  La photo d'un cas garde sa position GPS et son azimut, que la fiche affiche.

- **Menu Admin › Mode audit (promenade)** : le mode audit s'ouvre depuis l'écran, sans taper
  d'adresse. L'entrée est proposée en admin des démos (`?admin&mode=audit`, sans enregistrement sur les
  démos) et à l'administrateur de la plateforme, qui ne voit qu'elle dans le menu Admin.

- **Mode audit, étape 1** (`?mode=audit`, administrateur seulement ; `MD/spec-audit.md`). Une
  promenade pour noter les toits et les façades que Plan calcule mal. La Vue 3D suit votre position
  GPS (caméra « drone », « Me suivre » après un glisser) et charge tout ce qui est à moins de 40 m,
  relu à chaque pas de plus de 10 m ; chaque toit y est calculé en entier (recalage, coupes), les
  murs prennent la couleur de leur matériau BD TOPO. Toucher un bâtiment le marque en rouge (le
  retoucher retire la marque) ; un appui long ouvre sa fiche : catégorie, problèmes à cocher (sens
  du faîtage, pignon manquant, arbre pris pour le toit…), note, photo réduite à 300 Ko. « Cas
  notés » montre la liste, à revoir, puis partage un seul fichier pour toute la promenade par le
  partage du téléphone (téléchargé sur un ordinateur). Chaque cas y garde ce qu'il faut pour être
  rejoué sans réseau : contour, BD TOPO, grille LiDAR, et ce que Plan en avait fait. Rien n'est
  enregistré : aucun projet n'est créé ni modifié. `&depart=<adresse>` part d'une adresse au lieu du
  GPS, la position se déplaçant au doigt : pour essayer sans sortir.

- **Vue 3D : votre position GPS** (menu Affichage, « Ma position (3D) », décochée par défaut). Un
  point bleu, toujours visible, suit votre position pendant que vous marchez, avec au sol un disque de
  la précision annoncée par l'appareil. Chaque nouvelle position déplace seulement le point : rien
  n'est recalculé, la scène n'est pas reconstruite. Comme « Filaire », c'est une préférence
  d'affichage : ni Ctrl+Z, ni « projet modifié », permise en lecture seule, et elle ne s'enregistre
  pas avec le projet. Elle demande un projet calé sur le cadastre ; loin du projet, un message le dit.
  Le point n'entre pas dans l'export GLB.

- **La couleur des murs se lit plus prudemment sur les photos de rue, et plus en tâche de fond.**
  Une façade en partie cachée (une haie devant) se lit sur ce qui en reste. Un mur dont trop de
  points tombent sur le ciel n'est pas lu : la photo ne le montre pas là où on le croit. Une teinte
  froide n'est pas prise pour une façade. Ainsi, un nuage au-dessus d'une haie ne devient plus une
  façade blanche. La lecture de tout le voisinage en tâche de fond existe, mais elle est arrêtée : sur
  les photos disponibles, elle ne concluait que pour quelques bâtiments (2 sur 31 au Vésinet) pour des
  centaines de mégaoctets téléchargés. Elle reprendra quand la lecture conclura plus souvent. L'import
  lit toujours les murs des 150 bâtiments les plus proches.

- **Modes de diagnostic `?mode=devroof` et `?mode=devwall`** (dans l'adresse). Chaque bâtiment est
  peint, sur le plan et dans la Vue 3D, selon l'origine de son toit ou de ses murs ; la barre d'état
  donne la légende et les comptes. Rien n'est modifié dans le projet ni dans les exports.
  - devroof : rouge, non traité ; vert, toit lu sur le LiDAR ; orange, toit par défaut faute de
    LiDAR ; bleu, autres cas (toit saisi, relevé sur une photo de façade).
  - devwall : rouge, couleur par défaut ; orange, couleur et texture des fichiers fonciers ; vert,
    photo de rue Panoramax.

- **La couleur des toits du voisinage, lue elle aussi en tâche de fond.** Chaque lot lit la forme des
  toits qui n'en ont pas, puis la couleur de ceux qui n'en ont pas, sur la photo aérienne. Sans
  dalle LiDAR sur le secteur, les couleurs se lisent quand même.

- **Fin de la lecture des toits : un bilan, les questions en attente, et l'enregistrement.** Un message
  dit combien de toits et de couleurs ont été lus ; les toits « à cheval sur deux parcelles » que la
  lecture a découverts posent leur question. Le projet s'enregistre seul toutes les 5 minutes et à
  la fin, seulement si tout ce qui attend d'être enregistré vient de la lecture : jamais une de vos
  modifications à votre insu. Un enregistrement refusé (projet trop lourd) arrête ces essais pour la
  séance.

- **Les toits de tout le voisinage, lus sur le LiDAR en tâche de fond** (`app/toitsFond.ts`). À
  l'import et à l'actualisation, seuls les 30 bâtiments les plus proches (au lieu de 150) sont lus
  avant que le plan s'ouvre ; les autres le sont ensuite, par lots, du plus proche au plus loin, sans
  bloquer le plan. Chaque lot se dessine dès qu'il est lu (la Vue 3D ouverte suit au plus toutes les
  10 s). Chaque bâtiment lu est marqué (`toitLidarLu`, enregistré) : il n'est pas relu à la
  réouverture, et la lecture reprend où elle s'était arrêtée. Un bâtiment que vous modifiez pendant
  la lecture n'est pas écrasé. La barre d'état compte « Toits LiDAR : 120 / 2 400 », et
  Fichier › Suspendre (ou Reprendre) la lecture des toits l'arrête ou la relance. Un service muet
  l'arrête après trois lots sans réponse. La suite du chantier est dans `MD/roadmap-toits-fond.md`.

- **Choisir le matériau de la couverture** (section Façades et toit, « Matériau »). Automatique, le
  défaut, garde le matériau que Plan déduit des fichiers fonciers, de la couleur et de la pente, et
  le nomme entre parenthèses. Tuile romane, plate ou canal, ardoise ou zinc l'emportent en 3D sur
  ce relevé, dans tous les modes de toit. « Actualiser le projet » revient à l'automatique ; la
  relecture LiDAR des toits garde le choix.

- **Affichage › Noms des rues**. La même bascule que la case de la section Voisinage de la parcelle ;
  la première fois, les rues sont lues à l'IGN.

- **Affichage › Recharger la photo aérienne**. Une photo mal chargée ne se réparait pas en éteignant
  puis rallumant le fond : les tuiles restaient en cache. La commande oublie tout et relit tout. Une
  tuile qui échoue est maintenant redemandée une fois avant d'être abandonnée.

- **La photo aérienne couvre tout le voisinage**, jusqu'au bout du relief du paysage. Une seconde
  couche, à un niveau de détail plus grossier, se pose sous la photo fine des parcelles. Avant, la
  vallée restait verte au-delà de la dernière parcelle importée.

- **Une roue qui tourne, sans message, pendant l'ouverture** (`shell/chargement.ts`, `index.html`).
  Un plan lourd (le voisinage de 5 km : 4 000 objets) met plusieurs secondes à s'ouvrir, et la page
  montrait pendant ce temps des zones vides. La roue est posée par la page elle-même, avant que le
  programme ne soit chargé ; elle s'efface devant la connexion, le premier pas ou une erreur, revient
  pendant la lecture du projet et disparaît dès que le plan est dessiné. À l'import d'un projet JSON,
  la même roue tourne le temps de le lire et de le poser.

- **Cinq dessins d'arbres en 3D, au choix** (section Arbre de l'inspecteur, « Dessin (3D) »). Le
  choix vaut pour tous les arbres du plan, voisinage compris ; un arbre ajouté ensuite suit les
  autres.
  - **A — Lobes** : le dessin d'avant, tel quel.
  - **B — Dôme**, le défaut : les mêmes lobes, sans le toupet qui dépassait en haut du houppier ni
    de bosse sur l'épaule, plus lisses, sans les fentes qui s'ouvraient à la couture des sphères.
  - **C — Touffes** : vingt à quarante petites touffes de nuances différentes autour d'un cœur
    sombre, en une seule maille par arbre.
  - **D — Taillé** : trois à cinq volumes à facettes.
  - **E — Maquette d'architecte** : un seul volume lisse, d'un vert doux tiré de la couleur du
    feuillage, sur un tronc fin.
  Pour B à E, le tronc est à l'échelle du houppier : un rayon de 9 % de son diamètre (5 % pour la
  maquette), jamais plus que le cercle dessiné sur le plan.
  L'emprise, la hauteur et l'ombre de l'arbre ne dépendent pas du dessin. C'est une préférence
  d'affichage (ni Ctrl+Z, ni « projet modifié », permise en lecture seule), enregistrée avec le
  projet. Le GLB de la démonstration change de taille, pas de structure (`EMPREINTES.md`).

- **Une troisième démo : Peyrusse-le-Roc, horizon de cinq kilomètres** (`plan-demos/3.json`, source
  `deploy/plan-demos/3.json`, 4,3 Mo). La place des Treize Vents avec le voisinage étendu au maximum :
  4 001 objets, dont les 2 000 parcelles les plus proches (jusqu'à 1,5 km environ) et 2 000 bâtiments
  (jusqu'à presque 5 km), le relief fin de la parcelle au pas de 0,5 m et la vallée en relief sur 10 km
  de côté au pas de 20 m. La livraison la copie à côté de `1.json` et `2.json`.

- **Une seconde démo : Peyrusse-le-Roc, horizon d'un kilomètre** (`plan-demos/2.json`, source
  `deploy/plan-demos/2.json`). La place des Treize Vents avec un voisinage étendu à 1 000 m : 1 346
  objets, dont 1 065 parcelles et 280 bâtiments (142 avec leurs toits relus au LiDAR), le relief fin de
  la parcelle au pas de 0,5 m et le maillage secondaire de la vallée au pas de 5 m. La livraison copie
  le fichier à côté de `1.json` ; il s'ouvre comme l'autre démo.

- **« Fichier › Actualiser le projet… »** (`app/actualiserProjet.ts`). Met un projet à niveau d'un
  geste, comme s'il était importé aujourd'hui.
  - **Relu à l'IGN et recalculé** avec la version en cours : la parcelle, les bâtiments de la parcelle
    et du voisinage déjà présent, la végétation, la forme des toits (LiDAR), la couleur des toits et
    des murs, le relief (sur toutes les parcelles quand le plan a un voisinage) et le PLU.
  - **Remis aux valeurs par défaut** pour les objets importés : leurs couleurs, leurs textures, le
    gazon en 3D, la couleur des murs choisie, le mode de toit, l'apparence du voisinage et l'affichage
    du relief.
  - **Conservés** : les objets dessinés à la main, les noms et le masquage des objets importés, la
    clôture et ses portails, les réponses aux questions sur les toits à cheval, le plafond de points
    du relief.
  - Un dialogue dit ce qui va être fait avant de le faire, et Ctrl+Z rend le projet d'avant.
  - Les apparences d'import sont désormais définies à un seul endroit (`APPARENCES_IGN`, dans
    `geo/cadastreObjets.ts`) : l'import, l'actualisation du voisinage et cette commande les lisent.

- **Une pelouse sur la parcelle du projet en 3D** (`three/gazon.ts`). Par défaut, la parcelle est
  couverte d'un gazon dessiné, sans téléchargement : des milliers de brins de nuances différentes, plus
  sombres à la base et plus clairs à la pointe, quelques brins secs, une sous-couche de terre là où ils
  s'écartent, et un léger relief sous le soleil. Des variations lentes de teinte, tous les dix mètres
  environ, empêchent de voir la texture se répéter. Le gazon épouse exactement le contour de la
  parcelle et suit le relief maille par maille, au pas de la grille du sol. Il passe au-dessus de la
  photo aérienne sur la parcelle, sous les terrasses, les bâtiments et les chemins, et laisse passer un
  bassin. La case « Gazon (3D) » (section Apparence de la parcelle) le retire ; une texture horizontale
  choisie l'emporte sur lui. L'export GLB l'emporte avec sa texture.

- **De nouvelles couvertures en 3D** (`three/couverture.ts`, `MD/spec-toit-ign.md` §6.2) : tuiles
  plates sur les toits raides, tuiles canal sur les toits peu pentus du Midi, zinc à joints debout,
  gravillons sur les toits-terrasses, en plus des tuiles romanes et des ardoises. Le matériau de
  toiture des fichiers fonciers (BD TOPO) choisit d'abord : ardoise, zinc ou tuile, même quand la photo
  voyait la tuile grise. La pente choisit ensuite le modèle de tuile. Les facettes plates d'un bâtiment
  en corps ont leur propre toit-terrasse, et le zinc brille un peu.

- **Des textures pour les matériaux des murs** (`three/textureMur.ts`, `MD/spec-toit-ign.md` §6.6).
  Brique, pierre, meulière, béton, enduit et bois sont dessinés sans réseau, à l'échelle réelle et sans
  couture, puis teintés par la couleur des murs. Ils se posent en 3D et dans l'export GLB sur les murs
  dont la BD TOPO donne le matériau, pignons compris. Une texture choisie dans l'inspecteur l'emporte ;
  « Couleur du plan » et la case « Texture » les retirent.

- **La couleur réelle des murs** (`model/couleurMur.ts`, `render/couleurMurPhoto.ts`,
  `MD/spec-toit-ign.md` §6.5). Les murs prennent la teinte de leur façade lue sur une photo de rue
  Panoramax, quand une photo la montre sans clôture, haie, ombre ou autre bâtiment devant. Sinon, le
  matériau des fichiers fonciers donné par la BD TOPO s'applique à tous les bâtiments, à toute
  distance : pierre, meulière, brique, béton, enduit, bois. Dans « Apparence », le champ « Murs en 3D »
  permet de choisir à la main la photo, le matériau ou la couleur du plan, et dit d'où vient chaque
  couleur. Le matériau de la toiture départage aussi le repli d'un toit que l'orthophoto ne lit pas
  (ardoise et zinc gris, tuile vieillie brune).

- **Une question sur la toiture d'un bâtiment à cheval sur deux parcelles** (`model/aCheval.ts`,
  `app/toitsACheval.ts`, `MD/spec-toit-ign.md` §13.8). Quand le contour BD TOPO d'un bâtiment du
  projet ou d'une maison mitoyenne franchit une limite de parcelle, et qu'un toit lu sur le LiDAR
  passe par-dessus, Plan ne sait pas s'il voit un seul toit ou deux maisons mitoyennes. Il le demande :
  « Un toit ou deux ? », avec le bâtiment sélectionné sur le plan, les deux parcelles et leurs parts.
  « Un seul toit » garde le toit lu ; « Un toit par parcelle » relit un toit de chaque côté, arrêté à
  la limite. La réponse est mémorisée et réappliquée aux actualisations ; Ctrl+Z la défait ; Échap
  remet la question à la prochaine ouverture.

- **Les toits du voisinage en corps et pignons** (`MD/spec-toit-ign.md` §13.6) : une case « Toits en
  corps et pignons », cochée par défaut, dans la section « Voisinage (3D) ». À l'import et à
  l'actualisation IGN, les maisons voisines reçoivent elles aussi leurs corps, faîtages et pignons
  reconstruits sur le LiDAR : le calcul entier sur les parcelles mitoyennes (avec leur carte des
  hauteurs), une version allégée, dix fois plus rapide et sans garder la grille, au-delà ; un toit
  voisin sans corps lisibles (sous les arbres) garde sa forme simple ; décochée, la 3D revient aux
  formes simples.

- **La Vue 3D cadre par défaut la parcelle du projet et ses mitoyennes** (`model/mitoyennete.ts`) :
  avec un voisinage importé de 100 m, la caméra reculait au point de ne plus voir la maison ; elle
  se pose désormais au plus près de ce qui compte, la vue plongeante prise en compte, et le reste du
  voisinage se voit en reculant.

- **Les toits à croupes, et les maisons au contour de biais ou décalé** (`MD/spec-toit-ign.md`
  §13.7). Une maison dont le contour BD TOPO a un côté de biais n'avait pas de corps : la 3D
  montrait alors la surface brute du LiDAR. Son contour est maintenant mis à l'équerre (le biais
  devient une marche, au droit d'un autre sommet), coupé en tranches, et chaque tranche est lue par
  l'ajustement des formes simples, qui sait les **croupes** : deux pans, quatre pans, appentis,
  plat. En 3D, le bâtiment garde exactement la forme du plan, ses toits découpés sur lui. Un
  bâtiment dont le contour tombe à côté de son toit (plus de 12 % de non bâti dessous) est
  **recalé d'un bloc** sur le LiDAR, sur le plan comme en 3D, sans changer sa forme. Au 2 allée des
  Limites, parcelle AE 103 : deux toits à quatre pans (7,9 m et 6,3 m) et un toit plat à 3,5 m
  entre eux, la maison recalée d'un mètre vers l'ouest et de 1,75 m vers le sud. Les contours qui
  se découpaient déjà gardent leurs corps au centimètre près (AE 101, vérifié sur le relevé réel).

### Modifié

- **Les maisons voisines sortent de l'audit de la parcelle** (`MD/spec-audit.md` §12.1). La liste, le
  compteur, « Ce qui manque », la reconnaissance et l'analyse de Claude ne regardent plus que les
  bâtiments de la parcelle du projet ; la section « Bâtiments voisins, facultatif » disparaît. Les
  maisons voisines restent dans la scène comme obstacles à la vue. Une photo rangée chez un voisin par un
  ancien brouillon n'entre plus dans l'analyse.
- **Le rendu que Claude reçoit montre la façade entière**, du pied du mur au haut du pignon ou du pan
  (`three/renduPrise.ts`). Il était pris depuis la position de la photo, à 1,5 m, dans l'axe du
  téléphone : trop zoomé, il coupait le haut du mur et le toit. La caméra reste du même côté que la
  photo et recule (45 m au plus) jusqu'à ce que les quatre coins tiennent dans l'image ; la
  consigne de l'analyse (`deploy/prompt-analyse.md`) le dit, et précise que le rendu ne montre que les
  bâtiments de la parcelle et le sol (la scène épurée de l'audit : ni arbres, ni clôtures, ni voisins).
  `BANC_CLAUDE=1` les produit sur AE 101.
- **L'audit de la parcelle ne montre que le bâtiment** (`MD/spec-audit.md` §12.2 ; demande de
  l'utilisateur du 15 octobre, AE 101 au téléphone). Pendant tout l'audit, la Vue 3D est épurée : les
  bâtiments de la parcelle (et celui d'un mitoyen choisi dans sa ligne, le temps de le photographier)
  et le sol, avec les voiles rouge et vert des façades et votre position. Arbres, maisons voisines,
  clôtures de la parcelle et du voisinage, terrasse et objets d'échelle sont masqués, et reviennent à
  la fermeture de l'audit (`three/scene.ts::epurerVue3d`, un simple drapeau d'affichage : ni « projet
  modifié », ni Ctrl+Z, le projet n'est pas touché). Le doigt ne touche plus un objet masqué.
- **Une vue d'ensemble en grand angle pour choisir une façade** (`app/audit/parcelle/vuePrise.ts`).
  Tant que rien n'est visé depuis votre position (position en attente ou refusée, aucune façade
  devant vous), la Vue 3D montre tout le bâtiment audité, d'un peu haut, en grand angle (60°), dans ce
  que l'écran de prise laisse voir : chaque façade s'y touche. Ni la boussole ni le toucher ne la
  déplacent ensuite ; le doigt la tourne librement. La vue à hauteur d'homme reste celle de la prise
  (une position et une façade visée) : son champ s'élargit jusqu'à 75° pour que la façade visée y
  tienne en entier, et elle regarde la façade choisie, ou celle à laquelle vous tournez le dos. Une
  façade reconnue qui se perd garde cette vue 2,5 s, pour ne pas sauter à chaque pas. Une façade
  choisie sans position ne se montre plus depuis 8 m devant elle, trop près : la vue d'ensemble se
  tourne vers elle.
- **De près, le trait de la façade se renforce** (`three/traitDePres.ts`, `MD/spec-audit.md` §12.2 ;
  demande de l'utilisateur du 15 octobre). Pendant la prise, à moins de 4 m de la façade visée (ou
  quand elle déborde du champ le plus large), les arêtes du bâtiment visé (angles, bas et haut des
  murs, contours des ouvertures, rives et faîtage) se dessinent en traits épais et sombres, par-dessus
  le voile rouge ou vert sans le cacher ; le trait s'atténue en reculant et disparaît à 9 m. Couleur
  par le jeton `--trait-3d` (clair et sombre, modèles de palette compris) ; épaisseur en pixels par
  les lignes épaisses de three.js r128, chargées à la demande, un trait fin hors ligne. Jamais exporté.
- **Toutes les données du serveur dans `data/`, à côté de `public_html/`** (`deploy/donnees.php`,
  `buildsg/donnees.mjs` ; `MD/spec-demos-admin.md`). Démos (`data/demo/`, celles de la vitrine
  `?mode=demo` comprises), réglages de l'admin (`data/admin/` : palette, contrôleurs, échecs de
  connexion), journal et réglages de Claude (`data/claude/`), audits (`data/audits/`), conformité
  (`data/conformite/`) : un seul dossier, hors de la racine web, réglé par `dossierDonnees` (Node :
  `DATA_DIR`). Chaque audit a son dossier, classé pour s'y retrouver à la main :
  `data/audits/parcelle/<IDU>/<id>/` et `data/audits/promenade/<commune>/<id>/` (fichier tel qu'il est
  arrivé, fiche, conclusion lisible, analyses, images), avec un index qui se reconstruit. Une
  configuration d'avant (`dossierDemos` seul) garde l'ancienne disposition ; avec `dossierDonnees`,
  l'ancien `plan-demos/` est déplacé dans `data/` au premier passage, sans rien écraser
  (`data/migration.json`), et les audits rangés à plat sont classés. La livraison porte `data/demo/`
  et `donnees.php` ; la notice dit la marche à suivre (étape 2.e).
- **La fumée pilotée va plus vite et se règle** (`scripts/fumee.mjs`). Les parties se jouent à
  plusieurs à la fois (`FUMEE_PARALLELE`, par défaut une par tranche de quatre cœurs, quatre au plus) ; un passage
  peut se limiter à des classes d'écran et des thèmes (`FUMEE_CLASSES=large`, `FUMEE_THEMES=light`).
  Les longues attentes fixes (20 s, 18 s, 8 s, 3,5 s, 2,5 s) attendent désormais ce qu'elles
  attendaient : le voisinage importé, les tuiles posées, le zonage rangé, l'image 3D immobile.
- **Les points 12 à 15 de la fumée rejouent des données témoin sans réseau**
  (`scripts/fumee-reseau.mjs`, `tests/fixtures/fumee-reseau/`) : quand `data.geopf.fr` ne répond
  pas, les réponses enregistrées de la BAN, d'`apicarto` et de la Géoplateforme sont servies à sa
  place. `FUMEE_RESEAU=temoin|direct|enregistrer` force le mode. Le rejeu est fidèle à ce que le
  navigateur a reçu : l'enregistrement écoute sans intercepter, les échecs et l'autorisation CORS se
  rejouent tels quels, chaque réponse arrive après sa durée enregistrée (`FUMEE_LATENCE=0` l'ignore),
  et une requête sans témoin part sur le vrai réseau au lieu d'être inventée. Sans cela, la démo
  recevait en mode témoin des tuiles que l'IGN lui refuse, et le .glb du point 24 s'écartait du golden.
- **Un export .glb n'est plus disputé par le rendu** (`three/exportGlb.ts`) : la boucle d'animation de
  la Vue 3D se tait le temps de l'export. Sur un appareil lent, l'exporteur manquait son délai.
- **L'analyse des audits, le renfort des façades et l'aide immédiate passent par défaut au modèle
  plus fin (Sonnet)** au lieu du modèle rapide (Haiku), qui ne trouvait rien sur les photos d'un vrai
  audit (`MD/spec-audit.md` §13.2). L'escalade reste au plus fin des modèles admis, les cas candidats
  au modèle rapide. Le coût d'une parcelle passe de 1 à 2 centimes à **20 à 40 centimes** environ :
  les plafonds par défaut (1 $ par jour, 10 $ par mois) et l'estimation par requête sont à relever dans
  « Réglages ». L'administrateur peut revenir au modèle rapide usage par usage. *Défaut abandonné
  le 15 octobre 2026, voir l'entrée suivante.*
- **Tous les usages de l'analyse par Claude repassent par défaut au modèle rapide (Haiku)**
  (décision de l'utilisateur, 15 octobre 2026) : analyse des audits, escalade, renfort des façades,
  aide immédiate et cas candidats (`MODELE_PAR_USAGE` de `deploy/analyse.php` et
  `buildsg/analyseAdmin.mjs`). Le « rien trouvé » des audits venait du schéma que l'API refusait, pas
  du modèle (voir « Corrigé »). Le coût d'une parcelle revient à 1 à 2 centimes environ, dans les
  plafonds par défaut. L'administrateur passe un usage au modèle plus fin (Sonnet) dans « Réglages »
  › « Modèles » s'il le faut ; un réglage déjà posé garde son choix.

- **Audit de la parcelle, « Photographier en marchant »** (`MD/spec-audit.md` §12.2, demande de
  l'utilisateur) :
  - **Vue 3D qui suit** : la vue est à hauteur d'homme (1,7 m), 6 m derrière vous, le regard un peu
    vers le haut pour voir la façade entière. Elle suit votre position et votre cap : ce n'est plus
    une image fixe. Un doigt qui la fait tourner la garde 6 s, puis le suivi reprend.
  - **Façade visée en rouge** ; les façades déjà photographiées passent au vert. Elles restent
    reconnues et touchables, pour refaire une prise.
  - **Toucher une façade dans la Vue 3D la choisit** quand l'automatisme se trompe. Les messages
    sans position le proposent.
  - La promenade d'audit garde l'ambre pour la façade devant vous : son rouge est celui des
    bâtiments marqués.

- **Détection des ouvertures : les candidats** (lot L14 du plan de mise en œuvre,
  `MD/spec-facades-calage-detection.md` §9). L'écart à une seule teinte de mur ne suffisait pas : un
  soubassement en pierre, l'ombre du débord, des volets battants, la brique ou la meulière faisaient
  manquer des baies ou en inventaient. Sur le banc des façades, chaîne du relevé : rappel de 71 à
  90 %, précision de 84 à 93 %, corrections de 3,2 à 1,9 par façade ; les images d'origine restent
  justes au centimètre.
  - **Fond local** (`facade/detectionFond.ts`) : les objets nets mis de côté, un fond de rang (une
    bande de 50 cm sur toute la largeur : soubassement, bandeau, ombre du débord deviennent le fond de
    leur rang), puis un fond local par médiane glissante sur 1,5 m de large ; le seuil
    `max(28, 3 × écart médian)` se calcule zone par zone, et l'écart de teinte seule (chromaticité) a
    le sien, pour la pierre dont le grain relève le seuil.
  - **Filtre d'ombre** : un pixel plus sombre que son fond, de même chromaticité, n'est pas une baie ;
    une tache qui n'est qu'ombre n'est gardée que si ses tableaux sont des arêtes franches.
  - **Profils de contours** (`facade/detectionIndices.ts`) : soutien des arêtes sur les quatre côtés,
    baie séparée de ses volets battants par le profil de ses colonnes, affinage des bords sur le profil
    quand l'écart au fond ne dit rien.
  - **Fusion des indices et confiance** : une tache est gardée si elle remplit sa boîte, ou si ses
    quatre arêtes sont nettes ; sous 0,4 m², il faut les arêtes. La confiance de chaque ouverture
    combine remplissage, rectangularité, soutien des arêtes et part vue sur la photo.
  - **Réglages nommés** (`facade/reglagesDetection.ts`) : les filtres de taille et les seuils
    deviennent `facades.detection.*`, chacun avec sa raison, surchargeables pour le banc.

- **La grille du plan est masquée par défaut.** Le bouton « Grille » (menu Affichage) la montre, et
  le choix s'enregistre avec le projet. Un projet qui l'avait affichée en l'enregistrant la retrouve.

- **Vue 3D : le zoom suit la règle du plan 2D.** Chaque mouvement de molette rapproche ou éloigne
  du même rapport que sur le plan, quelle que soit sa taille. Au pavé tactile et à la souris à
  défilement libre, le zoom faiblissait à chaque pas (les petits pas de fin de geste ne zoomaient
  presque plus) ; un seul geste traverse maintenant le voisinage. Un clic sur + ou − divise ou
  double la distance (×0,8 et ×1,25 auparavant), et le pincement à deux doigts zoome deux fois plus.
  Le zoom arrière s'arrête avant que la scène ne sorte du champ.

- **Le rayon du voisinage va jusqu'à 1,5 km** (5 km auparavant), à la création d'un projet depuis
  une adresse comme à l'actualisation d'un projet existant. Au-delà, le plan, la Vue 3D et
  l'enregistrement s'alourdissaient pour un voisinage qu'on ne regarde pas ; à 1,5 km, le plafond de
  20 000 objets par famille ne joue plus que dans une ville très dense.

- **Vue 3D : la molette zoome vers ce que montre le curseur.** Elle rapprochait toujours du centre
  de la parcelle : sur un grand voisinage, impossible d'aller voir une maison au loin, et l'on finissait
  dans la pelouse du centre. Le point visé (un toit, un mur, le sol) reste maintenant sous le curseur ;
  on ne s'en approche pas à moins de 50 cm. Le centre de rotation reste au niveau du sol. Les boutons
  + et − et le pincement à deux doigts ne changent pas.

- **Le voisinage d'un import va jusqu'à 20 000 parcelles et autant de bâtiments** (10 000
  auparavant), les plus proches d'abord : sur un grand rayon en ville, il s'arrêtait avant le rayon
  demandé. Mesuré au Vésinet sur 2 km : 12 315 parcelles et 15 448 bâtiments, tout le disque, compte
  en 30 à 40 secondes, projet créé en 1 minute 40, 23,6 Mo avant la lecture des toits (environ 30 Mo
  une fois tous lus, sous la limite de 50 Mo de la plateforme). L'affichage et la Vue 3D sont plus
  lents sur un tel voisinage.

- **La lecture de fond s'efface devant vous.** Plan mesure en continu à quel point l'écran est
  occupé. Pendant que vous travaillez (un geste depuis moins d'une seconde et demie), une seule
  lecture de toit à la fois, avec au moins une image entre deux bâtiments. Au repos, la lecture
  reprend toute sa vitesse, et ralentit d'elle-même sur un poste lent ou quand la Vue 3D est chargée.
  L'enregistrement automatique attend que vous ayez fini votre geste.

- **Le zoom et le déplacement restent fluides sur un grand voisinage.** Pendant le geste, le plan
  déjà dessiné suit la molette ou les doigts ; il est redessiné au propre dès que vous vous arrêtez.
  Sur un voisinage d'un kilomètre (9 000 objets), une image sur vingt prenait plus de 3 secondes
  pendant un zoom ; elle en prend 33 millisecondes. Les objets hors de la vue et les poignées des
  objets non sélectionnés ne sont plus dessinés.

- **Sur grand écran, le plan prend toute la largeur libre.** Sa largeur est celle que la palette,
  l'explorateur et l'inspecteur laissent, mesurée, sans plafond à 1 600 pixels ; elle suit le
  redimensionnement de la fenêtre et l'ouverture ou la fermeture des panneaux. La marge autour de la
  parcelle à l'ouverture est proportionnée à la taille du plan.

- **Les toits du voisinage se lisent quatre fois plus vite en tâche de fond.** Sur un voisinage d'un
  kilomètre au Vésinet (5 240 bâtiments), forme et couleur sont lues en 9 minutes au lieu d'environ
  35. Chaque lecture prend le bâtiment suivant dès qu'elle a fini, sans attendre la plus lente d'un
  lot, et le plan se redessine toujours par paquets de 12. Quand la Géoplateforme répond qu'elle est
  trop sollicitée (quota par adresse IP), Plan attend le délai qu'elle demande et redemande, au lieu
  de mettre la lecture en pause 30 secondes.

- **Un projet avec un grand voisinage pèse environ 13 % de moins.** Les parcelles et bâtiments du
  voisinage n'écrivent plus les réglages d'un autre genre d'objet, posés par défaut à leur création
  (hauteur et couleur de clôture, hauteur de parasol, diamètre et couleur d'arbre), ni les attributs
  BD TOPO faux ; un corps de toit sans pignon n'écrit plus sa liste vide. Mesuré sur un voisinage d'un
  kilomètre : environ 1,3 Mo sur 9,8 Mo. Les projets d'avant se lisent comme avant.

- **Lecture des toits en tâche de fond, sans à-coups et presque deux fois plus rapide.** Mesuré sur
  un voisinage d'un kilomètre au Vésinet (5 240 bâtiments) : chaque lot redessinait tout le plan et
  toutes les zones, ce qui figeait l'écran 3 à 6 secondes et ramenait la lecture à 1,5 bâtiment par
  seconde. Seuls les bâtiments lus se redessinent maintenant, sur le plan et dans la Vue 3D (sans la
  rebâtir) ; la barre d'état et le menu suivent la progression sans redessiner le reste. L'écran ne
  se fige plus au-delà d'un à deux dixièmes de seconde (une seconde à chaque enregistrement
  automatique d'un projet de 9 Mo), et la lecture va à 2,5 bâtiments par seconde, couleurs comprises.

- **Vue 3D : l'heure et la date sous l'horloge, les réglages dans un tiroir.** Un clic sur
  l'horloge du canevas, maintenant toujours affichée, ouvre dessous le curseur d'heure et la date ; un
  second clic ou Échap les referme. Sur bureau, les autres réglages sont un tiroir replié sur une
  ligne de titre (« Réglages de la vue 3D ») ; ouvert, il glisse par-dessus le haut de la scène sans
  la redimensionner, et la scène gagne encore environ 90 px. Le cadre Terrasse (filaire, translucide,
  sol en coupe) ne s'affiche que si une terrasse est sélectionnée. Au doigt, la feuille des réglages
  garde ses thèmes.

- **Voisinage : jusqu'à 10 000 objets par famille** (parcelles, bâtiments…), au lieu de 2 000, les
  plus proches de la parcelle. La lecture prend au plus le double (20 000 entités par famille) pour
  garder les plus proches. Un plan aussi lourd s'affiche plus lentement et peut dépasser la taille
  qu'accepte la plateforme à l'enregistrement : l'avertissement du curseur le dit déjà.

- **Inspecteur : le titre nomme la fonction de l'objet** (« Bâtiment — Maison », pas « Polygone »).
  La ligne « Type » disparaît.

- **Vue 3D : les réglages tiennent sur une bande**, en quatre cadres par thème : Terrasse (filaire,
  translucide, sol en coupe), Scène (tous les objets, opaques, textures, ombres), Soleil, Points de
  vue. Le titre « Vue 3D » est retiré et « Plein écran » rejoint les boutons de caméra. Le détail de
  chaque case est dans son infobulle. La scène gagne environ 90 px de haut. Au doigt, la feuille
  des réglages garde les mêmes thèmes.

- **Affichage : l'entrée « Sections de l'inspecteur repliées » est retirée**. L'inspecteur ouvre
  toujours sa première section.

- **Voisinage masqué : tout le voisinage s'en va**. Les courbes de niveau et le sol 3D du paysage,
  les noms des rues (plan et 3D) et la photo du paysage suivent les parcelles et les bâtiments. Le
  sol 3D revient à la parcelle et à son calque.

- **« Actualiser le projet » recrée les bâtiments de la parcelle du projet.** Tous les bâtiments posés
  sur la parcelle, importés ou dessinés à la main, sont supprimés puis recréés depuis la BD TOPO, comme
  à un import d'aujourd'hui : contour, nom, hauteur, apparence, toit relu sur le LiDAR, couleur des
  murs. Un voisin que la BD TOPO rattache désormais à la parcelle devient l'un d'eux. La réponse à la
  question du toit à cheval suit le bâtiment. Si la BD TOPO ne répond pas, les bâtiments restent tels
  quels. Le dialogue l'annonce en premier, et Ctrl+Z rend le projet d'avant.

- **Voisinage étendu jusqu'à 5 km** (au lieu de 1 km), à l'import depuis une adresse comme à
  l'actualisation. Le disque se lit par paliers (200 m, 500 m, 1 km, 2 km, 5 km).
  - Au-delà d'un kilomètre, chaque famille (parcelles, bâtiments, végétation) se lit en disques
    croissants et s'arrête au premier qui atteint le plafond de 2 000 objets : on garde les plus
    proches, sans trou près de la parcelle.
  - **Le relief du paysage va jusqu'au rayon choisi**, même là où les objets se sont arrêtés au
    plafond. Une relecture du relief garde cet horizon. Cinq kilomètres tiennent au pas de 20 m sous
    le plafond de 400 000 points.
  - La Vue 3D voit le paysage jusqu'à son coin opposé : le plan lointain de la caméra suit le relief,
    plus seulement les parcelles affichées.
  - Au-delà d'un kilomètre, la note sous le curseur le dit.
  - Essai réel à Peyrusse-le-Roc à 5 km : 2 000 parcelles (jusqu'à 1,5 km environ), 2 000 bâtiments
    (jusqu'à presque 5 km), un relief de 501 × 501 points au pas de 20 m, en 45 s ; le fichier pèse
    7,3 Mo.

- **La démo (`1.json` et le projet de démonstration de l'application) est actualisée** comme l'est un
  projet par « Fichier › Actualiser le projet », et son voisinage est étendu à 100 m : 147 objets, dont
  112 parcelles et bâtiments voisins (56 avec leurs toits en corps), le relief LiDAR au pas de 0,5 m sur
  la parcelle et un maillage secondaire au pas de 2 m alentour, le gazon et les couleurs d'import par
  défaut. Les objets dessinés sont inchangés. Le chiffrage de la terrasse de la démo tient maintenant
  compte du relief (lambourdes 94 ml au lieu de 93, lames 269,4 ml au lieu de 267,5). Le témoin figé des
  empreintes (`DEMO_TEMOIN_OBJECTS`) ne bouge pas : `tests/fixtures/golden/` reste identique.

- **Relief : une grille fine sur la parcelle, un maillage secondaire pour le voisinage**
  (`geo/relief.ts`, `three/relief3d.ts`, `MD/spec-relief.md` §3.1). Avec « relief sur toutes les
  parcelles », la parcelle garde sa grille à son pas fin (0,5 m en LiDAR HD) au lieu de partager le pas
  du voisinage (5 m à Peyrusse-le-Roc) : la pente, le dénivelé et les hauteurs de plots restent
  précis. Le voisinage est lu dans une seconde grille, plus large, qui ne porte que le sol de la Vue 3D
  et les courbes du plan au-delà de la parcelle. Dans la section Relief de l'inspecteur, « Maillage
  secondaire » dit s'il est actif, avec son pas et son nombre de points ; la ligne « Grille » donne
  toujours le nombre de points ; « Points max » règle le plafond de points de chaque grille, appliqué
  à « Actualiser le relief » et à l'actualisation IGN. Le message d'un projet refusé pour sa taille
  propose de baisser « Points max ».

- **Relief sur un grand voisinage** (`model/relief.ts`, `MD/spec-relief.md` §3.1). La grille de relief
  monte à 400 000 points au lieu de 40 000, et son pas peut s'élargir jusqu'à 30 m au lieu de 5 m.
  Un voisinage de 500 m tient désormais au pas de 5 m : la vallée autour d'un village (Peyrusse-le-Roc)
  a son relief en 3D au lieu d'un sol plat. Au-delà de 30 m, la grille revient à la parcelle seule,
  comme avant au-delà de 5 m. Les grilles déjà enregistrées ne changent pas ; une nouvelle lecture
  d'une grande parcelle peut être plus fine qu'avant. La grille des hauteurs des toits garde son pas
  maximal de 5 m. Dans la section Relief de l'inspecteur, une ligne « Grille » dit le pas, le nombre de
  points, l'étendue couverte et la règle, et prévient quand le sol 3D est plat au-delà de la parcelle.

- **Inspecteur : une seule section ouverte à la fois** (`zones/Inspecteur.tsx`). Ouvrir une section
  replie les autres ; à l'ouverture, seule la première est dépliée (aucune avec la préférence
  « Sections de l'inspecteur repliées »). Le titre de l'inspecteur replie la section ouverte, ou
  rouvre la première. Passer d'un objet à l'autre garde la section laissée ouverte, ou ouvre la
  première de l'objet suivant s'il ne l'a pas.

- **Relief et courbes de niveau séparés** (`MD/spec-relief.md` §8). Le menu Affichage a maintenant
  deux entrées, « Relief » (le sol en relief de la Vue 3D) et « Courbes de niveau » (sur le plan), au
  lieu d'une bascule unique. La section « Relief » de l'inspecteur les présente dans le même ordre ;
  l'équidistance ne se montre qu'avec les courbes. Par défaut, le relief est montré et les courbes
  sont cachées. Le plan exporté (`plan.svg`) garde les courbes tant qu'elles n'ont pas été décochées
  explicitement : un export d'hier reste identique.

### Corrigé

- **Le rendu pour Claude ne dépend plus de l'inclinaison du capteur** (« le paramètre incliné ne
  fonctionne pas »). Cette inclinaison est celle que le capteur donne au retour de l'appareil photo,
  c'est-à-dire le téléphone retourné dans la main, pas au moment de la photo : elle n'est pas fiable
  (cause probable, non vérifiée sur un téléphone). L'inclinaison du rendu se déduit de la géométrie :
  la caméra vise le milieu de la façade, du pied du mur au haut du toit. La valeur du capteur reste
  notée avec la photo (« inclinée de … ° »), pour Claude comme avant.
- **L'écran des propositions de l'audit cachait la parcelle** (`zones/parcours/PropositionsAudit.tsx`,
  `MD/spec-audit.md` §14). Au doigt, une carte en bas haute au plus de 46 % de l'écran : le titre, le
  compte, « Avant / Après » et les boutons restent en place, la liste défile entre eux, et « Replier »
  la range. Sur un écran en largeur (bureau, tablette, téléphone couché), l'écran des propositions et
  celui de la prise deviennent un panneau à droite, qui ne couvre plus la barre du haut. La Vue 3D,
  épurée, cadre la parcelle et ses bâtiments dans ce que l'écran laisse voir (au-dessus d'une carte,
  à gauche d'un panneau).
- **Le plein écran de la Vue 3D laissait voir le titre de la parcelle à droite** (bureau). Le panneau
  plein écran gardait la largeur des panneaux (98 % de la fenêtre) : une bande restait à droite, où
  passait la fin du titre « Plan interactif — Parcelle … » et du lieu. Il couvre désormais toute la
  fenêtre, la visionneuse aussi, et la scène prend toute la hauteur sous le titre des réglages au lieu
  de laisser une bande vide en bas.
- **Le portail neuf se pose côté rue sur tous les chemins de création, plus sur un côté mitoyen**
  (AE 101, 2 allée des Limites : le portail tombait sur le côté de 39,5 m, mitoyen d'AE 100, au lieu
  de l'allée). Une seule règle (`geo/coteRue.ts::coteDuNouvelAcces`, `MD/spec-cloture.md` §2.1) sert
  désormais l'import, les boutons « Ajouter un portail / un portillon » et le portail vu sur place par
  l'audit de la parcelle : le côté dit sur rue ; sinon, parmi les côtés sans voisine, le plus proche
  du point d'adresse, puis celui que longe une rue lue (celle de l'adresse d'abord), puis le plus
  long ; sinon le plus long côté, comme avant, en évitant ceux dits séparatifs. Un côté est mitoyen
  dès 1 m de limite commune avec une voisine, ses coins mis à part (la règle de
  `model/mitoyennete.ts`) ; ce que vous avez dit d'un côté l'emporte. Trois chemins se trompaient :
  l'import depuis votre position, qui rangeait le point de l'appareil (dans le jardin) au lieu de
  celui de l'adresse la plus proche, et ignorait les mitoyennes non cochées ; l'audit de la parcelle,
  qui posait clôture et portail sur le plus long côté d'un projet sans portail ; le mode audit, sans
  voisines. L'explication du bouton dit le côté retenu et pourquoi. Un accès déjà posé ne bouge pas ;
  les empreintes ne changent pas.
- **Audit de la parcelle : l'analyse par Claude était refusée avant même de lire les photos**
  (AE 101, 15 octobre 2026 : « The compiled grammar is too large… » ; seules les mesures étaient
  proposées). Le schéma de la réponse partait en sortie structurée (`output_config.format`), que l'API
  compile en grammaire ; celle de l'analyse d'une maison dépasse sa limite, et chaque requête
  échouait. Le schéma part désormais à la suite du prompt, dans le même bloc en cache, et le serveur
  (`deploy/analyse.php`, `buildsg/analyseAdmin.mjs`, même règle) ramène la réponse à sa forme : le
  texte autour et un bloc de code sont laissés, les termes sont lus sans accents ni majuscules, un
  terme hors vocabulaire devient `indetermine`, un champ absent prend `indetermine` ou le vide de
  son type. Rien n'est inventé : un élément de liste à qui manque un nombre (numéro d'ouverture,
  cote, image) ou un terme sans `indetermine` est écarté, et une confiance absente est `faible`. La
  page reçoit la même forme qu'avant ; le renfort des façades suit la même voie. Les prompts passent
  en version 2 (le journal le dit pour chaque réponse). Relancer l'analyse d'un audit déjà fait.

- **Vue 3D, après le réalisme (R1 à R6) : les lames, le chemin, l'herbe et la promenade.**
  - *Les lames de la terrasse se voient à nouveau* (`three/scene.ts`, `ombrerSousLePlatelage`).
    L'éclairage par le ciel (R1) allumait les chants des lames, au fond des joints de 6 mm, aussi
    clair que leur dessus : le platelage se lisait comme une planche unie, avec un quadrillage pâle
    aux abouts. Les chants et la structure sous le platelage (solives, lambourdes, appuis) ne
    reçoivent plus qu'une petite part du ciel, comme en vrai. Réglage d'écran, absent du .glb.
  - *Le chemin passe au-dessus de la pelouse* (`three/primitives.ts`, `geometrieRubanDrape`). Sur un
    sol en relief, le ruban d'un chemin ne tenait le sol qu'à ses sommets, et ses triangles couraient
    sur plusieurs mètres : sur une bosse, l'herbe passait par-dessus. À l'écran, il est drapé sur le
    sol par mailles d'un demi-mètre, 2 cm au-dessus de l'herbe.
  - *Plus d'herbe dans la piscine, ni sous les objets* (`three/gazon.ts`, `empreintesAuSol` ;
    `model/fonctions.ts`, `occupeLeSol`). Le gazon de la parcelle passait sous tout et ne comptait
    que sur le tampon de gabarit pour s'effacer du bassin ; en qualité Soignée, l'occlusion rend la
    scène dans une cible sans gabarit, et la pelouse remplissait l'eau. Le gazon est maintenant
    percé de l'empreinte de chaque objet qui occupe le sol, par une seule règle : piscine (bassin,
    margelles, plage), terrasse, chemin, bâtiment, annexe, pergola, massif, dalle — pas l'arbre, le
    parasol ni le point de vue. Et la cible de l'occlusion garde son gabarit (`three/rendu.ts`) : le
    sol et la photo aérienne s'effacent aussi du bassin en Soignée.
  - *La promenade est plus longue et fait le tour de la maison* (`three/presentation.ts`). Chaque
    trajet durait 2,6 s, quelle que soit sa longueur : six points de vue faisaient vingt secondes.
    La caméra marche maintenant au pas (1,2 m/s, 4 s au moins par trajet, 2,5 s d'arrêt) ; après les
    points de vue enregistrés, elle fait le tour de la maison à hauteur d'homme au-dessus du sol en
    relief, à 3 m des murs (1,20 m au plus près), sans sortir de la parcelle ni entrer dans un autre
    bâtiment, le regard devant soi tourné vers la façade ; une maison collée à une limite est longée
    sur la part accessible. Entre deux points de vue que la ligne droite ferait passer à travers la
    maison, elle la contourne. La promenade marche aussi sans point de vue enregistré.
  - Aucun export ne change : le .glb garde le gazon entier et le ruban plat d'avant (ils ne partent
    plus qu'avec l'export, `EXPORT_SEULEMENT`), et les empreintes de `tests/fixtures/golden/` sont
    identiques. La marque `EXPORT_SEULEMENT` est retirée le temps de l'export : l'exporteur glTF
    écrit `userData` dans les `extras` des nœuds, et depuis les baies en creux (R2), le .glb d'un
    ordinateur portait dix-sept « exportSeulement » de plus que celui d'avant (comptes inchangés,
    580 octets de plus sur la démonstration).
- **Points 13, 14 et 15 de la fumée** : ils visaient une interface disparue (« Ajouter les parcelles
  adjacentes », `#pluInterrogerBtn`), et le 14 éteignait le fond orthophoto, allumé par défaut
  depuis la 2.2.0, en croyant l'allumer ; leur échec se confondait avec celui du réseau. Ils suivent
  la boîte « Actualiser depuis l'IGN » et la commande `plu.interroger` d'aujourd'hui, jouent sur les deux opacités de l'orthophoto, et comptent à
  part le voisinage dessiné (sur téléphone, une partie tombe hors du cadre).
- **Audit de la parcelle, l'analyse par Claude « ne trouvait rien »** (essai sur téléphone ;
  `MD/spec-audit.md` §13.2 et §14) :
  - **Ce que Claude voit sans que le projet sache l'écrire se lit enfin** : sous les propositions,
    bâtiment par bâtiment, en lignes d'information sans case (rien n'est écrit dans le projet) — la
    forme du toit vue face à celle du modèle, les pignons ou croupes aux bouts du faîtage, les
    lucarnes, les éléments (fenêtre de toit, garde-corps…), les volets et balcons de chaque façade,
    les ouvertures non détectées ou en trop, les écarts au modèle, et ce que le renfort a fait des
    ouvertures, par type (« 1 porte ajoutée, 1 fenêtre en pointillé »). Chaque ligne dit sur quelle
    image Claude l'a vue et la part des passes d'accord. Le vote les calculait puis les jetait.
  - **« Propositions de Claude prêtes » dit combien** : « 2 propositions et 7 observations », ou
    « Claude a répondu, mais n'a rien vu à proposer ni à signaler » au lieu d'un « prêtes » sur une
    liste vide.
  - **Le renfort des façades n'est plus perdu à la reprise d'un brouillon** : quand l'onglet est
    déchargé (le cas courant sur téléphone), le batch était souvent fini avant les mesures des
    photos, et un renfort vide restait noté pour toujours. Les réponses brutes du renfort sont
    gardées dans la capture, et chaque façade est recalée quand sa mesure est faite ; un brouillon
    déjà touché relit le batch au serveur une fois.
  - **Les ouvertures que Claude ajoute en pointillé sont proposées**, sur une ligne à part, décochée,
    qui dit « vue par Claude, non confirmée sur la photo » ; elles étaient calculées puis jamais
    montrées. Les baies devinées du relevé passent au renfort, qui les confirme au lieu d'en ajouter
    une seconde par-dessus.
  - **Plus de 40 images par requête, plus de batch refusé** : le serveur refuse toute la demande
    au-delà de 40 images ; la page s'arrête à 40 et garde d'abord l'orthophoto et la carte LiDAR, la
    meilleure photo de chaque façade (prise à la boussole) et son rendu, puis les autres. Un refus du
    serveur s'affiche avec son message (« Trop d'images dans une requête… ») au lieu de « répondu de
    travers ».
  - Le fichier de l'audit ne porte pas ces observations : son format n'a pas de place pour elles, et
    il n'a pas changé.

- **Audit de la parcelle, ce que l'essai sur le terrain d'AE 101 a montré** (`MD/spec-audit.md`
  §12.1 et §12.2) :
  - **La maison d'à côté n'est plus proposée** : la liste mettait votre maison et six mitoyens à
    égalité (33 façades, dont 19 chez les voisins). Seuls les bâtiments de la parcelle du projet
    comptent et sont reconnus ; les mitoyens sont rangés à part, repliés, facultatifs, et se
    photographient depuis leur ligne ou en touchant leur façade dans la Vue 3D.
  - **Les décrochés ne sont plus des façades** : les bouts de mur de moins de 1,5 m (14 « façades »
    pour la seule maison d'AE 101, dont des murs de 0,6 m) sont sur la photo du mur qu'ils décrochent.
  - **La position est lissée**, selon la précision annoncée par le GPS, et **ramenée sur la parcelle**
    quand elle tombe dans le jardin d'un voisin à portée de l'erreur.
  - **La boussole, téléphone debout** (Chrome Android) donne le cap de l'appareil photo, calculé sur
    les trois angles de l'orientation : le cap du haut du téléphone pouvait s'en écarter de plusieurs
    dizaines de degrés.
  - **La Vue 3D cadre la partie visible** au-dessus de l'écran de prise, qui cachait la moitié de la
    façade ; elle vise le milieu de la façade, ne recule plus au travers d'un mur ni derrière la
    clôture, et glisse d'une position à l'autre au lieu de sauter. Sans position encore, une façade
    choisie se montre depuis huit mètres devant elle.
  - **Le voile monte jusque sous le toit**, étage compris, et suit le haut du mur (une aile basse,
    puis l'étage). **Une façade photographiée est verte, même visée** : rouge sur vert donnait du
    brun ; le rouge ne dit plus que « à photographier ».

- **Audit de la parcelle, « Ce qui manque »** (lot G18 bis) : deux façades de même orientation
  (« façade est de Maison : pas de photo » deux fois, sur une maison en L) ne donnent plus deux
  lignes de même clé React. Chaque ligne a pour clé ce qui manque (bâtiment et côté pour une
  façade), et non son texte ; la console reste propre.
- **Déploiement SiteGround** (lot G18 bis) : `buildsg/` est resynchronisé par `npm run buildsg`.
  Son `htaccess.template` avait perdu les routes de l'analyse par Claude, des audits partagés et de
  la consommation, et le passage du jeton de la plateforme ; le prompt et le schéma de l'analyse
  étaient en retard. Un test (`tests/unit/buildsg/synchro.test.ts`) compare désormais chaque
  fichier de `deploy/` recopié dans `buildsg/deploy/` à son original.

- **Une baie posée sur une haie plus large qu'elle n'est plus lue « cintrée »** (lot G17). La
  détection prenait la tache en T (le haut plat de la haie, puis la fenêtre au-dessus) pour un arc :
  un arc ne fait de marche franche que tout près des tableaux (`facades.classement.cintreBordPart`,
  `cintreMarcheMaxPart`). Les faux « cintre » des scènes 07 et 17 du banc disparaissent ; aucune autre
  valeur du banc ne bouge, et les deux vraies baies de forme de la scène 20 restent lues.
- **Au téléphone, l'élévation du relevé garde sa hauteur quand la fiche d'une ouverture s'ouvre.**
  Elle se retrécissait dans la colonne qui défile jusqu'à zéro de haut : plus aucune ouverture ne se
  touchait sans refermer la fiche.

- **Sur tablette, les entrées du panneau Projet se touchent de nouveau.** Le voile transparent qui
  referme le panneau au toucher ailleurs passait au-dessus de lui : toucher « Actualiser le
  projet… » ou toute autre entrée refermait le panneau sans rien faire. La barre haute passe
  au-dessus du voile, comme au téléphone.

- **Relevé** : dans la colonne du relevé, le bandeau des photos et les choix segmentés ne se tassent
  plus quand la photo remplit l'écran (ils étaient écrasés à 1 440 px).
- **Relevé** : une photo déjà corrigée de la distorsion du grand-angle n'est plus corrigée une seconde
  fois quand la recherche des coins est relancée.

- **L'enregistrement ne fige plus l'écran sur un grand projet.** Sur un voisinage d'un kilomètre
  (8 Mo), chaque enregistrement bloquait l'interface en une tâche de 0,5 à 0,8 s, suivie de deux
  autres d'environ 0,2 s : le projet était sérialisé deux fois et écrit en texte deux fois, d'un
  seul tenant. Il l'est désormais une seule fois, par paquets de 400 objets, en rendant la main
  entre deux, et part tel quel au serveur. Il reste une seule tâche d'environ 0,1 s. Une
  modification faite pendant l'enregistrement laisse le projet « à enregistrer ».

- **Fumée pilotée : les gestes sur la terrasse de démonstration se rejouent.** La démonstration
  s'ouvre sur tout son voisinage, où les poignées se superposent : les points 1 à 5, 10 et 11
  échouaient dans les trois classes d'écran sans que l'application soit en cause. Le script cadre
  désormais l'objet visé, ou la parcelle quand le point vise deux objets (`scripts/fumee.mjs`). Le
  point 12 (import depuis une adresse) attend que la création se termine, 12 à 24 secondes avec la
  lecture des premiers toits, au lieu de relire l'état au bout de 5 secondes.

- **Après « Actualiser le projet » ou une actualisation IGN, l'écran se met à jour**. Le plan, la
  Vue 3D ouverte et la photo aérienne sont redessinés ; il fallait cliquer sur 2D ou 3D.

- **Un faîtage posé en travers du toit** (`facade/toitCorps.ts`, règle `GAIN_SENS`), vu sur AD 128 au
  Vésinet : deux pans sur la longueur, le toit relevé pour deux fenêtres d'étage. Le calcul des corps
  écartait ce qui dépasse le pan, prenait le vrai toit pour deux pignons et posait un toit écrasé à
  7,3 m en travers. Quand la lecture des formes voit le faîtage dans l'autre sens et explique
  nettement mieux la mesure, elle l'emporte : AD 128 a maintenant son faîtage à 8,9 m dans la
  longueur, au milieu, de près comme de loin (voisin complet ou allégé). Sur les villages de référence,
  deux ailes d'Hucqueliers et deux corps de Saint-Rémy changent aussi, rien à Gordes ; AE 101 ne bouge
  pas.

- **Toits en corps sur un contour de biais : plus de trous** (`three/toitCorps3d.ts`,
  `facade/toit.ts`), vus sur AE 103, le voisin d'AE 101.
  - Les croupes perdaient des morceaux : un sommet posé sur le contour sortait deux fois de la coupe,
    et la triangulation retirait alors un sommet au hasard. Le petit quatre-pans perdait 15 m² de
    toit ; on voyait le dessus du prisme à travers.
  - Entre un corps haut et un toit plus bas (le grand quatre-pans, égout à 4,9 m, contre la terrasse
    à 3,7 m), le mur manquait : on voyait le vide sous l'égout. Les murs entre corps montent
    maintenant de l'un à l'autre.
  - Sur les démos (56, 142 et 142 bâtiments en corps), AE 103 était le seul touché ; plus aucun pan
    incomplet.

- **Voisinage étendu : plus de bâtiment en double sur la parcelle du projet.** Le bâti posé sur la
  parcelle (importé avec elle ou dessiné) n'est plus repris comme voisin.
- **Actualisation : plus d'objets « absents » au-delà de 80 par couche.** La relecture de la BD TOPO
  pagine toujours ; un plan de 58 bâtiments voisins perdait les derniers à chaque actualisation.

- **« Impossible de créer le projet : Maximum call stack size exceeded »** avec un grand voisinage
  et le relief (2 allée des Limites, 490 m). Le maillage secondaire du relief dépassait 120 000
  points, et la plus petite altitude se cherchait par `Math.min(...valeurs)`, qui passe chaque valeur
  en argument et fait déborder la pile. Les minimums et maximums des grilles se cherchent maintenant
  par une boucle (`util/tableaux.ts`, `minimum`, `maximum`), comme le cadrage sur tout le plan.

- **« Utiliser ma position » à l'import** : le champ affichait « Position 48.904964, 2.132627 », que
  Rechercher ne comprenait pas. L'API Adresse (`api-adresse.data.gouv.fr`), dépréciée depuis le
  31 janvier 2026, refusait par intermittence le géocodage inverse au navigateur (pas d'en-tête CORS).
  L'adresse et la recherche passent désormais par le géocodage de la Géoplateforme
  (`data.geopf.fr/geocodage`), même format. Sans adresse connue, la parcelle se cherche quand même
  sous le point, et Rechercher comprend les coordonnées précédées d'un mot (« Position … »).

- **Les boutons « Relief » et « Courbes de niveau » sont enregistrés avec le projet**
  (`MD/spec-relief.md` §4). Ils restaient sans effet sur le fichier enregistré : en préférences
  d'affichage pures, ils ne marquaient pas le projet modifié, et le réglage se perdait si rien d'autre
  n'était enregistré. Ils marquent maintenant le projet à enregistrer (toujours sans Ctrl+Z, et
  permis en lecture seule, où rien n'est enregistré), comme l'équidistance. Les courbes de niveau
  ont aussi un liseré clair : sur la photo aérienne, le trait brun fin se perdait.

- **Plus de pignons en double sur les pavillons d'une longère** (`facade/toitCorps.ts`, Hucqueliers) :
  une aile presque entièrement sous un rectangle plus grand du contour n'est plus coupée en bandes de
  2 m aux pentes du toit qui la couvre, tant que son toit entier tient la mesure ; une bande de moins
  de 3 m recouverte à plus de 90 % par les autres corps est retirée. Sur quatre villages, 4 à 12 % de
  corps en moins, sans toit perdu. AE 101 est inchangé.

- **Un toit complété sur le contour ne déborde plus sur la cour ni sur une annexe** (`facade/toitCorps.ts`,
  village d'Hucqueliers) : un toit n'avance que sur une bande de bâtiment vraiment sans toit (10 % au
  moins), pas sur la lisière qu'une aile de biais laisse le long de sa voisine, suivie jusque-là sur 5 m
  avec un égout à −1,3 m ; il s'arrête avant qu'un égout ne passe sous 2 m, et ne couvre pas une partie
  mesurée à plus d'un mètre sous son égout (l'annexe basse d'une maison garde son appentis). AE 101 est
  inchangé.

- **Les toits de Provence** (`MD/spec-toit-ign.md` §13.7). Revue de trois quartiers : le centre ancien
  de Gordes, une entrée de ville de Saint-Rémy-de-Provence et un quartier d'Aix-en-Provence. Les
  maisons de village aux angles non droits, qui ne se découpent pas en rectangles, reçoivent un toit
  lu sur le rectangle qui les englobe et découpé sur leur contour. Le toit à un pan y est admis en
  dernier recours quand il explique nettement mieux la mesure qu'un toit à faîtage. Gordes : 52
  bâtiments sans toit construit avant, 13 après (dont 9 sans assez de mesures). Sans corps, la 3D
  montre désormais un toit construit plutôt que la surface brute du LiDAR (le château de Gordes
  n'est plus un relief en vagues) ; « Tel que mesuré » reste proposé. Un appentis n'a plus de pignon
  « depuis le faîtage ». AE 101 ne change pas.
- **Un toit n'est plus coupé en morceaux par la pente de ses pans** (`MD/spec-toit-ign.md` §13.2) :
  la coupe aux marches de hauteur prenait la pente forte d'un pan pour une marche. Le bloc principal
  d'AE 98 devenait un deux-pans à 8,4 m d'égout et un appentis de 2,3 m à pignon ; sa voisine
  mitoyenne, un pavillon coupé en trois bandes de 1,5 à 2,6 m. Un seul toit, lu par les formes
  simples sur le rectangle entier, l'emporte quand il explique la mesure presque aussi bien (et plus
  largement quand un morceau fait moins de 3 m de large). AE 98 : un deux-pans à 9,6 m et l'appentis
  de son annexe ; sa voisine, un deux-pans à 9,8 m. AE 101 ne change pas. Puis la règle passe à la
  continuité de la couverture : quand le saut au côté commun de deux blocs n'est que la pente d'un pan
  (moins de 60 cm d'une cellule à l'autre), c'est le même toit. Revue des 57 maisons du voisinage
  d'AE 101 : 117 corps avant, 105 après, plus de grand toit débité en bandes.
- **Les toits à un pan** (`MD/spec-toit-ign.md` §13.2) : la reconstruction lit deux pans, quatre
  pans, un pan et plat, à une seule règle pour ce qui est plat (moins de 30 cm de montée ou de 3°).
  Un appentis n'a plus de faux petit pan de 25 cm contre son mur haut. Un appentis de 6 à 10° n'est
  plus aplati par la lecture des formes simples (qui suivait la règle de la BD TOPO, plat sous 10°).
  Il déborde aussi au-delà de son mur haut. Et une maison que le modèle des corps ne lit pas garde
  la lecture des formes.
- **Les toits à quatre pans des maisons au contour droit** (`MD/spec-toit-ign.md` §13.2) : le modèle
  des corps n'a que des pignons de bout, et lisait un quatre-pans en appentis presque plat (AE 100 :
  5,5 m au lieu de 7,7 m). Chaque corps sans pignon est maintenant comparé à la lecture des formes
  simples, qui sait les croupes ; elle l'emporte quand elle explique la mesure nettement mieux
  (écart symétrique tombé aux quatre cinquièmes). AE 100 : quatre pans, faîtage 7,7 m, égouts
  4,6 m ; AE 101 ne change pas. Et un bâtiment dont toute la mesure est la cime d'un arbre (plus de
  3 m au-dessus de sa hauteur BD TOPO) ne garde ni surface mesurée ni hauteur tirée d'elle.
- **Plus de tour au milieu du voisinage** (`MD/spec-toit-ign.md` §13.6) : un abri de jardin de 11 m²
  (2,70 m dans la BD TOPO), à côté d'AE 101, était sous un grand arbre ; le LiDAR mesurait la cime,
  et ses corps montaient à 15 m. Un corps dont l'égout dépasse de plus de 3 m la hauteur BD TOPO du
  bâtiment est maintenant écarté : c'est un houppier, pas un toit. Sans corps restant, le bâtiment
  garde sa forme simple.
- **Plus de bout de maison sans toit le long d'un côté de biais** (`MD/spec-toit-ign.md` §13.7) : la
  marche qui remplace le biais laissait, d'un côté, un triangle du bâtiment qu'aucun corps ne
  couvrait (AE 103, à côté de l'aile à 6,3 m). Chaque corps s'étend maintenant jusqu'à couvrir ce que
  le contour a de libre, le plus haut d'abord, en gardant sa forme et ses pentes (le faîtage
  s'allonge, croupes et hauteurs restent) ; le dessin le découpe sur le contour.

- **Une roue d'attente au centre de l'écran** pendant la création d'un plan depuis une adresse et
  pendant l'actualisation IGN, avec l'étape en cours (« Forme des toits sur le LiDAR HD… »,
  « Actualisation IGN : la couleur des toits sur l'orthophoto… ») : ces travaux durent plusieurs
  dizaines de secondes, et rien ne disait qu'ils avançaient une fois le dialogue refermé. Elle ne
  bloque rien (le pointeur la traverse) et ne tourne pas quand le système demande moins de
  mouvement (`shell/attente.ts`, `zones/Attente.tsx`).
- **Corps et pignons, reconstruits sur le LiDAR** (`MD/spec-toit-ign.md` §13), le nouveau toit par
  défaut des bâtiments de la parcelle du projet : la surface mesurée est lue comme un couvreur la
  lirait — des corps (coupés aux marches de la couverture, dès 80 cm, et là où deux toits expliquent
  nettement mieux la mesure qu'un seul), chacun son faîtage placé où la mesure le met, deux pans qui
  ont chacun leur égout aux hauteurs de leurs murs, et les **pignons qui partent du faîtage** pour
  venir dresser leur triangle sur la façade. Au 2 allée des Limites : un corps principal à 7,6 m et
  ses deux pignons sur la façade sud-est, l'annexe à 4,3 m, l'aile à 4,5 m. Le grand pan est entaillé
  le long des noues des pignons ; les débords n'existent que sur les façades ; les fenêtres suivent
  la hauteur de chaque mur, avec une fenêtre dans chaque pignon. « Tel que mesuré » reste proposé.
- **La carte des hauteurs** dans la section « Façades et toit », sous « Toit en 3D » : ce que le
  LiDAR a vu, du bleu au rouge, dans l'axe du bâtiment, et par-dessus les corps, leurs faîtages et
  les pignons, avec une légende.

- **Le toit tel que le LiDAR le mesure** (`MD/spec-toit-ign.md` §12) : pour les bâtiments de la
  parcelle du projet, la grille du MNH LiDAR HD (50 cm) est gardée, nettoyée des arbres, des
  cheminées et des trous, et la Vue 3D la dessine en surface, posée sur les murs à l'égout de chaque
  corps, avec une rehausse en couleur de mur là où un pignon ou un dessus plat monte au-dessus de
  l'égout. Un toit compliqué — un pan raide et un dessus presque plat, une aile basse à un pan, un
  faîtage décentré — ressemble enfin à la maison. Les formes simples restent pour le voisinage et
  comme repli sans LiDAR. Le bilan de l'import les compte (« gardé(s) tel(s) que mesuré(s) »).
- **Un toit par corps de bâtiment** (§11) : sur la parcelle du projet, un contour en L, en T ou en U
  est découpé en corps (rectangles maximaux, à l'équerre, décrochés de moins de 1,2 m lissés),
  chacun son toit simple, son égout et son débord ; après la lecture LiDAR, chaque corps est ajusté
  sur les mesures qui tombent dedans. Sans LiDAR, c'est ce que la 3D montre par défaut.
- **Des blocs par les hauteurs mesurées, et des murs qui n'ont pas tous la même hauteur** (§11.2) :
  avec la surface LiDAR, chaque rectangle — même le seul d'une maison rectangulaire — est recoupé
  là où la couverture fait une marche d'au moins 1,5 m (un corps à deux niveaux et une annexe à un
  seul, un toit-terrasse accolé à un toit en pente), et chaque bloc prend l'égout et la hauteur de
  chacun de ses murs là où la couverture le rejoint. Les fenêtres montent avec leur mur : deux rangs
  sur le mur qui va jusqu'au dessus plat, un seul sous le pan ; l'inspecteur dit « murs de 3,9 à
  7,2 m ». La surface mesurée est ombrée par facettes : un pignon qui avance depuis le faîtage se
  lit comme des pans, non comme une bosse.
- **« Toit en 3D »** dans la section « Façades et toit » de l'inspecteur : « Tel que mesuré
  (LiDAR) », « Un toit par corps », « Un seul toit » — avec une ligne qui décrit la mesure (égout,
  faîte, grille) ou chaque corps. Les réglages du toit unique ne se montrent qu'en « Un seul toit ».

- **Nom des rues** (`MD/spec-rues.md`) : une case « Nom des rues » dans la section « Voisinage
  (3D) » de la parcelle. Cochée, le nom des rues voisines s'écrit le long de chaque voie sur le plan,
  et au sol de la Vue 3D. La première fois, les rues sont lues à l'IGN (BD TOPO, noms de la Base
  Adresse Nationale, 250 m autour de la parcelle) et enregistrées dans le projet, en un pas
  annulable ; « Relire les rues (IGN) » les met à jour. Le nom se pose au milieu de ce qu'on voit de
  la rue, jamais la tête en bas.

- **Arbres : des feuilles de près.** Quand la caméra approche d'un arbre (moins de 30 m), de petites
  feuilles couvrent son houppier — des aiguilles sur un conifère —, chacune son orientation et sa
  nuance, en une seule maille instanciée par arbre ; elles tombent avec le feuillage d'un caduc en
  hiver et ne changent pas l'ombre. À l'export GLB, que la version de three.js en place ne sait pas
  écrire en instances, elles sont converties en maille ordinaire pour les arbres proches du centre
  (12 000 feuilles au plus) : la visionneuse et la réalité augmentée les montrent aussi
  (`MD/spec-arbres-3d.md` §3.1).

- **Des arbres qui ressemblent à des arbres en 3D** (`MD/spec-arbres-3d.md`) : un tronc conique,
  des branches, un houppier en lobes selon le **port** (rond, étalé, colonnaire, conique,
  parasol), coloré en deux tons, propre à chaque arbre et stable d'une ouverture à l'autre ; une
  **essence** caduque ou persistante — un caduc est nu de novembre à mars, à la date de l'étude
  d'ensoleillement, et son ombre sur la terrasse change avec la saison. Rien n'est chargé, l'export
  GLB et la réalité augmentée emportent l'arbre tel qu'il est vu. Les arbres importés de la BD TOPO
  reçoivent port et essence d'après la nature de la zone (conifères en cônes persistants). Section
  « Arbre » de l'inspecteur : Port et Essence.

- **Relevé de façade : trois méthodes, expliquées.** Après le choix du mur, une étape « Choisir la
  méthode » présente, en deux phrases chacune, la **photo de rue** (Panoramax : des photos libres
  prises depuis la rue par OpenStreetMap France et l'IGN, cherchées autour du mur, les plus proches
  et les plus de face d'abord ; un panoramique est recadré sur le mur ; la distance au mur vient de
  la position de la photo), la **caméra guidée** (comme avant) et l'**import d'une photo** déjà
  prise. Au téléphone, la **boussole** propose le mur qu'on a devant soi sur l'écran du choix du mur
  (`MD/spec-releve-facade.md` §4.2 et §4.3).

- **« Voir chez vous (réalité augmentée) »** dans la visionneuse GLB : le modèle 3D de la terrasse
  se pose grandeur nature dans l'image de la caméra d'un téléphone ou d'une tablette — dans la page
  sur Android (Chrome), dans Quick Look sur iPhone et iPad (Safari). Rien n'est téléversé : le
  modèle reste dans le navigateur. Sur un ordinateur, le modèle se montre et le conseil dit sur quoi
  l'ouvrir (`MD/spec-ar.md`).

- **Un ouvrage neuf naît là où on le construirait**, plus au centre de la parcelle : la terrasse
  contre la façade au soleil de la maison, la pergola et le parasol sur la terrasse (sinon là où elle
  irait), la piscine au jardin (à 3 m des limites, hors de l'ombre de la maison, au sud), le carport
  près de la rue. La place libre la plus proche est prise ensuite, comme avant. Sans maison ni rue
  connue, le centre de la parcelle vaut toujours (`MD/spec-placement.md`).

- **Le portail se pose côté rue, deviné.** Quand aucun côté n'est dit sur rue, le plan devine le
  côté rue : le plus proche du point d'adresse (posé sur la voirie devant la porte), sinon le plus
  long des côtés sans parcelle voisine accolée. Le bouton « Ajouter un portail » dit quel côté il
  retient, et le champ « Limite » d'un côté non précisé note ce que le plan devine
  (`MD/spec-cloture.md` §2.1).

- **« Voisinage (3D) » : un groupe de réglages sur la parcelle du projet** (inspecteur, section
  repliée) qui rassemble tout ce qui décide de l'apparence des maisons voisines dans la Vue 3D :
  les **murs** (couleur du plan, une couleur, ou une nuance tirée au hasard entre deux ou trois couleurs
  pour casser l'uniformité),
  les **vitres** (une couleur, ou une nuance entre deux), les **fenêtres** (largeur, hauteur et
  entraxe, chacun entre un minimum et un maximum tirés par maison), et les **clôtures du voisinage**
  (afficher, type palissade / grillage / haie / mur, couleur). La case « Clôtures du voisinage » des
  réglages de la Vue 3D a rejoint ce groupe. Préférences d'affichage, enregistrées avec le projet ;
  rien n'est écrit sur les parcelles voisines. Les défauts sont le rendu d'avant
  (`MD/spec-toit-ign.md` §6.4).

- **« Fenêtres (3D) » sur un bâtiment du projet** : la section règle les fenêtres que la Vue 3D
  dessine sur les murs sans relevé de façade. « Toutes pareilles » : largeur, hauteur, hauteur
  d'appui, entraxe et couleur des vitres, communs. « Une par une » : la liste part de la disposition
  automatique, et chaque fenêtre ou porte se déplace sur son mur, se taille, change de mur ; on en
  ajoute, on en supprime, on revient à l'automatique. Ces réglages écrivent le projet (Ctrl+Z) et se
  retrouvent dans l'export GLB (`MD/spec-toit-ign.md` §6.3).

- **« Clôtures du voisinage » dans les réglages de la Vue 3D**, cochée par défaut. Elle
  pose un grillage léger et translucide sur les limites des parcelles voisines, pour situer le projet
  dans sa rue : chaque limite une fois, pas sur la limite commune avec la parcelle du projet quand
  elle a sa clôture, en suivant le relief. Préférence d'affichage seulement : rien n'est écrit sur les
  parcelles voisines ; décochée, le grillage disparaît (`MD/spec-cloture.md` §4.1).

- **L'import depuis une adresse part de votre position.** À l'ouverture du dialogue, Plan demande
  la position de l'appareil (le navigateur demande la permission la première fois). Précise à 50 m
  près, elle désigne la parcelle sous vos pieds : l'adresse la plus proche s'écrit dans le champ et
  la parcelle est cherchée sous le point GPS, pas sous le point d'adresse posé sur la voirie. Moins
  précise (un ordinateur situé par son réseau), l'adresse est seulement proposée, à vérifier. Un
  refus reste silencieux ; une adresse tapée entre-temps a la priorité. Le bouton « Utiliser ma
  position » relance la lecture à tout moment. Le serveur autorise désormais la géolocalisation au
  site lui-même (`Permissions-Policy: geolocation=(self)`, `.htaccess` et serveur Node).

- **La forme des toits mesurée sur le LiDAR HD de l'IGN.** À l'import depuis une adresse et à
  l'actualisation IGN, après la couleur des toits, Plan lit le modèle numérique de hauteur (MNH,
  grille de 50 cm) sous chaque bâtiment et y ajuste la forme qui l'explique le mieux : toit plat,
  croupes, deux pans ou quatre pans, dans l'axe du plus long mur ou en travers — avec la hauteur du
  faîtage et celle de l'égout mesurées, là où la BD TOPO les devinait à un mètre près et ne
  connaissait pas les pignons. Un arbre ou une cheminée qui déborde sur le toit est écarté ; un toit
  que rien de simple n'explique garde sa forme BD TOPO. Les bâtiments les plus proches de la
  parcelle d'abord (150 au plus, 20 s), sans dalle LiDAR rien n'est lu. Les toits lus sur une photo
  ou saisis ne sont pas touchés. L'inspecteur dit « ajustée sur le LiDAR HD de l'IGN »
  (`MD/spec-toit-ign.md` §10).

- **Des bâtiments qui ne sont plus des cubes avec un chapeau (Vue 3D et export GLB).** Chaque
  bâtiment reçoit, sans donnée nouvelle : un débord de toit de 40 cm dans le prolongement des pans,
  avec son épaisseur, sa sous-face et l'ombre sous l'égout ; une gouttière le long des égouts ; les
  arêtes des murs en trait fin (aucun trait sur le toit, dont les pans se lisent par la lumière) ; un soubassement plus sombre ; des fenêtres régulières à
  chaque niveau (le nombre d'étages de la BD TOPO, sinon la hauteur) et une porte au rez-de-chaussée
  du plus long mur, sauf sur un mur photographié ; une cheminée sur un toit en pente. Au-delà de
  120 m du centre de la scène, seuls le débord et les arêtes : un voisinage de deux mille bâtiments
  reste fluide. La structure du GLB exporté change (témoin recapturé, `EMPREINTES.md`) ; aucune
  quantité ni aucun autre export ne bouge (`MD/spec-toit-ign.md` §6.3).

- **La taille du projet après l'heure d'enregistrement.** La barre d'état dit « Enregistré à 10:42
  (820 Ko) » : la taille de ce qui part à la plateforme, pour voir venir sa limite avant qu'elle ne
  refuse le projet. Si l'enregistrement échoue, la taille est mise à jour quand même : « Échec de
  l'enregistrement (2,4 Mo) » remplace l'heure du dernier succès (« Échec (2,4 Mo) » au téléphone),
  et le message d'erreur la reprend, jusqu'au prochain enregistrement réussi.

- **« Fichier › Supprimer le voisinage… ».** Retire d'un coup tous les objets du voisinage
  (parcelles, bâtiments, végétation — voisinage étendu de l'import comme « Ajouter le voisinage » de
  l'actualisation IGN), et les cotes qui s'y appuient. Masquer le voisinage ne l'enlève pas du
  document ; le supprimer allège le projet. Confirmation d'abord, une seule étape d'annulation
  (Ctrl+Z), refusé en lecture seule, grisé quand le plan n'a pas de voisinage.

- **« Affichage › Relief ».** Une entrée du menu Affichage montre ou cache d'un geste les **courbes de
  niveau** du plan et le **sol en relief** de la 3D. Elle est cochée quand les deux sont montrés ; si
  un seul l'est, un clic montre les deux. Elle n'apparaît qu'une fois le relief lu. C'est une
  préférence d'affichage, comme les deux cases de la section Relief de l'inspecteur : pas de Ctrl+Z,
  pas de « projet modifié », permise en lecture seule, retrouvée à la réouverture.

- **Relief à l'import et à l'actualisation IGN.** « Nouveau plan depuis une adresse » (étape 3, et
  résumé de l'import direct) et « Actualiser depuis l'IGN » proposent une case **« Relief du terrain »,
  cochée par défaut**, et sous elle **« Relief sur toutes les parcelles »**, cochée aussi : la grille
  couvre alors les parcelles voisines du plan, tout en restant rangée sur la parcelle du projet. Si
  ces parcelles dépassent un pas de 5 m, la grille revient à la parcelle du projet et ses abords.
  À l'import, un relief que l'IGN ne rend pas ne bloque pas la création : le plan arrive plat.
  Les cases disparaissent sans la capacité `plan.relief`.

- **Voisinage étendu au curseur, compté avant l'import, et import direct.** Le voisinage étendu se
  règle au **curseur, de 10 à 200 m** par pas de 10, à l'étape 3 de « Nouveau plan depuis une adresse »
  comme dans « Actualiser depuis l'IGN » : une case « Ajouter tout le voisinage dans un rayon de… » puis
  le curseur. Le disque de 200 m est lu une fois, en **plusieurs requêtes** à l'IGN (API Carto par
  pages de 1 000 parcelles, BD TOPO par pages au WFS), sans filtre de commune ; le curseur le filtre
  ensuite sans appel au réseau. **Le nombre de parcelles et de bâtiments qui seront ajoutés s'affiche
  avant de créer** (ou d'actualiser) et suit le curseur ; il ne compte pas ce qui arrive déjà (voisines
  cochées, leur bâti, objets déjà dans le plan). L'option « Afficher le voisinage étendu » le montre
  dans l'aperçu, avec son cercle, et le laisse visible à l'ouverture ; décochée, il est importé masqué.
  Tout arrive verrouillé et marqué « voisinage », masquable d'un coup par l'œil de l'explorateur.
  - **Import direct** : à l'étape 1, la case « Import direct, sans les étapes 2 et 3 » saute le choix
    de la parcelle et la liste des voisines. Une fois l'adresse trouvée, un résumé montre l'aperçu, la
    parcelle, son bâti et sa végétation, et le compte du voisinage étendu ; « Créer le projet » crée le
    plan d'un clic, « Ajuster (étapes 2 et 3) » rouvre le parcours complet. Le choix est mémorisé par
    le navigateur.
- **Centrer une piscine ou un trou sur sa terrasse.** Un bouton « Centrer sur la terrasse » (étape
  1 de la piscine ; section « Trou dans la terrasse » d'un trou) déplace le bassin ou le trou pour
  que son centre de surface tombe au centre de sa terrasse — la plage liée au bassin, sinon la
  terrasse qu'il perce. La terrasse ne bouge pas ; Ctrl+Z annule ; déjà centré, le bouton se grise.
- **« Platelage translucide — voir les plots »** (Vue 3D). Par défaut, lames et dalle sont pleines :
  on ne voit pas dessous. Case cochée, les lames deviennent presque transparentes (15 %) et la
  dalle translucide : on voit la structure bois, les plots et leur assise. Préférence d'affichage
  de la session, sans effet sur le projet.
- **Bouton « Terrasse » dans la palette**, à côté de Parasol, Pergola, Carport et Piscine (rail
  sur tablette, feuille Outils sur téléphone). Il pose une terrasse bois de 4 × 3 m sur plots,
  plots dans l'emprise, coins libres, à la place libre la plus proche du centre de la parcelle :
  hors de la maison, des annexes, des autres terrasses, des massifs et des arbres, sans sortir de
  la parcelle. Elle est sélectionnée et chiffrée aussitôt ; Ctrl+Z la retire.
- **Option « Sections de l'inspecteur repliées »** (menu Affichage ; feuille Projet sur
  téléphone). Cochée, les sections de l'inspecteur s'ouvrent repliées, titres seuls : les étapes
  d'une terrasse ou d'une piscine se lisent d'un coup d'œil, on ouvre celle qu'on règle. La cocher
  ou la décocher replie ou déplie aussitôt les sections affichées ; « Prix » et « Paramètres de
  calcul » restent repliées par défaut. C'est une préférence de l'utilisateur, gardée par le
  navigateur d'un projet à l'autre : ni Ctrl+Z, ni « projet modifié », permise en lecture seule.
- **Spécification : le relief du terrain** (`MD/spec-relief.md`). Une grille d'altitudes IGN
  lue en une requête WMS en nombres bruts — LiDAR HD à 50 cm là où il est publié, RGE ALTI à 1 m
  ailleurs — enregistrée dans la parcelle du projet avec sa source, sa date et sa précision, jamais
  relue sans qu'on le demande. Pente et orientation, dénivelé, courbes de niveau, profil de coupe
  (pièce DP3), sol en relief dans la Vue 3D ; les hauteurs de plots, vis et poteaux viendraient dans
  une version majeure suivante. Formats, limites et couverture vérifiés sur `data.geopf.fr` le
  6 octobre 2026. Documentation seulement.
- **Le relief du terrain, phase 1 : lu à l'IGN, enregistré, montré** (`MD/spec-relief.md`).
  Sur un plan calé par le cadastre, la section « Relief » de la parcelle (inspecteur) propose
  « Lire le relief (IGN) » : une grille d'altitudes du sol est lue en une requête WMS en nombres
  bruts — LiDAR HD à 50 cm là où ses dalles sont publiées, RGE ALTI à 1 m ailleurs — sur la
  parcelle et dix mètres d'abords, puis **enregistrée dans le projet** avec sa source, sa date et
  sa précision (masque de source du RGE ALTI, ou la dalle LiDAR). Rien ne la relit sans qu'on le
  demande : « Actualiser le relief » la remplace, « Supprimer le relief » rend le plan plat ; les
  deux s'annulent. Le zéro du plan est le sol au centre de la terrasse, fixé à la lecture.
  - **Inspecteur** : source, date, précision, altitude NGF du zéro, pente moyenne et orientation
    (« 4,2 % vers le SO », ou « sensiblement plat »), dénivelé ; préférences d'affichage (courbes,
    équidistance auto / 10 cm / 25 cm / 50 cm / 1 m, sol en relief en 3D) rangées dans le projet
    sans Ctrl+Z ni « projet modifié », comme « Filaire ».
  - **Plan** : les courbes de niveau sous les objets, au-dessus de la grille, trait fin d'un brun
    discret (jeton nouveau `relief`, réglable dans la palette), une courbe sur quatre maîtresse et
    étiquetée en altitude NGF. Une cote dit son dénivelé (« · Δ +0,42 m ») entre ses deux bouts.
  - **Profil** : un onglet du tiroir des résultats trace la coupe du sol dans le sens de la plus
    grande pente par le point de référence, ou le long d'une cote existante (bouton « Profil » de
    l'onglet Cotes), avec les altitudes NGF et une exagération verticale écrite.
  - **Exports** : `plan.svg` écrit les courbes dans un groupe `relief-courbes` sans `data-*`, que
    l'import ignore ; le plan de masse (DP2) les montre en gris avec leur légende ; le dossier
    mairie gagne une **pièce DP3**, en paysage, la coupe du terrain lue dans la grille enregistrée
    (sans réseau), la terrasse et les abris traversés à leur hauteur, la source citée ; la coupe AA
    du dossier piscine suit le relief le long de l'axe du bassin.
  - **Vue 3D** : le sol suit la grille, l'orthophoto l'épouse, chaque objet se pose sur son sol
    (base au point le plus bas, haut au sol du centre) ; la clôture suit le terrain panneau par
    panneau ; la terrasse courante reste à sa hauteur finie au-dessus du zéro : en aval, on voit
    le vide sous les lambourdes, que la phase 2 remplira.
  - **Données** : schéma de projet **4** (migration 3 → 4 identité ; un projet sans relief s'écrit
    toujours au schéma 3) ; capacité `plan.relief` ; `contrat/plan-produit.json` annonce le
    schéma 4 — **la plateforme doit l'accepter avant la livraison**. Aucune quantité ne change :
    un projet sans relief écrit exactement les mêmes fichiers qu'avant, les témoins de
    `tests/fixtures/golden/` ne bougent pas.
- **Portails et portillons : glisser sur le plan.** Un accès se saisit sur le plan 2D et glisse le
  long de la clôture, à la souris ou au doigt. Il suit le côté le plus proche du pointeur, passe
  d'un côté à l'autre à un angle, et ne sort jamais de son côté. Il ne saute pas sous le pointeur :
  l'écart de la prise est gardé. Un Ctrl+Z annule le geste entier ; la Vue 3D suit au relâcher. Ce
  geste s'ajoute à « Placer sur le plan… » et à la position saisie dans l'inspecteur.
- **Clôture côté par côté, portails et portillons** (`MD/spec-cloture.md`). Sur la parcelle du
  projet, deux sections nouvelles de l'inspecteur remplacent les quatre champs de clôture :
  - « Clôture » : un réglage par défaut et, côté par côté, un réglage propre — palissade bois
    (lames, occultante), grillage (souple ou rigide, occultant), haie (essence, épaisseur, taillée),
    mur (parement, épaisseur, couvertine), ou aucune ; hauteur, couleur, texture ; un soubassement
    maçonné sous une palissade, un grillage ou une haie ; sur rue ou en limite séparative,
    mitoyenne ; une hauteur maximale sur rue et une en limite séparative d'après le PLU, avec un
    avertissement quand un côté les dépasse.
  - « Portails et portillons » : en nombre quelconque, posés sur un côté à une distance du bord ;
    largeur, hauteur, ouverture (un battant, deux battants, coulissant), sens, petit vantail,
    refoulement, forme (droit, chapeau de gendarme, chapeau de gendarme inversé, bombé, concave) et
    flèche, remplissage, matériau, couleur, texture, piliers (largeur, hauteur, parement, chapeau),
    retrait, motorisation ; « Montrer ouvert » est un réglage d'affichage ; un portillon s'accole au
    portail d'un clic ; des alertes signalent un accès qui dépasse le côté, un coulissant sans place
    de refoulement, un battant qui s'ouvre vers la rue. « Placer sur le plan… » pose l'accès d'un
    clic sur un côté de la parcelle, centré sur le point cliqué.
  - Vue 3D : chaque tronçon dans sa matière, les poteaux, les couvertines, les soubassements, les
    piliers, les vantaux fermés ou ouverts (`three/cloture3d.ts`).
  - Plan à l'écran : la clôture doublée le long de la limite dans un trait propre à chaque type, la
    coupure d'un accès, ses piliers, l'arc de débattement d'un battant, la course d'un coulissant,
    les retours d'un portail en retrait (`render/cloture.ts`). Les exports ne changent pas.
  - Fichier : une structure `cloture` sur la parcelle, écrite seulement quand on l'a touchée ; les
    quatre anciens champs restent écrits et suivent le réglage par défaut. Un projet d'avant se
    relit au bit près.

- **Piscine.** Deux outils de la palette, « Piscine » (rectangle de 8 × 4 m) et « Piscine ronde »
  (4 m de diamètre), ou fonction « Piscine » d'un polygone ou d'un cercle. Le contour est le bord de
  l'eau : la surface du plan d'eau, celle que l'urbanisme compte. L'inspecteur conduit le projet par
  étapes, chacune ne montrant que ce qui a un sens après les choix précédents :
  1. **Implantation et structure** : enterrée, semi-enterrée ou hors-sol (hauteur des parois hors du
     sol) ; coque polyester, maçonnerie en blocs à bancher, ou kit de panneaux ; revêtement admis par
     la structure (gelcoat, liner, membrane armée, carrelage, enduit).
  2. **Profondeurs** : fond plat, pente régulière ou plat puis fosse à plonger, petit et grand bain,
     côté du petit bain, part de la fosse ; le volume d'eau se lit aussitôt (exact sur un fond plat,
     intégré par bandes sinon).
  3. **Abords** : margelles (largeur, couleur) ; plage de même largeur tout autour, en bois ou en
     dallage. Une plage en bois a sa structure et ses fondations propres, sans appui sur le bassin :
     au ras du sol, lambourdes 45 × 70 sur plots à l'entraxe que l'épaisseur de lame permet (NF DTU
     51.4, plafond de 70 cm) ; en hauteur, solives 63 × 175 sur des anneaux de poutres 75 × 200
     portées par des poteaux 120 × 120 tous les 2 m sur massifs béton, un anneau de plus chaque fois
     que la largeur dépasse la portée admissible.
  4. **Équipements** : temps de recyclage, local technique et sa distance, éclairage, traitement
     (chlore, sel, brome, oxygène actif), chauffage (pompe à chaleur dimensionnée à un kilowatt pour
     six mètres cubes, solaire, échangeur). La filtration se dimensionne seule : débit, filtre à sable
     (vitesse de 50 m/h, diamètre du commerce), pompe, skimmers (un pour 25 m²), refoulements, bonde,
     prise balai, canalisations.
  5. **Sécurité et urbanisme** : dispositif normalisé (barrière, alarme, couverture, abri), régime
     d'autorisation (aucune formalité sous 10 m² hors secteur protégé, déclaration préalable jusqu'à
     100 m², permis au-delà ou avec un abri de plus de 1,80 m), distances du bassin à chaque limite de
     la parcelle, base de la taxe d'aménagement (250 €/m²), et le bouton du dossier de mairie.
  6. **Métrage et chiffrage** : une ligne par poste dans l'ordre du chantier (terrassement et
     évacuation, radier ou dalle ou lit de gravier, parois ou coque ou kit, revêtement, margelles,
     plage, filtration, pièces à sceller, canalisations, local, électricité, éclairage, traitement,
     chauffage, sécurité, mise en eau), en fourchette TTC fourniture et pose ; la section « Prix »
     règle chaque prix unitaire, et un prix saisi remplace la fourchette de son poste.
  Le plan dessine les parois, l'anneau des margelles, la plage (lames hachurées ou dallage uni), les
  poteaux d'une plage en hauteur, les profondeurs au petit et au grand bain et les ruptures de pente
  d'une fosse (`render/piscineOverlay.ts`). La Vue 3D pose le plan d'eau, dresse les parois d'un
  bassin hors du sol, les margelles, la plage sur ses poutres et ses poteaux (`three/piscine3d.ts`).
  Les réglages vivent dans `piscine` sur l'objet ; `piscineDe` comble les manques à la lecture
  (`engine/piscine.ts`).
- **La piscine est une ouverture dans une terrasse.** Un bassin dans une terrasse (ou qui la mord)
  coupe ses solives, ses lambourdes et ses lames au bord extérieur de ses margelles ; un chevêtre de
  la section du cadre fait le tour de l'ouverture, avec des appuis de rive le long. Nomenclature,
  débit, implantation, chantier, plan et Vue 3D suivent (`engine/structure.ts` `ouverturesDe`,
  `retirerOuvertures`). Sans bassin, rien ne change : les empreintes et l'oracle du moteur sont
  inchangés.
- **Note de calcul (tiroir).** Un onglet « Note de calcul » apparaît quand une piscine est
  sélectionnée : géométrie et volume, terrassement (emprise et profondeur de fouille, déblai, remblai,
  évacuation foisonnée), structure du bassin (pression de l'eau au fond, poussée par mètre de paroi,
  radier et parois ou pose d'une coque ou dalle d'un kit), abords (pièces de la plage, portées,
  appuis, charge par appui ou poteau, décaissement), hydraulique, équipements, sécurité et
  réglementation (régime, distances aux limites, taxe, DAACT et H1), points de vigilance. Chaque
  valeur dit la règle qui la donne (`noteDeCalcul`, `zones/resultats/NoteCalcul.tsx`).
- **Dossier mairie (PDF).** « Dossier mairie de la piscine » dans le menu Exporter, et un bouton dans
  l'étape 5 de l'inspecteur : la déclaration préalable (cerfa n° 13703) ou le permis de construire
  (cerfa n° 13406) de la piscine sélectionnée, sinon la première du plan. Notice descriptive, régime
  et délais, zone du PLU et secteur protégé s'ils sont connus, **aide au remplissage du cerfa**
  rubrique par rubrique (terrain, références cadastrales, nature des travaux, surface de plancher et
  emprise au sol créées, superficie du bassin, hauteur hors sol, abri), liste des pièces cochée ;
  DP1 plan de situation (parcelle, voisinage, lieu) ; DP2 plan de masse coté avec les distances du
  bassin à chaque limite ; DP3 coupe du terrain et du bassin (profondeurs, parois, margelles, plage,
  poteaux) et élévation d'un bassin hors du sol ; cadres pour l'insertion et les photographies à
  fournir ; la note de calcul en annexe (`export/dossierPiscine.ts`). Le cerfa officiel n'est pas
  rempli — un formulaire qui change de version ne se remplit pas depuis un PDF écrit à la main — :
  la page d'aide donne chaque valeur à reporter. Comme le PDF du plan, cet export n'est attaché à
  aucune capacité de la plateforme.
- **Une terrasse percée compte sa surface nette, partout.** Le trou d'une piscine (ou d'un arbre)
  est retiré de la surface de la terrasse dans l'inspecteur (« ouvertures déduites »), la liste des
  terrasses, la feuille de sélection, le résumé, le dossier PDF, la description du cerfa, la charge
  par plot et le chantier (pose des lames, nettoyage). Un bassin n'est plus compté comme un
  équipement posé sur la terrasse dans le dossier. Sans ouverture, rien ne change.
- **La terrasse autour d'une piscine a le trou du bassin, dès sa création.** Sur le plan, la
  terrasse posée par « Plage : terrasse du plan » (ou percée d'un trou) se dessine trouée au bord
  extérieur des margelles : le bassin se voit au travers, même placé dessous. Les exports la
  dessinent de même — SVG (gabarit de découpe, ignoré à la réimportation), PDF du plan et dossier
  PDF (plan de masse et page de la terrasse), DXF (le trou en polyligne fermée sur le calque de la
  terrasse). Le tableau des surfaces du PDF, la densité de vis de l'optimisation et l'onglet
  Méthode comptent aussi la surface nette. Une terrasse sans trou s'écrit octet pour octet comme
  avant (empreintes inchangées).

- **Lame de rive côté par côté, et autour des trous.** Sous « Finitions du tour », une case par
  côté (son nom, mis en évidence sur le plan au survol) dit s'il porte une lame de rive : on la
  retire contre un mur, une marche, une jardinière. Le BOM, le plan et la Vue 3D suivent ; un
  résumé dit les côtés sans rive. « Rive autour des trous » en pend une aussi dans chaque trou de la
  terrasse (jamais autour d'un bassin, que ses margelles bordent).

- **Les plots de rive ne dépassent plus de la terrasse.** Une terrasse sur plots créée maintenant
  (« Plots dans l'emprise », coché d'office) recule son cadre d'un rayon d'embase : l'embase des
  plots de rive, et de ceux du chevêtre autour d'un bassin, reste sous la terrasse ; les lames
  débordent du cadre d'autant (environ 10 cm). Un projet enregistré garde son cadre au bord et ses
  quantités ; la case le passe en retrait à la demande.

- **Niveau fini d'une terrasse et décaissement de pose.** Dans « Fondation et appuis », la case
  « Imposer le niveau fini » fixe la hauteur du dessus des lames au-dessus du terrain naturel :
  0 cm pour une terrasse de plain-pied, la hauteur d'un seuil, celle des margelles. Plus bas que ce
  que la structure donne posée sur le terrain, la terrasse se pose dans un décaissement :
  l'inspecteur en dit la profondeur et le volume, le BOM chiffre « Décaissement pour la pose »
  (terres évacuées, emprise de la dalle débord compris s'il y en a une), le chantier l'ajoute au
  décaissement et à l'évacuation. La coupe montre le terrain naturel au-dessus du fond de fouille, et
  la Vue 3D descend la terrasse dans sa fouille. Plus haut que la structure, un avertissement dit de
  relever les plots ou la tête de vis. La hauteur finie affichée partout est celle du niveau
  imposé. La terrasse posée autour d'une piscine reçoit d'office le niveau du dessus des margelles.
  Sans la case, rien ne change : un projet enregistré garde ses hauteurs et ses quantités.

- **Isoler une piscine, une pergola ou un carport.** Le bouton d'isolement du plan et de la Vue 3D
  (« Isoler la piscine », « Isoler la pergola », « Isoler le carport », « Isoler la terrasse »)
  ne montre que l'objet sélectionné, cadré, en 2D comme en 3D. Une piscine isolée garde la terrasse
  qui lui sert de plage, une terrasse isolée garde les piscines dont elle est la plage ; passer de
  l'une à l'autre ne fait pas sortir de l'isolement.

- **Une ancienne plage en bois devient une terrasse du plan d'un geste.** Une piscine dont la plage
  est encore calculée par la piscine (« Plage bois calculée (projet antérieur) ») porte un bouton
  « Transformer en terrasse du plan » dans « 3. Abords » : la terrasse est posée autour du bassin,
  même largeur et même essence, sélectionnable, retaillable et isolable. Rien ne change sans ce
  geste : les quantités d'un projet enregistré restent les siennes.

- **La dalle sous une terrasse se voit.** Une dalle à couler ou existante déborde de 10 cm du
  platelage, arasée au sol fini : en 3D, sa rive et le dessous du platelage sont en béton, sans avoir
  à mettre le sol en coupe. Sur le plan, un calque « Assise (dalle, massifs) » dessine la dalle et son
  débord, ou un massif sous chaque appui. Le béton et le treillis de la dalle à couler sont comptés
  sur cette emprise débordante.

- **La plage en bois d'une piscine est une vraie terrasse du plan.** Dans la section « 3. Abords »,
  la plage « Terrasse bois du plan » pose aussitôt autour du bassin une terrasse sur plots, liée à
  la piscine, aux coins libres : on la retaille comme tout polygone, elle a sa structure, sa
  nomenclature, son débit, sa coupe et sa 3D de terrasse, et le bassin la perce. Le bouton
  « Sélectionner la terrasse » y ramène. Un bassin rond reçoit le carré qui l'entoure. La note de
  calcul et le dossier mairie prennent la terrasse pour emprise de la plage. La plage en bois que la
  piscine calculait elle-même reste lue et chiffrée telle quelle dans un projet qui l'a déjà
  (« Plage bois calculée (projet antérieur) »), mais n'est plus proposée.

- **Trou dans une terrasse.** Une section « Trous et ouvertures » dans l'inspecteur d'une terrasse
  liste ce qui la perce et porte le bouton « Ajouter un trou » : un trou de 1,20 × 1,20 m, aux
  coins libres, au centre de la terrasse (fonction « Trou de terrasse », sur un polygone ou un
  cercle). Comme autour d'un bassin, les pièces s'arrêtent à son bord sur un chevêtre et les lames
  s'y coupent ; la visserie est comptée sur la surface nette.

- **Assise d'une terrasse sur plots : dalle béton à couler, ou massifs de fondation.** Deux choix
  de plus dans « Assise sous les plots » : une dalle armée de 12 cm sur hérisson (béton, treillis
  ST25C, coffrage de rive au BOM ; coffrage et coulage au chantier ; la coupe la dessine), ou un
  massif de béton de 30 × 30 × 30 cm sous chaque plot, sans décaissement général.

- **Vue 3D : la piscine en volume, et le sol en coupe.** Le sol est percé au droit du bassin : on
  voit ses parois, son fond qui suit le profil (plat, pente, fosse) et l'eau translucide à la
  revanche. Les piscines restent dans la scène quand « Afficher tous les objets du plan » est
  décoché : elles étaient absentes de la 3D d'une terrasse. Une case « Sol en coupe — voir l'assise
  et les fondations » perce le sol sous la terrasse et montre la fouille, le hérisson, la dalle,
  les dalles stabilisatrices, les massifs ou les fûts des vis, à leur profondeur (avec « Lames en
  filaire », on les voit à travers le platelage). C'est un réglage d'affichage, comme « Filaire ».

- **Déclaration préalable en mairie, cerfa 13703\*12 rempli.** Menu Exporter, « Déclaration
  préalable (cerfa) », ou section « Déclaration préalable » de la parcelle du projet.
  - Le formulaire officiel (servi à côté de l'application, `cerfa/cerfa_13703-12.pdf`) est rempli
    avec ce que le plan sait : adresse et références cadastrales du terrain (une ligne de la fiche
    complémentaire par parcelle fusionnée), superficie, nature du projet, description des ouvrages
    (pergolas, carports, terrasses : dimensions, emprise au sol, hauteur, toit), protections
    patrimoniales lues dans les servitudes du PLU, lieu et date. Le déclarant (identité,
    coordonnées, résidence) se saisit dans la section de la parcelle et s'enregistre avec le projet.
  - Les pièces suivent, numérotées et cochées au bordereau : DP1 (carte Plan IGN centrée sur le
    terrain, si la Géoplateforme répond, et extrait cadastral), DP2 (plan de masse coté : cotes,
    distance à la limite la plus proche, hauteurs, existant et projet), DP4 (deux façades et la
    toiture de chaque abri), DP6 (la Vue 3D telle qu'on l'a cadrée, si le dossier est généré
    depuis la 3D).
  - Le formulaire reste modifiable ; la notification liste ce qui reste à compléter (naissance,
    signature, photographies DP7 et DP8). Au-delà de 20 m² d'emprise (40 m² adossé en zone PLU),
    la section prévient qu'il faut un permis de construire.
  - pdf-lib est chargée à la demande depuis jsDelivr, comme three.js : le fichier unique ne
    grossit pas. La livraison et la copie Node (`buildsg/`) servent le formulaire.
- **Note de calcul d'une pergola ou d'un carport.** Une section « Note de calcul » dans
  l'inspecteur, et son export PDF (`export.noteCalcul`).
  - Hypothèses : régions de neige (A1 à E) et de vent (1 à 4), sans valeur par défaut ; tant
    qu'elles ne sont pas choisies, la note le demande au lieu de calculer. Puis altitude, catégorie
    de terrain, obstruction sous le toit (une voiture, par défaut 50 % sous un carport), poids de la
    couverture, classe du bois (C24, GL24h) et classe de service, ou épaisseur des profilés
    aluminium.
  - Charges selon NF EN 1991 et ses annexes nationales : neige au sol avec l'altitude, μ1, neige
    exceptionnelle, rien sur une toile repliée l'hiver ; vent par la pression de pointe et les
    coefficients de toiture isolée (§7.3) ; entretien de 1,5 kN.
  - Combinaisons NF EN 1990 (ELU, accidentelle, ELS). Vérifications NF EN 1995-1-1 (flexion avec
    déversement, cisaillement, flambement, flèches avec fluage) ou NF EN 1999-1-1 (classe de section,
    flambement), pour les chevrons, les poutres, les poteaux et les contrefiches. La section qui
    suffit est proposée quand celle en place ne passe pas.
  - Appuis : efforts en pied de poteau, plot béton qui tient le soulèvement et le renversement,
    charge sur la lisse murale. Urbanisme : la formalité selon l'emprise au sol.
  - Ses limites sont écrites dans la note : assemblages, sol, pressions locales de bord, faîtage et
    arêtiers ; c'est un pré-dimensionnement, pas l'étude d'un bureau d'études.
- **Carport.** Outil « Carport » de la palette, ou fonction « Carport » d'un polygone. C'est le même
  ouvrage que la pergola, par le même code (`engine/pergola.ts`, inspecteur, plan, Vue 3D, métrage
  et chiffrage) : seules les valeurs par défaut changent. Il naît en rectangle de 3 × 5 m (une
  place de voiture) au centre de la parcelle, en appentis couvert à 5° (bac acier gris), avec
  2,30 m sous les poutres. Un avertissement s'affiche sous 2,20 m de passage libre. Pergola et
  carport partagent la particularité `abri` (`model/fonctions.ts`, `estAbri`) et la fabrique
  `nouvelAbri`. Le chiffrage d'un abri reste à part de celui de la terrasse.
- **Pergola : aluminium, adossement, débord et chiffrage.**
  - « Matériau » : bois ou aluminium. L'aluminium a ses profilés (poteaux 100 × 100, poutres
    100 × 200, chevrons 50 × 150 par défaut), ses longueurs vendues (6, 4, 3 m), sa couleur
    (anthracite), et pas de contrefiches.
  - « Adossée à un mur » (toile ou appentis) : pas de poteaux le long du mur, une lisse murale à la
    place de la poutre, pas de débord de ce côté. Le mur est par défaut le côté qui fait face au côté
    de référence, donc le haut d'un appentis. Un avertissement apparaît si la pente descend vers le
    mur.
  - « Débord du toit » : les poutres se prolongent, les chevrons et la toile ou la couverture
    couvrent l'emprise élargie, dessinée en pointillé sur le plan ; en quatre pans, l'égout descend
    dans la pente. Une nouvelle pergola naît avec 20 cm ; une pergola déjà dessinée garde 0.
  - Chiffrage : la section devient « Métrage et chiffrage », avec le coût de chaque section (barres
    achetées, chutes comprises), de la toile ou de la couverture au m², et un total de fourniture.
    Les prix se règlent dans la section « Prix » ; les valeurs indicatives sont des ordres de
    grandeur de négoce, par matériau. Le chiffrage de la terrasse n'est pas touché : les empreintes
    ne bougent pas.
- **Pergola.** Un nouvel objet, outil « Pergola » de la palette, ou fonction « Pergola » d'un
  polygone : le contour est le nu extérieur des poteaux. Un poteau à chaque coin et des poteaux
  intermédiaires au-delà de l'entraxe maximal (4 m par défaut), une poutre de cadre sur chaque côté,
  des contrefiches à 45° (deux par poteau, facultatives), et trois toits : chevrons et toile,
  appentis (une pente, bas sur le côté de référence) ou quatre pans (faîtage, arêtiers, chevrons et
  empannons, calculés sur le rectangle englobant). Section « Pergola » de l'inspecteur : toit,
  hauteur, côté de référence, pente, sections et entraxes, couleurs, longueurs achetables. Section
  « Métrage par section » : pour chaque section de bois, les pièces, les mètres linéaires et les
  barres à acheter, débitées comme les lames d'une terrasse (sans aboutage), plus la surface de toile
  ou de couverture. Le plan montre la charpente vue de dessus (poteaux, poutres, chevrons) ; la Vue 3D
  la construit pièce par pièce (`engine/pergola.ts`, `three/pergola3d.ts`,
  `render/pergolaOverlay.ts`). La pergola n'entre pas dans la nomenclature de la terrasse : les
  empreintes ne bougent pas.
- **Vitrine : le soleil se voit, et le couchant colore la scène.** Un disque de soleil tourne autour
  de la parcelle, à l'azimut du vrai soleil : levant à l'est, couchant à l'ouest. Sa hauteur est
  réduite (×0,4, 28° au plus) pour qu'il reste dans le champ d'une caméra qui regarde la parcelle
  d'en haut, et il ne porte pas d'ombre. Près du lever et du coucher (sous 12° de hauteur), le ciel
  vire au beige de savane, la lumière d'ambiance se fait dorée et reste claire, et le disque passe
  du jaune à l'orange. Au crépuscule, cela s'efface. Deux cases au clic droit (« Soleil visible »,
  « Couleurs du couchant ») et deux paramètres d'adresse, actifs par défaut : `soleil=n`,
  `couchant=n` (`three/soleilVitrine.ts`). La retouche se fait avant le rendu de chaque pas d'heure
  (`vue3d.apresSoleil`), sans clignotement.

### Modifié

- **Formes de toit** (`MD/spec-toit-ign.md` §4 et §10) : une maison rectangulaire (contour qui remplit
  son rectangle à 86 %, allongé d'au moins 1,25) reçoit **deux pans à pignons** dans l'axe du long
  côté, et non plus des croupes ; les croupes restent pour un carré, un L, un T. Sur le LiDAR,
  l'ajustement essaie aussi l'**appentis** et l'axe de faîtage que les **mesures** dessinent, lit
  les hauteurs à 25 cm des murs (60 avant : le bas des pans manquait et un pignon passait pour une
  croupe), ne prime plus les croupes, et renonce quand deux corps de hauteurs différentes se
  partagent le contour plutôt que d'en faire un appentis.

- **Une parcelle importée naît close.** À la création d'un projet par import cadastral, la parcelle
  du projet (pas ses voisines) reçoit une palissade bois de 1,80 m sur tout son contour et un
  portail en aluminium blanc, à deux battants ouvrant vers l'intérieur de la parcelle, au milieu du
  côté deviné sur rue (sinon le plus long). Tout se règle
  ensuite dans l'inspecteur ; les projets existants ne changent pas (`MD/spec-cloture.md` §2.2).
- **Le portail neuf est en aluminium blanc** (RAL 9016) au lieu de gris anthracite, et l'aluminium
  thermolaqué n'assombrit plus sa couleur en 3D.

- **Palette : les ouvrages d'abord.** Les boutons de création suivent l'ordre où l'on pense un
  jardin — Terrasse, Pergola, Carport, Piscine, Piscine ronde, Parasol, Point de vue — et les formes
  purement géométriques (Chemin, Polygone, Rectangle, Cercle) passent à la fin, dans un groupe
  « Formes » à part.

- **Le relevé de façade ne change plus la hauteur du bâtiment.** La photo apporte la texture, les
  ouvertures et le toit ; à la validation, la façade est ramenée à la hauteur du bâtiment (cadastre
  ou saisie), ouvertures, partie basse et toit compris. La hauteur mesurée sur la photo est dite
  dans le message de fin, pour que l'écart se voie, mais elle n'est plus appliquée. Les ouvertures
  d'un mur photographié priment toujours sur les fenêtres dessinées, réglées une par une comprises.

- **Les toits-terrasses ont leur couleur en 3D.** Leur dessus prenait la couleur des murs ; il est
  maintenant couvert de la couleur lue sur l'orthophoto, en retrait de 20 cm des murs (le dessus des
  murs se lit comme un acrotère). Quand la photo n'est pas concluante, un toit plat est gris, jamais
  tuile rouge ou brune ; un plan déjà importé dont un toit plat avait été rabattu sur une tuile
  s'affiche gris sans relecture (`MD/spec-toit-ign.md` §6.1).

- **Moins de traits sur les bâtiments.** Le trait le long de l'égout, qui se voyait à travers le
  débord du toit, est retiré ; les angles des murs restent, mais dans la teinte du mur légèrement
  assombrie au lieu d'un trait sombre, et seulement aux vrais angles (pas aux sommets presque
  alignés d'un contour BD TOPO).

- **Le voisinage étendu va jusqu'à 1 000 m** (curseur de 10 à 1 000 m, au pas de 10, à l'import
  depuis une adresse comme à l'actualisation). Le disque n'est plus lu d'un coup au plus grand
  rayon : il est lu par paliers (200, 500, 1 000 m), au palier qui couvre le curseur, et relu plus
  large si le curseur le dépasse ; sous le palier lu, le compte suit le curseur sans réseau. Au-delà
  de 200 m, un avertissement rappelle que le plan s'alourdit (jusqu'à 2 000 parcelles et autant de
  bâtiments, les plus proches) et que la plateforme peut refuser de l'enregistrer. Les lectures
  au-delà de 200 m parcourent jusqu'à 10 000 entités par famille avant de garder les 2 000 plus
  proches.

- **Le voisinage arrive sans noms affichés.** Les parcelles et les bâtiments (principaux et annexes)
  du voisinage — voisinage étendu de l'import, « Ajouter le voisinage » de l'actualisation IGN —
  n'affichent plus leur référence cadastrale ni leur usage : des centaines d'étiquettes rendaient le
  plan illisible. La case « Nom » de l'explorateur les réaffiche au besoin. Les plans déjà importés
  ne changent pas.

- **Le relief est accordé à tous les comptes.** La capacité `plan.relief` n'étant pas encore déclarée
  ni attribuée dans backprod, « Lire le relief » et les cases du relief disparaissaient pour tout le
  monde. Plan l'accorde désormais en dur, quelle que soit la formule (`CAPACITES_FORCEES`,
  `app/acces.ts`). Tant que la plateforme ne l'attribue pas, **un administrateur** (rôle
  d'administration du locataire, ou admin des démos) voit à l'ouverture un avertissement qui le
  rappelle, avec ce qu'il faut faire dans backprod ; les autres comptes n'en voient rien.

- **La feuille du plan contient toutes les parcelles affichées.** Un plan venu du cadastre s'ouvre
  cadré sur la parcelle **et son voisinage visible**, avec la même respiration qu'une parcelle seule
  (à l'ouverture comme après un import JSON). Le zoom arrière, borné jusqu'ici à 6 px/m (130 à 260 m
  de large selon l'écran), descend désormais assez bas pour que toutes les parcelles affichées
  tiennent dans la moitié du plan : un voisinage de 200 m se voit en entier. Le plancher suit le
  voisinage, qu'il soit ajouté ou masqué ; une parcelle seule garde celui d'avant. En **Vue 3D**, le
  sol (plat ou en relief) couvre de même toutes les parcelles affichées, **plus 10 m de chaque côté**
  (il en faisait le double, beaucoup trop grand), et le plan lointain de la caméra le suit : un
  voisinage de 200 m n'est plus coupé.
- **Un seul calque pour le 2D et la 3D : les parcelles affichées plus 10 m** (`model/calque.ts`).
  Le sol 3D en prend les bornes, le plan s'ouvre cadré dessus, et **l'orthophoto le couvre en entier,
  en 2D comme en 3D, sans le dépasser** : elle est lue pour le calque de toutes les parcelles (voisinage
  masqué compris), puis coupée à celui des parcelles affichées. Quand le calque grandit (voisinage
  ajouté), la photo est relue pour lui, une fois, sans bruit.

- **Haies et végétation, arbres estimés : décochés par défaut**, à l'import depuis une adresse comme
  dans « Actualiser depuis l'IGN ». Ils chargent le plan d'objets approximatifs : on les demande.

- **Le relief du terrain, phase 2 : les quantités suivent le sol en pente** (`MD/spec-relief.md`
  §6). **Événement de version majeure** au sens de `RELEASE.md` : pour un projet qui porte un
  relief, des nombres changent ; un projet sans relief garde exactement les siens (oracle du moteur
  et six empreintes inchangés ; témoin nouveau `tests/fixtures/golden/relief-moteur.json`).
  La règle est la même partout : la référence d'un ouvrage est le point le plus haut du sol sous
  son emprise, la hauteur réglée vaut là, et l'appui s'allonge d'autant que le sol descend.
  - **Terrasse** : chaque plot ou vis a sa hauteur ; la nomenclature achète les plots par gamme sur
    une ligne (« 12 × Réglable 60-100 mm, 8 × Réglable 100-170 mm (sol en pente : de 6 à 48 cm) »)
    et dit jusqu'où sortent les têtes de vis ; l'implantation écrit la hauteur de chaque appui ; la
    coupe dit l'étendue des plots ; les alertes DTU de l'inspecteur regardent le plot et la tête de
    vis d'aval ; en Vue 3D la structure est de niveau sur le point haut et chaque appui descend
    jusqu'à son sol.
  - **Pergola et carport** : poutres de niveau sur le point haut, poteaux jusqu'à leur sol (plus
    longs en aval, chiffrés tels quels) ; la hauteur déclarée (plan de masse « H max », cerfa) se
    mesure depuis le terrain naturel au point bas ; les façades DP4 posent leur ligne de sol au
    point bas et le disent.
  - **Piscine** : bord de niveau sur le point haut ; fouille comptée cellule par cellule sur le sol
    réel ; ligne nouvelle « Remblai de nivellement des abords » quand le sol descend sous la plage ;
    poteaux d'une plage haute par hauteur.
- **Terrasse sur dalle béton à couler : la dalle en fond de fouille, les plots posés dessus.** Par
  défaut (sans niveau fini imposé), la dalle est coulée une hauteur de plot sous le terrain : dessus
  de dalle + hauteur de plot = terrain naturel. Les plots se posent sur la dalle, leur tête au ras du
  sol, et la structure démarre au niveau du terrain ; la coupe dessine le terrain naturel au haut du
  plot. **Les quantités changent pour
  ces terrasses** : un décaissement de pose de la hauteur du plot (sur l'emprise débordante de la
  dalle) entre au BOM et au chantier, et la hauteur finie baisse d'autant. Un niveau fini imposé
  garde la main ; les autres assises (concassé, dalle existante, massifs) ne changent pas, ni le plan
  de démonstration (empreintes inchangées).
- **La terrasse se règle par étapes, comme une piscine.** Les sections de l'inspecteur d'une
  terrasse sont numérotées dans l'ordre où l'on décide : « Terrasse · 1. Implantation et niveau »
  (niveau fini, décaissement, trous et ouvertures), « 2. Fondation et assise » (vis ou plots, et
  l'assise sous les plots), « 3. Lames et sens de pose », « 4. Structure porteuse » (structure
  simple ou double sur plots, solives, lambourdes), « 5. Appuis et charges » (charges, entraxes,
  plots dans l'emprise, zone spa, alertes), « 6. Finitions du tour », « 7. Optimisation », puis
  « Paramètres de calcul », replié. Chaque étape ne montre que ce qui a un sens après les
  précédentes. Comme celles d'une piscine, elles viennent avant la géométrie (côtés, coins,
  alignement). Aucun réglage n'est ajouté ni retiré : seul leur rangement change.
- **Une terrasse neuve est posée sur plots.** Choisir la fonction « Terrasse » sur un objet qui n'a
  pas encore de construction, ou poser la terrasse d'une piscine, donne une pose sur plots. Un
  projet enregistré sans construction garde la vis de fondation à l'ouverture, et ses quantités.

### Corrigé

- **Des bouts de toit qui dépassaient des murs.** En « Tel que mesuré », la surface pendait dans le
  vide là où les murs, posés par rectangles, ne couvraient pas le contour : les murs suivent
  désormais le contour lui-même, jusqu'à la surface. En « Un toit par corps », le débord de chaque
  corps traversait le mur du corps voisin : il n'existe plus que sur les façades.

- **Un bâtiment relevé avec photo ne pouvait pas s'enregistrer sur la plateforme.** La photo du
  relevé de façade était dans le document (`data:image/jpeg;base64,…`), ce que la plateforme refuse
  (`EMBEDDED_ASSET_REJECTED`). Elle reste désormais sur l'appareil, dans le navigateur, et le
  document n'en porte que la clé (`photoLocale`) ; elle revient à l'ouverture sur le même appareil.
  Ailleurs, le relevé garde ses mesures et ses ouvertures, et l'inspecteur dit « photo restée sur
  l'appareil du relevé ». L'export JSON garde la photo (`MD/spec-releve-facade.md` §10.1).

- **« Impossible de créer le projet : EMBEDDED_ASSET_REJECTED » à l'import par adresse.** La
  plateforme refuse toute chaîne de plus de 64 Kio dans un document ; or le relief du terrain
  s'enregistre en une chaîne base 64 (`zCode`), qui atteint 107 Kio pour une grille de 40 000
  cellules — une grande parcelle, ou un relief étendu au voisinage. Au-delà de 60 000 caractères,
  `zCode` est désormais une liste de morceaux, recollés à la lecture (`MD/spec-relief.md` §7). Et si
  la plateforme refuse encore un contenu embarqué, le message dit quel champ et quelle taille, au
  lieu du seul code.

- **Page blanche après une mise en ligne** (10 octobre 2026, plan.raillard.org) : le programme était
  en ligne dans `index.html`, et la politique de contenu du `.htaccess` le nommait par son
  empreinte, qui change à chaque build. La mise en ligne avait remplacé `index.html` mais pas le
  `.htaccess` (fichier caché, sauté au téléversement) : le navigateur refusait le programme. Le
  build sort désormais le programme dans `assets/plan-<empreinte>.js`, que la page appelle et que
  `script-src 'self'` couvre : la politique ne dépend plus du build, et un `.htaccess` d'une
  version précédente ne casse plus rien (`deploy/scripts-page.mjs`). Le programme se garde en cache
  sans limite (son nom change avec lui) et se sert sous un type JavaScript ; la livraison, le
  serveur Node (`buildsg/app.js`), le contrôle du paquet (qui lit aussi le programme) et
  `verifier-deploiement` (le programme est servi, la politique le couvre) suivent. Le mode d'emploi
  de la livraison conseille d'extraire `livraison.zip` sur le serveur, qui n'oublie ni `assets/` ni
  `.htaccess`.

- **Import par adresse : la couleur et la forme des toits étaient lues à côté.** Le plan construit
  a pour origine le sommet nord de la parcelle (calage cadastral), mais la lecture de l'orthophoto
  (couleur des toits) et du MNH LiDAR HD (forme des toits) se faisait avec le projecteur centré sur
  le point de l'adresse : décalées de la distance entre les deux, souvent plusieurs dizaines de
  mètres, elles tombaient sur la rue ou le jardin voisin — d'où des toits « ajustés » sur n'importe
  quoi et des couleurs de hasard. Les deux lectures se font désormais dans le repère du plan
  (`app/importCadastre.ts::projecteurDuPlan`). L'actualisation IGN, elle, lisait au bon endroit.

- **Dépôt : plus de lien `node_modules` suivi par git.** La livraison du 9 octobre avait enregistré
  le lien symbolique de son worktree vers `node_modules` (`.gitignore` ne couvrait que les dossiers) ;
  une extraction remplaçait alors le dossier des dépendances par ce lien. Le lien est retiré et le
  motif couvre désormais les liens.

- **Les toits-terrasses ne scintillent plus en 3D.** Leur couverture, deux centimètres au-dessus du
  dessus du bâtiment, se disputait avec lui dès qu'on s'éloignait : avec un voisinage étendu, le plan
  lointain de la caméra recule à des kilomètres et la précision de profondeur ne distingue plus deux
  centimètres. Un décalage de profondeur la fait gagner à toute distance.

- **Sur un sol en relief, le soubassement des bâtiments descend jusqu'au sol.** Il partait du sol au
  centre du bâtiment et laissait un vide sous le mur du côté qui descend ; il part maintenant du point
  le plus bas du sol sous le bâtiment et suit la pente. Les angles et la porte suivent de même.

- **Vue 3D en relief : le sol vert passait par taches à travers l'orthophoto.** Sur un sol en
  relief, la photo était une seconde surface — une dalle par tuile, subdivisée au mètre, posée 4 mm
  au-dessus du sol. Deux maillages du même terrain qui ne l'interpolent pas pareil (le sol en
  triangles sur la grille d'altitudes, la dalle en bilinéaire au mètre) se croisent de quelques
  centimètres entre les sommets, et la photo passait sous le sol vert. La photo est désormais
  **peinte sur le maillage du sol lui-même** : les tuiles composées en une seule texture (puissances
  de deux, 4 096 px au plus), posée sur le matériau du sol, dont les `uv` couvrent son emprise. Une
  seule surface, rien ne peut passer dessous ; la photo reste coupée au calque, et le vert du sol
  garde ce qu'elle ne couvre pas. Le sol plat garde ses dalles d'avant (`three/relief3d.ts`,
  `three/scene.ts`).

- **Vitrine `?mode=demo&file=<n>` : quand la démo n'est pas lue, la cause se dit, au lieu d'un repli
  muet.** Trois pannes de l'hôte se ressemblaient — la scène n'était pas celle demandée, et rien ne
  disait pourquoi : un fichier de démo **présent mais illisible par PHP (droits)** passait `is_file`
  et répondait un 200 au corps vide ; un **admin non configuré** (`plan-admin-config.php` absent ou
  mot de passe « A-CHANGER ») répondait 404 « Introuvable », comme une démo absente ; une
  **protection anti-robots de l'hébergeur** répondait sa page HTML à la place du JSON. Désormais
  `admin/vitrine/<n>` répond `500 UNREADABLE` (droits du fichier) ou `404 NOT_CONFIGURED`, et tous ses
  refus portent `Access-Control-Allow-Origin: *`, pour que l'`<iframe>` en bac à sable de la
  plateforme voie la raison et pas seulement l'absence. La page écrit la cause dans la console
  (« Vitrine : la démo « 2 » n'a pas été lue (HTTP 500 UNREADABLE : …) ; la démonstration intégrée
  est affichée. »), nomme une réponse HTML pour ce qu'elle est, et envoie ses cookies
  (`same-origin`) pour qu'une protection anti-robots qui les exige ne la bloque pas en navigation
  directe. `npm run verifier-deploiement https://<hôte>` contrôle la route et nomme la cause sur
  l'hôte réel ; le LISEZMOI de la livraison précise les droits attendus (755/644). Reproduit sur
  le paquet construit, servi par PHP avec la politique de sécurité du `.htaccess`, dans un
  `<iframe>` d'une autre origine : sans bac à sable, en bac à sable strict, avec
  `allow-same-origin`, et en navigation directe — la démo demandée s'affiche dans les quatre cas.

- **Vitrine dans un `<iframe>` bas : les boutons de navigation ne débordent plus.** Un cadre de moins
  de 1 024 px de large passe dans la classe d'écran « moyen » ou « compact », qui descend les boutons
  de 116 px pour la barre d'application — absente de la vitrine. Dans un cadre de 600 × 300, les
  derniers boutons sortaient du cadre. Dans la vitrine, boutons et horloge partent du haut, et les
  boutons passent sur une seconde colonne quand la hauteur manque. Vérifié dans un `<iframe>` d'une
  autre origine en bac à sable, de 800 × 450 à 300 × 160 : tous les boutons visibles, la scène à la
  taille exacte du cadre, aucun défilement, ni dans le cadre ni dans la page hôte.

- **Vitrine (`?mode=demo`) sans `x` ni `y` : toute la fenêtre, sans défilement.** La scène est
  ancrée aux quatre bords de la fenêtre visible au lieu de `100vw × 100vh` (qui, sur un téléphone,
  compte la barre d'adresse et débordait), et la page est figée : l'atelier caché dessous ne la fait
  plus défiler ni rebondir. Une dimension donnée ne fixe que son côté.

- **« PAYLOAD_TOO_LARGE » à l'enregistrement.** Un projet avec un voisinage étendu et son relief
  dépassait ce que la plateforme accepte. Le document enregistré est allégé, sans rien perdre à la
  relecture : les altitudes du relief s'écrivent compactées (`zCode`, centimètres sur 16 bits en
  base 64, 2,4 fois moins lourd), et les objets du voisinage s'enregistrent sans ce que le chargement
  reconstruit (champs nuls ou faux, noms par défaut, géométrie WGS84 source). Sur un voisinage de
  200 m avec relief : 2,4 Mo → 1,0 Mo. Les objets dessinés gardent leur forme écrite (empreintes
  inchangées), et une grille écrite en clair se relit toujours. Si la plateforme refuse encore, le
  message dit ce qui pèse et comment alléger, au lieu du code brut.

- **Margelle et terrasse au même niveau à la création.** En Vue 3D, une terrasse sur plots en
  structure simple dessinait ses lambourdes sans hauteur, et son cadre aussi : les lames reposaient
  directement sur les plots, 7 cm sous la hauteur finie calculée (et sous les margelles d'une
  piscine). Sur plots, les lambourdes ont toujours leur section en 3D, comme dans les hauteurs, la
  coupe et le chiffrage : lames sur la structure bois, structure sur les plots, plots sur leur
  assise. À la création de la terrasse d'une piscine semi-enterrée, les plots montent de l'écart
  pour que les lames arrivent au ras des margelles (`constructionDeLaPlage`) ; hors-sol, ils
  plafonnent à 100 cm et l'inspecteur signale la différence.
- **Lames coupées à la forme du trou.** Autour d'un bassin ou d'une trémie, chaque lame de la Vue 3D
  (et du GLB) s'arrêtait d'équerre : sur un bord oblique ou rond, un coin débordait dans le trou et
  l'autre s'arrêtait court. Elle est maintenant découpée exactement au bord du trou
  (`engine/lames.ts`, `empriseLameTrouee`). Le débit et le BOM ne changent pas.
- **Fond orthophoto en Vue 3D.** Cocher ou décocher « Fond orthophoto (IGN) » au menu Affichage,
  la Vue 3D ouverte, ne changeait rien à l'écran : il fallait repasser par le plan 2D. La scène se
  reconstruit maintenant dès que les tuiles sont là (ou retirées). Un test vérifie aussi que
  l'en-tête de l'inspecteur d'une terrasse percée donne sa surface nette, comme le champ Surface,
  bassin dedans ou à cheval sur le bord.
- **La piscine disparaissait dans la vitrine (`?mode=demo`).** Une terrasse qui n'était pas la
  terrasse courante — toutes dans la vitrine, les autres dans la Vue 3D avec « tous les objets » —
  se dessinait en bloc plein : la terrasse posée autour d'une piscine recouvrait son bassin. Elle
  est maintenant percée de ses trous en 3D comme sur le plan (le bord extérieur des margelles,
  un trou de terrasse). Une terrasse sans trou se dessine comme avant.
- **Bassin à cheval sur le bord de sa terrasse.** Le trou n'était dessiné que si le bassin était
  tout entier dans la terrasse ; à cheval sur un bord, la surface le déduisait mais la terrasse
  restait pleine. Elle est maintenant encochée partout : sur le plan, dans le SVG et le PDF (un
  gabarit de découpe), dans le DXF (le contour encoché) et dans la Vue 3D (la terrasse extrudée
  morceau par morceau). La forme vient d'une différence de polygones (`geometry/difference.ts`) ;
  un bassin posé exactement sur un bord ou un sommet est décalé d'un micron pour le calcul.
- **Chevêtre d'un bassin à cheval sur le bord d'une terrasse.** Il faisait tout le tour du bassin,
  y compris hors de la terrasse, avec ses appuis ; il s'arrête maintenant à son contour.

- **Vitrine : `file=` marche aussi dans un `<iframe>` en bac à sable.** La plateforme encadre la
  vitrine avec `sandbox="allow-scripts allow-forms allow-popups"`. Sans `allow-same-origin`, la page
  y a l'origine `null`, et la lecture de sa propre démo (`admin/vitrine/<n>`) était refusée par CORS :
  la vitrine montrait la démonstration intégrée au lieu du fichier demandé. La palette du serveur
  était refusée de même. Les deux lectures publiques, `admin/vitrine/<n>` et la palette, répondent
  désormais `Access-Control-Allow-Origin: *` (`admin.php`, `buildsg/demosAdmin.mjs`). C'est sans
  risque : elles sont publiques par construction, sans cookie lu ni posé, et l'écriture reste
  derrière la session. Vérifié avec `php -S` et le paquet construit, dans un `<iframe>` d'une autre
  origine : sans bac à sable, en bac à sable strict, et avec `allow-same-origin`.

### Corrigé

- **Vitrine : « Copier l'adresse » copie vraiment, aussi dans un `<iframe>`.** Dans l'`<iframe>` de
  la plateforme sans `allow="clipboard-write"`, le menu disait « Adresse copiée » sans rien copier.
  Le presse-papiers moderne y est refusé. La copie de secours sélectionnait un champ masqué par la
  feuille de la vitrine (`visibility:hidden`), donc rien, et `execCommand` rendait vrai quand même.
  La copie passe d'abord par l'événement `copy`, synchrone, dans le clic : elle ne demande ni
  sélection ni permission, et ne compte que si le navigateur l'a vraiment déclenchée
  (`copierParEvenement`). Ensuite le presse-papiers moderne, puis l'adresse affichée à copier à la
  main. Vérifié dans un `<iframe>` d'une autre origine, avec et sans `allow`, à la souris et au doigt.

### Ajouté

- **Vitrine au doigt : l'appui long ouvre le menu de la scène.** Sur téléphone et tablette, il n'y
  a pas de clic droit. Un doigt posé et immobile une demi-seconde ouvre le même menu (Rafraîchir,
  Copier l'adresse, Date du soleil, Rotation auto), en feuille au bas de l'écran, avec des cibles de
  44 px. Le doigt qui glisse fait tourner la scène et annule l'appui ; deux doigts (pincer) ne
  l'ouvrent jamais. Le menu natif d'Android est coupé, ainsi que la loupe et la bulle d'iOS sur la
  scène. Une vibration brève confirme l'ouverture là où le téléphone la permet
  (`app/menuVitrine.ts`, `brancherAppuiLong`).

### Corrigé

- **Vitrine en portrait : la parcelle tient en largeur.** Le cadrage sur la parcelle tient compte
  du format de la scène : le champ de la caméra est vertical, donc plus étroit en largeur sur un
  téléphone en portrait, et la caméra recule d'autant.

### Modifié

- **Vitrine (`?mode=demo`) : le soleil court du lever au coucher, la caméra tourne, la parcelle est
  cadrée.**
  - Avec `heureauto=y` sans `hrsstart` ni `hrsend`, l'heure court du lever au coucher du soleil, au
    jour affiché et au lieu de la parcelle (`geo/soleil.ts` `leverEtCoucher`, le même modèle que
    celui qui éclaire la scène ; 7 h et 20 h si le plan n'a pas de lieu). Une borne donnée est
    gardée, l'autre suit le soleil. Changer la date au clic droit recalcule la course.
  - La rotation automatique est active par défaut, à un tour par minute ; `rotation=n` (ou 0)
    l'arrête, et l'adresse copiée l'écrit alors (`rotation=0`).
  - À l'ouverture, la caméra se cadre sur la parcelle entière, son centre en visée, au lieu de la
    terrasse ; un `pdv` demandé garde la priorité, et `zoom` s'applique ensuite.

### Ajouté

- **Clic droit sur la vitrine (`?mode=demo`) : « Rafraîchir » et « Copier l'adresse ».** La vitrine
  vit le plus souvent dans un `<iframe>`, dont l'adresse ne se voit nulle part. « Copier l'adresse »
  met l'adresse exacte de la vitrine, paramètres compris (`file`, `pdv`, `zoom`…), dans le
  presse-papiers et le dit (« Adresse copiée »). Si le presse-papiers est refusé, l'adresse
  s'affiche sélectionnée, à copier à la main. « Rafraîchir » recharge la vitrine seule, sans la page
  qui l'encadre. Le bouton droit sert aussi à déplacer la scène : un clic droit qui a glissé n'ouvre
  pas le menu. Échap ou un clic ailleurs le referment (`app/menuVitrine.ts`). Dans un `<iframe>`
  d'une autre origine, la copie directe demande `allow="clipboard-write"` sur l'`<iframe>`.

- **Vitrine : date du soleil et rotation automatique, au clic droit et dans l'adresse.** Le menu du
  clic droit ajoute deux réglages. « Date du soleil » ouvre le calendrier du navigateur et y pose le
  jour : ombres et lumière suivent. « Rotation auto » fait tourner la caméra autour de la scène
  depuis sa position, à la vitesse saisie en tours par minute (1 par défaut, de −10 à 10, négatif
  pour l'autre sens) ; saisir une vitesse lance la rotation, décocher l'arrête. Les deux existent en
  paramètres d'adresse : `date=AAAA-MM-JJ` et `rotation=<tr/min>`. « Copier l'adresse » les y
  écrit : coller l'adresse rouvre la même scène, au même jour, tournant pareil. La rotation tient
  quand la scène se reconstruit (tuiles de l'orthophoto).

- **Spécification : la palette dans backprod** (`MD/spec-palette-plateforme.md`). Une palette par
  produit (« palette admin ») et une par tenant, résolues jeton par jeton sur les couleurs d'origine,
  réglées par le `PLATFORM_ADMIN` (permission `staff.palette.manage`), le `TENANT_ADMIN` en v2
  (`skin.manage` + `white_label`). Jetons déclarés par le produit dans son manifeste, palette du
  tenant rangée avec l'habillage existant, historique restaurable, audit, ordre de travail en neuf
  étapes. Documentation seulement.
- **Admin : l'écran de la palette** (`/?palette`, derrière la porte de l'admin comme l'écran des
  contrôleurs ; `?admin&ecran=palette` y mène aussi). Trois onglets :
  - **Palette** : une planche d'ambiance (bois, papier, encre, jardin, brique, ciel, chambre noire,
    les trois polices), la structure des 29 jetons en sept familles avec leur rôle et leurs deux
    valeurs, et les contrastes exigés par le test (verdict écrit en toutes lettres) ;
  - **CSS** : les variables telles que la feuille les déclare (clair, sombre, polices, rayons), à
    copier, puis les jetons en situation sur de vraies commandes, et les rayons et ombres ;
  - **Typo** : serif, sans et monospace (rôle, pile, alphabet, usages) et l'échelle des tailles.

  Chaque panneau pose les variables de son thème : clair et sombre se comparent côte à côte, quel
  que soit le thème du système. L'onglet se retrouve par l'adresse (`#css`, `#typo`). Les rôles,
  les polices et les rayons vivent dans `styles/jetons.ts` ; un test vérifie que la feuille déclare
  les polices et les rayons à l'identique.
- **Admin : la palette se règle et vit sur le serveur.** Les couleurs de l'interface sont un fichier
  JSON sur le serveur web (`admin/palette`, `.palette.json` à côté des démos ; routes ajoutées à
  `deploy/admin.php` et à `buildsg/demosAdmin.mjs`). Chaque page de Plan le lit au démarrage, sans
  session, et le pose par-dessus la feuille ; sans fichier, ce sont les couleurs d'origine de
  `styles/jetons.ts`. Dans l'écran de la palette, chaque couleur a, par thème, le sélecteur du
  système, un **sélecteur avancé** (zone saturation × valeur à glisser ou à parcourir aux flèches,
  barre de teinte, champs TSL et RVB, avant/après, contrastes où la couleur intervient, nuancier du
  thème ; Échap ou un clic dehors le ferme, en feuille sur téléphone) et son code `#RRGGBB` (un
  code invalide est signalé, pas appliqué) ; aperçus, contrastes et CSS
  suivent aussitôt, et un contraste insuffisant se dit dans la barre. « Enregistrer sur le
  serveur » (session admin), « Importer un JSON… » (ses couleurs valides remplacent celles de
  l'écran, sans rien enregistrer ; un fichier qui n'est pas une palette est refusé),
  « Exporter le JSON » (`plan-palette.json`), « Annuler les
  modifications », « Couleurs d'origine ». Le document ne remplace que ce qu'il porte de valide
  (`styles/paletteServeur.ts`), et un réglage du thème clair ne déteint pas sur le sombre. Le plan
  dessiné et les exports gardent leurs propres encres.
- **Admin : huit modèles de palette** dans un menu « Modèles » de l'écran de la palette : Eau vive,
  Vert jardin, Fleurie, Zen, Monochrome, Multicolore, Psychédélique, Halloween — chacun avec sa
  description et l'aperçu de ses couleurs dans les deux thèmes. Ce sont des fichiers JSON
  `plan-palette` (`src/styles/modeles/*.json`, embarqués dans le fichier livré), engendrés par
  `scripts/generer-modeles-palette.mjs` à partir de quelques teintes : le script pousse chaque
  couleur de texte jusqu'au contraste exigé, et un test vérifie que chaque modèle est complet et
  lisible dans les deux thèmes. Choisir un modèle le charge à l'écran sans rien enregistrer ; des
  réglages non enregistrés demandent confirmation, dans la barre de la palette.
- **Admin : un menu « Admin » dans la barre de Plan**, en admin des démos seulement, mène aux
  contrôleurs de l'écran et à la palette. Les deux écrans ont un bouton « Retour au plan ».

- **Contrôleurs : cohérence des déclarations.** La découverte signale un contrôle affiché hors de
  la zone que sa déclaration prévoit (aucun aujourd'hui, dans les trois classes d'écran). Les
  contrôles de feuille le déclarent : ils s'affichent dans chaque zone ouverte en feuille. Les
  boutons, alertes et tableaux sans libellé portent un nom explicite dans l'arbre (« Aligner par
  rotation » au lieu de « aligner ») ; un test l'exige. Les deux commandes « Supprimer » se
  distinguent dans le registre (« Supprimer l'objet », « Supprimer le projet ») ; le groupe
  « Clôture », sans commande, et la nature « objet », vide, sont retirés.
- **Contrôleurs : écritures à surveiller.** Une nouvelle branche de l'arbre classe ce qui modifie
  le projet sans pouvoir être annulé et sans contrôle des droits. L'échelle du plan d'implantation,
  qui écrit dans le projet, passe de la nature « option » à « donnée ». Les réglages du fond
  orthophoto, enregistrés avec le projet, sont déclarés préférences d'affichage.

- **Contrôleurs : la découverte voit le bureau, la tablette et le téléphone.** Elle ne relevait
  l'écran que dans la disposition du bureau, et ignorait ce qui n'existe qu'au doigt. Elle pose
  désormais chaque classe d'écran tour à tour, avec un objet sélectionné et chaque feuille du
  téléphone ouverte, et dit dans quelles classes s'affiche un contrôle qui n'est pas partout. Les
  quatorze contrôles qu'elle a trouvés sont déclarés : barre compacte (Projet et menus, Exporter),
  barre de sélection (Désélectionner, Propriétés, Chiffrage), navigation du bas, familles de
  sections et bandeau de chiffrage de l'inspecteur, choix du projet et déconnexion de l'admin.
- **Contrôleurs : les écrans ouverts à la demande et les fonctions absentes de la démo.** Les
  dialogues, le premier pas, l'import cadastral, l'actualisation IGN, le choix de texture et le
  relevé de façade (75 contrôles) sont déclarés dans le catalogue des contrôles d'interface, avec la
  commande qui ouvre chaque écran : la découverte les montre même fermés. Pour chaque fonction
  d'objet que la démonstration ne porte pas (mobilier, limite), la découverte ajoute en mémoire un
  échantillon, dont les champs sont donc découverts ; la démonstration n'est pas modifiée.
- **Commandes ciblées : masquer un objet, ses étiquettes et chaque geste sur les cotes passent par
  le registre.** Le registre des commandes accepte une cible (un objet, une cote, une valeur). Douze
  gestes qui modifiaient le projet en dehors de lui sont devenus des commandes : ils sont **grisés
  et expliqués sans le droit d'écrire** (une personne en lecture seule pouvait masquer un objet ou
  supprimer une cote), et **masquer un objet ou changer ses étiquettes s'annule** désormais par
  Ctrl+Z (ce n'était pas le cas ; les cotes l'étaient déjà). La découverte les range avec les autres
  commandes et dit sur quoi chacune porte.
- **Contrôles d'interface déclarés : plus rien hors registre à l'écran.** Les 77 contrôles affichés
  qui ne passaient ni par une commande ni par un champ sont déclarés dans un catalogue
  (`app/controlesInterface.ts`, 66 entrées) avec leur clé, leur nom explicite, leur zone et leur
  nature (navigation, affichage, vue 3D, option, sortie, objet, donnée), et marqués
  `data-controle` dans le code ; les prix et cadences du tiroir en font partie. La découverte les
  montre dans la branche « Contrôles d'interface » et l'inventaire « Hors registre » tombe à 0 sur
  ce qui est affiché. Un test garde le catalogue et le code d'accord dans les deux sens.
- **Contrôleurs : branche « Hors registre ».** La découverte mesure aussi ce que le registre ne
  couvre pas : les contrôles affichés qui ne déclenchent ni une commande ni un champ de l'inspecteur,
  rangés par zone (77 dans la démo, contre 145 rattachés), et les fonctions d'objet absentes de la
  démonstration (mobilier, limite), dont les champs ne sont donc pas découverts. Les boutons qui
  déclenchent une commande portent désormais tous `data-commande` ; les lignes répétées de
  l'explorateur et des cotes sont comptées une fois.
- **Contrôleurs de l'écran, pour l'admin** (`?admin&ecran=controleurs`, MD/spec-demos-admin.md).
  Un écran à part découvre dans Plan en marche l'arbre de ses contrôleurs — zones et emplacements,
  registre des commandes, champs de l'inspecteur —, chacun avec sa clé et son nom explicite,
  l'enregistre en JSON sur le serveur, et à la redécouverte signale les nouveaux, les retirés et
  les modifiés. L'écran s'ouvre sur le registre enregistré ; la découverte ne se fait que sur
  demande, au bouton. Aucune action sur le plan. Chaque commande dit son quota, ce qu'elle devient
  sans les droits, si elle est conditionnelle et ses emplacements par classe ; chaque champ, sa
  précision, ce qu'il modifie, s'il s'annule et ce qu'il recalcule ; une liste, ses valeurs permises.
  Pour naviguer : niveau de chaque ligne et « déplier jusqu'au niveau N » (touches 1 à 9), filtre
  par genre, saut d'un résultat à l'autre, branche montrée seule, fil d'Ariane et enfants cliquables.
- **Se déconnecter de l'admin des démos.** En mode admin (`?admin`, `?demofile=<n>`), la barre
  affiche « Admin des démos » et « Se déconnecter » à la place du compte de la plateforme, en haut
  sur bureau et dans la feuille Projet sur téléphone et tablette. La session est fermée chez le
  serveur (`DELETE admin/session`, `io/depotDemos.ts` `deconnecterAdmin`), puis la page se recharge
  sur la porte au mot de passe. Une démo modifiée non enregistrée est demandée avant de partir. Si
  le serveur ne répond pas, la page ne se recharge pas et le dit : la session reste ouverte.

- **La vitrine montre une démo de l'admin : `?mode=demo&file=<n>`.** `file=2` affiche le fichier de
  démo 2, celui que l'admin enregistre, au lieu de la démonstration intégrée. Les autres paramètres
  de la vitrine (`x`, `y`, `zoom`, `orthophoto`, `heureauto`, `pdv`…) s'appliquent de même. La page
  le lit par `admin/vitrine/<n>`, nouvelle route **publique en lecture seule** d'`admin.php` et de
  `buildsg/demosAdmin.mjs` : sans session, sans cookie posé, une minute de cache. La liste,
  l'écriture et la suppression restent derrière le mot de passe. Une démo absente ou illisible
  laisse la démonstration intégrée. Toute démo du dossier devient donc lisible publiquement par son
  numéro.

- **La livraison porte une première démo pour l'admin.** `npm run livraison` écrit
  `livraison/plan-demos/1.json` : la démonstration intégrée (« Parcelle AE 101 »), au format de
  l'export, tirée de `contrat/plan-produit.json`. Ce contrat est déjà gardé identique au code, donc
  la démo n'a pas à être compilée. Le LISEZMOI dit de copier `plan-demos/` à côté de
  `plan-admin-config.php`, hors du dossier publié, sans écraser des démos existantes. Laissé dans
  `public_html/`, il reste refusé par `.htaccess`. Le fichier est vérifié contre le code et relu par
  le validateur de projet (`tests/unit/livraison-demo.test.ts`), et servi par `admin.php` sous PHP.
- **Admin des démos, hors du HTML** (`buildsg/app.js`, MD/spec-demos-admin.md). `?admin` ou
  `?demofile=<id>` demandent un mot de passe vérifié par le serveur (`ADMIN_PASSWORD`), puis ouvrent
  les fichiers de démonstration du dossier `DEMOS_DIR`, au format de l'export JSON. Enregistrer,
  Nouveau, Projets et Supprimer agissent sur ces fichiers ; la version précédente est gardée en
  `.bak`. Sans `ADMIN_PASSWORD`, rien ne change.
- **Déploiement Apache + PHP, sans Node** (`npm run livraison`) : `livraison/` et `livraison.zip`
  portent `index.html`, `.htaccess`, et `admin.php`, le même admin des démos en PHP. Mot de passe
  et dossier des démos dans `plan-admin-config.php`, hors de la racine web.
- **La couleur des toits est lue sur l'orthophoto.** À la création d'un plan depuis une adresse et à
  l'actualisation IGN, Plan regarde l'orthophoto sous le contour de chaque bâtiment (en retrait des
  murs). Une couverture d'une seule teinte, sans arbre ni ombre qui la masque, prend cette teinte.
  Sinon, elle prend la couverture courante la plus proche : tuile rouge, tuile brune ou couverture
  grise. Une couleur choisie dans l'inspecteur n'est jamais recalculée ; sans orthophoto, la tuile
  rouge reste le défaut. L'inspecteur dit d'où vient la couleur (MD/spec-toit-ign.md §6.1).
- **Tuiles ou ardoises sur les toits en 3D.** Une couverture rouge ou brune porte des tuiles, une
  couverture grise des ardoises, teintées par sa couleur ; les rangs suivent l'égout de chaque pan.
  Les textures sont dessinées par l'application, sans téléchargement (MD/spec-toit-ign.md §6.2).
- **Une horloge suit la course du soleil en Vue 3D.** Quand l'ombre portée est cochée, une horloge
  à aiguilles, doublée de l'heure en chiffres, s'affiche en haut à gauche de la scène. Elle tourne
  avec le curseur d'heure (et avec la journée qui court dans la vitrine) : on lit l'instant pour
  lequel les ombres sont calculées.

### Modifié

- **Explorateur : masquer un objet et choisir ses étiquettes sont des préférences d'affichage**,
  comme « Filaire » en Vue 3D. Ni annulation (Ctrl+Z), ni « projet modifié », et permis en lecture
  seule : regarder un plan autrement ne le modifie pas. Les cases restent rangées dans l'objet et se
  retrouvent à la réouverture d'un projet enregistré. Les cotes, elles, gardent le droit d'écrire.
- **Palette : le plan suit la palette** (refonte, lot 3). Le trait, la grille, le halo des
  étiquettes, les poignées et les pastilles de cotes du plan à l'écran reprennent les jetons de la
  palette du serveur (`--ink`, `--rule`, `--paper`, `--accent`, `--panel-bg`, `--on-ink`) dans le
  thème affiché, et le plan se redessine quand elle arrive. Les cotes gardent leur bleu. Les exports
  gardent leurs propres encres : les six empreintes sont inchangées.
- **Palette : une liste à régler, l'aperçu à côté** (refonte, lot 2).
  - Quatre onglets : **Couleurs**, **Contrastes**, CSS, Typo. `#palette`, l'ancienne adresse, mène
    aux couleurs.
  - Les couleurs sont une liste, une ligne par jeton, rangée par famille : le nom et le rôle, le
    réglage de chaque thème montré, et l'état écrit en toutes lettres (« contraste 2,67 »,
    « non enregistrée », « modifiée »). Filtres Toutes, Modifiées, Contraste insuffisant (avec
    leur nombre), et recherche par nom ou par rôle.
  - L'aperçu colle à droite pendant qu'on fait défiler la liste : les commandes de l'atelier ou la
    planche d'ambiance, par thème. Sous 1 024 px il devient une feuille, ouverte par « Aperçu » et
    fermée par Échap.
  - La pastille « n contrastes insuffisants » mène à l'onglet Contrastes, filtré.
- **Palette : la barre et l'aperçu restent vraiment en haut.** Le corps de l'atelier défile
  lui-même ; sur l'écran de la palette, c'est la page qui défile, sans quoi rien ne pouvait coller.
- **Palette : une barre plus claire, et l'on voit ce qu'on enregistre** (refonte, lot 1).
  - Quatre commandes au lieu de six : « Modèles », « Fichier » (importer, exporter), « Revenir »
    (annuler les modifications, couleurs d'origine) et « Enregistrer… ». Les menus se ferment par
    Échap ou par un clic ailleurs.
  - « Enregistrer… » ouvre un récapitulatif : chaque couleur qui part sur le serveur, avant et
    après, et l'avertissement si des contrastes restent insuffisants. Rien n'est envoyé avant
    « Enregistrer sur le serveur ».
  - L'alerte « n contrastes insuffisants » devient un bouton : il mène au tableau des contrastes,
    filtré sur les paires en défaut (une case rend le tableau entier).
  - Sur téléphone, la barre se pose au bas de l'écran, au pouce ; ses menus s'ouvrent vers le haut.
  - Le code de l'écran est rangé dans `zones/ecranPalette/` : l'état et les gestes
    (`edition.ts`), la barre (`barre.tsx`), les vues (`vues.tsx`), ce qu'elles partagent
    (`commun.tsx`) et le sélecteur avancé.


- **Inspecteur : un profil par fonction d'objet.** Ce que la fonction d'un objet lui donne (formes
  admises, sections propres) est décrit une fois, dans `model/fonctions.ts`, au lieu de six
  prédicats répartis dans trois fichiers. Le menu « Fonction » ne propose plus que les fonctions
  qui ont un sens sur la forme de l'objet : terrasse, bâtiment, annexe et terrain pour un polygone,
  parasol pour un cercle. Choisir « Parasol » sur un polygone ou « Terrasse » sur un chemin ne
  donnait aucune section. La fonction en place reste proposée, pour un ancien fichier.
- **Inspecteur : une section « Arbre »** porte le diamètre, la couleur et la texture du feuillage,
  sortis d'« Apparence », comme le parasol a la sienne. Un point de vue ne montre plus « Matière »
  ni « Priorité d'affichage ». Au doigt, « Façades et toit » se range dans la famille Construction.

- **Vue 3D : « Filaire » est une préférence d'affichage (décision produit).** La case ne passe pas
  par l'historique (pas de Ctrl+Z), ne marque pas le projet modifié et reste permise en lecture
  seule ; elle reste rangée dans la construction de la terrasse pour être retrouvée. Deux tests le
  fixent.

- **Code plus propre et mieux tenu (aucun changement de comportement attendu).**
  - **Relevé de façade découpé** : `zones/Releve.tsx` (1 567 lignes) garde l'enchaînement du parcours
    (198) ; chaque étape et ses outils vivent dans `zones/releve/`. Découpage mécanique, sans cycle ;
    les calculs sans React (série de photos, analyse) ont leurs tests.
  - **La logique ne lit plus la page** : les options des menus Fichier et Exporter (remplacer à
    l'import, exporter sans la parcelle, équipements du dossier, échelle du PDF) sont tenues par le
    magasin et données aux commandes — `io/importSvg` ne lit plus de case à cocher. Les curseurs
    orthophoto deviennent des champs contrôlés ; trois synchronisations mortes ou redondantes sont
    retirées (voisinage, grille, case orthophoto disparue).
  - **Code mort** : onze exports et deux couleurs jamais utilisés, retirés.
  - **Descriptions** : les 76 commandes en ont une (glossaire `app/descriptions.ts`) ; les menus et
    la palette les montrent en infobulle.
  - **Couverture de tests** : écouteurs de commandes 14 % → 86 %, rendu du plan 33 % → 74 %, 3D
    30 % → 64 % (93 tests de plus). three.js r128 est en devDependency, pour les tests et la fumée
    seulement : la page le charge toujours depuis le CDN, rien n'entre dans le build.
  - **Fumée de la Vue 3D sans réseau** : three.js servi depuis le paquet npm ; le témoin du GLB
    recalculé pour les tuiles et ardoises (`c41e94e`), la mesure de l'éclairage (point 38) passée
    par le setter natif du curseur. 22, 23, 24 et 38 : 26/26.
  - **Test instable corrigé** : `adminPhp.test.ts` tirait le port de `php -S` au hasard entre 5390
    et 5489 ; tombé sur un service déjà là (1 fois sur 100), six tests échouaient. Le port est
    désormais demandé au système.
  - **Test dépendant du shell corrigé** : `contrat.test.ts` supposait une origine de plateforme vide ;
    il échouait dès que `BACKPROD_API_URL` était exporté pour construire. Il lit maintenant l'origine
    du build. La suite passe avec et sans la variable.
  - **Fumée** : points 49 à 54 — annulation des champs, refus sans étape vide, lecture seule de la
    vitrine, découverte des contrôleurs, relevé de façade de bout en bout sans caméra.
- **L'ombre portée est cochée par défaut en Vue 3D.** C'est ce qu'on vient y voir : la course du
  soleil sur la terrasse. La case reste dans les réglages pour l'éteindre sur un poste lent.
- **Le fond orthophoto est allumé par défaut** sur un plan calé par le cadastre (créé depuis une
  adresse ou un import cadastral) qui n'a pas encore de réglage enregistré. Un plan dessiné à la
  main reste sans fond : il n'est posé que sur le lieu par défaut. Si les tuiles ne se chargent pas
  (hors ligne, hors couverture), le fond s'éteint sans message ; la case permet de réessayer. Un
  fond éteint à la main s'enregistre avec le projet et le reste.
- **La 3D est une fonction de l'offre (`plan.3d`).** La Vue 3D, la visionneuse GLB et l'export GLB,
  les trois portes de three.js, sont gouvernées par la capacité `plan.3d`, que le catalogue de la
  plateforme vend à partir de Pro. Sans elle, les boutons « Vue 3D » et « Visionneuse GLB » et
  l'entrée « GLB (scène 3D) » disparaissent, et three.js n'est jamais demandé au CDN : c'est le seul
  vrai gain réseau des capacités. « Voir ce point de vue » en 3D passe par la même commande. Sans
  plateforme branchée (vitrine, essais), rien ne change.

### Corrigé

- **Lecture seule : trois boutons se grisent enfin.** « Réinitialiser tout » et « Réinitialiser la
  position » (pied de l'inspecteur) et « Enregistrer » (barre d'application) ne lisaient pas l'état
  de leur commande : en lecture seule, ils restaient cliquables et le clic était refusé sans un mot.
  Ils se grisent désormais avec la raison en infobulle, écrite sous les boutons au doigt, comme la
  palette et les menus.

- **Une terrasse est un polygone, partout.** Le contexte terrasse, l'explorateur, la Vue 3D, la
  visionneuse, l'export GLB, le rattachement d'un parasol et la pose d'un nouveau parasol
  acceptaient n'importe quel objet de fonction `terrasse`, alors que l'inspecteur, les résultats
  et le dossier exigeaient un polygone. Un cercle marqué « terrasse » (import SVG, ancien fichier)
  devenait la terrasse courante et faisait échouer le calcul du chiffrage. La définition vit
  désormais dans `model/fonctions.ts` (`estTerrasse`, `terrasseOuPremiere`), avec celles du
  parasol, du bâtiment, du point de vue et de la parcelle du projet (`parcelleDuProjet`, qui
  remplace une copie dans le dossier PDF). La liste des points de vue n'offre plus qu'un objet de
  deux points.

- **Parcelles voisines : plus de réglages de clôture sans effet.** Une parcelle voisine importée du
  cadastre (`fonction: terrain`) montrait le lieu et les quatre champs de clôture, mais la Vue 3D ne
  dessine que la clôture de la parcelle du projet : la modifier écrivait le projet sans rien
  changer. Elle ne montre plus que sa référence cadastrale.

- **Un Ctrl+Z de trop après une longueur, un angle ou le mode rectangle.** Ces trois champs
  empilaient leur propre instantané, et l'inspecteur le sien depuis qu'il les rend tous annulables :
  après deux modifications, il fallait trois Ctrl+Z, le deuxième ne faisant rien. L'inspecteur
  prend désormais l'instantané avant d'écrire et ne l'empile que si l'écriture est acceptée : une
  longueur impossible ne laisse plus d'étape vide. Un test interdit à un champ d'empiler le sien.
- **Les boutons de l'inspecteur respectent la lecture seule.** Supprimer un point, un côté ou un
  coin, « Aligner par rotation » et « Placer au mieux » restaient actifs en lecture seule ; ils sont
  grisés et refusés. Les boutons qui déclenchent une commande (relever, retirer une façade) se
  grisent quand elle n'est pas permise. Chaque bouton déclare désormais sur quoi il agit.
- **Annuler défait tout champ de l'inspecteur.** Seuls quelques champs empilaient un instantané :
  changer une hauteur, un nom, une couleur ne s'annulait pas. Tout champ qui écrit le projet
  s'annule désormais ; une frappe ou un curseur qu'on glisse ne forme qu'un geste, défait d'un seul
  Ctrl+Z. Sur la démo : 31 écritures sans annulation avant, 1 après (créer le projet).
- **La lecture seule refuse aussi les champs et les saisies.** Elle grisait les commandes, mais
  laissait modifier à l'écran les champs de l'inspecteur, les prix, cadences et réglages du tiroir
  (l'enregistrement restait refusé). Ils sont grisés et refusés, en vitrine comme pour un compte en
  lecture seule ; les réglages d'affichage restent libres. L'interrogation du PLU demande la
  permission d'écrire. 81 écritures sans contrôle des droits avant, 0 après.
- **Fumée : un dialogue de mise à jour du modèle ne bloque plus le pilote.** Les points 1, 3, 17 et
  31 échouaient quand le plan de démonstration était d'un schéma antérieur : le dialogue « Mettre à
  jour le modèle ? » interceptait les gestes. `ouvrirDemo` (scripts/captures.mjs) le referme
  désormais par « Garder tel quel ». Les quatre points passent dans les trois classes et les deux
  thèmes (20 sur 20).

### Corrigé

- **Sur le plan, l'ombre des parasols passe devant.** Elle était dessinée sous les objets, et une
  terrasse ou un massif la cachait justement là où elle compte. Elle se pose maintenant sur ce
  qu'elle couvre, carte d'ensoleillement comprise. La toile des parasols, leurs mâts, les cotes et
  les poignées de la sélection restent au-dessus. Le calque reste inerte : les clics le traversent.

### Ajouté

- **Plan se décrit à la plateforme, dans sa propre page.** Le build écrit dans `<head>` d'`index.html`
  un bloc de données `<script type="application/json" id="plan-produit">{"product":"plan",
  "app_version":"2.2.0","schema_versions":[1,2,3]}</script>`. Il est calculé depuis `APP_VERSION` et la
  chaîne des migrations, et ne peut donc pas dériver du code. La plateforme le lit sans exécuter de
  JavaScript : elle récupère `https://plan.raillard.org/` et extrait le bloc par son `id`. C'est de
  quoi tenir `project_schema_versions` à jour sans saisie. `/?version` montre le même JSON dans un
  navigateur, sans porte ni appel à la plateforme. Le bloc n'est pas un script exécuté : la politique
  de contenu ne le nomme pas. `verifier-paquet` refuse un paquet qui ne le porte pas, et
  `verifier-deploiement` le contrôle en ligne (`src/model/produit.ts`, `src/app/version.ts`).

- **Chaque bâtiment IGN a un toit, rouge, posé sur son contour réel** (`MD/spec-toit-ign.md`). À
  l'import d'une adresse, à l'actualisation IGN et à l'import du voisinage, la hauteur du toit est
  lue dans la BD TOPO (`altitude_maximale_toit − altitude_minimale_toit`) et posée sur le
  **squelette droit** du contour (`geometry/squelette.ts`) : un toit à croupes qui vaut pour un L,
  un T ou un U — un faîtage par aile, une noue à chaque angle rentrant —, et qui se confond avec le
  quatre pans sur un rectangle. La pente se déduit (`atan(H / profondeur du squelette)`) ; sept
  règles traitent les cas limites : construction légère ou toit trop bas, toit plat ; hauteur absente,
  35° estimés et dits ; pente au-delà de 55°, écrêtée à 45° (`model/toitBdTopo.ts`). Un toit lu sur
  une photo ou saisi n'est jamais remplacé par l'actualisation ; un toit BD TOPO y est recalculé en
  gardant sa couleur. La couverture par défaut passe au **rouge tuile** (`#B0432F`), pour tout toit
  sans couleur choisie. Dans l'inspecteur : la forme « Croupes (pans sur chaque mur) », la pente et
  l'origine de la hauteur en note (« déduite de la BD TOPO (± 1 m) », ou « estimée »), plus
  d'orientation de faîtage pour elle ; « Non modélisé » ne se choisit plus sur un bâtiment qui a un
  toit (« Toit plat » le remplace, et l'actualisation le respecte).

- **La maison de la démonstration a son toit.** Un toit à croupes rouge de 3 m, saisi, sur son
  contour à quatorze côtés (`model/demo.ts`). La démonstration s'écrit désormais au **schéma 3** :
  la plateforme doit l'accepter pour l'ouvrir — la copie publiée (`contrat/plan-produit.json`,
  `demo_project`) porte ce toit et ce schéma. Témoins : `projet.json` (le toit, le schéma) et
  `plan.svg` (le schéma) recapturés, `glb-structure.json` calculé (+14 mailles, un pan par côté)
  en attendant une recapture avec le réseau ; les quatre autres inchangés
  (`tests/fixtures/golden/EMPREINTES.md`).

- **Schéma de projet 3 : un plan d'une version précédente reçoit ses toits à l'ouverture.** La
  migration 2 → 3 pose le toit BD TOPO sur chaque bâtiment importé qui n'en avait pas ; l'altitude
  maximale du toit n'étant pas enregistrée avant, sa hauteur est estimée (35°) jusqu'à la prochaine
  actualisation, qui la lit. Le projet s'enregistre au schéma 3 à la modification suivante.
  `contrat/plan-produit.json` accepte désormais `[1, 2, 3]` : **à recopier dans backprod avant la
  livraison**, sans quoi la plateforme refusera l'enregistrement (`422 UNSUPPORTED_SCHEMA_VERSION`).

- **La limite de projets est celle de la plateforme, et se dit.** Plan lit désormais le quota que
  backprod applique à la création et à la copie d'un projet, `max_projects`, au lieu de
  `plan.documents`, un compteur que rien n'alimente : il ne se croyait jamais à la limite. Il compte
  comme la plateforme (refus dès `utilisés >= limite`), en prenant aussi les projets qu'il voit dans
  la liste, car le contexte mis en cache peut retarder. À la limite, « Nouveau projet » (copie) et
  « Nouveau plan depuis une adresse… » restent cliquables et ouvrent un dialogue « Limite de projets
  atteinte ». Il donne les nombres (« 3 projets pour 3 autorisés par son abonnement »), dit quoi
  faire et renvoie à la plateforme. Un refus `QUOTA_EXCEEDED` de la plateforme se dit par la même
  phrase, avec ses nombres, au lieu du code brut. L'écran du premier pas reprend cette phrase.
  Remplir un projet neuf (document `{}`) ne crée rien et n'est donc pas limité
  (`plateforme/quotaProjets.ts`, `app/limiteProjets.ts`).

- **Le nombre de projets se voit : « Projets 1/3 ».** Une pastille à côté du choix du projet (barre
  du bureau, feuille Projet sur téléphone et tablette) montre combien de projets l'organisation
  tient sur combien son abonnement en autorise, compté comme la plateforme. À la limite, elle dit
  « limite atteinte » et prend une bordure d'alerte. Le compteur est affiché dès que la plateforme
  est branchée : « Projets 4/∞ » sur une offre illimitée, « Projets 4 » sur une offre sans quota de
  projets (il était d'abord masqué dans ces deux cas, et donc invisible sur un compte Scale).

- **Un projet reçu vide (`{}`) est un projet neuf.** Quand la plateforme rend un projet dont le
  document est vide — créé pour Plan, jamais rempli —, Plan l'ouvre en plan vierge, sous son nom, et
  propose aussitôt la saisie d'une adresse (import cadastre). À la fin du parcours, le plan est
  enregistré **dans ce projet-là** (« Remplir le projet »), sous le nom donné chez la plateforme, au
  lieu d'en créer un second. Un document d'un autre produit reste refusé comme avant
  (`io/depotPlateforme.ts`, `io/api.ts`, `app/importCadastre.ts`).

- **Isoler la terrasse.** Une terrasse sélectionnée s'isole d'un bouton : sur le plan, à côté
  d'« Ajuster à la sélection » (bureau) ou dans le groupe flottant (téléphone, tablette) ; en 3D,
  dans les commandes de la scène. Elle seule reste affichée. Les autres objets, leurs ombres de
  parasol et la clôture de la parcelle sont masqués à l'affichage, sans toucher à leur `hidden`.
  La terrasse passe en transparence pour montrer sa structure : ses couches sur le plan, ses
  lambourdes et ses solives sous des lames translucides en 3D. La vue se cadre sur elle.
  Rebasculer, ou sélectionner autre chose, ou rien, rend exactement la vue d'avant : le cadrage du
  plan et, en 3D, la position de la caméra. L'isolement n'entre pas dans le projet
  (`src/app/isolement.ts`, commande `terrasse.isoler`).

- **Une vitrine publique : la Vue 3D du plan de démonstration**, à
  `https://plan.raillard.org/?mode=demo&x=1024&y=768`, pour la page d'accueil du catalogue de la
  plateforme. Elle ne passe pas par la porte : elle ne demande aucun compte, n'appelle pas la
  plateforme et n'écrit nulle part. Elle montre la démonstration embarquée, en lecture seule, avec
  la terrasse sélectionnée. `x` et `y` donnent la taille de la scène en pixels (bornée de 200 à
  3 840). Sans eux, la scène prend la fenêtre, ce qui convient à un `<iframe>` déjà dimensionné.
  On peut tourner et zoomer, mais pas enregistrer d'image ni poser de point de vue
  (`src/app/vitrine.ts`).
- **`zoom=` règle le cadrage de la vitrine** : `?mode=demo&x=1024&y=768&zoom=2` place la caméra à
  mi-distance de ce qu'elle vise, `zoom=0.5` deux fois plus loin. Le facteur est borné de 0,25 à 8
  et accepte la virgule. Il s'applique une fois la scène prête, la bibliothèque 3D se chargeant à
  la demande.
- **`orthophoto=y` pose la photo aérienne de l'IGN sous la scène de la vitrine** ; `orthophoto=n`,
  ou rien, s'en passe. Les tuiles viennent de data.geopf.fr, déjà autorisé par la politique de
  contenu. La scène s'ouvre sans elles, puis se reconstruit quand elles arrivent, à la même place de
  caméra : le `zoom` demandé est gardé.
- **`heureauto=y` fait courir le soleil sur la journée du jour** dans la vitrine, de `hrsstart` à
  `hrsend`, puis recommence. Les heures sont locales et s'écrivent `14`, `14:30` ou `14h30` ; par
  défaut, de 7 h à 20 h. Une course dure 30 secondes, et les ombres suivent. La progression se règle
  sur l'horloge et non sur le nombre d'images : un onglet ralenti reprend à la bonne heure. Des
  bornes inversées se lisent dans l'ordre ; deux heures égales, ou `heureauto=n`, laissent le soleil
  immobile.
- **`duree=` règle la vitesse du soleil de la vitrine** : le nombre de secondes d'une course de
  `hrsstart` à `hrsend`. Par défaut 30, borné de 5 à 3 600, virgule acceptée.
- **`pdv=` place la caméra de la vitrine sur un point de vue du plan.** On le désigne par son nom,
  sans égard aux majuscules ni aux accents (`pdv=entree`, `pdv=Fenetre%20cuisine`), par son rang à
  partir de 1 (`pdv=2`), ou par un début de nom s'il n'y en a qu'un. Un point de vue inconnu laisse
  le cadrage par défaut. `zoom` s'applique ensuite, depuis le point de vue.
- **Les ombres sont cochées d'office dans la vitrine, et seulement là.** Dans l'atelier, elles
  restent à la demande : elles coûtent cher à calculer et changent à chaque heure.
- **Le `.htaccess` laisse la plateforme encadrer la vitrine, et elle seule.** Pour `?mode=demo`,
  il retire `X-Frame-Options` et remplace `frame-ancestors 'none'` par l'origine de la plateforme
  et sa jumelle (`https://www.raillard.org https://raillard.org`). L'atelier reste non encadrable.
  `npm run verifier-deploiement` contrôle les deux en ligne. Côté backprod, la page d'accueil doit
  autoriser `https://plan.raillard.org` dans son propre `frame-src`.

### Modifié

- **Relevé de façade : la hauteur du mur se mesure sur la photo.** Seule la largeur est connue — elle
  se lit sur le plan ; la hauteur du cadastre, à laquelle le bâtiment est extrudé par défaut, n'est
  qu'une estimation. Les quatre coins posés sur la photo sont l'image d'un rectangle, dont la
  perspective fixe les proportions quand la focale est connue (Zhang et He) : la largeur du plan les
  met à l'échelle, la hauteur à l'égout en découle. Sur plusieurs photos, une première passe à la
  hauteur estimée donne la largeur de l'assemblage, et le rapport à la largeur du plan corrige la
  hauteur. L'étape des coins ne demande plus la hauteur ; l'étape Vérifier l'affiche, mesurée, à côté
  de celle du bâtiment jusqu'ici, et la corrige si besoin — la façade s'étire alors en hauteur,
  ouvertures comprises. Un écart de plus de 25 % est signalé (`facade/analyse.ts`,
  `facade/mosaique.ts`, `zones/Releve.tsx`).
- **Chaque façade relevée redéfinit le toit du bâtiment.** Sur un pignon, la photo porte le triangle
  du toit, lu à la même échelle que le mur : la façade donne la hauteur à l'égout et celle du
  faîtage. Le toit lu sur la façade remplace celui du bâtiment — y compris un toit saisi à la main ;
  la case « Remplacer le toit du bâtiment par celui-ci » part cochée et se décoche pour garder
  l'ancien. La visée cadre aussi le pignon d'un toit déjà connu (`hauteurPignon`, `facade/toit.ts`).
- **Le LiDAR est désactivé** (`LIDAR_ACTIF`, `ui/releve/profondeur.ts`). Safari n'y a pas accès, et
  même dans le module natif iOS sa portée — environ 5 m — est en deçà du recul qu'il faut pour
  photographier une façade avec son pignon. Dans le module natif, la page se comporte désormais comme
  dans Safari ; le code du canal reste, éteint. La visée n'annonce plus le LiDAR ni Plan Capture.
- **Les repères de la visée encadrent les bords du mur, seulement.** Le mode « Égout et sol »
  supposait la hauteur connue ; il disparaît.

### Corrigé

- **Les massifs ne scintillent plus sur la photo aérienne en Vue 3D.** La photo était tirée vers la
  caméra par un décalage de profondeur, pour passer devant le terrain posé 1 mm plus bas. Ce
  décalage croît avec la pente du sol vu de biais, et une couche vaut environ un pixel d'écran. De
  loin et de bas, la photo passait donc devant tout volume de moins de deux pixels de haut : un
  massif de 20 cm vu à 80 m. C'est le sol vert, la couche la plus basse, qui est désormais reculé ;
  la photo n'a plus de décalage, et le terrain qu'elle recouvre n'est plus dessiné sous elle.
  Mesuré sur le plan de démonstration : la photo recouvrait jusqu'à 41 % des pixels des massifs,
  caméra à 80 m et à 2 m de haut, et 81 % à 100 m et 1,5 m. Désormais, aucun, à toutes les
  distances mesurées ; et le sol ne perce jamais la photo, jusqu'à 150 m à 1 m de haut.

- **Le grand-angle d'un iPhone en français ouvrait la mauvaise caméra.** iOS y nomme sa caméra
  virtuelle « Dual Wide » « Caméra arrière double grand-angle » : Plan la prenait pour l'ultra
  grand-angle, et comme iOS la démarre à 1×, le bouton « 0,5× » ne changeait rien au cadrage — avec
  un champ de 108° appliqué à une image de 67°, donc des distances fausses. Les caméras virtuelles
  (double, triple) sont maintenant reconnues avant le grand-angle, et un nom en « ultra » passe
  devant (`facade/objectifs.ts`). Si le grand-angle refuse de s'ouvrir, la visée revient à
  l'objectif principal et le dit, au lieu de rester noire.
- **Assemblage de plusieurs photos : un décalage entre deux cases n'est plus manqué.** La recherche
  grossière ne gardait que son meilleur décalage à 10 cm près ; le pic de ressemblance d'un mur uni
  percé de baies nettes est plus étroit, et un vrai décalage tombé entre deux cases y paraissait
  médiocre — deux photos se posaient alors l'une sur l'autre. Les meilleurs pics locaux sont
  maintenant tous affinés au pixel (`decalage`, `facade/mosaique.ts`).

- **Seul un `401` ferme la session.** « Déjà connecté à la plateforme, j'arrive sur la page de
  connexion de Plan, avec la pastille verte. » La reprise de session au démarrage confondait toute
  défaillance avec « personne n'est connecté » : une plateforme lente, un `5xx`, un appel bloqué par
  le navigateur menaient au formulaire. Ils mènent maintenant à l'écran de panne, avec sa référence
  et un bouton **Réessayer** qui refait la reprise sans recharger la page. En cours de travail, un
  renouvellement qui échoue autrement que par un `401` garde la session : l'appel échoue, et le
  renouvellement anticipé se réessaie quinze secondes plus tard. C'est la règle que le frontend de
  la plateforme a adoptée avec son ADR-062 (`src/plateforme/session.ts`, `src/app/porte.ts`).
- **Un renouvellement à la fois.** Deux appels qui prennent un `401` ensemble partagent le même
  `POST /auth/refresh` au lieu d'en envoyer deux avec le même cookie.

  Les deux autres causes du symptôme étaient côté plateforme et y sont corrigées (backprod,
  26-27 septembre) : le cookie resté sans `Domain` après la pose d'`AUTH_COOKIE_DOMAIN`, lu comme un
  vol et révoquant toutes les sessions du compte, et la course entre la plateforme et Plan qui
  renouvellent ensemble le même cookie.

## [2.2.0] — 2026-09-29

### Ajouté

- **« Mettre à jour le modèle ».** À l'ouverture d'un projet enregistré à un schéma antérieur,
  Plan propose de l'enregistrer dans la forme actuelle, en disant ce qu'elle apporte ; « Garder tel
  quel » est retenu pour ce projet et ne revient pas. La même commande est dans le menu Fichier tant
  que le projet est en retard. Les migrations d'un schéma au suivant s'appliquent à la lecture
  (`src/model/migrations.ts`) : mettre à jour ne transforme rien, cela déclare.
- **`contrat/plan-produit.json`** : ce que Plan attend de la plateforme — les schémas qu'il écrit et
  le document de la démonstration —, engendré et vérifié par un test. Backprod le recopie pour que
  sa configuration et son monde d'essai ne prennent plus de retard sans que rien ne le dise
  (`contrat/SOURCE-PRODUIT.md`).


- **Le relevé de façade.** On sélectionne un bâtiment, on choisit un de ses murs, le téléphone le
  photographie, et Plan en tire, **dans le navigateur, sans serveur** : l'élévation redressée à
  l'échelle, les **ouvertures** (fenêtres, portes-fenêtres, portes, garages) avec leurs **cotes au
  centimètre**, et la **forme du toit** (plat, appentis, deux ou quatre pans) avec la hauteur de son
  faîtage. La photo est posée sur le mur **et sur son pignon** en 3D, les ouvertures y ont un
  encadrement en relief, le toit coiffe le bâtiment ; sur le plan, les baies du rez-de-chaussée
  coupent le trait du mur comme sur un plan d'architecte. Spécification :
  [`MD/spec-releve-facade.md`](MD/spec-releve-facade.md).

  Le parcours tient en cinq temps, plein écran dans les trois classes d'écran : choisir le mur sur le
  contour, **se placer** — distance au mur, consigne pour atteindre la **distance cible (3 m par
  défaut)**, aplomb du téléphone —, placer les quatre coins (proposés d'après la distance, avec une
  loupe, et qui peuvent déborder de la photo), analyse, vérification. Tout se corrige au doigt, rien
  n'est écrit avant « Valider », qui écrit en un seul pas d'historique.

  **La distance vient de la meilleure source disponible** : le **LiDAR** de l'iPhone par le nouveau
  module natif (`native/ios/`, voir plus bas), la réalité augmentée WebXR sur Android, et partout
  ailleurs la taille connue du mur rapportée à sa taille dans l'image. Une photo importée donne sa
  focale exacte par son EXIF.

- **Plan Capture, le module natif iOS** (`native/ios/`). Safari ne donne pas accès au LiDAR : une
  application minimale héberge Plan tel quel dans une vue web transparente posée sur une vue ARKit,
  envoie la profondeur mesurée au centre de l'image dix fois par seconde, et prend la photo avec la
  focale exacte de l'objectif. Plan le détecte seul ; rien ne change pour le navigateur. **Les sources
  Swift n'ont pas été compilées** (écrites sans Xcode) — le README dit quoi vérifier en premier.

- **Section « Façades et toit » dans l'inspecteur d'un bâtiment** : une ligne par mur (orientation,
  longueur, ouvertures relevées, Relever / Refaire / Retirer) et les champs du toit — forme, hauteur
  du faîtage avec sa pente, direction du faîtage, couverture. Deux commandes, `facade.relever` et
  `facade.retirer`, placées dans les trois classes d'écran.

- **Le grand-angle (0,5×) dans la prise de vue du relevé de façade.** À 3 m, il voit deux fois plus
  de mur que l'objectif principal. Sur iPhone, Plan reconnaît l'ultra grand-angle parmi les caméras
  et l'ouvre ; sur Android, il applique le zoom inférieur à 1 que la caméra accepte. Le choix
  « 0,5× grand-angle / 1× » n'apparaît que si le téléphone l'offre, et le champ de l'objectif se
  règle et se retient pour chacun (108° par défaut pour un 13 mm, déduit du zoom sur Android).
  Spécification : `MD/spec-releve-facade.md` §5.6, avec sa limite — la distorsion d'un
  grand-angle Android non corrigée.
- **Plusieurs photos pour une façade, quand on manque de recul.** On photographie le mur par
  morceaux qui se recouvrent, de gauche à droite ; Plan redresse chacun à la même échelle (ses
  proportions se lisent sur la photo grâce à la focale), les aligne sur leur partie commune et les
  assemble en une seule élévation, recalée sur la largeur du mur. Il dit quand deux photos se
  raccordent mal. L'étape des coins montre la série en vignettes, avec « Ajouter une photo ».
  Spécification §6.1.

- **Les murs en L : deux hauteurs d'égout sur un même mur.** Une partie à étage prolongée par une
  partie basse (garage, extension) se relève en posant, en plus des coins, deux points au
  décrochement. Plan en mesure la position et la hauteur d'égout de la partie basse (le coin caché
  au-dessus d'elle se construit par intersection de droites, il n'est pas deviné), écarte ce qui
  dépasse de son égout, lit le toit au-dessus de la partie haute seulement, et coupe le bâtiment en
  deux volumes en 3D : la partie basse prend la profondeur du pignon adjacent, la photo se pose en L.
  Spécification §6.2.

### Modifié

- **Le schéma du projet passe à 2** (`RELEASE.md` §3.1) : un bâtiment peut porter `facades` et
  `toit`. Ils ne sont écrits que s'ils existent, donc un projet sans relevé garde exactement sa forme.
  Un fichier de schéma 1 s'ouvre sans migration ; un fichier de schéma 2 est refusé par la `2.1.0`,
  qui en perdrait les relevés au premier enregistrement.
- Quatre jetons de couleur pour la scène de prise de vue (`--camera-bg`, `--on-camera`,
  `--camera-ok`, `--camera-alerte`), identiques dans les deux thèmes : une caméra se regarde sur
  fond sombre. Leurs contrastes sont vérifiés par le test des jetons.

- **Plus de distance cible : la distance est mesurée, et Plan dit ce qu'elle permet.** Au LiDAR
  (module natif) ou en réalité augmentée, il calcule ce que l'image couvre : une photo suffit, ou
  N photos en se décalant d'environ P m, ou — alerte — la hauteur ne tient pas et il faut reculer à
  Y m. **Sans capteur, une alerte le dit** (Safari n'a pas accès au LiDAR), et les repères restent
  pour une estimation affichée comme telle. Le module natif envoie désormais la géométrie de son
  image avec chaque mesure. Spécification §5.4.

### Corrigé

- **La démonstration ne s'ouvrait pas** sur une plateforme dont le produit Plan n'accepte que le
  schéma 1 : Plan écrivait `2` sur tout document. Un document s'écrit désormais au **plus petit
  schéma qui le décrit** — 1 sans relevé ni toit, 2 avec —, jamais sous celui d'un projet mis à jour.
  Les témoins `projet.json` et `plan.svg` reviennent au schéma 1 ; ramenés au numéro de version
  de la 2.0.2, ils rendent ses empreintes au bit près.
- Un refus `422 UNSUPPORTED_SCHEMA_VERSION` se dit en clair : quel schéma, lesquels sont acceptés,
  et qu'un administrateur doit l'ajouter à `project_schema_versions` du produit Plan.


- **Vue 3D : le fond orthophoto ne scintille plus avec le socle du terrain.** Le sol, le terrain,
  l'orthophoto et les chemins à plat étaient posés à quelques millimètres les uns des autres ; vus de
  loin ou en rasant, surtout sur téléphone où le tampon de profondeur est moins fin, deux couches
  voisines se disputaient les mêmes pixels. Chacune a maintenant son rang (décalage de polygone,
  `COUCHES_SOL` dans `three/primitives.ts`), qui fixe leur ordre à toute distance ; les photos du
  relevé posées devant les murs en profitent aussi.
- Une photo livrée par le module natif restait en attente si la page était un instant cachée :
  l'image se chargeait par `decode()`, qui attend que la page soit visible. Elle se charge
  maintenant par `onload`.

### Interne

- **Les six témoins sont recapturés à la `2.2.0`, avec la preuve forte** : ancien numéro,
  ancienne date de build et ancien numéro de schéma remis dans les octets frais, les six empreintes
  de la `2.0.2` reviennent au bit près, à tailles identiques. Le relevé de façade — et la `2.1.0`,
  que la dernière capture n'avait pas vue — n'ont déplacé aucun octet exporté.
- 852 tests, dont 84 pour le relevé : géométrie des façades, cadrage, objectifs, homographie, redressement d'une photo
  synthétique en perspective, ouvertures au centimètre, pignon reconnu et faîtage orienté, EXIF,
  sérialisation conditionnelle, mailles et coordonnées de texture 3D, assemblage de plusieurs
  photos, plan de prise, murs en L et découpe du bâtiment.

Alignement sur l'architecture (`MD/architecture.md`). **Aucun changement de comportement hors les
défauts corrigés ci-dessous** : le moteur n'est que déplacé, l'oracle et les six empreintes ne
bougent pas.

### Modifié (depuis la 2.1.1)

- **Le tiroir des résultats est en React** (`zones/resultats/`) : nomenclature et débits, coupe,
  implantation, chantier, méthode, cotes, PLU et résumé, plus le tableau d'optimisation de
  l'inspecteur. Les panneaux gardent leurs identifiants et leurs textes. `ui/terrassePanels.ts`,
  `ui/mesurePanel.ts` et `ui/tables.ts` disparaissent ; le balisage des panneaux quitte `index.html`.
- **Le chiffrage refait par le tiroir ne dépend plus de l'onglet ouvert** : `construction.bom`
  s'écrit au rafraîchissement (`app/resultats.ts`), jamais pendant un rendu.

- **La Vue 3D et la visionneuse sont en React** (`zones/vue3d/`) : réglages, soleil, points de vue,
  boutons de caméra, plein écran. La scène reste du WebGL natif ; son hôte s'enregistre dans
  `three/etat3d.ts` (`hotes3d`), et `three/` ne lit ni n'écrit plus aucun identifiant de la page :
  il publie ce que les panneaux affichent (`affichage3d`, `signaler3d`). Leur balisage quitte
  `index.html`, `app/ecouteurs/cloture.ts` disparaît, le registre des commandes ne lie plus
  d'élément du DOM (`lier`, `bouton`).

- **Les trois parcours du Z8 sont en React** (`zones/Parcours.tsx`, `zones/parcours/`) : import
  cadastral en trois étapes, actualisation IGN, choix d'une texture. Leur logique quitte `ui/` :
  `app/importCadastre.ts` (l'état et les gestes de l'import, sans DOM), `app/actualisationIgn.ts`,
  `io/polyhaven.ts`. Un seul parcours ouvert à la fois (`app/parcours.ts`), fermé par Échap ou le
  voile. `ui/cadastreDialog.ts` (dont une fonction de 766 lignes), `ui/projectBar.ts` et
  `ui/texturePicker.ts` disparaissent ; les styles en ligne deviennent des classes à jetons.
- **« Actualiser IGN » se grise pendant une actualisation** au lieu de réécrire le libellé du bouton
  qui l'avait lancée ; la commande ne dépend plus d'un bouton source.

### Corrigé (depuis la 2.1.1)

- **D-16 : les saisies du tiroir s'annulent et marquent le projet modifié** — prix réels, prix par
  barre et au m², longueurs achetables, prix des vis et des plots, conditionnement, équipe, heures,
  cadences, échelle d'implantation, et toutes les actions du panneau Cotes. Elles passent toutes par
  `app/resultats.ts`.
- **Générer un .glb ne réécrit plus le texte du bouton qui l'a lancé.** C'était un bouton React (menu
  Exporter, visionneuse) : réécrire son texte détruisait des nœuds que React croyait à lui.
  L'opération en cours se publie (`affichage3d.generation`) et les boutons la lisent.
- **« Copier le résumé » est une commande** (`export.copierResume`) et non plus un clic simulé sur un
  bouton d'un autre panneau.
- **D-17 : « Enregistrer la vue comme point de vue » exige le droit d'écrire** : en lecture seule, la
  commande est grisée, avec le motif, comme toute écriture.
- **D-18 : le double toucher ne recule plus un objet en lecture seule**, comme le double-clic.
- **D-19 : l'export GLB ne tombe plus quand une texture n'a pas pu se charger** (hors ligne, Poly
  Haven injoignable) : ces objets partent en couleur unie, et un message dit combien.
- **D-2 : un export GLB sans scène 3D dit pourquoi** — le navigateur a refusé WebGL — au lieu de
  « Cannot read properties of null ».
- **`node scripts/fumee.mjs <adresse>` joue contre l'adresse donnée** : l'argument n'atteignait pas
  `captures.mjs`, qui ouvrait toujours `localhost:5199`.
- **D-4 à D-11 : une donnée mal formée est refusée au lieu de passer en `undefined` ou `NaN`.** Une
  date illisible ne fait plus lever le curseur de semaine ni poser le soleil en `NaN` ; un point
  « x,y » incomplet d'un SVG importé est écarté ; un indice de côté ou de sommet hors de la forme ne
  l'édite pas ; un objet sans couleur est blanc en 3D sans avertissement de Three.

### Modifié (architecture) (depuis la 2.1.1)

- **Plus aucune fonction de plus de 150 lignes** (FF-10 sans exception) : `construirePDF`,
  `objetsDepuisCadastre` et `brancherPointeur` se découpent en fonctions nommées — une par
  morceau de page, par famille d'objets importés, par poignée. Le cliquet de onze fichiers ouvert
  le 27 septembre est vide.
- **Les exports sont regénérés à chaque `npm test`** (FF-4) : SVG, DXF, résumé, plan PDF et
  dossier PDF sortent du code et se comparent aux témoins. Le test d'avant hachait seulement les
  fichiers témoins. Premier passage : les cinq identiques.
- **`objetsDepuisCadastre` a un témoin** (`tests/fixtures/golden/cadastre-objets.json`) : un
  import complet figé — propriété fusionnée, limite interne, voisine, bâti, haie, végétation,
  arbres estimés, PLU — dont la sortie doit rester identique.
- **Intégration continue** (`.github/workflows/ci.yml`) : types, lint, cliquet, client de la
  plateforme, tests, build, absence de secret dans le fichier livré et budget de 5 Mo (FF-5), sur
  chaque demande de fusion et chaque poussée sur `main`. Jusqu'ici, ces vérifications ne tournaient
  que chez qui pensait à les lancer.
- **Le moteur n'a plus d'import circulaire** (FF-1). `construction`, `bom`, `debit`, `structure` et
  `layers` s'importaient en quatre boucles. Trois modules en sortent, sans retouche du code :
  `engine/portees.ts` (sections, portées, charges), `engine/prix.ts` (prix et longueurs de stock) et
  `engine/optimisation.ts` (l'optimiseur de structure).
- **`tests/unit/architecture.test.ts` lit toutes les formes d'import** : sur plusieurs lignes, les
  re-exports, `import()` et les chemins `../../`. Les modules des sous-dossiers échappaient jusqu'ici
  à la règle des couches. Le même fichier vérifie maintenant l'absence de cycle.
- **ESLint porte FF-9 et FF-10** : aucun `any` dans `model`, `engine` et `geometry`, et aucune
  fonction de plus de 150 lignes, avec un cliquet par fichier pour les onze qui en ont déjà une.
- **`boot()` n'est plus une fermeture de mille lignes** : ses enveloppes rejoignent
  `app/assemblage/` par famille (surface et calques, dessin, affichage, cadrage, cotes, gestes, vues
  3D, exports), et `boot.ts` les compose en cinq fonctions. L'ordre d'enregistrement des écouteurs et
  d'empilement des calques est inchangé ; la liste de fumée se joue à l'identique avant et après. Le
  cliquet FF-10 passe de sept fichiers à quatre, aux plafonds abaissés.
- **`buildThreeScene` passe de 629 lignes à moins de 100** (D-12) : les briques de la scène vont dans
  `three/primitives.ts`, et la scène se compose de fonctions nommées. Les rendus de la Vue 3D sont
  identiques octet pour octet.
- **Plus aucune assertion `!` dans `src/`** (506 → 0), et ESLint le garde
  (`@typescript-eslint/no-non-null-assertion`). Un indice qu'on sait valide se lit par `au`
  (`util/tableaux.ts`) ou `sommetDe`, qui lèvent une `RangeError` nommée là où `!` laissait passer
  `undefined` ; les tables du moteur par des lecteurs qui nomment leur repli (`essenceDe`,
  `supportDe`, `dimsSection`, `raideurDe`) ; le glisser en cours est une union discriminée.
- **Les assertions `!` des défauts D-4 à D-11 disparaissent**, et avec elles les trois derniers
  `as unknown as` : `geometry/anneau.ts` lit un sommet d'un contour fermé, `util/date.ts` une date
  `AAAA-MM-JJ`, `io/importSvg.ts` ses attributs par des lecteurs nommés ; `Anneau` est un tableau de
  positions GeoJSON typées.
- **« Copier le résumé » est une commande** (`export.copierResume`) et non plus un clic simulé sur un
  bouton d'un autre panneau.
- **D-17 : « Enregistrer la vue comme point de vue » exige le droit d'écrire** : en lecture seule, la
  commande est grisée, avec le motif, comme toute écriture.
- **D-18 : le double toucher ne recule plus un objet en lecture seule**, comme le double-clic.
- **D-19 : l'export GLB ne tombe plus quand une texture n'a pas pu se charger** (hors ligne, Poly
  Haven injoignable) : ces objets partent en couleur unie, et un message dit combien.
- **D-2 : un export GLB sans scène 3D dit pourquoi** — le navigateur a refusé WebGL — au lieu de
  « Cannot read properties of null ».
- **`node scripts/fumee.mjs <adresse>` joue contre l'adresse donnée** : l'argument n'atteignait pas
  `captures.mjs`, qui ouvrait toujours `localhost:5199`.
- **D-4 à D-11 : une donnée mal formée est refusée au lieu de passer en `undefined` ou `NaN`.** Une
  date illisible ne fait plus lever le curseur de semaine ni poser le soleil en `NaN` ; un point
  « x,y » incomplet d'un SVG importé est écarté ; un indice de côté ou de sommet hors de la forme ne
  l'édite pas ; un objet sans couleur est blanc en 3D sans avertissement de Three.
 : React et Zustand
  pour les zones, le plan et les gestes restent en DOM natif. `architecture.md` gagne une carte des
  modules au 27 septembre (§5.2.3), et §9 dit quelles fonctions d'aptitude tournent réellement.

## [2.1.1] — 2026-09-26

Mise en conformité de l'interface avec la maquette de la `2.1.0`. Une revue écran par écran, sur
téléphone, a montré que la structure suivait la maquette mais que trois écrans et le plan lui-même
en restaient loin. **Le code ne change aucun export** : sur le plan témoin, les six empreintes ne
bougent que par le numéro de version.

### Modifié

- **Propriétés.** Les sections se rangent en trois familles, Objet, Géométrie et Construction,
  choisies par une commande segmentée ; au doigt, une seule famille se montre à la fois. Les
  sections des autres familles restent montées : aucun champ ne disparaît, et un brouillon survit
  au changement de famille. Chaque champ tient sur une ligne, libellé à gauche et commande à droite ;
  les listes déroulantes et les lectures y restent, la note passe sous la ligne. La feuille s'ouvre
  en pleine hauteur. Les décimales s'écrivent à la française (« 35,01 m² »), valeurs des pas à pas
  comprises.
- **Chiffrage.** Quatre chiffres clés en tuiles au-dessus de la nomenclature : appuis, lames, bois
  porteur, surface. La nomenclature devient une liste : le poste et son prix, puis la quantité et
  la fourchette en petit. Un pied fixe porte l'estimation HT et deux actions, *Copier le résumé* et
  *Dossier PDF*. Les onglets s'appellent *Nomenclature* et *Coupe*.
- **Plan à l'écran.** Les poignées sont des anneaux à l'accent, les longueurs des côtés des pastilles
  d'encre ; une pastille plus longue que son côté attend qu'on zoome. La trame est un semis de
  points, les axes restent tracés. L'échelle est un trait gradué (« Échelle ── 5 m ») : un rapport
  « 1:100 » dépendrait de la densité de l'écran. Les couleurs des objets restent celles du projet.
- **Choisir un objet cadre la vue dessus**, sur téléphone et sur tablette, quand on le choisit
  dans Objets : sur 390 px, le plan entier rendait la terrasse minuscule et empilait ses
  étiquettes. Toucher un objet sur le plan ne bouge pas la vue, le geste suivant pouvant être un
  glisser. Sur tablette, le cadrage se fait entre le rail et l'inspecteur, au-dessus du tiroir.
- **Tablette.** Une tablette en paysage (jusqu'à 1 399 px, au doigt seul) reçoit la disposition
  tablette et non plus les colonnes du bureau, comme dans la maquette. Le tiroir des résultats
  flotte à droite du rail, qui masquait ses premiers onglets (défaut présent depuis la `2.1.0`) ;
  ses onglets sont des pastilles ; replié — sa hauteur par défaut sur tablette —, il garde les
  chiffres clés de la terrasse et l'estimation HT. Ouvert à mi-hauteur, les panneaux flottants
  s'arrêtent au-dessus de lui ; en pleine hauteur, il passe devant. La carte de sélection s'efface
  quand l'inspecteur est ouvert.
- **Le plan de démonstration prend les couleurs de la maquette** : sauge pour le terrain, bois
  clair pour les terrasses, papier pour la maison. Seules les couleurs changent. Le plan d'origine
  reste la source des golden files, sous le nom `DEMO_TEMOIN_OBJECTS` (`?temoin` en
  développement) : les six exports y sont identiques aux témoins.
- **Feuille de sélection.** Le sous-titre d'une terrasse donne l'essence des lames ; l'estimation
  passe sur deux lignes au lieu d'être coupée.
- **Outils.** Le groupe *Outils* devient *Mesurer*, *Cote* devient *Coter*, comme dans la barre du
  bas ; *Supprimer* ferme le groupe *Éditer*.
- **Accents et décimales** dans les résultats : « Enregistré à », « Qté », « Prix réel », « Estimé »,
  « Réel saisi », et les libellés du moteur (« achetées », « calculé », « débit ») à l'écran
  seulement. Le résumé, fait pour être copié, n'est pas touché.

### Interne

- `scripts/captures.mjs` ouvre vraiment la feuille Chiffrage : la capture de référence de la `2.1.0`
  montrait le plan à sa place, et c'est ainsi que l'écart est passé inaperçu.
- Le pilote de la liste de fumée touche la famille d'une section avant de l'ouvrir, comme un
  utilisateur.
- **Les quarante points de la liste de fumée se jouent, réseau compris.** Huit d'entre eux — import
  cadastre, voisinage, orthophoto, PLU, vue 3D, rappel de point de vue, export GLB et éclairage sur
  téléphone — rendaient « non joué » **sans rien tenter** : une constante du pilote le décrétait,
  parce que la recette de la `2.1.0` tournait sans réseau sortant. Ils ont maintenant une vraie
  implémentation, et un environnement sans réseau les verra échouer avec la mesure qui dit où ça
  s'est arrêté. Un refus mesuré se lit ; un refus décrété se recopie d'un passage à l'autre sans
  que personne ne le rejoue jamais.

  **44 passés, 0 échec, 0 non joué sur 44**, dans les trois classes d'écran et les deux thèmes. Les
  valeurs sont celles des passages manuels de la `1.1.0` et de la `1.2.0` — AC 0530 et 418 m² pour
  l'adresse, neuf objets de voisinage masqués d'un coup, quatre tuiles d'orthophoto, zone psmv
  type U — donc les campagnes redeviennent comparables. Le point 23 tient désormais le défaut D-15,
  qui n'était prouvé que par une vérification à la main.

  Sept corrections ont été nécessaires, **toutes dans le pilote et aucune dans le produit**. La plus
  instructive : le drapeau qui rend un objet masquable vient de l'actualisation IGN et non de
  l'import cadastre, ce que le type du modèle disait déjà.

- **Le témoin `glb-structure.json` est recapturé**, et la note qui annonçait son mouvement est
  corrigée. Le fichier passe de 41 473 604 à 3 234 100 octets, avec 8 images au lieu de 178, comme
  prévu. Mais les vues tampon baissent aussi, de 829 à 659, ce que l'annonce avait omis : chaque
  image embarquée occupe la sienne. Le point 24 vérifie cette arithmétique au lieu de l'immobilité.

## [2.1.0] — 2026-09-25

**L'interface s'adapte au téléphone, à la tablette et au bureau, en clair et en sombre**
(`MD/spec-ihm-mobile.md`). Neuf paliers `alpha`, puis une recette. Rien n'a été perdu : une carte
d'exposition vérifiée par test place chacune des 59 commandes dans chaque classe d'écran, et un
autre test vérifie que l'inspecteur rend les mêmes champs partout. Aucun nombre n'a bougé : les six
artefacts exportés sont identiques aux témoins hors numéro de version.

### En bref

- **Téléphone** : le plan occupe l'écran ; une barre haute (projet, statut, Annuler, Exporter) et
  une barre de navigation (Objets, Coter, **+**, Propriétés, Résultats) ; chaque zone devient une
  feuille qui monte du bas ; une feuille de sélection résume l'objet touché ; les champs sont
  tactiles ; un bandeau recalcule le chiffrage à chaque réglage ; les tableaux deviennent des cartes.
- **Tablette** : rail d'outils, explorateur et inspecteur flottants, tiroir en bas.
- **Bureau** : la disposition en colonnes, avec la nouvelle palette et les icônes.
- **Défauts corrigés** : « Ajuster à la sélection » invisible partout (D1), aucun moyen de sortir
  d'un pointage de cote (D3), filet copiable des exports écrit dans un onglet fermé (D5), Ctrl+S
  affiché mais sans effet (D2), Ctrl+Z hors registre (D6), fond orthophoto visible sans la capacité
  (D8), libellés périmés (D10), dialogues qu'Échap ne fermait pas (D11).

### Corrigé par la recette

- **Valider un nombre par Entrée écrivait deux fois** : Entrée validait, puis la sortie du champ
  validait à nouveau, avec deux instantanés d'annulation — un Ctrl+Z semblait alors ne rien faire.
  Présent depuis la `1.2.0`. Entrée quitte désormais le champ, et c'est la sortie qui valide ; un
  test le verrouille.
- Sur tablette, le tiroir des résultats ouvert recouvrait le bas de l'inspecteur et du rail, et le
  bandeau de pointage : les panneaux passent au-dessus du tiroir, le bandeau se pose en haut du plan.
- Le bouton des réglages 3D n'apparaissait qu'une fois la bibliothèque 3D chargée : il est sorti
  du cadre de la scène.
- Sur téléphone, « Ajuster à la sélection » cadre l'objet au-dessus de la feuille de sélection.
- Tourner le téléphone avec un champ en cours de saisie ne replie plus l'inspecteur et garde le
  brouillon.

### Recette

- **La liste de fumée passe à 40 points**, joués dans les trois classes et les deux thèmes :
  **134 passés, aucun échec, 45 non joués** sur 179 — les points qui demandent le réseau (cadastre,
  voisinage, orthophoto, PLU, 3D, GLB), que l'environnement de recette n'avait pas. Ils restent à
  passer à la main. Détail dans `tests/CHECKLIST-FUMEE.md`.
- `scripts/fumee.mjs` pilote la liste avec de vrais évènements de pointeur, de doigts et de clavier,
  et mesure chaque geste dans l'état du plan ; `scripts/captures.mjs` produit 36 captures de
  référence.
- Trois défauts relevés et laissés hors du périmètre sont inscrits à `MD/DEFAUTS.md` (D-16 à D-18).
- **Empreintes** : `plan.svg`, `plan.dxf`, `resume.txt`, `plan.pdf` et `dossier.pdf`, rejoués depuis
  l'interface, sont identiques au bit près aux témoins une fois le numéro neutralisé ; `projet.json`
  porte les mêmes objets et les mêmes mesures. Les témoins ne sont pas recapturés.
- 736 tests (709 + 27). Fichier livré : 787 Ko.

## [2.1.0-alpha.9] — 2026-09-25

**IHM mobile, étape M8** : la vue 3D et la visionneuse sur téléphone et tablette.

### Modifié

- **Sur téléphone et tablette, la scène 3D prend l'écran** sous la barre haute, au lieu d'un cadre
  de 420 px. Les commandes de caméra (zoom, tourner, déplacer, zoom au glisser, PNG, hauteur des
  yeux) sont une colonne de boutons de 44 px posée sur la scène, avec un bouton ⚙ qui ouvre les
  **réglages** — feuille sur téléphone, panneau sur tablette : filaire, objets, opacité, textures,
  ombres, date et semaine, intensité, lumière d'appoint, points de vue, aide. **L'heure a sa propre
  barre** en bas de la scène, pour la faire défiler au pouce. Même disposition pour la visionneuse.
- Sur bureau, le cadre de la scène suit la hauteur de la fenêtre (420 px au moins), et le plein
  écran reste. Sur téléphone et tablette, le plein écran n'a plus d'objet et disparaît.
- Les émojis des boutons 3D deviennent des icônes ; le mode actif (tourner, déplacer, zoom) se
  colore selon le thème.

### Corrigé

- Libellés périmés de l'aide 3D (D10) : « Mode Plan », « + Point de vue », et les émojis ⟳ ✋ 🔍
  cités dans le texte.

### Preuve

- **Les exports n'ont pas bougé.** Rejoués depuis l'interface sur le jeu de démonstration, numéro de
  version neutralisé : `plan.svg`, `plan.dxf` et `resume.txt` sont identiques au bit près aux
  témoins ; `plan.pdf` et `dossier.pdf` ne diffèrent que par le numéro, les longueurs de flux et la
  table des décalages qu'il décale de huit octets ; `projet.json` a les mêmes objets et les mêmes
  mesures, son bloc `meta` ne différant que par l'identité, les dates et le numéro.

## [2.1.0-alpha.8] — 2026-09-25

**IHM mobile, étape M7** : les menus de Z1 et le clavier. La feuille Projet (téléphone) et son
panneau déroulant (tablette) sont arrivés aux étapes M3 et M4 ; la carte d'exposition place
maintenant chaque entrée des menus dans la feuille Projet sur téléphone.

### Corrigé

- **Ctrl+S enregistre** (Cmd+S sur Mac). Le raccourci était affiché dans le menu Fichier sans que
  rien ne l'écoute : le navigateur ouvrait « Enregistrer la page » (D2).
- **Ctrl+Z passe par la commande Annuler**, avec ses conditions, au lieu d'appeler l'historique à
  côté du registre (D6). Le geste ne change pas.
- **Le fond orthophoto s'efface du menu Affichage quand l'organisation n'a pas la fonction**, comme
  toute entrée de menu ; il restait visible (D8).

### Interne

- `app/clavier.ts` : table des raccourcis, branchée sur le registre ; `core/historique.ts` n'écoute
  plus le clavier.

## [2.1.0-alpha.7] — 2026-09-25

**IHM mobile, étape M6** : dialogues, notifications, porte et premier pas sur téléphone.

### Modifié

- **Sur téléphone, une confirmation monte du bas**, boutons pleine largeur de 48 px, action
  principale au-dessus. Les parcours — import cadastre en trois étapes, sélecteur de textures —
  prennent l'écran entier ; les boutons de l'import restent collés en bas pendant qu'on défile.
  L'actualisation IGN devient une feuille.
- Les toasts se posent au-dessus de la barre de navigation ; le bandeau d'erreur passe en haut de
  l'écran, le bas étant pris.
- La porte et le premier pas prennent la largeur du téléphone, champs et boutons de 48 px.
- Les boîtes imperatives passent sur les jetons : elles suivent enfin le thème sombre.

### Corrigé

- **L'actualisation IGN et le sélecteur de textures se ferment par Échap**, comme les autres
  dialogues (D11).
- Libellés périmés (D10) : les toasts de l'actualisation IGN citaient « + Depuis une adresse »
  (c'est « Fichier › Nouveau plan depuis une adresse »), et la note sur le voisinage parlait d'une
  case « en haut à droite » qui n'existe plus.

## [2.1.0-alpha.6] — 2026-09-25

**IHM mobile, étape M5** : les propriétés et les résultats sur téléphone et tablette.

### Ajouté

- **La feuille Propriétés** (téléphone) : l'inspecteur entier, ses quatorze sections dans le même
  ordre, précédées de pastilles qui mènent à chaque section. Sur téléphone et tablette, **les
  champs prennent une forme tactile** sans changer de descripteur : un nombre devient un pas à pas
  (− et + de 44 px ; la valeur reste saisissable, virgule comprise ; un appui maintenu répète, et
  ne laisse qu'un instantané d'annulation par appui), une case un interrupteur, un choix de trois
  options courtes une commande segmentée. L'aide d'un champ grisé s'écrit sous lui.
- **Le bandeau de chiffrage** en pied de l'inspecteur d'une terrasse : appuis, lames, fourchette
  estimée, recalculés à chaque réglage, et un geste vers la nomenclature. La boucle
  réglage → chiffrage se voit sur un seul écran de téléphone.
- **La feuille Résultats** (téléphone) : les onglets en pastilles défilantes, le sélecteur de
  terrasse (« 1 sur 2 »), et **les tableaux en cartes** — une ligne, une carte, chaque valeur
  précédée du nom de sa colonne ; les prix, longueurs, cadences et boutons des cotes restent
  éditables dans la carte. Sur tablette, les tableaux gardent leurs colonnes et défilent.
- **Un bouton Copier** dans l'onglet Résumé.

### Corrigé

- **Le filet copiable des exports SVG et DXF s'écrivait dans un onglet fermé** : l'onglet Résumé
  s'ouvre désormais quand il sert (D5).

### Interne

- `ui/tableau.ts` pose sur chaque cellule le nom de sa colonne (`data-label`) après chaque rendu des
  panneaux, sans toucher à leur calcul ni à leurs écouteurs.

## [2.1.0-alpha.5] — 2026-09-25

**IHM mobile, étape M4** : les outils et l'explorateur sur téléphone et tablette.

### Ajouté

- **La feuille Outils** (téléphone, bouton **+**) : les six créations en tuiles, puis « Éditer ·
  *la sélection* » (Dupliquer, Supprimer en rouge, Reculer, Position initiale), puis Cote et
  Aligner. Un outil refusé par un droit ou un quota reste visible, grisé avec un cadenas, et **la
  raison est écrite sous le groupe** : au doigt, l'infobulle ne s'affiche pas. Choisir un outil
  referme la feuille.
- **La feuille Objets** (téléphone) : l'explorateur entier — familles en pastilles défilantes,
  liste, œil par objet, masquer tout, étiquettes, voisinage, terrasses, cases du dossier, calques de
  la terrasse. Toucher un objet le sélectionne et referme la feuille. **Un objet masqué se réaffiche**
  depuis cette liste : sur téléphone, c'était impossible.
- **Sur tablette**, le plan occupe l'écran : la palette devient un **rail d'outils** posé à gauche,
  l'explorateur et l'inspecteur des **panneaux flottants** repliés en poignée à l'ouverture, le
  tiroir des résultats se pose en bas au-dessus de la barre d'état. Le bouton ☰ ouvre les menus dans
  un panneau déroulant.

### Corrigé

- **Sur téléphone et petite tablette, la palette et l'explorateur étaient masqués sans
  remplacement** : pas d'Annuler, pas de création, ni duplication ni suppression d'objet, pas de
  sélection par nom.
- Le menu Étiquettes de l'explorateur se ferme par Échap et par un clic ailleurs, comme ceux de la
  barre (D11, en partie).

## [2.1.0-alpha.4] — 2026-09-25

**IHM mobile, étape M3** : le plan et la navigation du téléphone.

### Ajouté

- **Sur téléphone, le plan occupe l'écran** entre une barre haute et une barre de navigation.
  La barre haute porte le nom du projet, son statut d'enregistrement, **Annuler** et Exporter ; le
  bouton ☰ ouvre la **feuille Projet**, qui porte les menus Fichier, Exporter, Affichage et Aide
  avec les mêmes entrées, les mêmes cases et le même ordre. La barre de navigation ouvre les
  feuilles Objets, Outils (**+**), Propriétés et Résultats, et lance **Coter**.
- **Les feuilles** : une zone existante posée en bas de l'écran, avec une poignée qu'on glisse pour
  passer de l'aperçu à mi-hauteur puis au plein écran (ou pour fermer), un voile qui la ferme au
  toucher, Échap, et le focus qui y entre puis revient au bouton d'origine.
- **La feuille de sélection** : nom, fonction, trois chiffres (surface, hauteur finie, estimation du
  chiffrage pour une terrasse), Dupliquer, Supprimer, Désélectionner, et les boutons Propriétés et
  Chiffrage. Sur tablette, une carte en bas à gauche.
- **Sur le plan, un groupe flottant** Ajuster, Grille, Nord, et une pastille d'échelle qui donne
  aussi la position du doigt pendant un glisser.
- **Un bandeau pendant un pointage** (Cote, Aligner) : il dit quoi désigner, et **Annuler** ou
  **Terminer** en sortent. Échap aussi, sur toutes les tailles d'écran.

### Corrigé

- **« Ajuster à la sélection » était invisible partout** : le bouton était rendu, puis masqué par
  la feuille de style. La commande `vue.ajuster` n'avait donc aucun point d'accès (D1).
- **Rien ne permettait de sortir d'un pointage de cote** : tout clic hors d'un côté était avalé, et
  le glisser de la vue bloqué, jusqu'à ce qu'on désigne un côté (D3).

### Interne

- `zones/BarreNavigation.tsx`, `zones/FeuilleSelection.tsx`, `zones/composants/Feuille.tsx`
  (entête et voile), `zones/statut.ts` (le statut en mots, partagé avec la barre d'état),
  `ui/chiffrage.ts` (le résumé du BOM, calculé sans rien écrire et mis en cache).
- La carte d'exposition place Annuler dans la barre haute, Coter dans la navigation, Dupliquer et
  Supprimer dans la feuille de sélection, Nord dans le groupe flottant.

## [2.1.0-alpha.3] — 2026-09-25

**IHM mobile, étape M2** : la page se déclare mobile, et connaît sa classe d'écran.

### Corrigé

- **Sur téléphone, la page n'est plus rendue en réduction.** Faute de balise `viewport`, un
  téléphone l'affichait sur 980 px virtuels puis la rétrécissait d'environ 0,4× : les boutons de
  44 px tombaient vers 17 px. La page occupe maintenant la largeur réelle de l'écran, et le plan
  toute cette largeur. Le zoom de la page reste permis ; le pincement sur le plan reste capturé.

### Interne

- `app/classe.ts` : trois classes d'écran, `compact` sous 600 px, `moyen` jusqu'à 1 023 px, `large`
  au-delà, posées sur `<html data-classe>` et dans le magasin, recalculées au redimensionnement.
- Le magasin gagne `classe`, `feuille` et `hauteurFeuille` (les feuilles du téléphone arrivent aux
  étapes suivantes) ; la feuille ouverte se lit aussi sur `<html data-feuille>`.
- `computeSize` mesure, sur téléphone et tablette, un cadre que la feuille de style place
  (`#zoneCadre`) au lieu de retrancher des largeurs de colonnes codées en dur ; le bureau garde sa
  règle. Le clavier virtuel qui s'ouvre sous un champ ne redessine plus le plan.

## [2.1.0-alpha.2] — 2026-09-25

**IHM mobile, étape M1** : les jetons et le thème. L'interface change de teinte, pas de place.

### Modifié

- **Une palette rafraîchie, en clair et en sombre**, qui garde la famille papier, encre et bois :
  encre plus profonde, panneaux ivoire, accent bois `#7A5C31` (ambre `#E0B564` en sombre). Les
  valeurs vivent dans `src/styles/jetons.ts` et `app.css` les déclare ; un test vérifie que les deux
  concordent et que chaque paire texte/fond atteint 4,5:1.
- **Plus aucune couleur en dur dans la feuille de style** : les blancs, le rouge des erreurs, le
  brun des toasts passent par des jetons (`--on-accent`, `--on-ink`, `--danger`, `--toast-bg`…).
  Cela corrige au passage le **bouton principal en thème sombre**, qui écrivait en blanc sur un fond
  devenu clair.
- **Les glyphes et émojis des boutons deviennent des icônes SVG en trait** (`zones/icones.tsx`) :
  palette, grille, œil de l'explorateur. Elles suivent la couleur du texte et l'état grisé.
- Polices par variables (`--serif`, `--sans`, `--mono`) sur les piles système ; rayons plus doux.
- Les encres du plan à l'écran (trait, grille, halo) suivent les jetons ; les couleurs des objets
  restent celles du projet, et les exports gardent les leurs.
- Le skill `design-ui` décrit les nouveaux jetons.

## [2.1.0-alpha.1] — 2026-09-25

**IHM mobile, étape M0** (`MD/spec-ihm-mobile.md` §12) : les garde-fous avant tout changement
d'écran. Rien ne bouge à l'écran ; les six artefacts sont identiques hors numéro de version.

### Interne

- `app/exposition.ts` : la **carte d'exposition** dit, pour chacune des **59 commandes** du registre,
  où elle s'expose sur téléphone, sur tablette et sur bureau. Elle décrit ici l'existant, identique
  dans les trois classes ; chaque étape suivante la fait évoluer dans le même commit que l'écran.
- `tests/unit/app/exposition.test.ts` lit le registre dans le code et échoue quand une commande
  déclarée n'a pas de ligne, quand une classe n'a aucun emplacement pour elle, ou quand l'emplacement
  nommé ne cite pas la commande dans son code.
- `tests/unit/zones/inspecteur-champs.test.ts` monte l'inspecteur dans jsdom avec un champ de chaque
  type et vérifie que chacun est rendu une fois dans chaque classe : le téléphone changera la forme
  d'un champ, jamais sa présence. Les lignes de champ portent `data-cle`.
- `tests/unit/zones/identifiants.test.ts` tient la liste des identifiants DOM des écouteurs hors
  registre (3D, visionneuse, soleil, fichiers, panneaux du tiroir) : ils changeront de place, jamais
  de nom.
- `scripts/captures.mjs` : 36 captures de référence (trois largeurs, clair et sombre, six états),
  plateforme simulée par Playwright ; `window.__plan` expose en développement seulement les gestes
  qu'il rejoue.

## [2.0.2] — 2026-09-25

### Ajouté

- **À l'ouverture, quand il n'y a aucun plan, Plan demande par quoi commencer.** Il fabriquait le
  jeu de démonstration en silence : quelqu'un qui arrivait avec une vraie parcelle en tête trouvait
  donc un plan qui n'était pas le sien, sans qu'on lui ait rien demandé, et devait comprendre seul
  qu'il fallait le remplacer. Deux options, et elles ne sont pas symétriques — **partir d'une
  adresse** est l'action principale, puisque c'est ce qu'on veut faire pour de bon, et elle ouvre
  directement la boîte du cadastre sur un plan vierge ; **ouvrir le plan de démonstration** reste là
  pour qui veut regarder sans rien saisir.
- **La même question se pose quand l'organisation n'a que des projets d'un autre produit.** La
  ressource de la plateforme est partagée, et rien n'oblige un projet à être un plan. Vu de la
  personne, c'est la même situation : rien à ouvrir. Seule la phrase change.
- **Une impasse est dite comme telle.** Une place de lecture ne peut rien créer, et un quota atteint
  non plus : l'écran l'explique au lieu de montrer deux boutons qui échouent. Les taire aurait fait
  croire que c'est le geste qui rate.

  L'import cadastre s'ouvre par la **commande**, pas par la fonction : elle porte la capacité, la
  permission et le quota, et un premier pas ne doit pas être le seul chemin qui les contourne.

### Corrigé — deux défauts que le plan vide a réveillés

- **Le démarrage tombait sur un plan sans objets.** Le cadrage d'ouverture cherchait la parcelle et
  lisait ses points sans vérifier qu'elle existe. L'assertion posée là n'avait jamais menti tant que
  Plan ouvrait toujours un projet ; elle a menti le jour où l'atelier a pu s'ouvrir sur le vide.
  Sans parcelle, le cadrage par défaut suffit : il n'y a rien à cadrer.
- **L'en-tête nommait un projet qui n'était pas ouvert.** Son repli était « Parcelle AE 101 », le
  nom du jeu de démonstration. Il dit maintenant « nouveau plan ».

### Modifié — le déploiement, pas l'application

- **La page livrée s'appelle `index.html`**, et l'adresse canonique de Plan devient la racine de son
  sous-domaine. C'est celle que la plateforme distribue : elle range une **origine** pour le produit,
  sans chemin ni nom de fichier, et un navigateur résout une origine nue vers l'index du répertoire.
  Tant que la page s'appelait `plan.html`, cette résolution tenait à une seule ligne `DirectoryIndex`
  embarquée dans un fichier qui doit être redéployé à chaque build : le perdre, ou passer à nginx ou
  à un CDN, et l'adresse même que la plateforme donne cessait de répondre.
- **L'ancienne adresse redirige définitivement**, en reportant la chaîne de requête, si bien qu'un
  lien profond `/plan.html?projet=<uuid>` arrive entier. Le vérificateur de déploiement le contrôle,
  et il interroge désormais la racine plutôt qu'un nom de fichier — demander `/index.html` passerait
  à côté d'un `DirectoryIndex` absent, qui est précisément le défaut à attraper.
- **Les deux fichiers à déposer vivent dans `livraison/`**, et nulle part ailleurs : `index.html` et
  `.htaccess`. Ils partent ensemble, comme toujours.

  **Le fichier livré n'a pas bougé d'un octet** : ce sont les octets de la `2.0.1`. C'est un
  changement de déploiement, pas de produit, et il ne porte donc pas de numéro à lui.

  N'a **pas** suivi le renommage, délibérément : le littéral `plan.html` dans ce que Plan exporte —
  le `/Creator` des deux PDF et le champ `exportedBy` du projet JSON. Il identifie l'artefact, pas
  une URL, et il est figé dans deux des six témoins.

### Interne

- **Les six témoins d'export sont recapturés, et la dette de la `2.0.1` est refermée.** Ils
  portaient encore le numéro de la `2.0.0`, faute d'une session ouverte sur la plateforme de
  démonstration. La capture passe désormais par un décor d'essai qui répond aux quatre routes
  nécessaires et sert le témoin lui-même comme unique projet : plus aucun mot de passe en jeu.

  Ce que vaut une capture derrière un décor qu'on écrit soi-même ? Rien, prise isolément. C'est la
  preuve forte qui lui donne sa valeur : l'ancien numéro remis dans les octets frais rend les six
  empreintes du 23 septembre **au bit près**, et celles-là avaient été capturées derrière une vraie
  plateforme, sur un projet réellement stocké. Le décor est donc prouvé équivalent pour ce que les
  témoins mesurent. Les six tailles sont identiques à l'octet et les deux PDF gardent leurs comptes.

## [2.0.1] — 2026-09-24

### Corrigé

- **La vue 3D faisait planter le navigateur sur téléphone.** Chaque matériau demandait sa propre
  copie de texture : le plan de démonstration ne référence que huit images, et la scène en
  fabriquait 178, une par face de lame, de solive, de lambourde. Une image 1024 × 1024 occupe 4 Mio
  en mémoire graphique, près de 5,3 Mio avec ses niveaux de détail — soit environ 950 Mio au lieu
  de 43. Un onglet de téléphone en a quelques centaines, et le dépassement ne lève aucune erreur
  rattrapable : le système met fin au processus, ce qui se voit comme un plantage à l'affichage.

  Les textures sont désormais partagées par URL. **Elles appartiennent au chargeur, plus à la
  scène** : la démolition de scène libérait toute texture rencontrée et aurait retiré à la scène
  suivante celle qu'elle attend, ce qui aurait échangé un plantage contre une terrasse noire. Un
  ensemble faible dit lesquelles sont empruntées, et le seul moment où elles sont rendues est le
  retour au plan, quand aucune scène 3D n'est vivante.

  La règle du carreau (combien de mètres réels une image représente) a suivi la texture chez le
  chargeur, puisque c'est lui qui possède l'instance. C'est ce qui rendait le partage possible :
  cette répétition avait cessé de dépendre de la taille de l'objet. Elle dépend en revanche de la
  nature de ses coordonnées de texture, et **la répétition fait donc partie de la clé du cache** :
  un mur, dont les coordonnées sont des mètres, et un arbre, dont la sphère est normalisée, ne
  partagent pas la même instance d'une même image. Sans cela, la correction du plantage aurait été
  payée par deux objets mal texturés.

  **Les trois chemins sont couverts d'un seul geste.** La vue 3D directement ; l'export GLB parce
  qu'il sérialise cette scène-là et que l'exportateur indexe ses textures par instance, donc les
  images cessent d'y être écrites en double ; la visionneuse parce qu'elle ne relit que ce que Plan
  vient d'exporter. Elle fabrique ses propres textures et n'en emprunte aucune, si bien que sa
  démolition reste inchangée.

  **Conséquence à connaître :** l'export GLB écrit une image par instance de texture. Le fichier va
  donc maigrir fortement, et les compteurs `textures`, `images` et `octetsTotal` du témoin
  `glb-structure.json` vont baisser. Tous les autres doivent rester identiques. C'est écrit dans
  `tests/fixtures/golden/EMPREINTES.md` avant le mouvement, pour que personne ne le prenne pour une
  régression.

  C'est aussi pourquoi cette version n'est pas une simple correction au sens strict de
  `MD/RELEASE.md` §2.1 : des octets exportés changent. Aucun outil en aval n'en casse — le fichier
  reste un glTF valide, de même géométrie et de mêmes matériaux, avec moins d'images en double — et
  le numéro retenu est donc un correctif.

### Non fait, et su

- **Les six témoins d'export n'ont pas été recapturés à ce numéro.** Ils restent estampillés
  `2.0.0` et `2026-09-23`. La capture demande une session ouverte sur la plateforme de
  démonstration, et celle du poste a été révoquée. L'écart attendu est écrit dans
  `tests/fixtures/golden/EMPREINTES.md` : deux substitutions de même longueur, et rien d'autre.

## [2.0.0] — 2026-09-23

**Plan demande qui vous êtes.** L'accès anonyme est terminé : l'application est un produit de la
plateforme backprod, elle s'ouvre sur une porte, et les projets ne vivent plus dans un dossier à
côté du programme mais dans la ressource `projects` de la plateforme. C'est la rupture qui donne son
numéro majeur à cette version. Un plan enregistré par la `1.2.0` s'ouvre tel quel — le schéma du
fichier de projet ne bouge pas — mais l'URL d'où on l'ouvrait, elle, a disparu.

Ce que Plan **calcule** n'a pas bougé d'un octet. Les six témoins ont été recapturés à ce numéro, et
la preuve a été faite avant : l'ancien numéro remis dans les octets frais retrouve les six anciennes
empreintes au bit près, et à version neutralisée aucune ligne ne diffère dans aucun des six.

### Décidé

- **Plan est un produit de la plateforme backprod, pas une plateforme.** La nouvelle
  [`MD/spec-connexion-plateforme.md`](MD/spec-connexion-plateforme.md) remplace
  `MD/spec-plateforme-multitenant.md`, qui construisait comptes, mots de passe, TOTP, rôles,
  catalogue et schéma PostgreSQL — tout ce que le contrat de la plateforme interdit à un produit.
  L'identité, l'organisation et les droits se lisent en direct sur `/me/context` ; les projets
  vivent dans la ressource `projects` de la plateforme, qui stocke déjà un document opaque avec sa
  version de schéma. `api.php` et `data/` disparaissent, et Plan n'a besoin d'aucune base.
- **Le droit s'accroche à la commande**, pas au bouton : les 47 commandes du registre issu de la
  `1.2.0` portent une capacité et une permission. Une capacité non achetée efface la commande ;
  une permission manquante la laisse visible et s'explique.
- La `2.0.0` passe de 28 jours à 23, et la `2.2.0` (marque blanche) quitte la feuille de route
  faute de décision. `MD/roadmap.md` et `MD/spec-data-strategy.md` sont amendées en conséquence :
  les forfaits, le paiement et la facturation ne sont plus le travail de ce dépôt.
- **L'ordre de mise en œuvre est posé en sept étapes**, chacune laissant l'application utilisable et
  les six empreintes intactes. Un drapeau de configuration rend les quatre premières livrables avant
  que la plateforme ne porte le produit — et il est supprimé du code à l'étape 4, pas seulement de la
  configuration, parce qu'un déploiement qui l'oublierait garderait `api.php` et `data/` ouverts.
- **Correction d'une affirmation fausse de la spec** : une capacité ne réduit pas le fichier livré.
  Le build inline tout, y compris les morceaux derrière un `import()` dynamique — `src/main.ts` en
  utilise déjà un et la page bâtie ne contient qu'un script en ligne et aucun script distant. Ce
  qu'une capacité empêche vraiment, c'est l'appel au réseau : three.js et ses trois aides ne
  quittent pas le CDN, les appels IGN n'ont pas lieu, le catalogue de textures n'est pas demandé.

### Ajouté — étape 0 de la connexion à la plateforme

- **Le contrat de la plateforme est épinglé et engendre le client.** `contrat/` porte la fermeture
  transitive des treize opérations que Plan appelle, extraite de backprod au commit `ce0642c` :
  34 Ko relisibles plutôt que les 676 Ko du contrat entier, qui décrit cinq produits, une console et
  une chaîne de vente. `src/plateforme/contrat.ts` en est engendré et suivi par git — on veut voir
  le diff. `npm run gate:client` échoue si les deux ne correspondent plus, et un test le prouve en
  abîmant le fichier exprès.
- **Deux constantes de build**, les deux seuls faits publics que le paquet porte sur la plateforme.
  Vides, Plan se comporte exactement comme en `1.2.0`. `npm run verifier-paquet` refuse une clé
  produit, un secret de webhook ou un jeton figé dans le fichier livré, et il tourne alors qu'aucune
  clé n'existe encore : le jour où il y en aura une, la question ne sera plus s'il faut vérifier.
- **L'origine de la plateforme rejoint `connect-src`** quand une plateforme est branchée, et rien
  n'est ajouté sinon — une source vide dans une politique de contenu est invalide, pas permissive.

**Le fichier livré n'a pas bougé d'un octet.** C'est la preuve que l'étape demandait : rien à
l'écran, aucune empreinte déplacée. 582 tests.

Deux erreurs de la spécification trouvées en la mettant en œuvre, ce à quoi cette étape sert :
enregistrer un projet est un `PATCH` et non un `PUT`, et le contrat mélange les deux conventions
de nullabilité — douze `nullable: true` contre onze types-tableaux — si bien qu'un générateur qui
n'en lit qu'une produit un `email: string` là où la plateforme rend `null`.

### Ajouté — étapes 1 à 4 de la connexion à la plateforme

- **La session** (`src/plateforme/session.ts`). Le jeton ne quitte jamais la mémoire, un `401` donne
  droit à un renouvellement et un seul, l'expiration est convertie en instant dès la réponse.
- **La porte** : rien ne s'affiche avant que `/me/context` ait répondu. Trois écrans — le formulaire,
  « ce compte ne tient pas Plan », le bandeau de panne — chacun avec son `request_id`.
- **Les droits sur le registre des commandes.** Une capacité non achetée efface la commande, une
  permission manquante ou un quota épuisé la laissent visible et s'expliquent.
- **Les projets vivent chez la plateforme.** `api.php` et `data/` sont retirés, le drapeau qui faisait
  de l'absence de plateforme un mode est supprimé du code : le build refuse une origine vide.
- `scripts/migrer-projets.mjs`, à blanc par défaut, qui relit et compare chaque projet migré.

**Cinq des six artefacts sont identiques au bit près** depuis un projet réel migré de
`plan1.raillard.org` vers une plateforme, puis rouvert par Plan. `projet.json` gagne 57 octets, qui
sont l'identité du projet : un vrai identifiant, un vrai nom, une vraie date, là où le témoin avait
été capturé sur le jeu de démonstration sans projet ouvert. Rien de calculé n'a bougé.

Quatre découvertes, faites en branchant :

- **Il n'existe aucune capacité `plan.access`.** Ce qui vaut accès, c'est que `/me/context` réponde.
- **Enregistrer un projet est un `PATCH`**, pas le `PUT` que la spécification annonçait.
- **`jsonb` ne préserve pas l'ordre des clés**, contrairement à ce que le contrat promet. Même
  longueur, première divergence au 31ᵉ caractère. Cela n'atteint aucun export.
- **Le contrat mélange deux conventions de nullabilité**, si bien qu'un générateur qui n'en lit
  qu'une déclare obligatoire une adresse que la plateforme rend nulle.

### Ajouté — étapes 5 et 6, le mécanisme sans les codes

- **La table des capacités** que Plan propose au catalogue, avec pour chacune les commandes qu'elle
  gouverne et les origines qu'elle fait taire. Un test prouve qu'une commande refusée n'exécute rien
  et n'appelle donc rien : le chargement de three.js, les appels IGN et le catalogue de textures
  partent tous de l'exécution d'une commande, et un seul refus les arrête tous.
- **Les codes sont attachés, une fois le catalogue créé.** Ils ne l'étaient pas au premier jet, et
  délibérément : le contexte ne distingue pas « pas acheté » de « pas au catalogue », si bien
  qu'attacher la capacité 3D avant que le catalogue la porte aurait retiré la vue 3D à tous les
  locataires qui l'utilisent. L'opérateur a créé les sept codes le 22 septembre, et un test vérifie
  désormais que chacun a sa prise. Il en reste un sans : passer en vue 3D est un bouton de mode, pas
  une commande, et c'est justement la capacité dont le gain réseau serait le plus réel.
- **Le vérificateur de déploiement est réécrit pour la `2.0.0`** : il refuse un hôte qui sert encore
  l'ancienne API ou son dossier de données, et il vérifie que la politique de contenu nomme bien
  l'origine de la plateforme du paquet servi. Sans elle, chaque appel est bloqué par le navigateur,
  et seulement en production.

Un constat de plus : **passer en vue 3D est un bouton de mode, pas une commande.** C'est la seule
capacité dont le gain réseau serait réel, puisque three.js vient d'un CDN, et c'est justement celle
qui n'a aucune prise tant que ce basculement n'est pas une commande.

### Ajouté — ce que la porte montre et ce qu'on peut en faire

- **Un mode lecture seule.** Une personne sans le droit d'écrire, ou qui tient un siège de lecture,
  voit le plan entier et ne peut rien y changer. La règle est posée **à un seul endroit** : la barre
  d'état et la palette de commandes en dérivent toutes les deux, après s'être contredites une fois —
  badge « Lecture seule » et palette entière, un lecteur ajoutait un rectangle puis découvrait qu'il
  ne pouvait ni le déplacer ni l'enregistrer. Les gestes au pointeur refusent **avant** d'empiler
  l'historique : un pas d'annulation posé pour un déplacement qui n'a pas eu lieu se défait en ne
  faisant rien. Regarder, sélectionner, déplacer la vue et exporter restent permis.
- **Un témoin vert ou rouge sur la boîte de connexion**, qui dit si la plateforme répond. Il
  interroge `/auth/jwks` sans cache : la première version lisait une réponse en cache et annonçait
  « connectée » devant une plateforme arrêtée.
- **« Mes projets » et « Se déconnecter »** dans la barre d'application. Le premier ouvre l'écran des
  projets de l'organisation connectée, dans un nouvel onglet. Le second révoque la famille de jetons
  côté plateforme, et demande confirmation si le plan porte des modifications non enregistrées.
- **Le mot de passe oublié se règle sur la plateforme**, pas ici. Le lien pointe vers sa racine : un
  produit n'a pas à savoir réinitialiser un mot de passe qu'il ne détient pas.

### Corrigé

- **Revenir à un point de vue enregistré ne déplaçait pas la caméra sur un plan sans terrasse**
  (D-15). Le geste réclamait une terrasse, alors que la Vue 3D s'ouvre sur une parcelle nue et que
  « Enregistrer la vue » y crée des points de vue : Plan fabriquait des points de vue auxquels il
  refusait de revenir. Deux défauts voisins corrigés avec lui — le centre était recalculé sur cette
  terrasse au lieu d'être repris de la scène, qui est le nombre ayant servi à enregistrer le point
  de vue ; et la liste déroulante ne se remplissait qu'à la construction de la scène, si bien qu'un
  point de vue tout juste créé n'y figurait pas.
- **L'annulation laissait le tiroir des résultats périmé** : le chiffrage revenait en arrière sans
  que la table le suive.

### Corrigé — le serveur

- **Le build produit un `.htaccess`**, à partir de `deploy/htaccess.template`, qui se dépose à côté
  de `plan.html` et d'`api.php`. Il corrige les trois défauts constatés plus bas, et il doit être
  redéployé à chaque palier : les empreintes qu'il contient changent avec le build.
- **`data/` n'est plus servi.** Les projets ne se lisent que par l'API. Le dossier est à côté
  d'`api.php`, donc dans la racine web, et `GET /data/<id>.json` rendait le projet entier — 106 062
  octets en clair, vérifiés en ligne.
- **`plan.html` passe en `no-cache`.** Il était servi avec six mois de validité : une mise en ligne
  n'atteignait pas les gens qui reviennent. `api.php` passe en `no-store`.
- **Les en-têtes de sécurité sont posés** : `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security` en HTTPS. Aucun n'était
  présent.
- **Une politique de contenu qui nomme le programme par son empreinte SHA-256** plutôt que
  d'autoriser l'inline en bloc — le build produit un fichier unique, donc tout le programme est un
  script en ligne, et `'unsafe-inline'` aurait désactivé la seule protection utile. Chaque origine
  externe est nommée avec la fonction qui en dépend : les deux CDN pour three.js, IGN et la BAN pour
  le cadastre, l'orthophoto et le PLU, Poly Haven pour les textures. Éprouvée au navigateur sous les
  en-têtes réels avant livraison : vue 3D, export GLB, orthophoto, adresse, cadastre, PLU et
  textures, sans une seule violation.

### Constaté en production

- `plan1.raillard.org/api.php?action=list` rend la liste des projets **à qui la demande**. C'est la
  raison d'être de la `2.0.0`.
- `plan.html` est servi avec `Cache-Control: max-age=15552000` : un visiteur qui revient garde
  l'ancienne application six mois. À passer en `no-cache`.
- Aucun en-tête de sécurité sur les deux hôtes, et `plan1.raillard.org` n'a aucune protection.

### Schéma projet

- Inchangé, version 1. Un plan enregistré par la `1.2.0` s'ouvre dans la `2.0.0`, et l'inverse aussi.
  La rupture porte sur l'accès et sur l'endroit où le fichier est rangé, pas sur ce qu'il contient.

### Ce qui reste ouvert

- **Quatre des vingt-cinq points de la liste de fumée n'ont pas été rejoués** sur ce build : ceux qui
  demandent de saisir une poignée de sept pixels. Le détail et la raison sont dans le journal de
  `tests/CHECKLIST-FUMEE.md`.
- **Le dossier PDF n'est vendu qu'à partir de Scale**, et aucun locataire du jeu de démonstration n'y
  est : personne ne peut l'exercer là-bas. La grille des capacités fonctionne comme voulu ; c'est le
  palier qu'il faudra revoir si on veut garder ce point testable.
- **Quatre décisions de la spécification restent à prendre** : les quotas, la marque, l'événement
  d'annulation d'abonnement, et les codes de permission propres à Plan.

## [1.2.0] — 2026-09-22

**L'interface est reconstruite par zones.** Neuf paliers `alpha` en deux jours, chacun prouvé par les
six artefacts exportés — identiques à ceux de la `1.1.0` à la version près — et vérifié sur le build.
`MD/spec-ihm-zones.md` est cochée en entier : les six étapes de son §6 et les menus de son §4.1.

Ce que l'utilisateur voit changer par rapport à la `1.1.0` :

- **Une barre d'application** sur une ligne : le projet, les menus Fichier, Exporter, Affichage et
  Aide, les trois vues — Plan, Vue 3D, Visionneuse — et le titre avec le lieu.
- **Une palette d'outils** à gauche du plan, grisée selon ce qui a un sens.
- **Un explorateur**, repliable : les objets par catégorie, la sélection dans les deux sens avec le
  canevas, le masquage, les étiquettes, le voisinage, et pour une terrasse sélectionnée sa
  structure sur le plan et sa place au dossier.
- **Un inspecteur**, repliable, à droite du plan : tout ce qui décrit l'objet sélectionné en
  sections, et pour une terrasse ses six sections de construction — décrites par des descripteurs
  de champs que le compilateur vérifie contre le modèle. La saisie garde le focus.
- **Un tiroir de résultats** sous le plan, en trois hauteurs mémorisées : BOM, plan de coupe,
  implantation, chantier, méthode pour la terrasse sélectionnée ; cotes, PLU, résumé.
- **Plus de mode Terrasse** : la terrasse est un contexte du plan, qui reste modifiable.
- **Des notifications** qui s'empilent et s'effacent, un bandeau d'erreur qui se ferme, des dialogues
  fermables par Échap.
- Le budget du fichier livré passe à 5 Mo ; il fait 687 Ko.

Aucune quantité, aucun octet exporté ne bouge pour un projet valide — d'où une version MINEURE,
comme `MD/RELEASE.md` §2.3 le prévoit. Trois défauts de `MD/DEFAUTS.md` sont clos au passage : D-12
pour les deux panneaux, D-13, D-14. Le détail est dans les paliers `alpha` ci-dessous.

### Corrigé

- **Une annulation rafraîchit le tiroir** : annuler un champ de construction remettait sa valeur
  d'avant dans l'inspecteur, mais le BOM gardait les quantités de l'état annulé. La restauration
  refait les panneaux de résultats. Le défaut ne se voyait pas avant la `1.2.0`, où ces panneaux
  n'étaient visibles qu'en mode Terrasse ; il se voit dès qu'ils sont toujours là.

### Interne

- `BUILD_AT` passe au 22 septembre 2026 ; la pastille affiche `v1.2.0`.
- Le numéro final est plus court que `1.2.0-alpha.10` : les quatre fichiers texte sont identiques
  hors numéro, et les deux PDF ont le même contenu une fois neutralisés numéro, dates, décalages et
  longueurs de flux.

## [1.2.0-alpha.10] — 2026-09-22

### Modifié

- **La section Terrasses de l'explorateur n'apparaît que pour une terrasse sélectionnée** — sa
  structure sur le plan disparaît avec la sélection, comme les onglets du tiroir. Le reste du temps,
  la catégorie Terrasse des objets suffit à en choisir une. Les six artefacts sont identiques à ceux
  de l'`alpha.9`.

## [1.2.0-alpha.9] — 2026-09-22

Deux retours d'usage sur la nouvelle interface. Les six artefacts sont identiques à ceux de l'`alpha.8`.

### Corrigé

- **L'explorateur replié ne se rouvrait pas.** Le composant rendait un panneau portant le même
  identifiant que son conteneur ; au repli, le panneau passait à 22 px mais le conteneur gardait ses
  240 px, la rangée de l'atelier débordait et la poignée sortait de l'écran par la gauche. Le repli
  est désormais une classe du conteneur, posée par le service ; les panneaux de l'explorateur et de
  l'inspecteur n'ont plus d'identifiant en double.

### Ajouté

- **Un clic sur le titre de l'inspecteur replie ou déplie toutes ses sections** : repliées si
  l'une au moins est ouverte, dépliées sinon.
- **L'inspecteur se replie**, comme l'explorateur : une poignée à droite de son en-tête, et le plan
  reprend sa largeur.
- **L'en-tête tient sur une ligne** : menus à gauche, vues au milieu, titre et lieu à droite, au lieu
  de trois rangées ; le plan gagne la hauteur.
- **L'explorateur et l'inspecteur ne dépassent plus la hauteur du plan** : ils défilent en dedans,
  et leur en-tête reste visible pendant qu'ils défilent.
- **Les menus se referment** quand on clique ailleurs ou par Échap, et en ouvrir un ferme les autres.
- **L'explorateur ne met en avant une terrasse, et ne propose sa structure sur le plan, que tant
  qu'elle est sélectionnée.**

## [1.2.0-alpha.8] — 2026-09-22

**Reconstruction de l'IHM : les menus de la barre d'application** (`MD/spec-ihm-zones.md` §4.1).
Fichier, Exporter, Affichage et Aide ; le tiroir ne garde que les résultats. Les six artefacts sont
identiques à ceux de l'`alpha.7`.

### Modifié

- **Fichier** : nouveau projet, enregistrer (Ctrl+S), supprimer — quand il y a un serveur — ;
  nouveau plan depuis une adresse, actualiser depuis l'IGN ; importer un SVG, importer ou exporter le
  projet JSON, avec leurs options (remplacer, sans la parcelle) en cases du menu. Les boutons de
  l'ancienne barre de projet disparaissent ; restent le choix du projet et Enregistrer.
- **Exporter** : résumé (qui ouvre l'onglet Résumé du tiroir), SVG, PNG, DXF, PDF avec son échelle,
  dossier PDF des terrasses avec l'option des équipements, GLB.
- **Affichage** gagne les deux opacités du fond orthophoto et le remplissage conseillé, qui
  étaient au fond de l'onglet Affichage.
- **Aide** : la méthode de calcul (l'onglet du tiroir, pour une terrasse sélectionnée) et la
  version.
- **Le tiroir** ne porte plus que Cotes, PLU, Résumé et, pour une terrasse sélectionnée, ses
  résultats. Il s'ouvre sur Cotes.

### Interne

- `zones/BarreApplication.tsx` : les quatre menus ; les réglages qui accompagnent une commande
  (échelle du PDF, cases des imports, curseurs du fond) sont des champs non contrôlés qui gardent
  leur identifiant, par lequel la commande les lit au moment d'agir.
- Les commandes d'export, d'import et de fond sont déclarées sans bouton (`app/ecouteurs/exports.ts`,
  `fichiers.ts`, `affichage.ts`) ; les curseurs sont deux commandes qui lisent leur `source`.
  `render/ortho.ts` tolère l'absence de la case du fond.
- `zones/monter.tsx` rend les zones en `flushSync` : le démarrage lit les curseurs des menus par
  leur identifiant juste après.
- Supprimés d'`index.html` : `#panelAffichage`, `#panelExport` ; les deux champs de fichier cachés
  remontent en tête de page.

## [1.2.0-alpha.7] — 2026-09-22

**Reconstruction de l'IHM, étape 6 : les dialogues et les notifications** (`MD/spec-ihm-zones.md`
§4.8), et les deux chantiers que §8 laissait au passage — D-13 et D-14 de `MD/DEFAUTS.md`. Les six
artefacts sont identiques à ceux de l'`alpha.6`.

### Modifié

- **Les notifications** (Z9) : les toasts s'empilent au-dessus de la barre d'état et s'effacent
  seuls ; une erreur de programme reste en bandeau jusqu'à ce qu'on la ferme, au lieu de
  s'accumuler en bas de page sans bouton.
- **Les dialogues** (Z8) : confirmations, invites et écran de reprise sont un composant, modal, un
  seul à la fois, fermable par Échap ou par un clic sur le voile. L'écran de reprise, lui, ne se
  ferme pas. Les trois parcours — import cadastre, actualisation IGN, textures — restent des
  dialogues à part et prennent le même voile.
- **Les onglets de terrasse du tiroir ne s'affichent que pour une terrasse sélectionnée** (BOM,
  Plan de coupe, Implantation, Chantier, Méthode), comme la décision 4 le dit. Ils suivaient la
  terrasse *courante*, qui survit à la sélection d'un parasol : un plan qui en avait une montrait son
  chiffrage en permanence. Un onglet de terrasse ouvert se replie sur Cotes dès que la sélection
  n'en est plus une.

### Corrigé

- **D-13** — le lien de secours des exports SVG et PDF réutilisait une URL révoquée une seconde
  après le clic : il ne fonctionnait jamais. Il disparaît ; un toast dit le nom du fichier qui part.
- **D-14** — un parasol est un cercle. La section Parasol de l'inspecteur, la Vue 3D et le calque
  des ombres n'y voient plus un polygone dont la fonction dirait « parasol ».

### Interne

- `shell/notifications.ts` et `shell/dialogues.ts` : deux listes observables au niveau zéro ;
  `shell/dialogs.ts` y confie ses cinq fonctions et garde un repli en DOM brut pour le point
  d'entrée, qui doit afficher un échec de chargement avant que l'application n'ait démarré.
- `zones/Notifications.tsx`, `zones/Dialogues.tsx` ; `#zoneDialogues`, `#zoneNotifications` ;
  styles `.dialogueVoile`, `.dialogueBoite`, `.toast`, `.bandeauErreur`.
- `core/contexteTerrasse.ts` : `terrasseSelectionnee(etat)` ; `app/tiroir.ts` : `synchroniser` à
  chaque rendu.

## [1.2.0-alpha.6] — 2026-09-22

**Reconstruction de l'IHM, étape 5 : le tiroir des résultats** (`MD/spec-ihm-zones.md` §4.6, option A
de §7.1). Les onglets du panneau du bas deviennent un tiroir sous le plan, repliable en trois
hauteurs mémorisées. Les six artefacts sont identiques à ceux de l'`alpha.5`.

### Modifié

- **Le tiroir** (Z6), pleine largeur sous le plan : BOM, Plan de coupe, Implantation, Chantier,
  Méthode quand une terrasse est courante, puis Cotes, PLU, Résumé. Trois hauteurs — replié (la
  barre d'onglets seule), mi-hauteur, plein — mémorisées dans le navigateur. Cliquer un onglet
  d'un tiroir replié le déplie.
- **Les onglets de terrasse suivent le contexte** : ils n'existent que s'il y a une terrasse, et
  un onglet de terrasse ouvert se replie sur Cotes quand la dernière terrasse change de fonction.
- **Le Résumé** a son onglet ; il n'est plus au fond d'Export.
- **Affichage et Export / Import** restent dans le tiroir, à part et en italique : ce sont des
  réglages, attendus dans les menus de la barre d'application (§4.1). Rien n'est perdu.

### Interne

- `app/tiroir.ts` : la liste des onglets, leur visibilité, ce qu'ils rafraîchissent à l'ouverture,
  la hauteur et sa mémoire locale (`plan.tiroir`). `zones/Resultats.tsx` rend la barre ; les
  panneaux restent du balisage que `ui/` remplit.
- `app/modes.ts` ne porte plus de sous-onglets ; le magasin porte `tiroir`.
- Supprimés : `ui/panelTabs.ts`, `#panelTabs`, `#panel`, `#panelTerrasse`, `#terrasseSubTabs`,
  `#terrasseEmpty`. Les panneaux `terrasseTab*` deviennent `panelBom`, `panelCoupe`,
  `panelImplantation`, `panelChantier`, `panelMethode` ; `panelResume` apparaît.

## [1.2.0-alpha.5] — 2026-09-22

**Reconstruction de l'IHM, étape 4 : l'inspecteur par descripteurs de champs** (`MD/spec-ihm-zones.md`
§4.5, `MD/DEFAUTS.md` D-12). Le panneau d'attributs et le configurateur de terrasse — huit cents lignes
de DOM impératif, un bloc par champ — deviennent des descripteurs rendus par un seul composant, dans
une colonne à droite du plan. Les six artefacts sont identiques à ceux de l'`alpha.4`.

### Modifié

- **L'inspecteur** (Z5), à droite du plan : les propriétés de ce qui est sélectionné, par sections
  repliables — Objet, Parcelle (lieu, cadastre, clôture), Apparence, Parasol, Point de vue, Côtés,
  Coins, Alignement, et pour une terrasse Fondation et appuis, Structure porteuse, Lames et sens de
  pose, Finitions du tour, Optimisation, Paramètres de calcul. Chaque champ garde son infobulle et
  la note du métier que le configurateur affichait.
- **Les champs texte et nombre gardent le focus** pendant la frappe : le nom, un côté, une longueur
  se corrigent sans que le panneau ne se reconstruise sous le curseur. Un nombre se valide par
  Entrée ou en quittant le champ, et revient à sa valeur si elle est refusée (rayon ou rectangle qui
  sortirait de la parcelle).
- **La clôture se règle sur la parcelle**, dans l'inspecteur, et non plus dans la Vue 3D.
- **Le panneau du bas** n'a plus d'onglet Édition ; son onglet Terrasse ne porte plus que les
  résultats (BOM, Plan de coupe, Implantation, Chantier, Méthode). Il s'ouvre sur Affichage : l'onglet
  Terrasse recalcule le chiffrage et l'écrit dans le projet dès qu'il s'ouvre, comme l'ancien mode.
- Le mode Terrasse ne pouvant plus verrouiller le plan, « Aligner par rotation » de la palette lance
  directement le pointage du côté cible.

### Interne

- `ui/champs/types.ts` : les descripteurs (`texte`, `nombre`, `case`, `choix`, `couleur`, `date`,
  `curseur`, `lecture`, `texture`, `bouton`, `alerte`, `hote`, `ligne`), leur contexte et leurs
  effets (`rendu`, `inspecteur`, `terrasse`, `scene3d`, `empilement`, `poignees`).
- `ui/champs/objet.ts` : les sections de l'objet ; `ui/champs/construction.ts` :
  `CHAMPS_CONSTRUCTION`, un objet indexé par **toutes** les clés de `Construction` — une propriété
  ajoutée au modèle sans descripteur, ni mention de l'onglet qui l'édite, ne compile pas.
- `app/inspecteur.ts` applique une écriture : historique si le champ le demande, marquage
  « modifié », effets déclarés. `zones/Inspecteur.tsx` rend les sections.
- Supprimés : `ui/attrPanel.ts`, `renderTerrasseConfigurator` et `renderParametresCalcul`
  (`ui/terrassePanels.ts`), `syncClotureControls` (`ui/cloture.ts`), les commandes de clôture de
  `app/ecouteurs/cloture.ts`, `etat.attrTab`, `#panelEdition`, le sous-onglet Construction et les
  contrôles de clôture de la Vue 3D dans `index.html`.
- `computeSize` retranche la largeur de l'inspecteur au plan ; sous 1 024 px il passe sous le plan.

## [1.2.0-alpha.4] — 2026-09-22

**Reconstruction de l'IHM, étape 3 : l'explorateur, et la terrasse comme contexte du plan**
(`MD/spec-ihm-zones.md` §6, décision 4 de §7). Le sélecteur d'objets au-dessus du plan, la table
d'affichage et le mode Terrasse disparaissent ; une colonne à gauche du plan les remplace. Les six
artefacts sont identiques à ceux de l'`alpha.3`.

### Modifié

- **L'explorateur** (Z3), entre la palette et le plan : les objets par catégorie avec leur compte,
  la sélection (qui est celle du canevas, dans les deux sens), le masquage par objet et pour tous,
  les cinq étiquettes de l'objet sélectionné et de tous, le voisinage, les terrasses avec leur
  surface et leur hauteur finie, la terrasse courante, les terrasses du dossier PDF, et la structure
  de la terrasse courante dessinée sur le plan, couche par couche. Il se replie d'un clic et rend sa
  largeur au plan ; sous 1 024 px il s'escamote.
- **Plus de mode Terrasse.** Il n'y a que trois vues : Plan, Vue 3D, Visionneuse. La terrasse
  courante suit la sélection — sélectionner une terrasse sur le plan ou dans l'explorateur la rend
  courante, sélectionner autre chose la garde — et son onglet **Terrasse** du panneau (Construction,
  BOM, Plan de coupe, Implantation, Chantier, Méthode) la décrit. La Vue 3D est une vue à part
  entière, sans terrasse s'il n'y en a pas.
- **Le plan reste modifiable quand une terrasse est courante** : le verrou du mode Terrasse (formes,
  points et côtés bloqués) n'a plus lieu d'être. La sélection reste dessinée.
- **La structure d'une terrasse ne s'affiche que sur demande** (« Structure sur le plan » dans
  l'explorateur) ; le mode Terrasse la dessinait d'office sur son sous-onglet Canevas, qui disparaît.

### Interne

- `core/contexteTerrasse.ts` : la règle de la terrasse courante, appliquée avant chaque rendu ;
  `etat.appMode` disparaît, `etat.calquesVisibles` apparaît.
- `app/explorateur.ts` (ce que la zone demande au plan), `zones/Explorateur.tsx`. `ui/selector.ts`
  disparaît ; `ui/tables.ts` garde la sélection du dossier et expose `clesDossier`, réparée à la
  lecture (rien de coché veut dire toutes) ; `ui/terrassePanels.ts` perd la barre de choix.
- `app/modes.ts` ne pilote plus que trois vues et les sous-onglets de l'onglet Terrasse ; le
  déplacement physique du `<svg>` (`#stageParking`, `#stageHost`) disparaît, comme `#terrasseTopBar`,
  `#selector`, `#dispTable`, `#dossierTerrasses` et le sous-onglet Canevas. `#terrasseTab3d` devient
  `#vue3dPanel`, `#terrassePanel` devient `#panelTerrasse` dans le panneau.
- Le magasin porte `explorateurOuvert` ; `computeSize` retranche la largeur de l'explorateur déplié.

## [1.2.0-alpha.3] — 2026-09-21

**Reconstruction de l'IHM, étape 2 : la palette d'outils et le canevas** (`MD/spec-ihm-zones.md` §6).
La rangée de boutons sous le plan disparaît ; une palette verticale à gauche du plan la remplace,
et la barre d'application gagne un menu Affichage. Les six artefacts sont identiques à ceux de
l'`alpha.2`.

### Modifié

- **La palette** (Z2) : Historique, Créer (polygone, rectangle, chemin, cercle, parasol, point de
  vue), Éditer (dupliquer, supprimer, reculer, position initiale), Outils (cote, aligner). Un bouton
  est grisé quand sa commande n'a pas de sens — rien de sélectionné, rien à annuler — au lieu de
  répondre par un message. Sous 1 024 px, elle s'escamote et le plan reprend sa largeur.
- **Deux outils désormais à portée de main** : la cote et l'alignement par rotation, qui ne
  s'atteignaient qu'au fond d'un onglet, ouvrent l'onglet voulu et attendent le clic sur le plan.
- **Le menu Affichage** : Flèche Nord, Grille, Voisinage, Fond orthophoto, cochés d'après l'état.
- **Le budget du fichier livré passe à 5 Mo** (décision du 21 septembre, `spec-ihm-zones.md` §7,
  `RELEASE.md` §8.2).

### Interne

- `zones/Palette.tsx`, `zones/Surimpression.tsx` ; le menu dans `zones/BarreApplication.tsx`.
- Les commandes d'objet sont déclarées sans bouton et portent leur condition d'activation ; les
  bascules d'affichage (`affichage.nord`, `affichage.voisinage`, `affichage.orthophoto`,
  `affichage.grille`) sont des commandes que les cases de l'onglet et le menu exécutent.
- `core/historique.ts` signale l'état de sa pile (`signalerPile`) ; le magasin porte `peutAnnuler`.
- `ui/panelTabs.ts` expose `activerOnglet`. `render/pipeline.ts` et `app/modes.ts` n'écrivent plus
  le `display` du bouton de cadrage.
- `index.html` : `#planActions` disparaît, `#zoneAtelier` réunit `#zonePalette` et `#stage`, qui
  contient `#zoneSurimpression`. Le plan retranche la largeur de la palette au-dessus de 1 024 px.

## [1.2.0-alpha.2] — 2026-09-21

**Reconstruction de l'IHM, étape 1 : la coquille** (`MD/spec-ihm-zones.md` §6). Deux zones React
entourent le canevas existant — **Z1, la barre d'application** (projet, vues, titre) et **Z7, la
barre d'état** (serveur, enregistrement, sélection, échelle, pointeur, version). Les régions
`#projectBar`, `#modeBar` et le `<h1>` d'`index.html` disparaissent. Les six artefacts sont
identiques à ceux de l'`alpha.1`.

### Modifié

- **Une barre d'état en bas de la fenêtre** : mode local ou statut d'enregistrement, objet
  sélectionné, échelle du plan (« 1 m = 11 px »), position du pointeur en mètres, version.
- **Les bascules Voisinage et Fond orthophoto** passent de la barre de vues à l'onglet Affichage,
  inchangées.

### Interne

- `app/projet.ts` : la logique de la barre de projet (ouvrir, créer, enregistrer, supprimer, depuis
  une adresse, actualiser IGN) devient cinq commandes et un objet `Projet`, sans DOM ; le statut est
  publié dans le magasin. `ui/projectBar.ts` ne garde que le cadastre et le PLU.
- `app/magasin.ts` porte, à côté du pont vers `EtatApp`, des champs immuables : la vue courante,
  le lieu, le projet et son statut, le pointeur.
- `zones/` : `BarreApplication.tsx`, `BarreEtat.tsx`, `monter.tsx` — couche de niveau 6 dans le
  test d'architecture, qui parcourt désormais aussi les `.tsx`. Les identifiants d'éléments
  (`projectSelect`, `saveProjectBtn`, `modePlanBtn`…) sont conservés.
- `app/modes.ts` signale la vue courante au magasin au lieu d'allumer des boutons par identifiant.
- Le fichier livré passe à 679 862 octets : React DOM y entre. Budget 1,2 Mo.

## [1.2.0-alpha.1] — 2026-09-21

**Reconstruction de l'IHM, étape 0** (`MD/spec-ihm-zones.md` §6) : le registre des commandes et le
magasin existent, tous les boutons passent par le registre, et l'écran ne change pas. Les six
artefacts sont identiques à ceux de la `1.1.0` hors numéro de version.

### Interne

- `app/commandes.ts` : une commande a un identifiant stable (`objet.dupliquer`), un libellé, un groupe,
  parfois un raccourci et une condition d'activation ; le registre refuse un doublon et lie un élément
  du DOM à une commande. **47 commandes** dans douze groupes remplacent les `addEventListener('click')`
  des neuf groupes d'écouteurs, ligne à ligne, sans qu'un geste change.
- `app/magasin.ts` : un store Zustand qui tient la référence vivante d'`EtatApp` et un compteur de
  version incrémenté par `render()` — le pont vers React, sans réécrire une mutation.
- React, React DOM et Zustand sont des dépendances ; le greffon React de Vite est branché et le JSX
  accepté. Rien ne les utilise encore : le fichier livré grossit de trois kilo-octets (Zustand et le
  registre), React n'y entre pas.
- Décisions consignées dans la spec : React avec Zustand, fichier unique conservé, tactile comme critère
  d'acceptation, la terrasse comme contexte du plan, les résultats dans un tiroir en bas du canevas.
- 554 tests (548 + 6).

## [1.1.0] — 2026-09-21

**La migration TypeScript est terminée.** Le fichier mono-page de 13 487 lignes (`1.0.0`, figé dans
`legacy/plan_interactif.html`) est devenu un graphe de 115 modules typés sous la configuration la
plus stricte du compilateur, et l'artefact livré reste un seul fichier `plan.html`, produit par le
build. La définition de fin (`MD/spec-migration-typescript.md` §14) est cochée en entier : `tsc`,
ESLint et 548 tests à zéro ; six artefacts exportés identiques au bit près à ceux de la `1.0.0`, à
la version près, prouvé à chaque palier ; checklist de fumée 25/25 sur le build ; déploiement de
test avec `api.php` ; carte des modules ; liste des défauts triée.

Ce que l'utilisateur voit changer par rapport à la `1.0.0`, tout est dans les paliers `alpha` ci-dessous :
trois corrections (`alpha.16`) et une construction complète à l'ouverture d'un projet ancien
(`alpha.17`). Aucune quantité, aucun octet exporté ne bouge pour un projet valide — d'où une version
MINEURE, comme `MD/RELEASE.md` §2.3 le prévoyait.

### Interne

- `BUILD_AT` passe au 21 septembre 2026 ; la pastille de version affiche `v1.1.0`.
- Le passage d'un numéro de pré-version au numéro final raccourcit la chaîne estampillée dans les
  six artefacts : les quatre fichiers texte sont identiques à ceux de l'`alpha.17` une fois le numéro
  neutralisé, et les deux PDF ont le même contenu (mêmes objets, pages et textes) : une fois neutralisés
  numéro, dates, décalages internes et longueurs de flux, une seule ligne diffère, le dictionnaire
  `/Producer … /Creator` qui porte la version et la date de build.

## [1.1.0-alpha.17] — 2026-09-21

**`ObjetPlan` est une union discriminée** (MD/DEFAUTS.md, D-3 ; spec §12). Polygone, chemin et
cercle sont trois types que `type` distingue : le compilateur ne laisse lire `pts` qu'après avoir
écarté le cercle, `center` et `r` qu'après l'avoir reconnu. Les quatre signatures d'index
(`ObjetPlan`, `Construction`, `LigneBom`, `Mesure`) ont disparu. Aucun octet exporté ne bouge :
six empreintes sur six inchangées à version égale.

### Corrigé

- **Un projet ancien s'ouvre avec une construction complète** (D-1). `ensureConstruction` ne
  comblait que 40 des 53 réglages ; les treize autres n'étaient posés que sur une terrasse neuve, et
  un projet enregistré avant leur existence arrivait au moteur avec `soliveSection`,
  `soliveEntraxe`, `lambourdeEntraxe`, `essenceBois`… à `undefined` — un débit bois titré
  « (undefined) », une marge de zone spa en `NaN`. Les douze sont comblés à l'ouverture avec la
  valeur que chaque lecture du moteur prenait déjà par `||` en leur absence, donc aucun nombre ne
  bouge ; l'essence reste « autre », le tarif que ces projets ont toujours eu. Seul `bom`, un
  résultat, reste à `computeBOM`.

### Interne

- `model/types.ts` : `ObjetCommun` porte ce qui est partagé ; `ObjetPolygone`, `ObjetChemin`,
  `ObjetCercle` ce qui distingue ; `ObjetPlan` est leur union, `ObjetAPoints` celle des deux
  premiers, `ObjetBrut` reste `Partial<ObjetPlan>`. `voisinage` et `Mesure.id`, lus depuis toujours
  et jamais déclarés, le sont.
- `model/formes.ts` : quatre aides — `estCercle`, `aDesSommets` (gardes), `sommetsDe` (`obj.pts || []`
  sous un nom), `enPoints`/`enCercle` (l'ancien `!` sous un nom qu'on peut chercher).
- **258 assertions `!` sur `pts`/`center`/`r` → 25**, toutes restantes sur des types partiels ou des
  interfaces locales, jamais sur l'union. La plupart sont tombées d'elles-mêmes dans des branches
  déjà écrites sur `type` ; les autres sont devenues une garde nommée de même valeur de vérité, ou
  `enPoints`/`enCercle` là où le contexte garantit la forme.
- Les vues partielles `ObjetCote` (render), `ObjetMesurable` (engine) et `ObjetASurface` (export)
  sont des formes structurelles explicites : un `Pick` sur l'union n'existe plus quand la clé manque
  à un membre.
- Le filtre des terrasses du dossier PDF est un prédicat de type ; `cerclePointsExtent` (three) prend
  un `ObjetCercle` ; `PointDeVue.pts` (three) dit `ObjetAPoints['pts']`.
- Ce que l'union a révélé sans le corriger — un parasol désigné par `fonction` et non par `type`,
  qui planterait si l'on faisait « parasol » d'un polygone (D-14) — est dans `MD/DEFAUTS.md`.
- 548 tests.

## [1.1.0-alpha.16] — 2026-09-20

**Trois corrections que le typage strict avait mises au jour** (voir `MD/MIGRATION-JOURNAL.md`,
« Phase 7 — l'échelle gravie », « ce qui ressemble à un bug »). Aucune ne touche un artefact
exporté : les six empreintes sont inchangées à version égale.

### Corrigé

- **Les cotes lues d'un fichier sont vérifiées avant d'entrer dans l'état.** L'import SVG annonçait
  une vérification « ligne à ligne » mais ne contrôlait que l'existence des deux objets référencés :
  `refSegIndex`, `startEnd` et `targetPtIndex` étaient recopiés tels quels, et l'import JSON faisait
  de même. Une cote au-delà du polygone, sur un cercle pris pour référence, ou sans indice, entrait
  dans `etat.measures` pour ne jamais se dessiner. `model/mesures.ts::referencesDeCote` est
  désormais le seul juge, pour les deux imports : objets présents, cote de référence sur un polygone
  et dans ses bornes, sommet cible dans les bornes (ou n'importe quel entier positif sur un cercle,
  dont le point coté est le centre), `startEnd` normalisé en `A`/`B` comme le rendu le lit. Ce qui
  est refusé est compté dans le message d'import. 12 tests, dont l'import du SVG doré (11 cotes
  restaurées, références intactes) et une copie abîmée de ses cotes.
- **Actualiser depuis l'IGN exige les deux coordonnées du point de calage.** La garde ne vérifiait
  que la latitude : une longitude absente aurait projeté tout le voisinage en `NaN`, en silence.
- **Un bâtiment BD TOPO sans `properties` ne fait plus lever la boîte d'import cadastral.** La liste
  des hauteurs « sur la propriété » lisait `props` sans garde ; il prend la hauteur par défaut,
  comme l'import lui-même le faisait déjà.

### Interne

- Le message de l'import JSON dit « objet de référence absent ou indice hors du plan ».
- 547 tests (535 + 12).
- **La définition de fin de migration (spec §14) est cochée en entier** : checklist de fumée déroulée
  25/25 sur le build (`tests/CHECKLIST-FUMEE.md`), déploiement PHP local avec `api.php` vérifié sur
  les quatre actions et un projet de production, GLB revérifié structurellement, carte des modules
  à jour (`MD/architecture.md` §5.2.2), liste des défauts triée (`MD/DEFAUTS.md`).

## [1.1.0-alpha.15] — 2026-09-20

**Phase 7 : l'échelle de rigueur est gravie.** `tsconfig.json` porte désormais la configuration cible
de la spec §9.1 — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Mesurées
en cumulatif au départ du palier : **1 513 erreurs**, dont 300 dans `ui/`, 218 dans `tests/`, 201
dans `geometry/`, 168 dans `engine/`, 141 dans `three/`, 132 dans `export/`, 100 dans `render/`,
81 dans `app/`. À l'arrivée : **0**. Aucun des six artefacts exportés ne bouge à version égale.

### Interne

- **Uniquement des types.** Assertions non nulles `!` là où le code environnant garantit déjà
  l'invariant (indice borné par la boucle, `find` précédé d'un `some`, `pts` sous un
  `type === 'polygon'`, élément du DOM d'`index.html`) ; `catch (e)` lu via `(e as Error)` ;
  paramètres inutilisés préfixés `_` ; imports et variables mortes retirés. Le diff de `geometry/`,
  une fois les `!` ôtés, est identique à l'original ligne pour ligne. Aucun `if`, `return`, valeur
  par défaut ou `??` ajouté nulle part.
- **Des signatures qui mentaient, corrigées** : `ContexteHistorique` disait `unknown[]` pour des
  objets du plan et des cotes — il est générique sur leur forme, comme l'appelant la connaît ;
  `ContexteAttrPanel.startPick` et `measureSegCoords` disent les unions réelles ;
  `appliquerProjetImporte` reçoit un `ProjetValide`, pas `unknown` (`app/ecouteurs/fichiers.ts`,
  `ui/projectBar.ts`) ; `ContexteVue3d.setMode3D` prend un `Mode3D` ; `ContexteMesurePanel.refLabel`
  accepte `null`, ce que l'implémentation faisait déjà ; `chargerTuileOrtho` rend `Promise<string>`
  (le `has` précède le `get`) ; `nomProjet` accepte `null` ; `geocoderBAN` lit un `[number, number]` ;
  `export/pdf/writer.ts` nomme `Rgb01` ; `three/etat3d.ts` : `dernierExporte.date` est une `Date`.
- **Types élargis pour `exactOptionalPropertyTypes`**, là où le code assigne `undefined` en
  clair : `Construction.prixVisUnite`, `TextureAppliquee.vignette`, `SourcesDIdentite.horloge`/`alea`,
  `AppuiSurLigne.n`, `TerrasseEtudiee.pts`, `PointDeVue.pts`/`altitude`, `SeedProjectBar.meta`.
- **Deux symboles morts de plus** : le paramètre `lamesAngle` d'`evaluerStructure` n'est jamais lu
  (renommé `_lamesAngle`, position conservée) ; `GlisserEnCours.startR` n'est lu nulle part.
- **Le cliquet** (`scripts/cliquet.mjs`) n'a plus de drapeaux à monter : `tsconfig.json` porte tout,
  il reste le rapport par dossier et la garde contre une régression. Il lance `tsc` avec le Node
  courant plutôt que par `npx` sous `shell: true`, que Node 22 signalait (DEP0190).
- `plan.html` : 450 063 → 450 058 octets. 535 tests, inchangés.

Ce que le typage a révélé sans le corriger — des invariants tenus par `normalizeObjects` ou
`ensureConstruction` et non par les types, une validation d'import annoncée mais absente — est
consigné dans `MD/MIGRATION-JOURNAL.md`, « Phase 7 — l'échelle gravie ».


## [1.1.0-alpha.14] — 2026-09-09

**Phase 4 : la fermeture `boot()` quitte `legacy.ts`, et `legacy.ts` disparaît.**
Le dernier fichier sous `@ts-nocheck` du dépôt est supprimé. Les ~900 lignes de câblage qu’il
portait vivent désormais dans `src/app/boot.ts`, la racine de composition (spec §6), vérifiée par
le compilateur comme le reste. Aucun des six artefacts exportés ne bouge.

### Corrigé

- **L'import SVG ne fonctionnait plus.** Le contexte passé à `importSVGString` citait
  `filtrerSansParcelle` en abrégé d’objet, alors que la fonction avait quitté ce fichier pour
  `io/exportProjet.ts` en phase 2 **sans que l’import soit ajouté**. Construire cet objet levait
  donc un `ReferenceError` avant même l’appel, et le `try/catch` de `app/ecouteurs/fichiers.ts` le
  changeait en bandeau « Erreur import SVG » — un geste mort en silence pendant plusieurs paliers,
  qu’aucun golden ne pouvait voir (ils n’exercent que les **exports**).

  Le typage a fait tomber la cause et le remède ensemble : `importSVGString` ne lit **aucune** des
  quatre propriétés que ce littéral lui passait en trop (`markDirty`, `fitToObject`,
  `filtrerSansParcelle`, `trouverParcelleCloture`). Les retirer répare le geste sans rien ajouter.
  Vérifié en direct sur les trois versions avec le même fichier : le témoin figé 1.0.0 et le build
  corrigé donnent le même résultat exact (14 → 15 objets, 288 → 566 textes, aucune erreur) ; le
  build d'avant correction n'importe rien et affiche le bandeau.

### Interne

- `src/legacy.ts` **supprimé**. `src/app/boot.ts` le remplace : mêmes instructions, même ordre
  d'exécution, portée désormais vérifiée. `main.ts` charge `./app/boot.js`.
- **280 symboles morts retirés** — 272 spécificateurs d’import que plus rien ne lisait (dont 32
  lignes d’import devenues vides) et 8 déclarations locales (`cancelPick`, `updateUndoBtn`,
  `selectorDiv`, `bringToFront`, `measurePointCoord`, `IMPORT_JSON_TAILLE_MAX`,
  `rebuildTerrasseSubTabs`, `updateStagePlacement`), plus `worldFromEvent`, dont le seul lecteur
  était une propriété morte. ESLint ne voyait rien de tout cela : sa configuration excluait
  `src/legacy.ts`. Le fichier n’étant plus exclu, la couche de câblage est lintée comme le reste.
- Cinq autres littéraux de contexte allégés des propriétés que leur destinataire ne lit pas
  (`brancherPointeur`, `construireScene3D`, et les trois appels de la visionneuse GLB).
- Deux passages nommés une seule fois, au lieu d’un `as` dispersé : `normaliserEnObjetsDuPlan`
  (« ce qui arrive de dehors » → objets du plan, ce que la signature de `creerEtat` réclame) et
  `aPoints` / `aDessiner` (les formes que la géométrie et le rendu exigent complètes).
- `ProjetResume` (io/api.ts) et `ProjetMeta` (ui/projectBar.ts) décrivaient la même ligne de
  serveur et **avaient divergé** (`name` obligatoire d’un côté, facultatif de l’autre). Une seule
  description reste, là où la donnée arrive ; `ProjetServeur` dit maintenant ce que le serveur rend.
- `serializeMeasures` déclarait rendre des `ObjetSerialise[]` : elle rend des cotes. Le type
  `MesureSerialisee` le dit (alias de type et non interface, pour rester assignable à `Mesure`).
- `renderTerrasseSelector` demandait les neuf fonctions de `ContexteTerrassePanels` ; elle en lit
  deux. Sa signature le dit désormais (`ContexteSelecteurTerrasse`).
- Le test d’échafaudage change d’objet : il vérifiait que `legacy.ts` commençait par `@ts-nocheck`,
  il vérifie maintenant que `legacy.ts` n'existe plus **et** qu'aucun fichier de `src/` ne porte la
  directive. 535 tests (534 + celui-là).

## [1.1.0-alpha.13] — 2026-08-30

**Phase 7, dixième et dernier palier du barreau 2 : `ui/` est typé de bout en bout.**
371 → 0 erreurs sous `noImplicitAny` ; total du dépôt 387 → **0**. `--noImplicitAny` est désormais
propre sur **l'intégralité de `src/`** — quatorze dossiers sur quatorze protégés par le cliquet.

### Interne

- Les dix fichiers de `ui/` typés : `panelTabs.ts`, `cloture.ts`, `texturePicker.ts`,
  `mesurePanel.ts`, `selector.ts`, `attrPanel.ts`, `tables.ts`, `projectBar.ts`, `terrassePanels.ts`
  et `cadastreDialog.ts` (104 erreurs, le plus gros fichier du palier).
- Une limite notée depuis le palier `three/` est refermée : `ObjetPlan` déclare maintenant
  `textureVerticale`, `textureHorizontale`, `textureArbre` et `clotureTexture` comme
  `TextureAppliquee | null` plutôt que de les laisser passer par l'index signature en `unknown`.
  `TextureAppliquee` vit dans `model/types.ts`, pas dans `ui/texturePicker.ts` qui la produit — même
  raison que `Mesure` : c'est une donnée du projet.
- Le zonage PLU (`ObjetPlan.plu`) quitte `unknown` pour `ZonagePlu | null`. La famille de types
  (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`, `CommunePlu`,
  `ZonagePlu`) déménage de `geo/apiIgn.ts` vers `model/types.ts` pour la même raison — `bdtopo`
  reste `unknown`, sa forme variant trop d'une couche IGN à l'autre (spec §12).
- `ContexteImportCadastre`, exporté depuis `projectBar.ts` et importé par `cadastreDialog.ts` :
  troisième cas de ce palier où un `ctx` partagé entre deux fichiers a été nommé une fois plutôt que
  redéfini deux fois.
- Une leçon d'outillage, pas de code : les méthodes en sucre syntaxique d'un littéral d'objet
  (`{ foo() { return this.x; } }`) ne reçoivent **pas** le type de `this` depuis l'annotation de la
  variable (`const o: T = {...}`) sous `noImplicitAny` seul — `noImplicitThis` (famille `strict`,
  éteint ici) est ce qui active cette inférence. Il faut un paramètre `this: T` explicite sur chaque
  méthode. Découvert sur les trois méthodes de l'état du dialogue cadastral
  (`EtatImportCadastre.parcellesPropriete`/`estPropriete`/`voisinesRetenues`).
- Vérifié en plus des empreintes habituelles — et c'est le contrôle qui compte ici, les six
  empreintes n'ouvrant jamais le réseau : l'import cadastral complet (adresse → parcelle →
  voisines → création) rejoué en direct rend le même projet (4 objets, mêmes hauteurs, même IDU,
  même zonage PLU) qu'avant le typage du palier.

### Dette soldée (même jour, sans nouveau build)

`tests/` portait 22 erreurs `noImplicitAny` restées hors du périmètre du cliquet (qui ne gate que
`src/`) — des littéraux d'objet passés à des fonctions génériques (`normalizeObjects<T>`,
`creerCreation(etat: EtatCreation, ...)`) sans annotation, où `pts: []` ou `terrasseLieeKey: null`
s'inféraient en `any` faute de type contextuel. Corrigées dans `tests/unit/{engine/moteur,
export/resume, interaction/drag, model/creation, model/normalisation}.test.ts` en typant
explicitement les variables intermédiaires (`const src: ObjetBrut[] = [...]`) plutôt que les
littéraux inline, qui n'en avaient pas besoin. Aucun fichier de `src/` touché, donc aucun impact sur
`dist/index.html` — pas de nouveau build, pas de nouvelle version.

Le cliquet (`scripts/cliquet.mjs`) protège désormais `tests/` comme un bloc unique, en plus des
quatorze dossiers de `src/` : **`--noImplicitAny` est à zéro sur l'ensemble du dépôt**, tests
compris.

## [1.1.0-alpha.12] — 2026-08-30

**Phase 7, neuvième palier : `export/` est typé de bout en bout.** 122 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 510 → **387**. Treize dossiers sur quatorze sont tenus par le
cliquet. Seul `ui/` (371) reste — volontairement en dernier, la couche la plus grosse et la moins
testée.

### Interne

- `export/pdf/writer.ts`, `export/resume.ts`, `export/pdfPlan.ts`, `export/svgPlan.ts` et
  `export/dossierPdf.ts` (76 erreurs à lui seul, le plus gros fichier du palier) typés.
- `ObjetASurface` dans `resume.ts` : `surfaceDe` ne lit que `type`, `pts`, `r`, `width` — les tests
  l'appellent sur des objets partiels, ce qui a guidé le type plutôt que d'imposer `ObjetPlan`
  complet.
- `Projeteur`, `MetaDossier`, `OptionsCotation` et `OptionsAngles` dans `dossierPdf.ts` : les
  fonctions de cotation (`cotationPolygone`, `anglesPolygone`) ne dépendent d'aucune forme du plan,
  seulement d'un tableau de points et d'une fonction de projection — exactement ce que les types
  disent maintenant.
- `MetaSvg` dans `svgPlan.ts`, exportée aux côtés de `MetaPdf` (déjà posée au palier `render/`) :
  même paire `appVersion`/`schemaVersion`, deux fois parce que les deux producteurs vivent dans des
  fichiers séparés.
- Vérifié en plus des empreintes habituelles : les deux PDF (`plan.pdf`, `dossier.pdf`) gardent
  exactement leurs comptes de textes, d'objets et de pages (143/14/2 et 106/15/3) après le typage —
  la mise en page n'a pas bougé d'un point.

## [1.1.0-alpha.11] — 2026-08-30

**Phase 7, huitième palier : `three/` est typé de bout en bout**, et l'écart entre la spec et le
code sur les typages Three.js est refermé. 128 → 0 erreurs sous `noImplicitAny` ; total du dépôt
638 → **510**. Douze dossiers sur quatorze sont tenus par le cliquet ; restent `ui` (372) et
`export` (122).

### Interne

- **`@types/three@0.128.0` en devDependency.** La spec §8.3 prescrivait cette option A depuis le
  début ; le code faisait l'inverse (`declare const THREE: any`), avec un commentaire qui
  argumentait contre une décision déjà prise. C'est la dépendance de **type** sans dépendance de
  code : la bibliothèque continue d'arriver du CDN à l'ouverture de la Vue 3D, aucun `import` de
  valeur ne pointe vers `three`, et le build ne contient toujours aucune trace du paquet — vérifié
  sur les octets produits.
- `SceneTrois` n'est plus `Record<string, any>` mais deux formes réelles : `SceneVue3d` (qui cadre
  un plan : `extent`, `cen`) et `SceneGlb` (qui cadre un modèle déjà produit : `centre`, `rayon`),
  au-dessus d'un `SceneTroisBase` de huit champs — exactement ce que les deux vues partagent.
- Trois gardes de type dans `three/gardes.ts` (`estMesh`, `estLumiere`, `estTexture`), qui reprennent
  **le test déjà écrit** (`o.isMesh`, `o.isLight`, `v.isTexture`) et le rendent au vérificateur.
  Three.js répond à ces questions par des drapeaux plutôt que par `instanceof`, et c'est volontaire
  de sa part : deux copies de la bibliothèque dans une même page ont des constructeurs différents.
- Deux types qui mentaient, corrigés : `reglerSoleil(lum: SceneTrois, …)` demandait une scène
  entière alors que son propre commentaire décrivait cinq champs (`EclairageSoleil` désormais), et
  l'appelant de la Vue 3D lui construit un objet à quatre champs sans jamais passer de scène ; et
  `attendreTexturesPretes` déclarait `new Set<SceneTrois>()` — un ensemble de *scènes* — pour y
  ranger des textures.
- Un homonyme évité de justesse : `CameraConservee`, écrit d'abord dans `app/ecouteurs/visionneuse.ts`,
  vit dans `three/glbViewer.ts` avec les autres types de la visionneuse.
- Trouvé sans le corriger, parce que le corriger changerait le rendu : `if(THREE.SRGBColorSpace)
  tex.colorSpace = …` dans `three/scene.ts` **ne fait rien** — ces deux noms n'existent qu'à partir
  de la r152, et le CDN sert la r128. Le garde-fou est tourné vers l'avenir ; il s'allumera de
  lui-même à une montée de version. Le typage l'a rendu visible, il est maintenant documenté sur
  place.
- Vérifié en plus des empreintes — et c'est ce qui compte ici, car aucune des six n'ouvre la 3D :
  l'export GLB refait en direct rend les **mêmes compteurs structurels** qu'au relevé d'origine
  (glTF 2.0, 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 1 scène), et la visionneuse
  supporte bascule du fond et filaire sans fuite de canevas ni erreur.

## [1.1.0-alpha.10] — 2026-08-30

**Phase 7, septième palier : `geo/` est typé de bout en bout.** 127 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 790 → **638** (le typage d'`apiIgn.ts` a aussi éteint 25 erreurs
dans `ui/`, qui lisait ses retours). Onze dossiers sont maintenant tenus par le cliquet.

### Interne

- `geo/apiIgn.ts`, `geo/cadastreObjets.ts` et `geo/soleil.ts` typés. GeoJSON décrit une fois pour
  toutes (`Anneau`, `GeometrieGeoJSON`, `FeatureGeoJSON<P>`, `CollectionGeoJSON<P>`,
  `EmpriseGeoJSON`), plus les types du domaine : `ParcelleCadastrale`, `ParcellePrincipale`,
  `ObjetBdTopo`, `AdresseRecherchee`, `ProjecteurCadastre`, `ImportCadastral`, et la famille PLU
  (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`, `CommunePlu`,
  `ZonagePlu`).
- Un paramètre mort retiré : `formeCommune(pts, c)` ne lisait jamais `c`. Trouvé en écrivant la
  signature, vérifié non lu dans le corps, ôté ; les deux appels passaient une parcelle qui ne
  servait à rien (spec §10.3).
- Vérifié en plus des empreintes habituelles — et c'est la vérification qui compte ici, car les
  goldens ne font **aucun** appel réseau : l'import cadastral « Place de la Mairie 35000 Rennes »
  rejoué en direct sur le témoin figé 1.0.0 et sur le build typé, à quelques minutes d'intervalle,
  rend le **même projet au bit près** (25 232 octets normalisés, même SHA-256). Toute la chaîne y
  passe : BAN, API Carto cadastre, BD TOPO en WFS, GPU/PLU.

## [1.1.0-alpha.9] — 2026-08-30

**Phase 7, sixième palier : `app/` est typé de bout en bout.** 19 → 0 erreurs sous `noImplicitAny` ;
total du dépôt 809 → **790**.

### Interne

- Cinq fichiers de `app/ecouteurs/` (affichage, clôture, divers, visionneuse, Vue 3D) et
  `app/modes.ts` (le pilotage des quatre vues) typés.
- `ObjetPlan` gagne `clotureActive`, `clotureHauteur`, `clotureCouleur`, `clotureTexture` (ce dernier
  reste `unknown` : sa forme réelle appartient au sélecteur de texture, non encore typé, palier
  `ui/`).
- Vérifié en plus des empreintes habituelles : le pilotage des quatre vues (Plan, Terrasse, Vue 3D,
  visionneuse) et la bascule de la grille, en séquence, sans erreur.

## [1.1.0-alpha.8] — 2026-08-30

**Phase 7, cinquième palier : `interaction/` est typé de bout en bout.** 53 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 862 → **809**.

### Interne

- `interaction/outilAlignement.ts` et `interaction/pointeur.ts` (le câblage des événements de
  pointeur — sélection, glisser, double-tap, molette, pincement, pan à trois doigts) typés.
- Deux champs `startScreen` (posés sur les gestes `circleMove`/`shapeMove`, jamais lus nulle part —
  seul le pan lit le sien) retirés : trouvés en écrivant le type du geste, vérifiés morts, ôtés.
- Vérifié en plus des empreintes habituelles : un glisser de sommet simulé par de vrais
  `PointerEvent` déplace le sommet visé exactement du delta demandé et laisse les cinq autres
  inchangés ; un zoom molette redessine la scène.

## [1.1.0-alpha.7] — 2026-08-30

**Phase 7, quatrième palier : `io/` est typé de bout en bout.** 57 → 0 erreurs sous `noImplicitAny` ;
total du dépôt 919 → **862**.

### Corrigé

- `Atelier.restoreState` (et son équivalent local dans `io/projet.ts`) annonçait `ObjetPlan[]` alors
  que `core/historique.ts` passe toujours ces objets par `normalizeObjects` en les restaurant — un
  import de fichier ou un cadastre nouvellement créé n'a jamais cette forme complète. Le paramètre
  attend désormais `ObjetBrut[]`, ce que le type garantit réellement ; un `ObjetPlan[]` déjà complet
  (le cas de l'annulation) le satisfait toujours.

### Interne

- `ObjetPlan` gagne `affichage` (masquage du voisinage et de la grille, rattachés à la parcelle comme
  le fond orthophoto).
- `io/validation.ts` type la porte d'entrée d'un fichier de projet (`ProjetValide`), en passant par un
  type `ProjetBrut` intermédiaire pour la même raison qu'ailleurs dans ce module : rien n'est garanti
  avant vérification champ par champ.
- `io/serialisation.ts`, `io/exportProjet.ts`, `io/importSvg.ts`, `io/projet.ts` typés ; réutilisent
  `ObjetSerialise` (model/creation.ts) pour les données post-liste-blanche.
- Vérifié en plus des empreintes habituelles : un cycle export JSON → import (remplacement) sur le jeu
  de démonstration restaure exactement les 35 objets et 11 mesures, relevé de santé identique.

## [1.1.0-alpha.6] — 2026-08-30

**Phase 7, troisième palier : `render/` est typé de bout en bout.** 33 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 952 → **919**.

### Corrigé

- `render/objects.ts` déclarait sa propre interface `ObjetPlan` — **quatrième** type local homonyme
  du modèle trouvé en phase 7, après `ObjetPlan` dans `render/measures.ts`, `EtatPlan` dans
  `app/atelier.ts` et `ObjetParasol` dans `render/parasolOverlay.ts`. Renommée `ObjetRendu` et dérivée
  du modèle (`ObjetPlan & Required<Pick<...>>`) plutôt que réécrite.
- Un test de `model/normalisation.ts` utilisait `cadastre`/`ortho` comme noms de champs arbitraires
  pour vérifier le clonage générique des métadonnées. Le typage de ces deux champs (ci-dessous) a
  rendu ses valeurs de test invalides ; corrigé en leur donnant leur forme réelle plutôt qu'inventée.

### Interne

- `ObjetPlan` gagne `construction`, `cadastre` (partiel — seuls les deux champs lus par le fond
  orthophoto), `ortho`, et les champs de parasol/lieu déjà posés au palier précédent.
- `render/ortho.ts` type le fond WMTS de bout en bout : `ContexteOrtho`, `TuileOrtho`,
  `ConfigOrthoComplete`, `ReferenceGeo`, `ResultatChargementOrtho`.
- `render/pipeline.ts` (`ContexteRendu`) et `render/terrasseCouches.ts` typés ; `Segment`/`Appui`
  (engine/structure.ts) réutilisés pour le calque des couches d'une terrasse.
- Vérifié en plus des empreintes habituelles : le fond orthophoto, activé à la main (le jeu de
  démonstration ne l'active pas), pose les quatre mêmes tuiles — mêmes coordonnées au dernier chiffre
  décimal — que sur le témoin figé.

## [1.1.0-alpha.5] — 2026-08-30

**Phase 7, deuxième palier : `engine/` est typé de bout en bout.** 315 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 1 308 → **952**.

### Corrigé

- **Une garde que j'avais introduite au palier précédent aurait perdu des saisies.** `cadenceDe`
  filtrait `c.cadences` quand ce n'était pas un objet « propre » — or les projets enregistrés portent
  `[]` là où le défaut pose `{}` (c'est le cas du jeu de démonstration), et écrire
  `cadences['piquetage'] = 7` sur un tableau y pose bel et bien une propriété relisible. Le filtre
  aurait fait disparaître une cadence saisie, sans erreur ni trace. Remplacé par
  `model/dictionnaire.ts`, qui indexe exactement comme avant.
- `render/parasolOverlay.ts` déclarait sa propre interface `ObjetParasol` de quatre champs, coupée du
  modèle — troisième type local homonyme trouvé par le typage, après `ObjetPlan` dans
  `render/measures.ts`.

### Interne

- `Construction` (53 champs), `LigneBom`, `VueEnregistree`, `Mesure`, `Segment`, `PrixParLongueur`
  rejoignent `model/types.ts` ; les champs de parasol et le lieu deviennent explicites sur
  `ObjetPlan`. C'est le levier qui a fait tomber les 315 erreurs.
- `engine/` gagne ses types de calcul : `Structure`, `CouchesTerrasse`, `Debit`, `GroupeDebit`,
  `Appui`, `ZoneEquipement`, `CandidatStructure`, `EchantillonSoleil`, `GeometrieOmbre`,
  `CarteOmbre`, `PosteChantier`. Les deux derniers **dérivés** de leur fonction plutôt que réécrits.
- `computeChantier` déclare ses quantités en `Record<PosteChantier, number>` : ajouter une cadence
  sans sa quantité devient une erreur de compilation au lieu d'un poste compté à zéro en silence.
- Quatre exigences nommées plutôt que l'objet entier — `TerrasseEtudiee`, `PorteurDeConstruction`,
  `ObjetMesurable`, `ObjetCote` : ces fonctions ne lisent ni clef ni nom, et l'optimiseur évalue déjà
  des configurations sur un objet fabriqué pour l'occasion.
- 19 affectations `input.value = <nombre>` deviennent explicites (`String(...)`). Elles reposaient sur
  la coercition implicite ; le comportement est identique, la valeur des 31 champs du panneau
  Terrasse a été comparée au témoin figé.
- `structureVide()` remplace l'ossature vide que les panneaux se fabriquaient à la main.

## [1.1.0-alpha.4] — 2026-08-29

**Phase 7 — le cliquet de rigueur.** Premier palier de l'échelle du tsconfig : `shell`, `geometry` et
`model` sont à zéro erreur sous `noImplicitAny`, et ne peuvent plus régresser.

### Corrigé

- **Le numéro de version avait cessé de suivre ce journal.** `alpha.2` et `alpha.3` y étaient
  annoncés alors qu'`APP_VERSION` et `package.json` étaient restés à `alpha.1` : ces deux versions
  n'ont jamais été estampillées dans un artefact livré. Le numéro repart d'`alpha.4`, et les six
  empreintes sont recapturées — après avoir prouvé, ligne à ligne, que **seule** la ligne de version
  bouge (EMPREINTES.md, « recapture de rattrapage »).
- `geometry/rings.ts` annonçait `{ a, b }` là où il manipulait des paires `[p0, p1]`. Le type était
  faux depuis son écriture ; le code, lui, était cohérent. Aucun comportement modifié.
- `render/measures.ts` déclarait sa propre interface **nommée `ObjetPlan`**, différente de celle du
  modèle. Renommée `ObjetCote` : ce n'est pas un type de donnée mais une exigence de quatre champs.

### Interne

- `scripts/cliquet.mjs` (`npm run cliquet`) : lance `tsc` avec les drapeaux du barreau visé et échoue
  si une erreur vient d'un dossier déclaré propre. `tsconfig.json` ne sait pas le faire — restreindre
  `include` ne restreint rien, les fichiers importés entrent quand même dans le programme.
- Types partagés consolidés : `Mesure` passe de `render/` à `model/types.ts` (c'est une donnée du
  projet, et `core/state.ts` en tient la liste) ; `EtatApp.objects` et `.measures` cessent d'être des
  `Record<string, unknown>[]` ; `EtatPlan` cesse d'être un `any` et désigne `EtatApp` ; `ObjetBrut`
  nomme un objet **avant** normalisation.
- `normalizeObjects` devient générique — `<T> ⟶ (T & ObjetBrut)[]` — ce qui est littéralement son
  travail : elle n'enlève rien, elle ajoute.
- `model/creation.ts` prend un `EtatCreation` de cinq champs au lieu de l'état entier : `model/` n'a
  pas à connaître la pile d'annulation ni la transformation de la scène.
- 1 375 → **1 308** erreurs au barreau 2. L'index `[autreChamp: string]: unknown` d'`ObjetPlan`
  n'est **pas** retiré : c'est un chantier orthogonal à `noImplicitAny` (spec §9.2.4).

## [1.1.0-alpha.3] — 2026-08-29

Les quatre dernières fonctions de logique sortent de `legacy.ts`.

### Interne

- `ui/panelTabs.ts`, `interaction/outilAlignement.ts` (l'alignement rejoint le côté de référence
  qu'il lisait déjà), `io/exportProjet.ts`, `three/exportGlb.ts`.
- `shell/download.ts` gagne `telechargerBinaire` : le même détour ancre-invisible que pour le texte,
  qui était recopié à la main dans l'export GLB.
- `legacy.ts` : 1 625 → 1 500 lignes. Plus aucune fonction de plus de quinze lignes hors `boot()`.

## [1.1.0-alpha.2] — 2026-08-29

Le résumé et l'ordre d'empilement sortent de `legacy.ts` ; les couches sont rangées et la règle de
dépendance devient vérifiable.

### Interne

- `export/resume.ts` (**18 tests** — un des six artefacts de référence, jusqu'ici sans aucun test),
  `render/empilement.ts` (**14 tests**), `geometry/angles.ts`.
- **`shell/`** : `dialogs`, `dom` et `download` n'étaient ni des panneaux ni du pur. Ils quittent
  `ui/` et `util/`. `geometry/vue.ts` (transformation monde ↔ écran) quitte `render/`.
- `tests/unit/architecture.test.ts` vérifie désormais la règle de dépendance, la pureté de
  `geometry`/`model`/`util`, et qu'aucun module n'importe `legacy.ts`. Il a trouvé un quatrième
  fichier mal rangé dès sa première exécution.
- 52 lignes de commentaires orphelins retirées — ils décrivaient du code parti ailleurs.

## [1.1.0-alpha.1] — 2026-08-29

**La version livrée n'est plus le fichier mono-page d'origine : c'est le build.** `plan.html` passe
de 779 140 à 450 713 octets. Le témoin figé reste sous `legacy/plan_interactif.html`.

### Modifié

- `APP_VERSION` : `1.0.0` → `1.1.0-alpha.1`, `BUILD_AT` → `2026-08-29`.
- **Les six empreintes de référence changent**, et c'est voulu : la version est estampillée dans les
  six artefacts exportés. Prouvé avant recapture — à numéro inchangé le build reproduisait les
  anciennes empreintes au bit près, et après changement une seule ligne diffère par artefact texte
  (l'en-tête du résumé, `data-app-version` du SVG, la signature du DXF, `meta.appVersion` du JSON).
  Les deux PDF ont été comparés sur leur contenu : nombres de textes, d'objets et de pages
  inchangés. Voir `tests/fixtures/golden/EMPREINTES.md`, section « La rupture ».
- `export-pdf.test.ts` acceptait `[\d.]+` comme numéro de version : il accepte désormais un SemVer
  complet, pré-publication comprise.

### Non modifié

- **Le schéma du projet reste à 1.** Un fichier enregistré par la 1.0.0 s'ouvre dans cette version,
  et réciproquement. La rupture porte sur l'artefact livré, pas sur les données.

### Ce que cette version n'est pas

Ce n'est pas la `1.1.0` : son critère de sortie exige `legacy.ts` supprimé et la phase 7 terminée.

## [1.0.1-alpha.46] — 2026-08-29

Les trois points laissés en suspens sont soldés.

### Supprimé

- `muter()`, dans l'historique : personne ne l'appelait. Du code mort qui se présente comme le
  chemin sûr est pire que pas de chemin du tout.

### Interne

- L'horloge des clés d'objets devient injectable (`ContexteCreation.horloge`, `Date.now` par
  défaut) — la dernière source de non-déterminisme que `EMPREINTES.md` signalait depuis la phase 0.
  Un scénario qui crée des objets peut désormais être comparé à lui-même.
- `dupliquer()` refaisait le calcul de clé à la main au lieu d'appeler `cle()` : une seule écriture
  de la règle désormais.
- **5 tests**, 490 au total.

### Vérifié plutôt que corrigé

- `altitude: 0` retombe sur 1,60 m. Ce n'est pas une valeur perdue : le panneau d'attributs plafonne
  l'altitude par le bas à 0,10 m, donc `0` ne peut venir que d'un fichier écrit à la main.

## [1.0.1-alpha.45] — 2026-08-29

Les trois mécanismes enchevêtrés du pilotage des vues sont démêlés. Aucun comportement ne change.

### Interne

- `vueCourante` devient la seule vérité sur ce qui est affiché, `appliquerVue()` le seul endroit qui
  touche aux boutons et aux zones, et `etat.appMode` en est dérivé. Plus aucune fonction ne corrige
  après coup l'apparence laissée par une autre.
- La visionneuse GLB devient la quatrième vue au lieu d'un panneau qui pilotait lui-même les boutons.
- La place d'origine du plan est marquée par un nœud-ancre, au lieu d'une référence de frère capturée
  au premier déplacement.
- Vérifié contre le témoin sur dix états, dont le `className` complet des boutons et le rang exact du
  plan parmi ses frères. `legacy.ts` : 1 789 → 1 769 lignes.

## [1.0.1-alpha.44] — 2026-08-29

Le pilotage des modes sort de `legacy.ts` et ouvre le dossier `app/`.

### Interne

- `app/modes.ts` : modes Plan et Terrasse, sous-onglets, déménagement du plan entre ses trois
  emplacements. La « Vue 3D » n'est pas un troisième mode mais le mode Terrasse sur son sous-onglet
  `3d` — ce qui explique les corrections d'apparence à la main après chaque bascule.
- L'interrogation du PLU rejoint `ui/projectBar.ts`, à côté du panneau qu'elle remplit.
- Vérifié contre le témoin sur neuf états de l'interface, dont le parent réel du plan dans le DOM.
- `legacy.ts` : 1 947 → 1 789 lignes, soit **87 %** du fichier d'origine sorti, en 93 modules.

## [1.0.1-alpha.43] — 2026-08-29

### Interne

- La visionneuse GLB rejoint `three/glbViewer.ts`, le sélecteur de terrasse `ui/terrassePanels.ts`.
  Sans aucune terrasse, la Vue 3D reste accessible ; les autres sous-onglets restent derrière
  l'accueil. `legacy.ts` : 2 023 → 1 947 lignes, soit 86 % du fichier d'origine sorti.

## [1.0.1-alpha.42] — 2026-08-29

### Interne

- `render/terrasseCouches.ts` : chaque couche a sa case, et non un onglet exclusif — d'où les traits
  qui maigrissent dès qu'il y en a plus d'une.
- `ui/cloture.ts` : deux passes pour trouver la parcelle, parce que les parcelles voisines importées
  sont elles aussi `fonction === 'terrain'`.

## [1.0.1-alpha.41] — 2026-08-29

### Interne

- `three/soleilVue3d.ts` et `three/chargeurs.ts`. L'état du soleil rejoint `etat3d.ts`, dans les
  mêmes champs que celui de la visionneuse.

### Corrigé avant publication

- Un même drapeau allait servir à l'exporteur glTF et au lecteur, qui sont deux scripts distincts.

## [1.0.1-alpha.40] — 2026-08-29

### Interne

- `three/navigation.ts` : zoom, mode du glisser, hauteur des yeux, points de vue, plein page. La
  conversion d'un point de vue vers le repère de la scène était écrite deux fois ; **10 tests**.

### Corrigé avant publication

- Le fichier de tests d'`alpha.39` ne passait pas `tsc` : le typecheck avait été lancé avant son
  écriture, pas après.

## [1.0.1-alpha.39] — 2026-08-29

La normalisation, la création d'objets et les contraintes de parasol sortent de `legacy.ts`.

### Interne

- `model/normalisation.ts`, `model/creation.ts` (fabriques pures séparées de la pose dans le plan),
  et la contrainte « pied en bordure » dans `engine/parasol.ts` — c'est le **pied** qu'on projette
  sur le pourtour, pas le centre de la toile.
- **44 tests**, 476 au total. `legacy.ts` : 2 584 → 2 354 lignes.

## [1.0.1-alpha.38] — 2026-08-29

La Vue 3D et la visionneuse GLB partagent enfin un seul soleil.

### Interne

- `three/lumiere.ts` : `reglerSoleil()` porte le calcul qui était écrit deux fois — trente lignes de
  trigonométrie et trois règles d'éclairage. La seule différence réelle entre les deux vues devient
  un paramètre : la Vue 3D est centrée sur l'origine, la visionneuse sur son modèle.
- Vérifié contre le témoin figé en interceptant ce qui est réellement passé à Three (position du
  soleil, facteur jour) : neuf réglages, deux vues, identiques au dernier chiffre.
- `legacy.ts` : 2 606 → 2 584 lignes.

## [1.0.1-alpha.37] — 2026-08-29

Le lieu et le curseur « semaine » sortent, avec leurs doublons.

### Interne

- `util/semaine.ts` : le décalage d'un cran était dupliqué dans les deux vues 3D. Il est **relatif**
  à la date courante (sept jours par cran) et ne suit **pas** la numérotation ISO.
- `model/lieu.ts` : le lieu est rattaché à la parcelle, donc enregistré avec le projet. Une longitude
  de 0 est une position, pas une absence.
- **20 tests**, 432 au total. `legacy.ts` : 2 634 → 2 606 lignes.

## [1.0.1-alpha.36] — 2026-08-29

Les hauteurs sortent de `legacy.ts`, en une seule définition.

### Interne

- `engine/hauteurs.ts` : hauteur d'appui, hauteur finie, élévation — lues par le plan de coupe, la
  3D, le dossier PDF et le chiffrage. Une vis de fondation est enterrée, seul son dépassement de tête
  soulève ; un plot est posé, toute sa hauteur compte.
- **18 tests**, 412 au total. Hauteur finie identique au témoin : 27 cm sur les deux terrasses de la
  démonstration. `legacy.ts` : 2 661 → 2 634 lignes.

## [1.0.1-alpha.35] — 2026-08-29

Le client `api.php` sort de `legacy.ts`.

### Interne

- `io/api.ts` : la règle qui portait tout est maintenant explicite — on ne retombe sur le jeu de
  démonstration que si **ce navigateur n'a jamais ouvert aucun projet**. Dès qu'un identifiant est
  connu, un échec est remonté : substituer la démonstration faisait croire qu'un vrai projet avait
  été perdu.
- **14 tests** jsdom, 394 au total. `legacy.ts` : 2 727 → 2 661 lignes.

## [1.0.1-alpha.34] — 2026-08-29

L'historique sort **tel quel**, pour être réécrit ensuite.

### Interne

- `core/historique.ts` : le code n'a pas bougé d'une ligne ; l'en-tête dit en sept points ce qu'une
  réécriture doit savoir. **18 tests de caractérisation**, dont un qui vérifie une *absence* : il
  n'existe pas de rétablissement, et ce test doit échouer le jour où il arrivera.
- `legacy.ts` : 2 914 → 2 727 lignes.

## [1.0.1-alpha.33] — 2026-08-29

### Interne

- `render/pipeline.ts` : l'orchestration du dessin sort de `legacy.ts`.

## [1.0.1-alpha.32] — 2026-08-29

### Interne

- Le débit de bois rejoint les autres tables dans `ui/tables.ts`.

## [1.0.1-alpha.31] — 2026-08-29

La validation d'un fichier de projet sort de `legacy.ts`, et gagne les tests qu'elle n'avait pas.

### Interne

- `io/validation.ts` : les trois refus (schéma trop récent, coordonnées au-delà de 100 km, aucun
  objet exploitable) sont documentés pour ce qu'ils protègent. **19 tests**, 362 au total.
- `legacy.ts` : 3 119 → 3 086 lignes.

## [1.0.1-alpha.30] — 2026-08-29

Les tables du dossier et du chiffrage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/tables.ts` : liste des terrasses du dossier, métré, débit de bois. Aucune ne calcule.
- `legacy.ts` : 3 253 → 3 119 lignes.

### Corrigé avant publication

- La table du métré est restée vide un moment : une fabrique de contexte n'avait pas été insérée là
  où je croyais. Le contrôle de santé ne l'a pas vu — il a fallu comparer au témoin (7 et 18 lignes
  contre 0 et 0).

## [1.0.1-alpha.29] — 2026-08-29

Le chargement d'un projet importé sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/projet.ts`. La séquence compte : remplacer les données, reconstruire les vues, **puis**
  restaurer les réglages rangés sur la parcelle.
- `legacy.ts` : 3 345 → 3 253 lignes.

## [1.0.1-alpha.28] — 2026-08-29

Les événements de pointeur sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/pointeur.ts` (289 lignes) : sélection, glisser, double-clic, molette, pincement,
  déplacement à trois doigts. Deux différences doigt/souris y sont documentées.
- Vérifié contre le témoin figé, à froid : sommet tiré de (+12,7095 ; −8,1172) m, molette,
  insertion de sommet.
- `legacy.ts` : 3 599 → 3 345 lignes.

## [1.0.1-alpha.27] — 2026-08-29

Le fond orthophoto sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `render/ortho.ts` : tuiles WMTS de l'IGN, cache, calage sur le repère du plan, réglages. Vérifié
  sur des tuiles réelles — 4 tuiles, opacité du terrain 1 → 0,15 puis retour.
- `legacy.ts` : 3 816 → 3 599 lignes.

## [1.0.1-alpha.26] — 2026-08-29

L'outil de cotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/outilMesure.ts` : le brouillon d'une cote en cours de pose, partagé par le
  `pointerdown` du plan, le panneau et le rendu. Il ne vit pas dans `etat` : rien ne s'enregistre
  tant que la cote n'est pas validée.
- `ui/mesurePanel.ts` : son affichage.
- `legacy.ts` : 3 931 → 3 816 lignes.

## [1.0.1-alpha.25] — 2026-08-29

Le sélecteur d'objets et la table d'affichage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/selector.ts`. Le filtre par famille descend avec le sélecteur : ce n'est ni une donnée du plan
  ni une préférence enregistrée.
- `legacy.ts` : 4 098 → 3 931 lignes.

## [1.0.1-alpha.24] — 2026-08-29

La visionneuse GLB et le chargement de Three.js sortent de `legacy.ts`.

### Corrigé avant publication

- `SOLEIL_ELEV_PLANCHER`, partagée entre la Vue 3D et la visionneuse, était partie avec cette
  dernière : la construction de la scène 3D échouait **à mi-course** — 46 nœuds au lieu de 203, sans
  erreur visible. Elle a désormais son module, `three/lumiere.ts`.
- Un renommage global avait atteint un identifiant d'élément dans une chaîne
  (`getElementById('glbViewerFilaire')`), ce qui cassait le boot.

### Interne

- `three/glbViewer.ts`, `three/lumiere.ts`, et l'état de la visionneuse dans `three/etat3d.ts`.
- `legacy.ts` : 4 365 → 4 098 lignes.

## [1.0.1-alpha.23] — 2026-08-29

La sérialisation et l'import SVG sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/serialisation.ts` : `serializeObjects` est une **liste blanche** — un champ qui n'y est pas
  nommé disparaît au premier enregistrement.
- `io/importSvg.ts` : le pendant exact de `export/svgPlan.ts`.
- `legacy.ts` : 4 576 → 4 365 lignes.

## [1.0.1-alpha.22] — 2026-08-29

La barre de projet, l'actualisation cadastrale et le panneau PLU sortent de `legacy.ts`.

### Interne

- `ui/projectBar.ts` : `setupProjectBar()`, `renderPanneauPlu()`, `actualiserDepuisIgn()`,
  `ouvrirDialogueActualisation()`, `construireVoisinage()`.
- `legacy.ts` : 5 214 → 4 576 lignes.

### Corrigé avant publication

- Le boot s'arrêtait juste avant le premier `render()` : la fabrique de contexte avait été insérée
  au niveau du module, alors que `etat` est une **locale de `boot()`**. Plan sans étiquettes et
  barre vide. Trouvé en comparant HEAD et la modification dans le même onglet neuf.

## [1.0.1-alpha.21] — 2026-08-29

Les huit panneaux du mode Terrasse sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/terrassePanels.ts` : configurateur, paramètres de calcul, plan de coupe, débit de bois,
  implantation, chantier, méthode, optimisation — 1 373 lignes.
- `legacy.ts` : 6 585 → 5 214 lignes. Vérifié panneau par panneau contre le témoin figé, au
  caractère près.

## [1.0.1-alpha.20] — 2026-08-29

La Vue 3D sort de `legacy.ts` — et une régression sérieuse en sort avec elle.

### Corrigé

- **La Vue 3D était vide et l'export GLB ne se terminait jamais**, depuis le correctif « une seule
  scène » de l'alpha.8 : le remplacement en masse `scene.` → `etat.scene.` avait aussi capturé les
  scènes **locales** de la 3D. `TypeError: etat.scene.add is not a function`, qu'aucun golden file
  ne pouvait voir. Corrigé aux 33 sites concernés. Le GLB retrouve exactement l'empreinte
  structurelle du golden : 203 nœuds, 200 maillages, 288 matériaux, 178 textures.

### Interne

- `three/scene.ts` et `three/etat3d.ts`. `legacy.ts` : 7 209 → 6 585 lignes.

## [1.0.1-alpha.19] — 2026-08-29

Le panneau d'attributs sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/attrPanel.ts` (717 lignes) et `interaction/outilAlignement.ts` pour la cible de l'outil
  d'alignement, partagée par trois endroits.
- `legacy.ts` : 7 912 → 7 209 lignes.

## [1.0.1-alpha.18] — 2026-08-29

Le dialogue d'import cadastral sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/cadastreDialog.ts` (753 lignes). La fonction était passée **en callback** à `showConfirm` :
  avec un paramètre de contexte, elle aurait reçu l'argument du confirm. Six appels asynchrones
  lancés sans attente sont désormais marqués `void`.
- `legacy.ts` : 8 663 → 7 912 lignes.

## [1.0.1-alpha.17] — 2026-08-29

L'acquisition IGN sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/apiIgn.ts` : géocodage BAN, cadastre API Carto, BD TOPO, PLU. Ce module ne connaît ni le DOM
  ni l'état.
- `geometry/proximite.ts` : distances entre contours — des critères de classement, jamais des
  mesures publiées.
- Un doublon disparaît : `aireSignee` était `signedArea`.
- `legacy.ts` : 9 011 → 8 663 lignes.

## [1.0.1-alpha.16] — 2026-08-29

Les quatre constructeurs d'export sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `export/dxfPlan.ts`, `export/svgPlan.ts`, `export/pdfPlan.ts`, `export/dossierPdf.ts`, plus
  `export/separateurs.ts` (contrat entre l'export et l'import SVG).
- `model/types.ts` gagne `ObjetPlan`.
- `legacy.ts` : 9 699 → 9 011 lignes.

## [1.0.1-alpha.15] — 2026-08-29

La conversion des données cadastrales sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/cadastreObjets.ts` et `geo/constantesCadastre.ts`. Le paramètre s'appelle `importe` et non
  `etat` : il portait exactement le nom de l'état de l'application.
- Vérifié par un import réel contre les services IGN : projet identique, `84bc5173…`.
- `legacy.ts` : 9 928 → 9 699 lignes.

## [1.0.1-alpha.14] — 2026-08-28

Les règles qui comblent les trous de la BD TOPO sortent de `legacy.ts`. Aucun comportement ne
change.

### Interne

- `geo/bdtopo.ts` : `hauteurBatiment()`, `hauteurVegetation()`, `arbresEstimes()`,
  `libelleParcelle()` et les deux plafonds d'arbres estimés. Ce sont des choix, pas des mesures :
  les tests servent surtout à ce que personne ne les prenne pour de la donnée et ne les « corrige ».
- `legacy.ts` : 9 971 → 9 928 lignes. 343 tests.

### Vérification

- Ces règles ne servent qu'à l'import cadastral, qui appelle les services IGN en ligne : les golden
  files ne les couvrent pas et l'import de bout en bout n'a pas été rejoué. Déplacement littéral,
  couvert par 18 tests unitaires, application et dialogue d'import vérifiés au navigateur.

## [1.0.1-alpha.13] — 2026-08-28

La composition des étiquettes de côtes et de coins est réunie en un seul endroit. Aucun comportement
ne change.

### Interne

- `model/etiquettes.ts` : `etiquetteComposee()`, `longueurEnMetres()`, `angleEnDegres()`. La règle
  était recopiée à six endroits, dont deux avec une ponctuation ASCII volontaire (les PDF écrivent
  en WinAnsi) que rien ne signalait. La ponctuation est désormais un paramètre nommé.
- `legacy.ts` : 9 988 → 9 971 lignes. 325 tests.

### Documentation

- `tests/fixtures/golden/EMPREINTES.md` : nouvelle section « Ce que ces empreintes ne voient pas ».
  Le jeu de démonstration n'affiche ni nom de côté ni angle — les six empreintes ne couvrent donc
  pas la composition des étiquettes. Le contrôle complémentaire et ses valeurs attendues y sont
  écrits.

## [1.0.1-alpha.12] — 2026-08-28

L'alignement par rotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geometry/alignement.ts` : `alignerSurCote()`, `rotationDAlignement()`, `tourner()`. Trois
  décisions y sont désormais écrites — rotation repliée dans ±90° (un côté s'aligne sur une droite,
  pas sur une direction), pivot au milieu du côté aligné, distance mesurée depuis ce côté et
  conservant la forme du côté où elle est déjà.
- `legacy.ts` : 10 016 → 9 988 lignes. 308 tests.

## [1.0.1-alpha.11] — 2026-08-28

L'ajout et le retrait de sommets sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `model/sommets.ts` : `insererSommet()`, `supprimerSommet()`, `minimumSommets()` — les quatre
  tableaux d'une forme (points, noms de coins, noms de côtés, coins gelés) restent en phase au même
  endroit.
- La suppression d'un objet passe par `detruireVue()`, qui oublie en plus l'entrée de la carte des
  vues — une fuite lente que le code en place laissait derrière lui.
- `legacy.ts` : 10 024 → 10 016 lignes. 291 tests.

### Connu, non corrigé

- Les noms de sommets par défaut sont numérotés d'après le nouveau total, pas d'après la position
  d'insertion : deux insertions peuvent produire deux « Coin 5 ». Comportement du fichier d'origine,
  figé par un test.

## [1.0.1-alpha.10] — 2026-08-28

Le glisser-déposer sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/drag.ts` : les cinq gestes qui modifient la géométrie (forme, cercle, sommet, côté,
  rayon). Le `pointermove` passe de 87 lignes à 6. Principe du module : on refuse plutôt que de
  déformer, et le refus est en bloc.
- `render/theme.ts` ne lit plus `window.matchMedia` sans garde : ce module pouvait empêcher toute
  suite de tests qui l'importe de se charger — 15 tests ne tournaient plus sans qu'aucun n'échoue.
- `legacy.ts` : 10 092 → 10 024 lignes. 278 tests.

### Connu, non corrigé

- Le débordement d'un cercle hors du contour est testé par seize points de son bord, pas par une
  vraie intersection : une fente de contour plus étroite que l'écart entre deux rayons
  échantillonnés laisse passer un cercle qui déborde. Comportement du fichier d'origine, figé par
  un test.

## [1.0.1-alpha.9] — 2026-08-28

`render()` est réduit à son orchestration : le positionnement des objets et le dessin des cotes
vivent dans `render/`. Aucun comportement ne change.

### Interne

- `render/objects.ts` : `positionnerObjet()` — la boucle de 113 lignes qui plaçait chaque objet.
- `render/measures.ts` : `dessinerCotes()`, plus `ancrageHorsContour()` et
  `distanceSortiePolygone()` — l'étiquette se pose hors du contour, au-delà de la dernière sortie
  du rayon.
- `geometry/basic.ts` : `angleInterieurDeg()`.
- Variable morte du fichier d'origine retirée (`const objCenter`, jamais lue).
- `legacy.ts` : 10 271 → 10 092 lignes. 254 tests.

## [1.0.1-alpha.8] — 2026-08-28

Le rendu et les interactions sortent de `legacy.ts`, module par module. Aucun comportement ne
change — mais une régression introduite en cours de route a été trouvée et corrigée.

### Interne

- `render/` : objets SVG d'un plan, calque des parasols, géométrie des cotes, thème, helper
  `creerSvg` typé, décor et grille.
- `interaction/` : édition par côté et par angle, zoom, pincement, déplacement, cadrage.
- `pathD` et `polyStr` rejoignent `geometry/path.ts` : la dette de la phase 2 est soldée.
- `legacy.ts` : 10 839 → 10 271 lignes. 249 tests.

### Corrigé avant publication

- **Le zoom ne faisait plus rien** depuis trois commits : deux scènes coexistaient, l'une écrite
  par la molette, l'autre lue par le dessin. Les golden files ne pouvaient pas le voir — un export
  est recalculé dans son propre repère. Corrigé, et la navigation est désormais couverte par
  23 tests.

### Connu, non corrigé

- Le cadrage plafonne à 400 px/m alors que la molette s'arrête à 220 : écart repris du fichier
  d'origine, figé par un test.
- Sur un élément SVG, `el.title` ne produit aucune infobulle : l'affectation crée une propriété
  inerte. Comportement conservé.

## [1.0.1-alpha.7] — 2026-08-28

Premiers modules de `render/**` et `interaction/**`, rendus possibles par l'état explicite.
Aucun comportement ne change.

### Interne

- `render/` : thème SVG, helper `creerSvg` typé (§7.2), flèche du Nord, échelle, grille,
  géométrie des cotes. `W` et `H` rejoignent `etat.scene`.
- `interaction/editing.ts` : édition par longueur de côté et par angle, contour de contrainte
  passé en paramètre.
- 22 tests ajoutés (221 au total).

### Corrigé avant publication

- Le renommage de `W`/`H` avait détourné les variables locales de `renderImplantation()` (format
  papier en mm) vers la taille de la fenêtre. Restauré et vérifié à l'écran.

## [1.0.1-alpha.6] — 2026-08-28

L'état de l'application tient désormais dans un seul objet explicite (`src/core/state.ts`), à la
place des variables libres de la fermeture de `boot()`. Aucun comportement ne change.

### Interne

- `EtatApp` / `creerEtat()` : données du plan, sélection, modes, bascules d'affichage, édition,
  calque d'ombre. 334 accès passent par `etat.`.
- La variable locale du dialogue d'import cadastre, qui s'appelait aussi `etat`, devient
  `etatImport` : elle masquait l'état global sur 750 lignes.
- 7 tests ajoutés (189 au total).

### Corrigé avant publication

- Le remplacement automatique avait renommé `data-measures` en `data-etat.measures` dans le SVG
  exporté. Un SVG produit par une version antérieure aurait perdu ses mesures à la réimportation.
  Détecté par les golden files, corrigé, et vérifié en réimportant le SVG d'avant migration.

## [1.0.1-alpha.5] — 2026-08-28

Phase 5 de la migration TypeScript, **partielle** : les modules d'interface qui ne dépendent pas
du rendu sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `src/ui/dialogs.ts` : notifications, confirmation, saisie, bandeau d'erreur, écran de reprise.
- `src/ui/texturePicker.ts` : catalogue Poly Haven et fenêtre de choix, typés.
- `src/ui/dom.ts` : helpers `el()` / `elOpt()` / `els()` / `on()` (§7.1), en place pour que le
  code neuf n'ajoute pas de `getElementById` non gardé.
- `main.ts` n'a plus sa copie du bandeau d'erreur : il importe celui du module.
- 19 tests ajoutés sous jsdom (182 au total) — première couverture d'interface du projet.

## [1.0.1-alpha.4] — 2026-08-28

Phase 4 de la migration TypeScript, **partielle** : la séparation donnée/vue est faite, la scène et
la pile d'annulation sont sorties. Aucun comportement ne change.

### Interne

- Les huit poignées SVG que portait chaque objet vivent dans une carte à côté
  (`src/render/vues.ts`) : la donnée du plan redevient sérialisable par construction.
- L'échelle et l'origine forment un objet `scene` ; la conversion monde ↔ écran vit dans
  `src/render/scene.ts`, la scène passée en paramètre.
- La pile d'annulation devient `PileAnnulation` (`src/core/history.ts`), bornée à 60 pas.
- 10 tests ajoutés (163 au total).

### Connu, non corrigé

- Après avoir déroulé toutes les annulations disponibles, « Dupliquer » ne fait plus rien. Le
  comportement est identique sur l'artefact gelé d'avant migration : bug préexistant, consigné pour
  après la migration comme l'impose la spec (§10.3).

## [1.0.1-alpha.3] — 2026-08-28

Phase 3 de la migration TypeScript : le moteur terrasse devient une bibliothèque pure et testée.
Aucun nombre ne change — la parité est prouvée bit à bit.

### Interne

- 10 modules `src/engine/**` (1 429 lignes hors de `legacy.ts`, qui passe à 10 839) : constantes,
  construction, lames, structure, calques, BOM, débit, implantation, chantier, parasols.
- Les deux fonctions qui lisaient l'état global le reçoivent désormais en paramètre, ainsi que
  leurs appelants ; les fonctions d'ombre reçoivent un contexte solaire explicite.
- Oracle du moteur capturé avant déplacement (`tests/fixtures/golden/moteur-terrasses.json`,
  deux terrasses de référence, neuf calculs chacune, artefacts de flottants compris).
- Couverture `src/engine` : 91,5 % (critère de sortie de la spec : ≥ 80 %). 153 tests au total.

## [1.0.1-alpha.2] — 2026-08-28

Phase 2 de la migration TypeScript : extraction des fonctions pures. Aucun comportement ne change,
les six golden files restent identiques au bit près à chaque lot.

### Interne

- 16 modules typés sortent de `legacy.ts` (12 959 → 12 250 lignes) : `model/{units,types,defaults,demo,version}`,
  `geometry/{basic,segments,rect,polygon,rings,path}`, `geo/{projection,soleil}`,
  `export/pdf/writer`, `export/dxf`, `util/{escape,format,download}`.
- 79 tests unitaires ajoutés (106 au total) : géométrie, projection locale, position du soleil,
  structure du PDF assemblé.
- Ce que le typage a fait remonter sans le corriger : `estRectangle` rend `null`/`undefined` et
  jamais `false` sur une entrée vide, `rectangleDepuisCote` peut rendre `null`. Les types le disent
  désormais ; le comportement est inchangé.

## [1.0.1-alpha.1] — 2026-08-28

Phases 0 et 1 de la migration TypeScript
([`MD/spec-migration-typescript.md`](MD/spec-migration-typescript.md) §4) : filet de sécurité, puis
échafaudage **sans déplacer une ligne de logique**. L'application construite est fonctionnellement
identique et produit les six golden files au bit près.

### Modifié

- `history` renommé en `undoStack` (changement A1 accepté par la spec §10.3 : une fois les modules
  en place, la collision avec `window.history` deviendrait silencieuse). Prouvé inerte — les six
  empreintes de référence sont identiques avant et après.

### Interne

- Golden files déposés dans `tests/fixtures/golden/` : résumé, SVG, DXF, projet JSON, PDF plan,
  PDF dossier, plus une empreinte structurelle du GLB (le binaire pèse 41,5 Mo et l'exporteur
  three.js n'est pas déterministe).
- Liste de fumée de 25 interactions (`tests/CHECKLIST-FUMEE.md`), à dérouler avant chaque fusion.
- Artefact gelé dans `legacy/plan_interactif.html`, étiquette `v0-preTS`.
- Chaîne d'outils : Vite 5 avec `vite-plugin-singlefile` (le déploiement reste « copier un
  fichier »), TypeScript 5.7 au barreau permissif, ESLint 9, Vitest 2.
- `plan.html` découpé en `index.html`, `src/styles/app.css`, `src/legacy.ts` (les deux blocs
  `<script>` verbatim, sous `@ts-nocheck`) et `src/main.ts` (amorçage).
- `npm test` recalcule les empreintes des golden files : une régression d'export est désormais
  détectée par la chaîne de test, plus par une relecture.
- `npm run build` produit `dist/index.html` (432 ko) avec `api.php` à côté.
- Le serveur de développement accepte `POST /_fixture/<nom>` pour déposer un golden file au bit
  près : un PDF qui transite par une chaîne JavaScript n'est plus le même fichier.
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
