// Admin › Calibrer la detection, la derniere etape : la facade en 3D, vue de face, la photo posee sur le mur. Le mur est un volume
// a la forme de sa silhouette (le gabarit du plan et du LiDAR) ; sa face porte la texture telle que la 3D du projet la pose (la photo
// redressee et fusionnee, du sol au haut de la bande au-dessus de l'egout). La camera est en elevation devant le mur, perpendiculaire,
// a mi-hauteur, comme la vue de prise de l'audit. three.js se charge a la demande (three/bibliotheque.ts) ; la scene est dans
// three/vueFacade3d.ts, la zone ne garde que le canevas et l'etat du chargement.

import { useEffect, useRef, useState } from 'react';
import { chargerThree } from '../three/bibliotheque.js';
import { dessinerFacade3d, type MurFacade3d } from '../three/vueFacade3d.js';

export function VueFacade3d(m: MurFacade3d) {
  const canevas = useRef<HTMLCanvasElement>(null);
  const [etat, setEtat] = useState<'charge' | 'pret' | 'indisponible'>('charge');
  const { texture, largeurM, hauteurM, hauteurTextureM, gabarit } = m;
  useEffect(() => {
    // Sans WebGL (un vieux navigateur, les tests), pas de 3D : l'etape le dit.
    if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) { setEtat('indisponible'); return; }
    let fini = false, liberer = () => {};
    setEtat('charge');
    chargerThree().then(() => {
      if (fini || !canevas.current) return;
      liberer = dessinerFacade3d(canevas.current, { texture, largeurM, hauteurM, hauteurTextureM, gabarit }, () => { if (!fini) setEtat('pret'); });
    }).catch(() => { if (!fini) setEtat('indisponible'); });
    return () => { fini = true; liberer(); };
  }, [texture, largeurM, hauteurM, hauteurTextureM, gabarit]);
  return <>
    <canvas ref={canevas} className="calEtape large calVue3d" role="img" aria-label="La façade en 3D, vue de face, la photo posée sur le mur" />
    {etat !== 'pret' && <p className="calNote">{etat === 'charge' ? 'Chargement de la vue 3D…' : 'La vue 3D n’est pas disponible dans ce navigateur.'}</p>}
  </>;
}
