// Le controleur du marquage d'une photo : les objets, leur historique (annuler, refaire), ce qui n'est pas enregistre, et l'enregistrement
// (avec, au besoin, la photo marquee « verifiee »). Les vues n'ecrivent jamais les objets elles-memes : elles passent par lui.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { Historique } from '../../edition.js';
import { rangerLesParents } from '../../geometrie.js';
import type { Objet } from '../../types.js';

export function useMarquage(banc: Banc, id: string) {
  const [objets, setObjets] = useState<Objet[] | null>(null);
  const [modifie, setModifie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const hist = useRef(new Historique<Objet[]>());
  // Le marquage se relit quand on change de photo, et seulement alors : cocher « Verifiee » ou changer le bloc ne le recharge pas.
  const dire = useRef(banc.dire);
  dire.current = banc.dire;
  useEffect(() => {
    setObjets(null); setModifie(false); hist.current.vider();
    api.annotation(id).then((a) => setObjets(a.objets)).catch((e: Error) => dire.current(e.message, 'erreur'));
  }, [id]);

  /** Un geste fini : l'etat d'avant va dans l'historique. */
  const changer = useCallback((f: (l: Objet[]) => Objet[]) => {
    setObjets((l) => { if (!l) return l; hist.current.noter(l); return f(l); });
    setModifie(true);
  }, []);
  /** Un geste en cours (un objet qui suit la souris) : l'etat d'avant a ete note au debut du geste. */
  const suivre = useCallback((os: Objet[]) => {
    const m = new Map(os.map((o) => [o.id, o]));
    setObjets((l) => l?.map((x) => m.get(x.id) ?? x) ?? l);
    setModifie(true);
  }, []);
  const debutGeste = () => { if (objets) hist.current.noter(objets); };
  const annuler = () => { setObjets((l) => (l ? hist.current.annuler(l) ?? l : l)); setModifie(true); };
  const refaire = () => { setObjets((l) => (l ? hist.current.refaire(l) ?? l : l)); setModifie(true); };

  /** Enregistre le marquage (la photo devient « corrigee ») ; `verifiee` : la marque aussi verifiee. Vrai si tout est passe. */
  const enregistrer = async (options: { verifiee?: boolean; silencieux?: boolean } = {}): Promise<boolean> => {
    if (!objets) return false;
    setEnvoi(true);
    try {
      const ranges = rangerLesParents(objets, banc.classes);
      let m = await api.ecrireAnnotation(id, { objets: ranges, par: 'main' });
      if (options.verifiee && !m.verifiee) m = await api.modifier(id, { verifiee: true });
      banc.remplacer(m);
      setObjets(ranges); setModifie(false);
      if (!options.silencieux) banc.dire(options.verifiee ? 'Marquage enregistré, photo vérifiée.' : 'Marquage enregistré.');
      return true;
    } catch (e) { banc.dire((e as Error).message, 'erreur'); return false; } finally { setEnvoi(false); }
  };
  // Lus a chaque rendu (l'historique change avec les objets, qui rendent la page) : les boutons annuler et refaire s'eteignent au bout.
  return { objets, modifie, envoi, changer, suivre, debutGeste, annuler, refaire, enregistrer, peutAnnuler: hist.current.peutAnnuler, peutRefaire: hist.current.peutRefaire };
}

export type Marquage = ReturnType<typeof useMarquage>;
