// La lecture du reglement d'une zone du PLU par Claude (usage `plu` du serveur, lot L4) : le prompt, le schema ferme de la reponse et
// l'exemple du repli. Donnees pures, comme les descriptions des sujets de l'audit : `npm run regles:generer` en ecrit
// deploy/prompt-plu.md et deploy/schema-plu.json (regles/sujets/generation.ts), jamais a la main. Chaque champ a un lecteur
// (regles/plu/observations.ts) : un champ qu'aucun lecteur n'utilise n'entre pas au schema.

import type { SchemaJson } from '../sujets/description.js';
import { LISTE_GRANDEURS_PLU, MATERIAUX_TOIT_PLU, UNITES_PLU } from './faits.js';

/** Le corps du prompt (sans en-tete) : ce que Claude lit, en system, avant la forme de la reponse. */
const PROMPT = `# Rôle

Vous aidez le logiciel Plan à lire **le règlement écrit d'un plan local d'urbanisme** (PLU, PLUi, POS, PSMV) pour une parcelle. Plan connaît la zone de la parcelle par le Géoportail de l'urbanisme ; il vous envoie les pages du règlement à partir du chapitre de cette zone. Vous relevez ce que le texte impose à un projet de construction (une maison, une extension, une annexe, une pergola, une piscine, une clôture). Vous ne jugez pas le projet : Plan compare lui-même, et **une personne vérifie chacune de vos lignes dans le document avant de s'en servir**. Une ligne fausse coûte plus cher qu'une ligne absente : ce que le texte ne dit pas clairement n'entre pas dans la réponse.

# Ce que vous recevez

- **Un document PDF** : un extrait du règlement, à partir de la première page du chapitre de la zone (ou du début du document quand le Géoportail ne donne pas la page). L'extrait peut contenir la fin d'un chapitre précédent ou le début du suivant : ne lisez que le chapitre de la zone demandée.
- **Un texte** : la commune, le document d'urbanisme, la zone demandée (son libellé au Géoportail, parfois un secteur : « ULp » est le secteur « p » de la zone « UL ») et le numéro, dans le document entier, de la première page de l'extrait.

# Comment remplir la réponse

- \`zone.libelle\` : la zone (ou le secteur) dont vous avez lu le chapitre, telle que le titre du chapitre l'écrit. \`zone.trouvee\` : \`oui\` si l'extrait contient ce chapitre, \`non\` sinon (la réponse n'a alors aucune règle), \`indetermine\` si vous n'êtes pas sûr que ce soit la bonne zone.
- \`regles\` : une entrée par règle chiffrée ou précise du chapitre, pour la zone demandée (et son secteur quand le texte en distingue un). Pour chaque entrée :
  - \`grandeur\` : ce que la règle fixe, dans ce vocabulaire —
    - \`hauteur-egout-max\` (hauteur maximale à l'égout du toit, ou à l'acrotère d'un toit plat), \`hauteur-faitage-max\` (au faîtage), \`hauteur-absolue-max\` (hauteur maximale sans autre précision, « hauteur totale », « hauteur plafond ») ; \`hauteur-annexe-max\` (la hauteur maximale des annexes, abris, garages, pergolas, constructions secondaires) ;
    - \`recul-voie-min\` (le recul minimal des constructions depuis l'alignement des voies ou emprises publiques), \`recul-limites-min\` (depuis les limites séparatives : latérales ou de fond) ;
    - \`emprise-max\` (l'emprise au sol maximale, en pourcentage de la superficie du terrain) ; \`espaces-verts-min\` (la part minimale d'espaces verts, de pleine terre ou de surface non imperméabilisée, en pourcentage du terrain) ;
    - \`stationnement\` (le nombre de places exigé : la valeur est le nombre de places par logement quand le texte le dit) ;
    - \`pente-toit-min\` et \`pente-toit-max\` (en degrés ; un pourcentage de pente se convertit : 100 % = 45°) ; \`materiaux-toit\` (les couvertures admises, dans \`termes\`) ;
    - \`couleurs\` (couleurs ou matériaux imposés ou interdits pour les façades, les menuiseries, les toitures : la règle est dans la citation) ;
    - \`cloture-voie-hauteur-max\` et \`cloture-limites-hauteur-max\` (la hauteur maximale d'une clôture sur voie, en limite séparative) ; \`clotures-haies\` (ce que le texte impose aux clôtures et aux haies sans hauteur : matériaux, essences, ajours) ;
    - \`annexes\` (une règle propre aux annexes qui n'est pas une hauteur : surface, implantation, nombre).
  - \`valeur\` : le nombre que la règle fixe, dans l'unité de \`unite\` (mètres, pour cent, degrés, places) ; \`indetermine\` quand la règle n'est pas un nombre (couleurs, matériaux, clôtures, annexes) ou qu'elle dépend d'un calcul que vous ne pouvez pas faire (« la hauteur ne peut excéder la distance à l'alignement »). Pas de fourchette : une règle « entre 35° et 45° » donne deux entrées, \`pente-toit-min\` et \`pente-toit-max\`.
  - \`unite\` : \`m\`, \`pourcent\`, \`degres\`, \`places\`, ou \`aucune\`.
  - \`termes\` : pour \`materiaux-toit\` seulement, les couvertures admises (\`tuile\` quand le texte dit « tuile » sans autre précision, \`tuile-plate\`, \`tuile-canal\`, \`tuile-mecanique\`, \`ardoise\`, \`zinc\`, \`bac-acier\`, \`membrane\`, \`vegetale\`, \`verre\`, \`autre\`) ; une liste vide pour toute autre grandeur.
  - \`condition\` : à quoi la règle s'applique, quand le texte le précise (« constructions principales », « annexes de moins de 20 m² », « en limite séparative », « dans la bande de 20 m depuis la voie », « secteur ULp ») ; une chaîne vide sinon. Une règle qui change selon le cas donne une entrée par cas, chacune avec sa condition.
  - \`article\` : la référence de l'article et, s'il y en a un, du paragraphe (« UL 10 », « UL 7.2 », « Article 9 ») — jamais vide.
  - \`citation\` : **la phrase du règlement, recopiée mot pour mot**, qui fixe la règle (une à trois phrases, sans les reformuler ni les résumer ; des points de suspension entre crochets « […] » pour sauter un passage). Sans citation exacte, pas d'entrée : la personne compare cette citation au document.
  - \`page\` : le numéro de la page **du document entier** où se trouve la citation (la première page de l'extrait porte le numéro donné dans le texte ; comptez à partir d'elle), ou \`indetermine\`.
  - \`confiance\` : \`forte\` si le texte est sans ambiguïté, \`moyenne\` s'il demande une interprétation (un renvoi, une exception), \`faible\` si vous doutez.
- \`remarques\` : en une à trois phrases, ce que la personne doit savoir et qui n'entre pas dans les règles : un renvoi aux dispositions générales ou au lexique (que l'extrait ne contient pas), un chapitre coupé par la fin de l'extrait, une règle graphique (« voir le plan de zonage »). Une chaîne vide sinon.

# Règles de prudence

- Une règle des dispositions générales, d'une autre zone ou d'un autre secteur n'entre pas dans la réponse, même si elle est dans l'extrait.
- Un nombre se recopie tel que le texte le donne, converti seulement d'unité (« 7,50 m » donne 7.5 ; « 40 % » donne 40) ; il ne s'arrondit pas, il ne se calcule pas.
- Ne confondez pas l'emprise au sol (la projection verticale des constructions) avec la surface de plancher ou le coefficient d'occupation du sol : seule l'emprise au sol entre dans \`emprise-max\`.
- Une règle qui n'existe pas dans le chapitre (« non réglementé », « sans objet ») n'entre pas dans la réponse.
- Les numéros de page imprimés au pied des pages peuvent différer de ceux du document : comptez les pages de l'extrait.
`;

