uniform sampler2D colortex20;
uniform sampler2D colortex23;
uniform usampler2D colortex26;
// Quadratic B-spline: the outer tap and its slope both reach zero as
// the 3x3 footprint changes cells. A truncated Gaussian jumps at this edge.
vec2 giReconstructionKernel(vec2 offset) {
    vec2 x=abs(offset), tail=max(vec2(1.5)-x,vec2(0.0));
    return mix(0.75-x*x,0.5*tail*tail,greaterThan(x,vec2(0.5)));
}
// GI is low frequency. Combine a 3x3 neighbourhood in irradiance space, before
// multiplying by receiver albedo. Reject samples across depth and normal edges.
vec3 resolveDiffuseGI(vec2 uv, vec3 view, vec3 normal, vec3 fallback, out vec4 direct) {
    float depth=-view.z;
    ivec2 size = srTextureSizeLow(colortex20,0);
    vec2 ratio=screenSize/vec2(size);
    vec2 origin=(floor(0.5*ratio)+0.5)/screenSize;
    vec2 at=(uv-origin)*vec2(size);
    ivec2 center=clamp(ivec2(floor(at+0.5)),ivec2(0),size-1);
    uint mask=texelFetch(colortex26,center,0).r;
    ivec2 cg=min(ivec2((vec2(center)+0.5)/vec2(size)*screenSize),ivec2(screenSize)-1);
    float commonAgreement=max(dot(normal,getGeoNormalTexel(cg)),0.0);
    bool hasDirect=(mask&511u)!=0u;
    vec3 sum = vec3(0.0);
    float weights = 0.0;
    direct = vec4(0.0);
    float directWeights = 0.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        ivec2 cell = clamp(center + ivec2(x,y), ivec2(0), size-1);
        vec4 sampleGI = texelFetch(colortex20,cell,0);
        vec2 sampleUV = (vec2(cell)+0.5) / vec2(size);
        ivec2 p = min(ivec2(sampleUV * screenSize),ivec2(screenSize)-1);
        uint bit=1u<<uint((y+1)*3+x+1);
        float agreement=commonAgreement;
        if ((mask&(bit<<9u))!=0u) agreement=max(dot(normal,getGeoNormalTexel(p)),0.0);
        vec2 kernel=giReconstructionKernel(at-vec2(center+ivec2(x,y)));
        float footprint=kernel.x*kernel.y;
        // The sample may be farther along the same sloped wall. Compare its
        // distance to the receiver plane, not just the two camera depths.
        vec3 ray=screenToViewPos((vec2(p)+0.5)/screenSize,0.0);
        float planeSlope=dot(normal,ray)/(-ray.z), plane=dot(normal,view);
        if (hasDirect && footprint>0.0) {
            vec4 lamp=texelFetch(colortex23,cell,0);
            if (lamp.w!=0.0) {
                float dw=footprint*pow(agreement,12.0)
                        * exp2(-abs(planeSlope*abs(lamp.w)-plane)/max(0.015,0.002*depth));
                direct+=vec4(lamp.rgb,float(lamp.w>0.0))*dw;
                directWeights+=dw;
            }
        }
        if (sampleGI.w <= 0.0) continue;
        float w=footprint*pow2(pow2(agreement))
                *exp2(-abs(planeSlope*sampleGI.w-plane)/max(0.025,0.004*depth));
        sum += w * sampleGI.rgb;
        weights += w;
    }
    direct /= max(directWeights,0.06);
    return mix(fallback,sum/max(weights,1e-6),smoothstep(0.005,0.08,weights));
}
