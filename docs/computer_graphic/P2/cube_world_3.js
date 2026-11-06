// =====================================================================
//  A grid of cubes with random colors and random heights, in WebGL
// =====================================================================
//
// THE BIG PICTURE
// ---------------
// WebGL can only draw points, lines and triangles. To draw a cube we
// describe it as 12 triangles (2 per face × 6 faces), hand those
// triangles to the GPU, and then ask the GPU to draw that cube once for
// every cube in our list, each time with a different position, height
// and color.
//
// Every frame of WebGL drawing follows the same basic steps:
//
//   1. SHADERS  - small programs that run on the GPU. The *vertex shader*
//                 decides where each corner (vertex) of a triangle lands
//                 on the screen. The *fragment shader* decides the color
//                 of each pixel inside the triangle.
//   2. BUFFERS  - we copy our vertex data (the corners of the cube) into
//                 GPU memory once, at startup.
//   3. UNIFORMS - values that stay the same for a whole draw call, like
//                 "this cube is red" or "this cube is 3 units tall".
//                 We change them before drawing each cube.
//   4. DRAW     - we tell the GPU "draw 36 vertices as triangles".
//
// The sections below follow that same order.

// ---------------------------------------------------------------------
// 0. Get a WebGL "context" from the <canvas> element in index.html.
//    The context (gl) is the object we use to issue every WebGL command.
// ---------------------------------------------------------------------
const canvas = document.getElementById("c");

const gl = canvas.getContext("webgl");

const instancing = gl.getExtension("ANGLE_instanced_arrays");

// ---------------------------------------------------------------------
// 1. SHADERS
//    Shaders are written in GLSL, a C-like language. We store the source
//    code in JavaScript strings, then compile them for the GPU.
//
//    Three kinds of shader variables:
//      attribute - a different value for every vertex (e.g. its position)
//      uniform   - one value shared by every vertex in a draw call
//      varying   - passed from the vertex shader to the fragment shader
// ---------------------------------------------------------------------

// Old shader
/*
const vertexShaderSource = `
  attribute vec3 aPosition;   // corner position of the cube (model space)
  attribute vec3 aNormal;     // direction the face is pointing

  uniform mat4 uModel;        // moves/scales THIS cube into the world
  uniform mat4 uView;         // where the camera is and where it looks
  uniform mat4 uProjection;   // perspective: far things look smaller

  varying vec3 vNormal;       // handed to the fragment shader

  void main() {
    // Turn the normal the same way the cube is turned. Our cubes are only
    // stretched and moved, never rotated, so this changes nothing here.
    // It would matter if you added rotation.
    vNormal = normalize(mat3(uModel) * aNormal);

    // The famous line: model -> world -> camera -> screen.
    // Read it right to left: first place the cube in the world (uModel),
    // then view it from the camera (uView), then apply perspective.
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform vec3 uColor;        // this cube's color (red, green, blue: 0..1)
  varying vec3 vNormal;

  void main() {
    // Simple lighting so we can tell the faces of a cube apart.
    // A face pointing toward the light is bright; one facing away is dim.
    vec3 lightDirection = normalize(vec3(0.5, 1.0, 0.3));
    float brightness = max(dot(vNormal, lightDirection), 0.0);

    // Keep 30% "ambient" light so faces in shadow aren't pure black.
    float light = 0.3 + 0.7 * brightness;

    gl_FragColor = vec4(uColor * light, 1.0);   // 1.0 = fully opaque
  }
`;
*/

const vertexShaderSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;

// Per-instance data
attribute vec3 aInstancePosition;
attribute vec3 aInstanceScale;
attribute vec3 aInstanceColor;

uniform mat4 uView;
uniform mat4 uProjection;

varying vec3 vNormal;
varying vec3 vColor;

