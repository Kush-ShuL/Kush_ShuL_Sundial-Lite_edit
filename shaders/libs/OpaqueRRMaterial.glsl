// Scratch values from deferred12, before transparent geometry replaces the
// front G-buffer. composite6 reuses these targets for the final RR inputs.
uniform sampler2D colortex11, colortex12, colortex13;
void readOpaqueRRMaterial(ivec2 p, inout GbufferData m) {
    vec4 a = srTexelFetchLow(colortex11,p,0);
    vec4 n = srTexelFetchLow(colortex12,p,0);
    vec4 g = srTexelFetchLow(colortex13,p,0);
    m.albedo = vec4(a.rgb, 1.0); m.metalness = a.a;
    m.normal = n.xyz; m.smoothness = n.a;
    m.geoNormal = g.xyz; m.materialID = g.a;
}
