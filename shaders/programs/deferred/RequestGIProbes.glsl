#include "/settings/GlobalSettings.glsl"
layout(local_size_x=8,local_size_y=8) in;
#if RT_GI_SCALE == 4
const vec2 workGroupsRender = vec2(0.25, 0.25);
#else
const vec2 workGroupsRender = vec2(0.5, 0.5);
#endif
#ifdef RT_GI
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionRange.glsl"
#include "/libs/GIProbeGrid.glsl"
#include "/libs/GIReceiver.glsl"
#include "/libs/GIRequest.glsl"
#ifdef SHADOW_AND_SKY
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
layout(r32ui) writeonly uniform uimage2D giWork;
#endif
void main() {
    ivec2 size=srTextureSizeLow(colortex20,0), q=ivec2(gl_GlobalInvocationID.xy);
    #ifdef SHADOW_AND_SKY
        if (all(equal(q,ivec2(0)))) {
            uvec3 sky=floatBitsToUint(atmosphereScatteringUp(sunDirection.y,30.0));
            for (int i=0;i<3;++i) imageStore(giWork,ivec2(1+i,0),uvec4(sky[i]));
        }
    #endif
    if (any(greaterThanEqual(q,size))) return;
    vec3 pos,n; float depth;
    if (!giReceiverAt(giRequestPixel(q,size),pos,n,depth)) return;
    vec3 g=pos+fract(cameraPosition), local=fract(g);
    int axis=giAxis(n);
    uint key=giKey(ivec3(floor(g)),local,n,axis);
    vec2 d=vec2(local[(axis+1)%3],local[(axis+2)%3])-0.5;
    // Max selects the nearest real surface sample to the interpolation site;
    // the pixel index breaks ties independently of GPU scheduling.
    int bits=giPixelBits(size);
    uint levels=0xffffffffu >> bits;
    uint rank=1u+uint(clamp(1.0-2.0*dot(d,d),0.0,1.0)*float(levels-1u));
    uint request=(min(rank,levels)<<bits)|uint(q.x+q.y*size.x);
    for (int i=0;i<4;++i) {
        ivec2 slot=giSlot(key,i);
        uint owner=imageAtomicCompSwap(giClaims,slot,0u,key);
        if (owner==0u || owner==key) { imageAtomicMax(giRequests,slot,request); return; }
    }
}
#else
void main() {}
#endif
