import { MAX_SEEDS, MAX_PALETTE_SIZE } from "../utils/constants.ts";

export const UNWEIGHTED_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

// Uniforms
uniform sampler2D u_seedTexture;    // Texture: [x, y, radius, colorIndex + highlightFlag]
uniform int       u_seedCount;      // Number of active tiles
uniform vec2      u_resolution;     // Canvas resolution
uniform vec3      u_palette[${MAX_PALETTE_SIZE}]; // Color palette array (fixed max size)
uniform int       u_paletteSize;    // Actual number of colors in palette
uniform int       u_renderIds;      // 0 = visual, 1 = IDs
uniform vec2      u_offset;         // Top-left position of the game container
uniform vec2      u_containerSize;  // Size of the game container
uniform float     u_gapSize;        // The width of the gap between tiles
uniform float     u_aaSize;         // The antialiasing width

// Constants
// const float AA_SIZE  = 1.5; // (Removed, use uniform)

out vec4 outColor;

// Pseudo-random function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // 1. Calculate pixel position relative to the container
    // gl_FragCoord.xy is in window coordinates (bottom-left origin)
    // We want coordinates relative to the container's top-left
    
    // Invert Y to match screen space (top-left origin)
    float screenY = u_resolution.y - gl_FragCoord.y;
    vec2 screenPos = vec2(gl_FragCoord.x, screenY);
    
    // Apply offset to get local container coordinates
    vec2 localPos = screenPos - u_offset;
    
    // 2. Clipping: Discard pixels outside the container
    // We can add a small padding/margin if we want the edge to be soft, but hard clip is fine for now
    if (localPos.x < 0.0 || localPos.x > u_containerSize.x || 
        localPos.y < 0.0 || localPos.y > u_containerSize.y) {
        discard; 
        // OR: return vec4(0.0); if we want transparent background
    }

    vec2 pixelPos = localPos; // Use local coordinates for Voronoi calculation

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

    if (u_renderIds == 1) {
        // Output ID if active
        // 0 = no ID, index+1 = ID? Or just index.
        // Let's us e index directly as alpha is validity.
        if (closestIndex == -1) {
            outColor = vec4(0.0);
        } else {
            int idx = closestIndex;
            float r = float(idx & 255) / 255.0;
            float g = float((idx >> 8) & 255) / 255.0;
            float b = float((idx >> 16) & 255) / 255.0;
            outColor = vec4(r, g, b, 1.0);
        }
        return;
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
    
    vec2 centerToPixel = pixelPos - closestSeedPos;
    float centerDist = length(centerToPixel);
    vec2 dirFromCenter = centerDist > 0.001 ? centerToPixel / centerDist : vec2(0.0);
    float lightDot = dot(dirFromCenter, lightDir);
 
    
    // Edge Proximity:
    float halfGap = u_gapSize * 0.25;
        
    if (highlightFactor > 0.5) {
        // --- PRESSED / INSET EFFECT ---
        baseColor *= 0.7; 
    }

    // Edges & Anti-aliasing
    // We want to discard or darken pixels where minEdgeDist < halfGap
    float edgeFactor = smoothstep(halfGap, halfGap + u_aaSize, minEdgeDist);
    
    // Apply edge darkening / border color
    vec3 borderColor = mix(vec3(0.08), vec3(0.15, 0.15, 0.2), highlightFactor);
    baseColor = mix(borderColor, baseColor, edgeFactor);

    outColor = vec4(clamp(baseColor, 0.0, 1.0), 1.0);
}`;

