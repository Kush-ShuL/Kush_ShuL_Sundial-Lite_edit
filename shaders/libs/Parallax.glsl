vec3 rainRippleNormal(vec3 position) {
    float offsetY = mod(floor(frameTimeCounter * 90.0 * RIPPLE_SPEED), 60.0);
    vec2 uv = fract(position.xz / RIPPLE_SCALE);
    uv.y -= offsetY + 59.0;
    uv.y *= 1.0 / 60.0;
    vec3 normal = textureLod(gaux2, uv, 0.0).xyz * 2.0 - 1.0;
    normal.xy *= rainStrength;
    normal.z /= RIPPLE_STRENGTH;
    return normal;
}

vec2 clampCoordRange(vec2 coord, vec4 coordRange) {
    return coordRange.xy + fract(coord) * coordRange.zw;
}

vec3 anisotropicOffsetLod(vec2 albedoTexSize, vec2 atlasTexelSize, vec2 texGradX, vec2 texGradY, vec2 quadSize) {
    vec2 footprintScale = srMaterialFootprintScale();
    texGradX *= footprintScale.x;
    texGradY *= footprintScale.y;
    //https://www.shadertoy.com/view/4lXfzn
    mat2 qd = inverse(mat2(texGradX * albedoTexSize, texGradY * albedoTexSize));
    qd = transpose(qd) * qd;

    float d = determinant(qd);
    float t = (qd[0][0] + qd[1][1]) * 0.5;

    float D = abs(t * t - d);
    D = D * inversesqrt(D);
    float V = t - D;
    float v = t + D;
    float l = max(0.0, -0.5 * log2(v));

    vec2 A = vec2(qd[0][1], qd[0][0] - V);
    A *= inversesqrt(V * dot(A, A)) / ANISOTROPIC_FILTERING_QUALITY;
    A = max(vec2(0.0), abs(A)) * atlasTexelSize * quadSize;
    return vec3(A, l);
}

vec4 anisotropicFilter(vec2 coord, vec2 offset, float lod, vec4 coordRange, vec2 quadSize) {
    #if ANISOTROPIC_FILTERING_QUALITY > 1
        vec2 sampleCoord = (coord - coordRange.xy) * quadSize + (0.5 - 0.5 * ANISOTROPIC_FILTERING_QUALITY) * offset;
        vec4 albedo = vec4(0.0);
        float opaque = 0.0;
        for (int i = 0; i < ANISOTROPIC_FILTERING_QUALITY; i++) {
            sampleCoord += offset;
            vec4 albedoSample = textureLod(gtexture, clampCoordRange(sampleCoord, coordRange), lod);
            albedo.rgb += albedoSample.rgb * albedoSample.a;
            albedo.a += albedoSample.a;
            opaque = max(opaque, albedoSample.a);
        }
        albedo.rgb *= max(1.0 / albedo.a, 1e-5);
        albedo.a /= ANISOTROPIC_FILTERING_QUALITY;
        albedo.a = clamp(albedo.a + float(opaque > 0.999), 0.0, 1.0) * clamp(texture(gtexture, coord).a * 10.0, 0.0, 1.0);
    #else
        vec2 noise = blueNoiseTemporal(gl_FragCoord.st * texelSize).xy - 0.5;
        vec2 sampleCoord = clampCoordRange((coord - coordRange.xy) * quadSize + noise.x * offset, coordRange);
        vec4 albedo = textureLod(gtexture, sampleCoord, lod);
    #endif

    return albedo;
}