const objet = (proprietes: Record<string, unknown>): SchemaJson => ({ type: 'object', additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });
const terme = (...termes: readonly string[]): SchemaJson => ({ type: 'string', enum: [...termes] });
const texte = { type: 'string' } as const;

/** Le schema de la reponse : chaque champ a son lecteur (regles/plu/observations.ts). */
const SCHEMA: SchemaJson = {
  ...objet({
    zone: objet({ libelle: texte, trouvee: terme('oui', 'non', 'indetermine') }),
    regles: {
      type: 'array',
      items: objet({
        grandeur: terme(...LISTE_GRANDEURS_PLU),
        valeur: { anyOf: [{ type: 'number' }, terme('indetermine')] },
        unite: terme(...UNITES_PLU),
        termes: { type: 'array', items: terme(...MATERIAUX_TOIT_PLU) },
        condition: texte,
        article: texte,
        citation: texte,
        page: { anyOf: [{ type: 'integer' }, terme('indetermine')] },
        confiance: terme('faible', 'moyenne', 'forte'),
      }),
    },
    remarques: texte,
  }),
};

/**
 * Un EXEMPLE de reponse, pour une zone inventee (« UZ » d'une commune inventee) : ce que le serveur montre a Claude a la place du
 * schema quand la sortie structuree ne sert pas (son repli, comme pour le run d'une facade). Ses valeurs ne disent rien d'un vrai
 * reglement ; tests/unit/regles/plu/lecture.test.ts verifie qu'il a la forme du schema.
 */
