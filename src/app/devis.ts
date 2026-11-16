// Le devis (menu Exporter) : les reglages de la personne qui l'etablit, et le dialogue qui l'ouvre (app/).
//
// L'emetteur, le taux de TVA et le numero ne sont pas des donnees du projet : un artisan les donne une
// fois et les retrouve sur chaque devis. Ils restent donc dans ce navigateur (`localStorage`), comme la
// hauteur du tiroir, et ne changent rien au fichier du projet : pas de champ nouveau, pas d'evenement de
// version. Le numero, lui, vaut pour le devis en cours : il ne survit pas a la page, et vide, le projet en
// donne un (son nom et le jour). Ce que la plateforme sait de la personne (`/me/context` : son nom, son
// organisation, son adresse electronique) se propose tant que rien n'est saisi ; elle ne donne ni adresse
// postale ni telephone, que la personne ecrit elle-meme.

import { contexteCourant } from './acces.js';
import { parcours, type ServiceChampsParcours } from './parcours.js';
import { clesDossier } from './dossier.js';
import { numeroDevis, type EmetteurDevis } from '../export/devisPdf.js';
import { estTerrasse } from '../model/fonctions.js';
import { tauxSaisi, type PreferencesDevis, type ReglagesDevis } from '../ui/champs/devis.js';
import type { RegistreCommandes } from './commandes.js';
import type { ObjetPlan } from '../model/types.js';

const CLE_LOCALE = 'plan.devis';

function lireStockage(): { emetteur: EmetteurDevis; tauxTva: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_LOCALE) || '{}') as { emetteur?: unknown; tauxTva?: unknown };
    const e = v.emetteur && typeof v.emetteur === 'object' ? v.emetteur as Record<string, unknown> : {};
    const emetteur: EmetteurDevis = {};
    for (const cle of ['nom', 'adresse', 'telephone', 'email', 'mentions'] as const) if (typeof e[cle] === 'string' && e[cle]) emetteur[cle] = e[cle] as string;
    return { emetteur, tauxTva: typeof v.tauxTva === 'string' ? v.tauxTva : '' };
  } catch { return { emetteur: {}, tauxTva: '' }; }
}

/** Les reglages du devis de ce navigateur. `nomProjet` : ce que le numero propose lit. */
export function creerPreferencesDevis(nomProjet: () => string | null | undefined, maintenant: () => Date = () => new Date()): PreferencesDevis {
  let numero = '';
  return {
    lire: (): ReglagesDevis => ({ ...lireStockage(), numero }),
    ecrire(r) {
      if (r.numero !== undefined) numero = r.numero;
      if (r.emetteur === undefined && r.tauxTva === undefined) return;
      const s = lireStockage();
      const emetteur: EmetteurDevis = { ...s.emetteur };
      for (const [cle, v] of Object.entries(r.emetteur ?? {}) as [keyof EmetteurDevis, string | undefined][]) {
        if (v && v.trim()) emetteur[cle] = v.trim(); else delete emetteur[cle];
      }
      try { localStorage.setItem(CLE_LOCALE, JSON.stringify({ emetteur, tauxTva: r.tauxTva ?? s.tauxTva })); }
      catch { /* stockage indisponible : le reglage vaut pour ce devis seulement */ }
    },
    defautsEmetteur() {
      // L'identite et non `courant()` : un contexte que la plateforme ne laisse pas garder (`token_expires_at`
      // nul) n'est pas en cache, et le devis partait sans nom alors que la porte l'avait lu.
      const c = contexteCourant()?.identite();
      if (!c) return {};
      const nom = c.tenant.name || c.user.display_name || '';
      return { ...(nom ? { nom } : {}), ...(c.user.email ? { email: c.user.email } : {}) };
    },
    numeroPropose: () => numeroDevis(nomProjet(), maintenant())
  };
}

/** Le nom du projet ouvert, que pose le branchement des exports (app/assemblage/exports.ts). */
let nomDuProjet: () => string | null | undefined = () => null;
export function poserNomProjetDevis(f: () => string | null | undefined): void { nomDuProjet = f; }

/** Les reglages du devis de cette page : le dialogue les ecrit, l'export les lit. */
export const preferencesDevis: PreferencesDevis = creerPreferencesDevis(() => nomDuProjet());

/** Ce que le devis imprime des reglages : l'emetteur (ce qui est saisi, et a defaut ce que le compte propose), le numero, le taux. */
export function reglagesImprimes(prefs: PreferencesDevis): { emetteur: EmetteurDevis; numero: string; tauxTva: number | null } {
  const r = prefs.lire();
  return { emetteur: { ...prefs.defautsEmetteur(), ...r.emetteur }, numero: r.numero, tauxTva: tauxSaisi(r.tauxTva) };
}

/** Les noms des terrasses du devis : celles du dossier, cochees dans l'explorateur (toutes, sans coche). */
export function terrassesDuDevis(objets: ObjetPlan[]): string[] {
  const cles = clesDossier(objets);
  return objets.filter((o) => estTerrasse(o) && cles.includes(o.key)).map((o) => o.name);
}

/**
 * « Devis (PDF)… » : le dialogue qui regle l'emetteur, le client et le numero, puis telecharge le devis
 * (`export.devis`, app/ecouteurs/exports.ts). Ouvrir ne modifie rien. Il ecrit le client sur la parcelle
 * du projet ; sans parcelle, il s'ouvre sur la premiere terrasse et laisse le client a completer.
 */
export function brancherDialogueDevis(cmd: RegistreCommandes, service: ServiceChampsParcours, objets: () => ObjetPlan[], preferences: PreferencesDevis): void {
  cmd.declarer({
    id: 'export.ouvrirDevis', libelle: 'Devis (PDF)…', groupe: 'export', actif: () => objets().some(estTerrasse),
    executer: () => parcours.ouvrir({ type: 'devis', service, preferences })
  });
}
