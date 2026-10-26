// Le navigateur de facades du mode Toit (MD/spec-mode-toit-3d.md, etape 2) : le plan du batiment en petit, un cote de corps par facade.
//
// Chaque corps est un polygone, chaque mur une arete que l'on touche pour choisir la facade ; toucher l'interieur d'un corps prend sa
// facade la plus tournee vers la camera. La facade courante est en evidence, avec un triangle qui dit d'ou l'on regarde. Le plan est
// celui du batiment, nord en haut (l'axe y du plan va vers le bas de l'ecran).

import { useState } from 'react';
import { useStore } from 'zustand';
import { Icone } from '../icones.js';
import { facadesDeSession, sessionToit } from '../../app/toits/modeToit.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { FacadeVisee } from '../../facade/modeToit/facadesDesCorps.js';

const MARGE_M = 1.2;
const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** Les sommets d'un corps, dans l'ordre : le debut de chaque mur. */
function polygones(facades: readonly FacadeVisee[]): Map<number | null, FacadeVisee[]> {
  const par = new Map<number | null, FacadeVisee[]>();
  for (const f of facades) par.set(f.rang, [...(par.get(f.rang) ?? []), f]);
  return par;
}

export function NavigateurFacades({ magasin, commandes }: { magasin: Magasin; commandes: RegistreCommandes }) {
  useStore(magasin.store, (s) => s.version);
  // Sur telephone le plan se replie en un bouton : il ne couvre la scene que si on l'ouvre.
  const [ouvert, setOuvert] = useState(() => typeof document === 'undefined' || document.documentElement.dataset.classe !== 'compact');
  const s = sessionToit();
  if (!s) return null;
  const facades = facadesDeSession(magasin.store.getState().etat.objects);
  if (!facades.length) return null;
  const xs = facades.flatMap((f) => [f.a.x, f.b.x]), ys = facades.flatMap((f) => [f.a.y, f.b.y]);
  const x0 = Math.min(...xs) - MARGE_M, y0 = Math.min(...ys) - MARGE_M, x1 = Math.max(...xs) + MARGE_M, y1 = Math.max(...ys) + MARGE_M;
  const courante = s.facade ?? s.derniere;
  const actif = commandes.etat('toit.facade').utilisable;
  const grands = [...polygones(facades)].sort((p, q) => aire(q[1]) - aire(p[1]));
  const clic = (e: React.MouseEvent<SVGElement>) => { if (actif) commandes.executer('toit.facade', e.currentTarget as unknown as HTMLElement); };
  return (
    <div className={'navigateurToit' + (ouvert ? '' : ' replie')} role="group" aria-label="Façades du bâtiment" title="Choisir une façade">
      <button type="button" className="boutonNavigateur" aria-expanded={ouvert} aria-label={ouvert ? 'Replier le plan des façades' : 'Déplier le plan des façades'}
        onClick={() => { setOuvert(!ouvert); }}><Icone nom={ouvert ? 'fermer' : 'ajuster'} taille={18} /></button>
      <svg viewBox={f2(x0) + ' ' + f2(y0) + ' ' + f2(x1 - x0) + ' ' + f2(y1 - y0)} preserveAspectRatio="xMidYMid meet">
        {grands.map(([rang, murs]) => (
          <polygon key={'c' + rang} className={'corpsNav' + (courante?.rang === rang ? ' sur' : '')} data-commande="toit.facade" data-corps={rang ?? ''} onClick={clic}
            points={murs.map((m) => f2(m.a.x) + ',' + f2(m.a.y)).join(' ')} />
        ))}
        {facades.map((f) => {
          const sur = !!courante && courante.rang === f.rang && courante.mur === f.mur;
          return <path key={f.rang + ':' + f.mur} className={'murNav' + (sur ? ' sur' : '')} data-commande="toit.facade" data-rang={f.rang ?? ''} data-mur={f.mur} onClick={clic}
            d={'M' + f2(f.a.x) + ' ' + f2(f.a.y) + 'L' + f2(f.b.x) + ' ' + f2(f.b.y)} />;
        })}
        {courante && <PointDeVue f={courante} />}
      </svg>
    </div>
  );
}

const aire = (murs: readonly FacadeVisee[]): number => Math.abs(murs.reduce((t, m) => t + m.a.x * m.b.y - m.b.x * m.a.y, 0)) / 2;

/** Le triangle devant le milieu de la facade courante : on la regarde de ce cote. */
function PointDeVue({ f }: { f: FacadeVisee }) {
  const mx = (f.a.x + f.b.x) / 2, my = (f.a.y + f.b.y) / 2, tx = -f.n.y, ty = f.n.x;
  const pt = (d: number, l: number) => f2(mx + f.n.x * d + tx * l) + ',' + f2(my + f.n.y * d + ty * l);
  return <polygon className="pointDeVueNav" points={pt(0.25, 0) + ' ' + pt(1.4, 0.7) + ' ' + pt(1.4, -0.7)} />;
}
