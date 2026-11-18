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
    #ifdef HELIAN_VOXEL_RT
        #include "/libs/ReflectionFilter.glsl"
    #endif
#endif
#if defined REFLECTION && REFLECTION_MODE == 2
    #include "/libs/ReflectionRange.glsl"
#endif

#ifdef HALF_RES_REFLECTION
float reflectionReceiverDepth(ivec2 p) {
    float d = srTexelFetchLow(depthtex0, p, 0).r;
    #ifdef LOD
        if (d >= 1.0) return screenToViewDepthLod(getLodDepthWater((vec2(p)+0.5)/screenSize));
    #endif
    return screenToViewDepth(d);
}
vec4 upscaleReflection(vec2 coord, ivec2 originTexel, vec4 originMaterialData) {
    ivec2 reflectionSize = srTextureSizeLow(colortex8, 0);
    vec2 reflectionPosition = coord * vec2(reflectionSize) - 0.5;
    ivec2 baseTexel = ivec2(floor(reflectionPosition));
    vec2 interpolation = fract(reflectionPosition);

    vec3 originNormal = getNormalTexel(originTexel);
    vec2 originSpecular = unpack2x8Bit(originMaterialData.g);
    float originMaterialID = round(unpackM3P13(originMaterialData.a).x * 7.0);
    float originDepth = reflectionReceiverDepth(originTexel);

    vec4 accumulation = vec4(0.0);
    float weightAccumulation = 0.0;
    for (int x = 0; x < 2; x++) {
        for (int y = 0; y < 2; y++) {
            ivec2 reflectionTexel = clamp(baseTexel + ivec2(x, y), ivec2(0), reflectionSize - 1);
            vec2 sampleCoord = (vec2(reflectionTexel) + 0.5) / vec2(reflectionSize);
            ivec2 sampleTexel = clamp(ivec2(sampleCoord * screenSize), ivec2(0), ivec2(screenSize) - 1);
            vec4 sampleMaterialData = srTexelFetchLow(colortex2, sampleTexel, 0);
            vec2 sampleSpecular = unpack2x8Bit(sampleMaterialData.g);
            float sampleMaterialID = round(unpackM3P13(sampleMaterialData.a).x * 7.0);

            vec2 axisWeight = mix(vec2(1.0) - interpolation, interpolation, vec2(x, y));
            float surfaceWeight =
                pow(max(dot(originNormal, getNormalTexel(sampleTexel)), 0.0), 32.0) *
                exp2(-64.0 * abs(originSpecular.x - sampleSpecular.x)) *
                step(abs(originMaterialID - sampleMaterialID), 0.25);
            float depthWeight = exp2(-abs(reflectionReceiverDepth(sampleTexel) - originDepth) / max(0.025, 0.015 * originDepth));
            float weight = axisWeight.x * axisWeight.y * surfaceWeight * depthWeight;

            accumulation += srTexelFetchLow(colortex8, reflectionTexel, 0) * weight;
            weightAccumulation += weight;
        }
    }
    return accumulation / max(weightAccumulation, 1e-6);
}
#endif

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.xy);

    #ifdef HELIAN_SR_RR
        srSpecularHitDistance = 0.0;
    #endif
    vec3 reflectionColor = vec3(0.0);
    #ifdef REFLECTION
        #if REFLECTION_MODE == 2
            // Check the full-resolution receiver before the half-resolution upsample.
            // Otherwise neighbouring near-field hits bleed across the distance limit.
            float primaryDepth = srTexelFetchLow(depthtex0, texel, 0).r;
            #ifdef LOD
                if (primaryDepth == 1.0) primaryDepth += getLodDepthWater(texcoord);
            #endif
            if (primaryDepth < HELIAN_HAND_DEPTH_RANGE) {
                float id = round(unpackM3P13(srTexelFetchLow(colortex2, texel, 0).a).x * 7.0);
                if (id == MAT_HAND) primaryDepth = decodeHandDepth(primaryDepth);
            }
            if (primaryDepth == 1.0 || primaryDepth >= 2.0 ||
                unpack2x8Bit(srTexelFetchLow(colortex2, texel, 0).g).x < RT_MIN_SMOOTHNESS ||
                !rtInRange(viewToWorldPos(reflectionViewPosition(texcoord, primaryDepth)))) {
                texBuffer4 = vec4(0.0);
                return;
            }
        #endif
        #ifdef HALF_RES_REFLECTION
            vec4 originData = srTextureLodLow(colortex8, texcoord, 0.0);
        #else
            vec4 originData = srTexelFetchScene(colortex4, texel, 0);
        #endif
        #ifdef HELIAN_SR_RR
            #ifdef HELIAN_VOXEL_RT
                originData = limitGlossyFirefly(originData,texel);
            #endif
            srSpecularHitDistance = clamp(originData.w * far, 0.0, 65504.0);
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

                #ifdef HALF_RES_REFLECTION
                    originData = upscaleReflection(texcoord, texel, rawMaterialData);
                #endif

                if (originData.w > 1e-6) {
                    #ifdef LABPBR_F0
                        metalness = step(229.5 / 255.0, metalness);
                    #endif
                    float reflectionWeight = 1.0;
                    if (waterDepth == solidDepth) {
                        float diffuseWeight = pow(1.0 - smoothness, 5.0);
                        #ifndef FULL_REFLECTION
                            diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(smoothness - (1.0 - smoothness) * (1.0 - 0.6666 * metalness), 0.0, 1.0));
                        #endif
                        reflectionWeight *= 1.0 - diffuseWeight;
                    }

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

    #ifdef HELIAN_SR_RR
        bool skyPixel = srTextureLodLow(depthtex0, texcoord, 0.0).r >= 1.0;
        #ifdef LOD
            skyPixel = skyPixel && getLodDepthWater(texcoord) >= 1.0;
        #endif
        if (skyPixel) srSpecularHitDistance = 65504.0;
    #endif
    texBuffer4 = vec4(reflectionColor, 0.0);
}

#ifdef HELIAN_SR_RR
/* RENDERTARGETS: 4,14 */
#else
/* DRAWBUFFERS:4 */
#endif
