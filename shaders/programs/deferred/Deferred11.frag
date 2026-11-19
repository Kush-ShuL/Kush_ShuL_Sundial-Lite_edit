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
//  Lighting that need to be calculated in visibility bitmask; Bake depth containing parallax and hand correction for future shader
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out uint texBuffer6;

in vec2 texcoord;

uniform vec3 viewShadowDirection;

#define PCSS
#define PCSS_SAMPLES 9 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 25 30 36]
#define SCREEN_SPACE_SHADOW_SAMPLES 12 // [4 5 6 7 8 9 10 12 14 16 18 20 25 30 35 40 45 50]
#define SCREEN_SPACE_SHADOW

const float shadowDistance = 120.0; // [80.0 120.0 160.0 200.0 240.0 280.0 320.0 360.0 400.0 480.0 560.0 640.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Shadow.glsl"

#ifdef SHADOW_AND_SKY
    vec3 shadowSpaceSurfaceOffset(vec3 worldOffsetDir) {
        vec3 offset = mat3(shadowModelViewProj0, shadowModelViewProj1, shadowModelViewProj2) * worldOffsetDir;
        offset *= inversesqrt(max(max(dot(offset.xy, offset.xy), dot(offset, offset) * 0.09),1e-16)) * 400.0 / shadowDistance / realShadowMapResolution;
        offset.z *= 0.1;
        return offset;
    }

    // Interpolate a sparse PCSS tap over the part of the shadow map it
    // represents. The odd grid nodes slide onto the even ones as the
    // footprint doubles, so the filter does not pop between grid sizes.
    vec4 solarVisibility(vec3 coord,vec2 spacing,vec2 gridStep,vec2 depthSlope,out vec3 transmission) {
        coord.xy=clamp(coord.xy,vec2(0.5+0.5/realShadowMapResolution),vec2(1.0-0.5/realShadowMapResolution));
        if (max(spacing.x,spacing.y)<=1.0) {
            transmission=glassTransmission(coord);
            return vec4(transmission,1.0)*textureLod(shadowtex0,coord,0.0);
        }
        vec2 texel=coord.xy*realShadowMapResolution-0.5;
        vec2 period=2.0*gridStep,base=floor(texel/period)*period;
        vec2 mid=base+period-spacing;
        bvec2 upper=greaterThanEqual(texel,mid);
        vec2 lo=mix(base,mid,upper),hi=mix(mid,base+period,upper);
        vec2 f=clamp((texel-lo)/max(hi-lo,vec2(1e-6)),0.0,1.0);
        vec4 sum=vec4(0.0);transmission=vec3(0.0);
        for (int i=0;i<4;++i) {
            vec2 side=vec2(i&1,i>>1);
            vec2 q=clamp(mix(lo,hi,side),vec2(realShadowMapResolution*0.5),vec2(realShadowMapResolution-1.0));
            vec3 sampleCoord=vec3((q+0.5)/realShadowMapResolution,coord.z+dot(q-texel,depthSlope));
            vec3 tint=glassTransmission(sampleCoord);
            vec2 w=mix(1.0-f,f,side);
            transmission+=w.x*w.y*tint;
            sum+=w.x*w.y*textureLod(shadowtex0,sampleCoord,0.0)*vec4(tint,1.0);
        }
        return sum;
    }

    void percentageCloserSoftShadow(
        vec3 worldPos, vec3 worldGeoNormal, float NdotL, float viewLength, float lightFactor, float smoothness,
        float porosity, float skyLight, inout vec3 shadow, inout vec3 subsurfaceScattering
    ) {
        basicSunlight = 8.0 * SUNLIGHT_BRIGHTNESS - 8.0 * SUNLIGHT_BRIGHTNESS * sqrt(weatherStrength) * SUNLIGHTINRAIN;
        shadow *= basicSunlight;
        subsurfaceScattering *= basicSunlight * clamp(SUBSERFACE_SCATTERING_STRENTGH * 1e+10, 0.0, 1.0);
        if (true) {
            vec3 sssShadowCoord = worldPosToShadowCoordNoDistort(worldPos);
            float normalOffsetLen = (viewLength * 2e-3 + 2e-2) * (1.0 + sqrt(1.0 - NdotL));
            vec3 normalOffset = mat3(shadowModelViewProj0, shadowModelViewProj1, shadowModelViewProj2) * (worldGeoNormal * normalOffsetLen * 4096.0 / realShadowMapResolution);
            normalOffset.z *= 0.1;

            vec3 basicShadowCoordNoDistort = sssShadowCoord + normalOffset;
            sssShadowCoord -= normalOffset;
            float clipLengthInv = inversesqrt(max(dot(basicShadowCoordNoDistort.xy, basicShadowCoordNoDistort.xy),1e-12));
            float distortFactor = clipLengthInv * log(distortionStrength / clipLengthInv + 1.0) / log(distortionStrength + 1.0);
            vec3 basicShadowCoord = basicShadowCoordNoDistort;
            basicShadowCoord.st = basicShadowCoord.st * 0.25 * distortFactor + 0.75;

            float normalFactor = clamp(pow(NdotL, pow2(1.0 - smoothness * 0.3)), 0.0, 1.0);
            NdotL = abs(dot(worldGeoNormal, shadowDirection));
            NdotL = NdotL + (1.0 - NdotL) * clamp(porosity * 255.0 / 191.0 - 64.0 / 191.0, 0.0, 1.0);

            vec3 offsetDirection1 = cross(worldGeoNormal, shadowDirection);
            if (dot(offsetDirection1,offsetDirection1)<1e-8)
                offsetDirection1=cross(worldGeoNormal,abs(worldGeoNormal.y)<0.9 ? vec3(0,1,0) : vec3(1,0,0));
            vec3 offsetDirection2 = cross(worldGeoNormal, offsetDirection1);
            offsetDirection1 = shadowSpaceSurfaceOffset(offsetDirection1);
            offsetDirection2 = shadowSpaceSurfaceOffset(offsetDirection2);
            basicShadowCoordNoDistort.z -= 2e-5;

            float avgOcclusionDepth = 0.0;
            float depthSum = 0.0;
            const float depthSampleRadius = 2.0;
            float offsetX = -depthSampleRadius;
            for (int i = -1; i <= 1; i++) {
                float offsetY = -depthSampleRadius;
                for (int j = -1; j <= 1; j++) {
                    vec3 sampleCoord = distortShadowCoord(basicShadowCoordNoDistort + offsetX * offsetDirection1 + offsetY * offsetDirection2);
                    float sampleDepth = textureLod(shadowtex1, sampleCoord.st, 0.0).r;
                    depthSum += sampleDepth;
                    avgOcclusionDepth += clamp(sampleCoord.z - sampleDepth, 0.0, 1.0);
                    offsetY += depthSampleRadius;
                }
                offsetX += depthSampleRadius;
            }
            bool inAtlas=all(lessThan(abs(basicShadowCoord-vec3(vec2(0.75),0.5)),vec3(vec2(0.249),0.5)));
            bool hasCaster=depthSum<8.9999;
            #ifdef TRANSPARENT_SHADOW
                if (inAtlas && !hasCaster) hasCaster=textureLod(shadowtex0,basicShadowCoord-vec3(0.5,0.0,2e-5),0.0)<1.0;
            #endif
            if (inAtlas && hasCaster) {
                float filterRadius = min(avgOcclusionDepth * 80.0 / 9.0, 4.0) + 0.02 * shadowDistance / distortFactor;

                vec3 waterShadowCoord = basicShadowCoord - vec3(0.0, 0.5, 0.0);
                vec3 caustic = waterCaustic(waterShadowCoord, worldPos, shadowDirection) * lightFactor;
                shadow *= caustic;
                subsurfaceScattering *= caustic;

                vec2 dx=(distortShadowCoord(basicShadowCoordNoDistort+offsetDirection1).xy-basicShadowCoord.xy)*realShadowMapResolution;
                vec2 dy=(distortShadowCoord(basicShadowCoordNoDistort+offsetDirection2).xy-basicShadowCoord.xy)*realShadowMapResolution;
                vec2 spacing=clamp(sqrt(dx*dx+dy*dy)*filterRadius/sqrt(float(PCSS_SAMPLES)),1.0,32.0);
                vec2 gridStep=exp2(floor(log2(spacing)));
                float det=dx.x*dy.y-dx.y*dy.x;
                vec2 depthSlope=abs(det)<1e-5 ? vec2(0.0) : vec2(dy.y*offsetDirection1.z-dx.y*offsetDirection2.z,
                            dx.x*offsetDirection2.z-dy.x*offsetDirection1.z)/det;
                bool needSubsurfaceScattering = porosity > 64.5 / 255.0;

                float sssRadius = 1.0 + 1.0 / filterRadius;
                vec3 transmittedSun=vec3(0.0), sssTint=vec3(0.0);
                float opticalDepth = 0.0;
                float solidShadow = 0.0;
                for (int i = 0; i < PCSS_SAMPLES; i++) {
                    const int pairs=PCSS_SAMPLES/2;
                    int pair=i/2;
                    float angle=(float(pair)+0.25)*PI/float(pairs);
                    float r=i==2*pairs ? 0.0 : sqrt((float(pair)+0.5)/float(pairs))*filterRadius;
                    vec2 disk=vec2(cos(angle),sin(angle))*((i&1)==0 ? r : -r);
                    vec3 sampleOffset=disk.x*offsetDirection1+disk.y*offsetDirection2;
                    vec3 sampleShadowCoord=distortShadowCoord(basicShadowCoordNoDistort+sampleOffset);
                    vec3 tint;
                    vec4 visibility=solarVisibility(sampleShadowCoord,spacing,gridStep,depthSlope,tint);
                    transmittedSun+=visibility.rgb;
                    solidShadow+=visibility.a;
                    sssTint+=tint;

                    if (needSubsurfaceScattering) {
                        vec3 sssSampleCoord = distortShadowCoord(sssShadowCoord + vec3(sampleOffset.st * sssRadius, 0.0));
                        float shadowDepth = textureLod(shadowtex1, sssSampleCoord.st, 0.0).r;
                        opticalDepth += clamp(sssSampleCoord.z - shadowDepth + 1e-4, 0.0, 1.0);
                    }
                }
                subsurfaceScattering*=sssTint/float(PCSS_SAMPLES);


                solidShadow *= normalFactor / PCSS_SAMPLES;
                if (needSubsurfaceScattering && SUBSERFACE_SCATTERING_STRENTGH > 0.0) {
                    const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
                    float absorptionBeta = -4e+3 * 0.5 * 1.44269502 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * opticalDepth / PCSS_SAMPLES;
                    subsurfaceScattering *= exp2(absorptionBeta) * (1.0 - solidShadow) * NdotL;
                }
                shadow *= transmittedSun*(normalFactor/float(PCSS_SAMPLES));
            }
            else {
                skyLight = smoothstep(0.8, 0.9, skyLight);
                shadow *= skyLight * normalFactor;
                subsurfaceScattering *= skyLight * (1.0 - normalFactor) * NdotL * step(64.5 / 255.0, porosity);
            }
        }
    }

    float screenSpaceShadow(vec3 viewPos, float NdotL, float viewLength, float porosity, vec2 noise, float materialID) {
        vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos, -viewPos.z);
        originProjPos.z += gbufferProjection[3].z;
        originProjPos.xy += gbufferProjection[2].xy * viewPos.z;
        #if defined TAA || defined HELIAN_SR_JITTER
            originProjPos.xy += taaOffset * originProjPos.w;
        #endif
        float projScale = 0.5 / originProjPos.w;
        vec4 originCoord = vec4(originProjPos.xyz * projScale + 0.5, 0.0);

        vec4 projDirection = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewShadowDirection, -viewShadowDirection.z);
        projDirection.xy += gbufferProjection[2].xy * viewShadowDirection.z;
        float traceLength = projIntersectionScreenEdge(originProjPos, projDirection);
        vec4 targetProjPos = originProjPos + projDirection * traceLength;
        float targetProjScale = 0.5 / targetProjPos.w;
        vec4 targetCoord = vec4(targetProjPos.xyz * targetProjScale + 0.5, 0.0);

        #ifdef LOD
            projDirection.z = projDirection.z / gbufferProjection[2].z * projLod()[2].z;
            float originProjDepthLod = viewPos.z * projLod()[2].z + projLod()[3].z;
            originCoord.w = originProjDepthLod * projScale + 0.5;
            targetCoord.w = (originProjDepthLod + projDirection.z * traceLength) * targetProjScale + 0.5;
        #endif

        vec4 stepSize = targetCoord - originCoord;
        stepSize *= inversesqrt(dot(stepSize.xy, stepSize.xy));
        originCoord += stepSize * max(texelSize.x, texelSize.y) * 1.5;

        float shadow = 1.0;
        float stepScale = 1.0;
        float porosityScale = (1.0 - clamp(porosity - 0.25, 0.0, 1.0));
        stepSize *= 0.003 * 12.0 / SCREEN_SPACE_SHADOW_SAMPLES;

        targetCoord = originCoord + stepSize * SCREEN_SPACE_SHADOW_SAMPLES;
        vec3 targetViewPos = screenToViewPos(targetCoord.xy, targetCoord.z);
        #ifdef LOD
            if (targetCoord.z >= 1.0) {
                targetViewPos = screenToViewPosLod(targetCoord.xy, targetCoord.w);
            }
        #endif
        const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
        vec3 viewPosDiff = targetViewPos - viewPos;
        float absorptionBeta = -0.5 / (max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * inversesqrt(dot(viewPosDiff, viewPosDiff)));
        float absorption = exp2(absorptionBeta * porosityScale * 0.5) * step(0.25, porosity) * (1.0 - clamp(NdotL * 10.0, 0.0, 1.0) * porosityScale) + 1.0;
        float shadowWeight = clamp(1.0 - abs(NdotL) * 10.0, 0.0, 1.0) * clamp(1.0 - 1.1 / viewLength / shadowDistance, 0.0, 1.0);

        vec4 sampleCoord = originCoord + noise.x * stepSize;
        sampleCoord.zw -= 2e-7;

        float maximumThickness = 0.0005 * viewLength + 0.03 * float(materialID == MAT_HAND);
        float maximumThicknessLod = 0.5 * viewLength;
        float depthMultiplicator = mix(1.0, 1.0 / HELIAN_HAND_DEPTH_RANGE, float(materialID == MAT_HAND));
        float baseDepthOffset = 0.0;
        sampleCoord.zw -= vec2(maximumThickness, maximumThicknessLod);

        for (int i = 0; i < SCREEN_SPACE_SHADOW_SAMPLES; i++) {
            if (any(greaterThan(abs(sampleCoord.xy - 0.5), vec2(0.5))) || shadow < 0.01) {
                break;
            }
            float sampleDepth = srTextureLodLow(depthtex1, sampleCoord.st, 0.0).r;
            bool hit;
            #ifdef LOD
                if (sampleDepth == 1.0) {
                    float sampleDepthLod = getLodDepthSolidDeferred(sampleCoord.st);
                    hit = abs(sampleCoord.w - sampleDepthLod) < maximumThicknessLod && sampleDepthLod < 1.0;
                }
                else
            #endif
            {
                float sampleParallaxOffset = srTextureLodScene(colortex3, sampleCoord.st, 0.0).w / 512.0 + baseDepthOffset;
                sampleDepth = sampleDepth * depthMultiplicator + sampleParallaxOffset;
                hit = abs(sampleCoord.z - sampleDepth) < maximumThickness && sampleDepth < 1.0;
                if (hit) {
                    vec2 sampleTexelCoord = sampleCoord.xy * screenSize + 0.5;
                    vec2 sampleTexel = floor(sampleTexelCoord);
                    vec4 sh = srTextureGatherLow(depthtex1, sampleTexel * texelSize, 0);
                    vec2 fpc = sampleTexelCoord - sampleTexel;
                    vec2 x = mix(sh.wx, sh.zy, vec2(fpc.x));
                    float sampleDepth = mix(x.x, x.y, fpc.y);
                    sampleDepth = sampleDepth * depthMultiplicator + sampleParallaxOffset;
                    hit = abs(sampleCoord.z - sampleDepth) < maximumThickness;
                }
            }
            shadow *= clamp(absorption - float(hit), 0.0, 1.0);
            sampleCoord += stepSize;
        }

        return clamp(mix(shadow, 1.0, shadowWeight), 0.0, 1.0);
    }

    vec3 renderSun(vec3 rayDir, vec3 lightDir, vec3 sunLight) {
        //http://www.physics.hmc.edu/faculty/esin/a101/limbdarkening.pdf
        float cosAngle = clamp(dot(rayDir, lightDir), 0.0, 1.0);
        const vec3 u = vec3(1.0, 1.0, 1.0);
        const vec3 a = vec3(0.397, 0.503, 0.652);
        float theta = acos(cosAngle);
        float centerToEdge = (theta / sunRadius);

        vec3 sun = vec3(0.0);
        if (theta < sunRadius) {
            vec3 light = sunLight;
            float mu = 1.0 - centerToEdge * centerToEdge;
            vec3 factor = vec3(1.0) - u * (vec3(1.0) - pow(vec3(mu), a * 0.5));

            sun = light * factor;
        }
        return sun;
    }
