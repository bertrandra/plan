// Banc de facades : rejoue le corpus tests/fixtures/facades/ sur facade/detection/detection.ts et
// facade/analyse.ts tels qu'ils sont, et ecrit le tableau (spec-facades-calage-detection.md §14).
//
//   npx tsx .claude/skills/facades/scripts/banc.ts                 tout le corpus, tableau Markdown
//   npx tsx .claude/skills/facades/scripts/banc.ts brique ombres   les scenes dont le nom contient l'un des mots
//   ... --json /tmp/facades/banc.json                              le detail, pour comparer avant / apres
//   ... --images /tmp/facades                                      photo, elevation, redressement (et fusion) en PNG,
//                                                                  verite en vert, detection en rouge ; sur la
//                                                                  photo, coins du releve en jaune, coins et
//                                                                  zones du calage grossier en cyan ; aretes du
//                                                                  calage fin en magenta, ses coins en rouge
//   ... --ecrire-coins                                             recalcule verite.coins apres un changement de prise
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCorpus, rejouerCorpus, tableau, DOSSIER_CORPUS } from '../../../../tests/banc/facades/banc.ts';
import { coinsVrais, peindreElevation, murSeul, type SceneFacade } from '../../../../tests/banc/facades/synthese.ts';
import type { Image } from '../../../../src/facade/vision/homographie.ts';
import { png } from '../../../../tests/banc/facades/png.ts';

const args = process.argv.slice(2);
const option = (nom: string) => {
  const i = args.indexOf(nom);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? null;
};
const ecrireCoins = args.includes('--ecrire-coins');
if (ecrireCoins) args.splice(args.indexOf('--ecrire-coins'), 1);
const json = option('--json');
const images = option('--images');
const filtres = args;

if (ecrireCoins) {
  for (const f of readdirSync(DOSSIER_CORPUS).filter((n) => n.endsWith('.json'))) {
    const chemin = join(DOSSIER_CORPUS, f);
    const s = JSON.parse(readFileSync(chemin, 'utf8')) as SceneFacade;
    const c = coinsVrais(s);
    s.verite.coins = c ? c.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })) : null;
    writeFileSync(chemin, JSON.stringify(s, null, 2) + '\n');
    console.log('coins ecrits :', f);
  }
}

const scenes = chargerCorpus().filter((s) => !filtres.length || filtres.some((m) => s.nom.includes(m)));
const b = rejouerCorpus(scenes);
console.log(tableau(b));

if (json) {
  const sansImages = { ...b, scenes: b.scenes.map(({ detail, ...r }) => ({ ...r, detectees: { elevation: detail.elevation, photo: detail.photo } })) };
  writeFileSync(json, JSON.stringify(sansImages, null, 2));
}

/** Trace le contour d'une boite (metres, y depuis le sol) sur une elevation de `pxParM`. */
function cadre(img: Image, pxParM: number, o: { x: number; y: number; l: number; h: number }, c: [number, number, number], ep = 2) {
  const x0 = Math.round(o.x * pxParM),
    x1 = Math.round((o.x + o.l) * pxParM),
    y0 = Math.round(img.hauteur - (o.y + o.h) * pxParM),
    y1 = Math.round(img.hauteur - o.y * pxParM);
  const pose = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= img.largeur || y >= img.hauteur) return;
    const k = (y * img.largeur + x) * 4;
    img.donnees[k] = c[0];
    img.donnees[k + 1] = c[1];
    img.donnees[k + 2] = c[2];
  };
  for (let e = 0; e < ep; e++) {
    for (let x = x0; x <= x1; x++) {
      pose(x, y0 + e);
      pose(x, y1 - e);
    }
    for (let y = y0; y <= y1; y++) {
      pose(x0 + e, y);
      pose(x1 - e, y);
    }
  }
}

/** Trace le contour d'un rectangle de la photo (pixels), ramene dans l'image. */
function rectangle(img: Image, x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  const bx = (v: number) => Math.max(0, Math.min(img.largeur - 1, Math.round(v))),
    by = (v: number) => Math.max(0, Math.min(img.hauteur - 1, Math.round(v)));
  const [a, b, h, d] = [bx(x0), bx(x1), by(y0), by(y1)];
  const pose = (x: number, y: number) => {
    const k = (y * img.largeur + x) * 4;
    img.donnees[k] = c[0];
    img.donnees[k + 1] = c[1];
    img.donnees[k + 2] = c[2];
  };
  for (let x = a; x <= b; x++) {
    pose(x, h);
    pose(x, d);
  }
  for (let y = h; y <= d; y++) {
    pose(a, y);
    pose(b, y);
  }
}

