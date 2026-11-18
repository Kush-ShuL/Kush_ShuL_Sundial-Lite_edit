// Sources share the geometry hash slots; receiver lists occupy the upper slices.
ivec3 rtLightShift(vec3 camera) {
    return (ivec3(floor(camera)) - ivec3(rtGridSize / 2)) & 7;
}
ivec3 rtLightListSlot(ivec3 brick, int lane) {
    return ivec3(brick.xy * 2 + ivec2(lane & 1, lane >> 1), 128 + brick.z);
}
ivec3 rtSourceSlot(uint index) {
    return ivec3(index&127u,(index>>7u)&127u,index>>14u);
}
ivec3 rtDecodeCell(uint key) {
    int i=int(key)-1;
    return ivec3(i%rtGridSize,(i/rtGridSize)%rtGridSize,i/(rtGridSize*rtGridSize));
}
vec3 rtLightRGB(uint record) {
    return vec3((record >> 6u) & 31u, (record >> 11u) & 31u, (record >> 16u) & 31u) / 31.0;
}
float rtLightLevel(uint record) { return float(record >> 28u); }
