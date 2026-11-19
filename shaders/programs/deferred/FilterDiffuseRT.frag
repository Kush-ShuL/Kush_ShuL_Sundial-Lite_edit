in vec2 texcoord;
uniform vec2 prevTaaOffset;
layout(location = 0) out vec4 filteredGI;
layout(location = 1) out vec4 filteredDirect;
layout(location = 2) out uint resolveMask;
#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
uniform sampler2D colortex20;
uniform sampler2D colortex22,colortex23;
/*
const int colortex23Format = RGBA16F;
const int colortex26Format = R32UI;
*/
const bool colortex23Clear = false;

// These comparisons depend only on the low-resolution neighbourhood. All
// full-resolution receivers sharing the footprint can reuse them exactly.
uint buildResolveMask(ivec2 p,ivec2 size) {
    ivec2 g=min(ivec2((vec2(p)+0.5)/vec2(size)*screenSize),ivec2(screenSize)-1);
    vec2 n=srTexelFetchLow(colortex1,g,0).zw;
    uint mask=0u;
    for (int y=-1;y<=1;++y) for (int x=-1;x<=1;++x) {
        ivec2 q=clamp(p+ivec2(x,y),ivec2(0),size-1);
        ivec2 qg=min(ivec2((vec2(q)+0.5)/vec2(size)*screenSize),ivec2(screenSize)-1);
        uint bit=1u<<uint((y+1)*3+x+1);
        if (texelFetch(colortex22,q,0).w>0.0) mask|=bit;
        if (any(notEqual(srTexelFetchLow(colortex1,qg,0).zw,n))) mask|=bit<<9u;
    }
    return mask;
}

