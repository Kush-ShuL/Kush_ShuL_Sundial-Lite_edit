#include "/settings/GlobalSettings.glsl"
layout(local_size_x=8,local_size_y=8) in;
const ivec3 workGroups = ivec3(64, 16, 1);
#ifdef RT_GI
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionRange.glsl"
#include "/libs/GIProbeGrid.glsl"
#include "/libs/GIReceiver.glsl"
vec3 skyColorUp = vec3(0.0);
#include "/libs/ReflectionRayTrace.glsl"
#include "/libs/RayTracedGI.glsl"
#include "/libs/GIRequest.glsl"
layout(r32ui) uniform uimage2D giWork;
layout(rgba32ui) writeonly uniform uimage2D giStampImageA, giStampImageB;
layout(rgba16f) writeonly uniform image2D giFieldImageA, giFieldImageB;

void main() {
    ivec2 slot=(ivec2(gl_GlobalInvocationID.xy)+ivec2(frameCounter & 15)*ivec2(37,13)) & ivec2(511,127);
    uint request=imageLoad(giRequests,slot).r;
    if (request==0u) return;
    ivec2 size=srTextureSizeLow(colortex20,0);
    int index=int(request & ((1u<<giPixelBits(size))-1u));
    ivec2 p=giRequestPixel(ivec2(index%size.x,index/size.x),size);
    vec3 pos,n; float viewDepth;
    if (!giReceiverAt(p,pos,n,viewDepth)) return;
    vec3 g=pos+fract(cameraPosition), local=fract(g);
    ivec3 cell=ivec3(floor(g));
    int axis=giAxis(n);
    uint key=giKey(cell,local,n,axis);
    vec4 hist=vec4(0.0);
    vec3 anchor; ivec2 previousSlot;
    bool valid=giLookup(cell,local,n,axis,true,0,hist,anchor,previousSlot);
    if (!valid) hist=vec4(0.0);
    else {
        // Retain the sample position when a different pixel claims the same
        // patch on the next frame. Project it back onto the current plane.
        vec3 move=anchor-local;
        move-=n*dot(n,move);
        int u=(axis+1)%3,v=(axis+2)%3;
        vec2 oldD=vec2(anchor[u],anchor[v])-0.5, newD=vec2(local[u],local[v])-0.5;
        if (dot(oldD,oldD)<=dot(newD,newD)+0.002) { pos+=move; local+=move; }
        else if (dot(move,move)>0.04) {valid=false;hist=vec4(0.0);}
    }
    // Keep four independent estimates, not an EMA of ever-changing directions.
    // Refreshing a phase in a static scene replaces it with the same estimate.
    bool writeA=(frameCounter&1)==0;
    vec4 groups[4];
    for (int i=0;i<4;++i) groups[i]=valid ? giReadField(previousSlot,i+1,!writeA) : vec4(0.0);
    int phase=int(hist.a)&3;
    bool update=!valid || hist.a<16.0 || ((key>>1u)+uint(frameCounter))%2u==0u;
    if (update && imageAtomicAdd(giWork,ivec2(0),1u)<4096u) {
        #ifdef SHADOW_AND_SKY
            skyColorUp=uintBitsToFloat(uvec3(imageLoad(giWork,ivec2(1,0)).r,
                imageLoad(giWork,ivec2(2,0)).r,imageLoad(giWork,ivec2(3,0)).r));
        #endif
        ivec3 worldCell=cell+cameraPositionInt;
        int stratum=(worldCell[(axis+1)%3]&1)+2*(worldCell[(axis+2)%3]&1);
        groups[phase]=vec4(rtDiffuseBounce(pos,n,n,stratum,phase),1.0);
        phase=(phase+1)&3;
    }
    vec3 sum=vec3(0.0), peak=vec3(0.0);
    float count=0.0, peakY=0.0, secondY=0.0;
    for (int i=0;i<4;++i) {
        if (groups[i].a<0.5) continue;
        sum+=groups[i].rgb; count+=1.0;
        float y=dot(groups[i].rgb,vec3(0.2126,0.7152,0.0722));
        if (y>peakY) { secondY=peakY;peakY=y;peak=groups[i].rgb; } else secondY=max(secondY,y);
    }
    if (count==0.0) return;
    // An unsupported hot group must not brighten a whole interpolated patch.
    sum-=peak*max(0.0,1.0-(2.0*secondY+0.12)/max(peakY,1e-5));
    hist=vec4(max(sum,vec3(0.0))/count,count*4.0+float(phase));
    uvec4 stamp=uvec4(key,packUnorm4x8(vec4(local,0.0)),packSnorm4x8(vec4(n,0.0)),uint(frameCounter)+1u);
    if (writeA) imageStore(giStampImageA,slot,stamp); else imageStore(giStampImageB,slot,stamp);
    ivec2 dst=ivec2(slot.x*7,slot.y);
    if (writeA) imageStore(giFieldImageA,dst,hist); else imageStore(giFieldImageB,dst,hist);
    for (int i=0;i<4;++i) {
        ivec2 p=dst+ivec2(i+1,0);
        if (writeA) imageStore(giFieldImageA,p,groups[i]); else imageStore(giFieldImageB,p,groups[i]);
    }
    vec2 lm=round(unpack2x8Bit(srTexelFetchLow(colortex2,p,0).r)*15.0);
    vec4 site=vec4(vec3(cell),lm.x+16.0*lm.y);
    if (writeA) imageStore(giFieldImageA,dst+ivec2(5,0),site);
    else imageStore(giFieldImageB,dst+ivec2(5,0),site);
}
#else
void main() {}
#endif
