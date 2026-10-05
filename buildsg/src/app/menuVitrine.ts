// Le clic droit de la vitrine (`?mode=demo`, app/vitrine.ts) : « Rafraichir » et « Copier l'adresse ».
//
// La vitrine vit le plus souvent dans un <iframe> de la page d'accueil de la plateforme : la barre
// d'adresse du navigateur y montre la page qui l'encadre, pas la vitrine. Ce menu donne donc les
// deux gestes qu'on ne peut pas faire autrement : recharger la scene seule, et recuperer l'adresse
// exacte de la vitrine — parametres compris (`file`, `pdv`, `zoom`…) — pour la partager ou la reprendre.
//
// **Le clic droit sert aussi a deplacer la scene** (OrbitControls : glisser du bouton droit). Le
// menu ne s'ouvre donc que sur un clic droit SANS glisser : au-dela de quelques pixels entre
// l'appui et le menu, c'etait un deplacement, et le menu du navigateur reste lui aussi coupe.
//
// Deux reglages de la scene s'y ajoutent : **la date du soleil**, par le calendrier du navigateur
// (`<input type="date">`), et **la rotation automatique**, depuis la position de la camera, a une
// vitesse en tours par minute (negative : l'autre sens). L'adresse copiee les porte (`date=`,
// `rotation=`) : la coller ailleurs rouvre la meme scene, au meme jour, tournant pareil.
//
// **Copier depuis un <iframe>** : le presse-papiers n'est permis a un cadre d'une autre origine que
// si la page qui l'encadre le lui accorde (`<iframe allow="clipboard-write">`). Sans cela, on retombe
// sur l'ancienne copie par selection, puis, en dernier recours, on montre l'adresse a copier a la main.

/** Au-dela, entre l'appui du bouton droit et le menu, c'est un glisser — un deplacement de la scene. */
export const TOLERANCE_GLISSER_PX = 5;

/** Copie un texte : le presse-papiers moderne, sinon la copie par selection. Rend vrai si c'est fait. */
export async function copierTexte(texte: string, doc: Document = document): Promise<boolean> {
  try {
    if (doc.defaultView?.navigator.clipboard?.writeText) {
      await doc.defaultView.navigator.clipboard.writeText(texte);
      return true;
    }
  } catch { /* refuse (cadre sans clipboard-write) : on essaie l'ancienne voie */ }
  const zone = doc.createElement('textarea');
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.position = 'fixed';
  zone.style.opacity = '0';
  doc.body.appendChild(zone);
  zone.select();
  let fait = false;
  try { fait = doc.execCommand('copy'); } catch { fait = false; }
  zone.remove();
  return fait;
}

/** Ce que le menu regle dans la scene ; absent, il ne propose que Rafraichir et Copier. */
export interface ReglagesVitrine {
  /** Le jour du soleil a l'ecran, AAAA-MM-JJ. */
  date(): string;
  poserDate(date: string): void;
  /** La vitesse de rotation, en tours par minute ; `null` : arretee. */
  rotation(): number | null;
  poserRotation(toursParMinute: number | null): void;
}

/** La vitesse proposee quand on coche la rotation sans en avoir choisi : un tour par minute. */
export const ROTATION_DEFAUT = 1;

export interface OptionsMenuVitrine {
  doc?: Document;
  reglages?: ReglagesVitrine;
  /** L'adresse a copier ; par defaut celle de la vitrine elle-meme. */
  adresse?: () => string;
  recharger?: () => void;
  copier?: (texte: string) => Promise<boolean>;
}