/** Trace un point (une croix) sur la photo. */
function croix(img: Image, x: number, y: number, c: [number, number, number]) {
  for (let d = -10; d <= 10; d++)
    for (const [px, py] of [
      [Math.round(x + d), Math.round(y)],
      [Math.round(x), Math.round(y + d)],
    ] as const) {
      if (px < 0 || py < 0 || px >= img.largeur || py >= img.hauteur) continue;
      const k = (py * img.largeur + px) * 4;
      img.donnees[k] = c[0];
      img.donnees[k + 1] = c[1];
      img.donnees[k + 2] = c[2];
    }
}

/** Trace une droite a x + b y + c = 0 sur toute la photo. */
function droite(img: Image, a: number, b: number, c: number, coul: [number, number, number]) {
  const pose = (x: number, y: number) => {
    const px = Math.round(x),
      py = Math.round(y);
    if (px < 0 || py < 0 || px >= img.largeur || py >= img.hauteur) return;
    const k = (py * img.largeur + px) * 4;
    img.donnees[k] = coul[0];
    img.donnees[k + 1] = coul[1];
    img.donnees[k + 2] = coul[2];
  };
  if (Math.abs(b) > Math.abs(a)) for (let x = 0; x < img.largeur; x++) pose(x, -(a * x + c) / b);
  else for (let y = 0; y < img.hauteur; y++) pose(-(b * y + c) / a, y);
}

if (images) {
  mkdirSync(images, { recursive: true });
  const VERT: [number, number, number] = [0, 200, 60],
    ROUGE: [number, number, number] = [230, 20, 20],
    JAUNE: [number, number, number] = [250, 210, 0],
    CYAN: [number, number, number] = [0, 200, 230],
    MAGENTA: [number, number, number] = [230, 0, 230];
  scenes.forEach((s, i) => {
    const r = b.scenes[i];
    if (!r) return;
    const px = s.synthese.pxParM ?? 100;
    const elev = murSeul(s, peindreElevation(s, px, true), px);
    for (const o of s.verite.ouvertures) cadre(elev, px, o, VERT, 3);
    for (const o of r.detail.elevation) cadre(elev, px, o, ROUGE);
    writeFileSync(join(images, s.nom + '-elevation.png'), png(elev));
    const photo = r.detail.image;
    if (photo) {
      for (const c of r.detail.coinsImage ?? s.verite.coins ?? []) croix(photo, c.x, c.y, VERT);
      for (const z of r.detail.zones ?? []) if (z.bornee) rectangle(photo, z.x0, z.y0, z.x1, z.y1, CYAN);
      for (const c of r.detail.coinsPredits ?? []) croix(photo, c.x, c.y, CYAN);
      for (const c of r.detail.coinsProposes ?? []) croix(photo, c.x, c.y, JAUNE);
      const fin = r.detail.fin;
      for (const l of fin?.detail.lignes ?? []) droite(photo, l.a, l.b, l.c, MAGENTA);
      if (fin?.trouve) for (const c of fin.coins ?? []) croix(photo, c.x, c.y, ROUGE);
      writeFileSync(join(images, s.nom + '-photo.png'), png(photo));
    }
    const red = r.detail.redressee;
    if (red) {
      const pxR = red.largeur / s.verite.largeur;
      for (const o of s.verite.ouvertures) cadre(red, pxR, o, VERT, 2);
      for (const o of r.detail.photo ?? []) cadre(red, pxR, o, ROUGE, 1);
      writeFileSync(join(images, s.nom + '-redressee.png'), png(red));
    }
    // La fusion des vues (lot L13) : l'elevation fondue, son masque d'occlusion en magenta.
    const fu = r.detail.fusion;
    if (fu) {
      const e = { ...fu.elevation, donnees: fu.elevation.donnees.slice() };
      for (let k = 0; k < fu.occlusion.length; k++) if (fu.occlusion[k]) e.donnees.set([...MAGENTA, 255], k * 4);
      const pxF = e.largeur / s.verite.largeur;
      for (const o of s.verite.ouvertures) cadre(e, pxF, o, VERT, 2);
      for (const o of fu.ouvertures) cadre(e, pxF, o, ROUGE, 1);
      writeFileSync(join(images, s.nom + '-fusion.png'), png(e));
    }
  });
  console.log('\nimages ecrites dans', images);
}
