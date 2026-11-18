// Included by composite6 after Common.glsl and GbufferData.glsl.
#ifdef HELIAN_SR_INPUTS
#include "/settings/CloudSettings.glsl"
#include "/libs/Water.glsl"
layout(location = 1) out vec2 srMotion;
layout(location = 2) out float srDepth;
/*
const int colortex9Format = RG16F;
const bool colortex9Clear = true;
const int colortex10Format = R32F;
*/

#ifdef HELIAN_SR_RR
#include "/libs/OpaqueRRMaterial.glsl"
layout(location = 3) out vec4 srDiffuseAlbedo;
layout(location = 4) out vec4 srSpecularAlbedo;
layout(location = 5) out vec4 srNormalRoughness;
/*
const int colortex11Format = RGBA16F;
const int colortex12Format = RGBA16F;
const int colortex13Format = RGBA16F;
*/

// Integrated GGX reflectance approximation (Ray Tracing Gems, chapter 32;
// also used by the NVIDIA DLSS-RR integration guide). GLSL matrices are columns.
vec3 srEnvironmentBRDF(vec3 f0, float alpha, float NoV) {
    vec4 X = vec4(1.0, abs(NoV), NoV * NoV, abs(NoV * NoV * NoV));
    vec4 Y = vec4(1.0, alpha, alpha * alpha, alpha * alpha * alpha);
    mat2 M1 = mat2(0.99044, 1.29678, -1.28514, -0.755907);
    mat3 M2 = mat3(1.0, 20.3225, 121.563, 2.92338, -27.0302, 626.13, 59.4188, 222.592, 316.627);
    mat2 M3 = mat2(0.0365463, 9.0632, 3.32707, -9.04756);
    mat3 M4 = mat3(1.0, 9.04401, 5.56589, 3.59685, -16.3174, 19.7886, -1.36772, 9.22949, -20.2123);
    float bias = dot(M1 * X.xy, Y.xy) / max(dot(M2 * X.xyw, Y.xyw), 1e-6);
    float scale = dot(M3 * X.xy, Y.xy) / max(dot(M4 * X.xzw, Y.xyw), 1e-6);
    bias *= clamp(f0.g * 50.0, 0.0, 1.0);
    return clamp(f0 * max(0.0, scale) + max(0.0, bias), 0.0, 1.0);
}
#endif

