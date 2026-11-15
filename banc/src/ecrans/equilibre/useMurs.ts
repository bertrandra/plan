// Le controleur des murs de l'ecran d'equilibre (demande du proprietaire, 15 novembre 2026 : « Avoid having 2 times the same building ») :
// les doublons deja dans le banc (le meme mur en plusieurs images), le geste qui en ecarte (jamais d'office), et le rattrapage du mur
// des images importees avant que l'import ne le garde (un lot borne, lance a la main, qui s'annule).

import { useMemo, useRef, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { lireLesBatiments } from '../../facadesVues.js';
import { lotsDeRattrapage, RATTRAPAGE_MAX, retrouverLeMur } from '../../murVise.js';
import { aRattraper, doublonsDuBanc, imagesEnTrop } from '../../murs.js';
import type { MetaImage } from '../../types.js';

/** La pause entre deux lectures de la BD TOPO, en millisecondes : le WFS de l'IGN est un service public, pas de rafale. */
const PAUSE_MS = 400;

async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status === 429 ? 'le service limite les requêtes (429) : réessayez dans quelques minutes' : 'HTTP ' + r.status);
  return r.json();
}

export function useMurs(banc: Banc) {
  const groupes = useMemo(() => doublonsDuBanc(banc.images), [banc.images]);
  const attente = useMemo(() => aRattraper(banc.images), [banc.images]);
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  const arret = useRef(false);

  /** Ecarte une image (elle passe « rejetee » : on la retrouve dans la mosaique, d'ou elle se reprend ou se supprime). */
  const ecarter = async (l: readonly MetaImage[]) => {
    try { for (const m of l) banc.remplacer(await api.modifier(m.id, { statut: 'rejetee' })); banc.dire(`${l.length} image(s) écartée(s) : elles sont dans la mosaïque, sous « Rejetées ».`); }
    catch (e) { banc.dire((e as Error).message, 'erreur'); }
  };

  /** Le rattrapage d'un lot : les batiments de chaque quartier lus une fois, le mur de chaque image retrouve et ecrit (ou « cherche, rien »). */
  const rattraper = async () => {
    const lots = lotsDeRattrapage(attente), total = lots.reduce((n, l) => n + l.images.length, 0);
    let fait = 0, trouves = 0, pannes = 0;
    arret.current = false;
    setBilan(null);
    setAvance({ fait: 0, total });
    try {
      for (const lot of lots) {
        if (arret.current) break;
        let batiments;
        try {
          const r = await lireLesBatiments(lot.emprise, lireJson);
          // Des batiments lus a moitie donneraient un mur faux (celui de derriere) : ce quartier attend.
          if (r.tronque) throw new Error('tronquée');
          batiments = r.batiments;
        } catch { pannes += lot.images.length; fait += lot.images.length; setAvance({ fait, total }); continue; }
        for (const m of lot.images) {
          if (arret.current) break;
          const mur = retrouverLeMur(m, batiments);
          banc.remplacer(await api.modifier(m.id, mur ? { mur } : { murCherche: new Date().toISOString() }));
          if (mur) trouves++;
          setAvance({ fait: ++fait, total });
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      setBilan(`${trouves} mur(s) retrouvé(s) sur ${fait - pannes} image(s) cherchée(s)${pannes ? ` ; ${pannes} en attente (BD TOPO indisponible ou tronquée)` : ''}${arret.current ? ' ; arrêté' : ''}.`);
    } catch (e) { banc.dire((e as Error).message, 'erreur'); } finally { setAvance(null); }
  };
  return { groupes, enTrop: imagesEnTrop(groupes), attente, lot: Math.min(attente.length, RATTRAPAGE_MAX), avance, bilan, ecarter, rattraper, arreter: () => { arret.current = true; } };
}
