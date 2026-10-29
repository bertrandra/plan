// Le corpus de facades REELLES, cote banc : le format, le jugement et la fiabilite vivent dans src/facade/corpusReel.ts (l'ecran
// admin « Calibrer la detection » s'en sert aussi). Ici : la mesure d'un cas contre ses photos decodees, les tableaux Markdown,
// et les brouillons tires d'un fichier d'audit.

import { FORMAT_CAS_REEL, fiabilite, lireCasReel, mesurerPrepare, type CasReel, type OuvertureVraie, type ResultatCas } from '../../../src/facade/corpusReel.js';
import { derouler, entreesDuCas, preparerPourLaMesure, veriteDuCas } from '../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../src/facade/releve/serie.js';
import { etapeFacade, LIBELLES_ETAT } from '../../../src/model/etapeFacade.js';
import type { Image, P2 } from '../../../src/facade/vision/homographie.js';

export { FORMAT_CAS_REEL, fiabilite, juger, lireCasReel, type CasReel, type Fiabilite, type Jugee, type ResultatCas, type OuvertureVraie } from '../../../src/facade/corpusReel.js';

/** Mesure un cas : `images` sont les photos decodees, dans l'ordre de `cas.photos`. `multiVues: false` ne lit que la premiere photo. */
export async function mesurerCas(cas: CasReel, images: readonly Image[], multiVues = true): Promise<ResultatCas> {
  const { prepare: p } = await preparerPourLaMesure(cas, images, !multiVues);
  return p ? mesurerPrepare(p) : { nom: cas.nom, vraies: cas.ouvertures.length, trouvees: 0, vp: 0, fp: 0, fn: cas.ouvertures.length, coteMedianeCm: null, jugees: [] };
}

const pc = (x: number | null) => (x === null ? '—' : Math.round(x * 100) + ' %');

/** Le tableau Markdown d'un passage sur le corpus. */
export function tableauReel(res: readonly ResultatCas[], titre: string): string[] {
  const l: string[] = [`### ${titre}`, '', '| Cas | Vraies | Trouvées | VP | FP | FN | Précision | Rappel | Cote méd. (cm) |', '|---|--:|--:|--:|--:|--:|--:|--:|--:|'];
  for (const r of res) l.push(`| ${r.nom} | ${r.vraies} | ${r.trouvees} | ${r.vp} | ${r.fp} | ${r.fn} | ${pc(r.trouvees ? r.vp / r.trouvees : null)} | ${pc(r.vraies ? r.vp / r.vraies : null)} | ${r.coteMedianeCm === null ? '—' : r.coteMedianeCm.toFixed(1).replace('.', ',')} |`);
  const t = res.reduce((s, r) => ({ v: s.v + r.vraies, t: s.t + r.trouvees, vp: s.vp + r.vp }), { v: 0, t: 0, vp: 0 });
  l.push(`| **Ensemble** (${res.length}) | ${t.v} | ${t.t} | ${t.vp} | ${t.t - t.vp} | ${t.v - t.vp} | **${pc(t.t ? t.vp / t.t : null)}** | **${pc(t.v ? t.vp / t.v : null)}** | |`, '');
  const f = fiabilite(res.flatMap((r) => r.jugees));
  l.push(`Fiabilité de la confiance (${f.n} baies) : écart de calibration **${f.ece === null ? '—' : f.ece.toFixed(2).replace('.', ',')}**, Brier **${f.brier === null ? '—' : f.brier.toFixed(3).replace('.', ',')}**.`, '', '| Confiance | Baies | Justes | Taux de justes | Confiance moyenne |', '|---|--:|--:|--:|--:|');
  for (const c of f.cases) l.push(`| ${c.de.toFixed(1).replace('.', ',')} – ${c.a.toFixed(1).replace('.', ',')} | ${c.n} | ${c.justes} | ${pc(c.taux)} | ${pc(c.confianceMoyenne)} |`);
  l.push('');
  return l;
}

/** Un brouillon tire d'un fichier d'audit de parcelle : le cas, et la photo (base64) a ecrire a cote. */
export interface Brouillon { cas: CasReel; base64: string }

interface AuditPourBrouillons {
  format?: string;
  batiments?: { cle: string; nom: string; facades: { cote: number; photos: { base64: string }[]; mesure: { rangReleve: number | null; releve: { largeur: number; hauteur: number; ouvertures: OuvertureVraie[]; calage?: { photos: { coins: P2[] }[] } } | null } | null }[] }[];
}

