#include "/libs/ReflectionGrid.glsl"
uniform usampler2D rtKeys;
uniform usampler2D rtHeads;
uniform usampler2D rtTriangles;
uniform usampler3D rtBricks;
uniform usampler3D rtRegions;
uniform sampler2D rtBlockAtlas;
#ifdef RT_ENTITIES
uniform sampler2D rtEntityColors;
#endif

int rtStepWidth(ivec3 cell,bool shortSegment) {
    if (!shortSegment && (texelFetch(rtRegions,cell>>5,0).r & 1u)==0u) return 32;
    uint mask = texelFetch(rtBricks, cell >> 3, 0).r;
    if (mask == 0u) return 8;
    if ((mask & rtSubBrickBit(cell))==0u) return 4;
    uint axes=rtAxisBits(cell);
    return (mask&axes)==axes ? 1 : -1;
}

uint rtCellHead(ivec3 cell) {
    uint key = rtCellKey(cell), hash = rtHash(key);
    for (int probe = 0; probe < rtMaxProbes; ++probe) {
        ivec2 slot = rtSlot(hash, probe);
        uint stored = texelFetch(rtKeys, slot, 0).r;
        if (stored == 0u) break;
        if (stored == key) return texelFetch(rtHeads, slot, 0).r;
    }
    return 0u;
}

bool rtIntersectCell(uint head, vec3 origin, vec3 ray, float tMin, float tMax,bool visibility,bool terminalCell,
                     out float distanceAlongRay, out vec3 normal, out vec4 color, out uvec2 material) {
    bool found = false;
    distanceAlongRay = tMax;
    while (head != 0u) {
        ivec2 slot = rtTriangleSlot(head - 1u);
        uvec4 p = texelFetch(rtTriangles, slot, 0);
        uvec4 q = texelFetchOffset(rtTriangles, slot, 0, ivec2(1, 0));
        head = p.w;
        vec2 azbx = unpackHalf2x16(p.y);
        vec3 a = vec3(unpackHalf2x16(p.x), azbx.x);
        vec3 e1 = vec3(azbx.y, unpackHalf2x16(p.z)) - a;
        vec3 e2 = vec3(unpackHalf2x16(q.x), uintBitsToFloat(q.y)) - a;
        // Project shared vertices with the same shear on both triangles.
        // Opposite edge functions then agree even on the diagonal of a quad.
        vec3 ar=abs(ray);
        int z=ar.x>ar.y && ar.x>ar.z ? 0 : (ar.y>ar.z ? 1 : 2);
        int x=(z+1)%3,y=(z+2)%3;
        vec2 shear=vec2(ray[x],ray[y])/ray[z];
        vec3 va=a-origin, vb=vec3(azbx.y,unpackHalf2x16(p.z))-origin;
        vec3 vc=vec3(unpackHalf2x16(q.x),uintBitsToFloat(q.y))-origin;
        vec2 A=vec2(va[x],va[y])-shear*va[z], B=vec2(vb[x],vb[y])-shear*vb[z], C=vec2(vc[x],vc[y])-shear*vc[z];
        vec3 w=vec3(B.x*C.y-B.y*C.x,C.x*A.y-C.y*A.x,A.x*B.y-A.y*B.x);
        float det=w.x+w.y+w.z;
        if (abs(det)<1e-9 || any(lessThan(w*sign(det),vec3(-2e-6*abs(det))))) continue;
        w/=det;
        vec3 uvt=vec3(w.yz,dot(w,vec3(va[z],vb[z],vc[z]))/ray[z]);
        if (uvt.z<tMin || uvt.z>distanceAlongRay) continue;
        uvec4 m = texelFetchOffset(rtTriangles, slot, 0, ivec2(2, 0));
        vec2 uv0 = unpackUnorm2x16(q.z), uv1 = unpackUnorm2x16(q.w), uv2 = unpackUnorm2x16(m.x);
        vec2 uv = uv0 + uvt.x * (uv1 - uv0) + uvt.y * (uv2 - uv0);
        ivec2 size = textureSize(rtBlockAtlas, 0);
        // Keep exact edge hits on this triangle's atlas rectangle.
        ivec2 lo = ivec2(floor(min(uv0, min(uv1, uv2)) * vec2(size) + 0.25));
        ivec2 hi = ivec2(ceil(max(uv0, max(uv1, uv2)) * vec2(size) - 0.25)) - 1;
        ivec2 pixel = clamp(ivec2(uv * vec2(size)), lo, max(lo, hi));
        vec4 albedo;
        #ifdef RT_ENTITIES
        if (m.w != 0u) {
            uint tile = (m.w & 65535u) - 1u;
            vec2 pos = vec2(8u * uvec2(tile & 255u, tile >> 8u)) + 0.5 + float(m.w >> 16u) * clamp(uvt.xy, 0.0, 1.0);
            albedo = textureLod(rtEntityColors, pos / vec2(textureSize(rtEntityColors, 0)), 0.0);
            if (albedo.a < 1.0 / 255.0) continue;
            albedo.rgb /= albedo.a;
        } else
        #endif
        {
            albedo = texelFetch(rtBlockAtlas, clamp(pixel, ivec2(0), size - 1), 0);
            bool glass = (m.z & 1u) != 0u;
            if (albedo.a < (glass ? 1.0/255.0 : 0.5)) continue;
            #ifdef HELIAN_SR_ACTIVE
                // Filter colour over the input pixel footprint; keep the cutout test at LOD 0.
                if (!visibility || glass) {
                float footprint = uvt.z * 2.0 / max(abs(gbufferProjection[1].y) * screenSize.y, 1.0);
                vec2 atlas = vec2(size);
                float density = max(length((uv1-uv0)*atlas)/max(length(e1),0.001), length((uv2-uv0)*atlas)/max(length(e2),0.001));
                float mip = clamp(log2(max(1.0, density * footprint)), 0.0, floor(log2(float(max(1, min(hi.x-lo.x+1, hi.y-lo.y+1))))));
                vec2 margin = vec2(0.5 * exp2(ceil(mip)));
                vec2 center = (vec2(lo + hi) + 1.0) * 0.5;
                vec2 radius = max(vec2(0.0), 0.5 * vec2(hi - lo + 1) - margin);
                albedo.rgb = textureLod(rtBlockAtlas, clamp(uv*atlas,center-radius,center+radius)/atlas, mip).rgb;
                }
            #endif
            if (!glass) albedo.a = 1.0;
        }
        found = true;
        distanceAlongRay = uvt.z;
        if (!visibility) {
            vec3 gn=normalize(cross(e1,e2));
            normal=faceforward(gn,ray,gn);
        }
        color = albedo;
        material = m.yz;
        if (visibility && !terminalCell && albedo.a==1.0) return true;
    }
    return found;
}