vec4 filterDirect(ivec2 p,ivec2 size) {
    vec4 center=texelFetch(colortex22,p,0);
    if (center.w<=0.0) return center;
    ivec2 receiver=min(ivec2((vec2(p)+0.5)*screenSize/vec2(size)),ivec2(screenSize)-1);
    vec2 uv=(vec2(receiver)+0.5)/screenSize;
    float d=srTexelFetchLow(depthtex0,receiver,0).r;
    vec3 view=screenToViewPos(uv,d);
    #ifdef LOD
        if (d>=1.0) view=screenToViewPosLod(uv,getLodDepthSolidDeferred(uv));
    #endif
    vec3 n=getGeoNormalTexel(receiver), lo=center.rgb, hi=center.rgb;
    vec3 local=4.0*center.rgb; float taps=4.0;
    int litNeighbours=0;
    // The symmetric [1,2,2,2,1] kernel gives equal total weight to each
    // of the four phases on either axis, without shifting the image.
    for (int y=-2;y<=2;++y) for (int x=-2;x<=2;++x) {
        if (x==0 && y==0) continue;
        ivec2 q=p+ivec2(x,y);
        if (any(lessThan(q,ivec2(0))) || any(greaterThanEqual(q,size))) continue;
        vec4 v=texelFetch(colortex22,q,0);
        if (v.w<=0.0) continue;
        ivec2 g=min(ivec2((vec2(q)+0.5)*screenSize/vec2(size)),ivec2(screenSize)-1);
        if (dot(n,getGeoNormalTexel(g))<0.97) continue;
        vec3 ray=screenToViewPos((vec2(g)+0.5)/screenSize,0.0);
        if (abs(dot(n,ray*(v.w/-ray.z)-view))>max(0.025,0.002*center.w)) continue;
        lo=min(lo,v.rgb); hi=max(hi,v.rgb);
        // Reconstruct fractional coverage on this plane. Weighting by
        // brightness here would pin dark samples to zero inside a penumbra.
        float w=float((abs(x)==2 ? 1 : 2)*(abs(y)==2 ? 1 : 2));
        litNeighbours+=int(max(v.r,max(v.g,v.b))>0.002);
        local+=w*v.rgb; taps+=w;
    }
    if (litNeighbours>=2 || max(center.r,max(center.g,center.b))>0.002) center.rgb=local/taps;
    else hi=center.rgb;
    if (frameCounter<2) return center;
    vec3 prev=prevWorldToViewPos(viewToWorldPos(view)+cameraMovement);
    if (prev.z>=0.0) return center;
    vec2 prevUV=0.5*prevViewToProjectionPos(prev).xy+0.5;
    #if defined TAA || defined HELIAN_SR_JITTER
        prevUV+=prevTaaOffset;
    #endif
    vec2 at=prevUV*vec2(size)-0.5, f=fract(at);
    vec3 history=vec3(0.0);float weight=0.0;
    for (int i=0;i<4;++i) {
        ivec2 off=ivec2(i&1,i>>1), q=ivec2(floor(at))+off;
        if (any(lessThan(q,ivec2(0))) || any(greaterThanEqual(q,size))) continue;
        vec4 h=texelFetch(colortex23,q,0);
        if (h.w<=0.0 || abs(h.w+prev.z)>max(0.025,-0.012*prev.z)) continue;
        vec2 w=mix(1.0-f,f,vec2(off));float k=w.x*w.y;
        history+=k*h.rgb;weight+=k;
    }
    if (weight<=0.01) return center;
    // Preserve newly exposed dark surfaces; never borrow a brighter old
    // shadow than the current same-surface neighbourhood can support.
    return vec4(mix(center.rgb,clamp(history/weight,lo,hi),0.6*weight),center.w);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy), size = srTextureSizeLow(colortex20,0);
    if (any(greaterThanEqual(p,size))) discard;
    resolveMask=buildResolveMask(p,size);
    filteredDirect=filterDirect(p,size);
    vec4 center = texelFetch(colortex20,p,0);
    filteredGI = center;
    if (center.w <= 0.0) return;
    const ivec2 taps[13] = ivec2[13](ivec2(0),ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1),
        ivec2(2,2),ivec2(-2,2),ivec2(2,-2),ivec2(-2,-2),ivec2(3,0),ivec2(-3,0),ivec2(0,3),ivec2(0,-3));
    vec3 n = getGeoNormalTexel(min(ivec2(texcoord*screenSize),ivec2(screenSize)-1));
    vec3 sum = vec3(0.0), peak = vec3(0.0);
    float weights = 0.0, peakWeight = 0.0, peakY = -1.0, secondY = 0.0;
    const vec3 luma = vec3(0.2126,0.7152,0.0722);
    for (int i = 0; i < 13; ++i) {
        ivec2 q = p + taps[i];
        if (any(lessThan(q,ivec2(0))) || any(greaterThanEqual(q,size))) continue;
        vec4 v = texelFetch(colortex20,q,0);
        if (v.w <= 0.0) continue;
        ivec2 g = min(ivec2((vec2(q)+0.5)/vec2(size)*screenSize),ivec2(screenSize)-1);
        float w = pow(max(dot(n,getGeoNormalTexel(g)),0.0),8.0)
                * exp2(-abs(v.w-center.w)/max(0.06,0.025*center.w) - 0.12*dot(vec2(taps[i]),vec2(taps[i])));
        if (w < 0.03) continue;
        float y = dot(v.rgb,luma);
        if (y > peakY) { secondY = max(0.0,peakY); peakY = y; peak = v.rgb; peakWeight = w; }
        else secondY = max(secondY,y);
        sum += v.rgb*w; weights += w;
    }
    if (weights - peakWeight > 1.25) {
        // Winsorise just the isolated brightest bounce. Neighbouring bright
        // samples support one another, so a uniformly lit wall stays bright.
        float cap = 1.5*secondY + 0.04;
        sum -= peak * peakWeight * max(0.0, 1.0-cap/max(peakY,1e-5));
    }
    filteredGI.rgb = max(vec3(0.0),sum/max(weights,1e-5));
}
/* RENDERTARGETS: 20,23,26 */
