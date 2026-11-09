// L'editeur plein ecran de facade.html : des poignees a poser sur une image, au doigt, avec une
// loupe, le zoom a deux doigts et un pave pour finir au demi-pixel. Il sert aux coins d'une photo
// (repli manuel du redressement) et aux deux points d'une cote (echelle, mesure).

import type { P2 } from './auto.js';

export interface OptionsEditeur {
  /** L'image a annoter (un canevas d'apercu) ; les points sont dans ses pixels. */
  image: HTMLCanvasElement;
  points: P2[];
  forme: 'quad' | 'segment';
  consigne: string;
  noms?: string[];
  /** Un champ numerique (la longueur d'une cote), s'il en faut un. */
  champ?: { libelle: string; valeur: string };
  /** Le texte sous l'image, recalcule a chaque geste. */
  mesure?: (points: P2[], valeur: number | null) => string;
  /** Boutons de plus, a cote de « Valider » : leur id revient comme action. */
  boutons?: { id: string; texte: string }[];
  valider?: string;
  /** Refuser la validation (et dire pourquoi) tant que la saisie ne va pas. */
  verifier?: (points: P2[], valeur: number | null) => string | null;
}

export interface ResultatEditeur {
  action: string;
  points: P2[];
  valeur: number | null;
}

const nombre = (s: string): number | null => {
  const v = parseFloat(s.replace(',', '.').trim());
  return Number.isFinite(v) ? v : null;
};

let racine: HTMLElement | null = null;

function construire(): HTMLElement {
  if (racine) return racine;
  const r = document.createElement('div');
  r.id = 'editeur';
  r.hidden = true;
  r.setAttribute('role', 'dialog');
  r.setAttribute('aria-modal', 'true');
  r.setAttribute('aria-labelledby', 'ed-consigne');
  r.innerHTML = `
  <div id="ed-haut"><span id="ed-consigne"></span><br><span class="ed-aide">Glissez une poignée (une loupe apparaît) ; un doigt ailleurs déplace la vue, deux doigts zooment.</span></div>
  <canvas id="toile"></canvas>
  <div id="ed-bas">
    <label id="ed-champ" hidden><span id="ed-champ-libelle"></span><input type="text" id="ed-valeur" inputmode="decimal" autocomplete="off"></label>
    <div id="ed-mesure" aria-live="polite"></div>
    <div class="pave" aria-label="Ajustement fin de la poignée">
      <button type="button" id="pv-g" aria-label="Poignée vers la gauche">◀</button>
      <button type="button" id="pv-h" aria-label="Poignée vers le haut">▲</button>
      <button type="button" id="pv-b" aria-label="Poignée vers le bas">▼</button>
      <button type="button" id="pv-d" aria-label="Poignée vers la droite">▶</button>
      <button type="button" id="pv-suivant" aria-label="Poignée suivante">⟳</button>
    </div>
    <div class="ed-actions">
      <span id="ed-plus"></span>
      <button type="button" class="second" id="ed-cadrer">Tout voir</button>
      <button type="button" class="second" id="ed-annuler">Annuler</button>
      <button type="button" id="ed-valider">Valider</button>
    </div>
  </div>`;
  document.body.append(r);
  racine = r;
  return r;
}

