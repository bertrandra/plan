// Le controleur de « Entrainer dans Colab » (etape 6) : cree une cle d'entrainement pour l'export choisi, telecharge le carnet qui la
// porte, tient la liste des cles vivantes et les revoque. La cle en clair ne passe que par le carnet telecharge : la page ne la garde pas.

import { useCallback, useEffect, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { correspondanceParDefaut } from '../../brouillon.js';
import { nomsYolo } from '../../classes.js';
import { carnetValable } from '../../colab.js';
import type { JetonEntrainement } from '../../types.js';

/** Propose un texte au telechargement, sous un nom. */
function telecharger(nom: string, contenu: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Le navigateur a pris le fichier : l'adresse ne sert plus.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function useColab(banc: Banc, choix: { format: 'detect' | 'seg' | 'rfdetr' | 'natif'; variante: string; depart: 'coco' | 'zero'; verifiees: boolean }) {
  const [jetons, setJetons] = useState<JetonEntrainement[]>([]);
  const [heures, setHeures] = useState(24);
  const [attente, setAttente] = useState(false);
  /** Le carnet qui vient d'etre telecharge : son nom, pour dire quoi en faire. */
  const [carnet, setCarnet] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const { dire } = banc;
  const relire = useCallback(async () => {
    try { const r = await api.jetons(); setJetons(r.jetons); setHeures(r.heures); setMaintenant(Date.now()); } catch (e) { dire((e as Error).message, 'erreur'); }
  }, [dire]);
  // La liste suit ce que fait le carnet (jeu lu, modele depose) : relue a l'ouverture et quand on revient sur la page.
  useEffect(() => {
    void relire();
    const revenir = () => { if (document.visibilityState === 'visible') void relire(); };
    addEventListener('focus', revenir);
    document.addEventListener('visibilitychange', revenir);
    return () => { removeEventListener('focus', revenir); document.removeEventListener('visibilitychange', revenir); };
  }, [relire]);

  const entrainer = async () => {
    if (choix.format === 'natif' || attente) return;
    setAttente(true);
    try {
      const r = await api.creerJeton({ format: choix.format, base: choix.variante, depart: choix.depart, verifiees: choix.verifiees, correspondance: correspondanceParDefaut(nomsYolo(banc.classes), banc.classes) });
      if (!carnetValable(r.carnet)) throw new Error('Le carnet rendu par le serveur est illisible.');
      telecharger(r.fichier, r.carnet, 'application/x-ipynb+json');
      setCarnet(r.fichier);
      await relire();
    } catch (e) {
      dire((e as Error).message, 'erreur');
    } finally {
      setAttente(false);
    }
  };
  const revoquer = async (id: string) => {
    try { await api.revoquerJeton(id); dire('Clé révoquée : le carnet qui la porte ne peut plus rien.'); } catch (e) { dire((e as Error).message, 'erreur'); }
    await relire();
  };
  return { jetons, heures, attente, carnet, maintenant, entrainer, revoquer, relire };
}
