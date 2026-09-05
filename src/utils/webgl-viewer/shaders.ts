/**
 * WebGL 查看器着色器。
 * 顶点着色器把「图片像素坐标 × 3×3 变换矩阵」映射到裁剪空间；
 * 片段着色器直接采样纹理。
 */

export const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;

  uniform mat3 u_matrix;
  uniform vec2 u_resolution;

  varying vec2 v_texCoord;

  void main() {
    vec2 position = (u_matrix * vec3(a_position, 1)).xy;
    vec2 zeroToOne = position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
  }
`;

export const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  void main() {
    gl_FragColor = texture2D(u_image, v_texCoord);
  }
`;

export function createShader(
	gl: WebGLRenderingContext,
	type: number,
	source: string,
): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error(
			"Failed to compile WebGL shader:",
			gl.getShaderInfoLog(shader),
		);
		gl.deleteShader(shader);
		return null;
	}

	return shader;
}

/** 创建完整的着色器程序（编译失败返回 null） */
export function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
	const fragmentShader = createShader(
		gl,
		gl.FRAGMENT_SHADER,
		FRAGMENT_SHADER_SOURCE,
	);

	if (!vertexShader || !fragmentShader) return null;

	const program = gl.createProgram();
	if (!program) return null;

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error(
			"Failed to link WebGL program:",
			gl.getProgramInfoLog(program),
		);
		gl.deleteProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return null;
	}

	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);

	return program;
}
