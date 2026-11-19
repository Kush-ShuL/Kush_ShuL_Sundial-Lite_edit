vec3 rtDiffuseBounce(vec3 origin, vec3 normal, vec3 geoNormal, int stratum, int phase) {
    vec3 tangent = normalize(cross(abs(normal.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0), normal));
    vec3 bitangent = cross(normal, tangent);
    vec3 indirect = vec3(0.0);
    const int rays = 4 * RT_GI_SAMPLES;
    for (int i = 0; i < rays; ++i) {
        // Four adjacent patches interleave the hemisphere strata. Their pooled
        // estimate covers the hemisphere evenly without tracing additional rays.
        vec2 u = fract(vec2(float(i+phase*rays)*0.61803399+0.25*float(stratum),
                      (float(i)+(float(phase)+(float(stratum)+0.5)*0.25)*0.25)/float(rays)));
        float r = sqrt(u.y), phi = 2.0 * PI * u.x;
        vec3 dir = r * (cos(phi) * tangent + sin(phi) * bitangent) + sqrt(1.0 - u.y) * normal;
        if (dot(dir, geoNormal) <= 0.0) continue;
        RtHit hit;
        if (traceRtSegment(origin, dir, float(RT_GI_DISTANCE), true, hit)) indirect+=hit.radiance;
    }
    // Cosine-weighted diffuse samples already include the Lambertian cosine / pi.
    return indirect * (RT_GI_STRENGTH / float(rays));
}
