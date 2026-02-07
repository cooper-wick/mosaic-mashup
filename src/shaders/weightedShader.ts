import { MAX_SEEDS, MAX_PALETTE_SIZE } from "../utils/constants.ts";

export const WEIGHTED_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

// Uniforms
uniform sampler2D u_seedTexture;    // Texture: [x, y, radius, colorIndex + highlightFlag]
uniform int       u_seedCount;      // Number of active tiles
uniform vec2      u_resolution;     // Canvas resolution
uniform vec3      u_palette[${MAX_PALETTE_SIZE}]; // Color palette array (fixed max size)
uniform int       u_paletteSize;    // Actual number of colors in palette
// u_highlights removed!

out vec4 outColor;

void main() {
    // Normalize coordinates: Invert Y to match screen space
    vec2 pixelPos = gl_FragCoord.xy;
    pixelPos.y = u_resolution.y - pixelPos.y;

    float minDist = 1e10;
    float secondMinDist = 1e10;
    int closestIndex = 0;

    // 1. Voronoi Pass: Find the closest seed (tile)
    for(int i = 0; i < ${MAX_SEEDS}; i++) {
        if(i >= u_seedCount) break;

        // Fetch tile data from texture: [x, y, radius, packedData]
        vec4 seed = texelFetch(u_seedTexture, ivec2(i, 0), 0);
        
        // Calculate weighted distance
        float d = distance(pixelPos, seed.xy) / max(seed.z, 1.0);

        if(d < minDist) {
            secondMinDist = minDist;
            minDist = d;
            closestIndex = i;
        } else if(d < secondMinDist) {
            secondMinDist = d;
        }
    }

    // 2. Coloring
    // Fetch the specific data for the closest seed we found
    vec4 closestSeed = texelFetch(u_seedTexture, ivec2(closestIndex, 0), 0);
    
    float rawValue = closestSeed.w;
    // Clamp to actual palette size for graceful fallback on invalid colorIDs
    int colorIndex = clamp(int(floor(rawValue)), 0, max(u_paletteSize - 1, 0));
    
    // Extract highlight from fractional part (e.g. 3.1 -> Highlighted, 3.0 -> Normal)
    // using step() returns 1.0 if fract > 0.05, else 0.0
    float highlightFactor = step(0.05, fract(rawValue)); 

    vec3 baseColor = u_palette[colorIndex];
    
    // Apply Highlight
    // Mix requires all float/vec types. We use highlightFactor (0.0 or 1.0)
    vec3 highlightColor = baseColor * 1.35 + 0.15;
    baseColor = mix(baseColor, highlightColor, highlightFactor * 0.6);

    // 3. Edges & Anti-aliasing
    float edgeFactor = smoothstep(0.0, 0.055, secondMinDist - minDist);
    
    // Vignette
    baseColor *= (1.0 + 0.2 * exp(-minDist * minDist * 2.2)) * mix(0.65, 1.0, edgeFactor);
    
    // Draw cell borders
    vec3 borderColor = mix(vec3(0.85), vec3(0.22, 0.22, 0.32), highlightFactor);
    baseColor = mix(borderColor, baseColor, edgeFactor);

    outColor = vec4(baseColor, 1.0);
}`;

