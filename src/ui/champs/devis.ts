// Le dialogue du devis (menu Exporter) : qui l'etablit, pour qui, sous quel numero (ui/champs/).
//
// Deux sortes de champs, qui ne se rangent pas au meme endroit :
//   - l'emetteur, le taux de TVA et le numero sont ceux de la personne qui etablit le devis, pas du
//     projet : ils se reglent une fois et valent pour tous ses projets (app/devis.ts les garde dans ce
//     navigateur). Ce sont des reglages (`sale: false`) : ni annulation, ni « projet modifie », permis
//     en lecture seule — on peut faire le devis d'un projet qu'on ne peut pas modifier ;
//   - le client est le declarant de la declaration prealable, deja range sur la parcelle du projet
//     (`declaration`) : memes champs, meme place, aucun champ de fichier nouveau. Les ecrire modifie
//     le projet, comme dans la declaration.

import { texte as champDeclaration } from './declaration.js';
import type { EmetteurDevis } from '../../export/devisPdf.js';
import type { Champ, Section } from './types.js';

/** Ce que la personne regle pour ses devis. `tauxTva` et `numero` restent du texte : vides, ils ne disent rien. */
export interface ReglagesDevis { emetteur: EmetteurDevis; tauxTva: string; numero: string }

/** Ou les reglages se lisent et s'ecrivent (app/devis.ts), et ce que le compte et le projet proposent a leur place. */
export interface PreferencesDevis {
  lire(): ReglagesDevis;
  ecrire(r: Partial<Omit<ReglagesDevis, 'emetteur'>> & { emetteur?: Partial<EmetteurDevis> }): void;
  /** Le nom et l'adresse electronique du compte connecte (`/me/context`), proposes tant que rien n'est saisi. */
  defautsEmetteur(): EmetteurDevis;
  /** Le numero que le projet donne, quand la personne n'en choisit pas. */
  numeroPropose(): string;
}

/** Le taux saisi, en %, ou `null` quand il n'en est pas un : le devis dit alors « TVA non comprise ». */
export function tauxSaisi(t: string): number | null {
  const v = parseFloat(String(t).replace(',', '.').replace('%', '').trim());
  return isFinite(v) && v >= 0 && v < 100 ? v : null;
}

type CleEmetteur = keyof EmetteurDevis;

/** Les champs du client (le declarant, range sur la parcelle) : le dialogue les replie a part (zones/parcours/Devis.tsx). */
const CHAMPS_CLIENT = new WeakSet<Champ>();
export const estChampClient = (ch: Champ): boolean => CHAMPS_CLIENT.has(ch);

export function sectionDevis(prefs: PreferencesDevis, terrasses: string[]): Section {
  const defauts = prefs.defautsEmetteur();
  const emetteur = (cle: CleEmetteur, libelle: string, placeholder: string, aide?: string): Champ => ({
    type: 'texte', cle: 'devis-' + cle, libelle, placeholder: defauts[cle] || placeholder, sale: false, effets: ['inspecteur'], ...(aide ? { aide } : {}),
    lire: () => prefs.lire().emetteur[cle] ?? '', ecrire: (_c, v) => prefs.ecrire({ emetteur: { [cle]: v } })
  });
  // Sans parcelle, le client n'a pas ou se ranger : le devis le laisse a completer. Dans le dialogue, il se range a part, replie
  // derriere « Client (facultatif) » (audit UX de la 5.45.0, constat 10) : son libelle n'a plus a redire « Client ».
  const client = (ch: Champ): Champ => {
    const c: Champ = { ...ch, visible: (cx) => !!cx.parcelle && cx.obj === cx.parcelle };
    CHAMPS_CLIENT.add(c);
    return c;
  };
  // Un exemple se dit comme tel : « ex. : … », en texte indicatif (la feuille de style l'ecrit en italique, couleur secondaire).
  const ex = (t: string) => 'ex. : ' + t;
  const champs: Champ[] = [
    emetteur('nom', 'Émetteur', 'Votre nom ou votre entreprise', 'Le nom en tête du devis ; vide, celui de votre compte'),
    emetteur('adresse', 'Adresse', ex('12 rue des Artisans, 78000 Versailles')),
    emetteur('telephone', 'Téléphone', ex('01 23 45 67 89')),
    emetteur('email', 'Courriel', ex('nom@exemple.fr')),
    emetteur('mentions', 'Mentions', ex('SIRET, assurance décennale…'), 'Une ligne libre sous vos coordonnées ; le devis n’ajoute aucune mention de lui-même'),
    {
      type: 'texte', cle: 'devis-tva', libelle: 'Taux de TVA (%)', placeholder: 'vide : TVA non comprise', sale: false, effets: ['inspecteur'],
      aide: 'Le taux qui s’applique à vos ventes (20, 10, 5,5…). Sans taux, le devis s’arrête au total HT et dit « TVA non comprise ».',
      lire: () => prefs.lire().tauxTva, ecrire: (_c, v) => prefs.ecrire({ tauxTva: v.trim() })
    },
    {
      type: 'texte', cle: 'devis-numero', libelle: 'Numéro du devis', placeholder: prefs.numeroPropose(), sale: false, effets: ['inspecteur'],
      aide: 'Votre référence ; vide, celle que donnent le nom du projet et la date du jour',
      lire: () => prefs.lire().numero, ecrire: (_c, v) => prefs.ecrire({ numero: v.trim() })
    },
    client(champDeclaration('prenom', 'Prénom', ex('Marie'))), client(champDeclaration('nom', 'Nom', ex('Martin'))),
    client(champDeclaration('numero', 'Numéro', ex('12'))), client(champDeclaration('voie', 'Voie', ex('rue des Lilas'))),
    client(champDeclaration('codePostal', 'Code postal', ex('78110'))), client(champDeclaration('localite', 'Localité', ex('Le Vésinet'))),
    client(champDeclaration('telephone', 'Téléphone', ex('06 12 34 56 78'))), client(champDeclaration('email', 'Adresse électronique', ex('marie.martin@exemple.fr'))),
    {
      type: 'lecture', cle: 'devis-terrasses', libelle: 'Terrasses',
      valeur: () => terrasses.length ? terrasses.map((t, i) => 'T' + (i + 1) + ' ' + t).join(', ') : 'aucune : dessinez une terrasse'
    }
  ];
  return {
    id: 'devis', titre: 'Devis',
    explication: 'Une page à envoyer à votre client : les postes de la Nomenclature des terrasses cochées dans l’explorateur, avec les prix saisis, ou leur fourchette estimée quand ils ne le sont pas. Vos coordonnées, le taux de TVA et le numéro restent dans ce navigateur pour vos prochains devis ; le client est celui de la déclaration préalable, rangé avec le projet.',
    champs
  };
}
