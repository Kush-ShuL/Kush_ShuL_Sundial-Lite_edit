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
//  Reflection filter stage 2, applying BRDF weight
//

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"

layout(location = 0) out vec4 texBuffer4;

#ifdef HELIAN_SR_RR
    layout(location = 1) out float srSpecularHitDistance;
    /*
    const int colortex14Format = R32F;
    */
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#ifdef HELIAN_SR_RR
    #include "/libs/OpaqueRRMaterial.glsl"
    #ifdef HALF_RES_REFLECTION
        layout(location=2) out vec2 rrMotion;
        uniform sampler2D colortex27;
        #include "/libs/ReflectionMotion.glsl"
    #endif
    #ifdef HELIAN_VOXEL_RT
        #include "/libs/ReflectionFilter.glsl"
    #endif
#endif
#if (defined REFLECTION && REFLECTION_MODE == 2) || (defined HELIAN_SR_RR && defined HALF_RES_REFLECTION)
    #include "/libs/ReflectionRange.glsl"
#endif

#ifdef HALF_RES_REFLECTION
void reflectionReceiver(ivec2 p,vec4 material,out vec3 n,out vec2 spec,out float id,out float depth) {
    n=getNormalTexel(p);
    spec=unpack2x8Bit(material.g);
    id=round(unpackM3P13(material.a).x*7.0);
    bool behind=false;
    #ifdef HELIAN_SR_RR
        behind=id==MAT_FORWARD_MODEL && srTexelFetchLow(colortex0,p,0).a<0.5;
        if (behind) {
            GbufferData m;readOpaqueRRMaterial(p,m);
            n=m.normal;spec=vec2(m.smoothness,m.metalness);id=m.materialID;
        }
    #endif
    float d=behind ? srTexelFetchLow(depthtex1,p,0).r : srTexelFetchLow(depthtex0,p,0).r;
    #ifdef LOD
        if (d>=1.0) {
            vec2 uv=(vec2(p)+0.5)/screenSize;
            depth=screenToViewDepthLod(behind ? getLodDepthSolid(uv) : getLodDepthWater(uv));
            return;
        }
    #endif
    depth=screenToViewDepth(d);
}
vec4 upscaleReflection(vec2 coord, ivec2 originTexel, vec4 originMaterialData) {
    ivec2 reflectionSize = srTextureSizeLow(colortex8, 0);
    vec2 reflectionPosition = coord * vec2(reflectionSize) - 0.5;
    ivec2 baseTexel = ivec2(floor(reflectionPosition));
    vec2 interpolation = fract(reflectionPosition);

    vec3 originNormal;vec2 originSpecular;float originMaterialID,originDepth;
    reflectionReceiver(originTexel,originMaterialData,originNormal,originSpecular,originMaterialID,originDepth);
    #ifdef HELIAN_SR_RR
        ivec2 bestTexel=ivec2(0);
        float bestWeight=0.0,bestDistance=0.0;
    #endif

    vec4 accumulation = vec4(0.0);
    float weightAccumulation = 0.0;
    for (int x = 0; x < 2; x++) {
        for (int y = 0; y < 2; y++) {
            ivec2 reflectionTexel = clamp(baseTexel + ivec2(x, y), ivec2(0), reflectionSize - 1);
            vec2 sampleCoord = (vec2(reflectionTexel) + 0.5) / vec2(reflectionSize);
            ivec2 sampleTexel = clamp(ivec2(sampleCoord * screenSize), ivec2(0), ivec2(screenSize) - 1);
            vec4 sampleMaterialData = srTexelFetchLow(colortex2, sampleTexel, 0);
            vec3 sampleNormal;vec2 sampleSpecular;float sampleMaterialID,sampleDepth;
            reflectionReceiver(sampleTexel,sampleMaterialData,sampleNormal,sampleSpecular,sampleMaterialID,sampleDepth);
            if (sampleMaterialID!=originMaterialID) continue;

            vec2 axisWeight = mix(vec2(1.0) - interpolation, interpolation, vec2(x, y));
            float surfaceWeight =
                pow(max(dot(originNormal,sampleNormal),0.0),32.0) *
                exp2(-64.0 * abs(originSpecular.x - sampleSpecular.x));
            float depthWeight = exp2(-abs(sampleDepth-originDepth)/max(0.025,0.015*originDepth));
            float weight = axisWeight.x * axisWeight.y * surfaceWeight * depthWeight;

            vec4 ray=texelFetch(colortex8,reflectionTexel,0);
            #ifdef HELIAN_SR_RR
                weight*=exp2(-32.0*abs(originSpecular.y-sampleSpecular.y));
                // Pick distance and motion from one matching ray, rather
                // than averaging foreground and background hit locations.
                if (ray.w>0.0 && weight>bestWeight) {
                    bestWeight=weight;bestTexel=reflectionTexel;bestDistance=ray.w;
                }
            #endif
            accumulation += ray * weight;
            weightAccumulation += weight;
        }
    }
    #ifdef HELIAN_SR_RR
        if (bestWeight>1e-5) {
            srSpecularHitDistance=clamp(bestDistance*far,0.0,65504.0);
            rrMotion=texelFetch(colortex27,bestTexel,0).xy;
        }
    #endif
    return accumulation / max(weightAccumulation, 1e-6);
}
#endif

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.xy);

    #ifdef HELIAN_SR_RR
        srSpecularHitDistance = 0.0;
        #ifdef HALF_RES_REFLECTION
            float guideDepth=srTexelFetchLow(depthtex0,texel,0).r;
            float guideID=round(unpackM3P13(srTexelFetchLow(colortex2,texel,0).a).x*7.0);
            bool behind=guideID==MAT_FORWARD_MODEL && srTexelFetchLow(colortex0,texel,0).a<0.5;
            if (behind) guideDepth=srTexelFetchLow(depthtex1,texel,0).r;
            if (guideID==MAT_HAND) guideDepth=decodeHandDepth(guideDepth);
            bool guideSky=guideDepth>=1.0;
            #ifdef LOD
                if (guideSky) {
                    guideDepth=1.0+(behind ? getLodDepthSolid(texcoord) : getLodDepthWater(texcoord));
                    guideSky=guideDepth>=2.0;
                }
            #endif
            rrMotion=srReflectionMotionVector(reflectionViewPosition(texcoord,guideDepth),guideSky);
            if (guideSky) srSpecularHitDistance=65504.0;
        #endif
    #endif
    vec3 reflectionColor = vec3(0.0);
    #ifdef REFLECTION
        #if REFLECTION_MODE == 2
            // Check the full-resolution receiver before the half-resolution upsample.
            // Otherwise neighbouring near-field hits bleed across the distance limit.
            #if defined HELIAN_SR_RR && defined HALF_RES_REFLECTION
            float primaryDepth=guideDepth;
            float primarySmoothness=behind ? srTexelFetchLow(colortex12,texel,0).a :
                unpack2x8Bit(srTexelFetchLow(colortex2,texel,0).g).x;
            #else
            float primaryDepth = srTexelFetchLow(depthtex0, texel, 0).r;
            #ifdef LOD
                if (primaryDepth == 1.0) primaryDepth += getLodDepthWater(texcoord);
            #endif
            if (primaryDepth < HELIAN_HAND_DEPTH_RANGE) {
                float id = round(unpackM3P13(srTexelFetchLow(colortex2, texel, 0).a).x * 7.0);
                if (id == MAT_HAND) primaryDepth = decodeHandDepth(primaryDepth);
            }
            float primarySmoothness=unpack2x8Bit(srTexelFetchLow(colortex2,texel,0).g).x;
            #endif
            if (primaryDepth == 1.0 || primaryDepth >= 2.0 ||
                primarySmoothness < RT_MIN_SMOOTHNESS ||
                !rtInRange(viewToWorldPos(reflectionViewPosition(texcoord, primaryDepth)))) {
                texBuffer4 = vec4(0.0);
                return;
            }
        #endif
        #ifdef HALF_RES_REFLECTION
            vec4 originData = vec4(0.0); // Filled only for reflective receivers below.
        #else
            vec4 originData = srTexelFetchScene(colortex4, texel, 0);
        #endif
        #ifdef HELIAN_SR_RR
            #if defined HELIAN_VOXEL_RT && !defined HALF_RES_REFLECTION
                originData = limitGlossyFirefly(originData,texel);
            #endif
            #ifndef HALF_RES_REFLECTION
                srSpecularHitDistance = clamp(originData.w * far, 0.0, 65504.0);
            #endif
        #endif
        #ifndef HALF_RES_REFLECTION
        if (originData.w > 1e-6)
        #endif
        {
            float waterDepth = srTexelFetchLow(depthtex0, texel, 0).r;
            float solidDepth = srTexelFetchLow(depthtex1, texel, 0).r;
            #ifdef LOD
                waterDepth += float(waterDepth == 1.0) * (getLodDepthWater(texcoord) - 1.0);
                solidDepth += float(solidDepth == 1.0) * (getLodDepthSolid(texcoord) - 1.0);
            #endif
            if (abs(waterDepth) < 1.0) {
                vec4 rawMaterialData = srTexelFetchLow(colortex2, texel, 0);
                vec2 materialData = unpack2x8Bit(rawMaterialData.g);
                float smoothness = materialData.x;
                float metalness = materialData.y;
                #ifdef HELIAN_SR_RR
                    if (round(unpackM3P13(rawMaterialData.a).x*7.0) == MAT_FORWARD_MODEL &&
                        srTexelFetchLow(colortex0,texel,0).a < 0.5) {
                        GbufferData background;
                        readOpaqueRRMaterial(texel, background);
                        smoothness = background.smoothness;
                        metalness = background.metalness;
                        waterDepth = solidDepth;
                    }
                #endif

                #ifdef LABPBR_F0
                    metalness = step(229.5 / 255.0, metalness);
                #endif
                float reflectionWeight = 1.0;
                if (waterDepth == solidDepth) {
                    float diffuseWeight = pow(1.0 - smoothness, 5.0);
                    #ifndef FULL_REFLECTION
                        diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(smoothness - (1.0 - smoothness) * (1.0 - 0.6666 * metalness), 0.0, 1.0));
                    #endif
                    reflectionWeight = 1.0 - diffuseWeight;
                }
                #ifdef HALF_RES_REFLECTION
                    if (reflectionWeight>0.0) originData=upscaleReflection(texcoord,texel,rawMaterialData);
                #endif

                if (reflectionWeight>0.0 && originData.w>1e-6) {
                    #if REFLECTION_FILTER > 0 && !defined HELIAN_SR_RR
                        float originReflectionDepth = originData.w;
                        float originSmoothness = smoothness;
                        if (originSmoothness < 0.9975 && originReflectionDepth > 1e-5) {
                            vec3 originNormal = getNormalTexel(texel);
                            float roughness = pow2(1.0 - originSmoothness);
                            float roughnessInv = 100.0 / max(roughness, 1e-5);
                            vec2 coordOffset = vec2(4.0 * clamp(roughness * 20.0, 0.0, 1.0) * (1.0 - exp(-sqrt(originReflectionDepth) * 50.0)));
                            coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;

                            vec3 accumulation = originData.rgb;
                            float weightAccumulation = 1.0;

                            for (int i = -REFLECTION_FILTER; i < REFLECTION_FILTER + 1; i++) {
                                for (int j = -REFLECTION_FILTER; j < REFLECTION_FILTER + 1; j++) {
                                    #ifdef HALF_RES_REFLECTION
                                        vec2 sampleCoord = texcoord + vec2(i, j) * coordOffset * texelSize;
                                        bool sampleInBounds = abs(i) + abs(j) > 0.5 && all(greaterThan(sampleCoord, vec2(0.0))) && all(lessThan(sampleCoord, vec2(1.0)));
                                        ivec2 sampleTexel = clamp(ivec2(sampleCoord * screenSize), ivec2(0), ivec2(screenSize) - 1);
                                    #else
                                        ivec2 sampleTexel = ivec2(texel + 0.5 + vec2(i, j) * coordOffset);
                                        bool sampleInBounds = abs(i) + abs(j) > 0.5 && all(greaterThanEqual(sampleTexel, ivec2(0))) && all(lessThan(sampleTexel, ivec2(screenSize)));
                                    #endif
                                    if (sampleInBounds) {
                                        #ifdef HALF_RES_REFLECTION
                                            vec4 sampleData = srTextureLodLow(colortex8, sampleCoord, 0.0);
                                        #else
                                            vec4 sampleData = srTexelFetchScene(colortex4, sampleTexel, 0);
                                        #endif
                                        float sampleReflectionDepth = sampleData.w;
                                        float sampleSmoothness = unpack2x8Bit(srTexelFetchLow(colortex2, sampleTexel, 0).g).x;

                                        vec3 sampleNormal = getNormalTexel(sampleTexel);

                                        float weight =
                                            exp2(
                                                roughnessInv * log2(max(dot(originNormal, sampleNormal), 1e-6)) +
                                                100.0 * log2(1.0 - abs(roughness - pow2(1.0 - sampleSmoothness))) -
                                                1.44269502 * abs(originReflectionDepth - sampleReflectionDepth) / (max(originReflectionDepth, sampleReflectionDepth) + 0.2) * originSmoothness
                                            ) *
                                            step(sampleSmoothness, 0.9975);
                                        weight = clamp(weight, 0.0, 1.0);

                                        accumulation += sampleData.rgb * weight;
                                        weightAccumulation += weight;
                                    }
                                }
                            }
                            originData.rgb = accumulation / weightAccumulation;
                        }
                    #endif

                    reflectionColor = originData.rgb * reflectionWeight;
                }
            }
        }
    #endif

    #if defined HELIAN_SR_RR && !defined HALF_RES_REFLECTION
        bool skyPixel = srTextureLodLow(depthtex0, texcoord, 0.0).r >= 1.0;
        #ifdef LOD
            skyPixel = skyPixel && getLodDepthWater(texcoord) >= 1.0;
        #endif
        if (skyPixel) srSpecularHitDistance = 65504.0;
    #endif
    texBuffer4 = vec4(reflectionColor, 0.0);
}

#ifdef HELIAN_SR_RR
    #ifdef HALF_RES_REFLECTION
        /* RENDERTARGETS: 4,14,15 */
    #else
        /* RENDERTARGETS: 4,14 */
    #endif
#else
/* DRAWBUFFERS:4 */
#endif
