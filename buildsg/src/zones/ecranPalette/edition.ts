// L'etat de l'ecran de la palette et ses gestes : la palette en cours, la reference (celle du
// serveur, ou l'origine), et ce qu'on en fait — regler, charger un modele, importer, exporter,
// revenir, enregistrer apres recapitulatif. Les composants (barre.tsx, vues.tsx) ne font qu'afficher
// et appeler ces gestes.

import { useState } from 'react';
import { PAIRES_CONTRASTE, contraste, type NomJeton } from '../../styles/jetons.js';
import { couleursParDefaut, differences, documentPalette, ecartsAuxOrigines, lireDocumentPalette, memesCouleurs, type Couleurs } from '../../styles/paletteServeur.js';
import type { ModelePalette } from '../../styles/modeles.js';
import { telechargerTexte } from '../../shell/download.js';
import type { Theme } from './commun.js';

export interface OptionsEdition {
  /** La palette lue sur le serveur ; `null` : aucune, ce sont les valeurs d'origine. */
  enregistree?: { couleurs: Couleurs; modifieLe: string | null } | null | undefined;
  /** Enregistre le document ; rend le message d'echec, ou `null` une fois fait. */
  enregistrer?: ((document: ReturnType<typeof documentPalette>) => Promise<string | null>) | undefined;
  /** Pose la palette sur la page elle-meme, une fois enregistree. */
  appliquer?: ((couleurs: Couleurs) => void) | undefined;
}

export interface Message { texte: string; erreur: boolean }
/** Une paire de contraste qui ne tient pas, dans un theme. */
export interface Defaut { theme: Theme; texte: NomJeton; fond: NomJeton; min: number; ratio: number }

/** Les paires de contraste qui ne tiennent pas, theme par theme. */
export function defautsDe(couleurs: Couleurs): Defaut[] {
  return (['clair', 'sombre'] as Theme[]).flatMap(theme => PAIRES_CONTRASTE
    .map(([texte, fond, min]) => ({ theme, texte, fond, min, ratio: contraste(couleurs[theme][texte], couleurs[theme][fond]) }))
    .filter(p => p.ratio < p.min));
}

/** Lit un fichier choisi : par FileReader, que tous les navigateurs connaissent. */
function lireTexte(fichier: File): Promise<string> {
  return new Promise((ok, ko) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(String(lecteur.result ?? ''));
    lecteur.onerror = () => ko(lecteur.error);
    lecteur.readAsText(fichier);
  });
}

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

export function useEditionPalette({ enregistree = null, enregistrer, appliquer }: OptionsEdition) {
  /** La reference : la palette du serveur (ou l'origine), celle a laquelle on compare. */
  const [reference, setReference] = useState<Couleurs>(() => enregistree?.couleurs ?? couleursParDefaut());
  const [modifieLe, setModifieLe] = useState<string | null>(enregistree?.modifieLe ?? null);
  const [couleurs, setCouleurs] = useState<Couleurs>(reference);
  const [message, setMessage] = useState<Message | null>(null);
  const [enCours, setEnCours] = useState(false);
  /** Le modele qui attend confirmation (des reglages non enregistres seraient remplaces). */
  const [aConfirmer, setAConfirmer] = useState<ModelePalette | null>(null);
  /** Le recapitulatif de l'enregistrement est ouvert. */
  const [recapitulatif, setRecapitulatif] = useState(false);
  const modifiee = !memesCouleurs(couleurs, reference);

  const remplacer = (c: Couleurs, m: Message | null) => { setCouleurs(c); setMessage(m); setAConfirmer(null); setRecapitulatif(false); };

  function chargerModele(m: ModelePalette): void {
    remplacer(m.couleurs, { texte: 'Modèle « ' + m.nom + ' » chargé : ' + m.description + ' Vérifiez, puis enregistrez pour l’appliquer à Plan.', erreur: false });
  }

  async function confirmerEnregistrement(): Promise<void> {
    if (!enregistrer) return;
    setEnCours(true);
    const doc = documentPalette(couleurs);
    const refus = await enregistrer(doc);
    setEnCours(false);
    setRecapitulatif(false);
    if (refus) { setMessage({ texte: refus, erreur: true }); return; }
    setReference(couleurs);
    setModifieLe(doc.modifieLe);
    appliquer?.(couleurs);
    setMessage({ texte: 'Palette enregistrée sur le serveur : chaque page de Plan l’appliquera à son ouverture.', erreur: false });
  }

  /**
   * Importe un JSON de palette (un export, ou un fichier fait ailleurs) : ses couleurs valides
   * remplacent celles de l'ecran, le reste garde sa valeur d'origine. Rien n'est enregistre.
   */
  async function importer(fichier: File): Promise<void> {
    let lue: ReturnType<typeof lireDocumentPalette> = null;
    try { lue = lireDocumentPalette(JSON.parse(await lireTexte(fichier))); } catch { /* JSON illisible : refus ci-dessous */ }
    if (!lue) {
      setMessage({ texte: '« ' + fichier.name + ' » n’est pas une palette de Plan (format plan-palette attendu). Rien n’a changé.', erreur: true });
      return;
    }
    const n = ecartsAuxOrigines(lue.couleurs).length;
    remplacer(lue.couleurs, { texte: 'Palette importée de « ' + fichier.name + ' » : ' + pluriel(n, 'couleur') + ' ' + (n > 1 ? 'différentes' : 'différente') + ' de l’origine. Vérifiez, puis enregistrez pour l’appliquer à Plan.', erreur: false });
  }

  return {
    couleurs, reference, modifieLe, message, enCours, aConfirmer, recapitulatif, modifiee,
    surServeur: !!enregistree || !!modifieLe,
    peutEnregistrer: !!enregistrer,
    ecarts: ecartsAuxOrigines(couleurs).length,
    defauts: defautsDe(couleurs),
    /** Ce que l'enregistrement enverrait : les couleurs qui different de la reference. */
    aEnvoyer: differences(reference, couleurs),
    regler(theme: Theme, nom: NomJeton, valeur: string) {
      setCouleurs(c => ({ ...c, [theme]: { ...c[theme], [nom]: valeur } }));
      setMessage(null);
    },
    /** Choisir un modele : charge aussitot, ou demande confirmation s'il y a des reglages non enregistres. */
    choisirModele(m: ModelePalette) {
      if (modifiee) { setMessage(null); setRecapitulatif(false); setAConfirmer(m); } else chargerModele(m);
    },
    chargerModele,
    garderReglages() { setAConfirmer(null); },
    importer(f: File) { void importer(f); },
    exporter() {
      telechargerTexte('plan-palette.json', JSON.stringify(documentPalette(couleurs), null, 2) + '\n');
      setMessage({ texte: 'Palette exportée : plan-palette.json.', erreur: false });
    },
    annuler() { remplacer(reference, null); },
    origine() { remplacer(couleursParDefaut(), null); },
    ouvrirRecapitulatif() { setAConfirmer(null); setMessage(null); setRecapitulatif(true); },
    fermerRecapitulatif() { setRecapitulatif(false); },
    confirmerEnregistrement() { void confirmerEnregistrement(); }
  };
}

export type EditionPalette = ReturnType<typeof useEditionPalette>;
