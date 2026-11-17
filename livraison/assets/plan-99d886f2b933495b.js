function h(e,o=0){if(!e.length)return o;const t=[...e].sort((r,s)=>r-s),n=Math.floor(t.length/2);return t.length%2?t[n]:(t[n-1]+t[n])/2}export{h as m};
