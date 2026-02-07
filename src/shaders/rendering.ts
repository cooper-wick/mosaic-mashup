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
        useClip: WebGLUniformLocation;
        paletteSize: WebGLUniformLocation;
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
    const uResolution = gl.getUniformLocation(program, "u_resolution")!;
    const uSeedCount = gl.getUniformLocation(program, "u_seedCount")!;
    const uUseClip = gl.getUniformLocation(program, "u_useClip")!;
    const uPaletteSize = gl.getUniformLocation(program, "u_paletteSize")!;

    // Set initial uniform values
    gl.uniform1i(gl.getUniformLocation(program, "u_seedTexture"), 0);
    gl.uniform2f(uResolution, viewport.width, viewport.height);
    gl.uniform1i(uSeedCount, 0);
    gl.uniform1i(uUseClip, 0);

    // Initialize palette uniforms
    gl.uniform1i(uPaletteSize, palette.length);
    for (let i = 0; i < MAX_PALETTE_SIZE; i++) {
        const color = palette.getColor(i);
        gl.uniform3fv(gl.getUniformLocation(program, `u_palette[${i}]`), color.gl);
    }

    const ctx: VoronoiContext = {
        gl,
        program,
        texture,
        vao,
        uniforms: {
            seedCount: uSeedCount,
            resolution: uResolution,
            useClip: uUseClip,
            paletteSize: uPaletteSize,
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
        gl.uniform3fv(gl.getUniformLocation(program, `u_palette[${i}]`), color.gl);
    }
}

export function resizeGL(ctx: VoronoiContext) {
    const { gl, uniforms } = ctx;
    gl.canvas.width = viewport.width;
    gl.canvas.height = viewport.height;
    gl.viewport(0, 0, viewport.width, viewport.height);

    gl.useProgram(ctx.program);
    gl.uniform2f(uniforms.resolution, viewport.width, viewport.height);
}

// ============================================================
// RENDER LOOP
// ============================================================

const seedDataBuffer = new Float32Array(MAX_SEEDS * 4);

export function render(ctx: VoronoiContext, tiles: Tile[], useClip: boolean = false): void {
    const { gl, texture, vao, uniforms } = ctx;

    const count = Math.min(tiles.length, MAX_SEEDS);

    // Reset buffer (optional optimization: only if count decreases significantly)
    seedDataBuffer.fill(0);

    for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        const offset = i * 4;

        seedDataBuffer[offset] = tile.pos.x;
        seedDataBuffer[offset + 1] = tile.pos.y;
        seedDataBuffer[offset + 2] = tile.size;
        // PACKING: Integer part is ColorID, Fractional part (0.1) is Highlight flag
        seedDataBuffer[offset + 3] = tile.colorID + (tile.isHighlighted ? 0.1 : 0.0);
    }

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
    gl.uniform1i(uniforms.useClip, useClip ? 1 : 0);

    gl.viewport(0, 0, viewport.width, viewport.height);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
