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
//  Gbuffer for selection outline and leash (basic)
//

#ifdef IS_IRIS
    #extension GL_ARB_shader_image_load_store : require
    #include "/libs/TextBackdropWrite.glsl"
    uniform int entityId;
#endif
layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

flat in vec4 color;
in vec2 lmcoord;
noperspective in vec2 basicLineCenter;
uniform int renderStage;

#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    #ifdef IS_IRIS
        if (entityId==7004 && captureTextBackdrop(color)) discard;
    #endif
    if (color.w < max(1.0/255.0,alphaTestRef)) discard;

    float outlineOpacity = color.a;
    bool selectionOutline = color.a < 0.99 && dot(color.rgb, color.rgb) < 1e-6;
    #ifdef MC_RENDER_STAGE_OUTLINE
        selectionOutline = renderStage == MC_RENDER_STAGE_OUTLINE;
    #endif
    if (selectionOutline) {
        vec2 bufferSize = screenSize;
        float renderScale = 1.0;
        #ifdef HELIAN_SR_ACTIVE
            bufferSize = SROriginalViewportSize;
            renderScale = min(SRScaledViewportSize.x / SROriginalViewportSize.x,
                              SRScaledViewportSize.y / SROriginalViewportSize.y);
        #endif
        // Measure distance to the original line center. This also works with
        // the legacy basic fallback, without assuming paired vertex IDs.
        vec2 centerPixel = (basicLineCenter * 0.5 + 0.5) * bufferSize;
        float distanceToLine = length(gl_FragCoord.xy - centerPixel);
        float halfWidth = 10.0 * max(1.0, 1.8 * renderScale);
        float coverage = 1.0 - smoothstep(max(0.0, halfWidth - 0.5), halfWidth + 0.5, distanceToLine);
        if (coverage <= 0.0) discard;
        outlineOpacity = clamp(color.a, 0.35, 0.5) * coverage;
    }

    GbufferData rawData;

    rawData.albedo = vec4(color.rgb, outlineOpacity);
    rawData.normal = vec3(0.0, 0.0, 1.0);
    rawData.geoNormal = vec3(0.0, 0.0, 1.0);
    rawData.lightmap = lmcoord;
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = 0.0;
    rawData.materialID = 0.0;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
