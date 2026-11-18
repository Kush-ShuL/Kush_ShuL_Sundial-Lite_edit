#include "/settings/ReflectionSettings.glsl"
#ifdef HELIAN_RT_SCENE
    #extension GL_ARB_shader_image_load_store : require
    #extension GL_ARB_shading_language_packing : require
#endif

#include "/settings/GlobalSettings.glsl"
layout(triangles) in;
#if defined RT_ENTITY_GEOMETRY && defined TRANSPARENT_SHADOW && defined SHADOW_AND_SKY
    #define ENTITY_SHADOW_LAYERS 2
    layout(triangle_strip, max_vertices = 6) out;
    const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
#else
    #define ENTITY_SHADOW_LAYERS 1
    layout(triangle_strip, max_vertices = 3) out;
#endif
in vec4 terrainColor[];
in vec3 terrainNormal[];
in vec2 terrainUV[], terrainOffset[];
in float terrainDistortion[];
out vec4 color;
out vec3 worldNormal;
out vec2 texcoord, shadowOffset;
out float distortFixValue;
#ifdef RT_ENTITY_GEOMETRY
    flat in int rtModelId[];
    flat out int shadowModelId;
#endif

#if defined HELIAN_RT_SCENE && (!defined RT_ENTITY_GEOMETRY || defined RT_ENTITIES)
    #define CAPTURE_RT_TRIANGLE
    in vec3 rtPosition[], rtTint[], rtLight[];
    in vec2 rtUV[];
    #ifdef RT_ENTITY_GEOMETRY
        in float rtVertexAlpha[];
    #endif
    #include "/libs/Uniform.glsl"
    #if (RT_BOUNCES > 1 || defined RT_GI) && defined MC_SPECULAR_MAP
        #include "/libs/GbufferData.glsl"
    #endif
    #include "/libs/ReflectionVoxelWrite.glsl"
#endif

void main() {
    #ifdef CAPTURE_RT_TRIANGLE
        captureReflectionTriangle();
    #endif
    int layers = ENTITY_SHADOW_LAYERS;
    #ifdef RT_ENTITY_GEOMETRY
        if (rtModelId[0] == 7003) layers = 1;
    #endif
    for (int layer = 0; layer < layers; ++layer) {
    for (int i = 0; i < 3; ++i) {
        gl_Position = gl_in[i].gl_Position;
        color = terrainColor[i];
        worldNormal = terrainNormal[i];
        texcoord = terrainUV[i];
        shadowOffset = terrainOffset[i];
        #if ENTITY_SHADOW_LAYERS == 2
            gl_Position.x -= float(layer) * gl_Position.w;
            shadowOffset.x -= float(layer) * 0.5 * float(shadowMapResolution) * MC_SHADOW_QUALITY;
        #endif
        distortFixValue = terrainDistortion[i];
        #ifdef RT_ENTITY_GEOMETRY
            shadowModelId = rtModelId[i];
        #endif
        EmitVertex();
    }
    EndPrimitive();
    }
}
