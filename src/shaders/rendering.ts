import type { Tile } from "../model/types/tile";
import { MAX_SEEDS, MAX_PALETTE_SIZE, palette } from "../utils/constants";
import { viewport } from "../utils/viewport";
import { UNWEIGHTED_FRAGMENT_SHADER_SOURCE } from "./unweightedShader.ts";

// ============================================================
// SHADERS
// ============================================================

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// ============================================================
// WEBGL SETUP
// ============================================================

export interface VoronoiContext {
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    texture: WebGLTexture;
    vao: WebGLVertexArrayObject;
    uniforms: {
        seedCount: WebGLUniformLocation;
        resolution: WebGLUniformLocation;
        // useClip: WebGLUniformLocation; // Removed
        paletteSize: WebGLUniformLocation;
        renderIds: WebGLUniformLocation;
        offset: WebGLUniformLocation;
        containerSize: WebGLUniformLocation;
        gapSize: WebGLUniformLocation;
        aaSize: WebGLUniformLocation;
    };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}

export function initGL(canvas: HTMLCanvasElement): VoronoiContext {
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: true });
    if (!gl) throw new Error("WebGL2 not supported");

    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, UNWEIGHTED_FRAGMENT_SHADER_SOURCE));
    // gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, WEIGHTED_FRAGMENT_SHADER_SOURCE));
    gl.linkProgram(program);
    gl.useProgram(program);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const positionAttrib = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Get uniform locations
    const uResolution = gl.getUniformLocation(program, "u_res")!;
    const uSeedCount = gl.getUniformLocation(program, "u_sc")!;
    // const uUseClip = gl.getUniformLocation(program, "u_uc")!; // removed or unused? Let's check Usage
    // Wait, useClip was not in my minified shader?! I might have missed it. 
    // Let me check my minified shader... 
    // I see u_st, u_sc, u_res, u_pal, u_ps, u_rid, u_off, u_cs, u_gs, u_aa
    // I missed u_useClip!

    // Ah, wait. Looking at original shader source: `uniform int u_renderIds;`
    // Looking at my minified shader: `uniform int u_rid;`
    // I removed `u_useClip` from the minified shader!
    // Why? It wasn't in the original shader source I read either?
    // Let me check Step 32:
    // "uniform int       u_seedCount;"
    // ...
    // "uniform int       u_renderIds;"
    // I don't see `u_useClip` in the original shader source either!
    // But `rendering.ts` had: `const uUseClip = gl.getUniformLocation(program, "u_useClip")!;` IN `initGL`
    // And `gl.uniform1i(uUseClip, 0);`

    // So the GL code was binding a uniform that didn't exist in the shader code provided in Step 32.
    // If it didn't exist, getUniformLocation returns null, which is fine unless we force ! (which we did).
    // Wait, `gl.getUniformLocation(program, "u_useClip")!` suggests it WAS expected.
    // However, the shader source in Step 32 clearly does NOT have `u_useClip`.
    // Maybe it was unused?

    // I will proceed with removing uUseClip from here too then.

    const uPaletteSize = gl.getUniformLocation(program, "u_ps")!;
    const uRenderIds = gl.getUniformLocation(program, "u_rid")!;
    const uOffset = gl.getUniformLocation(program, "u_off")!;
    const uContainerSize = gl.getUniformLocation(program, "u_cs")!;
    const uGapSize = gl.getUniformLocation(program, "u_gs")!;
    const uAaSize = gl.getUniformLocation(program, "u_aa")!;



    // Set initial uniform values
    gl.uniform1i(gl.getUniformLocation(program, "u_st"), 0);
    gl.uniform2f(uResolution, viewport.width, viewport.height);
    gl.uniform1i(uSeedCount, 0);
    // gl.uniform1i(uUseClip, 0); // Removed
    gl.uniform1i(uRenderIds, 0);
    gl.uniform2f(uOffset, 0, 0);
    gl.uniform2f(uContainerSize, viewport.width, viewport.height);
    gl.uniform1f(uGapSize, 3.0); // Default gap size
    gl.uniform1f(uAaSize, 1.5); // Default AA size

    // Initialize palette uniforms
    gl.uniform1i(uPaletteSize, palette.length);
    for (let i = 0; i < MAX_PALETTE_SIZE; i++) {
        const color = palette.getColor(i);
        gl.uniform3fv(gl.getUniformLocation(program, `u_pal[${i}]`), color.gl);
    }

    const ctx: VoronoiContext = {
        gl,
        program,
        texture,
        vao,
        uniforms: {
            seedCount: uSeedCount,
            resolution: uResolution,
            // useClip: uUseClip, // Removed
            paletteSize: uPaletteSize,
            renderIds: uRenderIds,
            offset: uOffset,
            containerSize: uContainerSize,
            gapSize: uGapSize!,
            aaSize: uAaSize,
        },
    };

    // Subscribe to palette changes to update GPU uniforms automatically
    palette.onChange(() => updatePalette(ctx));

    return ctx;
}