vec3 rtTintRGB(uint tint) {
    return vec3(tint & 255u,(tint>>8u)&255u,(tint>>16u)&255u)/255.0;
}
vec3 rtTransmission(vec4 color, uvec2 data) {
    vec3 pass = vec3(1.0-color.a);
    if ((data.y & 1u) != 0u) {
        vec3 dye = color.rgb * rtTintRGB(data.x);
        pass *= pow(dye/max(max(dye.r,max(dye.g,dye.b)),0.001),vec3(2.2*sqrt(color.a)));
    }
    return pass;
}

// The grid only skips empty space. The actual hit is a mesh triangle, including
// when the ray starts inside the cell or strikes an inset surface.
bool rtGeometry(vec3 origin, vec3 direction, float budget,bool visibility,ivec3 sourceCell,out float hitT, out vec3 normal,
                out vec4 albedo, out uvec2 data, out ivec3 hitCell, out bool complete,out vec3 transmission) {
    transmission=vec3(1.0);
    complete = false;
    float b = dot(origin, direction);
    float exitDistance = -b + sqrt(max(b * b + float(RT_DISTANCE * RT_DISTANCE) - dot(origin, origin), 0.0));
    float limit = min(budget, exitDistance);
    vec3 start = origin + fract(cameraPosition) + float(rtGridSize / 2);
    vec3 invDir = 1.0 / max(abs(direction), vec3(1e-12));
    ivec3 advance = ivec3(sign(direction));
    ivec3 cell = ivec3(floor(start));
    float entry=0.0, earliest=0.0001;
    int layers=0;
    for (int i = 0; i < RT_STEPS; ++i) {
        int stepWidth=rtStepWidth(cell,visibility && budget<=16.0);
        int width=abs(stepWidth);
        ivec3 lo = cell & ~(width - 1);
        vec3 edge = vec3(lo) + vec3(greaterThan(direction, vec3(0.0))) * float(width);
        vec3 times = mix(abs(edge - start) * invDir, vec3(1e20), equal(advance, ivec3(0)));
        int axis = times.x <= times.y && times.x <= times.z ? 0 : times.y <= times.z ? 1 : 2;
        float t = times[axis];
        float farT=min(t+0.0001,limit);
        if (stepWidth==1) {
            bool terminal=all(equal(cell,sourceCell));
            float nearT=max(earliest,entry-0.0001);
            uint head=rtCellHead(cell);
            while (head!=0u && nearT<=farT && rtIntersectCell(head,start-vec3(cell),direction,nearT,farT,
                    visibility,terminal,hitT,normal,albedo,data)) {
                hitCell=cell;
                if (!visibility) return true;
                if (terminal && (data.y>>24u)!=0u) {complete=true;return true;}
                transmission*=rtTransmission(albedo,data);
                if (max(transmission.r,max(transmission.g,transmission.b))<0.001) return true;
                // Continue through this cell and the following ones with the
                // same DDA. Do not restart a shadow ray at each glass face.
                earliest=hitT+0.0005;
                if (earliest>=limit) {complete=limit>=budget;return false;}
                if (++layers>=8) return false;
                nearT=earliest;
            }
        }
        if (t>=limit) {complete=limit>=budget;return false;}
        entry=t;
        cell=clamp(ivec3(floor(start+t*direction)),lo,lo+width-1);
        cell[axis]=lo[axis]+(advance[axis]>0 ? width : -1);
    }
    return false;
}

// Stop at the emitting mesh, even when its surface is short of the block
// centre. An opaque triangle in any other cell remains a blocker.
vec3 rtVisibilityTo(vec3 pos, vec3 dir, float distanceToLight, ivec3 sourceCell) {
    float t; vec3 n,pass; vec4 color; uvec2 material; ivec3 cell; bool complete;
    rtGeometry(pos,dir,distanceToLight,true,sourceCell,t,n,color,material,cell,complete,pass);
    return complete ? pass : vec3(0.0);
}