void srPrepareInputs(ivec2 texel, vec2 coord) {
    float depth = srTextureLodLow(depthtex0, coord, 0.0).r;
    float projectionDepth = depth;
    bool lodSurface = false;
    #ifdef LOD
        if (depth >= 1.0) {
            float lodDepth = getLodDepthWater(coord);
            if (lodDepth < 1.0) {
                depth = lodDepth;
                lodSurface = true;
            }
        }
    #endif
    bool sky = depth >= 1.0;
    GbufferData material = getGbufferDataAtDepth(texel, depth);
    // Faint foreground layers mainly show the already-lit background. Track
    // that background for DLSS rather than dragging it with the near surface.
    if (material.materialID == MAT_FORWARD_MODEL && material.albedo.a < 0.5) {
        #ifdef HELIAN_SR_RR
            readOpaqueRRMaterial(texel, material);
        #endif
        depth = srTexelFetchLow(depthtex1, texel, 0).r;
        projectionDepth = depth;
        lodSurface = false;
        #ifdef LOD
            if (depth >= 1.0) {
                float d = getLodDepthSolid(coord);
                if (d < 1.0) { depth = d; lodSurface = true; }
            }
        #endif
        sky = depth >= 1.0;
    }
    bool isHand = material.materialID == MAT_HAND && !sky;
    vec2 inputJitter = vec2(0.0);
    #ifdef HELIAN_SR_ACTIVE
        inputJitter = srJitterUV();
    #elif defined TAA
        // Native TAA still resolves the scene in frame-generation-only mode.
        inputJitter = taaOffset * 0.5;
    #endif
    vec2 currentUV = coord - inputJitter;
    vec3 viewPos;
    #ifdef LOD
        if (lodSurface) {
            viewPos = screenToViewPosLod(coord, depth);
            projectionDepth = clamp(viewToProjectionPos(viewPos).z * 0.5 + 0.5, 0.0, 1.0);
        } else
    #endif
    {
        // Reconstruct the physical hand position for motion, while
        // retaining the foreground depth interval in the DLSS depth input.
        viewPos = screenToViewPos(coord, isHand ? decodeHandDepth(depth) : depth);
    }

    vec3 previousView;
    if (isHand) {
        previousView = viewPos;
        #ifndef TEMPORAL_IGNORE_HAND_ANIMATION
            previousView += gbufferPreviousModelView[3].xyz - gbufferModelView[3].xyz;
        #endif
    } else if (sky) {
        previousView = mat3(gbufferPreviousModelView) * mat3(gbufferModelViewInverse) * viewPos;
    } else {
        vec3 previousWorld = viewToWorldPos(viewPos) + cameraMovement;
        #if defined HELIAN_SR_ACTIVE && !defined HELIAN_SR_RR
            if (material.materialID == MAT_WATER && isEyeInWater == 0) {
                // The dominant water layer adds +time*flow to its noise UV.
                // Track that pattern instead of treating all water shading as
                // stationary. Blend towards camera motion when looking down
                // through the water, where the stationary bottom dominates.
                float grazing = 1.0 - abs(dot(normalize(-viewPos), material.geoNormal));
                float waveWeight = smoothstep(0.25, 0.8, grazing);
                vec2 previousWaveOffset = vec2(0.03, 0.01)
                    * (32.0 * WATER_WAVE_SCALE * WATER_WAVE_SPEED * frameTime);
                previousWorld.xz += previousWaveOffset * waveWeight;
            }
        #endif
        previousView = prevWorldToViewPos(previousWorld);
    }
    vec4 previousClip = gbufferPreviousProjection * vec4(previousView, 1.0);
    #ifdef LOD
        if (lodSurface) {
            previousClip = projPrevLod() * vec4(previousView, 1.0);
        }
    #endif
    if (previousClip.w > 1e-6) {
        vec2 previousUV = previousClip.xy / previousClip.w * 0.5 + 0.5;
        srMotion = clamp(previousUV - currentUV, -1.0, 1.0);
    } else {
        srMotion = vec2(0.0);
    }
    // Clouds are finite, wind-driven layers, not a stationary sky at infinity.
    // Read the scratch guide before this pass flips colortex9 to final motion.
    vec2 cloudGuide = srTexelFetchLow(colortex9, texel, 0).rg;
    float cloudDistance = exp2(abs(cloudGuide.x)) - 1.0;
    if (cloudGuide.y > 0.0 && cloudDistance > 0.0 &&
        material.materialID != MAT_HAND && (sky || cloudDistance < length(viewPos))) {
        vec3 wind;
        if (cloudGuide.x < 0.0) {
            wind = PLANE_CLOUD_SPEED * vec3(20.0, 0.0, 10.0);
        } else {
            #if CLOUD_TYPE == 1
                wind = CLOUD_SPEED * vec3(4.0, 0.0, 2.0);
            #else
                wind = CLOUD_SPEED * vec3(10.0, -10.0, 5.0);
            #endif
        }
        vec3 cloudWorld = gbufferModelViewInverse[3].xyz +
            normalize(mat3(gbufferModelViewInverse) * viewPos) * cloudDistance;
        // Noise coordinates add +time*wind; the previous cloud position is +dt*wind.
        vec3 cloudPreviousView = prevWorldToViewPos(cloudWorld + cameraMovement + wind * frameTime);
        vec4 cloudPreviousClip = gbufferPreviousProjection * vec4(cloudPreviousView, 1.0);
        if (cloudPreviousClip.w > 1e-6) {
            vec2 cloudMotion = cloudPreviousClip.xy / cloudPreviousClip.w * 0.5 + 0.5 - currentUV;
            srMotion = mix(srMotion, clamp(cloudMotion, -1.0, 1.0), smoothstep(0.05, 0.95, cloudGuide.y));
        }
    }
    srDepth = sky ? 1.0 : projectionDepth;

    #ifdef HELIAN_SR_RR
        if (sky) {
            srDiffuseAlbedo = vec4(vec3(0.5), 1.0);
            srSpecularAlbedo = vec4(0.0, 0.0, 0.0, 1.0);
            srNormalRoughness = vec4(0.0, 1.0, 0.0, 1.0);
        } else {
            bool water = material.materialID == MAT_WATER;
            float metalness = material.metalness;
            vec3 f0 = vec3(water ? 0.02 : 0.04);
            #ifdef LABPBR_F0
                if (metalness > 0.001) f0 = vec3(metalness);
                metalness = step(229.5 / 255.0, metalness);
            #endif
            f0 = mix(f0, material.albedo.rgb, metalness);
            float roughness = clamp(1.0 - material.smoothness, 0.0, 1.0);
            float NoV = clamp(dot(material.normal, normalize(-viewPos)), 0.0, 1.0);
            vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * material.normal);
            srDiffuseAlbedo = vec4(clamp(material.albedo.rgb * (1.0 - metalness) * (1.0 - f0), 0.0, 1.0), 1.0);
            srSpecularAlbedo = vec4(srEnvironmentBRDF(f0, roughness * roughness, NoV), 1.0);
            srNormalRoughness = vec4(worldNormal, roughness);
        }
    #endif
}
#endif
