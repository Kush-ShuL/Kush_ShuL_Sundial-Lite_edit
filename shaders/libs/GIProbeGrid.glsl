// A cache entry represents a patch of surface, not a pixel. Tag its world cell,
// facing and plane height so opposite sides of a wall cannot share history.
uniform ivec3 cameraPositionInt;
uniform usampler2D giStampA, giStampB;
uniform sampler2D giFieldA, giFieldB;

uint giMix(uint x) {
    x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu;
    return x ^ (x >> 16u);
}
int giAxis(vec3 n) {
    vec3 a = abs(n);
    return a.x >= a.y && a.x >= a.z ? 0 : a.y >= a.z ? 1 : 2;
}
uint giKey(ivec3 cell, vec3 local, vec3 n, int axis) {
    float plane = dot(n,local - 0.5) / n[axis] + 0.5;
    uint face = uint(axis*2 + int(n[axis]>0.0));
    uvec3 c = uvec3(cell + cameraPositionInt);
    return giMix(giMix(c.x) ^ (giMix(c.y)*31u) ^ (giMix(c.z)*131u)
                 ^ giMix(face + 8u*uint(int(floor(plane*8.0+0.5))))) | 1u;
}
ivec2 giSlot(uint key,int i) {
    uint j = ((key >> 1u) + uint(i)) & 65535u;
    return ivec2(j & 511u,j >> 9u);
}
vec4 giReadField(ivec2 slot, int entry, bool useA) {
    ivec2 p=ivec2(slot.x*7+entry,slot.y);
    return useA ? texelFetch(giFieldA,p,0) : texelFetch(giFieldB,p,0);
}
bool giLookup(ivec3 cell, vec3 local, vec3 n, int axis, bool previous, int entry, out vec4 field, out vec3 anchor, out ivec2 storedSlot) {
    uint key = giKey(cell,local,n,axis);
    bool useA = ((frameCounter & 1) == 0) != previous;
    uint tag = uint(frameCounter) + (previous ? 0u : 1u);
    uint bestAge=17u;
    for (int i=0;i<4;++i) {
        ivec2 p = giSlot(key,i);
        uvec4 s = useA ? texelFetch(giStampA,p,0) : texelFetch(giStampB,p,0);
        uint age=tag-s.w;
        if (s.x!=key || s.w==0u || age>=bestAge || (!previous && age!=0u)) continue;
        vec3 storedN = unpackSnorm4x8(s.z).xyz;
        vec3 a=unpackUnorm4x8(s.y).xyz;
        if (dot(n,storedN)<0.92 || abs(dot(storedN,a-local))>0.08) continue;
        anchor=a; storedSlot=p; bestAge=age;
        if (age==0u) break;
    }
    if (bestAge==17u) return false;
    field=giReadField(storedSlot,entry,useA);
    return true;
}

// Read the four neighbouring patches on the receiver plane. Interior gaps and
// different normals/depths carry zero weight instead of darkening the result.
bool giIrradiance(vec3 pos, vec3 n, out vec3 irradiance) {
    vec3 g = pos + fract(cameraPosition);
    ivec3 cell = ivec3(floor(g));
    vec3 local = fract(g);
    int axis = giAxis(n), u = (axis+1)%3, v = (axis+2)%3;
    vec2 delta = vec2(local[u],local[v])-0.5;
    vec3 sum = vec3(0.0);
    float total = 0.0;
    int links = 0;
    for (int j=0;j<4;++j) {
        ivec3 off = ivec3(0);
        if ((j&1)!=0) off[u]=int(sign(delta.x));
        if ((j&2)!=0) off[v]=int(sign(delta.y));
        off[axis]=int(round(-dot(n,vec3(off))/n[axis]));
        if (j!=0 && (links & (1<<((off[v]+1)*3+off[u]+1)))==0) continue;
        vec4 field; vec3 anchor; ivec2 slot;
        if (!giLookup(cell+off,local-vec3(off),n,axis,false,6,field,anchor,slot) &&
            !giLookup(cell+off,local-vec3(off),n,axis,true,6,field,anchor,slot)) continue;
        if (j==0) links=int(field.a);
        vec2 w = mix(1.0-abs(delta),abs(delta),bvec2((j&1)!=0,(j&2)!=0));
        sum += field.rgb*w.x*w.y; total += w.x*w.y;
    }
    irradiance = sum / max(total,1e-5);
    return total>1e-5;
}
