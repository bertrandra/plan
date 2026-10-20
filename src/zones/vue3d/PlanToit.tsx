// Z4, le mode Plan du mode Toit (MD/spec-mode-toit-3d.md, etape 5) : la vue de dessus, ou chaque corps du batiment se choisit d'un toucher.
//
// Un calque SVG par-dessus la scene vue de dessus : un polygone par corps, que la camera projette. Toucher un corps le choisit (les
// poignees de PoigneesToit.tsx le deplacent et l'etirent, l'inspecteur le tourne et le retire). Les bow-windows et galeries posees sur un
// corps n'ont pas de polygone a eux : ils suivent leur corps.

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { etatToit, sessionToit } from '../../app/modeToit.js';
import { rangsDeCorps } from '../../facade/regles/toits/corpsNeufs.js';
import { hotes3d, vue3d } from '../../three/etat3d.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

export function PlanToit({ magasin, commandes }: { magasin: Magasin; commandes: RegistreCommandes }) {
  useStore(magasin.store, (s) => s.version);
  const [, redessiner] = useState(0);
  useEffect(() => {
    let derniere = '';
    const id = setInterval(() => {
      const sc = vue3d.scene;
      if (!sc) return;
      const p = sc.camera.position, t = sc.controls.target;
      const cle = [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(2)).join();
      if (cle !== derniere) { derniere = cle; redessiner((n) => n + 1); }
    }, 100);
    return () => clearInterval(id);
  }, []);
  const s = sessionToit(), e = etatToit(), sc = vue3d.scene, hote = hotes3d.vue3d;
  if (!s || e.vue !== 'dessus' || !sc || !hote) return null;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const corps = o?.corpsToit;
  if (!corps?.length) return null;
  const r = hote.getBoundingClientRect();
  const px = (x: number, y: number) => {
    const v = new THREE.Vector3(x - sc.cen.x, 0, sc.cen.y - y).project(sc.camera);
    return ((v.x + 1) / 2) * r.width + ',' + ((1 - v.y) / 2) * r.height;
  };
  const actif = commandes.etat('toit.selection').utilisable;
  return (
    <svg className="planToit" width={r.width} height={r.height} viewBox={'0 0 ' + r.width + ' ' + r.height} aria-label="Corps du bâtiment">
      {rangsDeCorps(corps).map((rang) => {
        const c = corps[rang];
        if (!c) return null;
        const choisi = e.selection?.type === 'corps' && e.selection.rang === rang;
        return (
          <polygon key={rang} className={'corpsPlan' + (choisi ? ' choisi' : '')} data-plan-corps={rang} data-commande="toit.selection" data-type="corps" data-rang={rang} data-i={0}
            points={c.pts.map((p) => px(p.x, p.y)).join(' ')} onClick={(ev) => { if (actif) commandes.executer('toit.selection', ev.currentTarget as unknown as HTMLElement); }} />
        );
      })}
    </svg>
  );
}
