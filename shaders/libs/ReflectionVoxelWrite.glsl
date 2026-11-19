#include "/libs/ReflectionGrid.glsl"
layout(r32ui) uniform uimage2D rtKeyImage, rtHeadImage, rtTriangleCount;
layout(rgba32ui) writeonly uniform uimage2D rtTriangleImage;
layout(r32ui) uniform uimage3D rtBrickImage;
#if defined RT_GI && !defined RT_ENTITY_GEOMETRY
#include "/libs/RTLightGrid.glsl"
layout(r32ui) uniform uimage3D rtLightImage;
uint rtSourceColor(uint level, vec3 color) {
    float peak = max(max(color.r,color.g),color.b);
    if (peak < 0.005) return 0u;
    uvec3 rgb = uvec3(round(31.0 * color / peak));
    uint quality = uint(round(127.0 * clamp(peak,0.0,1.0)));
    return (level<<28u)|(quality<<21u)|(rgb.b<<16u)|(rgb.g<<11u)|(rgb.r<<6u);
}
#endif
#ifdef RT_ENTITY_GEOMETRY
layout(rgba8) writeonly uniform image2D rtEntityColorImage;
layout(r32ui) uniform uimage2D rtEntityTileCount;

// Only the shadow draw has the bound skin/item texture. Copy its texel
// rectangle, not a resampling of the triangle in barycentric coordinates.
uint captureEntityTile(out uvec3 packedUV) {
    uint tile = imageAtomicAdd(rtEntityTileCount, ivec2(0), 1u);
    if (tile >= rtEntityTileLimit) return 0u;
    vec2 size=vec2(textureSize(gtexture,0));
    vec2 p0=rtUV[0]*size,p1=rtUV[1]*size,p2=rtUV[2]*size;
    vec2 lo=floor(min(p0,min(p1,p2)));
    vec2 extent=max(ceil(max(p0,max(p1,p2)))-lo,1.0);
    vec3 center = (rtPosition[0]+rtPosition[1]+rtPosition[2])/3.0;
    float d2 = dot(center,center);
    ivec2 dim=ivec2(min(extent,vec2(d2>576.0 ? 8.0 : (d2>144.0 ? 16.0 : 32.0))));
    uint base=16u*tile, count=uint(dim.x*dim.y);
    if (count>16u) {
        uint offset=imageAtomicAdd(rtEntityTileCount,ivec2(1,0),count);
        if (offset+count<=2048u*1024u-rtEntityDetailStart) base=rtEntityDetailStart+offset;
        else dim=min(dim,ivec2(4));
    }
    for (int i=0;i<3;++i) {
        uvec2 local=uvec2(round(clamp((rtUV[i]*size-lo)/extent,0.0,1.0)*4095.0));
        packedUV[i]=local.x|(local.y<<12u)|(uint(round(clamp(rtVertexAlpha[i],0.0,1.0)*255.0))<<24u);
    }
    bool textBackground=rtModelId[0]==7004 && all(lessThan(max(p0,max(p1,p2))-min(p0,min(p1,p2)),vec2(0.001)));
    for (int y=0;y<dim.y;++y) for (int x=0;x<dim.x;++x) {
        vec2 texel=lo+floor((vec2(x,y)+0.5)*extent/vec2(dim));
        vec4 color=textBackground ? vec4(1.0) : textureLod(gtexture,(texel+0.5)/size,0.0);
        imageStore(rtEntityColorImage,rtEntityPixel(base+uint(y*dim.x+x)),color);
    }
    return (base+1u)|(uint(dim.x-1)<<22u)|(uint(dim.y-1)<<27u);
}
#endif

ivec2 rtClaimCell(ivec3 cell) {
    uint key = rtCellKey(cell), hash = rtHash(key);
    for (int probe = 0; probe < rtMaxProbes; ++probe) {
        ivec2 slot = rtSlot(hash, probe);
        uint previous = imageAtomicCompSwap(rtKeyImage, slot, 0u, key);
        if (previous==0u || previous==key) return slot;
    }
    return ivec2(-1);
}

