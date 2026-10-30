// Le toit lu sur une facade (lot L2 de MD/spec-lecture-ia-elargie.md §3.2, §4.1) : la TROISIEME requete de la lecture d'une facade,
// sur la meme image que le run et la lecture enrichie (la bande au-dessus de l'egout que F7 y a ajoutee). Elle lit ce que la facade
// montre du toit : sa couverture et son motif de pose, le debord a l'egout, ce qui couvre le faitage, la gouttiere, et les fenetres de
// toit et panneaux solaires vus sur le pan.
//
// Pourquoi une requete a part (essai du 30 octobre 2026, run 41026430391 du workflow « Vérifier l'API Claude ») : ces champs ajoutes au
// schema de la lecture enrichie font refuser sa sortie structuree par l'API (« The compiled grammar is too large ») ; la lecture enrichie
// de L1 aurait perdu la sortie structuree qu'elle a. Ils ont donc leur schema, petit et plat, et la lecture enrichie reste a l'octet pres
// celle de L1. Les trois requetes ne se lisent pas l'une l'autre ; un echec de celle-ci laisse le run et la lecture enrichie intacts.
//
// Donnees pures : `npm run regles:generer` en ecrit deploy/prompt-facade-toit.md et deploy/schema-facade-toit.json (generation.ts),
// jamais a la main. Chaque champ a un lecteur (regles/facades/observations.ts, lireLectureToit).

import type { SchemaJson } from '../description.js';

/** Le corps du prompt (sans en-tete) : ce que Claude lit, en system, avant le schema. */
const PROMPT = `# Rôle

Vous aidez le logiciel Plan à lire **le toit d'une maison sur la photo d'une de ses façades**. Plan connaît déjà, par le plan cadastral et le LiDAR, la forme du toit, ses pentes et ses hauteurs, et une autre lecture situe le mur et ses ouvertures : vous ne mesurez rien. Vous dites **ce que la couverture est**, comment elle est posée et ce qui la borde, et **où** se trouvent les fenêtres de toit et les panneaux solaires, en proportions. Une personne valide ensuite. Une réponse prudente vaut mieux qu'une réponse fausse : ce que vous ne voyez pas reste \`indetermine\`.

# Ce que vous recevez

- **Image 1 : la façade, vue de face.** C'est l'assemblage des photos redressées du mur, ou une seule photo ; au-dessus de l'égout se voient souvent le pan du toit qui descend vers ce mur, ou le pignon et ses rives.
- **Un texte** : l'étiquette de la façade, et ce que l'image montre du mur.

# Le repère du mur

\`u\` va de 0 (l'angle gauche du mur) à 1 (l'angle droit), le long du mur ; \`v\` va de 0 (le sol, au pied du mur) à 1 (l'égout, là où le toit commence sur les longs pans). Au-dessus de l'égout, \`v\` dépasse 1 : c'est là que se voit le toit. Donnez les nombres au centième (0.37). **Tous les nombres de la réponse sont des parts**, jamais des pixels ni des mètres.

# Comment remplir la réponse

- \`toit\` : ce que l'image montre de la couverture au-dessus de ce mur.
  - \`couverture\` : le matériau — \`tuile-plate\` (petites tuiles rectangulaires ou arrondies, brun rouge nuancé), \`tuile-canal\` (tuiles rondes en rangs alternés), \`tuile-mecanique\` (grandes tuiles à emboîtement et sillons réguliers), \`ardoise\` (plaques fines gris bleuté), \`zinc\` (feuilles métalliques à joints debout), \`bac-acier\` (tôle nervurée laquée), \`membrane\` (étanchéité continue d'un toit plat), \`gravillons\` (lit de gravillons d'un toit plat), \`vegetale\` (sedum, herbe).
  - \`pose\` : le motif des éléments — \`droite\` (en rangs horizontaux), \`losange\` (posés sur la pointe, joints en diagonale), \`ecaille\` (le bas de chaque élément arrondi, comme des écailles de poisson) ; \`indetermine\` pour une couverture continue (zinc, bac acier, membrane) ou si le motif ne se distingue pas.
  - \`debord\` : ce que le toit avance au-delà du mur à l'égout — \`aucun\` (le toit s'arrête au nu du mur), \`faible\` (quelques dizaines de centimètres), \`fort\` (un large avant-toit qui fait de l'ombre au mur).
  - \`faitage\` : ce qui couvre la ligne du haut du toit — \`tuiles\` (des tuiles faîtières rondes ou en angle), \`zinc\` (une bande métallique), \`crete\` (une crête décorée, des épis) ; \`indetermine\` si le faîtage ne se voit pas.
  - \`gouttiere\` : la gouttière le long de l'égout — \`pendante\` (un demi-tube accroché sous le bord du toit), \`nantaise\` (cachée dans la corniche, on ne voit qu'un bandeau), \`aucune\`.
  - \`confiance\` : \`forte\` si le toit se voit net et en grand, \`moyenne\` s'il se voit en partie ou de loin, \`faible\` si vous doutez.
- \`elements\` : chaque fenêtre de toit et chaque champ de panneaux solaires vus sur le pan, son \`element\` (\`fenetre-toit\` : un châssis vitré posé dans la pente, au ras du pan ; \`solaire\` : des panneaux sombres et quadrillés posés sur le pan), de \`u0\` à \`u1\` le long du mur, à la hauteur \`v\` de son milieu (au-dessus de 1), avec sa \`confiance\`.

# Règles de prudence

- Une lucarne (une petite façade verticale avec son propre toit) n'est pas une fenêtre de toit ; une verrière de véranda n'est pas sur le toit de la maison.
- Un pan vu de très près ou très en biais ne dit pas son matériau : \`indetermine\`.
- Une ombre, une mousse ou une tache ne sont pas un motif de pose.
`;

