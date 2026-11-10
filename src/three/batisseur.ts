// Des quads et des polygones accumules en une seule maille, par groupes de materiau : une maille par
// detail du batiment, pas par face (three/detailsBatiment.ts, three/detailsOuvertures.ts).

import type * as THREE_NS from 'three';

/** Un point en coordonnees Three. */
export type S3 = [number, number, number];

/** Des quads accumules en une seule maille, par groupes de materiau : une maille par detail, pas par face. */
export class Batisseur {
  positions: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  groupes: { debut: number; compte: number; materiau: number }[] = [];
  private debutGroupe = 0;

  /** Un quadrilatere `a b c d` (deux triangles), avec ses coordonnees de texture s'il en a. */
  quad(a: S3, b: S3, c: S3, d: S3, uv?: number[]): void {
    const k = this.positions.length / 3;
    this.positions.push(...a, ...b, ...c, ...d);
    this.uvs.push(...(uv ?? [0, 0, 0, 0, 0, 0, 0, 0]));
    this.indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }

  /** Un polygone convexe, en eventail depuis son premier sommet (baie cintree, oeil-de-boeuf). */
  polygone(pts: readonly S3[]): void {
    if (pts.length < 3) return;
    const k = this.positions.length / 3;
    pts.forEach((p) => {
      this.positions.push(...p);
      this.uvs.push(0, 0);
    });
    for (let i = 1; i + 1 < pts.length; i++) this.indices.push(k, k + i, k + i + 1);
  }

  /** Clot le groupe en cours : ce qui a ete ajoute depuis le dernier prend ce materiau. */
  groupe(materiau: number): void {
    const compte = this.indices.length - this.debutGroupe;
    if (compte > 0) this.groupes.push({ debut: this.debutGroupe, compte, materiau });
    this.debutGroupe = this.indices.length;
  }

  get vide(): boolean {
    return this.indices.length === 0;
  }

  maillage(materiaux: THREE_NS.Material[], nom: string): THREE_NS.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setIndex(this.indices);
    this.groupes.forEach((g) => geo.addGroup(g.debut, g.compte, g.materiau));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materiaux);
    m.name = nom;
    return m;
  }
}