/** Branche le menu sur la page. Rend de quoi le debrancher. */
export function brancherMenuVitrine(o: OptionsMenuVitrine = {}): () => void {
  const doc = o.doc ?? document;
  const adresse = o.adresse ?? (() => doc.location.href);
  const recharger = o.recharger ?? (() => doc.location.reload());
  const copier = o.copier ?? ((t: string) => copierTexte(t, doc));
  let appui: { x: number; y: number } | null = null;
  let menu: HTMLElement | null = null;

  const fermer = () => { menu?.remove(); menu = null; };

  function ouvrir(x: number, y: number): void {
    fermer();
    const m = doc.createElement('div');
    m.id = 'menuVitrine';
    m.className = 'menuVitrine';
    m.setAttribute('role', 'menu');
    const entree = (libelle: string, agir: (b: HTMLButtonElement) => void) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.textContent = libelle;
      b.addEventListener('click', (e) => { e.stopPropagation(); agir(b); });
      m.appendChild(b);
      return b;
    };
    entree('Rafraîchir', () => { fermer(); recharger(); });
    entree('Copier l’adresse', (b) => {
      const texte = adresse();
      void copier(texte).then((fait) => {
        if (fait) {
          b.textContent = 'Adresse copiée';
          setTimeout(fermer, 1200);
        } else {
          // Dernier recours : l'adresse, selectionnee, a copier a la main.
          const champ = doc.createElement('input');
          champ.className = 'menuVitrineAdresse';
          champ.value = texte;
          champ.readOnly = true;
          champ.setAttribute('aria-label', 'Adresse de la vitrine, à copier');
          b.replaceWith(champ);
          champ.focus();
          champ.select();
        }
      });
    });
    // Les reglages de la scene, sous les deux gestes.
    if (o.reglages) ajouterReglages(m, o.reglages);
    doc.body.appendChild(m);
    menu = m;
    // Dans la fenetre, quel que soit l'endroit du clic : un menu coupe par le bord ne sert a rien.
    const vue = doc.defaultView;
    const l = vue ? vue.innerWidth : 0, h = vue ? vue.innerHeight : 0;
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, l - r.width - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(y, h - r.height - 4)) + 'px';
    (m.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  /** La date au calendrier, la rotation et sa vitesse : appliquees a chaque changement. */
  function ajouterReglages(m: HTMLElement, r: ReglagesVitrine): void {
    const sep = doc.createElement('div');
    sep.className = 'menuVitrineSeparateur';
    sep.setAttribute('role', 'separator');
    m.appendChild(sep);

    const ligne = (libelle: string, pour: string) => {
      const l = doc.createElement('div');
      l.className = 'menuVitrineLigne';
      const lab = doc.createElement('label');
      lab.htmlFor = pour;
      lab.textContent = libelle;
      l.appendChild(lab);
      m.appendChild(l);
      return l;
    };

    const date = doc.createElement('input');
    date.type = 'date';
    date.id = 'menuVitrineDate';
    date.value = r.date();
    date.addEventListener('change', () => { if (date.value) r.poserDate(date.value); });
    ligne('Date du soleil', date.id).appendChild(date);

    const actif = doc.createElement('input');
    actif.type = 'checkbox';
    actif.id = 'menuVitrineRotation';
    const vitesse = doc.createElement('input');
    vitesse.type = 'number';
    vitesse.id = 'menuVitrineVitesse';
    vitesse.min = '-10'; vitesse.max = '10'; vitesse.step = '0.5';
    vitesse.setAttribute('aria-label', 'Vitesse de rotation, en tours par minute');
    const courante = r.rotation();
    actif.checked = courante !== null;
    vitesse.value = String(courante ?? ROTATION_DEFAUT);
    const appliquer = () => {
      const v = Math.max(-10, Math.min(10, parseFloat(vitesse.value.replace(',', '.'))));
      r.poserRotation(actif.checked && isFinite(v) && v !== 0 ? v : null);
    };
    actif.addEventListener('change', appliquer);
    vitesse.addEventListener('input', () => { if (!actif.checked) actif.checked = true; appliquer(); });
    const l = ligne('Rotation auto', actif.id);
    l.prepend(actif);
    const unite = doc.createElement('span');
    unite.className = 'menuVitrineUnite';
    unite.textContent = 'tr/min';
    l.append(vitesse, unite);
  }

  const surAppui = (e: PointerEvent) => {
    if (e.button === 2) appui = { x: e.clientX, y: e.clientY };
    if (menu && !menu.contains(e.target as Node)) fermer();
  };
  const surMenu = (e: MouseEvent) => {
    e.preventDefault();
    const glisse = appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > TOLERANCE_GLISSER_PX;
    appui = null;
    if (glisse) return;
    ouvrir(e.clientX, e.clientY);
  };
  const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };

  // En capture : OrbitControls arrete le `contextmenu` sur son canevas, le menu doit le voir avant.
  doc.addEventListener('pointerdown', surAppui, true);
  doc.addEventListener('contextmenu', surMenu, true);
  doc.addEventListener('keydown', surTouche);
  doc.defaultView?.addEventListener('blur', fermer);
  return () => {
    fermer();
    doc.removeEventListener('pointerdown', surAppui, true);
    doc.removeEventListener('contextmenu', surMenu, true);
    doc.removeEventListener('keydown', surTouche);
    doc.defaultView?.removeEventListener('blur', fermer);
  };
}
