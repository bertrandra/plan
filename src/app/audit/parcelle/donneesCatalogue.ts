// Admin › « Audits » : les donnees d'analyse (lot L0, MD/spec-lecture-ia-elargie.md 4.8). L'export « données d'analyse » a travers
// tous les audits et les traces sans depot d'une periode (JSON tel que le serveur le rend, ou CSV pour un tableur francais), et le
// rejeu du run d'une facade depuis son image gardee, sur une trace ouverte : la requete repart octet pour octet, avec le prompt,
// le schema et le modele d'aujourd'hui. Le serveur relit et rejoue ; ici on choisit, on demande et on telecharge.

import { csvDonneesAnalyse, nomDonneesAnalyse } from '../../../export/donneesAnalyse.js';
import type { ClientDonneesAnalyse } from '../../../io/donneesAnalyse.js';

/** Les choix de l'export : la periode (`AAAA-MM-JJ`), l'usage et le modele (vides : tous). */
interface ChoixExportDonnees { du: string; au: string; usage: string; modele: string }

export interface EtatDonnees {
  exportDonnees: ChoixExportDonnees;
  /** L'export ou le rejeu en cours : un seul a la fois. */
  donneesEnCours: 'export' | 'rejeu' | null;
}

export interface DependancesDonnees {
  /** Le client des donnees d'analyse ; null sans session admin. */
  donnees?: () => ClientDonneesAnalyse | null;
  telecharger: (nom: string, texte: string, type?: string) => void;
  signaler: (message: string) => void;
}

export interface MethodesDonnees {
  /** L'export est-il propose (session admin) ? */
  exportDisponible(): boolean;
  choisirExport(x: Partial<ChoixExportDonnees>): void;
  /** Pourquoi l'export ne part pas ; null s'il part. */
  raisonExporter(): string | null;
  exporterDonnees(format: 'json' | 'csv'): Promise<void>;
  /** Rejoue le run d'une facade depuis son image gardee (`requete` d'une trace de l'audit), en trois passes votees. */
  rejouerFacade(audit: string, trace: string, requete: string): Promise<void>;
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Les usages que l'export sait filtrer, tels que le journal et les traces les comptent (deploy/analyse-fonctions.php, USAGES) : le
 * rejeu d'une facade se compte en `rejeu`, l'escalade d'une facade en `escalade`.
 */
export const USAGES_EXPORT: Record<string, string> = {
  analyse: 'Analyse des maisons', facade: 'Run des façades', escalade: 'Escalade', rejeu: 'Rejeu', immediat: 'Immédiat', candidats: 'Cas candidats',
};
const message = (e: unknown) => (e as Error).message || String(e);

/** Les choix de depart : les trente derniers jours, tous les usages, tous les modeles (comme le tableau de bord). */
export function choixExportParDefaut(aujourdhui: Date): ChoixExportDonnees {
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  return { du: jour(new Date(aujourdhui.getTime() - 29 * 86400000)), au: jour(aujourdhui), usage: '', modele: '' };
}

export function donneesDuCatalogue(d: DependancesDonnees, etat: () => EtatDonnees, poser: (x: Partial<EtatDonnees>) => void, apresRejeu: (audit: string) => Promise<void>): MethodesDonnees {
  const m: MethodesDonnees = {
    exportDisponible: () => !!d.donnees?.(),
    choisirExport(x) { poser({ exportDonnees: { ...etat().exportDonnees, ...x } }); },
    raisonExporter() {
      const c = etat().exportDonnees;
      if (!m.exportDisponible()) return 'La session admin a expiré : rechargez la page pour retaper le mot de passe.';
      if (!JOUR.test(c.du) || !JOUR.test(c.au) || c.du > c.au) return 'Choisissez une période : le premier jour avant le dernier.';
      return null;
    },
    async exporterDonnees(format) {
      const raison = m.raisonExporter(), client = d.donnees?.();
      if (raison || !client) { d.signaler(raison ?? 'Export indisponible.'); return; }
      const c = etat().exportDonnees;
      poser({ donneesEnCours: 'export' });
      try {
        const x = await client.exporter({ du: c.du, au: c.au, usage: c.usage || null, modele: c.modele || null });
        if (format === 'json') d.telecharger(nomDonneesAnalyse(x, 'json'), JSON.stringify(x, null, 2) + '\n');
        else d.telecharger(nomDonneesAnalyse(x, 'csv'), csvDonneesAnalyse(x), 'text/csv;charset=utf-8');
        d.signaler('Données d’analyse exportées : ' + x.requetes.length + ' requête' + (x.requetes.length > 1 ? 's' : '') + ', ' + x.propositions.length + ' proposition' + (x.propositions.length > 1 ? 's' : '') + '.');
      } catch (e) {
        d.signaler('L’export n’a pas pu se faire : ' + message(e));
      } finally {
        poser({ donneesEnCours: null });
      }
    },
    async rejouerFacade(audit, trace, requete) {
      const client = d.donnees?.();
      if (!client) { d.signaler('La session admin a expiré : rechargez la page pour retaper le mot de passe.'); return; }
      poser({ donneesEnCours: 'rejeu' });
      try {
        const r = await client.rejouerFacade({ audit, trace, requete, passes: 3 });
        const cout = r.resultats.reduce((s, x) => s + (typeof x.cout === 'number' ? x.cout : 0), 0);
        d.signaler('Façade rejouée depuis son image gardée (' + r.modele + ', prompt ' + r.prompt + ', ' + cout.toFixed(4).replace('.', ',') + ' $) : la nouvelle analyse est dans la liste.');
      } catch (e) {
        d.signaler('Le rejeu de la façade n’est pas parti : ' + message(e));
        return;
      } finally {
        poser({ donneesEnCours: null });
      }
      await apresRejeu(audit);
    },
  };
  return m;
}