/**
 * Update the GPU palette uniforms when the palette changes.
 */
export function updatePalette(ctx: VoronoiContext): void {
    const { gl, program, uniforms } = ctx;
    gl.useProgram(program);
    gl.uniform1i(uniforms.paletteSize, palette.length);

    for (let i = 0; i < MAX_PALETTE_SIZE; i++) {
        const color = palette.getColor(i);
        gl.uniform3fv(gl.getUniformLocation(program, `u_pal[${i}]`), color.gl);
    }
}

export function resizeGL(ctx: VoronoiContext) {
    const { gl, uniforms } = ctx;
    gl.canvas.width = viewport.width;
    gl.canvas.height = viewport.height;
    gl.viewport(0, 0, viewport.width, viewport.height);

    gl.useProgram(ctx.program);
    gl.uniform2f(uniforms.resolution, viewport.width, viewport.height);
    // Also likely want to update container size default if not manually overridden, 
    // but typically render() is called with explicit size or we rely on the default which we might want to update here.
    // For safety, let's update the default to screen size just in case.
    gl.uniform2f(uniforms.containerSize, viewport.width, viewport.height);
}

// ============================================================
// RENDER LOOP
// ============================================================

const seedDataBuffer = new Float32Array(MAX_SEEDS * 4);

export function render(
    ctx: VoronoiContext,
    tiles: Tile[],
    offset: { x: number, y: number } = { x: 0, y: 0 },
    containerSize: { w: number, h: number } = { w: viewport.width, h: viewport.height },
    gapSize: number = 3.0,
    aaSize: number = 1.5
): void {
    const { gl, texture, vao, uniforms } = ctx;

    const count = Math.min(tiles.length, MAX_SEEDS);

    // Reset buffer (optional optimization: only if count decreases significantly)
    seedDataBuffer.fill(0);

    for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        const offsetIdx = i * 4;

        seedDataBuffer[offsetIdx] = tile.pos.x;
        seedDataBuffer[offsetIdx + 1] = tile.pos.y;
        seedDataBuffer[offsetIdx + 2] = tile.size;
        // PACKING: Integer part is ColorID, Fractional part (0.1) is Highlight flag
        seedDataBuffer[offsetIdx + 3] = tile.colorID + (tile.isHighlighted ? 0.1 : 0.0);
    }

    gl.useProgram(ctx.program); // Ensure using visual program

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        MAX_SEEDS,
        1,
        0,
        gl.RGBA,
        gl.FLOAT,
        seedDataBuffer
    );

    gl.uniform1i(uniforms.seedCount, count);
    // gl.uniform1i(uniforms.useClip, useClip ? 1 : 0); // Removed
    gl.uniform1i(uniforms.renderIds, 0); // Ensure visual mode

    // Set offset and size
    gl.uniform2f(uniforms.offset, offset.x, offset.y);
    gl.uniform2f(uniforms.containerSize, containerSize.w, containerSize.h);


    gl.uniform1f(uniforms.gapSize, gapSize);
    gl.uniform1f(uniforms.aaSize, aaSize);

    gl.viewport(0, 0, viewport.width, viewport.height);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function renderIds(
    ctx: VoronoiContext,
    tiles: Tile[],
    offset: { x: number, y: number } = { x: 0, y: 0 },
    containerSize: { w: number, h: number } = { w: viewport.width, h: viewport.height },
    gapSize: number = 3.0,
    aaSize: number = 1.5
): void {
    const { gl, texture, vao, uniforms } = ctx;

    const count = Math.min(tiles.length, MAX_SEEDS);

    // Assume texture is populated or we populate it.
    // Safety refill:
    seedDataBuffer.fill(0);
    for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        const offsetIdx = i * 4;
        seedDataBuffer[offsetIdx] = tile.pos.x;
        seedDataBuffer[offsetIdx + 1] = tile.pos.y;
        seedDataBuffer[offsetIdx + 2] = tile.size;
        seedDataBuffer[offsetIdx + 3] = tile.colorID + (tile.isHighlighted ? 0.1 : 0.0);
    }

    gl.useProgram(ctx.program);
    gl.bindVertexArray(vao); // Ensure VAO is bound

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        MAX_SEEDS,
        1,
        0,
        gl.RGBA,
        gl.FLOAT,
        seedDataBuffer
    );

    gl.uniform1i(uniforms.seedCount, count);
    gl.uniform1i(uniforms.renderIds, 1); // Enable ID mode
    gl.uniform2f(uniforms.offset, offset.x, offset.y);
    gl.uniform2f(uniforms.containerSize, containerSize.w, containerSize.h);
    gl.uniform1f(uniforms.gapSize, gapSize);
    gl.uniform1f(uniforms.aaSize, aaSize);

    gl.viewport(0, 0, viewport.width, viewport.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Reset
    gl.uniform1i(uniforms.renderIds, 0);
}
