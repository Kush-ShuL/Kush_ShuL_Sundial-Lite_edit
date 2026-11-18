#version 330 compatibility

#define HELIAN_SR_POST

const float shadowDistanceRenderMul = 1.0;
const bool shadowHardwareFiltering0 = true;

#include "/programs/composite/Composite13.frag"
