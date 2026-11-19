#ifndef HELIAN_SHADOW_TRANSMISSION
#define HELIAN_SHADOW_TRANSMISSION
vec3 glassTransmission(vec3 solidCoord) {
    #ifdef TRANSPARENT_SHADOW
        vec3 coord=solidCoord-vec3(0.5,0.0,0.0);
        float clear=textureLod(shadowtex0,coord,0.0);
        if (clear<1.0) {
            vec4 c=textureLod(shadowcolor0,coord.st,0.0);
            if (c.a>0.0) {
                vec3 tint=pow(max(c.rgb*(1.0-0.5*c.a*c.a),vec3(0.0)),vec3(2.2*sqrt(1.5*c.a)));
                return mix(tint,vec3(1.0),clear);
            }
        }
    #endif
    return vec3(1.0);
}
#endif