// Tag the plane and right-angle corner of an exact half-square, retaining
// the original first vertex for the texture footprint under upscaling.
uint rtUnitFace(vec3 a,vec3 b,vec3 c,inout uvec3 uv) {
    if (any(notEqual(a,clamp(round(a),0.0,1.0))) ||
        any(notEqual(b,clamp(round(b),0.0,1.0))) ||
        any(notEqual(c,clamp(round(c),0.0,1.0)))) return 0u;
    ivec3 v=ivec3(dot(a,vec3(1,2,4)),dot(b,vec3(1,2,4)),dot(c,vec3(1,2,4)));
    int span=(v.x^v.y)|(v.x^v.z);
    int axis=span==6 ? 0 : (span==5 ? 1 : (span==3 ? 2 : -1));
    if (axis<0 || v.x==v.y || v.y==v.z || v.z==v.x) return 0u;
    int r=(v.y^v.z)==span ? 0 : ((v.z^v.x)==span ? 1 : 2);
    int u=(axis+1)%3, h=(r+1)%3, k=(r+2)%3;
    if ((v[r]^v[h])!=(1<<u)) {int tmp=h;h=k;k=tmp;}
    uv=uvec3(uv[r],uv[h],uv[k]);
    uint first=r==0 ? 0u : (h==0 ? 1u : 2u);
    return uint(axis+1)|(uint((v[r]>>axis)&1)<<2u)|(uint((v[r]>>u)&1)<<3u)|
           (uint((v[r]>>((u+1)%3))&1)<<4u)|(first<<5u);
}

void rtInsertTriangle(ivec3 cell, vec3 a, vec3 b, vec3 c, uvec3 uv, uvec2 material, uint tile, uint source, vec3 sourcePoint) {
    ivec2 slot=rtClaimCell(cell);
    if (slot.x<0) return;
    #if defined RT_GI && !defined RT_ENTITY_GEOMETRY
        if (source!=0u) {
            uint face=0u;
            // A torch foot or a lantern base is not a full emitting face.
            vec3 extent=max(a,max(b,c))-min(a,min(b,c));
            for (int axis=0;axis<3;++axis) {
                if (min(extent[(axis+1)%3],extent[(axis+2)%3])<0.82) continue;
                if (max(a[axis],max(b[axis],c[axis]))<0.001 && min(a[axis],min(b[axis],c[axis]))>-0.001)
                    face |= 1u<<uint(2*axis);
                if (min(a[axis],min(b[axis],c[axis]))>0.999 && max(a[axis],max(b[axis],c[axis]))<1.001)
                    face |= 2u<<uint(2*axis);
            }
            ivec3 at=rtSourceSlot(uint(slot.x+256*slot.y));
            uvec3 anchor=uvec3(round(255.0*clamp(sourcePoint,0.0,1.0)));
            uint power=(source>>21u)&127u;
            imageAtomicMax(rtLightImage,at+ivec3(0,0,rtSourceSlices),
                (power<<24u)|(anchor.y<<16u)|(anchor.x<<8u)|anchor.z);
            uint old=imageLoad(rtLightImage,at).r;
            for (;;) {
                uint value=max(old & ~63u,source) | (old & 63u) | face;
                if (value==old) break;
                uint seen=imageAtomicCompSwap(rtLightImage,at,old,value);
                if (seen==old) break;
                old=seen;
            }
        }
    #endif
    uint index=imageAtomicAdd(rtTriangleCount,ivec2(0),1u);
    if (index>=384u*uint(RT_CACHE_K)) return;
    uint next=imageAtomicExchange(rtHeadImage,slot,index+1u);
    if (next==0u) imageAtomicOr(rtBrickImage,cell>>3,rtSubBrickBit(cell)|rtAxisBits(cell));
    ivec2 dst=rtTriangleSlot(index);
    uint face=tile==0u ? rtUnitFace(a,b,c,uv) : 0u;
    if (face!=0u) {
        imageStore(rtTriangleImage,dst,uvec4(uv,(face<<24u)|next));
        imageStore(rtTriangleImage,dst+ivec2(1,0),uvec4(material,0u,0u));
        return;
    }
    imageStore(rtTriangleImage,dst,uvec4(packHalf2x16(a.xy),packHalf2x16(vec2(a.z,b.x)),packHalf2x16(b.yz),next));
    imageStore(rtTriangleImage,dst+ivec2(1,0),uvec4(packHalf2x16(c.xy),floatBitsToUint(c.z),uv.xy));
    imageStore(rtTriangleImage,dst+ivec2(2,0),uvec4(uv.z,material,tile));
}

