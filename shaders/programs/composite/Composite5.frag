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
//  Transparent blending and common fog; Volumetric light and fog
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;
uniform sampler2D colortex19;
uniform sampler2D colortex10;
uniform sampler2D colortex21;

in vec2 texcoord;

#define REFRACTION_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define REFRACTION_EDGE_FADE 0.5 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]

// Volumetric Light
    #define VOLUMETRIC_LIGHT

    #define VL_STRENGTH 1.5 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]
    #define VL_SAMPLES 12 // [2 3 4 5 6 7 8 10 12 14 16 20 24 28 32]
    #define MORNING_VL_STRENGTH 3.0 // [0.0 0.5 1.0 1.5 2.0 2.5 3.0 3.5 4.0 4.5 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.0 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define NOON_VL_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]
    #define WATER_VL_STRENGTH 0.6 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]

// Volumetric Fog
    #define VOLUMETRIC_FOG

    #define VOLUMETRIC_FOG_SPEED 1.0 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_AMOUNT 0.80 // [0.0 0.05 0.10 0.15 0.20 0.25 0.30 0.35 0.40 0.45 0.50 0.55 0.60 0.65 0.70 0.75 0.80 0.85 0.90 0.95 1.00 1.05 1.10 1.15 1.20 1.25 1.30 1.35 1.40 1.45 1.50 1.55 1.60 1.65 1.70 1.75 1.80 1.85 1.90 1.95 2.0]
    #define VOLUMETRIC_FOG_DENSITY 1.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_CENTER_HEIGHT 80 // [-60 -50 -40 -30 -20 -10 0 10 20 30 40 50 60 70 80 90 100 110 120 130 140 150 160 170 180 190 200 210 220 230 240 250 260 270 280 290 300 310 320]
    #define VOLUMETRIC_FOG_THICKNESS 128 // [2 4 6 8 12 16 20 24 28 32 40 48 56 64 80 96 112 128 144 160 176 192 218 224 240 256]

    #define VOLUMETRIC_FOG_MORNING_DENSITY 0.8 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_NOON_DENSITY 0.1  // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

    #define VOLUMETRIC_FOG_SCALE 5.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_OCTAVES 4 // [1 2 3 4 5 6 7 8 9 10]
    #define VOLUMETRIC_FOG_OCTAVE_SCALE 2.8 // [2.0 2.1 2.2 2.3 2.4 2.5 2.55 2.6 2.65 2.7 2.75 2.8 2.85 2.9 2.95 3.0 3.1 3.2 3.3 3.4 3.5 3.6 3.7 3.8 3.9 4.0]
    #define VOLUMETRIC_FOG_OCTAVE_FADE 0.45 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

#ifdef THE_END
    #include "/libs/Galaxy.glsl"
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Shadow.glsl"

#ifdef SHADOW_AND_SKY
    #include "/libs/SkyBackground.glsl"
    vec3 glassSky(vec3 dir) {
        vec3 origin=gbufferModelViewInverse[3].xyz;
        vec4 intersection=planetIntersectionData(origin,dir), plane;
        vec3 scattering;
        vec3 sky=skyBackground(vec3(0.0),origin,dir,intersection,scattering,plane);
        blendLowerSkyPlane(sky,plane,origin.y);
        float cloudDepth;
        sky=sampleClouds(sky,scattering,origin,dir,shadowDirection,sunDirection,skyColorUp,intersection.xyz,0.0,cloudDepth).rgb;
        return mix(sky,plane.rgb,plane.a);
    }
#endif

// Only filter taps whose visible background (including translucent entities)
// lies behind the refracting surface. Keep the unshifted pixel if all are in front.
vec3 refractionViewPos(vec2 uv,float depth) {
    #ifdef LOD
        if (depth>1.0) return screenToViewPosLod(uv,depth-1.0);
    #endif
    return screenToViewPos(uv,depth);
}

// Follow both parts of the ray (inside the slab, then parallel to the
// incident ray). In screen space the second segment ends at the original UV.
// Zero means off-screen or in front of this leg. Sky is a valid background
// at infinity; it must not be confused with either of those cases.
float glassReceiverZ(vec2 uv,vec3 front,vec3 face) {
    if (any(lessThan(uv,vec2(0))) || any(greaterThanEqual(uv,vec2(1)))) return 0.0;
    ivec2 p=ivec2(uv*screenSize);
    uv=(vec2(p)+0.5)/screenSize;
    float d=srTexelFetchLow(depthtex1,p,0).r;
    #ifdef LOD
        if (d==1.0) d+=getLodDepthSolid(uv);
    #endif
    vec3 bg=refractionViewPos(uv,d);
    bool sky=d==1.0 || d>=2.0;
    float z=sky ? -1e20 : (dot(bg-front,face)<-1e-5 ? bg.z : 0.0);
    float m=srTexelFetchLow(colortex10,p,0).r;
    if (m<min(d,1.0) && srTexelFetchLow(colortex21,p,0).a>=0.5) {
        vec3 model=refractionViewPos(uv,m);
        if (dot(model-front,face)<0.0) z=model.z;
    }
    return z;
}

