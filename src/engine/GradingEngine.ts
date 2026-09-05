import {
  transferShader,
  transformShader,
  displayEncoding,
  type Encoding,
} from "./colour";
export { defaultColour, transfers, primaries, encodingLabel } from "./colour";
export type { Encoding, ColourSettings } from "./colour";
import {
  compileGraph,
  encodingFlow,
  createGraph,
  inspectGraph,
  type GradingGraph,
} from "./graph";
export { createGraph } from "./graph";
export type { GradingGraph, GradingNode, GradingEdge, NodeType } from "./graph";
import { previewSize } from "./previewSize";

const vertexSource = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

// A reachable graph compiles to one pass; numeric parameters remain uniforms.
const fragmentSource = (
  declarations: string,
  body: string,
  flip = true,
) => `#version 300 es
precision highp float;
uniform sampler2D sourceImage;
${declarations}
in vec2 uv;
out vec4 result;
${transferShader}
void main() {
  vec4 source = texture(sourceImage, ${flip ? "vec2(uv.x, 1.0 - uv.y)" : "uv"});
  ${body}
}`;

/** Full-range straight RGBA for numeric evaluation; never browser colour-converted. */
export type FloatImage = { width: number; height: number; data: Float32Array };

export class GradingEngine {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs = new Map<string, WebGLProgram>();
  private source: WebGLTexture | null = null;
  private target: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
    });
    if (!gl)
      throw new Error(
        "WebGL2 is unavailable. Try a desktop browser with hardware acceleration enabled.",
      );
    this.gl = gl;
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error(
        "Floating-point rendering is unavailable on this device. Try another browser or graphics device.",
      );
    }
    if (
      (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
        ?.precision ?? 0) < 23
    ) {
      throw new Error(
        "This graphics device does not provide the precision required for grading.",
      );
    }
    gl.drawingBufferColorSpace = "srgb";
    this.prepare(createGraph());
    this.prepareDisplay(displayEncoding);
    gl.disable(gl.DITHER);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private createProgram(fragment: string): WebGLProgram {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    if (!program) throw new Error("Could not allocate a grading program.");
    try {
      for (const [kind, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error("Could not allocate a grading shader.");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error("This device could not compile the grading shader.");
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("This device could not link the grading program.");
      return program;
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  }

  private assertAvailable() {
    if (this.disposed) throw new Error("The grading engine has been disposed.");
    if (this.gl.isContextLost())
      throw new Error(
        "The graphics connection was lost. Reload this page to continue.",
      );
  }

  /** Input is full-range straight RGBA, top to bottom; graph.colour.input declares its encoding. */
  setImage(image: ImageData | ImageBitmap | FloatImage) {
    this.assertAvailable();
    const gl = this.gl;
    const floating = "data" in image && image.data instanceof Float32Array;
    if (
      floating &&
      (image.data.length !== image.width * image.height * 4 ||
        !image.data.every(Number.isFinite))
    )
      throw new Error(
        "Float input requires finite straight RGBA samples for every pixel.",
      );
    if (
      !Number.isInteger(image.width) ||
      !Number.isInteger(image.height) ||
      image.width <= 0 ||
      image.height <= 0
    )
      throw new Error("The image has no readable pixels.");
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (image.width > maxSize || image.height > maxSize)
      throw new Error("This image exceeds the graphics device texture limit.");
    const { width, height } = previewSize(image.width, image.height);
    const source = gl.createTexture();
    const target = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    try {
      if (!source || !target || !framebuffer)
        throw new Error("Could not allocate preview resources.");
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      this.configureTexture();
      if ("data" in image) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          floating ? gl.RGBA32F : gl.RGBA8,
          image.width,
          image.height,
          0,
          gl.RGBA,
          floating ? gl.FLOAT : gl.UNSIGNED_BYTE,
          image.data,
        );
      } else {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
      }
      gl.bindTexture(gl.TEXTURE_2D, target);
      this.configureTexture();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        floating ? gl.RGBA32F : gl.RGBA16F,
        width,
        height,
        0,
        gl.RGBA,
        floating ? gl.FLOAT : gl.HALF_FLOAT,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        target,
        0,
      );
      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE ||
        gl.getError() !== gl.NO_ERROR
      ) {
        throw new Error(
          "This device could not allocate a floating-point preview. Try a smaller image.",
        );
      }
    } catch (error) {
      gl.deleteTexture(source);
      gl.deleteTexture(target);
      gl.deleteFramebuffer(framebuffer);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.deleteTexture(this.source);
    gl.deleteTexture(this.target);
    gl.deleteFramebuffer(this.framebuffer);
    this.source = source;
    this.target = target;
    this.framebuffer = framebuffer;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private configureTexture() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  static validate(graph: GradingGraph, draft = false): string | null {
    try {
      inspectGraph(graph, draft);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid graph.";
    }
  }

  static warnings(graph: GradingGraph): string[] {
    if (GradingEngine.validate(graph)) return [];
    return encodingFlow(graph).warnings;
  }

  private prepare(graph: GradingGraph) {
    const compiled = compileGraph(graph);
    let program = this.programs.get(compiled.key);
    if (!program) {
      program = this.createProgram(
        fragmentSource(compiled.declarations, compiled.body),
      );
      this.programs.set(compiled.key, program);
    }
    const gl = this.gl;
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "sourceImage"), 0);
    compiled.uniforms.forEach((value, i) =>
      gl.uniform1f(gl.getUniformLocation(program, `stops${i}`), value),
    );
  }

  private prepareDisplay(output: Encoding) {
    const key = `viewer:${output.transfer}:${output.primaries}`;
    let program = this.programs.get(key);
    if (!program) {
      program = this.createProgram(
        fragmentSource(
          "",
          `result = vec4(clamp(${transformShader("source.rgb", output, displayEncoding)}, 0.0, 1.0), source.a);`,
          false,
        ),
      );
      this.programs.set(key, program);
    }
    const gl = this.gl;
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "sourceImage"), 0);
  }

  render(input: number | GradingGraph) {
    this.assertAvailable();
    const graph = typeof input === "number" ? createGraph() : input;
    if (typeof input === "number") graph.nodes[1].data.stops = input;
    this.prepare(graph);
    if (!this.source) throw new Error("Load an image before rendering.");
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Display conversion is a separate pass. The float target retains output encoding.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.prepareDisplay(graph.colour.output);
    gl.bindTexture(gl.TEXTURE_2D, this.target);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error("The graphics device could not render this preview.");
  }

  /** Read graded output-encoded pixels in top-to-bottom RGBA order, before display conversion. */
  readPixels(): Float32Array {
    this.assertAvailable();
    if (!this.framebuffer)
      throw new Error("Load an image before reading pixels.");
    const gl = this.gl;
    const { width, height } = this.canvas;
    const bottomUp = new Float32Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, bottomUp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error("Floating-point readback is unavailable on this device.");
    const topDown = new Float32Array(bottomUp.length);
    for (let y = 0; y < height; y++)
      topDown.set(
        bottomUp.subarray(y * width * 4, (y + 1) * width * 4),
        (height - 1 - y) * width * 4,
      );
    return topDown;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.source);
    gl.deleteTexture(this.target);
    gl.deleteFramebuffer(this.framebuffer);
    this.programs.forEach((program) => gl.deleteProgram(program));
    this.programs.clear();
  }
}
