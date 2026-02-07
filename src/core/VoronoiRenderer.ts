import type { Tile } from "../model/types/tile";
import { NUM_COLORS, MAX_SEEDS, PALETTE } from "../utils/constants";
import { UNWEIGHTED_FRAGMENT_SHADER_SOURCE } from "../shaders/unweightedShader";

// ============================================================
// SHADERS
// ============================================================

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// ============================================================
// VORONOI RENDERER CLASS
// ============================================================

export interface VoronoiRendererOptions {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
}

/**
 * Encapsulates WebGL2 Voronoi rendering for reuse across different screens.
 * Supports optional background image rendering beneath the Voronoi cells.
 */
export class VoronoiRenderer {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;
    private vao: WebGLVertexArrayObject;
    private seedDataBuffer: Float32Array;

    private uSeedCount: WebGLUniformLocation;
    private uResolution: WebGLUniformLocation;

    private _width: number;
    private _height: number;

    // Background image support
    private backgroundTexture: WebGLTexture | null = null;

    constructor(options: VoronoiRendererOptions) {
        const { canvas, width, height } = options;

        this._width = width;
        this._height = height;

        canvas.width = width;
        canvas.height = height;

        const gl = canvas.getContext("webgl2", { antialias: false });
        if (!gl) throw new Error("WebGL2 not supported");
        this.gl = gl;

        // Compile shaders and create program
        this.program = this.createProgram();
        gl.useProgram(this.program);

        // Create VAO with full-screen quad
        this.vao = this.createQuadVAO();

        // Create seed data texture
        this.texture = this.createSeedTexture();

        // Get uniform locations
        this.uResolution = gl.getUniformLocation(this.program, "u_resolution")!;
        this.uSeedCount = gl.getUniformLocation(this.program, "u_seedCount")!;

        // Initialize uniforms
        gl.uniform1i(gl.getUniformLocation(this.program, "u_seedTexture"), 0);
        gl.uniform2f(this.uResolution, width, height);
        gl.uniform1i(this.uSeedCount, 0);

        // Set up color palette
        for (let i = 0; i < NUM_COLORS; i++) {
            gl.uniform3fv(gl.getUniformLocation(this.program, `u_palette[${i}]`), PALETTE[i].gl);
        }

        this.seedDataBuffer = new Float32Array(MAX_SEEDS * 4);
    }

    private compileShader(type: number, source: string): WebGLShader {
        const { gl } = this;
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
        }
        return shader;
    }

    private createProgram(): WebGLProgram {
        const { gl } = this;
        const program = gl.createProgram()!;
        gl.attachShader(program, this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE));
        gl.attachShader(program, this.compileShader(gl.FRAGMENT_SHADER, UNWEIGHTED_FRAGMENT_SHADER_SOURCE));
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
        }
        return program;
    }

    private createQuadVAO(): WebGLVertexArrayObject {
        const { gl } = this;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertexBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const positionAttrib = gl.getAttribLocation(this.program, "a_position");
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        return vao;
    }

    private createSeedTexture(): WebGLTexture {
        const { gl } = this;
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    /**
     * Update the renderer dimensions
     */
    resize(width: number, height: number): void {
        const { gl } = this;
        this._width = width;
        this._height = height;

        const canvas = gl.canvas as HTMLCanvasElement;
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);

        gl.useProgram(this.program);
        gl.uniform2f(this.uResolution, width, height);
    }

    /**
     * Set a background image to render behind the Voronoi cells
     */
    setBackgroundImage(image: HTMLImageElement | null): void {
        const { gl } = this;

        if (!image) {
            this.backgroundTexture = null;
            return;
        }

        if (!this.backgroundTexture) {
            this.backgroundTexture = gl.createTexture()!;
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    /**
     * Render tiles as Voronoi cells
     */
    render(tiles: readonly Tile[]): void {
        const { gl } = this;
        const count = Math.min(tiles.length, MAX_SEEDS);

        // Clear and reset
        gl.clearColor(0.06, 0.06, 0.14, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Upload seed data
        this.seedDataBuffer.fill(0);
        for (let i = 0; i < count; i++) {
            const tile = tiles[i];
            const offset = i * 4;
            this.seedDataBuffer[offset] = tile.pos.x;
            this.seedDataBuffer[offset + 1] = tile.pos.y;
            this.seedDataBuffer[offset + 2] = tile.size;
            // Pack colorID and highlight flag
            this.seedDataBuffer[offset + 3] = tile.colorID + (tile.isHighlighted ? 0.1 : 0.0);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            MAX_SEEDS,
            1,
            0,
            gl.RGBA,
            gl.FLOAT,
            this.seedDataBuffer
        );

        gl.useProgram(this.program);
        gl.uniform1i(this.uSeedCount, count);

        gl.viewport(0, 0, this._width, this._height);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    /**
     * Get the WebGL context for advanced usage
     */
    getContext(): WebGL2RenderingContext {
        return this.gl;
    }
}