float refractionEdgeScale(vec2 uv,vec2 offset) {
    vec2 toEdge=mix(uv,1.0-uv,greaterThan(offset,vec2(0.0)))/max(abs(offset),vec2(1e-8));
    float t=min(toEdge.x,toEdge.y);
    if (t>=1.0/(1.0-REFRACTION_EDGE_FADE)) return 1.0;
    return t+pow2(REFRACTION_EDGE_FADE*t)/(-1.0+(1.0-2.0*REFRACTION_EDGE_FADE)*t);
}

bool glassCrossing(float z,float rayInvDepth) {
    return z<0.0 && z>-1e19 && -1.0/z>=rayInvDepth;
}

vec2 glassOffset(vec2 uv,vec3 front,vec3 bent,vec3 face,float thickness,out vec3 samplePlane,out bool clippedBackground) {
    samplePlane=front;
    clippedBackground=false;
    vec3 back=front+bent*(thickness/max(0.001,-dot(bent,face)));
    if (REFRACTION_STRENGTH==0.0 || back.z>=-0.001) return vec2(0);
    vec2 span=0.5*(viewToProjectionPos(back).xy-viewToProjectionPos(front).xy);
    // Fade the path before testing it, keeping the exit on the rear face.
    // Moving a verified lookup afterwards can put it back on the window frame.
    float edge=refractionEdgeScale(uv,span);
    if (edge<1.0) {
        vec3 straight=normalize(front);
        back=mix(front+straight*(thickness/max(0.001,-dot(straight,face))),back,edge);
        span=0.5*(viewToProjectionPos(back).xy-viewToProjectionPos(front).xy);
    }
    float pixels=length(span*screenSize);
    if (pixels<0.1) return vec2(0);
    int steps=int(clamp(ceil(pixels*0.5),1.0,8.0));
    // Keep a coplanar receiver (e.g. a lamp touching the glass) on the
    // background side despite depth quantization at grazing angles.
    vec3 rearPlane=back+face*clamp(2e-5*back.z*back.z,0.0005,0.01);
    float visible=2.0;
    for (int leg=0;leg<2;++leg) {
        // Reciprocal view depth is linear along a projected segment.
        float start=leg==0 ? 0.0 : 1.0, end=1.0-start;
        float iz0=leg==0 ? -1.0/front.z : -1.0/back.z;
        float iz1=leg==0 ? -1.0/back.z : 0.0;
        vec3 plane=leg==0 ? front : back;
        if (leg==1) {
            vec2 exitUV=uv+span;
            float z=glassReceiverZ(exitUV,rearPlane,face);
            if (z<0.0) visible=1.0;
            if (z<0.0 && z>-1e19) {
                vec2 center=(floor(exitUV*screenSize)+0.5)/screenSize;
                vec3 v=refractionViewPos(center,0.5);
                if (dot(v*(z/v.z)-back,face)>=-dot(rearPlane-back,face)) {
                    samplePlane=rearPlane;
                    return span;
                }
            }
        }
        float lo=0.0;
        for (int i=1;i<=steps;++i) {
            float hi=float(i)/float(steps);
            vec2 at=uv+span*mix(start,end,hi);
            float z=glassReceiverZ(at,plane,face);
            if (glassCrossing(z,mix(iz0,iz1,hi))) {
                // Refine the first crossing, not a second guessed background
                // plane. At a silhouette only keep a depth-consistent hit.
                for (int j=0;j<10 && (hi-lo)*pixels>0.125;++j) {
                    float mid=0.5*(lo+hi);
                    float mz=glassReceiverZ(uv+span*mix(start,end,mid),plane,face);
                    if (glassCrossing(mz,mix(iz0,iz1,mid))) {hi=mid;z=mz;}
                    else lo=mid;
                }
                if (abs(iz1-iz0)<1e-8) {samplePlane=plane;return span*mix(start,end,hi);}
                float hit=(-1.0/z-iz0)/(iz1-iz0);
                if (hit>=lo-1.0/pixels && hit<=hi+1.0/pixels) {
                    samplePlane=plane;
                    return span*mix(start,end,clamp(hit,lo,hi));
                }
                // This is a depth discontinuity, not a ray/surface intersection.
                // Keep following the ray beyond the slab instead of restarting at the camera pixel.
                break;
            }
            if (leg==1 && z<0.0) visible=1.0-hi;
            lo=hi;
        }
    }
    samplePlane=back;
    if (visible>1.0) {samplePlane=front;return vec2(0.0);}
    if (visible==0.0) return vec2(0.0);
    // Determine which background is hidden without using the silhouette as
    // its texture coordinate. Near the horizon the exit can see other terrain.
    float hidden=max(0.0,visible-1.0/float(steps));
    for (int j=0;j<10 && (visible-hidden)*pixels>0.125;++j) {
        float mid=0.5*(visible+hidden);
        float z=glassReceiverZ(uv+span*mid,back,face);
        if (z<0.0 && !glassCrossing(z,mid/(-back.z))) visible=mid;
        else hidden=mid;
    }
    clippedBackground=true;
    float witness=glassReceiverZ(uv+span*visible,back,face);
    if (witness < -1e19) return span*visible; // sky colour is evaluated by direction
    float interior=0.5*(1.0+visible);
    float z=glassReceiverZ(uv+span*interior,back,face);
    return span*(z<0.0 && z>-1e19 ? interior : visible);
}

