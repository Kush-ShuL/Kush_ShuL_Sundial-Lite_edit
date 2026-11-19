vec4 atlasQuadBounds(vec2 uv,vec2 mid,vec2 atlas) {
    vec2 halfSize=abs(uv-mid);
    if (min(halfSize.x,halfSize.y)<1e-6) halfSize=abs((uv-mid)-(uv-mid).yx);
    // Packed corner UVs and the quad midpoint can round in opposite
    // directions. Do not enlarge just one triangle by an atlas texel.
    vec2 eps=min(vec2(0.25),atlas/32768.0+0.001);
    vec2 lo=clamp(floor((mid-halfSize)*atlas+eps),vec2(0),atlas-1.0);
    vec2 hi=clamp(ceil((mid+halfSize)*atlas-eps),lo+1.0,atlas);
    return vec4(lo/atlas,(hi-lo)/atlas);
}
