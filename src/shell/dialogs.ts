// Boites de dialogue et notifications (spec §3.2, ui/dialogs.ts).
//
// Pourquoi ces remplacements maison plutot que alert()/confirm()/prompt() : les dialogues natifs
// sont silencieusement bloques dans une iframe en bac a sable (certains apercus integres), ce qui
// fait qu'une action semble « ne pas marcher » sans la moindre erreur visible. Ceux-ci
// fonctionnent quel que soit le contexte.
//
// Aucune de ces fonctions ne touche au plan ni au rendu : c'est ce qui permet de les sortir
// maintenant, alors que le reste de ui/** attend que render/** soit sorti (spec §4, phase 5).

// ================= Identite de version (voir MD/RELEASE.md) =================
// Trois contrats independants, trois numeros : l'application (SemVer), le schema du fichier de
// projet (entier monotone) et l'API (prefixe de route). Ils sont declares ici, tout en haut du
// premier script, parce que les appels reseau du boot les estampillent deja.
// Pas de build ni de depot git a ce stade : le "build id" se reduit a la date de figeage du
// fichier mono-page. Il identifie l'artefact, pas un contrat (RELEASE.md 5.1).
export function showErrBanner(msg: string): void {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#a02020;color:#fff;padding:10px 14px;font-family:monospace;font-size:12px;z-index:9999;white-space:pre-wrap;max-height:40vh;overflow:auto;';
  box.textContent = 'Erreur JS: ' + msg;
  document.body.appendChild(box);
}

// Native window.alert()/confirm() are silently blocked in sandboxed iframes (e.g. some
// preview embeds), which makes actions relying on them appear to "not work" with no
// visible error. These in-page replacements work regardless of iframe sandboxing.
export function showToast(msg: string): void {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#2b2118; color:#fff; padding:10px 18px; border-radius:6px; font-family:"Helvetica Neue",Arial,sans-serif; font-size:0.85rem; z-index:9998; box-shadow:0 2px 10px rgba(0,0,0,0.3); max-width:80vw; text-align:center;';
  box.textContent = msg;
  document.body.appendChild(box);
  const duration = Math.min(9000, Math.max(3200, msg.length*60));
  setTimeout(()=>{ box.style.transition='opacity 0.4s'; box.style.opacity='0'; setTimeout(()=>box.remove(),400); }, duration);
}

// Blocking, user-facing screen for a project-load failure (as opposed to showErrBanner, which
// is the developer-facing red strip for uncaught JS errors). Offers a real retry instead of
// silently swapping in demo data, so a temporary API hiccup never looks like project loss.
export function showProjectLoadError(err: { reason?: string } | null): void {
  const reasonLabels = {
    network: 'Le serveur du projet est injoignable (probleme reseau).',
    server: 'Le serveur du projet a repondu par une erreur.',
    notfound: 'Le projet demande est introuvable sur le serveur.',
    badjson: 'La reponse du serveur est illisible (donnees corrompues).'
  };
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.55); z-index:9999; display:flex; align-items:center; justify-content:center; font-family:"Helvetica Neue",Arial,sans-serif;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff; color:#222; padding:24px 26px; border-radius:8px; max-width:420px; box-shadow:0 4px 24px rgba(0,0,0,0.35); text-align:center;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600; margin-bottom:8px; font-size:1.05rem;';
  title.textContent = 'Chargement du projet impossible';
  const msg = document.createElement('div');
  msg.style.cssText = 'margin-bottom:16px; font-size:0.9rem; line-height:1.4; color:#444;';
  msg.textContent = (reasonLabels[err && err.reason] || 'Une erreur est survenue lors du chargement du projet.') +
    ' Le projet de demonstration n\'a pas ete charge a la place, pour eviter de donner l\'impression que votre projet a ete perdu ou remplace.';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button'; retryBtn.textContent = 'Réessayer';
  retryBtn.style.cssText = 'padding:8px 18px; border-radius:4px; border:none; background:#2b2118; color:#fff; cursor:pointer; font-size:0.9rem;';
  retryBtn.addEventListener('click', ()=>location.reload());
  box.appendChild(title); box.appendChild(msg); box.appendChild(retryBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// Escapes text for safe insertion into HTML built via string concatenation (e.g. document.write
// in the print window below). Any user-editable field (object name, in particular) must go
// through this before being interpolated into markup - otherwise a name containing '</title>
// <script>...' or similar would be interpreted as HTML/script in the printed window.
export function showConfirm(msg: string, onConfirm: () => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:20px 22px; border-radius:8px; max-width:360px; font-family:"Helvetica Neue",Arial,sans-serif; box-shadow:0 4px 24px rgba(0,0,0,0.3);';
  const p = document.createElement('div');
  p.style.cssText = 'margin-bottom:16px; font-size:0.92rem; line-height:1.4;';
  p.textContent = msg;
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary'; cancelBtn.textContent = 'Annuler';
  const okBtn = document.createElement('button');
  okBtn.textContent = 'Confirmer';
  okBtn.style.cssText = 'background:#a02020; border-color:#a02020;';
  cancelBtn.addEventListener('click', ()=>overlay.remove());
  okBtn.addEventListener('click', ()=>{ overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
  box.appendChild(p); box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

export function showPrompt(msg: string, defaultValue: string, onSubmit: (valeur: string) => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:20px 22px; border-radius:8px; max-width:360px; width:90vw; font-family:"Helvetica Neue",Arial,sans-serif; box-shadow:0 4px 24px rgba(0,0,0,0.3);';
  const p = document.createElement('div');
  p.style.cssText = 'margin-bottom:2px; font-size:0.92rem; line-height:1.4;';
  p.textContent = msg;
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'promptInput'; input.value = defaultValue || '';
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:14px;';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary'; cancelBtn.textContent = 'Annuler';
  const okBtn = document.createElement('button');
  okBtn.textContent = 'Valider';
  const submit = ()=>{ const v = input.value.trim(); overlay.remove(); if(v) onSubmit(v); };
  cancelBtn.addEventListener('click', ()=>overlay.remove());
  okBtn.addEventListener('click', submit);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); if(e.key==='Escape') overlay.remove(); });
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
  box.appendChild(p); box.appendChild(input); box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  input.focus(); input.select();
}

