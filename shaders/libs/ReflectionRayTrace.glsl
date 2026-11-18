#include "/libs/RTRayGeometry.glsl"
#ifdef SHADOW_AND_SKY
    #include "/libs/ShadowCoordinates.glsl"
#endif
struct RtHit {
    vec3 position;
    vec3 normal;
    vec3 radiance;
    vec3 specularWeight;
    float distanceAlongRay;
    float opacity;
    vec3 transmission;
};

#ifdef RT_GI
#include "/libs/RTLocalLighting.glsl"
#endif
bool traceRtSurface(vec3 origin, vec3 direction, float budget, out RtHit hit) {
    float hitT; vec4 albedo; uvec2 data; ivec3 cell; bool complete;
    vec3 unusedTransmission;
    if (!rtGeometry(origin,direction,budget,false,ivec3(-1),hitT,hit.normal,albedo,data,cell,complete,unusedTransmission)) return false;
    vec3 base = pow(albedo.rgb * rtTintRGB(data.x),vec3(2.2));
    hit.opacity = albedo.a;
    hit.transmission = rtTransmission(albedo,data);
    float block = float((data.x >> 24u) & 15u) / 15.0;
    float sky = float(data.x >> 28u) / 15.0;
    float emission = float(data.y >> 24u) / 15.0;
    vec3 blockLight = vec3(LIGHT_COLOR_R,LIGHT_COLOR_G,LIGHT_COLOR_B)*block*block*LIGHT_BRIGHTNESS;
    #ifdef RT_GI
        vec4 local=rtLocalLighting(origin+hitT*direction+0.004*hit.normal,hit.normal,false);
        blockLight=blockLight*(1.0-local.a)+local.rgb;
    #endif
    vec3 lighting = vec3(0.025 + emission * emission * 4.0) + blockLight;
    #ifdef SHADOW_AND_SKY
        float direct = max(dot(hit.normal, shadowDirection), 0.0);
        if (sky > 0.0 && direct > 0.0) {
            vec3 coord = worldPosToShadowCoord(origin + hitT * direction + 0.04 * hit.normal);
            if (all(lessThan(abs(coord - vec3(0.75,0.75,0.5)), vec3(0.249,0.249,0.5))))
                direct *= textureLod(shadowtex0, coord - vec3(0.0,0.0,4e-5), 0.0);
        }
        lighting += sky * sky * (skyColorUp * ENVIROMENT_BRIGHTNESS
                  + sunColor * direct * SUNLIGHT_BRIGHTNESS);
    #endif
    hit.radiance = base * lighting;
    hit.distanceAlongRay = hitT;
    hit.position = origin + hitT * direction;
    #if RT_BOUNCES > 1
        float smoothness = float((data.y >> 8u) & 255u) / 255.0;
        float f0 = float((data.y >> 16u) & 255u) / 255.0;
        vec3 spec = f0 >= 0.9 ? base : vec3(max(0.04, f0));
        hit.specularWeight = smoothness * smoothness * mix(spec, vec3(1.0), pow(1.0 - abs(dot(direction, hit.normal)), 5.0));
    #endif
    return true;
}

bool traceRtSegment(vec3 origin, vec3 direction, float budget, out RtHit hit) {
    if (!traceRtSurface(origin, direction, budget, hit)) return false;
    vec3 transmission = hit.transmission;
    hit.radiance *= hit.opacity;
    #if RT_BOUNCES > 1
        hit.specularWeight *= hit.opacity;
    #endif
    float travelled = hit.distanceAlongRay;
    for (int layer = 1; layer < 8 && max(transmission.r,max(transmission.g,transmission.b)) > 0.004; ++layer) {
        travelled += 0.0005;
        vec3 nextOrigin = origin + travelled * direction;
        RtHit next;
        if (travelled >= budget || !rtInRange(nextOrigin) || !traceRtSurface(nextOrigin, direction, budget - travelled, next)) break;
        hit.radiance += transmission * next.opacity * next.radiance;
        travelled += next.distanceAlongRay;
        transmission *= next.transmission;
    }
    return true;
}

vec4 traceVoxelReflection(vec3 origin, vec3 direction, out vec3 firstHitView) {
    vec3 radiance = vec3(0.0), throughput = vec3(1.0);
    float firstDistance = 0.0, budget = float(RT_DISTANCE);
    for (int bounce = 0; bounce < RT_BOUNCES; ++bounce) {
        RtHit hit;
        if (!traceRtSegment(origin, direction, budget, hit)) break;
        if (bounce == 0) {
            firstDistance = max(hit.distanceAlongRay, 0.001);
            firstHitView = worldToViewPos(hit.position);
        }
        radiance += throughput * hit.radiance;
        #if RT_BOUNCES > 1
            throughput *= hit.specularWeight;
            budget -= hit.distanceAlongRay + 0.002;
            if (max(max(throughput.r, throughput.g), throughput.b) < 0.015 || budget <= 0.0) break;
            origin = hit.position + 0.002 * hit.normal;
            if (!rtInRange(origin)) break;
            direction = reflect(direction, hit.normal);
        #endif
    }
    return vec4(radiance, firstDistance);
}