void main() {
    vec3 worldPosition =
        aPosition * aInstanceScale + aInstancePosition;

    vNormal = normalize(aNormal / aInstanceScale);
    vColor = aInstanceColor;

    gl_Position = uProjection * uView * vec4(worldPosition, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vColor;

void main() {
vec3 lightDirection = normalize(vec3(0.5, 1.0, 0.3));
float brightness = max(dot(vNormal, lightDirection), 0.0);

float light = 0.3 + 0.7 * brightness;

gl_FragColor = vec4(vColor * light, 1.0);
}
`;

// Compile one shader and report any GLSL errors.
function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

// A "program" is a vertex shader + a fragment shader linked together.
const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(
  program,
  compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource),
);
gl.linkProgram(program);
gl.useProgram(program);

// ---------------------------------------------------------------------
// 2. CUBE GEOMETRY → BUFFER
//    One cube, 1 unit wide, with its bottom at y = 0 (so it sits on the
//    ground). Every cube in the scene reuses this same data; uModel is
//    what makes each one different.
//
//    Each face = 2 triangles = 6 vertices. Each vertex has 6 numbers:
//         x,    y,    z,      nx, ny, nz   (position, then normal)
// ---------------------------------------------------------------------
const cubeVertices = new Float32Array([
  // Front face (normal points toward +z)
  -0.5, 0, 0.5, 0, 0, 1, 0.5, 0, 0.5, 0, 0, 1, 0.5, 1, 0.5, 0, 0, 1, -0.5, 0,
  0.5, 0, 0, 1, 0.5, 1, 0.5, 0, 0, 1, -0.5, 1, 0.5, 0, 0, 1,

  // Back face (-z)
  -0.5, 0, -0.5, 0, 0, -1, 0.5, 1, -0.5, 0, 0, -1, 0.5, 0, -0.5, 0, 0, -1, -0.5,
  0, -0.5, 0, 0, -1, -0.5, 1, -0.5, 0, 0, -1, 0.5, 1, -0.5, 0, 0, -1,

  // Top face (+y)
  -0.5, 1, -0.5, 0, 1, 0, -0.5, 1, 0.5, 0, 1, 0, 0.5, 1, 0.5, 0, 1, 0, -0.5, 1,
  -0.5, 0, 1, 0, 0.5, 1, 0.5, 0, 1, 0, 0.5, 1, -0.5, 0, 1, 0,

  // Bottom face (-y)
  -0.5, 0, -0.5, 0, -1, 0, 0.5, 0, 0.5, 0, -1, 0, -0.5, 0, 0.5, 0, -1, 0, -0.5,
  0, -0.5, 0, -1, 0, 0.5, 0, -0.5, 0, -1, 0, 0.5, 0, 0.5, 0, -1, 0,

  // Right face (+x)
  0.5, 0, -0.5, 1, 0, 0, 0.5, 1, -0.5, 1, 0, 0, 0.5, 1, 0.5, 1, 0, 0, 0.5, 0,
  -0.5, 1, 0, 0, 0.5, 1, 0.5, 1, 0, 0, 0.5, 0, 0.5, 1, 0, 0,

  // Left face (-x)
  -0.5, 0, -0.5, -1, 0, 0, -0.5, 1, 0.5, -1, 0, 0, -0.5, 1, -0.5, -1, 0, 0,
  -0.5, 0, -0.5, -1, 0, 0, -0.5, 0, 0.5, -1, 0, 0, -0.5, 1, 0.5, -1, 0, 0,
]);
const VERTEX_COUNT = 36;

// Copy the vertex data into GPU memory.
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

const BYTES_PER_FLOAT = 4;
const stride = 6 * BYTES_PER_FLOAT;

const aPosition = gl.getAttribLocation(program, "aPosition");
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, stride, 0);

const aNormal = gl.getAttribLocation(program, "aNormal");
gl.enableVertexAttribArray(aNormal);
gl.vertexAttribPointer(
  aNormal,
  3,
  gl.FLOAT,
  false,
  stride,
  3 * BYTES_PER_FLOAT,
);

// Look up where each uniform lives so we can set it later.
const uView = gl.getUniformLocation(program, "uView");
const uProjection = gl.getUniformLocation(program, "uProjection");

// ---------------------------------------------------------------------
// 3. THE SCENE: a plain JavaScript list of cubes
//    This part has nothing to do with WebGL - it's just data.
//    The cubes are laid out in a GRID_SIZE × GRID_SIZE grid on the
//    ground plane (y = 0), centered on the origin.
// ---------------------------------------------------------------------
const GRID_SIZE = 50;
const SPACING = 1.2; // distance between cube centers

const cubes = [];

for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    cubes.push({
      x: (col - (GRID_SIZE - 1) / 2) * SPACING,
      z: (row - (GRID_SIZE - 1) / 2) * SPACING,

      row: row,
      col: col,

      height: 1,
      color: [0.2, 0.7, 0.9],

      shock: 0,
    });
  }
}

// Instance
// Each instance contains:
// x, y, z, scaleX, scaleY, scaleZ, r, g, b

const INSTANCE_FLOATS = 9;
const INSTANCE_STRIDE = INSTANCE_FLOATS * BYTES_PER_FLOAT;

let instanceCapacity = cubes.length * 2;
let instanceData = new Float32Array(instanceCapacity * INSTANCE_FLOATS);

const instanceBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

// Position: x, y, z
const aInstancePosition = gl.getAttribLocation(program, "aInstancePosition");

gl.enableVertexAttribArray(aInstancePosition);
gl.vertexAttribPointer(
  aInstancePosition,
  3,
  gl.FLOAT,
  false,
  INSTANCE_STRIDE,
  0,
);
instancing.vertexAttribDivisorANGLE(aInstancePosition, 1);

// Scale: scaleX, scaleY, scaleZ
const aInstanceScale = gl.getAttribLocation(program, "aInstanceScale");

gl.enableVertexAttribArray(aInstanceScale);
gl.vertexAttribPointer(
  aInstanceScale,
  3,
  gl.FLOAT,
  false,
  INSTANCE_STRIDE,
  3 * BYTES_PER_FLOAT,
);
instancing.vertexAttribDivisorANGLE(aInstanceScale, 1);

// Color: r, g, b
const aInstanceColor = gl.getAttribLocation(program, "aInstanceColor");

gl.enableVertexAttribArray(aInstanceColor);
gl.vertexAttribPointer(
  aInstanceColor,
  3,
  gl.FLOAT,
  false,
  INSTANCE_STRIDE,
  6 * BYTES_PER_FLOAT,
);
instancing.vertexAttribDivisorANGLE(aInstanceColor, 1);

function relativeX(row) {
  return (row - (GRID_SIZE - 1) / 2) * SPACING;
}

function relativeZ(col) {
  return (col - (GRID_SIZE - 1) / 2) * SPACING;
}

// ---------------------------------------------------------------------
// 4. MATRIX HELPERS
//    A 4×4 matrix can move, scale, or rotate points. WebGL stores
//    matrices as 16 numbers in "column-major" order: the first 4 numbers
//    are the first COLUMN, not the first row. That's why the translation
//    (x, y, z) appears in the last 4 numbers below.
//
//    (Real projects usually use a library such as glMatrix for this.)
// ---------------------------------------------------------------------

// Move a point by (x, y, z).
function translation(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

// Stretch a point by (sx, sy, sz).
function scaling(sx, sy, sz) {
  return [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
}

// Multiply two matrices: the result does b first, then a.
function multiply(a, b) {
  const result = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
      }
    }
  }
  return result;
}

// Perspective projection: makes far-away objects look smaller.
//   fieldOfView - how wide the camera sees, in radians
//   aspect      - canvas width / height, so things aren't stretched
//   near, far   - nothing closer than near or farther than far is drawn
function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ];
}

// Camera matrix: place a camera at `eye`, looking at `target`.
// `up` says which way is "up" for the camera (normally +y).
function lookAt(eye, target, up) {
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const normalize = (a) => {
    const length = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / length, a[1] / length, a[2] / length];
  };

  // Build the camera's own three axes:
  const zAxis = normalize(subtract(eye, target)); // points backward, away from what we look at
  const xAxis = normalize(cross(up, zAxis)); // points to the camera's right
  const yAxis = cross(zAxis, xAxis); // points to the camera's up

  return [
    xAxis[0],
    yAxis[0],
    zAxis[0],
    0,
    xAxis[1],
    yAxis[1],
    zAxis[1],
    0,
    xAxis[2],
    yAxis[2],
    zAxis[2],
    0,
    -dot(xAxis, eye),
    -dot(yAxis, eye),
    -dot(zAxis, eye),
    1,
  ];
}

// IMAGE READING
async function loadImageData(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      resolve(ctx.getImageData(0, 0, image.width, image.height));
    };

    image.onerror = reject;
    image.src = src;
  });
}

// Load the grass color map and depth map, then build "sheets" from them:
//   depth map -> noiseSheet  (brightness becomes cube height)
//   color map -> colorSheet  (pixel color becomes cube color)
// If loading fails (missing file, or opened via file:// which blocks
// pixel reading), we keep the procedural test noise as a fallback.
async function loadGrassMaps() {
  try {
    const [color, depth] = await Promise.all([
      loadImageData("resources/tower50.png"),
      loadImageData("resources/tower50_depth.png"),
    ]);

    // ImageData keeps its pixels in .data, so pass that along.
    noiseSheet = createImageNoiseSheet(depth.data, depth.width, depth.height);
    colorSheet = createImageColorSheet(color.data, color.width, color.height);
  } catch (error) {
    console.warn(error);
  }
}

// NOISE STUFF
let noiseSheet = null;

// Position of our moving sampling window
let noiseOffsetX = 0;
let noiseOffsetY = 0;

// How many source pixels to move per SECOND (scaled by deltaTime in update)
// (The old value of 8 per update at 30 FPS was 240 per second.)
const NOISE_SPEED_X = 20;
const NOISE_SPEED_Y = 0;

let CAMERA_HEIGHT = 46;
let CAMERA_RADIUS = 14 * Math.SQRT2; // same start spot as the old [64, 104, 64]
const CAMERA_ORBIT_SPEED = 0.2; // ~31 seconds per full lap
let cameraAngle = Math.PI / 1.5;

// If the tab was in the background, the next frame's deltaTime can be huge.
// Clamp it so nothing jumps.
const MAX_DELTA_TIME = 0.1;

// Height range of the cubes
const MIN_HEIGHT = 0.1;
const MAX_HEIGHT = 20.0;

function createImageNoiseSheet(imageData, width, height) {
  return {
    width: width,
    height: height,

    sample: function (x, y) {
      const index = (y * width + x) * 4;

      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];

      // Convert RGB to brightness
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    },
  };
}

function createArrayNoiseSheet(data) {
  return {
    width: data[0].length,
    height: data.length,

    sample: function (x, y) {
      return data[y][x];
    },
  };
}

function generateTestNoise(width, height) {
  return {
    width,
    height,

    sample: function (x, y) {
      // A few overlapping waves to simulate terrain
      return (
        0.5 +
        0.2 * Math.sin(x * 0.05) +
        0.15 * Math.cos(y * 0.08) +
        0.1 * Math.sin((x + y) * 0.03)
      );
    },
  };
}

// Reads the RGB color of one pixel (0..1 per channel) into `out`.
// Writing into an existing array avoids allocating 10,000 arrays per frame.
function createImageColorSheet(imageData, width, height) {
  return {
    width: width,
    height: height,

    sampleInto: function (x, y, out) {
      const index = (y * width + x) * 4;
      out[0] = imageData[index] / 255;
      out[1] = imageData[index + 1] / 255;
      out[2] = imageData[index + 2] / 255;
    },
  };
}

// Start with the procedural noise so something shows while images load.
noiseSheet = generateTestNoise(500, 500);

// Filled in once the grass color map has loaded (null until then).
let colorSheet = null;

loadGrassMaps();

// HELPER FUNCTION
// https://blog.demofox.org/2014/08/28/one-dimensional-bezier-curves/
function quadraticBezier(p0, p1, p2, t) {
  const u = 1.0 - t;

  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  ];
}

function newFlight(cube) {
  // Random starting and ending positions
  cube.start = [
    (Math.random() - 0.5) * 40,
    5 + Math.random() * 10,
    (Math.random() - 0.5) * 40,
  ];

  cube.end = [
    (Math.random() - 0.5) * 40,
    5 + Math.random() * 10,
    (Math.random() - 0.5) * 40,
  ];

  // Control point: somewhere above the middle
  cube.control = [
    (cube.start[0] + cube.end[0]) / 2,
    Math.max(cube.start[1], cube.end[1]) + 5 + Math.random() * 100,
    (cube.start[2] + cube.end[2]) / 2,
  ];

  cube.progress = 0;
  cube.duration = 2 + Math.random() * 3;

  cube.position = [...cube.start];
}

function createFlyingCube() {
  const cube = {
    position: [0, 0, 0],
    scaling: [0, 0, 0],
    start: [0, 0, 0],
    control: [0, 0, 0],
    end: [0, 0, 0],
    progress: 0,
    duration: 2 + Math.random() * 3,
    color: [0.3, 0.3, 0.3],
    explode: false,
    particle: false,
  };

  return cube;
}

// Not exactly walk, just mean flying in straight line(s)
function createWalkCube() {
  const cube = {
    position: [0, 0, 0],
    scaling: [0, 0, 0],
    path: [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ],
    progress: 0,
    duration: 3,
    color: [0.3, 0.3, 0.3],
    destroyed: false,
  };

  return cube;
}

function updateFlyingCube(cube, deltaTime) {
  cube.progress += deltaTime / cube.duration;

  if (cube.particle && Math.random() < 0.6) {
    // Add a chance for a small particle effect at the cube's path
    const particle = createFlyingCube();
    particle.position = [...cube.position];
    particle.scaling = [
      Math.random() * 0.3,
      Math.random() * 0.3,
      Math.random() * 0.3,
    ];
    particle.duration = 0.2 + Math.random() * 0.2;
    particle.color = [...cube.color];
    particle.start = [...cube.position];
    particle.end = [
      cube.position[0] + (Math.random() - 0.5) * 1,
      cube.position[1] + (Math.random() - 0.5) * 1,
      cube.position[2] + (Math.random() - 0.5) * 1,
    ];
    particle.control = [
      (particle.start[0] + particle.end[0]) / 2,
      (particle.start[1] + particle.end[1]) / 2,
      (particle.start[2] + particle.end[2]) / 2,
    ];
    flyingCubes.push(particle);
  }

  if (cube.progress >= 1) {
    if (cube.explode) {
      explosion(cube);
    }

    // destroy cube
    const index = flyingCubes.indexOf(cube);
    if (index !== -1) {
      flyingCubes.splice(index, 1);
    }
    return; // Stop updating this cube since it's been destroyed
  }

  // Smooth movement along the Bezier curve
  const t = cube.progress;
  cube.position = quadraticBezier(cube.start, cube.control, cube.end, t);
}

function updateWalkCube(cube, deltaTime) {
  cube.progress += deltaTime / cube.duration;

  if (cube.destroyed) {
    explosion(cube);
    const index = walkCubes.indexOf(cube);
    if (index !== -1) {
      walkCubes.splice(index, 1);
      addScore(1);
    }
    return;
  }

  if (cube.progress >= 1) {
    cube.path.shift(); // Remove the first segment from the path
    cube.progress = 0; // Reset progress for the next segment

    if (cube.path.length < 2) {
      // Not enough points for a new segment, destroy the cube
      const index = walkCubes.indexOf(cube);
      if (index !== -1) {
        walkCubes.splice(index, 1);
      }
      return;
    }
  }

  // Smooth movement along the path
  const t = cube.progress;
  const segment = cube.path[0];
  const nextSegment = cube.path[1];
  cube.position = [
    relativeX(segment[0] + (nextSegment[0] - segment[0]) * t),
    5,
    relativeZ(segment[2] + (nextSegment[2] - segment[2]) * t),
  ];
}

// List of air cubes with purpose of flying around
const flyingCubes = [];

// List of air cubes with purpose of NOT flying around
const staticCubes = [];

const walkCubes = [];

// Some external data stuff
// Base blue: [8,y,5]
// Base red: [41,y,40]

let route = [
  [14, 10, 11],
  [20, 10, 16],
  [3, 10, 20],
  [13, 10, 28],
  [4, 10, 37],
  [20, 10, 43],
  [27, 10, 25],
  [26, 10, 5],
  [38, 10, 8],
  [43, 10, 28],
  [35, 10, 28],
  [35, 10, 34],
];

let blueCube = createFlyingCube();
let redCube = createFlyingCube();

blueCube.color = [0, 0, 1];
blueCube.position = [relativeX(8), 20, relativeZ(5)];
blueCube.scaling = [3, 3, 3];
staticCubes.push(blueCube);

redCube.color = [1, 0, 0];
redCube.position = [relativeX(41), 20, relativeZ(40)];
redCube.scaling = [3, 3, 3];
staticCubes.push(redCube);

// Take a cube
// Spawn an explosion at that cube position
// do this because we can extract some information from original
function explosion(cube) {
  for (let i = 0; i < 20; i++) {
    let newCube = createFlyingCube();

    newCube.position = [...cube.position];
    newCube.scaling = [
      Math.random() * 0.3 + 0.2,
      Math.random() * 0.3 + 0.2,
      Math.random() * 0.3 + 0.2,
    ];
    newCube.duration = 0.5 + Math.random() * 0.5;
    newCube.color = [...cube.color];

    newCube.start = [...cube.position];
    newCube.end = [
      cube.position[0] + (Math.random() - 0.5) * 10,
      10,
      cube.position[2] + (Math.random() - 0.5) * 10,
    ];

    newCube.control = [
      (newCube.start[0] + newCube.end[0]) / 2,
      Math.max(newCube.start[1], newCube.end[1]) + 5 + Math.random() * 20,
      (newCube.start[2] + newCube.end[2]) / 2,
    ];

    flyingCubes.push(newCube);
  }

  // Destroy walking cube on explode
  for (const walker of walkCubes) {
    if (
      (cube.position[2] - walker.position[2]) ** 2 +
        (cube.position[0] - walker.position[0]) ** 2 <
      25
    ) {
      walker.destroyed = true;
    }
  }

  for (const floor of cubes) {
    if (
      (cube.position[2] - floor.z) ** 2 + (cube.position[0] - floor.x) ** 2 <
      25
    ) {
      floor.shock = 2;
    }
  }
}

// ---------------------------------------------------------------------
// 5. DRAW
// ---------------------------------------------------------------------
function draw() {
  // Make the canvas's pixel size match its size on the page.
  if (
    canvas.width !== canvas.clientWidth ||
    canvas.height !== canvas.clientHeight
  ) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);

  // Clear the screen to certain color.
  gl.clearColor(11 / 255, 1 / 255, 45 / 255, 1);

  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // The camera is the same for every cube, so set it once.
  const aspect = canvas.width / canvas.height;
  gl.uniformMatrix4fv(
    uProjection,
    false,
    perspective(Math.PI / 2, aspect, 0.1, 1000),
  );

  const eye = [
    Math.sin(cameraAngle) * CAMERA_RADIUS,
    CAMERA_HEIGHT,
    Math.cos(cameraAngle) * CAMERA_RADIUS,
  ];
  gl.uniformMatrix4fv(uView, false, lookAt(eye, [0, 0, 0], [0, 1, 0]));

  // Prepare instance data
  for (let i = 0; i < cubes.length; i++) {
    const cube = cubes[i];
    const o = i * INSTANCE_FLOATS;

    instanceData[o] = cube.x;
    instanceData[o + 1] = 0;
    instanceData[o + 2] = cube.z;

    instanceData[o + 3] = 1;
    instanceData[o + 4] = cube.height;
    instanceData[o + 5] = 1;

    instanceData[o + 6] = cube.color[0];
    instanceData[o + 7] = cube.color[1];
    instanceData[o + 8] = cube.color[2];
  }

  for (let i = 0; i < flyingCubes.length; i++) {
    const cube = flyingCubes[i];
    const o = (cubes.length + i) * INSTANCE_FLOATS;

    instanceData[o] = cube.position[0];
    instanceData[o + 1] = cube.position[1];
    instanceData[o + 2] = cube.position[2];

    instanceData[o + 3] = cube.scaling[0];
    instanceData[o + 4] = cube.scaling[1];
    instanceData[o + 5] = cube.scaling[2];

    instanceData[o + 6] = cube.color[0];
    instanceData[o + 7] = cube.color[1];
    instanceData[o + 8] = cube.color[2];
  }

  for (let i = 0; i < staticCubes.length; i++) {
    const cube = staticCubes[i];
    const o = (cubes.length + flyingCubes.length + i) * INSTANCE_FLOATS;

    instanceData[o] = cube.position[0];
    instanceData[o + 1] = cube.position[1];
    instanceData[o + 2] = cube.position[2];

    instanceData[o + 3] = cube.scaling[0];
    instanceData[o + 4] = cube.scaling[1];
    instanceData[o + 5] = cube.scaling[2];

    instanceData[o + 6] = cube.color[0];
    instanceData[o + 7] = cube.color[1];
    instanceData[o + 8] = cube.color[2];
  }

  for (let i = 0; i < walkCubes.length; i++) {
    const cube = walkCubes[i];
    const o =
      (cubes.length + flyingCubes.length + staticCubes.length + i) *
      INSTANCE_FLOATS;

    instanceData[o] = cube.position[0];
    instanceData[o + 1] = cube.position[1];
    instanceData[o + 2] = cube.position[2];

    instanceData[o + 3] = cube.scaling[0];
    instanceData[o + 4] = cube.scaling[1];
    instanceData[o + 5] = cube.scaling[2];

    instanceData[o + 6] = cube.color[0];
    instanceData[o + 7] = cube.color[1];
    instanceData[o + 8] = cube.color[2];
  }

  // Upload updated instance data
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData);

  // Draw all cubes in one call
  instancing.drawArraysInstancedANGLE(
    gl.TRIANGLES,
    0,
    VERTEX_COUNT,
    cubes.length + flyingCubes.length + staticCubes.length + walkCubes.length,
  );
}

const cubeSpawnRate = 1; // second per cubes spawn
let cubeSpawnTimer = 0;

const walkSpawnRate = 2; // second per cubes spawn
let walkSpawnTimer = 2;

function update(deltaTime) {
  // Update cube spawn timer
  cubeSpawnTimer += deltaTime;
  walkSpawnTimer += deltaTime;

  // Create cannonball from red to random route
  if (cubeSpawnTimer >= cubeSpawnRate) {
    cubeSpawnTimer = 0;
    const cannonball = createFlyingCube();

    cannonball.position = redCube.position;
    cannonball.start = redCube.position;

    const targetPathId = Math.floor(Math.random() * (route.length - 1));
    const targetPath1 = route[targetPathId];
    const targetPath2 = route[targetPathId + 1];
    const targetPosition = [
      relativeX(
        targetPath1[0] + (targetPath2[0] - targetPath1[0]) * Math.random(),
      ),
      3,
      relativeZ(
        targetPath1[2] + (targetPath2[2] - targetPath1[2]) * Math.random(),
      ),
    ];

    cannonball.end = targetPosition;
    cannonball.color = [1, Math.random() * 0.5 + 0.5, 0];
    cannonball.scaling = [1.5, 1.5, 1.5];

    cannonball.control = [
      (cannonball.start[0] + cannonball.end[0]) / 2,
      Math.max(cannonball.start[1], cannonball.end[1]) + 5 + Math.random() * 20,
      (cannonball.start[2] + cannonball.end[2]) / 2,
    ];

    cannonball.duration = 1 + Math.random() * 0.5;
    cannonball.explode = true;
    cannonball.particle = true;

    flyingCubes.push(cannonball);
  }

  if (walkSpawnTimer >= walkSpawnRate) {
    walkSpawnTimer = 0;
    const walkCubeTest = createWalkCube();
    walkCubeTest.path = [...route];
    walkCubeTest.scaling = [1.5, 1.5, 1.5];
    walkCubeTest.color = [0, 1, 0];
    walkCubes.push(walkCubeTest);
  }

  if (!noiseSheet) return;

  // The offsets are now fractional, but sheets are indexed by whole pixels
  // (array / image sheets would return garbage for e.g. x = 3.7).
  const offsetX = Math.floor(noiseOffsetX);
  const offsetY = Math.floor(noiseOffsetY);

  for (const cube of cubes) {
    // Get the corresponding position in the noise sheet
    const nx = (cube.col + offsetX) % noiseSheet.width;
    const ny = (cube.row + offsetY) % noiseSheet.height;

    // Sample the noise value
    const value = noiseSheet.sample(nx, ny);

    // Convert noise value into cube height
    cube.height = MIN_HEIGHT + value * (MAX_HEIGHT - MIN_HEIGHT);

    // Apply shock effect to the cube's height
    if (cube.shock > 0) {
      cube.height += cube.shock;
      cube.shock -= deltaTime * 4;
    }

    if (colorSheet) {
      const cx = (cube.col + offsetX) % colorSheet.width;
      const cy = (cube.row + offsetY) % colorSheet.height;
      colorSheet.sampleInto(cx, cy, cube.color);
    }
  }

  // Update flying cubes
  for (const cube of flyingCubes) {
    updateFlyingCube(cube, deltaTime);
  }

  for (const cube of walkCubes) {
    updateWalkCube(cube, deltaTime);
  }
}

let lastTimestamp = null;

function frame(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp; // first frame: no time has passed

  const deltaTime = Math.min(
    (timestamp - lastTimestamp) / 1000,
    MAX_DELTA_TIME,
  );
  lastTimestamp = timestamp;

  update(deltaTime);
  draw();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Camera movement with mouse because annoying
let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener("mousedown", (e) => {
  dragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener("mouseup", () => {
  dragging = false;
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;

  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  cameraAngle -= dx * 0.005;
  CAMERA_HEIGHT += dy * 0.15;

  CAMERA_HEIGHT = Math.max(2, Math.min(100, CAMERA_HEIGHT));

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    CAMERA_RADIUS += e.deltaY * 0.05;
    CAMERA_RADIUS = Math.max(5, Math.min(200, CAMERA_RADIUS));
  },
  { passive: false },
);

let score = 0;

const scoreElement = document.getElementById("score");

function updateScore() {
  scoreElement.textContent = `Score: ${score}`;
}

function addScore(points) {
  score += points;
  updateScore();
}