#endif

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.st);
    float baseDepth = srTextureLodLow(depthtex1, texcoord, 0.0).x;
    float renderDepth = baseDepth;
    float previousFrames = unpackF8D24(srTexelFetchLow(colortex6, texel, 0).x).x;
    #ifdef LOD
        if (baseDepth == 1.0) {
            renderDepth = getLodDepthSolidDeferred(texcoord);
            if (renderDepth == 1.0) {
                texBuffer6 = floatBitsToUint(-1.0);
                texBuffer3 = vec4(vec3(0.0), previousFrames);
                return;
            }
        }
    #else
        if (baseDepth == 1.0) {
            texBuffer6 = floatBitsToUint(1.0);
            texBuffer3 = vec4(vec3(0.0), previousFrames);
            return;
        }
    #endif

    GbufferData gbufferData = getGbufferDataAtDepth(texel, renderDepth);
    vec3 viewPos;
    vec3 viewPosNoPOM;
    #ifdef LOD
        if (baseDepth == 1.0) {
            viewPos = screenToViewPosLod(texcoord, gbufferData.depth - 1e-7);
            viewPosNoPOM = viewPos;
            gbufferData.depth = -gbufferData.depth;
        } else
    #endif
    {
        if (gbufferData.materialID == MAT_HAND) {
            gbufferData.depth = decodeHandDepth(gbufferData.depth);
        }
        float depthWithHand = gbufferData.depth - 1e-7;
        vec3 viewDirection = vec3(texcoord * 2.0 - 1.0, gbufferProjectionInverse[3].z);
        #if defined TAA || defined HELIAN_SR_JITTER
            viewDirection.xy -= taaOffset;
        #endif
        viewDirection.xy = vec2(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y) * viewDirection.xy + gbufferProjectionInverse[3].xy;
        depthWithHand = depthWithHand * 2.0 - 1.0;
        viewPosNoPOM = viewDirection / (gbufferProjectionInverse[2].w * depthWithHand + gbufferProjectionInverse[3].w);
        float parallaxData = srTexelFetchScene(colortex3, texel, 0).w;
        depthWithHand += parallaxData / 512.0 * 2.0;
        gbufferData.depth += parallaxData / 512.0;
        viewPos = viewDirection / (gbufferProjectionInverse[2].w * depthWithHand + gbufferProjectionInverse[3].w);
    }
    texBuffer6 = floatBitsToUint(gbufferData.depth + float(gbufferData.materialID == MAT_HAND));
    vec3 worldPos = viewToWorldPos(viewPosNoPOM);
    vec3 worldDir = normalize(worldPos - gbufferModelViewInverse[3].xyz);

    vec4 finalColor = vec4(vec3(0.0), previousFrames);

    if (abs(gbufferData.depth) < 1.0) {
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        vec3 worldGeoNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.geoNormal);

        finalColor.rgb += gbufferData.emissive * PBR_BRIGHTNESS * PI;
        finalColor.rgb *= gbufferData.albedo.rgb;

        #ifdef SHADOW_AND_SKY
            vec3 f0 = vec3(0.04);
            vec3 f82 = vec3(1.0);
            #ifdef LABPBR_F0
                f0 = mix(f0, vec3(gbufferData.metalness), step(0.001, gbufferData.metalness));
                f82 = hardcodedMetal(gbufferData.metalness);
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            f0 = mix(f0, gbufferData.albedo.rgb, gbufferData.metalness);
            float NdotV = clamp(dot(worldDir, -worldNormal), 0.0, 1.0);
            vec3 diffuseAbsorption = (1.0 - gbufferData.metalness) * diffuseAbsorptionWeight(NdotV, gbufferData.smoothness, f0, f82);

            vec3 shadow = sunColor;
            float NdotL = clamp(dot(worldNormal, shadowDirection), 0.0, 1.0);
            vec3 shadowDiffuse = gbufferData.albedo.rgb * diffuseAbsorption;
            vec3 shadowSpecular = sunlightSpecular(worldDir, shadowDirection, worldNormal, gbufferData.smoothness * 0.995, NdotL, NdotV, f0, f82);
            float viewLength = inversesqrt(dot(viewPos, viewPos));
            #ifdef SCREEN_SPACE_SHADOW
                vec2 noise=blueNoiseTemporal(texcoord).xy;
                shadow *= screenSpaceShadow(viewPos, dot(worldGeoNormal, shadowDirection), viewLength, gbufferData.porosity, noise, gbufferData.materialID);
            #endif
            #ifdef CLOUD_SHADOW
                shadow *= cloudShadow(worldPos, shadowDirection);
            #endif
            vec3 subsurfaceScattering = vec3(float(gbufferData.porosity > 64.5 / 255.0)) * shadow * shadowDiffuse;
            shadow *= shadowDiffuse + shadowSpecular;
            float shadowLightFactor = 1.0;
            #ifdef LIGHT_LEAKING_FIX
                shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0 + isEyeInWater, 0.0, 1.0);
            #endif
            #ifdef PCSS
                percentageCloserSoftShadow(
                    worldPos, worldGeoNormal, NdotL, 1.0 / viewLength, shadowLightFactor, gbufferData.smoothness,
                    gbufferData.porosity, gbufferData.lightmap.y, shadow, subsurfaceScattering
                );
            #else
                singleSampleShadow(
                    worldPos, worldGeoNormal, NdotL, shadowLightFactor, gbufferData.smoothness,
                    gbufferData.porosity, gbufferData.lightmap.y, shadow, subsurfaceScattering
                );
            #endif
            shadow += subsurfaceScattering;
            finalColor.rgb += shadow;
        }
        else {
            finalColor.rgb = renderSun(worldDir, sunDirection, vec3(300.0)) + gbufferData.albedo.rgb * 2.0;
    #endif
    }

    texBuffer3 = finalColor;
}

/* DRAWBUFFERS:36 */
