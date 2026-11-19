//     _________      __        __     ___       __     __________      ________        ______        __           
//    /  _____  \    |  |      |  |   |   \     |  |   |   _____  \    |__    __|      /  __  \      |  |          
//   /  /     \__\   |  |      |  |   |    \    |  |   |  |     \  \      |  |        /  /  \  \     |  |          
//  |  |             |  |      |  |   |  |  \   |  |   |  |      |  |     |  |       /  /    \  \    |  |          
//   \  \______      |  |      |  |   |  |\  \  |  |   |  |      |  |     |  |      |  |______|  |   |  |          
//    \______  \     |  |      |  |   |  | \  \ |  |   |  |      |  |     |  |      |   ______   |   |  |          
//           \  \    |  |      |  |   |  |  \  \|  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  ___       |  |   |  |      |  |   |  |   \  |  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  \  \_____/  /     \  \____/  /    |  |    \    |   |  |_____/  /    __|  |__    |  |      |  |   |  |_________ 
//   \_________/       \________/     |__|     \___|   |__________/    |________|   |__|      |__|   |____________|
//
//  General Public License v3.0. Copyright (C) 2026 GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Gbuffer for transparent terrain
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 color;
in vec4 texlmcoord;
in vec3 viewPos;

flat in int materialID;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/PhysicsOcean.glsl"
#include "/libs/Parallax.glsl"

#ifdef PHYSICS_OCEAN
    in vec3 physics_localPosition;
    in float physics_localWaviness;
#endif

