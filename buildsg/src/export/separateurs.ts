// Separateur des tableaux de noms encodes dans les attributs `data-*` d'un SVG exporte.
//
// U+241F est le glyphe « symbole pour separateur d'unite ». Il ne peut pas apparaitre dans un nom
// saisi par un utilisateur, ce qui evite qu'un nom contenant une virgule ou un point-virgule coupe
// le tableau en deux a la reimportation.
//
// Il vit dans son propre module parce que l'export l'ecrit et que l'import le relit : c'est un
// contrat entre deux morceaux du programme, pas un detail de l'un d'eux.
// Ecrit sous forme d'echappement et non du caractere lui-meme : il est invisible dans un editeur,
// et un enregistrement dans un autre encodage le remplacerait silencieusement.
export const NAME_SEP = '\u241F';
