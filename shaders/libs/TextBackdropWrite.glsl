// A text background may be submitted before deferred lighting. Keep it out
// of the opaque depth/material buffers, including on pixels showing the sky.
layout(r32ui) uniform uimage2D colorimg24, colorimg25;
bool captureTextBackdrop(vec4 color) {
    uvec4 c=uvec4(round(clamp(color,0.0,1.0)*255.0));
    if (c.a==0u) return true;
    uint rgba=c.r|(c.g<<8u)|(c.b<<16u)|(c.a<<24u);
    uint hash=(rgba^(rgba>>13u))*0x9e3779b9u;
    // Panels normally share one ARGB value across thousands of pixels.
    // The palette leaves 22 bits per pixel for depth without rounding alpha.
    for (uint i=0u;i<16u;++i) {
        uint slot=((hash>>22u)+i)&1023u;
        ivec2 at=ivec2(slot,0);
        uint old=imageLoad(colorimg25,at).r;
        if (old==0u) old=imageAtomicCompSwap(colorimg25,at,0u,rgba);
        if (old!=0u && old!=rgba) continue;
        uint depth=max(1u,uint(round((1.0-gl_FragCoord.z)*4194303.0)));
        imageAtomicMax(colorimg24,ivec2(gl_FragCoord.xy),(depth<<10u)|slot);
        return true;
    }
    return false;
}
