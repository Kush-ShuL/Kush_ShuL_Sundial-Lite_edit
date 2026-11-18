vec3 rtDiffuseBounce(vec3 origin, vec3 normal, vec3 geoNormal, int stratum, int phase) {
    vec3 tangent = normalize(cross(abs(normal.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0), normal));
    vec3 bitangent = cross(normal, tangent);
    vec3 indirect = vec3(0.0);
    const int rays = 4 * RT_GI_SAMPLES;
    float peakY = 0.0, secondY = 0.0;
    vec3 peak = vec3(0.0);
    for (int i = 0; i < rays; ++i) {
        // Four adjacent patches interleave the hemisphere strata. Their pooled
        // estimate covers the hemisphere evenly without tracing additional rays.
        vec2 u = fract(vec2(float(i+phase*rays)*0.61803399+0.25*float(stratum),
                      (float(i)+(float(phase)+(float(stratum)+0.5)*0.25)*0.25)/float(rays)));
        float r = sqrt(u.y), phi = 2.0 * PI * u.x;
        vec3 dir = r * (cos(phi) * tangent + sin(phi) * bitangent) + sqrt(1.0 - u.y) * normal;
        if (dot(dir, geoNormal) <= 0.0) continue;
        RtHit hit;
        if (traceRtSegment(origin, dir, float(RT_GI_DISTANCE), hit)) {
            indirect += hit.radiance;
            float y=dot(hit.radiance,vec3(0.2126,0.7152,0.0722));
            if (y>peakY) { secondY=peakY; peakY=y; peak=hit.radiance; }
            else secondY=max(secondY,y);
        }
    }
    // Cosine-weighted diffuse samples already include the Lambertian cosine / pi.
    indirect -= peak * 0.75 * max(0.0,1.0-(2.0*secondY+0.2)/max(peakY,1e-5));
    return indirect * (RT_GI_STRENGTH / float(rays));
}