export function editer(o: OptionsEditeur): Promise<ResultatEditeur | null> {
  const r = construire();
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => r.querySelector('#' + id) as T;
  const c = $<HTMLCanvasElement>('toile');
  const pts = o.points.map((p) => ({ ...p }));
  const noms = o.noms ?? pts.map((_, i) => `point ${i + 1}`);
  let sel = 0,
    s = 1,
    ox = 0,
    oy = 0;
  let loupe: P2 | null = null;
  const im = o.image;

  $('ed-consigne').textContent = o.consigne;
  const champ = $('ed-champ'),
    valeurEl = $<HTMLInputElement>('ed-valeur');
  champ.hidden = !o.champ;
  if (o.champ) {
    $('ed-champ-libelle').textContent = o.champ.libelle;
    valeurEl.value = o.champ.valeur;
  }
  const plus = $('ed-plus');
  plus.replaceChildren();
  $('ed-valider').textContent = o.valider ?? 'Valider';
  const valeur = () => (o.champ ? nombre(valeurEl.value) : null);

  const versEcran = (q: P2) => ({ x: q.x * s + ox, y: q.y * s + oy });
  function cadrer() {
    const b = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(b.width * dpr));
    c.height = Math.max(1, Math.round(b.height * dpr));
    s = Math.min(b.width / (im.width * 1.25), b.height / (im.height * 1.25));
    ox = (b.width - im.width * s) / 2;
    oy = (b.height - im.height * s) / 2;
  }
  function majMesure() {
    $('ed-mesure').textContent = `Poignée : ${noms[sel]}` + (o.mesure ? ' · ' + o.mesure(pts, valeur()) : '');
  }
  let demande = 0;
  function dessiner() {
    if (demande) return;
    demande = requestAnimationFrame(() => {
      demande = 0;
      const ctx = c.getContext('2d')!;
      const b = c.getBoundingClientRect();
      const dpr = c.width / (b.width || 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, ox, oy, im.width * s, im.height * s);
      const e = pts.map(versEcran);
      if (o.forme === 'quad') {
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,.45)';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) prolonger(ctx, e[k]!, e[(k + 1) % 4]!);
        ctx.setLineDash([]);
        const couleurs = ['#ff9f1c', '#2ec4f1', '#ff9f1c', '#2ec4f1'];
        for (let k = 0; k < 4; k++) {
          ctx.strokeStyle = couleurs[k]!;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(e[k]!.x, e[k]!.y);
          ctx.lineTo(e[(k + 1) % 4]!.x, e[(k + 1) % 4]!.y);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = '#ff9f1c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(e[0]!.x, e[0]!.y);
        ctx.lineTo(e[1]!.x, e[1]!.y);
        ctx.stroke();
      }
      e.forEach((q, k) => {
        ctx.beginPath();
        ctx.arc(q.x, q.y, k === sel ? 15 : 12, 0, Math.PI * 2);
        ctx.fillStyle = k === sel ? 'rgba(255,159,28,.35)' : 'rgba(0,0,0,.25)';
        ctx.fill();
        ctx.strokeStyle = k === sel ? '#ff9f1c' : '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(q.x - 5, q.y);
        ctx.lineTo(q.x + 5, q.y);
        ctx.moveTo(q.x, q.y - 5);
        ctx.lineTo(q.x, q.y + 5);
        ctx.stroke();
      });
      if (loupe) dessinerLoupe(ctx, b.width);
    });
  }
  function prolonger(ctx: CanvasRenderingContext2D, a: P2, b: P2) {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const n = Math.hypot(dx, dy);
    if (n < 1) return;
    const k = 4000 / n;
    ctx.beginPath();
    ctx.moveTo(a.x - dx * k, a.y - dy * k);
    ctx.lineTo(b.x + dx * k, b.y + dy * k);
    ctx.stroke();
  }
  function dessinerLoupe(ctx: CanvasRenderingContext2D, largeur: number) {
    const q = pts[sel]!;
    const R = Math.min(80, largeur * 0.2);
    const gauche = loupe!.x > largeur / 2;
    const cx = gauche ? R + 12 : largeur - R - 12,
      cy = R + 12;
    const g = Math.min(8, Math.max(2.5, s * 5));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.clip();
    ctx.imageSmoothingEnabled = g < 4;
    ctx.drawImage(im, cx - q.x * g, cy - q.y * g, im.width * g, im.height * g);
    ctx.strokeStyle = 'rgba(255,159,28,.9)';
    ctx.lineWidth = 1.5;
    const L = (p: P2) => ({ x: cx + (p.x - q.x) * g, y: cy + (p.y - q.y) * g });
    const n = pts.length;
    pts.forEach((p, k) => {
      if (o.forme === 'segment' && k === 1) return;
      const a = L(p),
        b = L(pts[(k + 1) % n]!);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Les gestes. Les ecouteurs sont poses a chaque ouverture et retires a la fermeture.
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const doigts = new Map<number, P2>();
  type Geste = { type: 'poignee'; k: number; depart: P2; ecran: P2 } | { type: 'vue'; ox: number; oy: number; ecran: P2 } | { type: 'pince'; d0: number; s0: number; img: P2 };
  let geste: Geste | null = null;
  const pos = (e: PointerEvent): P2 => {
    const b = c.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  c.addEventListener(
    'pointerdown',
    (e) => {
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      doigts.set(e.pointerId, p);
      if (doigts.size === 2) {
        const [a, b] = [...doigts.values()] as [P2, P2];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        geste = { type: 'pince', d0: Math.hypot(b.x - a.x, b.y - a.y), s0: s, img: { x: (m.x - ox) / s, y: (m.y - oy) / s } };
        loupe = null;
        return;
      }
      if (doigts.size > 2) return;
      let k = -1,
        best = e.pointerType === 'mouse' ? 20 : 36;
      pts.forEach((q, i) => {
        const v = versEcran(q);
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d < best) [best, k] = [d, i];
      });
      if (k >= 0) {
        sel = k;
        geste = { type: 'poignee', k, depart: { ...pts[k]! }, ecran: p };
        loupe = p;
        majMesure();
      } else geste = { type: 'vue', ox, oy, ecran: p };
      dessiner();
    },
    sig,
  );
  c.addEventListener(
    'pointermove',
    (e) => {
      if (!doigts.has(e.pointerId)) return;
      const p = pos(e);
      doigts.set(e.pointerId, p);
      if (!geste) return;
      if (geste.type === 'poignee') {
        // Deplacement relatif : la poignee suit le doigt sans se cacher dessous.
        pts[geste.k] = { x: geste.depart.x + (p.x - geste.ecran.x) / s, y: geste.depart.y + (p.y - geste.ecran.y) / s };
        loupe = p;
        majMesure();
      } else if (geste.type === 'vue') {
        ox = geste.ox + p.x - geste.ecran.x;
        oy = geste.oy + p.y - geste.ecran.y;
      } else {
        const [a, b] = [...doigts.values()] as [P2, P2];
        if (!a || !b) return;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        s = Math.min(40, Math.max(0.02, (geste.s0 * Math.hypot(b.x - a.x, b.y - a.y)) / Math.max(1, geste.d0)));
        ox = m.x - geste.img.x * s;
        oy = m.y - geste.img.y * s;
      }
      dessiner();
    },
    sig,
  );
  const fin = (e: PointerEvent) => {
    doigts.delete(e.pointerId);
    if (doigts.size === 1 && geste?.type === 'pince') {
      const [p] = [...doigts.values()] as [P2];
      geste = { type: 'vue', ox, oy, ecran: p };
    } else if (doigts.size === 0) {
      geste = null;
      loupe = null;
    }
    dessiner();
  };
  c.addEventListener('pointerup', fin, sig);
  c.addEventListener('pointercancel', fin, sig);
  c.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const b = c.getBoundingClientRect();
      const m = { x: e.clientX - b.left, y: e.clientY - b.top };
      const img = { x: (m.x - ox) / s, y: (m.y - oy) / s };
      s = Math.min(40, Math.max(0.02, s * Math.exp(-e.deltaY * 0.0015)));
      ox = m.x - img.x * s;
      oy = m.y - img.y * s;
      dessiner();
    },
    { passive: false, signal: ac.signal },
  );
  let minuterie = 0;
  const pousser = (dx: number, dy: number) => {
    const q = pts[sel]!;
    const pas = 0.5 / s;
    pts[sel] = { x: q.x + dx * pas, y: q.y + dy * pas };
    loupe = versEcran(pts[sel]!);
    majMesure();
    dessiner();
    clearTimeout(minuterie);
    minuterie = window.setTimeout(() => {
      loupe = null;
      dessiner();
    }, 1200);
  };
  for (const [id, dx, dy] of [
    ['pv-g', -1, 0],
    ['pv-d', 1, 0],
    ['pv-h', 0, -1],
    ['pv-b', 0, 1],
  ] as [string, number, number][]) {
    const b = $(id);
    let t = 0;
    const arret = () => clearInterval(t);
    b.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        pousser(dx, dy);
        clearInterval(t);
        t = window.setInterval(() => pousser(dx, dy), 90);
      },
      sig,
    );
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, arret, sig);
  }
  $('pv-suivant').addEventListener(
    'click',
    () => {
      sel = (sel + 1) % pts.length;
      majMesure();
      dessiner();
    },
    sig,
  );
  $('ed-cadrer').addEventListener(
    'click',
    () => {
      cadrer();
      dessiner();
    },
    sig,
  );
  valeurEl.addEventListener('input', majMesure, sig);
  window.addEventListener(
    'resize',
    () => {
      cadrer();
      dessiner();
    },
    sig,
  );

  return new Promise((resolve) => {
    const fermer = (res: ResultatEditeur | null) => {
      ac.abort();
      r.hidden = true;
      document.documentElement.classList.remove('fige');
      resolve(res);
    };
    const finir = (action: string) => {
      if (action === 'valider' && o.verifier) {
        const pb = o.verifier(pts, valeur());
        if (pb) {
          $('ed-mesure').textContent = pb;
          return;
        }
      }
      fermer({ action, points: pts, valeur: valeur() });
    };
    $('ed-valider').addEventListener('click', () => finir('valider'), sig);
    $('ed-annuler').addEventListener('click', () => fermer(null), sig);
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') fermer(null);
      },
      sig,
    );
    for (const b of o.boutons ?? []) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'second';
      el.textContent = b.texte;
      el.addEventListener('click', () => finir(b.id), sig);
      plus.append(el);
    }
    r.hidden = false;
    document.documentElement.classList.add('fige');
    cadrer();
    majMesure();
    dessiner();
    $<HTMLButtonElement>('ed-valider').focus();
  });
}
