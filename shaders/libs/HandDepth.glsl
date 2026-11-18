#ifndef HELIAN_HAND_DEPTH
#define HELIAN_HAND_DEPTH

// Hold first-person geometry in the front 1% of the depth buffer, rather
// than Iris's middle interval, so nearby world blocks remain behind it.
const float HELIAN_HAND_DEPTH_RANGE = 0.01;

float decodeHandDepth(float depth) {
    return depth / HELIAN_HAND_DEPTH_RANGE;
}

float encodeHandDepth(float depth) {
    return depth * HELIAN_HAND_DEPTH_RANGE;
}

vec4 foregroundHandPosition(vec4 position) {
    #ifdef MC_HAND_DEPTH
        const float originalHandScale = MC_HAND_DEPTH;
    #else
        const float originalHandScale = 0.125;
    #endif
    position.z = position.z * (HELIAN_HAND_DEPTH_RANGE / originalHandScale)
               + position.w * (HELIAN_HAND_DEPTH_RANGE - 1.0);
    return position;
}

#endif
