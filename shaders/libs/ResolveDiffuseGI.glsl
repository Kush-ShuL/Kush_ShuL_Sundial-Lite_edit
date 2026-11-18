uniform sampler2D colortex20;
uniform sampler2D colortex23;
// GI is low frequency. Combine a 3x3 neighbourhood in irradiance space, before
// multiplying by receiver albedo. Reject samples across depth and normal edges.
vec3 resolveDiffuseGI(vec2 uv, float depth, vec3 normal, vec3 fallback, out vec4 direct) {
    ivec2 size = srTextureSizeLow(colortex20,0);
    vec2 at = uv * vec2(size) - 0.5;
    ivec2 center = ivec2(floor(at + 0.5));
    vec3 sum = vec3(0.0);
    float weights = 0.0;
    direct = vec4(0.0);
    float directWeights = 0.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        ivec2 cell = clamp(center + ivec2(x,y), ivec2(0), size-1);
        vec4 sampleGI = texelFetch(colortex20,cell,0);
        vec2 sampleUV = (vec2(cell)+0.5) / vec2(size);
        ivec2 p = min(ivec2(sampleUV * screenSize),ivec2(screenSize)-1);
        float agreement = max(dot(normal,getGeoNormalTexel(p)),0.0);
        vec2 delta = at - vec2(cell);
        vec4 lamp = texelFetch(colortex23,cell,0);
        vec2 tent = max(1.0-abs(delta),vec2(0.0));
        float dw = tent.x*tent.y*pow(agreement,12.0)
                 * exp2(-abs(depth-abs(lamp.w))/max(0.015,0.005*depth));
        if (lamp.w!=0.0) {
            direct += vec4(lamp.rgb,float(lamp.w>0.0))*dw;
            directWeights += dw;
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
