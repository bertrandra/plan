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
// Ce que cette zone ne fait pas : creer quoi que ce soit. Elle rend un choix, et c'est
// `app/premierPas.ts` puis `io/api.ts` qui agissent — la meme separation que la porte.

/** Ce que la personne peut repondre. */
export type Choix = 'adresse' | 'demo';

/** Pourquoi, le cas echeant, elle ne peut repondre ni l'un ni l'autre. */
export type Empechement =
  | { raison: 'lecture' }
  | { raison: 'quota' };

export interface PropsPremierPas {
  /** `null` quand les deux options sont ouvertes. */
  empechement: Empechement | null;
  choisir: (c: Choix) => void;
  /** L'origine de la plateforme, pour les liens qui lui appartiennent. */
  plateforme: string;
  /** Vrai quand l'organisation a des projets, mais qu'aucun n'est un plan. */
  aDesProjetsEtrangers: boolean;
}

export function PremierPas({ empechement, choisir, plateforme, aDesProjetsEtrangers }: PropsPremierPas) {
  if (empechement) {
    // Une impasse reelle, dite comme telle. La taire et afficher deux boutons qui echouent serait
    // pire : la personne s'y reprendrait a trois fois avant de soupconner que ce n'est pas elle.
    const texte = empechement.raison === 'lecture'
      ? "Votre place est une place de lecture : vous pouvez consulter des plans, pas en creer. Demandez a un administrateur de votre organisation de vous en partager un, ou de changer votre place."
      : "Votre organisation a atteint le nombre de plans que son abonnement prevoit. Un administrateur peut en supprimer un, ou changer d'offre.";
    return (
      <div className="premierVoile">
        <div className="premierBoite">
          <h2 className="premierTitre">Aucun plan a ouvrir</h2>
          <p className="premierSous">{texte}</p>
          <p className="porteLiens">
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
            ? "Votre organisation a des projets, mais aucun n'est un plan. Il faut donc en creer un."
            : "Votre organisation n'a encore aucun plan."}
        </p>

        <button type="button" className="premierChoix premierChoix--premier" onClick={() => { choisir('adresse'); }}>
          <span className="premierChoixTitre">Partir d'une adresse</span>
          <span className="premierChoixTexte">
            La parcelle et les batiments viennent du cadastre. C'est la facon de commencer un vrai
            chantier : on tape une adresse, on choisit la parcelle, le plan est dessine.
          </span>
        </button>

        <button type="button" className="premierChoix" onClick={() => { choisir('demo'); }}>
          <span className="premierChoixTitre">Ouvrir le plan de demonstration</span>
          <span className="premierChoixTexte">
            Une parcelle complete avec sa terrasse, ses arbres et ses cotes. Pour voir ce que Plan
            sait faire sans rien avoir a saisir.
          </span>
        </button>
      </div>
    </div>
  );
}
