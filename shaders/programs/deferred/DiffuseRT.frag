#include "/settings/ReflectionSettings.glsl"
#ifdef RT_GI
    #extension GL_ARB_shading_language_packing : require
#endif
layout(location = 0) out vec4 diffuseRT;
layout(location = 1) out vec4 directRT;
/*
const int colortex20Format = RGBA16F;
const int colortex22Format = RGBA16F;
*/
in vec2 texcoord;
#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif
#ifdef RT_GI
    #include "/libs/ReflectionRange.glsl"
    #include "/libs/GIProbeGrid.glsl"
    #include "/libs/GIReceiver.glsl"
    #include "/libs/ReflectionRayTrace.glsl"
#endif
void main() {
    diffuseRT = vec4(0.0);
    directRT = vec4(0.0);
    #ifdef RT_GI
        if (any(greaterThanEqual(texcoord, vec2(1.0)))) discard;
        ivec2 p = clamp(ivec2(texcoord * screenSize), ivec2(0), ivec2(screenSize)-1);
        vec3 pos,n; float depth;
        vec3 irradiance;
        if (giReceiverAt(p,pos,n,depth)) {
            if (giIrradiance(pos,n,irradiance)) diffuseRT = vec4(irradiance,depth);
            vec4 direct=rtDirectLamps(pos,n,rtEmitterPhase(ivec2(gl_FragCoord.xy)));
            directRT=vec4(direct.rgb,depth);
            // Fold any uncovered fraction of the vanilla term into this sample.
            float level=unpack2x8Bit(srTexelFetchLow(colortex2,p,0).r).x;
            float f=VANILLA_BLOCK_LIGHT_FADE;
            float atten=1.0/(f-f*f/(1.0+f)*level)-1.0/f;
            directRT.rgb+=(1.0-direct.a)*commonLightColor*(atten*atten);
            if (direct.a==0.0) directRT=vec4(0.0,0.0,0.0,-depth);
        }
    #endif
}
/* RENDERTARGETS: 20,22 */
