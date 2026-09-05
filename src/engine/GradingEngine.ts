import { previewSize } from "./previewSize";

const vertexSource = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

// The fixed Source → Exposure → Output graph is one grading pass. All
// user-adjustable values are uniforms; no recompilation on exposure edits.
const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D sourceImage;
uniform float stops;
in vec2 uv;
out vec4 result;
vec3 decodeSrgb(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(0.04045)));
}
vec3 encodeSrgb(vec3 c) {
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
  vec4 source = texture(sourceImage, vec2(uv.x, 1.0 - uv.y));
  vec3 linearRgb = decodeSrgb(source.rgb);
  vec3 exposed = linearRgb * exp2(stops);
  result = vec4(clamp(encodeSrgb(exposed), 0.0, 1.0), source.a);
}`;

export class GradingEngine {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly stopsLocation: WebGLUniformLocation;
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
    this.program = this.createProgram();
    const location = gl.getUniformLocation(this.program, "stops");
    if (location === null)
      throw new Error("The exposure control could not be initialized.");
    this.stopsLocation = location;
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "sourceImage"), 0);
    gl.disable(gl.DITHER);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private createProgram(): WebGLProgram {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    if (!program) throw new Error("Could not allocate a grading program.");
    try {
      for (const [kind, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragmentSource],
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

  /** Input is straight-alpha sRGB with rows ordered top to bottom. */
  setImage(image: ImageData | ImageBitmap) {
    this.assertAvailable();
    const gl = this.gl;
    if (!image.width || !image.height)
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
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      gl.bindTexture(gl.TEXTURE_2D, target);
      this.configureTexture();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        width,
        height,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
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

  render(stops: number) {
    this.assertAvailable();
    if (!Number.isFinite(stops) || stops < -6 || stops > 6)
      throw new Error("Exposure must be between −6 and +6 stops.");
    if (!this.source) throw new Error("Load an image before rendering.");
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.uniform1f(this.stopsLocation, stops);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error("The graphics device could not render this preview.");
  }

  /** Read the graded float pixels in top-to-bottom RGBA order (before browser compositing). */
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
    gl.deleteProgram(this.program);
  }
}
