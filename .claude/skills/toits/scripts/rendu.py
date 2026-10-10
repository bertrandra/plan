# La carte des hauteurs d'un batiment, comme la lit un couvreur : cellules MNH du bleu (bas, 5e
# centile sous le contour) au rouge (haut, 95e), le contour en noir, les corps en magenta, leur
# faitage (raccourci par les croupes) en noir avec sa hauteur, les soupcons du banc en legende.
#
#   python3 .claude/skills/toits/scripts/rendu.py [--montage planche.png] <cle|numero BD TOPO> ...
#
# Lit $TOITS_DOSSIER/q/<cle>.json (ecrit par banc.ts), ecrit q/<cle>.png ; --montage colle les
# images par quatre dans $TOITS_DOSSIER/<planche.png>, a ouvrir avec l'outil Read.
import json, sys, math, os
from PIL import Image, ImageDraw, ImageFont
S=os.environ.get('TOITS_DOSSIER','/tmp/toits').rstrip('/')+'/'
def couleur(z,a,b):
  t=max(0,min(1,(z-a)/max(0.1,b-a)))
  return (int(255*min(1,2*t)), int(255*(1-abs(2*t-1))), int(255*min(1,2*(1-t))))
def rendu(key, suffixe=''):
  d=json.load(open(S+'q/'+key+suffixe+'.json')); g=d['grille']; pts=d['pts']
  xs=[p['x'] for p in pts]; ys=[p['y'] for p in pts]
  x0,x1,y0,y1=min(xs)-1.5,max(xs)+1.5,min(ys)-1.5,max(ys)+1.5
  k=380/max(x1-x0,y1-y0); W=int((x1-x0)*k); H=int((y1-y0)*k)+40
  im=Image.new('RGB',(W,H),'white'); dr=ImageDraw.Draw(im)
  X=lambda x:(x-x0)*k; Y=lambda y:(y1-y)*k
  def dedans(x,y,P):
    c=False
    for i in range(len(P)):
      A=P[i]; B=P[(i+1)%len(P)]
      if (A['y']>y)!=(B['y']>y) and x < A['x']+(y-A['y'])*(B['x']-A['x'])/(B['y']-A['y']): c=not c
    return c
  zs=sorted(g['z'][j*g['nx']+i] for j in range(g['ny']) for i in range(g['nx']) if g['z'][j*g['nx']+i] is not None and g['z'][j*g['nx']+i]>0.5 and dedans(g['x0']+i*g['pas'],g['y0']-j*g['pas'],pts))
  a,b=(zs[int(0.05*len(zs))],zs[int(0.95*len(zs))-1]) if zs else (0,1)
  for j in range(g['ny']):
    for i in range(g['nx']):
      z=g['z'][j*g['nx']+i]
      if z is None or z<0.5: continue
      x=g['x0']+i*g['pas']; y=g['y0']-j*g['pas']
      if x0<x<x1 and y0<y<y1: dr.rectangle([X(x-0.25),Y(y+0.25),X(x+0.25),Y(y-0.25)],fill=couleur(z,a,b))
  dr.polygon([(X(p['x']),Y(p['y'])) for p in pts],outline='black',width=3)
  for c in d['corps']:
    q=c['pts']; dr.polygon([(X(p['x']),Y(p['y'])) for p in q],outline=(255,0,255),width=2)
    L=math.dist((q[0]['x'],q[0]['y']),(q[1]['x'],q[1]['y'])); Wd=math.dist((q[0]['x'],q[0]['y']),(q[3]['x'],q[3]['y']))
    u=((q[1]['x']-q[0]['x'])/L,(q[1]['y']-q[0]['y'])/L); v=((q[3]['x']-q[0]['x'])/Wd,(q[3]['y']-q[0]['y'])/Wd)
    P=lambda s,t:(X(q[0]['x']+u[0]*s+v[0]*t),Y(q[0]['y']+u[1]*s+v[1]*t))
    h0,h1=(c.get('croupes') or [0,0])
    if c['faitage']-min(c['egouts'])>0.05: dr.line([P(h0,c['posFaitage']),P(L-h1,c['posFaitage'])],fill='black',width=3)
    cx,cy=P(L/2,Wd/2); dr.text((cx-14,cy-6),f"{c['faitage']}",fill='black')
  dr.text((4,H-36),f"{key} {a:.1f}->{b:.1f} m",fill='black'); dr.text((4,H-20),', '.join(d['pb'])[:70],fill='black')
  im.save(S+'q/'+key+suffixe+'.png')
def montage(sortie, cles):
  ims=[Image.open(S+'q/'+k+'.png') for k in cles]
  W=max(i.width for i in ims); H=max(i.height for i in ims)
  m=Image.new('RGB',(W*4,H*((len(ims)+3)//4)),'white')
  for n,i in enumerate(ims): m.paste(i,((n%4)*W,(n//4)*H))
  m.save(S+sortie)

args=sys.argv[1:]
sortie=None
if args[:1]==['--montage']: sortie=args[1]; args=args[2:]
cles=[a if a.startswith('bati-') else 'bati-batiment-'+a for a in args]
for key in cles: rendu(key)
if sortie: montage(sortie, cles)
