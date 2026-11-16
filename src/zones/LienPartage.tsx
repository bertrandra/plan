// L'ecran d'un lien de partage qui ne s'ouvre pas (lot 6, app/projetPartage.ts) : a la place de l'atelier, qui ne demarre pas.
//
// La plateforme repond `404 SHARE_NOT_FOUND` a tout refus, sans dire lequel (expire, retire, mal copie) : l'ecran ne le devine pas
// non plus. Il dit quoi faire, et a qui le demander. Le meme cadre que la porte (zones/Porte.tsx), sans formulaire : la personne
// qui lit n'a pas de compte.

import type { RaisonLecturePartage } from '../plateforme/lecturePartage.js';

export type RefusLien =
  | { raison: RaisonLecturePartage }
  /** Un schema plus recent que ce que ce programme sait lire. */
  | { raison: 'recent'; schema: number }
  /** Le document n'est pas un plan (un projet d'un autre produit). */
  | { raison: 'pasUnPlan' };

const TEXTES: Record<RefusLien['raison'], { titre: string; texte: string; reessai: boolean }> = {
  introuvable: {
    titre: 'Ce lien n’est plus valide',
    texte: 'Ce lien n’est plus valide (expiré, retiré ou mal copié). Demandez un nouveau lien à la personne qui vous l’a envoyé.',
    reessai: false
  },
  tropDeTentatives: { titre: 'Trop de tentatives', texte: 'Trop de tentatives, réessayez dans une minute.', reessai: true },
  reseau: {
    titre: 'La plateforme ne répond pas',
    texte: 'Le projet n’a pas pu être lu : la plateforme ne répond pas. Vérifiez votre connexion, puis réessayez.',
    reessai: true
  },
  panne: {
    titre: 'La plateforme a répondu par une erreur',
    texte: 'Le projet n’a pas pu être lu. Réessayez dans un moment ; si cela dure, prévenez la personne qui vous a envoyé le lien.',
    reessai: true
  },
  recent: {
    titre: 'Ce projet vient d’une version plus récente de Plan',
    texte: 'Ce projet a été enregistré par une version plus récente de Plan que celle-ci. Rechargez la page (Ctrl+Maj+R) ; si le message reste, prévenez la personne qui vous a envoyé le lien.',
    reessai: false
  },
  pasUnPlan: {
    titre: 'Ce lien ne mène pas à un plan',
    texte: 'Le projet partagé n’est pas un plan de Plan. Demandez à la personne qui vous l’a envoyé de vérifier le lien.',
    reessai: false
  }
};

export function LienPartage({ refus, reessayer }: { refus: RefusLien; reessayer: () => void }) {
  const t = TEXTES[refus.raison];
  return (
    <div className="porteVoile">
      <div className="porteBoite" role="alert" data-refus={refus.raison}>
        <h2 className="porteTitre">{t.titre}</h2>
        <p className="porteSous">{t.texte}</p>
        {refus.raison === 'recent' && <p className="porteRef">schéma {refus.schema}</p>}
        {t.reessai && <button type="button" className="porteBouton" data-controle="lienPartage.reessayer" onClick={reessayer}>Réessayer</button>}
      </div>
    </div>
  );
}
