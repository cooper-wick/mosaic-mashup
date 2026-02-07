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

// Pseudo-random function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Noise function
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    // Normalize coordinates: Invert Y to match screen space
    vec2 pixelPos = gl_FragCoord.xy;
    pixelPos.y = u_resolution.y - pixelPos.y;

    float minDist = 1e10;
    float secondMinDist = 1e10;
    int closestIndex = 0;

    // Voronoi Pass: Find the closest seed (tile)
    for(int i = 0; i < ${MAX_SEEDS}; i++) {
        if(i >= u_seedCount) break;

        // Fetch tile data from texture: [x, y, radius, packedData]
        vec4 seed = texelFetch(u_seedTexture, ivec2(i, 0), 0);
        
        float d = distance(pixelPos, seed.xy);

        if(d < minDist) {
            secondMinDist = minDist;
            minDist = d;
            closestIndex = i;
        } else if(d < secondMinDist) {
            secondMinDist = d;
        }
    }

    // Coloring
    vec4 closestSeed = texelFetch(u_seedTexture, ivec2(closestIndex, 0), 0);
    
    float rawValue = closestSeed.w;
    // Clamp to actual palette size for graceful fallback on invalid colorIDs
    int colorIndex = clamp(int(floor(rawValue)), 0, max(u_paletteSize - 1, 0));
    float highlightFactor = step(0.05, fract(rawValue)); 

    vec3 baseColor = u_palette[colorIndex];
    
    // Calculate luminance for brightness-aware effects
    float luminance = dot(baseColor, vec3(0.299, 0.587, 0.114));
    
    // --- Stained Glass Effect (Texture/Noise) ---
    float n = noise(pixelPos * 0.04);
    float n2 = noise(pixelPos * 0.12); // Second octave for more detail
    float combinedNoise = n * 0.7 + n2 * 0.3;
    // Subtle variation in brightness for stained glass texture
    baseColor *= 0.92 + 0.16 * combinedNoise;

    // --- Edge Highlights (Bevel) ---
    // Vector from cell center to pixel
    vec2 centerToPixel = pixelPos - closestSeed.xy;
    float centerDist = length(centerToPixel);
    vec2 dirFromCenter = centerDist > 0.001 ? centerToPixel / centerDist : vec2(0.0);
    
    // Light is coming from top-left
    vec2 lightDir = normalize(vec2(-1.0, -1.0));
    float lightDot = dot(dirFromCenter, lightDir);
    
    // Edge proximity: how close are we to the visible edge?
    // We want the bevel to start at the visible edge (GAP_SIZE) and extend inwards.
    // The previous math effectively hid the bevel under the gap.
    float distToClosest = secondMinDist - minDist;
    float bevelWidth = 12.0; // Make it wide enough to be seen easily
    // 1.0 at the edge (dist == GAP_SIZE), 0.0 inside (dist == GAP_SIZE + bevelWidth)
    float edgeProximity = 1.0 - smoothstep(GAP_SIZE, GAP_SIZE + bevelWidth, distToClosest);
    
    // Also, clamp it so it doesn't go crazy if dist < GAP_SIZE (which is the border anyway)
    edgeProximity = max(0.0, edgeProximity);
    
    float bevelStrength = 0.0;
    float specularStrength = 0.0;
    
    if (highlightFactor > 0.5) {
        // --- PRESSED / INSET EFFECT ---
        // Darken the base color slightly to look recessed
        baseColor *= 0.7; 
        
        // Invert the bevel direction (multiply by negative) so top-left is dark (shadow) 
        // and bottom-right is light (catching light on the lip)
        // Stronger effect for clarity
        bevelStrength = -0.8 * edgeProximity;
    } else {
        // --- ELEVATED / BEVEL EFFECT ---
        // Standard positive bevel: Top-left is light, bottom-right is dark
        // Make it MUCH stronger as requested
        bevelStrength = 0.8 * edgeProximity;
        
        // Spot light (specular highlight)
        // Only on elevated tiles
        specularStrength = pow(max(0.0, lightDot), 16.0) * edgeProximity * 0.6;
    }

    // Apply the bevel
    baseColor += lightDot * bevelStrength;
    
    // Apply specular highlight
    baseColor += specularStrength;

    // Edges & Anti-aliasing with GAP
    float edgeFactor = smoothstep(GAP_SIZE, GAP_SIZE + AA_SIZE, secondMinDist - minDist);
    
    // Apply edge darkening without radial gradient
    baseColor *= mix(0.75, 1.0, edgeFactor);
    
    // Draw cell borders (The gap color)
    vec3 borderColor = mix(vec3(0.08), vec3(0.15, 0.15, 0.2), highlightFactor);
    baseColor = mix(borderColor, baseColor, edgeFactor);

    outColor = vec4(clamp(baseColor, 0.0, 1.0), 1.0);
}`;

