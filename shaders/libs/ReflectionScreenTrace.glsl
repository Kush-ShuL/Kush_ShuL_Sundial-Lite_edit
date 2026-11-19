#if REFLECTION_MODE != 2
uniform usampler2D colortex24;
uniform sampler2D colortex21;
float reflectionSceneDepth(vec2 uv, out bool model) {
    ivec2 p=clamp(ivec2(uv*screenSize),ivec2(0),ivec2(screenSize)-1);
    uint value=texelFetch(colortex24,p,0).r;
    model=(value&0x40000000u)!=0u;
    return uintBitsToFloat(value&~0x40000000u);
}
vec4 traceScreenReflection(vec3 viewPos, vec3 rayDir, out vec3 hitView) {
    vec4 projDirection = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * rayDir, -rayDir.z);
    vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos, -viewPos.z);
    projDirection.xy += gbufferProjection[2].xy * rayDir.z;
    originProjPos.z += gbufferProjection[3].z;
    originProjPos.xy += gbufferProjection[2].xy * viewPos.z;
    #if defined TAA || defined HELIAN_SR_JITTER
        originProjPos.xy += taaOffset * originProjPos.w;
    #endif
    float traceLength = projIntersectionScreenEdge(originProjPos, projDirection);

    float originProjScale = 0.5 / originProjPos.w;
    vec4 sampleCoord = vec4(originProjPos.xyz * originProjScale + 0.5, 0.0);
    vec4 targetProjPos = originProjPos + projDirection * traceLength;
    float targetProjScale = 0.5 / targetProjPos.w;
    vec4 targetCoord = vec4(targetProjPos.xyz * targetProjScale + 0.5, 0.0);

    #ifdef LOD
        projDirection.z = rayDir.z * projLod()[2].z;
        float originProjDepthLod = viewPos.z * projLod()[2].z + projLod()[3].z;
        sampleCoord.w = originProjDepthLod * originProjScale + 0.5;
        targetCoord.w = (originProjDepthLod + projDirection.z * traceLength) * targetProjScale + 0.5;
    #endif

    #if defined HELIAN_SR_ACTIVE || !defined TAA
        float noise = textureLod(noisetex, texcoord * screenSize / 64.0, 0.0).x + 0.1;
        const int reflectionSteps = max(SCREEN_SPACE_REFLECTION_STEP, 16);
    #else
        float noise = blueNoiseTemporal(texcoord).x + 0.1;
        const int reflectionSteps = SCREEN_SPACE_REFLECTION_STEP;
    #endif
    vec4 stepSize = (targetCoord - sampleCoord) / (float(reflectionSteps) - 1.0);
    sampleCoord += noise * stepSize;
    sampleCoord.zw -= 2e-7;

    bool hitSky = true;
    bool modelHit = false;
    float minimumThichness = max(0.001 * originProjScale, abs(stepSize.z));
    float minimumThichnessLod = max(0.01 * originProjScale, abs(stepSize.w));
    for (int i = 0; i < reflectionSteps; i++) {
        float sampleDepth = reflectionSceneDepth(sampleCoord.st, modelHit);
        bool hitCheck = sampleCoord.z > sampleDepth && sampleDepth < 1.0;
        #ifdef LOD
            hitCheck = hitCheck || (sampleDepth < 0.0 && sampleCoord.w > -sampleDepth);
        #endif
        if (hitCheck) {
            float stepScale = 0.5;
            vec4 refinementCoord = sampleCoord;
            for (int j = 0; j < SCREEN_SPACE_REFLECTION_REFINEMENTS; j++) {
                float stepDirection = sampleDepth - refinementCoord.z;
                #ifdef LOD
                    float stepDirectionLod = -sampleDepth - refinementCoord.w;
                    stepDirection = mix(stepDirection, stepDirectionLod, float(sampleDepth < 0.0));
                #endif
                refinementCoord += signMul(stepScale, stepDirection) * stepSize;
                sampleDepth = reflectionSceneDepth(refinementCoord.st, modelHit);
                stepScale *= 0.5;
            }

            bool hitTerrain = abs(refinementCoord.z - sampleDepth) < minimumThichness && sampleDepth < 1.0;
            #ifdef LOD
                hitTerrain = hitTerrain || (abs(sampleDepth + 0.5) < 0.5 && abs(refinementCoord.w + sampleDepth) < minimumThichnessLod);
            #endif
            if (hitTerrain && clamp(refinementCoord.st, 0.0, 1.0) == refinementCoord.st) {
                sampleCoord = refinementCoord;
                hitSky = false;
                break;
            }
        }
        if (clamp(sampleCoord.st, 0.0, 1.0) != sampleCoord.st || sampleCoord.z < 0.0) break;
        sampleCoord += stepSize;
    }
    if (hitSky) return vec4(0.0);
    #ifdef LOD
        if (sampleCoord.z >= 1.0) {
            vec3 sampleProjPos = sampleCoord.xyw * 2.0 - 1.0;
            #if defined TAA || defined HELIAN_SR_JITTER
                sampleProjPos.st -= taaOffset;
            #endif
            sampleProjPos.xy *= vec2(projInvLod()[0].x, projInvLod()[1].y);
            sampleProjPos.xy += projInvLod()[3].xy;
            float projectionScale = projLod()[3].z / (sampleProjPos.z + projLod()[2].z);
            hitView = vec3(sampleProjPos.xy * projectionScale, -projectionScale);
        } else
    #endif
    {
        vec3 sampleProjPos = sampleCoord.xyz * 2.0 - 1.0;
        #if defined TAA || defined HELIAN_SR_JITTER
            sampleProjPos.st -= taaOffset;
        #endif
        sampleProjPos.xy *= vec2(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y);
        sampleProjPos.xy += gbufferProjectionInverse[3].xy;
        float projectionScale = gbufferProjection[3].z / (sampleProjPos.z + gbufferProjection[2].z);
        hitView = vec3(sampleProjPos.xy * projectionScale, -projectionScale);
    }
    vec3 result=srTextureLodScene(colortex3, sampleCoord.xy, 0.0).rgb;
    if (modelHit) {
        ivec2 p=clamp(ivec2(sampleCoord.xy*screenSize),ivec2(0),ivec2(screenSize)-1);
        vec4 model=srTexelFetchLow(colortex21,p,0);
        result=model.rgb+(1.0-model.a)*result;
    }
    return vec4(result, distance(viewPos, hitView));
}
#endif
