#ifndef HELIAN_SUPER_RESOLUTION_SETTINGS
#define HELIAN_SUPER_RESOLUTION_SETTINGS

#if defined SR_ENABLE && SR_ENABLE == 1
    // Frame generation needs guides even when no upscaler is selected.
    #define HELIAN_SR_INPUTS
    #if SR_SHOULD_APPLY_SCALE == 1
        #define HELIAN_SR_ACTIVE
        #if SR_SHOULD_APPLY_JITTER == 1 && SR_ALGO_SUPPORTS_JITTER == 1
            #define HELIAN_SR_JITTER
        #endif
        #if defined SR_ALGO_DLSSRR && SR_USING_ALGO == SR_ALGO_DLSSRR
            #define HELIAN_SR_RR
        #endif
    #else
        #define HELIAN_SR_FRAMEGEN_ONLY
    #endif
#endif

#endif