/**
 * Les brouillons d'un fichier d'audit de parcelle : pour chaque facade releveee, la photo du releve, ses coins (ceux du calage)
 * et les ouvertures du releve. Ce que Plan avait propose (peut-etre retouche) n'est pas une verite : `statut: 'brouillon'`.
 */
export function brouillonsDeLAudit(audit: unknown, base: string): Brouillon[] {
  const f = audit as AuditPourBrouillons;
  if (!f || !Array.isArray(f.batiments)) throw new Error('Ce n’est pas un fichier d’audit de parcelle (pas de bâtiments).');
  const out: Brouillon[] = [];
  for (const b of f.batiments) for (const fa of b.facades) {
    const r = fa.mesure?.releve, photo = fa.photos[fa.mesure?.rangReleve ?? 0], coins = r?.calage?.photos[0]?.coins;
    if (!r || !photo || !coins || coins.length !== 4) continue;
    const nom = `${base}-${b.cle.replace(/[^a-z0-9]+/gi, '').slice(-8)}-c${fa.cote}`;
    out.push({
      base64: photo.base64,
      cas: {
        format: FORMAT_CAS_REEL, version: 1, nom, statut: 'brouillon', source: `${base} › ${b.nom} › côté ${fa.cote}`,
        largeurM: r.largeur, hauteurM: r.hauteur, photos: [{ fichier: nom + '.jpg', coins: coins.map(({ x, y }) => ({ x, y })) }],
        ouvertures: r.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })),
      },
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Les cas d'etalon : la verite d'un cas, sans ses photos (tests/fixtures/facades-reel/etalons/)
// ------------------------------------------------------------------------------------------------

/** La verite d'un cas d'etalon : ses dimensions et son gabarit du plan, le mur vrai, la vraie forme du toit, et ce qu'on a constate. */
export interface EtalonFacade {
  format: 'plan-etalon-facade';
  version: 1;
  nom: string;
  source: { idu: string; cleabs: string; cote: number; orientation: string; fixture: string };
  largeurM: number;
  hauteurM: number;
  gabarit: { u: number; v: number }[];
  calageVrai: NonNullable<CasReel['calageVrai']>;
  constat: { le: string; versionChaine: number; murCherche: { x0: number; x1: number }; texte: string };
  toitVrai: NonNullable<CasReel['toitVrai']>;
}

/** Relit un etalon : sa verite passe par la lecture d'un cas (lireCasReel), qui la refuse mal formee. */
export function lireEtalon(donnees: unknown): EtalonFacade {
  const e = donnees as Partial<EtalonFacade> | null;
  if (!e || e.format !== 'plan-etalon-facade' || e.version !== 1 || !e.constat || !e.source) throw new Error('Ce n’est pas un etalon de facade.');
  const cas = lireCasReel({ format: FORMAT_CAS_REEL, version: 1, nom: e.nom, statut: 'brouillon', largeurM: e.largeurM, hauteurM: e.hauteurM, gabarit: e.gabarit, calageVrai: e.calageVrai, toitVrai: e.toitVrai, photos: [{ fichier: '-', coins: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }], ouvertures: [] });
  return { ...(e as EtalonFacade), gabarit: cas.gabarit as EtalonFacade['gabarit'], calageVrai: cas.calageVrai as EtalonFacade['calageVrai'], toitVrai: cas.toitVrai as EtalonFacade['toitVrai'] };
}

/** Le cas tire de l'audit, avec la verite de son etalon : les dimensions et le gabarit du plan, le mur vrai, la vraie forme du toit. */
export function poserEtalon<C extends CasReel>(cas: C, e: EtalonFacade): C {
  return { ...cas, largeurM: e.largeurM, hauteurM: e.hauteurM, gabarit: e.gabarit, calageVrai: e.calageVrai, toitVrai: e.toitVrai };
}

/** Le rejeu d'un cas etape par etape, comme « Rejouer » de la calibration (coins cherches, assemblage) : une ligne par etape. */
export async function rejouerEtapes(cas: CasReel, images: readonly Image[]): Promise<string[]> {
  const r = await derouler(entreesDuCas(cas, images), { coins: 'chercher', image: 'assemblage', chercherCoins: async (q) => rechercher(q), verite: veriteDuCas(cas) });
  return [
    `Rejeu de « ${cas.nom} » : chaîne des façades version ${r.versions.chaine}, objectifs ${r.versions.objectifs}.`, '',
    ...r.etapes.map((x) => `- ${etapeFacade(x.id).numero} ${etapeFacade(x.id).nom} : **${LIBELLES_ETAT[x.etat]}**. ${x.resume}${x.verite ? ' ' + x.verite.texte : ''}`),
  ];
}
