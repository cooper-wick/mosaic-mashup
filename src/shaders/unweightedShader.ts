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

out vec4 outColor;

// Pseudo-random function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // 1. Calculate pixel position relative to the container
    float screenY = u_resolution.y - gl_FragCoord.y;
    vec2 screenPos = vec2(gl_FragCoord.x, screenY);
    vec2 localPos = screenPos - u_offset;
    
    // 2. Clipping: Discard pixels outside the container
    if (localPos.x < 0.0 || localPos.x > u_containerSize.x || 
        localPos.y < 0.0 || localPos.y > u_containerSize.y) {
        discard; 
    }

    vec2 pixelPos = localPos;

    // --- Pass 1: Find the closest seed ---
    float minDist = 1e10;
    int closestIndex = -1;
    vec2 closestSeedPos = vec2(0.0);

    for(int i = 0; i < ${MAX_SEEDS}; i++) {
        if(i >= u_seedCount) break;
        vec4 seed = texelFetch(u_seedTexture, ivec2(i, 0), 0);
        float d = distance(pixelPos, seed.xy);
        if(d < minDist) {
            minDist = d;
            closestIndex = i;
            closestSeedPos = seed.xy;
        }
    }

    // --- Pass 2: Find the distance to the closest edge (Perpendicular Bisector) ---
    float minEdgeDist = 1e10;

    for(int i = 0; i < ${MAX_SEEDS}; i++) {
        if(i >= u_seedCount) break;
        if(i == closestIndex) continue;

        vec4 seed = texelFetch(u_seedTexture, ivec2(i, 0), 0);
        vec2 neighborPos = seed.xy;
        vec2 toNeighbor = neighborPos - closestSeedPos;
        vec2 midPoint = closestSeedPos + toNeighbor * 0.5;
        float distToBisector = dot(midPoint - pixelPos, normalize(toNeighbor));
        minEdgeDist = min(minEdgeDist, distToBisector);
    }
    
    if (closestIndex == -1 || u_seedCount <= 1) {
        minEdgeDist = 1000.0;
    }

    if (u_renderIds == 1) {
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
    int colorIndex = clamp(int(floor(rawValue)), 0, max(u_paletteSize - 1, 0));
    float highlightFactor = step(0.05, fract(rawValue)); 

    vec3 baseColor = u_palette[colorIndex];
    
    // Lighting direction (top-left)
    vec2 lightDir = normalize(vec2(-1.0, -1.0));
    vec2 centerToPixel = pixelPos - closestSeedPos;
    float centerDist = length(centerToPixel);
    vec2 dirFromCenter = centerDist > 0.001 ? centerToPixel / centerDist : vec2(0.0);
    float lightDot = dot(dirFromCenter, lightDir);
 
    float halfGap = u_gapSize * 0.25;
        
    if (highlightFactor > 0.5) {
        // --- PRESSED / INSET EFFECT (luminance-adaptive) ---

        float lum = dot(baseColor, vec3(0.299, 0.587, 0.114));

        // 1. Adaptive darken/lighten: dark tiles get pushed lighter, light tiles darker
        //    Blend factor: lum=0 → shift toward lighter, lum=1 → shift toward darker
        float darkenAmt = mix(0.85, 0.6, lum);   // light tiles darken more
        float lightenAmt = mix(0.25, 0.0, lum);    // dark tiles get additive boost
        baseColor = baseColor * darkenAmt + vec3(lightenAmt);

        // 2. Inner shadow: darken near edges for depth
        float insetShadow = smoothstep(0.0, 12.0, minEdgeDist - halfGap);
        float shadowStrength = mix(0.75, 0.55, lum); // stronger on light tiles
        baseColor *= mix(shadowStrength, 1.0, insetShadow);

        // 3. Directional inset bevel
        float bevelWidth = 8.0;
        float bevelStrength = smoothstep(bevelWidth, 0.0, minEdgeDist - halfGap);
        float bevelShading = mix(0.15, -0.08, lightDot * 0.5 + 0.5);
        baseColor += baseColor * bevelShading * bevelStrength;

        // 4. Contrasting inner outline ring — visible on any color
        //    Renders a thin band at a fixed distance from the edge
        float outlineCenter = halfGap + 3.0;
        float outlineWidth = 1.8;
        float outlineRing = 1.0 - smoothstep(0.0, outlineWidth, abs(minEdgeDist - outlineCenter));
        // Auto-contrast: white outline on dark tiles, dark outline on light tiles
        vec3 outlineColor = mix(vec3(0.75), vec3(0.0), step(0.45, lum));
        baseColor = mix(baseColor, outlineColor, outlineRing * 0.55);

        // 5. Subtle desaturation to further distinguish from normal tiles
        float grey = dot(baseColor, vec3(0.299, 0.587, 0.114));
        baseColor = mix(baseColor, vec3(grey), 0.15);
    }

    // Edges & Anti-aliasing
    float edgeFactor = smoothstep(halfGap, halfGap + u_aaSize, minEdgeDist);
    
    vec3 borderColor = mix(vec3(0.08), vec3(0.15, 0.15, 0.2), highlightFactor);
    baseColor = mix(borderColor, baseColor, edgeFactor);

    outColor = vec4(clamp(baseColor, 0.0, 1.0), 1.0);
}`;
