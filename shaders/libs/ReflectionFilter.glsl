ivec2 reflectionToGbufferTexel(ivec2 reflectionTexel) {
    #ifdef HALF_RES_REFLECTION
        vec2 reflectionSize = vec2(srTextureSizeLow(colortex8, 0));
        ivec2 gbufferTexel = ivec2((vec2(reflectionTexel) + 0.5) / reflectionSize * screenSize);
        return clamp(gbufferTexel, ivec2(0), ivec2(screenSize) - 1);
    #else
        return reflectionTexel;
    #endif
}

vec4 getReflectionTexel(ivec2 reflectionTexel) {
    #ifdef HALF_RES_REFLECTION
        return srTexelFetchLow(colortex8, reflectionTexel, 0);
    #else
        return srTexelFetchScene(colortex4, reflectionTexel, 0);
    #endif
}

vec4 limitGlossyFirefly(vec4 center, ivec2 p) {
    if (center.w <= 0.0) return center;
    ivec2 g = reflectionToGbufferTexel(p);
    vec2 spec = unpack2x8Bit(srTexelFetchLow(colortex2,g,0).g);
    if (spec.x >= 0.94) return center;
    const vec3 luma = vec3(0.2126,0.7152,0.0722);
    float y = dot(center.rgb,luma);
    if (y < 0.025) return center;
    vec3 n = getGeoNormalTexel(g);
    float d = srTexelFetchLow(depthtex0,g,0).r;
    #ifdef HALF_RES_REFLECTION
        ivec2 size = srTextureSizeLow(colortex8,0);
    #else
        ivec2 size = ivec2(screenSize);
    #endif
    const ivec2 offsets[4] = ivec2[4](ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1));
    int matches = 0; float neighbourMax = 0.0;
    for (int i = 0; i < 4; ++i) {
        ivec2 q = p + offsets[i];
        if (any(lessThan(q,ivec2(0))) || any(greaterThanEqual(q,size))) continue;
        ivec2 qg = reflectionToGbufferTexel(q);
        if (dot(n,getGeoNormalTexel(qg)) < 0.94 ||
            abs(d-srTexelFetchLow(depthtex0,qg,0).r) > max(0.00005,0.05*(1.0-d)) ||
            any(greaterThan(abs(spec-unpack2x8Bit(srTexelFetchLow(colortex2,qg,0).g)),vec2(0.1)))) continue;
        neighbourMax = max(neighbourMax,dot(getReflectionTexel(q).rgb,luma));
        ++matches;
    }
    if (matches >= 3) center.rgb *= min(1.0,(2.0*neighbourMax+0.025)/y);
    return center;
}

vec4 reflectionFilter(vec4 originData, ivec2 centerTexel, float offset, bool useNoise) {
    float originReflectionDepth = originData.w;
    ivec2 originGbufferTexel = reflectionToGbufferTexel(centerTexel);
    float originSmoothness = unpack2x8Bit(srTexelFetchLow(colortex2, originGbufferTexel, 0).g).x;
    // At this smoothness the integer sample coordinates all resolve to the
    // center texel, so the filter can only reproduce originData.
    if (originSmoothness >= 0.9975) {
        return originData;
    }
    float roughness = pow2(1.0 - originSmoothness);
    float roughnessInv = 100.0 / max(roughness, 1e-5);
    vec2 coordOffset = vec2(4.0 * offset * clamp(roughness * 20.0, 0.0, 1.0) * (1.0 - exp(-originReflectionDepth * 1000.0)));
    #ifdef HALF_RES_REFLECTION
        coordOffset *= vec2(srTextureSizeLow(colortex8, 0)) / screenSize;
    #endif
    if (useNoise) {
        coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;
    }

    vec3 originNormal = getNormalTexel(originGbufferTexel);

    vec3 accumulation = originData.rgb;
    float weightAccumulation = 1.0;
    vec2 centerTexelCoord = centerTexel + 0.5;
    #ifdef HALF_RES_REFLECTION
        ivec2 reflectionSize = srTextureSizeLow(colortex8, 0);
    #else
        ivec2 reflectionSize = ivec2(screenSize);
    #endif

    for (int i = -REFLECTION_FILTER; i < REFLECTION_FILTER + 1; i++) {
        for (int j = -REFLECTION_FILTER; j < REFLECTION_FILTER + 1; j++) {
            ivec2 sampleTexel = ivec2(centerTexelCoord + vec2(i, j) * coordOffset);
            if (abs(i) != -abs(j) && all(greaterThanEqual(sampleTexel, ivec2(0))) && all(lessThan(sampleTexel, reflectionSize))) {
                ivec2 sampleGbufferTexel = reflectionToGbufferTexel(sampleTexel);
                vec4 sampleData = getReflectionTexel(sampleTexel);
                float sampleReflectionDepth = sampleData.w;
                vec3 sampleNormal = getNormalTexel(sampleGbufferTexel);
                float sampleSmoothness = unpack2x8Bit(srTexelFetchLow(colortex2, sampleGbufferTexel, 0).g).x;

                float weight =
                    exp2(
                        roughnessInv * log2(max(dot(originNormal, sampleNormal), 1e-6)) +
                        100.0 * log2(1.0 - abs(roughness - pow2(1.0 - sampleSmoothness))) -
                        1.44269502 * abs(originReflectionDepth - sampleReflectionDepth) / (max(originReflectionDepth, sampleReflectionDepth) + 0.2) * originSmoothness
                    ) *
                    step(0.0025, sampleSmoothness);
                weight = clamp(weight, 0.0, 1.0);
                accumulation += sampleData.rgb * weight;
                weightAccumulation += weight;
            }
        }
    }
    originData.rgb = accumulation / weightAccumulation;
    return originData;
}
