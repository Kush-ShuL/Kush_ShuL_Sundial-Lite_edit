#ifndef HELIAN_SHADOW_COORDINATES
#define HELIAN_SHADOW_COORDINATES
vec3 worldPosToShadowCoordNoDistort(vec3 worldPos) {
    vec3 shadowCoord = mat3(shadowModelViewProj0, shadowModelViewProj1, shadowModelViewProj2) * worldPos + shadowModelViewProj3;
    shadowCoord.z = shadowCoord.z * 0.1 + 0.5;
    return shadowCoord.xyz;
}

vec3 distortShadowCoord(vec3 shadowCoord) {
    float clipLengthInv = inversesqrt(max(dot(shadowCoord.xy, shadowCoord.xy),1e-12));
    float shadowDistortion = log(distortionStrength / clipLengthInv + 1.0) / log(distortionStrength + 1.0) * 0.25;
    shadowCoord.xy *= clipLengthInv * shadowDistortion;
    shadowCoord.xy = shadowCoord.xy + 0.75;
    return shadowCoord;
}

vec3 worldPosToShadowCoord(vec3 worldPos) {
    vec3 shadowCoord = worldPosToShadowCoordNoDistort(worldPos);
    shadowCoord = distortShadowCoord(shadowCoord);
    return shadowCoord;
}
#endif
