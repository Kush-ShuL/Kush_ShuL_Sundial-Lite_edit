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
//  Reflection filter stage 1
//

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"

#ifdef HALF_RES_REFLECTION
    layout(location = 0) out vec4 texBuffer8;
#else
    layout(location = 0) out vec4 texBuffer4;
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionFilter.glsl"

void main() {
    #ifdef HELIAN_SR_ACTIVE
        #ifdef HALF_RES_REFLECTION
            if (any(greaterThanEqual(gl_FragCoord.xy, vec2(srTextureSizeLow(colortex8, 0))))) discard;
        #else
            if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
        #endif
    #endif
    #ifdef HALF_RES_REFLECTION
        ivec2 texel = ivec2(gl_FragCoord.xy);
    #else
        ivec2 texel = ivec2(texcoord * screenSize);
    #endif
    vec4 reflectionColor = getReflectionTexel(texel);
    #ifdef HELIAN_VOXEL_RT
        reflectionColor = limitGlossyFirefly(reflectionColor,texel);
    #endif
    #ifndef HELIAN_SR_RR
    if (reflectionColor.w > 1e-6) {
        float depth = getWaterDepth(texcoord);
        #ifdef LOD
            depth += float(depth == 1.0) * (getLodDepthWater(texcoord) - 1.0);
        #endif
        if (abs(depth) < 1.0) {
            reflectionColor = reflectionFilter(reflectionColor, texel, 6.0, false);
        }
    }
    #endif
    #ifdef HALF_RES_REFLECTION
        texBuffer8 = reflectionColor;
    #else
        texBuffer4 = reflectionColor;
    #endif
}

#ifdef HALF_RES_REFLECTION
/* DRAWBUFFERS:8 */
#else
/* DRAWBUFFERS:4 */
#endif
