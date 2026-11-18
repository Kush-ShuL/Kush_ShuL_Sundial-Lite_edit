bool rtInRange(vec3 cameraRelativePos) {
    return dot(cameraRelativePos, cameraRelativePos) < float(RT_DISTANCE * RT_DISTANCE);
}

vec3 reflectionViewPosition(vec2 coord, float depth) {
    #ifdef LOD
        if (depth > 1.0) return screenToViewPosLod(coord, depth - 1.0);
    #endif
    return screenToViewPos(coord, depth);
}
