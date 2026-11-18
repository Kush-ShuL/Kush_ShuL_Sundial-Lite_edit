#version 330 compatibility

#define HELIAN_SR_POST

const float shadowDistanceRenderMul = 1.0;
const bool shadowtex0Mipmap = true;
const bool shadowcolor0Mipmap = true;
const bool shadowcolor1Mipmap = true;
const bool shadowHardwareFiltering0 = true;

#include "/programs/composite/Composite13.frag"
