// Monte l'ecran des indicateurs de conformite (`?admin&ecran=conformite`, zones/EcranConformite.tsx ;
// MD/spec-regles-toits.md 13.5, lot G3).
//
// Un ecran de l'admin, comme la consommation : main.ts ne l'ouvre qu'une fois la porte de l'admin
// franchie (les audits recus et les mesures exigent sa session). Il prend toute la page ; Plan ne
// demarre pas dessous. Deux sources :
//   - le corpus du depot, deja juge par le script (regles/conformite.json, compile ici : la page ne
//     peut pas rejouer tests/fixtures/, qui n'est pas livre ; un test le garde a jour) ;
//   - les audits de parcelle partages, recus sur le serveur (`admin/audits`, lot L21), rejoues ici
//     un a un avec le code de ce fichier, sans reseau.
// La mesure se range sur le serveur (`admin/conformite`) quand l'administrateur le demande.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import corpusLivre from '../../regles/conformite.json';
import { EcranConformite, type AuditsJuges } from '../zones/EcranConformite.js';
import { enregistrerMesureConformite, lireAuditRecu, lireMesuresConformiteServeur, listerAuditsRecus } from '../io/depotDemos.js';
import { casDeLAuditParcelle, jugerCas } from '../facade/regles/conformite.js';
import { facadesDeLAuditParcelle, jugerFacade } from '../facade/regles/facades/conformite.js';
import { lireCorpusConformite, type MesureConformite, type VerdictCas, type VerdictFacade } from '../regles/conformite.js';
import { lireFichierAuditParcelle } from '../model/fichierAuditParcelle.js';
import { EMPREINTE_REGLAGES_TOITS } from '../regles/toits/reglages.js';
import { empreinteFaitsToits, faitsEnVigueur } from '../regles/toits/faits.js';
import { APP_VERSION, BUILD_SHA } from '../model/version.js';
import { VERSION_LECTURE_TOITS } from './toitsLidar.js';
import { hoteDeZone } from '../shell/dom.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** L'adresse demande-t-elle l'ecran de la conformite ? */
export function demandeEcranConformite(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'conformite';
}

/** Rend la main au navigateur entre deux cas : un rejeu prend une a trois secondes. */
const pause = () => new Promise<void>((ok) => setTimeout(ok, 0));

/**
 * Les audits partages recus, lus puis rejoues batiment par batiment. Un audit illisible (version plus
 * recente, fichier abime) est nomme et saute : il ne bloque pas les autres. Les sauvegardes de capture
 * (MD/spec-audit.md §15) ne comptent pas : une capture inachevee n'a rien valide, et un audit partage
 * ensuite serait compte deux fois.
 */
export async function jugerAuditsRecus(f: Fetch, progres: (fait: number, total: number) => void): Promise<AuditsJuges> {
  const liste = (await listerAuditsRecus(f)).filter((a) => a.marque !== 'sauvegarde');
  const illisibles: string[] = [];
  const cas = [];
  const facades: VerdictFacade[] = [];
  let lus = 0;
  for (const a of liste) {
    try {
      const fichier = lireFichierAuditParcelle(await lireAuditRecu(f, a.id));
      cas.push(...casDeLAuditParcelle(a.id, fichier));
      // Les facades relevees (lot G13) : la disposition automatique comparee au releve, sans reseau.
      facades.push(...facadesDeLAuditParcelle(a.id, fichier).map((x) => jugerFacade(x)));
      lus++;
    } catch (e) {
      illisibles.push(a.id + ' : ' + ((e as Error).message || String(e)));
    }
  }
  const verdicts: VerdictCas[] = [];
  progres(0, cas.length);
  for (const o of cas) {
    await pause();
    verdicts.push(jugerCas(o));
    progres(verdicts.length, cas.length);
  }
  return { verdicts, facades, lus, illisibles };
}

/** Les versions du calcul qui a juge : celles de ce fichier livre. */
export function versionsDuCalcul(): Pick<MesureConformite, 'code' | 'lecture'> {
  return {
    code: { version: APP_VERSION, commit: BUILD_SHA },
    lecture: { toits: VERSION_LECTURE_TOITS, reglages: EMPREINTE_REGLAGES_TOITS, faits: empreinteFaitsToits(faitsEnVigueur()) },
  };
}

export function ouvrirEcranConformite(): void {
  const f: Fetch = (entree, init) => fetch(entree, init);
  const hote = hoteDeZone('zoneEcranConformite');
  document.title = 'Admin — conformité';
  createRoot(hote).render(createElement(EcranConformite, {
    corpus: lireCorpusConformite(corpusLivre),
    versions: versionsDuCalcul(),
    chargerAudits: (progres: (fait: number, total: number) => void) => jugerAuditsRecus(f, progres),
    lireHistorique: () => lireMesuresConformiteServeur(f),
    enregistrer: (m: MesureConformite) => enregistrerMesureConformite(f, m),
    maintenant: () => new Date(),
  }));
}
