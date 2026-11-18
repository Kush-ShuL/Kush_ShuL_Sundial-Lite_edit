uniform sampler2D colortex20;
layout(r32ui) uniform uimage2D giClaims, giRequests;

ivec2 giRequestPixel(ivec2 q, ivec2 size) {
    return min(ivec2((vec2(q)+0.5)/vec2(size)*screenSize),ivec2(screenSize)-1);
}
int giPixelBits(ivec2 size) {
    return max(1,findMSB(uint(size.x*size.y-1))+1);
}