const EXEMPLE = {
  zone: { libelle: 'UZ', trouvee: 'oui' },
  regles: [
    { grandeur: 'hauteur-egout-max', valeur: 6, unite: 'm', termes: [], condition: '', article: 'UZ 10.1',
      citation: 'La hauteur des constructions ne peut excéder 6 mètres à l’égout du toit.', page: 41, confiance: 'forte' },
    { grandeur: 'recul-limites-min', valeur: 3, unite: 'm', termes: [], condition: 'en cas de retrait des limites séparatives', article: 'UZ 7.2',
      citation: 'En cas de retrait, la distance comptée horizontalement de tout point de la construction à la limite séparative doit être au moins égale à 3 mètres.', page: 39, confiance: 'forte' },
    { grandeur: 'materiaux-toit', valeur: 'indetermine', unite: 'aucune', termes: ['tuile-plate', 'ardoise'], condition: 'constructions principales', article: 'UZ 11.3',
      citation: 'Les toitures des constructions principales seront couvertes de tuiles plates ou d’ardoises.', page: 43, confiance: 'moyenne' },
  ],
  remarques: 'Le chapitre renvoie au lexique des dispositions générales pour la définition de la hauteur, que l’extrait ne contient pas.',
};

/** La lecture du reglement : son prompt, son schema et l'exemple du repli, tels que le serveur les sert (usage `plu`). */
export const LECTURE_PLU: { prompt: string; schema: SchemaJson; exemple: object } = { prompt: PROMPT, schema: SCHEMA, exemple: EXEMPLE };

/** La consigne du repli (sans sortie structuree), propre a cet usage : celle du run d'une facade parle de parts et d'une facade. */
export const CONSIGNE_EXEMPLE_PLU = 'Répondez par un seul objet JSON, sans texte avant ni après et sans bloc de code, avec exactement les clés de l’exemple ci-dessous, dans le même ordre. C’est un EXEMPLE, pour une zone inventée : ses valeurs ne sont pas à recopier, la réponse dit ce que le règlement envoyé impose, et la liste `regles` a autant d’entrées que le chapitre de la zone en contient (aucune s’il n’y en a pas). Chaque citation est recopiée mot pour mot du document.';
