// Le premier pas : ce qui s'affiche quand il n'y a aucun plan a ouvrir (spec-ihm-zones, Z0 bis).
//
// Il y a exactement deux facons de commencer, et Plan en choisissait une tout seul : il fabriquait
// le jeu de demonstration en silence. Quelqu'un qui arrivait avec une vraie parcelle en tete
// trouvait donc un plan qui n'etait pas le sien, sans qu'on lui ait rien demande, et devait
// comprendre seul qu'il fallait le remplacer.
//
// Les deux options ne sont pas symetriques et l'ecran le dit : partir d'une adresse est ce qu'on
// veut faire pour de bon, la demonstration est ce qu'on veut pour regarder. La premiere est donc
// l'action principale.
//
// Sans la capacite du cadastre, « Partir d'une adresse » disparait, comme sa commande
// (`projet.depuisAdresse`, effacee par la capacite : un outil de travail n'est pas une publicite) ; il
// l'offrait, puis ouvrait un plan vide sans un mot. La premiere option devient alors « Dessiner sans
// adresse » : le meme plan vide, que la personne dessine elle-meme.
//
// Ce que cette zone ne fait pas : creer quoi que ce soit. Elle rend un choix, et c'est
// `app/premierPas.ts` puis `io/api.ts` qui agissent — la meme separation que la porte.

import { vitrinePlateforme } from '../plateforme/config.js';

/** Ce que la personne peut repondre. */
export type Choix = 'adresse' | 'demo' | 'vierge';

/** Pourquoi, le cas echeant, elle ne peut repondre ni l'un ni l'autre. */
export type Empechement =
  | { raison: 'lecture' }
  | { raison: 'quota'; message: string };

export interface PropsPremierPas {
  /** `null` quand les deux options sont ouvertes. */
  empechement: Empechement | null;
  choisir: (c: Choix) => void;
  /** L'origine de la plateforme, pour les liens qui lui appartiennent. */
  plateforme: string;
  /** Vrai quand l'organisation a des projets, mais qu'aucun n'est un plan. */
  aDesProjetsEtrangers: boolean;
  /** Vrai quand la personne tient l'import du cadastre (la capacite de `projet.depuisAdresse`). */
  adresse: boolean;
}

export function PremierPas({ empechement, choisir, plateforme, aDesProjetsEtrangers, adresse }: PropsPremierPas) {
  if (empechement) {
    // Une impasse reelle, dite comme telle. La taire et afficher deux boutons qui echouent serait
    // pire : la personne s'y reprendrait a trois fois avant de soupconner que ce n'est pas elle.
    const texte = empechement.raison === 'lecture'
      ? "Votre place est une place de lecture : vous pouvez consulter des plans, pas en créer. Demandez à un administrateur de votre organisation de vous en partager un, ou de changer votre place."
      : empechement.message || "Votre organisation a atteint le nombre de plans que son abonnement prévoit. Un administrateur peut en supprimer un, ou passer à une offre qui en compte davantage : « Voir les offres ».";
    return (
      <div className="premierVoile">
        <div className="premierBoite">
          <h2 className="premierTitre">Aucun plan à ouvrir</h2>
          <p className="premierSous">{texte}</p>
          <p className="porteLiens porteLiensCompte">
            {/* La limite atteinte se leve en changeant d'offre : la vitrine de la plateforme les montre (lot 2). */}
            {empechement.raison === 'quota' && <a data-controle="premierPas.offres" href={vitrinePlateforme(plateforme)} target="_blank" rel="noopener">Voir les offres ↗</a>}
            <a href={plateforme} target="_blank" rel="noopener">Ouvrir la plateforme ↗</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="premierVoile">
      <div className="premierBoite">
        <h2 className="premierTitre">Par quoi commencer ?</h2>
        <p className="premierSous">
          {aDesProjetsEtrangers
            ? "Votre organisation a des projets, mais aucun n'est un plan. Il faut donc en créer un."
            : "Votre organisation n'a encore aucun plan."}
        </p>

        {adresse ? (
          <button type="button" data-controle="premierPas.adresse" className="premierChoix premierChoix--premier" onClick={() => { choisir('adresse'); }}>
            <span className="premierChoixTitre">Nouveau projet depuis une adresse</span>
            <span className="premierChoixTexte">
              La parcelle et les bâtiments viennent du cadastre. C'est la façon de commencer un vrai
              chantier : vous tapez une adresse, vous choisissez la parcelle, le plan est dessiné.
            </span>
          </button>
        ) : (
          <button type="button" data-controle="premierPas.vierge" className="premierChoix premierChoix--premier" onClick={() => { choisir('vierge'); }}>
            <span className="premierChoixTitre">Dessiner sans adresse</span>
            <span className="premierChoixTexte">
              Un plan vide, à l'échelle : vous tracez vous-même la parcelle, la maison et la terrasse
              avec les outils du plan. Vous l'enregistrez ensuite par Fichier › Enregistrer sous….
            </span>
          </button>
        )}

        <button type="button" data-controle="premierPas.demo" className="premierChoix" onClick={() => { choisir('demo'); }}>
          <span className="premierChoixTitre">Ouvrir le plan de démonstration</span>
          <span className="premierChoixTexte">
            Une parcelle complète avec sa terrasse, ses arbres et ses cotes. Pour voir ce que Plan
            sait faire sans rien avoir à saisir.
          </span>
        </button>
      </div>
    </div>
  );
}
