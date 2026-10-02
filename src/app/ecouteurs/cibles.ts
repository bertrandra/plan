// Les commandes qui portent sur un objet ou sur une cote (app/commandes.ts, `parametre` et `Cible`).
//
// Elles etaient des controles d'interface de nature « objet » (app/controlesInterface.ts) : des
// boutons qui modifiaient le projet en appelant directement l'explorateur ou le tiroir. Trois
// defauts en decoulaient, que le registre corrige :
//   - les droits : une personne en lecture seule pouvait masquer un objet ou supprimer une cote ;
//     elles portent desormais la permission d'ecriture, grisees et expliquees sans elle ;
//   - l'annulation : masquer un objet ou changer ses etiquettes ne s'annulait pas ; l'explorateur
//     empile maintenant un instantane avant d'ecrire (les cotes le faisaient deja) ;
//   - la decouverte : ce sont des commandes du registre, avec leurs emplacements, comme les autres.
//
// La cible vient du bouton qui declenche : `commandes.executer(id, source, { objet: o.key })`.

import { PERMISSION_ECRITURE } from '../acces.js';
import { mesure } from '../../interaction/outilMesure.js';
import type { RegistreCommandes } from '../commandes.js';
import type { Explorateur, ChampVisibilite } from '../explorateur.js';
import type { Resultats } from '../resultats.js';
import type { EtatApp } from '../../core/state.js';

export interface ContexteCibles {
  etat: EtatApp;
  explorateur: Explorateur;
  resultats: Resultats;
}

/** Les etiquettes qu'un objet peut montrer : la valeur de la cible des commandes d'etiquettes. */
export const ETIQUETTES_OBJET: readonly Exclude<ChampVisibilite, 'hidden'>[] = ['showName', 'showSegNames', 'showVertNames', 'showDims', 'showAngles'];
const estEtiquette = (v: string | undefined): v is Exclude<ChampVisibilite, 'hidden'> => !!v && (ETIQUETTES_OBJET as readonly string[]).includes(v);

export function brancherCommandesCiblees(cmd: RegistreCommandes, ctx: ContexteCibles): void {
  const { etat, explorateur, resultats } = ctx;
  const objet = (cle: string | undefined) => etat.objects.find((o) => o.key === cle);
  const cote = (id: string | undefined) => etat.measures.find((m) => m.id === id);
  const permission = PERMISSION_ECRITURE;
  // Les objets que l'explorateur liste : le voisinage masque n'y figure pas, « tous » ne le compte pas.
  const listables = () => etat.objects.filter((o) => !(o.voisinage && !etat.voisinageVisible));

  // ---- Objets (explorateur) ----------------------------------------------------------------------
  cmd.declarer({
    id: 'objet.visibilite', libelle: 'Masquer ou afficher l’objet', groupe: 'objet', parametre: 'objet', permission,
    description: 'Cache l’objet sur le plan et en 3D, ou le montre à nouveau',
    executer: (_s, c) => { const o = objet(c?.objet); if (o) explorateur.definirVisibilite(o.key, 'hidden', !o.hidden); }
  });
  cmd.declarer({
    id: 'objet.etiquette', libelle: 'Étiquette de l’objet', groupe: 'objet', parametre: 'objet', permission,
    description: 'Montre ou cache une étiquette de l’objet (nom, côtés, coins, cotes, angles)',
    executer: (_s, c) => {
      const o = objet(c?.objet);
      if (o && estEtiquette(c?.valeur)) explorateur.definirVisibilite(o.key, c.valeur, !o[c.valeur]);
    }
  });
  cmd.declarer({
    id: 'objet.masquerTous', libelle: 'Masquer ou afficher tous les objets', groupe: 'objet', permission,
    actif: () => etat.objects.length > 0,
    executer: () => { const l = listables(); explorateur.definirVisibiliteTous('hidden', !(l.length > 0 && l.every((o) => o.hidden))); }
  });
  cmd.declarer({
    id: 'objet.etiquettesTous', libelle: 'Étiquettes de tous les objets', groupe: 'objet', permission,
    description: 'Montre ou cache une étiquette sur tous les objets à la fois',
    actif: () => etat.objects.length > 0,
    executer: (_s, c) => {
      if (!estEtiquette(c?.valeur)) return;
      const champ = c.valeur;
      const l = listables();
      explorateur.definirVisibiliteTous(champ, !(l.length > 0 && l.every((o) => o[champ])));
    }
  });

  // ---- Cotes (tiroir, onglet Cotes) --------------------------------------------------------------
  cmd.declarer({
    id: 'mesure.choisirReference', libelle: 'Choisir le segment de référence', groupe: 'mesure', permission,
    actif: () => !(mesure.pointage && mesure.pointage.mode === 'ref'),
    executer: () => { resultats.pointer('ref', false); }
  });
  cmd.declarer({
    id: 'mesure.origine', libelle: 'Origine de la cote (extrémité A ou B)', groupe: 'mesure', permission,
    executer: (_s, c) => { if (c?.valeur === 'A' || c?.valeur === 'B') resultats.choisirOrigine(c.valeur); }
  });
  cmd.declarer({
    id: 'mesure.selectionnerCoins', libelle: 'Sélectionner des coins', groupe: 'mesure', permission,
    description: 'Les coins à coter, sur le plan ; recliquer termine',
    actif: () => !!mesure.ref,
    executer: () => {
      // Pendant le pointage, le meme bouton termine.
      if (mesure.pointage && mesure.pointage.mode === 'target') { resultats.arreterPointage(); return; }
      mesure.cibles = [];
      resultats.pointer('target', true);
    }
  });
  cmd.declarer({
    id: 'mesure.ajouter', libelle: 'Ajouter les mesures', groupe: 'mesure', permission,
    actif: () => !!mesure.ref && mesure.cibles.length > 0,
    executer: () => { resultats.ajouterCotes(); }
  });
  cmd.declarer({
    id: 'mesure.inverserOrigine', libelle: 'Inverser l’origine de la cote', groupe: 'mesure', parametre: 'cote', permission,
    executer: (_s, c) => { const m = cote(c?.cote); if (m) resultats.modifierCote(m.id, (x) => { x.startEnd = x.startEnd === 'A' ? 'B' : 'A'; }); }
  });
  cmd.declarer({
    id: 'mesure.valeurAffichee', libelle: 'Valeur affichée de la cote (le long ou perpendiculaire)', groupe: 'mesure', parametre: 'cote', permission,
    executer: (_s, c) => {
      const m = cote(c?.cote);
      if (m) resultats.modifierCote(m.id, (x) => { x.displayMode = (x.displayMode || 'along') === 'along' ? 'perp' : 'along'; });
    }
  });
  cmd.declarer({
    id: 'mesure.afficher', libelle: 'Afficher la cote sur le plan', groupe: 'mesure', parametre: 'cote', permission,
    executer: (_s, c) => { const m = cote(c?.cote); if (m) resultats.modifierCote(m.id, (x) => { x.show = !x.show; }); }
  });
  cmd.declarer({
    id: 'mesure.supprimer', libelle: 'Supprimer la cote', groupe: 'mesure', parametre: 'cote', permission,
    executer: (_s, c) => { const m = cote(c?.cote); if (m) resultats.supprimerCote(m.id); }
  });
}