mat3 calcTbnMatrix(vec2 dx, vec2 dy, vec3 position) {
    vec3 px=dFdx(position), py=dFdy(position);
    vec3 n=cross(px,py);
    n=dot(n,n)>1e-24 ? normalize(n) : normalize(-position);
    vec3 t=cross(py*dx.x-px*dy.x,n), b=cross(py*dx.y-px*dy.y,n);
    vec3 basis=abs(n.y)<0.9 ? vec3(0,1,0) : vec3(1,0,0);
    t=dot(t,t)>1e-24 ? normalize(t) : normalize(cross(basis,n));
    b=dot(b,b)>1e-24 ? normalize(b) : cross(n,t);
    return mat3(t,b,n);
}

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    #ifdef PHYSICS_OCEAN
        WavePixelData physics_waveData = physics_wavePixel(physics_localPosition.xz, physics_localWaviness, physics_iterationsNormal, physics_gameTime);
    #endif
    GbufferData rawData;
    vec2 texcoord = texlmcoord.st;
    vec4 albedoData = texture(gtexture, texcoord);

    vec2 texGradX = dFdx(texlmcoord.st);
    vec2 texGradY = dFdy(texlmcoord.st);
    mat3 tbnMatrix = calcTbnMatrix(texGradX, texGradY, viewPos.xyz);

    rawData.albedo = albedoData * color;
    bool glass=materialID==8210 || materialID==8211;
    bool clearGlass=glass && rawData.albedo.a<1.0/255.0;
    if (!glass && materialID!=8192 && materialID!=8194 && rawData.albedo.a<1.0/255.0) discard;
    if (clearGlass) rawData.albedo=vec4(1.0,1.0,1.0,0.0);
    rawData.lightmap = texlmcoord.pq;
    rawData.normal = tbnMatrix[2];
    rawData.geoNormal = tbnMatrix[2];
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = 0.0;
    rawData.materialID = MAT_DEFAULT + MAT_WATER * float(materialID == 8192 || materialID == 8194);
    // Translucent terrain has no POM offset. Carry the glass thickness
    // here until composite5 consumes it, before the motion/depth passes.
    rawData.parallaxOffset = materialID==8211 ? 0.125 : (glass ? 1.0 : 0.0);
    rawData.depth = 0.0;

    #ifdef MC_SPECULAR_MAP
        vec4 specularData = textureLod(specular, texcoord, 0.0);
        SPECULAR_FORMAT(rawData, specularData);
    #endif

    float isEmissive = clamp(float(max(0, materialID) & 0x7000) - 16384.0, 0.0, 1.0);
    rawData.smoothness += step(rawData.smoothness, 1e-3) * (1.0 - isEmissive);

    #ifndef SPECULAR_EMISSIVE
        rawData.emissive = 0.0;
    #endif

    #ifdef HARDCODED_EMISSIVE
        rawData.emissive += step(rawData.emissive, 1e-3) * isEmissive;
    #endif

    #ifdef MOD_LIGHT_DETECTION
        if (texlmcoord.p > 0.99999) {
            rawData.emissive += step(rawData.emissive, 1e-3) * step(materialID, -0.5);
        }
    #endif

    #ifndef LABPBR_POROSITY
        rawData.porosity = 0.0;
    #endif

    float wetStrength = 0.0;
    vec3 mcPos = viewToWorldPos(viewPos) + cameraPosition;
    if (rainyStrength > 0.0) {
        vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);
        if (rawData.materialID == MAT_WATER) {
            wetStrength = outdoor * clamp(abs(worldNormal.y) * 10.0 - 0.1, 0.0, 1.0);
        }
        else {
            #if RAIN_PUDDLE == 1
                wetStrength = (1.0 - rawData.metalness) * clamp(worldNormal.y * 10.0 - 0.1, 0.0, 1.0) * outdoor * rainyStrength;
            #elif RAIN_PUDDLE == 2
                wetStrength = groundWetStrength(mcPos, worldNormal.y, rawData.metalness, 0.0, outdoor);
            #endif
        }
        rawData.smoothness += (1.0 - rawData.smoothness) * wetStrength;
    }

    #ifdef PHYSICS_OCEAN
        rawData.normal = mat3(gbufferModelView) * (physics_waveData.normal * vec3(0.5, 1.0, 0.5));
        rawData.normal = -signI(dot(rawData.normal, viewPos.xyz)) * rawData.normal;
        rawData.geoNormal = -signI(dot(rawData.geoNormal, viewPos.xyz)) * rawData.geoNormal;
        #if WATER_TYPE == 0
            rawData.albedo.rgb = color.rgb;
        #else
            rawData.albedo = albedoData;
        #endif
    #else
        #ifdef MC_NORMAL_MAP
            vec4 normalData = texture(normals, texcoord);
        #else
            vec4 normalData = vec4(0.5, 0.5, 1.0, 1.0);
        #endif
        #if WATER_TYPE == 0
            if (rawData.materialID == MAT_WATER) {
                rawData.albedo.rgb = color.rgb;
                vec3 tangentDir = viewPos.xyz * tbnMatrix;
                rawData.normal = waterWave(mcPos / 32.0, tangentDir);
                rawData.smoothness = 1.0;
                rawData.metalness = 0.0;
                rawData.porosity = 0.0;
                rawData.emissive = 0.0;
            }
            else
        #endif
        {
            #if WATER_TYPE == 1
                if (rawData.materialID == MAT_WATER) {
                    rawData.albedo = albedoData;
                }
            #endif
            #ifdef MC_NORMAL_MAP
                rawData.normal = clearGlass ? vec3(0,0,1) : NORMAL_FORMAT(normalData.xyz);
                rawData.normal.xy *= NORMAL_STRENGTH;
            #else
                rawData.normal = vec3(0.0, 0.0, 1.0);
            #endif
        }

        float viewDepthInv = inversesqrt(dot(viewPos.xyz, viewPos.xyz));
        vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
        #ifdef RAIN_RIPPLES
            rippleNormal = rainRippleNormal(mcPos);
            rippleNormal.xy *= viewDepthInv / (viewDepthInv + 0.1 * RIPPLE_FADE_SPEED);
        #endif
        rawData.normal.xy += rippleNormal.xy * wetStrength;
        vec3 mapped=tbnMatrix*rawData.normal;
        rawData.normal=dot(mapped,mapped)>1e-12 ? normalize(mapped) : tbnMatrix[2];

        vec3 viewDir = viewPos.xyz * (-viewDepthInv);
        float NdotV = dot(rawData.normal, viewDir);
        vec3 edgeNormal = rawData.normal - viewDir * NdotV;
        float curveStart = clamp(dot(viewDir, rawData.geoNormal),1e-5,1.0);
        float weight = NdotV < curveStart ? curveStart*exp(NdotV/curveStart-1.0) : min(NdotV,1.0);
        rawData.normal = viewDir*weight + edgeNormal*sqrt(max(0.0,1.0-weight*weight)/max(dot(edgeNormal,edgeNormal),1e-12));
        float fadeFactor = viewDepthInv * curveStart * gbufferProjection[1].y * srOutputScreenSize.y;
        rawData.normal = mix(tbnMatrix[2], rawData.normal, fadeFactor / (fadeFactor + 0.3));
    #endif

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
