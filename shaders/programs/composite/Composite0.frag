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
//  Reflection
//

#extension GL_ARB_gpu_shader5 : enable
#include "/settings/ReflectionSettings.glsl"
#ifdef HELIAN_VOXEL_RT
    #extension GL_ARB_shading_language_packing : require
#endif

in vec2 texcoord;

#define CLOUD_IN_REFLECTION
#define SCREEN_SPACE_REFLECTION_STEP 16 // [2 3 4 5 6 7 8 10 12 14 16 20 24 28 32]
#define SCREEN_SPACE_REFLECTION_REFINEMENTS 5 // [1 2 3 4 5 6 8 10]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"

#ifdef HALF_RES_REFLECTION
    layout(location = 0) out vec4 texBuffer8;
#else
    layout(location = 0) out vec4 texBuffer4;
#endif

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

#ifdef THE_END
    #include "/libs/Galaxy.glsl"
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionRange.glsl"
#include "/libs/ReflectionScreenTrace.glsl"
#ifdef HELIAN_VOXEL_RT
    #include "/libs/ReflectionRayTrace.glsl"
#endif

#ifdef HELIAN_SR_RR
    #include "/libs/OpaqueRRMaterial.glsl"
    layout(location = 1) out vec2 srSpecularMotion;
    /*
    const int colortex15Format = RG16F;
    const int colortex27Format = RG16F;
    */

    #include "/libs/ReflectionMotion.glsl"
#endif


vec3 reflectionWeight(vec3 viewDir, vec3 lightDir, vec3 f0, vec3 f82) {
    float LdotH2 = clamp(dot(-viewDir, lightDir) * 0.5 + 0.5, 0.0, 1.0);
    if (f0.x < 0.0) {
        f0 = vec3(0.02);
        LdotH2 = clamp(1.777777 * LdotH2 - 0.777777, 0.0, 1.0);
    }
    vec3 F = F_AdobeF82(f0, f82, sqrt(LdotH2));
    return F;
}

// https://www.shadertoy.com/view/MX3XDf MIT Licence
// Did some trick to prevent NaN when normal is vec3(0.0, 0.0, -1.0)
vec3 IsotropicGGX(vec2 u, vec3 wi, float alpha, vec3 n, float NdotV, out float pdfRatio)
{
    //preliminary variables
    float a2 = alpha * alpha;
    float z2 = NdotV * NdotV;
    // warp to the hemisphere configuration
    vec3 wiStd = mix(wi, NdotV * n, vec3(1.0 + alpha));
    float t = inversesqrt((1.0 - z2) * a2 + z2);
    wiStd *= t;
    NdotV *= t;
    //compute lower bound for scaling
    float s = 1. + sqrt(1.0 - z2);
    float s2 = s * s;
    float k = (s2 - a2 * s2) / (s2 + a2 * z2);
    //calculate ratio of bounded and unbounded vndf
    pdfRatio = (k * NdotV + 1.0) / (NdotV + 1.0);
    //construct spherical cap
    vec3 cStd;
    float b = k * dot(wiStd, n); //z axis
    float inversed = signI(n.z);
    cStd.z = (1.0 - u.y - u.y * b) * inversed;
    const float tau = 6.2831853; // 2 * pi
    float phi = tau * u.x;
    cStd.x = cos(phi);
    cStd.y = sin(phi);
    cStd.xy *= sqrt(clamp(1. - cStd.z * cStd.z, 0.0, 1.0));
    //reflect sample to align with normal
    vec3 wr = vec3(n.xy, n.z + inversed);
    vec3 c = (dot(wr, cStd) / abs(wr.z)) * wr - cStd;
    // compute halfway direction as standard normal
    vec3 wmStd = c + wiStd;
    vec3 wmStd_z = n * dot(n, wmStd);
    vec3 wmStd_xy = wmStd_z - wmStd;
    // warp back to the ellipsoid configuration
    return normalize(wmStd_z + alpha * wmStd_xy);
}

