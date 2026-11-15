// Le relais des images Panoramax, vu de l'ecran d'import (demande du proprietaire, 15 novembre 2026 : toute instance federee marche
// d'office). Les photos d'un hote que la page ne lit pas en direct passent par le serveur du banc (api.php, route « relais »). Si le
// relais ne marche pas (serveur sans cURL, sortie fermee, hote en panne), ces photos ne se proposent pas et la carte dit pourquoi :
// c'est le seul cas ou « servies par un hote que le banc ne lit pas » se lit encore.

import { useEffect, useMemo, useState } from 'react';
import { api, ErreurApi, lireImage } from '../../api.js';
import { avisDuRelais, type PhotoRue } from '../../panoramax.js';

type Etat = { sonde: string | null; marche: boolean | null; raison: string };
const INCONNU: Etat = { sonde: null, marche: null, raison: '' };

export function useRelais(photos: readonly PhotoRue[]): { lisibles: readonly PhotoRue[]; avis: string | null } {
  const relayees = useMemo(() => photos.filter((p) => p.parRelais), [photos]);
  const sonde = relayees[0]?.id ?? null;
  const [etat, setEtat] = useState<Etat>(INCONNU);
  useEffect(() => {
    // Une fois que le relais a marche, on ne le sonde plus ; en panne, on le sonde de nouveau quand les photos changent.
    if (!sonde || etat.marche || etat.sonde === sonde) return;
    const arret = new AbortController();
    lireImage(api.relais(sonde, 'vignette'), { signal: arret.signal }).then(
      () => setEtat({ sonde, marche: true, raison: '' }),
      (e: Error) => {
        if (arret.signal.aborted) return;
        // « Photo introuvable » ne dit rien du relais : il a repondu, c'est cette photo qui manque.
        const marche = e instanceof ErreurApi && e.statut === 404;
        setEtat({ sonde, marche, raison: marche ? '' : e.message });
      },
    );
    return () => arret.abort();
  }, [sonde, etat.marche, etat.sonde]);
  const panne = etat.marche === false && relayees.length > 0;
  const lisibles = useMemo(() => (panne ? photos.filter((p) => !p.parRelais) : photos), [panne, photos]);
  return { lisibles, avis: panne ? avisDuRelais(relayees.length, etat.raison) : null };
}
