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
const float GAP_SIZE = 3.0; // The width of the gap between tiles (now exact pixels)
const float AA_SIZE  = 1.5; // The smoothing width for anti-aliasing

out vec4 outColor;

// Pseudo-random function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // Normalize coordinates: Invert Y to match screen space
    vec2 pixelPos = gl_FragCoord.xy;
    pixelPos.y = u_resolution.y - pixelPos.y;

    // --- Pass 1: Find the closest seed ---
    float minDist = 1e10;
    int closestIndex = -1;
    vec2 closestSeedPos = vec2(0.0);

    for(int i = 0; i < ${MAX_SEEDS}; i++) {
        if(i >= u_seedCount) break;

        // Fetch tile data from texture: [x, y, radius, packedData]
        vec4 seed = texelFetch(u_seedTexture, ivec2(i, 0), 0);
        
        float d = distance(pixelPos, seed.xy);

        if(d < minDist) {
            minDist = d;
            closestIndex = i;
            closestSeedPos = seed.xy;
        }
    }

    // --- Pass 2: Find the distance to the closest edge (Perpendicular Bisector) ---
    // The edge is the bisector between the closest seed and its neighbor.
    // We want the minimum distance from pixelPos to any bisector line.
    
    float minEdgeDist = 1e10; // Distance to the nearest Voronoi edge

    for(int i = 0; i < ${MAX_SEEDS}; i++) {
        if(i >= u_seedCount) break;
        if(i == closestIndex) continue; // Skip the closest seed itself

        vec4 seed = texelFetch(u_seedTexture, ivec2(i, 0), 0);
        vec2 neighborPos = seed.xy;

        // Vector from closest seed to neighbor
        vec2 toNeighbor = neighborPos - closestSeedPos;
        
        // Midpoint of the two seeds
        vec2 midPoint = closestSeedPos + toNeighbor * 0.5;
        
        // The bisector line passes through midPoint and is perpendicular to toNeighbor.
        // Distance from pixelPos to this line is the projection of (pixelPos - midPoint) onto the direction of toNeighbor.
        // We use dot product with normalized toNeighbor.
        
        float distToBisector = dot(midPoint - pixelPos, normalize(toNeighbor));
        
        // We only care about positive distances (meaning we are on the correct side of the bisector)
        // But since we are by definition in the Voronoi cell of closestIndex, pixelPos is closer to standard
        // closestSeedPos than neighborPos, so distToBisector should be positive if we orient correctly.
        // Let's verify orientation:
        // midPoint - pixelPos points roughly towards midPoint from our pixel.
        // toNeighbor points away from closestSeedPos. 
        // If pixel is at closestSeedPos, (mid - closest) . (neighbor - closest) > 0.
        // So this order is correct.
        
        minEdgeDist = min(minEdgeDist, distToBisector);
    }
    
    // Fallback if only 1 seed exists
    if (closestIndex == -1 || u_seedCount <= 1) {
        minEdgeDist = 1000.0;
    }

    // Coloring
    vec4 closestSeed = texelFetch(u_seedTexture, ivec2(closestIndex, 0), 0);
    
    float rawValue = closestSeed.w;
    // Clamp to actual palette size for graceful fallback on invalid colorIDs
    int colorIndex = clamp(int(floor(rawValue)), 0, max(u_paletteSize - 1, 0));
    float highlightFactor = step(0.05, fract(rawValue)); 

    vec3 baseColor = u_palette[colorIndex];
    
    // --- Edge Highlights (Bevel) ---
    // Use the true minEdgeDist for bevel calculation.
    // minEdgeDist is 0 at the true Voronoi edge, and increases as we go towards the center.
    
    // Standard lighting direction (top-left)
    vec2 lightDir = normalize(vec2(-1.0, -1.0));
    
    // To get a bevel, we need a gradient.
    // The "slope" of the bevel depends on the direction to the nearest edge.
    // We don't have that vector computed analytically (we just took the min distance).
    // However, we can approximate the normal based on the vector to the center,
    // OR just use the proximity for intensity. 
    // The original code used centerToPixel.
    
    vec2 centerToPixel = pixelPos - closestSeedPos;
    float centerDist = length(centerToPixel);
    vec2 dirFromCenter = centerDist > 0.001 ? centerToPixel / centerDist : vec2(0.0);
    float lightDot = dot(dirFromCenter, lightDir);
    
    // Bevel Params
    float bevelWidth = 12.0; 
    
    // Edge Proximity:
    // minEdgeDist goes from 0 (at edge) to large (at center).
    // We want effects near the gap.
    // GAP_SIZE is the half-width of the gap in pixels? 
    // Wait, if GAP_SIZE is the full gap, then we want distance from edge < GAP_SIZE/2.
    // The original code used GAP_SIZE as a threshold on (d2-d1). 
    // Here minEdgeDist is literal pixels from the mathematical edge.
    // So if we want a gap of width W, we discard pixels where minEdgeDist < W/2.
    // Let's assume GAP_SIZE is the full visual gap width.
    float halfGap = GAP_SIZE * 0.5;
    
    // Bevel starts at halfGap and goes inwards by bevelWidth.
    // 0.0 at (halfGap + bevelWidth), 1.0 at halfGap.
    float edgeProximity = 1.0 - smoothstep(halfGap, halfGap + bevelWidth, minEdgeDist);
    
    float bevelStrength = 0.0;
    float specularStrength = 0.0;
    
    if (highlightFactor > 0.5) {
        // --- PRESSED / INSET EFFECT ---
        baseColor *= 0.7; 
        bevelStrength = -0.8 * edgeProximity;
    } else {
        // --- ELEVATED / BEVEL EFFECT ---
        bevelStrength = 0.8 * edgeProximity;
        specularStrength = pow(max(0.0, lightDot), 16.0) * edgeProximity * 0.6;
    }

    // Apply the bevel
    // baseColor += lightDot * bevelStrength; // Old way with dot
    // New way: we sort of fake the normal with lightDot, scaled by proximity.
    // It creates the "pillow" look.
    
    // Apply specular highlight
    // baseColor += specularStrength;

    // Edges & Anti-aliasing
    // We want to discard or darken pixels where minEdgeDist < halfGap
    float edgeFactor = smoothstep(halfGap, halfGap + AA_SIZE, minEdgeDist);
    
    // Apply edge darkening / border color
    vec3 borderColor = mix(vec3(0.08), vec3(0.15, 0.15, 0.2), highlightFactor);
    baseColor = mix(borderColor, baseColor, edgeFactor);

    outColor = vec4(clamp(baseColor, 0.0, 1.0), 1.0);
}`;

