bool giReceiverAt(ivec2 p, out vec3 pos, out vec3 n, out float viewDepth) {
    vec2 uv = (vec2(p)+0.5)/screenSize;
    float d = srTexelFetchLow(depthtex0,p,0).r;
    vec3 view;
    #ifdef LOD
        if (d==1.0) {
            d=getLodDepthSolidDeferred(uv);
            if (d>=1.0) return false;
            view=screenToViewPosLod(uv,d);
        } else
    #endif
    {
        if (d>=1.0) return false;
        view=screenToViewPos(uv,d);
    }
    GbufferData m=getGbufferDataAtDepth(p,d);
    if (m.materialID==MAT_HAND) return false;
    n=normalize(mat3(gbufferModelViewInverse)*m.geoNormal);
    pos=viewToWorldPos(view)+0.004*n;
    if (!rtInRange(pos)) return false;
    viewDepth=-view.z;
    return true;
}
