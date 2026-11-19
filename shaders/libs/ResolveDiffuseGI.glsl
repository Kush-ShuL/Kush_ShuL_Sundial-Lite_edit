uniform sampler2D colortex20;
uniform sampler2D colortex23;
uniform usampler2D colortex26;
// GI is low frequency. Combine a 3x3 neighbourhood in irradiance space, before
// multiplying by receiver albedo. Reject samples across depth and normal edges.
vec3 resolveDiffuseGI(vec2 uv, float depth, vec3 normal, vec3 fallback, out vec4 direct) {
    ivec2 size = srTextureSizeLow(colortex20,0);
    vec2 at = uv * vec2(size) - 0.5;
    ivec2 center = ivec2(floor(at + 0.5));
    uint mask=texelFetch(colortex26,center,0).r;
    ivec2 cg=min(ivec2((vec2(center)+0.5)/vec2(size)*screenSize),ivec2(screenSize)-1);
    float commonAgreement=max(dot(normal,getGeoNormalTexel(cg)),0.0);
    // Four potentially nonzero bilinear weights within the 3x3 GI footprint.
    int quadrant=int(at.x>=float(center.x))+3*int(at.y>=float(center.y));
    bool hasDirect=(mask&(27u<<uint(quadrant)))!=0u;
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
        vec2 delta = at - vec2(cell);
        vec2 tent = max(1.0-abs(delta),vec2(0.0));
        if (hasDirect && tent.x*tent.y>0.0) {
            vec4 lamp=texelFetch(colortex23,cell,0);
            if (lamp.w!=0.0) {
                float dw=tent.x*tent.y*pow(agreement,12.0)
                        * exp2(-abs(depth-abs(lamp.w))/max(0.015,0.005*depth));
                direct+=vec4(lamp.rgb,float(lamp.w>0.0))*dw;
                directWeights+=dw;
            }
        }
        if (sampleGI.w <= 0.0) continue;
        float w = pow2(pow2(agreement)) * exp2(-dot(delta,delta)
                  -abs(depth-sampleGI.w)/max(0.025,0.015*depth));
        sum += w * sampleGI.rgb;
        weights += w;
    }
    direct /= max(directWeights,1e-5);
    return weights > 0.001 ? sum / weights : fallback;
}
