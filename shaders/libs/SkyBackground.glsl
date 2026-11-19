// Sky at infinity shared by the main sky pass and a refracted ray whose
// straight-ahead screen pixel is hidden by a window frame.
vec3 skyBackground(vec3 source, vec3 origin, vec3 dir, vec4 intersection,
                   out vec3 scattering, out vec4 plane) {
    vec3 sky = singleAtmosphereScattering(source, origin, dir, sunDirection, intersection, 30.0, scattering);
    plane = vec4(0.0);
    #ifdef PLANE_CLOUD
        plane = planeClouds(origin, dir, sunDirection, skyColorUp, intersection.xyz);
    #endif
    return sky;
}

void blendLowerSkyPlane(inout vec3 sky, inout vec4 plane, float originY) {
    if (originY + cameraPosition.y + WORLD_BASIC_HEIGHT - 500.0 < PLANE_CLOUD_HEIGHT) {
        sky = mix(sky, plane.rgb, plane.a);
        plane.a = 0.0;
    }
}