void captureReflectionTriangle() {
    #ifdef RT_TRANSLUCENT_GEOMETRY
        if (rtLight[0].z < 0.0) return; // Water keeps its existing caustic path.
    #endif
    vec3 a = rtPosition[0], b = rtPosition[1], c = rtPosition[2];
    vec3 n = cross(b - a, c - a);
    if (dot(n, n) < 1e-14) return;
    vec3 lo = min(a, min(b, c)), hi = max(a, max(b, c));
    vec3 nearest = clamp(vec3(0.0), lo, hi);
    if (dot(nearest, nearest) >= float(RT_DISTANCE * RT_DISTANCE)) return;
    vec3 offset = fract(cameraPosition) + float(rtGridSize / 2);
    lo += offset; hi += offset;
    // A grid-aligned face belongs to the cell on its inner side. Extended
    // models (e.g. a tall fence) are indexed in every cell they overlap.
    ivec3 first = ivec3(floor(lo + 0.0001)), last = ivec3(floor(hi - 0.0001));
    for (int axis = 0; axis < 3; ++axis) {
        if (last[axis] < first[axis]) {
            first[axis] = int(floor(0.5 * (lo[axis] + hi[axis]) - sign(n[axis]) * 0.0002));
            last[axis] = first[axis];
        }
    }
    first = max(first, ivec3(0)); last = min(last, ivec3(rtGridSize - 1));
    uvec3 uv = uvec3(packUnorm2x16(rtUV[0]), packUnorm2x16(rtUV[1]), packUnorm2x16(rtUV[2]));
    uvec3 tint = uvec3(round(clamp((rtTint[0] + rtTint[1] + rtTint[2]) / 3.0, 0.0, 1.0) * 255.0));
    vec3 light = (rtLight[0] + rtLight[1] + rtLight[2]) / 3.0;
    uvec2 lm = uvec2(round(light.xy * 15.0));
    uint lighting = tint.r | (tint.g << 8u) | (tint.b << 16u) | (lm.x << 24u) | (lm.y << 28u);
    uint flags = uint(round(clamp(light.z, 0.0, 15.0))) << 24u;
    #if (RT_BOUNCES > 1 || defined RT_GI) && defined MC_SPECULAR_MAP
        GbufferData mat;
        SPECULAR_FORMAT(mat, textureLod(specular, (rtUV[0] + rtUV[1] + rtUV[2]) / 3.0, 0.0));
        #ifdef SPECULAR_EMISSIVE
            flags = max(flags, uint(round(15.0 * clamp(mat.emissive, 0.0, 1.0))) << 24u);
        #endif
        flags |= uint(round(clamp(mat.smoothness, 0.0, 1.0) * 255.0)) << 8u;
        flags |= uint(round(clamp(mat.metalness, 0.0, 1.0) * 255.0)) << 16u;
    #endif
    uint tile = 0u, source = 0u;
    vec3 sourcePoint=(a+b+c)/3.0;
    #ifdef RT_TRANSLUCENT_GEOMETRY
        flags |= 1u;
    #endif
    #if defined RT_GI && !defined RT_ENTITY_GEOMETRY
        if ((flags >> 24u) != 0u && all(lessThanEqual(first,last))) {
            for (int i=0;i<4;++i) {
                vec3 w=vec3(1.0/3.0);
                if (i<3) {w=vec3(0.1);w[i]=0.8;}
                vec4 texel=textureLod(gtexture,rtUV[0]*w.x+rtUV[1]*w.y+rtUV[2]*w.z,0.0);
                uint sampleLight=texel.a>0.05 ? rtSourceColor(flags>>24u,pow(texel.rgb*vec3(tint)/255.0,vec3(2.2))) : 0u;
                if (sampleLight>source) {source=sampleLight;sourcePoint=a*w.x+b*w.y+c*w.z;}
            }
        }
    #endif
    #ifdef RT_ENTITY_GEOMETRY
        tile = captureEntityTile(uv);
        if (tile == 0u) return;
    #endif
    for (int z = first.z; z <= last.z; ++z)
    for (int y = first.y; y <= last.y; ++y)
    for (int x = first.x; x <= last.x; ++x) {
        ivec3 cell = ivec3(x, y, z);
        vec3 local = offset - vec3(cell);
        if (any(notEqual(first,last)) && abs(dot(n, a + local - 0.5)) > dot(abs(n),vec3(0.5001))) continue;
        rtInsertTriangle(cell, a + local, b + local, c + local, uv, uvec2(lighting, flags), tile, source,sourcePoint+local);
    }
}
