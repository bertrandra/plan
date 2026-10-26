const t={temps:{value:0},force:{value:0}};function v(e,o){t.force.value=e?1:0,t.temps.value=o/1e3}const i=.035,r=.006;function a(e){return`
    #ifdef USE_INSTANCING
      vec3 ventPied = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
    #else
      vec3 ventPied = vec3(0.0);
    #endif
    float ventH = clamp(position.y / uVentHauteur, 0.0, 1.0);
    float ventPhase = ventPied.x * 0.35 + ventPied.z * 0.27;
    float ventRafale = 0.6 + 0.4 * sin(uVentTemps * 0.35 + ventPhase * 0.5);
    float ventBalancier = 0.6 * sin(uVentTemps * 1.25 + ventPhase) + 0.4 * sin(uVentTemps * 2.1 + ventPhase * 1.7);
    float ventAmp = uVentForce * uVentSouplesse * ventRafale * ventH * ventH * ${i.toFixed(4)} * uVentHauteur;
    transformed.x += ventAmp * ventBalancier;
    transformed.z += ventAmp * 0.6 * cos(uVentTemps * 1.1 + ventPhase);
    ${e?`float ventFeuille = uVentForce * uVentSouplesse * ventH * ${r.toFixed(4)} * uVentHauteur;
    transformed += ventFeuille * vec3(sin(uVentTemps * 5.0 + dot(position, vec3(12.9, 7.2, 9.1))), 0.5 * sin(uVentTemps * 4.1 + dot(position, vec3(5.3, 11.7, 3.9))), cos(uVentTemps * 4.3 + position.x * 9.0));`:""}
  `}function l(e,o,s,u){!e||typeof e!="object"||(e.onBeforeCompile=n=>{n.uniforms.uVentTemps=t.temps,n.uniforms.uVentForce=t.force,n.uniforms.uVentHauteur={value:Math.max(.001,o)},n.uniforms.uVentSouplesse={value:s},n.vertexShader=`uniform float uVentTemps;
uniform float uVentForce;
uniform float uVentHauteur;
uniform float uVentSouplesse;
`+n.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
`+a(u))},e.customProgramCacheKey=()=>"vent-"+(u?"feuilles":"bois"),e.needsUpdate=!0)}export{l as h,v as r};
