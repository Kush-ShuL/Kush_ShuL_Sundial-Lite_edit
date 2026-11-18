//     _________      __        __     ___       __     __________      ________        ______        __           
//    /  _____  \    |  |      |  |   |   \     |  |   |   _____  \    |__    __|      /  __  \      |  |          
//   /  /     \__\   |  |      |  |   |    \    |  |   |  |     \  \      |  |        /  /  \  \     |  |          
//  |  |             |  |      |  |   |  |  \   |  |   |  |      |  |     |  |       /  /    \  \    |  |          
//   \  \______      |  |      |  |   |  |\  \  |  |   |  |      |  |     |  |      |  |______|  |   |  |          
//    \______  \     |  |      |  |   |  | \  \ |  |   |  |      |  |     |  |      |   ______   |   |  |          
//           \  \    |  |      |  |   |  |  \  \|  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  ___       |  |   |  |      |  |   |  |   \  |  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  \  \_____/  /     \  \____/  /    |  |    \    |   |  |_____/  /    __|  |__    |  |      |  |   |  |_________ 
//   \_________/       \________/     |__|     \___|   |__________/    |________|   |__|      |__|   |____________|
//
//  General Public License v3.0. Copyright (C) 2026 GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Voxy transparent data blit
//

layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer1;
layout(location = 2) out vec4 texBuffer2;

uniform sampler2D colortex16;
uniform sampler2D colortex17;
uniform sampler2D colortex18;

#include "/libs/Uniform.glsl"

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.st);
    vec4 trasnparent = srTexelFetchLow(colortex16, texel, 0);
    float overlay = clamp(trasnparent.w * 1e+3, 0.0, 1.0) * float(srTexelFetchLow(depthtex1, texel, 0).r == 1.0);
    texBuffer0 = mix(srTexelFetchLow(colortex0, texel, 0), trasnparent, overlay);
    texBuffer1 = mix(srTexelFetchLow(colortex1, texel, 0), srTexelFetchLow(colortex17, texel, 0), overlay);
    texBuffer2 = mix(srTexelFetchLow(colortex2, texel, 0), srTexelFetchLow(colortex18, texel, 0), overlay);
}

/* DRAWBUFFERS:012 */
