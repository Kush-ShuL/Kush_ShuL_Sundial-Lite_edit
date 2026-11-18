#include "/libs/RTLightGrid.glsl"
uniform usampler3D rtLights;

// Prove an entire bundle clear from the per-axis occupancy of each brick.
// A positive bit is only a possible blocker: those paths still test the mesh.
bool rtClearLampBox(ivec3 lo,ivec3 hi) {
    ivec3 first=lo>>3,last=hi>>3;
    if (any(greaterThan(last-first,ivec3(1)))) return false;
    for (int z=first.z;z<=last.z;++z) for (int y=first.y;y<=last.y;++y) for (int x=first.x;x<=last.x;++x) {
        ivec3 brick=ivec3(x,y,z);
        uint mask=texelFetch(rtBricks,brick,0).r;
        if (mask==0u) continue;
        uvec3 a=uvec3(max(lo-brick*8,0)), b=uvec3(min(hi-brick*8,7));
        uvec3 span=((uvec3(2)<<b)-1u) & (uvec3(255)<<a);
        uvec3 occupied=uvec3(mask>>8u,mask>>16u,mask>>24u)&255u;
        if (all(notEqual(occupied&span,uvec3(0)))) return false;
    }
    return true;
}

vec3 rtFaceSample(vec3 pos,vec3 grid,vec3 target,ivec3 cell,vec3 normal,bool clearPath) {
    vec3 delta=target-grid;
    float d=max(length(delta),0.001);
    vec3 dir=delta/d;
    float cosine=max(dot(normal,dir),0.0);
    if (clearPath) return vec3(cosine);
    if (cosine==0.0) return vec3(0.0);
    return cosine*rtVisibilityTo(pos,dir,max(0.0001,d-0.0003),cell);
}

// RGB is premultiplied by replacement coverage. An occluded lamp still
// replaces the baked block light, so the warm fallback cannot shine through it.
vec4 rtLamp(vec3 pos,vec3 grid,vec3 normal,uint key,bool area) {
    uint hash=rtHash(key),index=0u;
    for (int i=0;i<rtMaxProbes;++i) {
        ivec2 slot=rtSlot(hash,i);
        uint stored=texelFetch(rtKeys,slot,0).r;
        if (stored==key) {index=uint(slot.x+256*slot.y);break;}
        if (stored==0u || i+1==rtMaxProbes) return vec4(0.0);
    }
    uint record=texelFetch(rtLights,rtSourceSlot(index),0).r;
    ivec3 cell=rtDecodeCell(key);
    vec3 center=vec3(cell)+0.5, toReceiver=grid-center;
    float level=clamp((rtLightLevel(record)-max(length(toReceiver)-0.5,0.0))/15.0,0.0,1.0);
    float cover=smoothstep(0.0,0.18,level);
    if (cover<=0.0) return vec4(0.0);
    int face=-1; float best=0.0;
    for (int i=0;i<6;++i) {
        float d=toReceiver[i/2]*float(2*(i&1)-1);
        if ((record&(1u<<uint(i)))!=0u && d>best) {best=d;face=i;}
    }
    vec3 t=center, u=vec3(0.0),v=vec3(0.0);
    if (face>=0) {
        // The representative point slides continuously over adjacent cube
        // faces instead of jumping between their centres at the bisector.
        for(int i=0;i<6;++i) if ((record&(1u<<uint(i)))!=0u) {
            int axis=i/2; float side=float(2*(i&1)-1);
            float w=clamp(side*toReceiver[axis]/best,0.0,1.0);
            t[axis]+=0.5*side*w*w*w*w;
        }
        int a=(face/2+1)%3,b=(face/2+2)%3;
        u[a]=min(0.42,0.5-abs(t[a]-center[a]));
        v[b]=min(0.42,0.5-abs(t[b]-center[b]));
    } else {
        uint point=texelFetch(rtLights,rtSourceSlot(index)+ivec3(0,0,64),0).r;
        t=vec3(cell)+vec3((point>>8u)&255u,(point>>16u)&255u,point&255u)/255.0;
        // A torch flame is a small emitter above the stem, not a downward
        // facing square at the foot of its block.
        u=vec3(0.07,0,0);v=vec3(0,0.07,0.05);
    }
    if (dot(t-grid,normal)+abs(dot(u,normal))+abs(dot(v,normal))<=0.0)
        return vec4(0.0,0.0,0.0,cover);
    vec3 extent=area ? abs(u)+abs(v) : vec3(0.0);
    ivec3 lo=ivec3(floor(min(grid,t-extent))),hi=ivec3(floor(max(grid,t+extent)));
    // For a ray arriving from outside at the lower face, its open segment
    // ends before entering the emitting block.
    if (face>=0 && (face&1)==0 && grid[face/2]<t[face/2]) hi[face/2]=cell[face/2]-1;
    vec3 farCorner=abs(t-grid+pos)+extent;
    bool clearPath=dot(farCorner,farCorner)<float(RT_DISTANCE*RT_DISTANCE) && rtClearLampBox(lo,hi);
    vec3 vis;
    if (area) {
        // Rotate opposite pairs over the source, continuously in surface space.
        // A fixed cross projects the same four shadow boundaries down the wall.
        float phase=dot(toReceiver,vec3(12.73,17.91,21.37))
                   +2.4*sin(dot(toReceiver,vec3(7.1,-9.3,6.7)));
        vec2 rot=vec2(cos(phase),sin(phase));
        vec3 sum=vec3(0.0),lo=vec3(1.0),hi=vec3(0.0);
        int pairs=2;
        for(int j=0;j<4;++j) {
            if (j==2) {
                if (max(hi.r-lo.r,max(hi.g-lo.g,hi.b-lo.b))<0.045) break;
                rot=0.70710678*vec2(rot.x-rot.y,rot.x+rot.y);
                pairs=4;
            }
            vec2 d=(j&1)==0 ? rot*0.46 : vec2(-rot.y,rot.x)*0.89;
            vec3 off=d.x*u+d.y*v;
            vec3 a=rtFaceSample(pos,grid,t+off,cell,normal,clearPath);
            vec3 b=rtFaceSample(pos,grid,t-off,cell,normal,clearPath);
            lo=min(lo,min(a,b));hi=max(hi,max(a,b));sum+=a+b;
        }
        vis=sum/float(2*pairs);
    } else vis=rtFaceSample(pos,grid,t,cell,normal,clearPath);
    float f=VANILLA_BLOCK_LIGHT_FADE;
    float strength=1.0/(f-f*f/(1.0+f)*level)-1.0/f;
    return vec4(vis*rtLightRGB(record)*(strength*strength*LIGHT_BRIGHTNESS),cover);
}

