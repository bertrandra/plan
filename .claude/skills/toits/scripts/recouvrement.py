# La part de chaque corps couverte par les autres corps du meme batiment (echantillon 10 x 10) :
# a 1,0, le corps est entierement sous d'autres - redondant s'il est plus bas, une excroissance
# en 3D s'il est plus haut (le plus haut l'emporte). Les rectangles du contour se chevauchent par
# construction (une aile qui penetre un corps) ; des bandes de 2 m couvertes a 100 % ne le sont pas.
#
#   python3 .claude/skills/toits/scripts/recouvrement.py <cle|numero BD TOPO> ...
import json, os, sys
S=os.environ.get('TOITS_DOSSIER','/tmp/toits').rstrip('/')+'/'
def dedans(x,y,P):
  c=False
  for i in range(len(P)):
    A=P[i]; B=P[(i+1)%len(P)]
    if (A['y']>y)!=(B['y']>y) and x < A['x']+(y-A['y'])*(B['x']-A['x'])/(B['y']-A['y']): c=not c
  return c
for a in sys.argv[1:]:
  k=a if a.startswith('bati-') else 'bati-batiment-'+a
  cs=json.load(open(S+'q/'+k+'.json'))['corps']; out=[]
  for i,c in enumerate(cs):
    q=c['pts']; n=0
    for u in range(10):
      for v in range(10):
        s=(u+0.5)/10; t=(v+0.5)/10
        x=q[0]['x']+(q[1]['x']-q[0]['x'])*s+(q[3]['x']-q[0]['x'])*t; y=q[0]['y']+(q[1]['y']-q[0]['y'])*s+(q[3]['y']-q[0]['y'])*t
        n+=any(dedans(x,y,o['pts']) for j,o in enumerate(cs) if j!=i)
    out.append(n/100)
  print(k, out)
