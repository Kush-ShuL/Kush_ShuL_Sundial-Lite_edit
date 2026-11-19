vec2 srReflectionMotionVector(vec3 currentView, bool infiniteRay) {
    vec3 previousView;
    if (infiniteRay) {
        previousView = mat3(gbufferPreviousModelView) * mat3(gbufferModelViewInverse) * currentView;
    } else {
        previousView = prevWorldToViewPos(viewToWorldPos(currentView) + cameraMovement);
    }
    float pointW = infiniteRay ? 0.0 : 1.0;
    vec4 currentClip = gbufferProjection * vec4(currentView, pointW);
    vec4 previousClip = gbufferPreviousProjection * vec4(previousView, pointW);
    if (currentClip.w <= 1e-6 || previousClip.w <= 1e-6) return vec2(0.0);
    // The projection matrices are unjittered. SR wants UV displacement,
    // previous minus current, with the OpenGL Y direction retained.
    return clamp(0.5 * (previousClip.xy / previousClip.w - currentClip.xy / currentClip.w), -1.0, 1.0);
}