const nombre = { type: 'number' } as const;
const objet = (proprietes: Record<string, unknown>): SchemaJson => ({ type: 'object', additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });
const terme = (...termes: string[]): SchemaJson => ({ type: 'string', enum: termes });
const ref = (nom: string) => ({ $ref: '#/$defs/' + nom });

/** Les mots de la couverture : ceux de l'analyse d'une maison, la grande ardoise en losange en moins (c'est la `pose`). */
export const COUVERTURES_TOIT_LU = ['tuile-plate', 'tuile-canal', 'tuile-mecanique', 'ardoise', 'zinc', 'bac-acier', 'membrane', 'gravillons', 'vegetale'] as const;

/** Le schema de la reponse, en sortie structuree : plat, sans union ni champ facultatif, des enumerations courtes. */
const SCHEMA: SchemaJson = {
  ...objet({
    toit: objet({
      couverture: terme(...COUVERTURES_TOIT_LU, 'indetermine'),
      pose: terme('droite', 'losange', 'ecaille', 'indetermine'),
      debord: terme('aucun', 'faible', 'fort', 'indetermine'),
      faitage: terme('tuiles', 'zinc', 'crete', 'indetermine'),
      gouttiere: terme('pendante', 'nantaise', 'aucune', 'indetermine'),
      confiance: ref('confiance'),
    }),
    elements: { type: 'array', items: objet({ element: terme('fenetre-toit', 'solaire'), u0: nombre, u1: nombre, v: nombre, confiance: ref('confiance') }) },
  }),
  $defs: { confiance: terme('forte', 'moyenne', 'faible', 'indetermine') },
};

/** Un EXEMPLE de reponse, pour une facade inventee : ce que le serveur montre quand la sortie structuree ne sert pas. */
const EXEMPLE = {
  toit: { couverture: 'ardoise', pose: 'droite', debord: 'faible', faitage: 'zinc', gouttiere: 'pendante', confiance: 'moyenne' },
  elements: [{ element: 'fenetre-toit', u0: 0.62, u1: 0.71, v: 1.35, confiance: 'moyenne' }],
};

/** Le toit lu sur une facade : son prompt, son schema et l'exemple du repli, tels que le serveur les sert (usage `facade-toit`). */
export const LECTURE_FACADE_TOIT: { prompt: string; schema: SchemaJson; exemple: object } = { prompt: PROMPT, schema: SCHEMA, exemple: EXEMPLE };
