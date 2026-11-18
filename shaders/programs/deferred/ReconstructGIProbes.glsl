#include "/settings/GlobalSettings.glsl"
layout(local_size_x=8,local_size_y=8) in;
const ivec3 workGroups = ivec3(64, 16, 1);
#ifdef RT_GI
#include "/libs/Uniform.glsl"
#include "/libs/GIProbeGrid.glsl"
#include "/libs/RTRayGeometry.glsl"
layout(rgba16f) writeonly uniform image2D giFieldImageA, giFieldImageB;

void main() {
    ivec2 slot=ivec2(gl_GlobalInvocationID.xy);
    bool useA=(frameCounter&1)==0;
    uvec4 stamp=useA ? texelFetch(giStampA,slot,0) : texelFetch(giStampB,slot,0);
    if (stamp.w!=uint(frameCounter)+1u || stamp.x==0u) return;
    vec4 site=giReadField(slot,5,useA), center=giReadField(slot,0,useA);
    ivec3 cell=ivec3(site.xyz);
    vec3 local=unpackUnorm4x8(stamp.y).xyz, n=normalize(unpackSnorm4x8(stamp.z).xyz);
    int axis=giAxis(n), u=(axis+1)%3, v=(axis+2)%3;
    ivec2 lm=ivec2(int(site.w)&15,int(site.w)>>4);
    vec3 sum=center.rgb; float weights=1.0;
    int links=1<<4;
    vec3 origin=vec3(cell)+local-fract(cameraPosition)+0.012*n;
    for (int y=-1;y<=1;++y) for (int x=-1;x<=1;++x) {
        if (x==0 && y==0) continue;
        ivec3 off=ivec3(0); off[u]=x; off[v]=y;
        off[axis]=int(round(-dot(n,vec3(off))/n[axis]));
        vec4 raw; vec3 anchor; ivec2 other;
        bool otherA=useA;
        if (!giLookup(cell+off,local-vec3(off),n,axis,false,0,raw,anchor,other)) {
            if (!giLookup(cell+off,local-vec3(off),n,axis,true,0,raw,anchor,other)) continue;
            otherA=!useA;
        }
        int l=int(giReadField(other,5,otherA).w);
        ivec2 dl=abs(lm-ivec2(l&15,l>>4));
        vec3 separation=vec3(off)+anchor-local;
        float distanceBetween=length(separation);
        vec3 pass=distanceBetween<0.002 ? vec3(1.0) :
            rtVisibilityTo(origin,separation/distanceBetween,distanceBetween,ivec3(-1));
        if (max(pass.r,max(pass.g,pass.b))<0.001) continue;
        links |= 1<<((y+1)*3+x+1);
        float w=exp2(-0.6*dot(separation,separation)-0.30*float(dl.x)-0.6*float(dl.y));
        sum+=raw.rgb*pass*w; weights+=w;
    }
    // Write only the reconstruction slot. History and all neighbour reads use
    // raw estimates, so repeated frames do not blur a real lighting gradient.
    ivec2 dst=ivec2(slot.x*7+6,slot.y);
    vec4 result=vec4(sum/weights,float(links));
    if (useA) imageStore(giFieldImageA,dst,result); else imageStore(giFieldImageB,dst,result);
}
#else
void main() {}
#endif