float refractedBackground(vec2 target, vec3 front, vec3 faceNormal, bool hidden, out float skyWeight, out vec3 rgb, out float depth, out vec2 depthUV) {
    vec2 grid = target * screenSize - 0.5;
    ivec2 base = ivec2(floor(grid));
    vec2 f = fract(grid);
    float sum = 0.0, best = 0.0;
    rgb = vec3(0.0);
    skyWeight = 0.0;
    for (int y = 0; y < 2; ++y) for (int x = 0; x < 2; ++x) {
        ivec2 p=base+ivec2(x,y);
        if (any(lessThan(p,ivec2(0))) || any(greaterThanEqual(p,ivec2(screenSize)))) continue;
        vec2 uv = (vec2(p) + 0.5) / screenSize;
        float d = srTexelFetchLow(depthtex1,p,0).r;
        #ifdef LOD
            if (d == 1.0) d += getLodDepthSolid(uv);
        #endif
        if (uintBitsToFloat(srTexelFetchLow(colortex6,p,0).r)>1.0) continue;
        if (dot(refractionViewPos(uv,d)-front,faceNormal)>=0.0) continue;
        vec3 tap = srTexelFetchScene(colortex3,p,0).rgb;
        float skyTap = 0.0;
        #ifdef SHADOW_AND_SKY
            if (hidden && (d==1.0 || d>=2.0)) {skyTap=1.0;tap=vec3(0.0);}
        #endif
        float modelD = srTexelFetchLow(colortex10,p,0).r;
        if (modelD < 1.0 && modelD <= d && dot(refractionViewPos(uv,modelD)-front,faceNormal)<0.0) {
            vec4 layer = srTexelFetchLow(colortex21,p,0);
            tap = layer.rgb + (1.0 - layer.a) * tap;
            skyTap *= 1.0 - layer.a;
            if (layer.a >= 0.5) d = modelD;
        }
        vec2 w = mix(1.0-f, f, vec2(x,y));
        float weight = w.x*w.y;
        rgb += tap * weight;
        sum += weight;
        skyWeight += skyTap*weight;
        if (weight > best) { best = weight; depth = d; depthUV = uv; }
    }
    return clamp(sum,0.0,1.0); // rgb retains the valid bilinear weights.
}

float volumetricFogDensity(vec3 position) {
    position += cameraPosition;
    float heightClamp = pow2(2.0 / VOLUMETRIC_FOG_THICKNESS * position.y - 2.0 * VOLUMETRIC_FOG_CENTER_HEIGHT / VOLUMETRIC_FOG_THICKNESS);
    float density = 0.0;
    if (heightClamp < 1.0) {
        vec3 wind = vec3(2.0, 0.0, 1.0) * frameTimeCounter / VOLUMETRIC_FOG_SCALE * 0.001 * VOLUMETRIC_FOG_SPEED ;
        vec3 fogPosition = position / VOLUMETRIC_FOG_SCALE * 0.001 + wind;

        const float weights = (1.0 - pow(VOLUMETRIC_FOG_OCTAVE_FADE, VOLUMETRIC_FOG_OCTAVES)) / (1.0 - VOLUMETRIC_FOG_OCTAVE_FADE);
        float weight = 1.0 / weights;
        for (int i = 0; i < VOLUMETRIC_FOG_OCTAVES; i++) {
            density += smooth3DNoise(fogPosition) * weight;
            fogPosition = fogPosition * VOLUMETRIC_FOG_OCTAVE_SCALE + wind;
            weight *= VOLUMETRIC_FOG_OCTAVE_FADE;
        }
        density = clamp(pow2(density) + VOLUMETRIC_FOG_AMOUNT - 1.0 - VOLUMETRIC_FOG_AMOUNT * heightClamp, 0.0, 1.0);
    }
    return density;
}

