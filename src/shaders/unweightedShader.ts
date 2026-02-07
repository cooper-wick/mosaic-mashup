import { MAX_SEEDS, MAX_PALETTE_SIZE } from "../utils/constants.ts";

export const UNWEIGHTED_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

// Uniforms
uniform sampler2D u_seedTexture;    // Texture: [x, y, radius, colorIndex + highlightFlag]
uniform int       u_seedCount;      // Number of active tiles
uniform vec2      u_resolution;     // Canvas resolution
uniform vec3      u_palette[${MAX_PALETTE_SIZE}]; // Color palette array (fixed max size)
uniform int       u_paletteSize;    // Actual number of colors in palette

// Constants
const float GAP_SIZE = 3.0; // The width of the gap between tiles
const float AA_SIZE  = 1.5; // The smoothing width for anti-aliasing

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
        
        // UNWEIGHTED CHANGE: 
        // We now calculate standard Euclidean distance (in pixels).
        // We removed the division by seed.z
        float d = distance(pixelPos, seed.xy);

        if(d < minDist) {
            secondMinDist = minDist;
            minDist = d;
            closestIndex = i;
        } else if(d < secondMinDist) {
            secondMinDist = d;
        }
    }

    // 2. Coloring
    vec4 closestSeed = texelFetch(u_seedTexture, ivec2(closestIndex, 0), 0);
    
    float rawValue = closestSeed.w;
    // Clamp to actual palette size for graceful fallback on invalid colorIDs
    int colorIndex = clamp(int(floor(rawValue)), 0, max(u_paletteSize - 1, 0));
    float highlightFactor = step(0.05, fract(rawValue)); 
    // float highlightFactor = 0.0; 

    vec3 baseColor = u_palette[colorIndex];
    
    // Apply Highlight
    vec3 highlightColor = baseColor * 1.35 + 0.15;
    baseColor = mix(baseColor, highlightColor, highlightFactor * 0.6);

    // 3. Edges & Anti-aliasing with GAP
    // The metric (secondMinDist - minDist) is 0 at the border and increases as we move inward.
    // By comparing this to GAP_SIZE, we determine if we are "in the gap" or "in the cell".
    // 
    // smoothstep(min, max, value):
    //   If value < min: returns 0.0 (Pure Border Color / Gap)
    //   If value > max: returns 1.0 (Pure Base Color / Cell)
    float edgeFactor = smoothstep(GAP_SIZE, GAP_SIZE + AA_SIZE, secondMinDist - minDist);
    
    // Vignette / Glow
    // Since minDist is now raw pixels, we normalize it here purely for the 
    // visual gradient effect, otherwise the exp() function would make the cell black.
    // We use the tile's size (z) only for shading, not for shape.
    float normalizedDist = minDist / max(closestSeed.z, 1.0);
    
    baseColor *= (1.0 + 0.2 * exp(-normalizedDist * normalizedDist * 2.2)) * mix(0.65, 1.0, edgeFactor);
    
    // Draw cell borders (The gap color)
    vec3 borderColor = mix(vec3(0.85), vec3(0.22, 0.22, 0.32), highlightFactor);
    baseColor = mix(borderColor, baseColor, edgeFactor);

    outColor = vec4(baseColor, 1.0);
}`;

