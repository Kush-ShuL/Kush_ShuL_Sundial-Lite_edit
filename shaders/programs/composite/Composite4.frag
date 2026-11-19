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
//  Sky and cloud
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;
in vec3 skyColorUp;

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"

#include "/libs/SkyBackground.glsl"

#ifdef HELIAN_SR_INPUTS
// Temporary cloud guides; composite6 replaces these with final motion vectors.
layout(location = 1) out vec2 srCloudGuide;
#endif

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.st);

    float depth = srTexelFetchLow(depthtex1, texel, 0).r;
    vec3 viewPos;
    #ifdef LOD
        if (depth == 1.0) {
            depth = getLodDepthSolid(texcoord);
            viewPos = screenToViewPosLod(texcoord, depth);
            depth = -depth;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, depth);
    }
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
    float worldDepth = inversesqrt(dot(worldPos, worldPos));
    vec3 worldDir = worldPos * worldDepth;
    vec4 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, worldDir);

    vec4 solidColor = vec4(srTexelFetchScene(colortex3, texel, 0).rgb, 1.0);

    float backDepth;
    vec3 backColor;
    vec4 planeCloud = vec4(0.0);
    float planeCoverage = 0.0;
    float planeDepth = -1.0;
    if (abs(depth) < 0.999999) {
        backDepth = 1.0 / worldDepth;
        backColor = solidColor.rgb;
    }
    else {
        backDepth = 0.0;
        solidColor.rgb = skyBackground(solidColor.rgb, gbufferModelViewInverse[3].xyz, worldDir, intersectionData, backColor, planeCloud);
        #ifdef PLANE_CLOUD
            #ifdef HELIAN_SR_INPUTS
                planeCoverage = planeCloud.a;
                vec2 planeIntersection = raySphereIntersection(intersectionData.x, intersectionData.y, -pow2(planeCloudHeight));
                float cameraHeight = gbufferModelViewInverse[3].y + max(300.0 + earthRadius, cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius);
                planeDepth = cameraHeight > planeCloudHeight ? planeIntersection.x : planeIntersection.y;
            #endif
        #endif
        blendLowerSkyPlane(solidColor.rgb, planeCloud, gbufferModelViewInverse[3].y);
    }
    float cloudDepth;
    solidColor = sampleClouds(
        solidColor.rgb, backColor, gbufferModelViewInverse[3].xyz, worldDir, shadowDirection, sunDirection, skyColorUp, intersectionData.xyz, backDepth, cloudDepth
    );

    #ifdef HELIAN_SR_INPUTS
        srCloudGuide = vec2(0.0);
        float volumeCoverage = solidColor.a * (1.0 - planeCloud.a);
        float visiblePlaneCoverage = planeCoverage * (1.0 - solidColor.a * float(planeCloud.a == 0.0));
        // Signed log distance fits RG16F at the horizon: negative denotes plane clouds.
        if (cloudDepth > 0.0 && volumeCoverage > 0.0) {
            srCloudGuide = vec2(log2(1.0 + cloudDepth), volumeCoverage);
        }
        if (planeDepth > 0.0 && visiblePlaneCoverage > volumeCoverage) {
            srCloudGuide = vec2(-log2(1.0 + planeDepth), visiblePlaneCoverage);
        }
    #endif
    solidColor.rgb = mix(solidColor.rgb, planeCloud.rgb, planeCloud.a);

    float transparentDensity = 1.0;
    if (cloudDepth > -0.5) {
        float waterDepth = srTexelFetchLow(depthtex0, texel, 0).r;
        vec3 waterViewPos = screenToViewPos(texcoord, waterDepth);
        float waterViewDepth = length(waterViewPos);

        float depthDiff = waterViewDepth - cloudDepth;
        if (depthDiff > 0.0) {
            #if CLOUD_TYPE == 1
                float minimumDensity = exp(-depthDiff * depthDiff * cloudNoiseScale * cloudNoiseScale * 500.0);
            #elif CLOUD_TYPE == 2
                float minimumDensity = exp(-depthDiff * CLOUD_REALISTIC_SAMPLE_DENSITY);
            #else
                float minimumDensity = 1.0;
            #endif
            transparentDensity = max(1.0 - solidColor.w, minimumDensity);
        }
    }
    solidColor.w = transparentDensity;

    texBuffer3 = solidColor;
}

#ifdef HELIAN_SR_INPUTS
/* RENDERTARGETS: 3,9 */
#else
/* DRAWBUFFERS:3 */
#endif
