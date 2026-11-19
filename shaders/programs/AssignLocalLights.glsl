#include "/settings/ReflectionSettings.glsl"
layout(local_size_x=64) in;
#ifdef RT_GI
const ivec3 workGroups=ivec3(4,RT_CACHE_K,1);
#include "/libs/ReflectionGrid.glsl"
#include "/libs/RTLightGrid.glsl"
layout(r32ui) uniform uimage3D rtLightImage;
layout(r32ui) uniform uimage3D rtRegionImage;
uniform vec3 cameraPosition;
uniform usampler2D rtKeys;
void main() {
    ivec2 slot=ivec2(gl_GlobalInvocationID.xy);
    uint index=uint(slot.x+256*slot.y);
    uint record=imageLoad(rtLightImage,rtSourceSlot(index)).r;
    if (record==0u) return;
    ivec3 shift=rtLightShift(cameraPosition);
    ivec3 sourceCell=rtDecodeCell(texelFetch(rtKeys,slot,0).r);
    uint next=imageAtomicExchange(rtLightImage,rtEmitterHeadSlot(sourceCell>>4),index+1u);
    imageStore(rtLightImage,rtEmitterNextSlot(index),uvec4(next));
    ivec3 cell=sourceCell+shift;
    vec3 center=vec3(cell)+0.5;
    float range=rtLightLevel(record);
    // Geometry occupies bit zero. Bit one marks any local light that can
    // reach the region, independently of which brick wins a list slot.
    vec3 source=center-vec3(shift);
    ivec3 regionLo=max(ivec3(0),ivec3(floor((source-range-0.5)/32.0)));
    ivec3 regionHi=min(ivec3((rtGridSize-1)>>5),ivec3(floor((source+range+0.5)/32.0)));
    for (int z=regionLo.z;z<=regionHi.z;++z) for (int y=regionLo.y;y<=regionHi.y;++y) for (int x=regionLo.x;x<=regionHi.x;++x)
        imageAtomicOr(rtRegionImage,ivec3(x,y,z),2u);
    const float width=float(rtLightBrickSize);
    ivec3 last=(ivec3(rtGridSize-1)+shift)/rtLightBrickSize;
    ivec3 lo=max(ivec3(0),ivec3(floor((center-range)/width)));
    ivec3 hi=min(last,ivec3(floor((center+range)/width)));
    for (int z=lo.z;z<=hi.z;++z) for (int y=lo.y;y<=hi.y;++y) for (int x=lo.x;x<=hi.x;++x) {
        ivec3 brick=ivec3(x,y,z);
        vec3 delta=abs(center-(vec3(brick)+0.5)*width);
        if (length(max(delta-width*0.5,0.0))>=range) continue;
        // Tie-break with the world-aligned offset, never a camera-relative
        // hash slot assigned by the order in which geometry happened to draw.
        uvec3 off=uvec3(cell-brick*rtLightBrickSize+ivec3(16));
        uint ref=off.x|(off.y<<6u)|(off.z<<12u);
        uint priority=uint(clamp(8192.0+512.0*(range-length(delta)),1.0,16383.0));
        uint candidate=(priority<<18u)|ref;
        for (int lane=0;lane<rtLightsPerBrick;++lane) {
            uint old=imageAtomicMax(rtLightImage,rtLightListSlot(brick,lane),candidate);
            if (old==0u || old==candidate) break;
            candidate=min(candidate,old);
        }
    }
}
#else
const ivec3 workGroups=ivec3(0,0,0);
void main() {}
#endif
