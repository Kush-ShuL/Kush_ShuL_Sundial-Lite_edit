// Records, anchors and linked-list pointers share the geometry hash index.
const int rtSourceSlices=RT_CACHE_K/64;
const int rtBinCount=(rtGridSize+15)/16;
const int rtBinSlices=(rtBinCount*rtBinCount*rtBinCount+16383)/16384;
// Smaller receiver bricks preserve individual fixtures in dense rows.
#if RT_DISTANCE <= 96
const int rtLightBrickSize=4;
#else
const int rtLightBrickSize=8;
#endif
const int rtLightsPerBrick=4;
ivec3 rtLightShift(vec3 camera) {
    return (ivec3(floor(camera)) - ivec3(rtGridSize / 2)) & (rtLightBrickSize-1);
}
ivec3 rtLightListSlot(ivec3 brick, int lane) {
    return ivec3(brick.xy * 2 + ivec2(lane & 1, lane >> 1),3*rtSourceSlices+rtBinSlices+brick.z);
}
ivec3 rtSourceSlot(uint index) {
    return ivec3(index&127u,(index>>7u)&127u,index>>14u);
}
ivec3 rtEmitterHeadSlot(ivec3 bin) {
    int id=(bin.z*rtBinCount+bin.y)*rtBinCount+bin.x;
    return rtSourceSlot(uint(id))+ivec3(0,0,3*rtSourceSlices);
}
ivec3 rtEmitterNextSlot(uint index) {return rtSourceSlot(index)+ivec3(0,0,2*rtSourceSlices);}
ivec3 rtDecodeCell(uint key) {
    int i=int(key)-1;
    return ivec3(i%rtGridSize,(i/rtGridSize)%rtGridSize,i/(rtGridSize*rtGridSize));
}
vec3 rtLightRGB(uint record) {
    return vec3((record >> 6u) & 31u, (record >> 11u) & 31u, (record >> 16u) & 31u) / 31.0;
}
float rtLightLevel(uint record) { return float(record >> 28u); }