uint rtListedSource(ivec3 brick,int lane,ivec3 shift) {
    uint ref=texelFetch(rtLights,rtLightListSlot(brick,lane),0).r;
    if (ref==0u) return 0u;
    ivec3 delta=ivec3(ref&63u,(ref>>6u)&63u,(ref>>12u)&63u)-16;
    return rtCellKey(brick*8+delta-shift);
}

vec4 rtLocalLighting(vec3 pos,vec3 normal,bool area) {
    if (!rtInRange(pos)) return vec4(0.0);
    ivec3 shift=rtLightShift(cameraPosition);
    vec3 grid=pos+fract(cameraPosition)+float(rtGridSize/2);
    if ((texelFetch(rtRegions,ivec3(floor(grid))>>5,0).r&2u)==0u) return vec4(0.0);
    vec3 site=(grid+vec3(shift))/8.0-0.5;
    ivec3 base=ivec3(floor(site)),last=(ivec3(rtGridSize-1)+shift)>>3;
    // Blend only near boundaries and trace each distinct source once per lane.
    vec3 f=smoothstep(vec3(0.35),vec3(0.65),fract(site));
    vec4 result=vec4(0.0);
    ivec3 firstTap=ivec3(equal(f,vec3(1.0))),lastTap=ivec3(greaterThan(f,vec3(0.0)));
    for (int lane=0;lane<4;++lane) {
        uint ids[8]; float weights[8]; int count=0;
        if (all(equal(firstTap,lastTap))) {
            uint key=rtListedSource(clamp(base+firstTap,ivec3(0),last),lane,shift);
            if (key==0u) continue;
            ids[0]=key;weights[0]=1.0;count=1;
        } else
        for (int z=firstTap.z;z<=lastTap.z;++z) for (int y=firstTap.y;y<=lastTap.y;++y) for (int x=firstTap.x;x<=lastTap.x;++x) {
            ivec3 off=ivec3(x,y,z);
            vec3 k=mix(1.0-f,f,vec3(off));
            float w=k.x*k.y*k.z;
            if (w<=0.0) continue;
            ivec3 brick=clamp(base+off,ivec3(0),last);
            uint id=rtListedSource(brick,lane,shift);
            if (id==0u) continue;
            int i=0; for (;i<count;++i) if (ids[i]==id) break;
            if (i==count) {ids[i]=id;weights[i]=0.0;++count;}
            weights[i]+=w;
        }
        vec4 sum=vec4(0.0);
        for (int i=0;i<count;++i) sum+=weights[i]*rtLamp(pos,grid,normal,ids[i],area);
        result.rgb+=sum.rgb; result.a=max(result.a,sum.a);
    }
    // A lamp can leave the captured scene while its receiver is still inside.
    // Transition back to the baked term over the outer local-light radius.
    return result*(1.0-smoothstep(float(RT_DISTANCE)-min(15.0,float(RT_DISTANCE)*0.25),
                                  float(RT_DISTANCE),length(pos)));
}
