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

vec3 rtFaceVisibility(vec3 pos,vec3 grid,vec3 target,ivec3 cell,vec3 normal,bool clearPath,out float cosine) {
    vec3 delta=target-grid;
    float d=max(length(delta),0.001);
    vec3 dir=delta/d;
    cosine=max(dot(normal,dir),0.0);
    if (clearPath) return vec3(1.0);
    if (cosine==0.0) return vec3(0.0);
    return rtVisibilityTo(pos,dir,max(0.0001,d-0.0003),cell);
}

float rtAreaCosine(vec3 delta,vec3 normal,vec3 u,vec3 v) {
    float sum=0.0;
    for (int i=0;i<4;++i) {
        vec3 d=delta+0.57735027*(float(2*(i&1)-1)*u+float(2*(i>>1)-1)*v);
        sum+=max(dot(normal,d),0.0)*inversesqrt(max(dot(d,d),1e-8));
    }
    return 0.25*sum;
}

// RGB is premultiplied by replacement coverage. An occluded lamp still
// replaces the baked block light, so the warm fallback cannot shine through it.
vec4 rtLamp(vec3 pos,vec3 grid,vec3 normal,uint index,ivec3 cell,int phase) {
    bool area=phase>=0;
    uint record=texelFetch(rtLights,rtSourceSlot(index),0).r;
    vec3 center=vec3(cell)+0.5, toReceiver=grid-center;
    float level=clamp((rtLightLevel(record)-max(length(toReceiver)-0.5,0.0))/15.0,0.0,1.0);
    float cover=smoothstep(0.0,0.18,level);
    if (cover<=0.0) return vec4(0.0);
    if (dot(toReceiver,normal)>0.87) return vec4(0.0,0.0,0.0,cover);
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
        uint point=texelFetch(rtLights,rtSourceSlot(index)+ivec3(0,0,rtSourceSlices),0).r;
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
    float cosine;
    if (area && clearPath) vis=vec3(rtAreaCosine(t-grid,normal,u,v));
    else if (area) {
        // Four points of a 64-point 2D Sobol net. A 4x4 filter footprint
        // combines all sixteen phases. Keep the pattern fixed between frames.
        uvec3 worldCell=uvec3(ivec3(floor(cameraPosition))+cell-rtGridSize/2);
        uint seed=rtHash(worldCell.x*73856093u ^ worldCell.y*19349663u ^ worldCell.z*83492791u);
        vec3 sum=vec3(0.0);float totalCosine=0.0;
        // Digital shifts for Sobol dimensions 1 and 2, in six-bit coordinates.
        int p=phase^int(seed&15u);
        int xs=((p&1)<<3)|((p&2)<<1)|((p&4)>>1)|((p&8)>>3);
        int ys=((p&1)*40)^(((p>>1)&1)*60)^(((p>>2)&1)*34)^(((p>>3)&1)*51);
        for (int j=0;j<2;++j) {
            int x=j*32+xs, y=(j*32)^ys;
            vec2 d=(vec2(x,y)+0.5)/32.0-1.0;
            vec2 e=(vec2(x^16,y^48)+0.5)/32.0-1.0;
            if ((seed&16u)!=0u) {d=d.yx;e=e.yx;}
            float ca,cb;
            vec3 a=rtFaceVisibility(pos,grid,t+d.x*u+d.y*v,cell,normal,false,ca);
            vec3 b=rtFaceVisibility(pos,grid,t+e.x*u+e.y*v,cell,normal,false,cb);
            sum+=a*ca+b*cb;totalCosine+=ca+cb;
        }
        vis=sum*(rtAreaCosine(t-grid,normal,u,v)/max(totalCosine,1e-6));
    } else {
        vis=rtFaceVisibility(pos,grid,t,cell,normal,clearPath,cosine);
        vis*=cosine;
    }
    float f=VANILLA_BLOCK_LIGHT_FADE;
    float strength=1.0/(f-f*f/(1.0+f)*level)-1.0/f;
    return vec4(vis*rtLightRGB(record)*(strength*strength*LIGHT_BRIGHTNESS),cover);
}

uint rtListedSource(ivec3 brick,int lane,ivec3 shift) {
    uint ref=texelFetch(rtLights,rtLightListSlot(brick,lane),0).r;
    if (ref==0u) return 0u;
    ivec3 delta=ivec3(ref&63u,(ref>>6u)&63u,(ref>>12u)&63u)-16;
    return rtCellKey(brick*rtLightBrickSize+delta-shift);
}

int rtEmitterPhase(ivec2 p) {
    ivec2 high=(p>>1)&1, low=p&1;
    return low.x+2*low.y+4*(high.x+2*high.y);
}

float rtLocalFade(vec3 pos) {
    return 1.0-smoothstep(float(RT_DISTANCE)-min(15.0,float(RT_DISTANCE)*0.25),float(RT_DISTANCE),length(pos));
}