void main() {
    if (srOutsideRenderArea(gl_FragCoord.xy)) discard;
    ivec2 texel = ivec2(gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    float waterDepth = srTextureLodLow(depthtex0, texcoord, 0.0).r;
    float solidDepth = gbufferData.depth;
    vec4 solidColor = srTexelFetchScene(colortex3, texel, 0);
    bool opaqueHand = uintBitsToFloat(srTexelFetchLow(colortex6,texel,0).r)>1.0;
    float modelDepth = srTexelFetchLow(colortex10,texel,0).r;
    bool visibleModel=!opaqueHand && gbufferData.materialID!=MAT_HAND && modelDepth<1.0 && modelDepth<=solidDepth;
    bool inFrontOfGlass=visibleModel && modelDepth+2.4e-7<waterDepth && waterDepth<solidDepth
                        && gbufferData.materialID!=MAT_FORWARD_MODEL;
    if (visibleModel && !inFrontOfGlass) {
        vec4 modelLayer = srTexelFetchLow(colortex21, texel, 0);
        solidColor.rgb = modelLayer.rgb + (1.0 - modelLayer.a) * solidColor.rgb;
    }
    vec3 viewPos;
    #ifdef LOD
        if (solidDepth == 1.0) {
            solidDepth = getLodDepthSolid(texcoord);
            viewPos = screenToViewPosLod(texcoord, solidDepth);
            solidDepth += 1.0;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, solidDepth);
    }
    vec3 waterViewPos;
    #ifdef LOD
        if (waterDepth == 1.0) {
            waterDepth = getLodDepthWater(texcoord);
            waterViewPos = screenToViewPosLod(texcoord, waterDepth);
            waterDepth += 1.0;
        } else
    #endif
    {
        waterViewPos = screenToViewPos(texcoord, waterDepth);
    }
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
    float worldDistanceInv = inversesqrt(dot(worldPos, worldPos));
    vec3 waterWorldDir = worldPos * worldDistanceInv;

    float waterViewDepthNoLimit = length(waterViewPos);

    /********************************************************** Water Refraction **********************************************************/

    float reflectionWeight = 1.0;
    if (!opaqueHand && waterDepth < solidDepth) {
        reflectionWeight = solidColor.w;
        bool isTargetEntityModel = gbufferData.materialID == MAT_ENTITY_MODEL;
        if (gbufferData.materialID == MAT_FORWARD_MODEL) {
            reflectionWeight = gbufferData.albedo.a * solidColor.w;
            #ifdef HELIAN_SR_RR
                if (gbufferData.albedo.a < 0.5) reflectionWeight = (1.0-gbufferData.albedo.a) * solidColor.w;
            #endif
        } else if (isTargetEntityModel) {
            float entityAlpha = clamp(gbufferData.albedo.a, 0.0, 1.0);
            reflectionWeight = entityAlpha * solidColor.w;

            vec3 entityWorldPos = waterWorldDir * waterViewDepthNoLimit + gbufferModelViewInverse[3].xyz;
            vec3 entityWorldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
            vec3 entityLight = pow2(gbufferData.lightmap.y) * (skyColorUp + sunColor * SUNLIGHT_BRIGHTNESS)
                * (ENVIROMENT_BRIGHTNESS - 0.4 * weatherStrength);
            #ifdef IS_IRIS
                float eyeRelatedDistance = length(entityWorldPos + relativeEyePosition);
                gbufferData.lightmap.x = max(gbufferData.lightmap.x, heldBlockLightValue / 15.0 * clamp(1.0 - eyeRelatedDistance / 15.0, 0.0, 1.0));
            #endif
            const float entityLightFade = VANILLA_BLOCK_LIGHT_FADE;
            vec3 entityBlockLight = pow2(1.0 / (entityLightFade - entityLightFade * entityLightFade / (1.0 + entityLightFade) * gbufferData.lightmap.x) - 1.0 / entityLightFade) * commonLightColor;
            entityLight += entityBlockLight + BASIC_LIGHT;
            entityLight += pow(srTexelFetchScene(colortex5, ivec2(0), 0).rgb, vec3(2.2)) * NIGHT_VISION_BRIGHTNESS;

            vec3 entityColor = gbufferData.albedo.rgb * (entityLight + gbufferData.emissive * PBR_BRIGHTNESS * PI);
            #ifdef SHADOW_AND_SKY
                float entityNdotL = clamp(dot(entityWorldNormal, shadowDirection), 0.0, 1.0);
                if (entityNdotL > 0.0) {
                    float entityShadowLightFactor = 1.0;
                    #ifdef LIGHT_LEAKING_FIX
                        entityShadowLightFactor = clamp(gbufferData.lightmap.y * 10.0, 0.0, 1.0);
                    #endif
                    vec3 entityShadow = vec3(1.0);
                    vec3 entitySubsurfaceScattering = vec3(0.0);
                    singleSampleShadow(
                        entityWorldPos, entityWorldNormal, entityNdotL, entityShadowLightFactor,
                        0.0, 0.0, gbufferData.lightmap.y, entityShadow, entitySubsurfaceScattering
                    );
                    #ifdef CLOUD_SHADOW
                        entityShadow *= cloudShadow(entityWorldPos, shadowDirection);
                    #endif
                    entityColor += entityShadow * sunColor * gbufferData.albedo.rgb;
                }
            #endif

            solidColor.rgb = mix(solidColor.rgb, entityColor, entityAlpha);
        }
        else {
            bool isTargetWater = gbufferData.materialID == MAT_WATER;
            bool isTargetNotParticle = gbufferData.materialID != MAT_PARTICLE;
            vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
            float LdotH = clamp(dot(-worldNormal, waterWorldDir), 0.0, 1.0);
            vec3 stainedColor = vec3(0.0);
            if (isTargetNotParticle) {
            stainedColor += gbufferData.smoothness * gbufferData.smoothness;
            vec3 incident = normalize(waterViewPos);
            vec3 face = faceforward(normalize(gbufferData.geoNormal),incident,gbufferData.geoNormal);
            vec3 n = faceforward(normalize(gbufferData.normal),incident,gbufferData.normal);
            vec2 refractionOffset;
            vec3 samplePlane=waterViewPos;
            bool clippedBackground=false;
            if (isTargetWater) {
                // Keep water's wave distortion relative to its flat interface.
                vec3 bent = refract(incident,n,1.0/1.333)-refract(incident,face,1.0/1.333);
                float gap = max(0.0, length(viewPos)-waterViewDepthNoLimit);
                refractionOffset = (bent.xy-incident.xy/incident.z*bent.z)
                    * vec2(gbufferProjection[0].x,gbufferProjection[1].y)*0.5*min(gap,2.0)/max(0.01,-waterViewPos.z);
            } else {
                float thickness=gbufferData.parallaxOffset>0.0 ? gbufferData.parallaxOffset : 1.0;
                float eta=1.0/(1.0+0.5*REFRACTION_STRENGTH);
                refractionOffset=glassOffset(texcoord,waterViewPos,refract(incident,n,eta),face,thickness,samplePlane,clippedBackground);
                gbufferData.parallaxOffset=0.0;
            }
            if (isTargetWater) {
                refractionOffset*=REFRACTION_STRENGTH;
                refractionOffset*=refractionEdgeScale(texcoord,refractionOffset);
            }

            vec2 refractionTarget = texcoord + refractionOffset;
            float targetSolidDepth;
            vec3 targetColor;
            vec2 depthUV;
            float skyWeight;
            float coverage=refractedBackground(refractionTarget,samplePlane,face,clippedBackground,skyWeight,targetColor,targetSolidDepth,depthUV);
            if (coverage>0.0) {
                bool distantSky=targetSolidDepth==1.0 || targetSolidDepth>=2.0;
                #ifdef SHADOW_AND_SKY
                    // A parallel slab preserves the outgoing sky direction.
                    // The exit pixel tells us sky is visible, not its colour.
                    if (skyWeight>0.0)
                        targetColor+=skyWeight*glassSky(normalize(mat3(gbufferModelViewInverse)*incident));
                #endif
                if (clippedBackground) {targetColor/=coverage;coverage=1.0;}
                solidColor.rgb=targetColor+(1.0-coverage)*solidColor.rgb;
                vec2 fogUV=!isTargetWater && distantSky ? texcoord : depthUV;
                vec3 refractedView=mix(viewPos,refractionViewPos(fogUV,targetSolidDepth),coverage);
                worldPos=mat3(gbufferModelViewInverse)*refractedView;
                if (coverage>=0.999) solidDepth=targetSolidDepth;
            }
            }

            vec3 worldDir = normalize(worldPos);
            worldPos += gbufferModelViewInverse[3].xyz;
            vec3 waterWorldPos = waterWorldDir * waterViewDepthNoLimit + gbufferModelViewInverse[3].xyz;
            float waterDistance = distance(worldPos, waterWorldPos);
            vec3 rawSolidColor = solidColor.rgb;
            vec3 f0 = vec3(0.04 - 0.02 * float(isTargetWater));
            #ifdef LABPBR_F0
                f0 = mix(f0, vec3(gbufferData.metalness) , step(0.001, gbufferData.metalness));
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            f0 = mix(f0, gbufferData.albedo.rgb, gbufferData.metalness);
            #ifdef LOD
                solidDepth -= float(solidDepth > 1.0);
            #endif
            waterDistance = mix(waterDistance, 114514.0, step(0.999999, solidDepth));
            if (isEyeInWater == 1 ^^ isTargetWater) {
                solidColor.rgb = waterFogTotal(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
            }
            else if (isEyeInWater == 2) {
                solidColor.rgb = lavaFogTotal(solidColor.rgb, waterDistance);
            }
            else if (isEyeInWater == 3) {
                solidColor.rgb = snowFogTotal(solidColor.rgb, skyColorUp, waterDistance, gbufferData.lightmap.y);
            }
            else {
                #ifdef NETHER
                    solidColor.rgb = netherFogTotal(solidColor.rgb, waterDistance);
                #elif defined THE_END
                    solidColor.rgb = endFogTotal(solidColor.rgb, waterDistance);
                    if (solidDepth > 0.999999) {
                        solidColor.rgb += endStars(worldDir);
                    }
                #else
                    vec4 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, worldDir);
                    float atmosphereDepth = mix(waterDistance * (ASF_GROUND_EXTRA_DENSITY + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 1000.0 - intersectionData.w * 500.0, step(0.999999, solidDepth));
                    #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                        solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, atmosphereDepth, gbufferData.lightmap.y);
                    #endif
                    solidColor.rgb *= airAbsorption(waterDistance);
                #endif
                f0 -= 0.04 * float(isTargetWater);
            }
            float waterStain = 1.0;
            #if WATER_TYPE == 0
                waterStain = float(!isTargetWater);
            #endif
            stainedColor *= log2(max(vec3(1e-6),1.0 - fresnel(LdotH, f0)));
            stainedColor += sqrt(gbufferData.albedo.w * 1.5) * log2(clamp(gbufferData.albedo.rgb + 1e-5, 0.0, 1.0) * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w)) * waterStain;
            stainedColor = exp2(stainedColor);

            stainedColor = mix(vec3(1.0), stainedColor, vec3(solidColor.w));
            solidColor.rgb = mix(rawSolidColor, solidColor.rgb, vec3(solidColor.w)) * stainedColor;

            float isTargetParticle = 1.0 - float(isTargetNotParticle);
            vec3 vanillaLight = pow2(gbufferData.lightmap.y) * (skyColorUp + sunColor * SUNLIGHT_BRIGHTNESS) * (1.0 - gbufferData.metalness) * (ENVIROMENT_BRIGHTNESS - 0.4 * weatherStrength);
            #ifdef IS_IRIS
                float eyeRelatedDistance = length(waterWorldPos + relativeEyePosition);
                gbufferData.lightmap.x = max(gbufferData.lightmap.x, heldBlockLightValue / 15.0 * clamp(1.0 - eyeRelatedDistance / 15.0, 0.0, 1.0));
            #endif
            const float fadeFactor = VANILLA_BLOCK_LIGHT_FADE;
            vec3 blockLight = pow2(1.0 / (fadeFactor - fadeFactor * fadeFactor / (1.0 + fadeFactor) * gbufferData.lightmap.x) - 1.0 / fadeFactor) * commonLightColor;
            vanillaLight += blockLight + BASIC_LIGHT;
            vanillaLight += pow(srTexelFetchScene(colortex5, ivec2(0), 0).rgb, vec3(2.2)) * NIGHT_VISION_BRIGHTNESS;
            solidColor.rgb += gbufferData.albedo.rgb * gbufferData.albedo.w * (gbufferData.emissive * PBR_BRIGHTNESS * PI + vanillaLight * isTargetParticle);
            #ifdef SHADOW_AND_SKY
                float NdotL = clamp(dot(worldNormal, shadowDirection) + isTargetParticle, 0.0, 1.0);
                if (NdotL > 0.0) {
                    float shadowLightFactor = 1.0;
                    #ifdef LIGHT_LEAKING_FIX
                        shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0, 0.0, 1.0);
                    #endif
                    vec3 shadow = vec3(1.0);
                    vec3 subsurfaceScattering = vec3(float(gbufferData.porosity > 64.5 / 255.0));
                    singleSampleShadow(
                        waterWorldPos, mat3(gbufferModelViewInverse) * gbufferData.geoNormal, NdotL, shadowLightFactor,
                        gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, shadow, subsurfaceScattering
                    );
                    shadow *= (1.0 - gbufferData.metalness) * gbufferData.albedo.rgb * gbufferData.albedo.w * isTargetParticle + sunlightSpecular(
                        waterWorldDir, shadowDirection, worldNormal, gbufferData.smoothness * 0.995, NdotL, LdotH, f0, vec3(1.0)
                    );
                    shadow += subsurfaceScattering * (1.0 - gbufferData.metalness) * gbufferData.albedo.rgb * gbufferData.albedo.w * isTargetParticle;
                    #ifdef CLOUD_SHADOW
                        shadow *= cloudShadow(waterWorldPos, shadowDirection);
                    #endif
                    shadow *= sunColor;
                    solidColor.rgb += shadow;
                }
            #endif
        }
    }
    solidColor.w = gbufferData.parallaxOffset - float(gbufferData.materialID == MAT_END_PORTAL);
    vec4 reflectionData = srTexelFetchScene(colortex4, texel, 0);
    solidColor.rgb += reflectionData.rgb * reflectionWeight;
    if (inFrontOfGlass) {
        vec4 layer=srTexelFetchLow(colortex21,texel,0);
        solidColor.rgb=layer.rgb+(1.0-layer.a)*solidColor.rgb;
    }

    waterDepth -= float(waterDepth > 1.0);
    float waterViewDepth = mix(waterViewDepthNoLimit, 114514.0, step(0.999999, waterDepth));
    if (isEyeInWater == 0) {
        #ifdef NETHER
            solidColor.rgb *= vec3(netherFogAbsorption(waterViewDepth));
            solidColor.rgb += netherFogScattering(waterViewDepth);
        #elif defined THE_END
            solidColor.rgb *= vec3(endFogAbsorption(waterViewDepth));
            solidColor.rgb += endFogScattering(waterViewDepth);
            if (waterDepth > 0.999999) {
                solidColor.rgb += endStars(waterWorldDir);
            }
        #else
            #ifdef SHADOW_AND_SKY
                #ifdef ATMOSPHERE_SCATTERING_FOG
                    vec4 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, waterWorldDir);
                    float atmosphereDepth = mix(waterViewDepthNoLimit * (ASF_GROUND_EXTRA_DENSITY + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 1000.0 - intersectionData.w * 500.0, step(0.999999, waterDepth));
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, waterWorldDir, skyColorUp, atmosphereDepth, eyeBrightnessSmooth.y / 240.0);
                #endif
            #endif
            solidColor.rgb *= vec3(airAbsorption(waterViewDepth));
        #endif
    }
    else if (isEyeInWater == 1) {
        solidColor.rgb *= waterFogAbsorption(waterViewDepth);
        solidColor.rgb += waterFogScattering(waterWorldDir, skyColorUp, waterViewDepth, eyeBrightnessSmooth.y / 240.0);
    }
    else if (isEyeInWater == 2) {
        solidColor.rgb *= vec3(lavaFogAbsorption(waterViewDepth));
        solidColor.rgb += lavaFogScattering(waterViewDepth);
    }
    else if (isEyeInWater == 3) {
        solidColor.rgb *= vec3(snowFogAbsorption(waterViewDepth));
        solidColor.rgb += snowFogScattering(skyColorUp, waterViewDepth, eyeBrightnessSmooth.y / 240.0);
    }

    #ifdef SHADOW_AND_SKY
        vec3 volumetricLight = vec3(0.0);
        #ifdef VOLUMETRIC_LIGHT
            if (isEyeInWater < 2) {
                float basicWeight = 1.0;
                vec3 absorptionBeta = vec3(blindnessFactor + 0.003);
                float LdotV = dot(waterWorldDir, shadowDirection);
                float volumetricFogScattering = 0.0;
                float airScattering = VL_STRENGTH;
                if (isEyeInWater == 1) {
                    absorptionBeta = waterAbsorptionBeta + 0.003;
                    basicWeight *= 10.0 * WATER_VL_STRENGTH;
                    airScattering *= rayleighPhase(LdotV);
                }
                else {
                    float timeStrength = pow(clamp(1.0 - shadowDirection.y, 0.0, 1.0), 5.0);
                    float timeVLStrength = (timeStrength * (MORNING_VL_STRENGTH - NOON_VL_STRENGTH) + NOON_VL_STRENGTH);
                    float heightDensity = clamp(exp(-(cameraPosition.y + WORLD_BASIC_HEIGHT) / 1200.0), 0.0, 1.0);
                    basicWeight *= timeVLStrength * heightDensity;
                    airScattering *= miePhase(LdotV, 0.6, 0.36);

                    volumetricFogScattering = heightDensity * VOLUMETRIC_FOG_DENSITY * (timeStrength * (VOLUMETRIC_FOG_MORNING_DENSITY - VOLUMETRIC_FOG_NOON_DENSITY) + VOLUMETRIC_FOG_NOON_DENSITY);
                }

                // Fixed sample planes become visible as bands at low sample
                // counts. Decorrelate light shafts independently of cloud sampling.
                #if defined TAA || defined HELIAN_SR_JITTER
                    float noise = mix(0.15, 0.85, blueNoiseTemporal(texcoord).x);
                #else
                    float noise = mix(0.15, 0.85, textureLod(noisetex, gl_FragCoord.xy / 64.0, 0.0).r);
                #endif
                float maxAllowedDistance = far;
                #ifdef LOD
                    maxAllowedDistance = lodRenderDistance() * 1.01;
                #endif
                maxAllowedDistance = (maxAllowedDistance + 32.0) * inversesqrt(max(waterWorldDir.y * waterWorldDir.y, 0.5));
                maxAllowedDistance = min(maxAllowedDistance, 5000.0 * exp(-6.0 * length(absorptionBeta)));

                float targetLength = min(maxAllowedDistance, waterViewDepthNoLimit);
                float stepLength = targetLength / VL_SAMPLES;
                vec3 stepSize = waterWorldDir * stepLength;
                vec3 samplePos = gbufferModelViewInverse[3].xyz + stepSize * noise;

                basicWeight *= stepLength;
                absorptionBeta *= stepLength * 1.44269502;
                vec3 rayAbsorption = exp2(-absorptionBeta * noise) * basicWeight * 0.02;
                #ifdef LIGHT_LEAKING_FIX
                    rayAbsorption *= pow(eyeBrightnessSmooth.y / 240.0 + 1e-4, exp(-0.5 * stepLength));
                #endif
                vec3 stepAbsorption = exp2(-absorptionBeta);
                vec3 skyScattering = (sunColor * SUNLIGHT_BRIGHTNESS * 2.0 + skyColorUp) * eyeBrightnessSmooth.y / 1000.0;
                stepLength *= -0.01 * 1.44269502 / max(1e-5, basicWeight);

                for (int i = 0; i < VL_SAMPLES; i++) {
                    vec3 singleLight = vec3(1.0);
                    #ifdef CLOUD_SHADOW
                        singleLight *= cloudShadow(samplePos, shadowDirection);
                    #endif
                    vec3 sampleShadowCoord = worldPosToShadowCoord(samplePos);
                    if (all(lessThan(
                        abs(sampleShadowCoord - vec3(vec2(0.75), 0.5)),
                        vec3(vec2(0.25), 0.5))
                    )) {
                        float solidShadowStrength = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                        singleLight *= vec3(solidShadowStrength);
                        sampleShadowCoord.y -= 0.5;
                        vec3 caustic = waterCaustic(sampleShadowCoord, samplePos, shadowDirection);
                        singleLight *= caustic;
                        #ifdef TRANSPARENT_SHADOW
                            sampleShadowCoord.xy += vec2(-0.5, 0.5);
                            float transparentShadowStrength = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                            if (transparentShadowStrength < 1.0) {
                                vec4 transparentShadowColor = textureLod(shadowcolor0, sampleShadowCoord.st, 0.0);
                                transparentShadowColor.rgb = pow(
                                    transparentShadowColor.rgb * (1.0 - 0.5 * pow2(transparentShadowColor.w)),
                                    vec3(sqrt(transparentShadowColor.w * 2.2 * 2.2 * 1.5))
                                );
                                singleLight *= mix(transparentShadowColor.rgb, vec3(1.0), vec3(transparentShadowStrength));
                            }
                        #endif
                    }
                    singleLight *= sunColor * SUNLIGHT_BRIGHTNESS;
                    #ifdef VOLUMETRIC_FOG
                        float sampleVolumetricFogDensity = volumetricFogDensity(samplePos) * volumetricFogScattering;
                        singleLight *= sampleVolumetricFogDensity * 5.0 + airScattering;
                        singleLight += sampleVolumetricFogDensity * skyScattering;
                    #else
                        singleLight *= airScattering;
                    #endif
                    singleLight *= rayAbsorption;
                    #ifdef VOLUMETRIC_FOG
                        float volumetricFogAbsorption = exp2(stepLength * sampleVolumetricFogDensity);
                        rayAbsorption *= volumetricFogAbsorption;
                        solidColor.rgb *= volumetricFogAbsorption;
                    #endif
                    rayAbsorption *= stepAbsorption;
                    volumetricLight += singleLight;
                    samplePos += stepSize;
                }
            }
        #endif

        float weatherData = srTexelFetchLow(colortex19, texel, 0).r;
        solidColor.rgb += volumetricLight;

        weatherData = weatherData * 2.5 - 1.5;
        float weatherLightData = abs(weatherData);
        if (weatherLightData > 0.3) {
            float sunlightStrength = 2.0 * weatherLightData - 1.0;
            float basicSunlight = 8.0 * SUNLIGHT_BRIGHTNESS - 8.0 * SUNLIGHT_BRIGHTNESS * sqrt(weatherStrength) * SUNLIGHTINRAIN;
            vec3 weatherLight = sunlightStrength * basicSunlight * sunColor + skyColorUp * (ENVIROMENT_BRIGHTNESS - 0.6 * weatherStrength);
            float weatherBlendWeight = clamp(weatherData * 1e+10, 0.0, 1.0) * 0.8 + 0.2;
            solidColor.rgb = mix(solidColor.rgb, weatherLight, weatherBlendWeight);
        }
    #endif

    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