#ifdef MC_NORMAL_MAP
    vec4 heightGather(sampler2D normalSampler, vec2 coord, vec2 coord00, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize) {
        ivec2 texel00 = ivec2(coord00);
        ivec2 texel11 = ivec2(clampCoordRange(coord + 0.499 * quadTexelSize, coordRange) * normalTexSize);
        vec4 sh = vec4(
            texelFetch(normalSampler, ivec2(texel00.x, texel11.y), 0).a,
            texelFetch(normalSampler, texel11, 0).a,
            texelFetch(normalSampler, ivec2(texel11.x, texel00.y), 0).a,
            texelFetch(normalSampler, texel00, 0).a
        );
        sh += clamp(1.0 - sh * 1e+10, vec4(0.0), vec4(1.0));
        return sh;
    }

    float bilinearHeightSample(sampler2D normalSampler, vec2 coord, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize) {
        vec2 coord00 = clampCoordRange(coord - 0.499 * quadTexelSize, coordRange) * normalTexSize;
        vec4 sh = heightGather(normalSampler, coord, coord00, coordRange, quadTexelSize, normalTexSize);
        vec2 fpc = fract(coord00);
        vec2 x = mix(sh.wx, sh.zy, vec2(fpc.x));
        return mix(x.x, x.y, fpc.y);
    }

    vec3 heightBasedNormal(sampler2D normalSampler, vec2 coord, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize, vec2 pixelScale) {
        vec2 tileCoord = (coord - coordRange.xy) / coordRange.zw;
        vec2 coord00 = clampCoordRange(tileCoord - 0.499 * quadTexelSize, coordRange) * normalTexSize;
        vec4 sh = heightGather(normalSampler, tileCoord, coord00, coordRange, quadTexelSize, normalTexSize);

        vec2 fpc = fract(coord00);
        sh.y = sh.x + sh.z - sh.w - sh.y;
        vec3 normal = vec3(
            sh.y * fpc.yx + (sh.w - sh.zx),
            (5.0 / PARALLAX_DEPTH)
        );
        normal.xy *= pixelScale;

        return normal;
    }

    vec4 bilinearNormalSample(sampler2D normalSampler, vec2 coord, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize) {
        vec4[4] sh;
        vec2 tileCoord = (coord - coordRange.xy) / coordRange.zw;
        vec2 coord00 = clampCoordRange(tileCoord - 0.5 * quadTexelSize, coordRange);
        vec2 coord11 = clampCoordRange(tileCoord + 0.5 * quadTexelSize, coordRange);
        sh = vec4[4](
            textureLod(normalSampler, vec2(coord00.x, coord11.y), 0.0),
            textureLod(normalSampler, coord11, 0.0),
            textureLod(normalSampler, vec2(coord11.x, coord00.y), 0.0),
            textureLod(normalSampler, coord00, 0.0)
        );
        vec2 fpc = fract(coord * normalTexSize + 0.5);
        return mix(
            mix(sh[3], sh[2], vec4(fpc.x)),
            mix(sh[0], sh[1], vec4(fpc.x)),
            vec4(fpc.y)
        );
    }

    vec2 perPixelParallax(vec2 coord, vec3 viewVector, vec4 coordRange,
                          inout vec3 parallaxTexNormal, inout float parallaxOffset) {
        parallaxOffset=0.0;
        if (viewVector.z>=-1e-6) return coord;
        vec2 atlas=vec2(textureSize(normals,0));
        ivec2 base=ivec2(round(coordRange.xy*atlas));
        ivec2 size=max(ivec2(1),ivec2(round(coordRange.zw*atlas)));
        vec2 start=clamp(coord*atlas-vec2(base),vec2(0.0),vec2(size)-0.0001);
        ivec2 cell=ivec2(floor(start));
        vec2 ray=viewVector.xy*(0.2*PARALLAX_DEPTH/-viewVector.z)*atlas;
        ray*=min(1.0,float(PARALLAX_QUALITY-2)/max(dot(abs(ray),vec2(1.0)),1e-6));
        ivec2 stepUV=ivec2(sign(ray));
        vec2 stride=1.0/max(abs(ray),vec2(1e-12));
        vec2 next=mix(fract(start),1.0-fract(start),greaterThan(ray,vec2(0)))*stride;
        next=mix(next,vec2(1e20),equal(stepUV,ivec2(0)));
        ivec2 unwrapped=cell;
        float entry=0.0;
        vec2 wall=vec2(0.0);
        for (int i=0;i<PARALLAX_QUALITY;++i) {
            float h=texelFetch(normals,base+cell,0).a;
            float depth=h==0.0 ? 0.0 : 1.0-h;
            float edge=min(next.x,next.y);
            if (depth<=edge) {
                if (depth<entry) parallaxTexNormal=vec3(wall,0.0);
                parallaxOffset=max(depth,entry);
                if (parallaxOffset==0.0) return coord;
                // Use the intersection UV inside the texel. Snapping every
                // hit to its centre breaks continuous albedo and normal maps.
                vec2 local=clamp(start+ray*parallaxOffset-vec2(unwrapped),vec2(0.0001),vec2(0.9999));
                return (vec2(base+cell)+local)/atlas;
            }
            bvec2 crossEdge=lessThanEqual(next,vec2(edge));
            ivec2 delta=ivec2(crossEdge)*stepUV;
            wall=crossEdge.x ? vec2(-stepUV.x,0) : vec2(0,-stepUV.y);
            unwrapped+=delta;
            cell+=delta;
            cell+=size*(ivec2(lessThan(cell,ivec2(0)))-ivec2(greaterThanEqual(cell,size)));
            next+=vec2(crossEdge)*stride;
            entry=edge;
        }
        return coord;
    }

    vec2 calculateParallax(
        vec2 coord, vec3 viewVector, vec4 coordRange, vec2 quadSize, vec2 albedoTexSize, vec2 albedoTexelSize, inout float parallaxOffset
    ) {
        vec2 quadTexelSize = albedoTexelSize * quadSize;

        vec3 parallaxCoord = vec3(coord, 1.0);

        vec2 firstCoord = (coord - coordRange.xy) * quadSize;
        #ifdef SMOOTH_PARALLAX
            float startHeight = bilinearHeightSample(normals, firstCoord, coordRange, quadTexelSize, albedoTexSize);
        #else
            float startHeight = textureLod(normals, parallaxCoord.st, 0.0).a;
            startHeight += clamp(1.0 - startHeight * 1e+10, 0.0, 1.0);
        #endif

        if (startHeight < 1.0) {
            parallaxCoord.st = firstCoord;
            vec3 stepSize = viewVector / (PARALLAX_QUALITY * abs(viewVector.z));
            stepSize.xy *= PARALLAX_DEPTH * 0.2 * quadSize;
            float stepScale = 2.0 / PARALLAX_QUALITY;

            for (int i = 0; i < PARALLAX_QUALITY; i++) {
                parallaxCoord += stepSize * stepScale;
                #ifdef SMOOTH_PARALLAX
                    float sampleHeight = bilinearHeightSample(normals, parallaxCoord.st, coordRange, quadTexelSize, albedoTexSize);
                #else
                    float sampleHeight = textureLod(normals, clampCoordRange(parallaxCoord.st, coordRange), 0.0).a;
                    sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);
                #endif
                if (sampleHeight > parallaxCoord.z) {
                    break;
                }
                stepScale += 2.0 / PARALLAX_QUALITY;
            }
            parallaxCoord -= stepSize * stepScale;
            stepSize *= 0.5;
            for (int i = 0; i < PARALLAX_MAX_REFINEMENTS; i++) {
                parallaxCoord += stepSize * stepScale;
                #ifdef SMOOTH_PARALLAX
                    float sampleHeight = bilinearHeightSample(normals, parallaxCoord.st, coordRange, quadTexelSize, albedoTexSize);
                #else
                    float sampleHeight = textureLod(normals, clampCoordRange(parallaxCoord.st, coordRange), 0.0).a;
                    sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);
                #endif
                if (sampleHeight > parallaxCoord.z) {
                    parallaxCoord -= stepSize * stepScale;
                    stepSize *= 0.5;
                }
            }
            parallaxCoord += 2.0 * stepSize * stepScale;
            parallaxCoord.st = clampCoordRange(parallaxCoord.st, coordRange);
        }
        parallaxOffset = 1.0 - parallaxCoord.z;
        return parallaxCoord.st;
    }
#endif
