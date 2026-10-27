// Le mode d'essai des faits des toits : `?regles=local` dans l'adresse (MD/spec-regles-toits.md §9.2).
//
// L'administrateur charge un fichier de faits depuis son poste (le meme format que
// regles/toits/faits.json) pour voir un fait sur un vrai projet avant d'ouvrir une PR. Rien n'est
// enregistre : les faits essayes vivent le temps de la page (regles/toits/faits.ts), et les batiments
// qu'ils touchent sont relus en tache de fond, marques lus pour la seance seulement
// (app/toits/toitsLidar.ts, MARQUE_ESSAI_FAITS) - a la prochaine ouverture, ils sont relus avec les faits
// du depot. L'entree du menu n'apparait qu'avec `?regles=local` : hors essai, elle n'encombre pas le menu.
//
// Seuls les faits s'essaient ainsi : les reglages sont lus une fois, au chargement des modules de la
// lecture des toits, et ne se changent pas sans recharger le code.

import { estAdministrateur } from '../acces.js';
import { showToast, showErrBanner } from '../../shell/dialogs.js';
import { lireFaitsToits, essayerFaitsToits, cleDuBatiment, cleToucheeParEssai, FaitsToitsIllisibles } from '../../regles/toits/faits.js';
import { toitAAjuster, type ObjetAToit } from '../toits/toitsLidar.js';
import type { RegistreCommandes } from '../commandes.js';
import { champsBatiment } from '../../model/champsFonction.js';
import { toucher } from '../../core/controleurObjets.js';

/** Un fichier de faits plus gros n'est pas un fichier de faits : on refuse avant de le lire. */
export const FAITS_LOCAUX_TAILLE_MAX = 2 * 1024 * 1024;

/** Le mode d'essai est-il demande dans l'adresse (`?regles=local`) ? */
export function reglesLocalesDemandees(recherche: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(recherche).get('regles') === 'local';
}

/** Ce qui sert a la commande : le plan, et la relance de la lecture des toits en tache de fond. */
export interface ContexteFaitsLocaux {
  objets: () => readonly ObjetAToit[];
  relireToits: () => void;
}

/**
 * Essaie les faits d'un texte JSON : les pose a la place de ceux du depot, et rend a relire les
 * batiments du plan qu'ils touchent (un fait de l'essai, ou un fait du depot que l'essai retire).
 * Rend la phrase a montrer. Leve FaitsToitsIllisibles (ou SyntaxError) sur un fichier refuse : les
 * faits en vigueur restent alors ceux d'avant.
 */
export function essayerFaitsLocaux(texte: string, objets: readonly ObjetAToit[]): { faits: number; relus: number; message: string } {
  const faits = lireFaitsToits(JSON.parse(texte));
  essayerFaitsToits(faits);
  let relus = 0;
  for (const o of objets) {
    if (!toitAAjuster(o) || !cleToucheeParEssai(cleDuBatiment(o))) continue;
    champsBatiment(o).toitLidarLu = null;
    toucher(o);
    relus++;
  }
  const n = Object.keys(faits).length;
  const message = `Faits d’essai chargés : ${n} fait(s), ${relus} bâtiment(s) du projet relu(s). Ils ne sont enregistrés nulle part : à la prochaine ouverture, ces toits seront relus avec les faits livrés.`;
  return { faits: n, relus, message };
}

/** Demande un fichier au poste ; `surTexte` recoit son contenu. Un input neuf a chaque fois : rechoisir le meme fichier relit. */
function choisirFichier(surTexte: (texte: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > FAITS_LOCAUX_TAILLE_MAX) { showErrBanner('Ce fichier est trop gros pour un fichier de faits (2 Mo au plus).'); return; }
    // FileReader plutot que Blob.text() : comme les imports de fichiers.ts, il marche partout.
    const lecteur = new FileReader();
    lecteur.onload = () => surTexte(String(lecteur.result ?? ''));
    lecteur.onerror = () => showErrBanner('Le fichier n’a pas pu être lu.');
    lecteur.readAsText(f);
  });
  input.click();
}

/** La commande est toujours au registre ; le menu Admin ne la montre qu'avec `?regles=local` (zones/BarreApplication.tsx). */
export function brancherFaitsLocaux(ctx: ContexteFaitsLocaux, cmd: RegistreCommandes): void {
  cmd.declarer({
    id: 'admin.faitsLocaux', libelle: 'Essayer des faits de toits…', groupe: 'admin', actif: () => estAdministrateur(),
    description: 'Charge un fichier de faits depuis votre poste, à la place de regles/toits/faits.json, le temps de la page : les toits concernés sont relus, rien n’est enregistré (administrateur seulement)',
    executer: () => choisirFichier((texte) => {
      try {
        const r = essayerFaitsLocaux(texte, ctx.objets());
        ctx.relireToits();
        showToast(r.message);
      } catch (e) {
        // Le message nomme le fichier du depot ; ici, c'est celui du poste : on garde la raison seule.
        const raison = e instanceof FaitsToitsIllisibles ? e.message.replace(/^regles\/toits\/faits\.json(, | : )/, '') : 'ce n’est pas un fichier JSON.';
        showErrBanner('Faits refusés : ' + raison);
      }
    }),
  });
}
