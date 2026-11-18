#ifndef HELIAN_SUPER_RESOLUTION
#define HELIAN_SUPER_RESOLUTION

#include "/libs/SuperResolutionSettings.glsl"

#ifdef HELIAN_SR_ACTIVE
    // Voxy declares the uniforms listed in voxy.json itself.
    #ifndef HELIAN_VOXY_FRAGMENT
        uniform vec2 SRScaledViewportSize;
        uniform vec2 SROriginalViewportSize;
        uniform vec2 SRJitterOffset;
        uniform vec2 SRPreviousJitterOffset;
    #endif

    // Reconstruct from texture detail at the output resolution. Leave
    // geometric derivatives used for tangent frames and parallax unchanged.
    vec2 srMaterialFootprintScale() {
        return clamp(SRScaledViewportSize / SROriginalViewportSize, vec2(0.25), vec2(1.0));
    }

    #define srOutputScreenSize SROriginalViewportSize
    #define srTextureGradMaterial(tex, coord, gradX, gradY) textureGrad(tex, coord, (gradX) * srMaterialFootprintScale().x, (gradY) * srMaterialFootprintScale().y)

    vec2 srJitterUV() {
        #ifdef HELIAN_SR_JITTER
            return SRJitterOffset / SRScaledViewportSize;
        #else
            return vec2(0.0);
        #endif
    }

    vec2 srPreviousJitterUV() {
        #ifdef HELIAN_SR_JITTER
            return SRPreviousJitterOffset / SRScaledViewportSize;
        #else
            return vec2(0.0);
        #endif
    }

    // Scene/depth buffers keep their screen-sized allocation. The scene occupies
    // the lower-left render-sized rectangle until SR runs after composite6.
    vec2 srLowUV(vec2 coord) {
        #ifdef HELIAN_SR_POST
            coord += srJitterUV();
        #endif
        coord = clamp(coord, 0.5 / SRScaledViewportSize, 1.0 - 0.5 / SRScaledViewportSize);
        return coord * SRScaledViewportSize / SROriginalViewportSize;
    }

    // Voxy physically resizes its private depth textures with renderScale.
    vec2 srVoxyDepthUV(vec2 coord) {
        #ifdef HELIAN_SR_POST
            coord += srJitterUV();
        #endif
        return clamp(coord, 0.5 / SRScaledViewportSize, 1.0 - 0.5 / SRScaledViewportSize);
    }

    ivec2 srLowTexel(ivec2 texel, int lod) {
        #ifdef HELIAN_SR_POST
            texel = ivec2((vec2(texel) + 0.5) * SRScaledViewportSize / SROriginalViewportSize + SRJitterOffset);
        #endif
        return clamp(texel, ivec2(0), max(ivec2(1), ivec2(SRScaledViewportSize) >> lod) - 1);
    }

    vec4 srScalePosition(vec4 position) {
        #ifndef HELIAN_SR_POST
            vec2 scale = SRScaledViewportSize / SROriginalViewportSize;
            position.xy = (position.xy + position.ww) * scale - position.ww;
        #endif
        return position;
    }

    bool srOutsideRenderArea(vec2 pixel) {
        #ifndef HELIAN_SR_POST
            return any(greaterThanEqual(pixel, SRScaledViewportSize));
        #else
            return false;
        #endif
    }

    #define srTextureLodLow(tex, coord, lod) textureLod(tex, srLowUV(coord), lod)
    #define srTexture2DLow(tex, coord) texture2D(tex, srLowUV(coord))
    #define srTextureGatherLow(tex, coord, component) textureGather(tex, srLowUV(coord), component)
    #define srTextureLodVoxyDepth(tex, coord, lod) textureLod(tex, srVoxyDepthUV(coord), lod)
    #define srTextureGatherVoxyDepth(tex, coord, component) textureGather(tex, srVoxyDepthUV(coord), component)
    #define srTexelFetchLow(tex, coord, lod) texelFetch(tex, srLowTexel(coord, lod), lod)
    #define srTextureSizeLow(tex, lod) max(ivec2(1), ivec2(vec2(textureSize(tex, lod)) * SRScaledViewportSize / SROriginalViewportSize))

    #ifdef HELIAN_SR_POST
        #define srTextureLodScene textureLod
        #define srTexelFetchScene texelFetch
    #else
        #define srTextureLodScene srTextureLodLow
        #define srTexelFetchScene srTexelFetchLow
        #define screenSize SRScaledViewportSize
        #define texelSize (1.0 / SRScaledViewportSize)
    #endif

    #define taaOffset (2.0 * srJitterUV())
    #define taaOffsetVX (2.0 * srJitterUV())
    #define prevTaaOffset srPreviousJitterUV()
#else
    #define srMaterialFootprintScale() vec2(1.0)
    #define srOutputScreenSize screenSize
    #define srTextureGradMaterial textureGrad
    #define srTextureLodLow textureLod
    #define srTextureLodScene textureLod
    #define srTexture2DLow texture2D
    #define srTextureGatherLow textureGather
    #define srTextureLodVoxyDepth textureLod
    #define srTextureGatherVoxyDepth textureGather
    #define srTexelFetchLow texelFetch
    #define srTexelFetchScene texelFetch
    #define srTextureSizeLow textureSize
    #define srScalePosition(position) position
    #define srOutsideRenderArea(pixel) false
#endif

#endif