// Primary receivers must see every emitter in range, even if other lamps
// across a wall would win all four slots of the cheaper bounce-light list.
vec4 rtDirectLamps(vec3 pos,vec3 normal,int phase) {
    if (!rtInRange(pos)) return vec4(0.0);
    vec3 grid=pos+fract(cameraPosition)+float(rtGridSize/2);
    if ((texelFetch(rtRegions,ivec3(floor(grid))>>5,0).r&2u)==0u) return vec4(0.0);
    const float reach=15.5;
    ivec3 lo=max(ivec3(floor((grid-reach)/16.0)),ivec3(0));
    ivec3 hi=min(ivec3(floor((grid+reach)/16.0)),ivec3(rtBinCount-1));
    vec4 sum=vec4(0.0);
    for (int z=lo.z;z<=hi.z;++z) for (int y=lo.y;y<=hi.y;++y) for (int x=lo.x;x<=hi.x;++x) {
        ivec3 bin=ivec3(x,y,z);
        vec3 gap=max(abs(grid-(vec3(bin)*16.0+8.0))-7.5,0.0);
        if (dot(gap,gap)>=reach*reach) continue;
        uint head=texelFetch(rtLights,rtEmitterHeadSlot(bin),0).r;
        while (head!=0u) {
            uint index=head-1u;
            ivec2 slot=ivec2(index&255u,index>>8u);
            ivec3 cell=rtDecodeCell(texelFetch(rtKeys,slot,0).r);
            vec4 lamp=rtLamp(pos,grid,normal,index,cell,phase);
            sum.rgb+=lamp.rgb;sum.a=max(sum.a,lamp.a);
            head=texelFetch(rtLights,rtEmitterNextSlot(index),0).r;
        }
    }
    return sum*rtLocalFade(pos);
}

vec4 rtBounceLamps(vec3 pos,vec3 normal) {
    if (!rtInRange(pos)) return vec4(0.0);
    ivec3 shift=rtLightShift(cameraPosition);
    vec3 grid=pos+fract(cameraPosition)+float(rtGridSize/2);
    if ((texelFetch(rtRegions,ivec3(floor(grid))>>5,0).r&2u)==0u) return vec4(0.0);
    vec3 site=(grid+vec3(shift))/float(rtLightBrickSize)-0.5;
    ivec3 base=ivec3(floor(site)),last=(ivec3(rtGridSize-1)+shift)/rtLightBrickSize;
    vec3 f=smoothstep(vec3(0.35),vec3(0.65),fract(site));
    ivec3 first=ivec3(equal(f,vec3(1.0))),end=ivec3(greaterThan(f,vec3(0.0)));
    vec4 result=vec4(0.0);
    // A source may rank differently in each brick. Trace the union once;
    // keep coverage per brick so a blocked lamp still replaces baked light.
    uint keys[32], membership[32];
    float weights[32], brickWeights[8], coverage[8];
    int count=0, bricks=0;
    for (int z=first.z;z<=end.z;++z) for (int y=first.y;y<=end.y;++y) for (int x=first.x;x<=end.x;++x) {
        ivec3 off=ivec3(x,y,z), brick=clamp(base+off,ivec3(0),last);
        vec3 k=mix(1.0-f,f,vec3(off));
        float w=k.x*k.y*k.z;
        brickWeights[bricks]=w; coverage[bricks]=0.0;
        for (int lane=0;lane<rtLightsPerBrick;++lane) {
            uint key=rtListedSource(brick,lane,shift);
            if (key==0u) break;
            int i=0; while (i<count && keys[i]!=key) ++i;
            if (i==count) {keys[i]=key; weights[i]=0.0; membership[i]=0u; ++count;}
            weights[i]+=w; membership[i]|=1u<<uint(bricks);
        }
        ++bricks;
    }
    for (int i=0;i<count;++i) {
        uint key=keys[i],hash=rtHash(key),index=0xffffffffu;
        for (int j=0;j<rtMaxProbes;++j) {
            ivec2 slot=rtSlot(hash,j);
            uint stored=texelFetch(rtKeys,slot,0).r;
            if (stored==key) {
                index=uint(slot.x+256*slot.y);
                break;
            }
            if (stored==0u) break;
        }
        if (index==0xffffffffu) continue;
        vec4 lamp=rtLamp(pos,grid,normal,index,rtDecodeCell(key),-1);
        result.rgb+=weights[i]*lamp.rgb;
        for (int j=0;j<bricks;++j)
            if ((membership[i]&(1u<<uint(j)))!=0u) coverage[j]=max(coverage[j],lamp.a);
    }
    for (int j=0;j<bricks;++j) result.a+=brickWeights[j]*coverage[j];
    // A lamp can leave the captured scene while its receiver is still inside.
    // Transition back to the baked term over the outer local-light radius.
    return result*rtLocalFade(pos);
}