vec3 directionDistribution(vec2 noise, vec3 normal, vec3 viewDir, float roughness, float NdotV, out float pdfRatio) {
    vec3 direction;
    // A mirror does not need a stochastic lobe. Avoid zero * NaN at normal
    // incidence and subpixel direction noise on nearly smooth water/glass.
    if (roughness <= 1e-4) {
        pdfRatio = 1.0;
        return reflect(viewDir, normal);
    }
    #ifdef FULL_REFLECTION
        vec3 distributedNormal = IsotropicGGX(noise, -viewDir, roughness, normal, NdotV, pdfRatio);
        direction = reflect(viewDir, distributedNormal);
    #else
        vec3 rayDir = reflect(viewDir, normal);
        float distributionAngle = 2 * PI * noise.x;
        vec3 distributionDir1 = cross(rayDir, viewDir);
        float tangentLength2 = dot(distributionDir1, distributionDir1);
        if (tangentLength2 < 1e-6) {
            vec3 axis = abs(rayDir.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
            distributionDir1 = cross(rayDir, axis);
            tangentLength2 = dot(distributionDir1, distributionDir1);
        }
        distributionDir1 *= inversesqrt(max(tangentLength2, 1e-8));
        vec3 distributionDir2 = sin(distributionAngle) * cross(rayDir, distributionDir1);
        vec3 distributionDir = cos(distributionAngle) * distributionDir1 + distributionDir2 * NdotV;
        float distributionStrength = noise.y * roughness;
        direction = normalize(distributionDir * distributionStrength + rayDir);
        pdfRatio = 1.0;
    #endif
    return direction;
}

vec4 reflectionSample(GbufferData gbufferData, vec3 f0, vec3 f82, float firstWeight,
                      vec3 viewPos, vec3 viewDir, vec2 noise, bool useRt) {
    float basicRoughness = pow2(1.0 - gbufferData.smoothness);
    float NdotV = clamp(dot(-viewDir, gbufferData.normal), 0.0, 1.0);
    float pdfRatio;
    vec3 rayDir = directionDistribution(noise, gbufferData.normal, viewDir, basicRoughness, NdotV, pdfRatio);
    rayDir += gbufferData.geoNormal * 2.0 * clamp(-dot(rayDir, gbufferData.geoNormal), 0.0, 1.0);

    vec3 brdfWeight = reflectionWeight(viewDir, rayDir, f0, f82) * pdfRatio;
    vec3 totalWeight = brdfWeight * firstWeight;
    vec4 reflectionColor = vec4(0.0);
    if (dot(totalWeight, totalWeight) > 1e-6) {
        vec3 worldPos = viewToWorldPos(viewPos);
        vec3 worldRay = normalize(mat3(gbufferModelViewInverse) * rayDir);
        vec3 hitView;
        #ifdef HELIAN_VOXEL_RT
            if (useRt) reflectionColor = traceVoxelReflection(worldPos, worldRay, hitView);
        #endif
        #if REFLECTION_MODE != 2
            if (reflectionColor.w == 0.0) reflectionColor = traceScreenReflection(viewPos, rayDir, hitView);
        #endif
        bool hitSky = reflectionColor.w == 0.0;
        rayDir = worldRay;
        if (!hitSky) {
            #ifdef HELIAN_SR_RR
                vec3 virtualHit = hitView - 2.0 * dot(hitView - viewPos, gbufferData.normal) * gbufferData.normal;
                srSpecularMotion = mix(srReflectionMotionVector(virtualHit, false),
                                       srReflectionMotionVector(viewPos, false), basicRoughness);
            #endif
        } else {
            #if REFLECTION_MODE == 2
                return vec4(0.0);
            #else
            vec4 intersectionData = planetIntersectionData(worldPos, rayDir);
            #ifdef HELIAN_SR_RR
                vec3 viewRay = mat3(gbufferModelView) * rayDir;
                srSpecularMotion = srReflectionMotionVector(reflect(viewRay, gbufferData.normal), true);
            #endif
            float rayLength = 114514.0;
            reflectionColor = vec4(vec3(0.0), rayLength);
            #ifdef SHADOW_AND_SKY
                #ifdef LIGHT_LEAKING_FIX
                if (eyeBrightnessSmooth.y>0) {
                #endif
                vec3 atmosphere;
                reflectionColor.rgb = singleAtmosphereScattering(vec3(0.0), worldPos, rayDir, sunDirection, intersectionData, 30.0, atmosphere);
                vec4 planeCloud = vec4(0.0);
                #ifdef PLANE_CLOUD
                    planeCloud = planeClouds(worldPos, rayDir, sunDirection, skyColorUp, intersectionData.xyz);
                    reflectionColor.rgb = mix(reflectionColor.rgb, planeCloud.rgb, planeCloud.a * float(worldPos.y + cameraPosition.y < PLANE_CLOUD_HEIGHT));
                #endif
                #ifdef CLOUD_IN_REFLECTION
                    float cloudDepth;
                    reflectionColor.rgb = sampleClouds(reflectionColor.rgb, atmosphere, worldPos, rayDir, shadowDirection, sunDirection, skyColorUp, intersectionData.xyz, 0.0, cloudDepth).rgb;
                #endif
                if (worldPos.y + cameraPosition.y >= PLANE_CLOUD_HEIGHT) {
                    reflectionColor.rgb = mix(reflectionColor.rgb, planeCloud.rgb, planeCloud.a);
                }
                #ifdef LIGHT_LEAKING_FIX
                    reflectionColor.rgb *= clamp(eyeBrightnessSmooth.y / 16.0, 0.0, 1.0);
                }
                #endif
            #endif
            #endif
        }
        if (isEyeInWater == 0) {
            #ifdef THE_END
                reflectionColor.rgb = endFogTotal(reflectionColor.rgb, reflectionColor.w);
                if (hitSky) {
                    reflectionColor.rgb += endStars(rayDir) * exp2(50.0 * (gbufferData.smoothness - 1.0));
                }
            #elif defined NETHER
                reflectionColor.rgb = netherFogTotal(reflectionColor.rgb, reflectionColor.w);
            #else
                reflectionColor.rgb *= airAbsorption(reflectionColor.w);
                #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                    float atmosphereLength = mix(reflectionColor.w * (ASF_GE_DENSITY_INREFL + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 400.0, float(hitSky));
                    reflectionColor.rgb = solidAtmosphereScattering(reflectionColor.rgb, rayDir, skyColorUp, atmosphereLength, gbufferData.lightmap.y);
                #endif
            #endif
        }
        else if (isEyeInWater == 1) {
            reflectionColor.rgb = waterFogTotal(reflectionColor.rgb, rayDir, skyColorUp, reflectionColor.w, eyeBrightnessSmooth.y / 240.0);
        }
        else if (isEyeInWater == 2) {
            reflectionColor.rgb = lavaFogTotal(reflectionColor.rgb, reflectionColor.w);
        }
        else if (isEyeInWater == 3) {
            reflectionColor.rgb = snowFogTotal(reflectionColor.rgb, skyColorUp, reflectionColor.w, eyeBrightnessSmooth.y / 240.0);
        }
        reflectionColor.rgb = max(vec3(0.0), reflectionColor.rgb * brdfWeight);
        #ifdef HELIAN_SR_RR
            reflectionColor.w = min(65504.0, reflectionColor.w) / far;
        #else
            reflectionColor.w = min(2.0, reflectionColor.w / far);
        #endif
    }
    return reflectionColor;
}

vec4 reflection(GbufferData surface, vec3 f0, vec3 f82, float firstWeight, vec2 receiverUV) {
    vec3 viewPos = reflectionViewPosition(receiverUV, surface.depth);
    vec3 viewDir = normalize(viewPos);
    vec3 biasedView = viewPos + surface.geoNormal * 0.003;
    bool useRt = false;
    #ifdef HELIAN_VOXEL_RT
        useRt = surface.smoothness >= RT_MIN_SMOOTHNESS && rtInRange(viewToWorldPos(viewPos))
             && rtInRange(viewToWorldPos(biasedView));
        #if REFLECTION_MODE == 2
            if (!useRt) return vec4(0.0);
        #endif
    #endif
    uint noiseFrame = uint(frameCounter);
    #if defined HELIAN_SR_ACTIVE || !defined TAA
        noiseFrame = 0u;
    #endif
    #ifdef HALF_RES_REFLECTION
        NoiseGenerator rng = initNoiseGenerator(uvec2(receiverUV * screenSize), noiseFrame);
    #else
        NoiseGenerator rng = initNoiseGenerator(uvec2(gl_FragCoord.st), noiseFrame);
    #endif
    vec2 seed = nextVec2(rng);
    #ifdef HELIAN_SR_ACTIVE
        if (useRt && surface.smoothness < 0.99)
            seed = fract(seed + float(frameCounter & 15) * vec2(0.61803399, 0.4375));
    #endif
    #if defined HELIAN_VOXEL_RT && RT_SAMPLES > 1
        int samples=useRt && surface.smoothness<0.99 ? RT_SAMPLES : 1;
        vec4 result=vec4(0.0);
        #ifdef HELIAN_SR_RR
            vec2 selectedMotion=srSpecularMotion;
        #endif
        // One tracing loop for both the first ray and the remaining rough
        // samples. Keep the nearest valid hit and its matching motion vector.
        for (int i=0;i<samples;++i) {
            vec2 noise=i==0 ? seed : fract(seed+float(i)*vec2(0.61803399,1.0/float(RT_SAMPLES)));
            vec4 ray=reflectionSample(surface,f0,f82,firstWeight,biasedView,viewDir,noise,useRt);
            result.rgb+=ray.rgb;
            if (i==0 || (ray.w>0.0 && (result.w==0.0 || ray.w<result.w))) {
                result.w=ray.w;
                #ifdef HELIAN_SR_RR
                    selectedMotion=srSpecularMotion;
                #endif
            }
        }
        result.rgb/=float(samples);
        #ifdef HELIAN_SR_RR
            srSpecularMotion=selectedMotion;
        #endif
    #else
        vec4 result=reflectionSample(surface,f0,f82,firstWeight,biasedView,viewDir,seed,useRt);
    #endif
    return result;
}

void main() {
    #ifdef HELIAN_SR_ACTIVE
        #ifdef HALF_RES_REFLECTION
            if (any(greaterThanEqual(gl_FragCoord.xy, vec2(srTextureSizeLow(colortex8, 0))))) discard;
        #else
            if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
        #endif
    #endif
    #ifdef HALF_RES_REFLECTION
        vec2 reflectionSize=vec2(srTextureSizeLow(colortex8,0));
        ivec2 texel=clamp(ivec2(gl_FragCoord.xy/reflectionSize*screenSize),ivec2(0),ivec2(screenSize)-1);
        vec2 receiverUV=(vec2(texel)+0.5)/screenSize;
    #else
        ivec2 texel=ivec2(gl_FragCoord.st);
        vec2 receiverUV=texcoord;
    #endif
    #ifdef HELIAN_SR_RR
        srSpecularMotion = vec2(0.0);
    #endif
    float waterDepth = srTextureLodLow(depthtex0, receiverUV, 0.0).r;
    float solidDepth = srTextureLodLow(depthtex1, receiverUV, 0.0).r;
    #ifdef LOD
        waterDepth += float(waterDepth == 1.0) * getLodDepthWater(receiverUV);
        solidDepth += float(solidDepth == 1.0) * getLodDepthSolid(receiverUV);
    #endif
    #ifdef HELIAN_SR_RR
        vec3 motionView;
        bool motionSky = waterDepth >= 1.0;
        #ifdef LOD
            if (waterDepth > 1.0) {
                motionView = screenToViewPosLod(receiverUV, waterDepth - 1.0);
                motionSky = waterDepth >= 2.0;
            } else
        #endif
        {
            motionView = screenToViewPos(receiverUV, waterDepth);
        }
        srSpecularMotion = srReflectionMotionVector(motionView, motionSky);
    #endif

    vec4 reflectionColor = vec4(0.0);
    #ifdef REFLECTION
        if (waterDepth - float(waterDepth > 1.0) < 1.0) {
            GbufferData gbufferData = getGbufferDataAtDepth(texel, waterDepth);
            #ifdef HELIAN_SR_RR
                if (gbufferData.materialID == MAT_FORWARD_MODEL && gbufferData.albedo.a < 0.5) {
                    readOpaqueRRMaterial(texel, gbufferData);
                    waterDepth = solidDepth;
                    gbufferData.depth = solidDepth;
                }
            #endif
            if (gbufferData.materialID == MAT_HAND) {
                gbufferData.depth = decodeHandDepth(gbufferData.depth);
            }

            vec3 f0 = vec3(0.04);
            vec3 f82 = vec3(1.0);
            #ifdef LABPBR_F0
                f0 = mix(f0, vec3(gbufferData.metalness), vec3(clamp(gbufferData.metalness * 1e+10, 0.0, 1.0)));
                f82 = hardcodedMetal(gbufferData.metalness);
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            f0 = mix(f0, gbufferData.albedo.rgb, gbufferData.metalness);
            float reflectionStrength = 1.0;
            if (waterDepth < solidDepth) {
                // Negative F0 marks ray shoot from water to air
                if (gbufferData.materialID == MAT_WATER) {
                    f0 -= 0.02 + 0.04 * float(isEyeInWater == 1);
                }
                reflectionStrength = float(gbufferData.smoothness > 0.01);
            } else {
                float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
                #ifndef FULL_REFLECTION
                    diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
                #endif
                reflectionStrength = 1.0 - diffuseWeight;
                gbufferData.depth = uintBitsToFloat(srTexelFetchLow(colortex6, texel, 0).x);
                gbufferData.depth -= float(gbufferData.depth > 1.0);
                if (gbufferData.depth < 0.0) {
                    gbufferData.depth = 1.0 - gbufferData.depth;
                }
            }

            #ifdef HELIAN_SR_RR
                if (waterDepth < 1.0 || (waterDepth > 1.0 && waterDepth < 2.0))
                    srSpecularMotion = srReflectionMotionVector(reflectionViewPosition(receiverUV, gbufferData.depth), false);
            #endif
            if (reflectionStrength > 1e-5 && waterDepth - float(waterDepth > 1.0) < 1.0) {
                reflectionColor = reflection(gbufferData, f0, f82, reflectionStrength, receiverUV);
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
    #ifdef HELIAN_SR_RR
        /* RENDERTARGETS: 8,27 */
    #else
        /* DRAWBUFFERS:8 */
    #endif
#else
    #ifdef HELIAN_SR_RR
        /* RENDERTARGETS: 4,15 */
    #else
        /* DRAWBUFFERS:4 */
    #endif
#endif
