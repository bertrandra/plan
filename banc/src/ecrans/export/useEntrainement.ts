// Le controleur de « Entrainer sur mon Mac » (etape 6) : cree une cle d'entrainement pour l'export choisi, telecharge le script qui la
// porte, donne la commande a coller dans le Terminal, tient la liste des cles vivantes et les revoque. La cle en clair ne passe que
// par le script telecharge : la page ne la garde pas.

import { useCallback, useEffect, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { correspondanceParDefaut } from '../../brouillon.js';
import { nomsYolo } from '../../classes.js';
import { commandeDuScript, scriptValable } from '../../entrainement.js';
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

export function useEntrainement(banc: Banc, choix: { format: 'detect' | 'seg' | 'rfdetr' | 'natif'; variante: string; depart: 'coco' | 'zero'; verifiees: boolean }) {
  const [jetons, setJetons] = useState<JetonEntrainement[]>([]);
  const [heures, setHeures] = useState(72);
  const [attente, setAttente] = useState(false);
  /** Le script qui vient d'etre telecharge : son nom et la commande qui le lance, pour dire quoi en faire. Jamais son contenu. */
  const [script, setScript] = useState<{ fichier: string; commande: string } | null>(null);
  const [copiee, setCopiee] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const { dire } = banc;
  const relire = useCallback(async () => {
    try { const r = await api.jetons(); setJetons(r.jetons); setHeures(r.heures); setMaintenant(Date.now()); } catch (e) { dire((e as Error).message, 'erreur'); }
  }, [dire]);
  // La liste suit ce que fait le script (jeu lu, modele depose) : relue a l'ouverture et quand on revient sur la page.
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
      if (!scriptValable(r.script)) throw new Error('Le script rendu par le serveur est incomplet.');
      telecharger(r.fichier, r.script, 'text/x-shellscript');
      setScript({ fichier: r.fichier, commande: commandeDuScript(r.fichier) });
      setCopiee(false);
      await relire();
    } catch (e) {
      dire((e as Error).message, 'erreur');
    } finally {
      setAttente(false);
    }
  };
  const revoquer = async (id: string) => {
    try { await api.revoquerJeton(id); dire('Clé révoquée : le script qui la porte ne peut plus rien.'); } catch (e) { dire((e as Error).message, 'erreur'); }
    await relire();
  };
  /** Copie la commande ; sans presse-papiers (page non sure, refus), elle reste affichee, a selectionner a la main. */
  const copier = async () => {
    if (!script) return;
    try { await navigator.clipboard.writeText(script.commande); setCopiee(true); } catch { dire('La copie est refusée par le navigateur : sélectionnez la commande à la main.', 'erreur'); }
  };
  return { jetons, heures, attente, script, copiee, maintenant, entrainer, revoquer, copier, relire };
}
