#include "/settings/ReflectionSettings.glsl"
layout(local_size_x = 4, local_size_y = 4, local_size_z = 4) in;
#ifdef HELIAN_RT_SCENE
uniform usampler3D rtBricks;
layout(r32ui) writeonly uniform uimage3D rtRegionImage;
shared uint occupied;
#if RT_DISTANCE <= 32
const ivec3 workGroups = ivec3(3, 3, 3);
#elif RT_DISTANCE <= 64
const ivec3 workGroups = ivec3(5, 5, 5);
#elif RT_DISTANCE <= 128
const ivec3 workGroups = ivec3(9, 9, 9);
#else
const ivec3 workGroups = ivec3(17, 17, 17);
#endif
void main() {
    if (gl_LocalInvocationIndex == 0u) occupied = 0u;
    barrier();
    ivec3 brick = ivec3(gl_GlobalInvocationID);
    if (all(lessThan(brick, ivec3(RT_DISTANCE / 4 + 1))))
        if (texelFetch(rtBricks, brick, 0).r != 0u) atomicOr(occupied, 1u);
    barrier();
    if (gl_LocalInvocationIndex == 0u) imageStore(rtRegionImage, ivec3(gl_WorkGroupID), uvec4(occupied));
}
#else
const ivec3 workGroups = ivec3(0, 0, 0);
void main() {}
#endif
