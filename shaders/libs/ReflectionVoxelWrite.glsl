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

// The entity's bound texture (skins, equipment or display items) is available
// at draw time only. Keep a tile in barycentric coordinates with this triangle.
uint captureEntityTile() {
    uint tile = imageAtomicAdd(rtEntityTileCount, ivec2(0), 1u);
    if (tile >= 32768u) return 0u;
    ivec2 base = 8 * ivec2(tile & 255u, tile >> 8u);
    vec3 center = (rtPosition[0]+rtPosition[1]+rtPosition[2])/3.0;
    float d2 = dot(center,center);
    vec2 span = (max(rtUV[0],max(rtUV[1],rtUV[2])) - min(rtUV[0],min(rtUV[1],rtUV[2]))) * textureSize(gtexture,0);
    int side = min(d2 > 576.0 ? 2 : (d2 > 64.0 ? 4 : 8), max(1,int(ceil(max(span.x,span.y)))));
    for (int y = 0; y < side; ++y) for (int x = 0; x < side; ++x) {
        vec2 bc = side == 1 ? vec2(1.0/3.0) : vec2(x, y) / float(side-1);
        if (bc.x + bc.y > 1.0) bc /= bc.x + bc.y;
        vec3 w = vec3(1.0 - bc.x - bc.y, bc);
        bool textBackground=rtModelId[0]==7004 && all(lessThan(span,vec2(0.001)));
        vec4 sampleColor = textBackground ? vec4(1.0) : textureLod(gtexture, rtUV[0]*w.x + rtUV[1]*w.y + rtUV[2]*w.z, 0.0);
        sampleColor.a *= dot(w, vec3(rtVertexAlpha[0], rtVertexAlpha[1], rtVertexAlpha[2]));
        imageStore(rtEntityColorImage, base + ivec2(x, y), vec4(sampleColor.rgb * sampleColor.a, sampleColor.a));
    }
    return (tile + 1u) | (uint(side - 1) << 16u);
}
#endif

// One sparse list per grid cell. Opposing faces, stair treads and fence rails
// can all coexist; no triangle takes ownership of an entire block face.
void rtInsertTriangle(ivec3 cell, vec3 a, vec3 b, vec3 c, uvec3 uv, uvec2 material, uint tile, uint source, vec3 sourcePoint) {
    uint key = rtCellKey(cell), hash = rtHash(key);
    for (int probe = 0; probe < rtMaxProbes; ++probe) {
        ivec2 slot = rtSlot(hash, probe);
        uint previous = imageAtomicCompSwap(rtKeyImage, slot, 0u, key);
        if (previous != 0u && previous != key) continue;
        // Publish occupancy once, even if another invocation gets the last
        // triangle allocation before this one.
        if (previous==0u) imageAtomicOr(rtBrickImage,cell>>3,rtSubBrickBit(cell)|rtAxisBits(cell));
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
                imageAtomicMax(rtLightImage,at+ivec3(0,0,64),
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
        uint index = imageAtomicAdd(rtTriangleCount, ivec2(0), 1u);
        if (index >= 384u * uint(RT_CACHE_K)) return;
        uint next = imageAtomicExchange(rtHeadImage, slot, index + 1u);
        ivec2 dst = rtTriangleSlot(index);
        imageStore(rtTriangleImage, dst, uvec4(packHalf2x16(a.xy), packHalf2x16(vec2(a.z, b.x)), packHalf2x16(b.yz), next));
        imageStore(rtTriangleImage, dst + ivec2(1, 0), uvec4(packHalf2x16(c.xy), floatBitsToUint(c.z), uv.xy));
        imageStore(rtTriangleImage, dst + ivec2(2, 0), uvec4(uv.z, material, tile));
        return;
    }
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
        tile = captureEntityTile();
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
