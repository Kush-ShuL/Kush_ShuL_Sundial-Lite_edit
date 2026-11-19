#include "/libs/RTRayGeometry.glsl"
#ifdef SHADOW_AND_SKY
    #include "/libs/ShadowCoordinates.glsl"
    #include "/libs/ShadowTransmission.glsl"
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
bool traceRtSurface(vec3 origin, vec3 direction, float budget, bool diffuse, out RtHit hit) {
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
        vec4 local=rtBounceLamps(origin+hitT*direction+0.004*hit.normal,hit.normal);
        blockLight=blockLight*(1.0-local.a)+local.rgb;
    #endif
    // Registered emitters already illuminate the receiver via rtLocalLighting.
    // Count light reflected by their material here, not their emission twice.
    vec3 lighting = vec3(0.025 + (diffuse ? 0.0 : emission*emission*4.0)) + blockLight;
    #ifdef SHADOW_AND_SKY
        float direct = max(dot(hit.normal, shadowDirection), 0.0);
        vec3 sunlight=sunColor*direct;
        if (sky > 0.0 && direct > 0.0) {
            vec3 coord = worldPosToShadowCoord(origin + hitT * direction + 0.04 * hit.normal);
            if (all(lessThan(abs(coord - vec3(0.75,0.75,0.5)), vec3(0.249,0.249,0.5)))) {
                coord.z-=4e-5;
                sunlight*=textureLod(shadowtex0,coord,0.0)*glassTransmission(coord);
            }
        }
        vec3 skyAccess=vec3(sky*sky);
        if (diffuse) {
            vec3 p=origin+hitT*direction+0.004*hit.normal;
            float upWeight=0.5+0.5*hit.normal.y;
            skyAccess*=upWeight;
            if (sky*upWeight>0.0) {
                vec3 up=normalize(vec3(hit.normal.x,1.0,hit.normal.z));
                float b=dot(p,up);
                float edge=sqrt(max(0.0,b*b+float(RT_DISTANCE*RT_DISTANCE)-dot(p,p)))-b;
                float reach=min(float(RT_GI_DISTANCE),edge-0.002);
                if (reach>0.002) skyAccess*=rtVisibilityTo(p,up,reach,ivec3(-1));
            }
            // Use the same incident sun intensity as the primary diffuse pass.
            // The lightmap gates leaks; it is not a second solar attenuation.
            lighting+=sunlight*(8.0*SUNLIGHT_BRIGHTNESS*(1.0-sqrt(weatherStrength)*SUNLIGHTINRAIN)*clamp(10.0*sky,0.0,1.0));
        } else lighting+=sunlight*(sky*sky*SUNLIGHT_BRIGHTNESS);
        lighting+=skyAccess*skyColorUp*ENVIROMENT_BRIGHTNESS;
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

bool traceRtSegment(vec3 origin, vec3 direction, float budget, bool diffuse, out RtHit hit) {
    if (!traceRtSurface(origin, direction, budget, diffuse, hit)) return false;
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
        if (travelled >= budget || !rtInRange(nextOrigin) || !traceRtSurface(nextOrigin, direction, budget - travelled, diffuse, next)) break;
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
        if (!traceRtSegment(origin, direction, budget, false, hit)) break;
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
