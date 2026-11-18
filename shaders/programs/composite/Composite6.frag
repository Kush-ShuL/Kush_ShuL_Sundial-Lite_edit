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
//  DoF stage 1: Prepare depth texture for DOF
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out uint texBuffer6;

in vec2 texcoord;

// #define PARALLAX_DOF
#define DOF_DEPTH_TEXTURE depthtex1 // [depthtex0 depthtex1]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/SuperResolutionPrepare.glsl"

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.st);
    float screenDepth = srTextureLodLow(DOF_DEPTH_TEXTURE, texcoord, 0.0).x;
    float materialID = round(unpackM3P13(srTexelFetchLow(colortex2, texel, 0).a).x * 7.0);
    bool isHand = materialID == float(MAT_HAND);
    #ifdef CORRECT_DOF_HAND_DEPTH
        float handDepth = decodeHandDepth(screenDepth);
        if (isHand && abs(handDepth - 0.5) < 0.5) {
            screenDepth = handDepth;
        }
    #endif
    vec3 viewPos;
    #ifdef LOD
        if (screenDepth == 1.0) {
            viewPos = screenToViewPosLod(texcoord, getLodDepthWater(texcoord));
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, screenDepth);
        #ifdef PARALLAX_DOF
            float parallaxOffset = clamp(srTexelFetchScene(colortex3, texel, 0).w, 0.0, 1.0) * 0.2 * PARALLAX_DEPTH;
            vec3 normal = getGeoNormalTexel(texel);
            viewPos += viewPos * parallaxOffset / max(1e-5, -dot(viewPos, normal));
        #endif
        viewPos *= (1.0 - 2.0 * float(isHand));
    }
    texBuffer6 = floatBitsToUint(-viewPos.z);
    #ifdef HELIAN_SR_INPUTS
        srPrepareInputs(texel, texcoord);
    #endif
}

#ifdef HELIAN_SR_RR
/* RENDERTARGETS: 6,9,10,11,12,13 */
#elif defined HELIAN_SR_INPUTS
/* RENDERTARGETS: 6,9,10 */
#else
/* DRAWBUFFERS:6 */
#endif
