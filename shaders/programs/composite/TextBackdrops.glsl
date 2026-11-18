#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
layout(local_size_x=8,local_size_y=8) in;
const vec2 workGroupsRender = vec2(1.0,1.0);
uniform usampler2D colortex24,colortex25;
layout(r32f) uniform image2D colorimg10;
layout(rgba16f) uniform image2D colorimg21;

void main() {
    ivec2 p=ivec2(gl_GlobalInvocationID.xy);
    if (any(greaterThanEqual(p,ivec2(screenSize)))) return;
    uint record=texelFetch(colortex24,p,0).r;
    if (record==0u) return;
    float depth=1.0-float(record>>10u)/4194303.0;
    float opaque=texelFetch(depthtex1,p,0).r;
    if (depth>opaque+1.2e-7) return;
    uint rgba=texelFetch(colortex25,ivec2(record&1023u,0),0).r;
    vec4 panel=unpackUnorm4x8(rgba);
    panel.rgb=pow(panel.rgb,vec3(2.2))*panel.a;
    float md=imageLoad(colorimg10,p).r;
    vec4 outColor=panel;
    if (md<1.0 && md<=opaque) {
        vec4 model=imageLoad(colorimg21,p);
        outColor=(depth+2.4e-7<md) ? panel+(1.0-panel.a)*model : model+(1.0-model.a)*panel;
        depth=min(depth,md);
    }
    imageStore(colorimg21,p,outColor);
    imageStore(colorimg10,p,vec4(min(depth,opaque)));
}
