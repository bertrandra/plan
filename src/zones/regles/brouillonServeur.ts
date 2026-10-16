// Le brouillon des regles sur le serveur, vu de l'ecran Admin › Regles : lu a l'ouverture, enregistre,
// retire. Les phrases a montrer passent par `dire` ; un ecran demonte n'est plus touche.

import { useEffect, useRef, useState } from 'react';
import type { BrouillonServeur } from '../../io/analyseClaude.js';
import type { BrouillonReglesServeur, ClientRegles, EnvoiBrouillonRegles } from '../../io/reglesServeur.js';

export interface BrouillonServeurEcran {
  /** `undefined` tant qu'on ne l'a pas lu, `null` quand le serveur n'en a pas. */
  surServeur: BrouillonReglesServeur | null | undefined;
  occupe: boolean;
  enregistrer(envoi: EnvoiBrouillonRegles): void;
  retirer(): void;
}

export function useBrouillonServeur(serveur: ClientRegles | undefined, dire: (message: string) => void): BrouillonServeurEcran {
  const [surServeur, setSurServeur] = useState<BrouillonReglesServeur | null | undefined>(serveur ? undefined : null);
  const [occupe, setOccupe] = useState(false);
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);
  useEffect(() => {
    if (!serveur) return;
    serveur.lire().then((b) => { if (monte.current) setSurServeur(b); }, (e: Error) => { if (monte.current) { setSurServeur(null); dire('Le brouillon du serveur n’a pas pu être lu : ' + e.message); } });
  }, [serveur]);

  /** Une action du serveur : occupe le temps qu'elle dure, et ne dit rien si l'ecran est parti. */
  const agir = (action: Promise<void>, echec: string) => {
    setOccupe(true);
    action.catch((e: Error) => { if (monte.current) dire(echec + ' : ' + e.message); }).finally(() => { if (monte.current) setOccupe(false); });
  };
  return {
    surServeur, occupe,
    enregistrer(envoi) {
      if (!serveur) return;
      agir(serveur.enregistrer(envoi).then((b: BrouillonServeur) => {
        if (!monte.current) return;
        setSurServeur({ ...b, promptTexte: envoi.prompt, schemaTexte: envoi.schema, etat: envoi.etat });
        dire('Brouillon enregistré sur le serveur (prompt version ' + b.prompt + '). Essayez-le : ouvrez le plan avec ?regles=local, ou « Rejouer avec le brouillon » dans Admin › Audits.');
      }), 'Enregistrement impossible');
    },
    retirer() {
      if (!serveur) return;
      agir(serveur.retirer().then(() => { if (monte.current) { setSurServeur(null); dire('Brouillon retiré du serveur : les analyses repartent avec le prompt livré.'); } }), 'Retrait impossible');
    },
  };
}
