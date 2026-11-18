const int rtGridSize = 2 * RT_DISTANCE + 8;
// 256 cell keys + heads and 384 triangle records per cache row: 20 KiB total.
const uint rtCacheMask = 256u * uint(RT_CACHE_K) - 1u;
const int rtMaxProbes = 12;

uint rtCellKey(ivec3 cell) {
    return uint((cell.z * rtGridSize + cell.y) * rtGridSize + cell.x + 1);
}

uint rtHash(uint key) {
    key ^= key >> 16u;
    key *= 0x7feb352du;
    key ^= key >> 15u;
    key *= 0x846ca68bu;
    return (key ^ (key >> 16u)) & rtCacheMask;
}

ivec2 rtSlot(uint hash, int probe) {
    uint slot = (hash + uint(probe)) & rtCacheMask;
    return ivec2(slot & 255u, slot >> 8u);
}

ivec2 rtTriangleSlot(uint index) {
    return ivec2(3u * (index % 384u), index / 384u);
}

uint rtSubBrickBit(ivec3 cell) {
    ivec3 sub = (cell >> 2) & 1;
    return 1u << uint(sub.x + 2 * sub.y + 4 * sub.z);
}

uint rtAxisBits(ivec3 cell) {
    uvec3 lane=uvec3(cell & 7);
    return (0x100u<<lane.x)|(0x10000u<<lane.y)|(0x1000000u<<lane.z);
}
