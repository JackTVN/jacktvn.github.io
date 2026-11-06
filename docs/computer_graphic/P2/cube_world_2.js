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
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl');


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
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
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
  -0.5, 0, 0.5,   0, 0, 1,
   0.5, 0, 0.5,   0, 0, 1,
   0.5, 1, 0.5,   0, 0, 1,
  -0.5, 0, 0.5,   0, 0, 1,
   0.5, 1, 0.5,   0, 0, 1,
  -0.5, 1, 0.5,   0, 0, 1,

  // Back face (-z)
  -0.5, 0, -0.5,  0, 0, -1,
   0.5, 1, -0.5,  0, 0, -1,
   0.5, 0, -0.5,  0, 0, -1,
  -0.5, 0, -0.5,  0, 0, -1,
  -0.5, 1, -0.5,  0, 0, -1,
   0.5, 1, -0.5,  0, 0, -1,

  // Top face (+y)
  -0.5, 1, -0.5,  0, 1, 0,
  -0.5, 1,  0.5,  0, 1, 0,
   0.5, 1,  0.5,  0, 1, 0,
  -0.5, 1, -0.5,  0, 1, 0,
   0.5, 1,  0.5,  0, 1, 0,
   0.5, 1, -0.5,  0, 1, 0,

  // Bottom face (-y)
  -0.5, 0, -0.5,  0, -1, 0,
   0.5, 0,  0.5,  0, -1, 0,
  -0.5, 0,  0.5,  0, -1, 0,
  -0.5, 0, -0.5,  0, -1, 0,
   0.5, 0, -0.5,  0, -1, 0,
   0.5, 0,  0.5,  0, -1, 0,

  // Right face (+x)
   0.5, 0, -0.5,  1, 0, 0,
   0.5, 1, -0.5,  1, 0, 0,
   0.5, 1,  0.5,  1, 0, 0,
   0.5, 0, -0.5,  1, 0, 0,
   0.5, 1,  0.5,  1, 0, 0,
   0.5, 0,  0.5,  1, 0, 0,

  // Left face (-x)
  -0.5, 0, -0.5, -1, 0, 0,
  -0.5, 1,  0.5, -1, 0, 0,
  -0.5, 1, -0.5, -1, 0, 0,
  -0.5, 0, -0.5, -1, 0, 0,
  -0.5, 0,  0.5, -1, 0, 0,
  -0.5, 1,  0.5, -1, 0, 0,
]);
const VERTEX_COUNT = 36;

// Copy the vertex data into GPU memory.
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

// Tell the GPU how to read the buffer: which numbers are the position
// and which are the normal.
//   stride = bytes from one vertex to the next = 6 floats × 4 bytes = 24
//   offset = where in each vertex this attribute starts
const BYTES_PER_FLOAT = 4;
const stride = 6 * BYTES_PER_FLOAT;

const aPosition = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, stride, 0);

const aNormal = gl.getAttribLocation(program, 'aNormal');
gl.enableVertexAttribArray(aNormal);
gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 3 * BYTES_PER_FLOAT);

// Look up where each uniform lives so we can set it later.
const uModel = gl.getUniformLocation(program, 'uModel');
const uView = gl.getUniformLocation(program, 'uView');
const uProjection = gl.getUniformLocation(program, 'uProjection');
const uColor = gl.getUniformLocation(program, 'uColor');


// ---------------------------------------------------------------------
// 3. THE SCENE: a plain JavaScript list of cubes
//    This part has nothing to do with WebGL - it's just data.
//    The cubes are laid out in a GRID_SIZE × GRID_SIZE grid on the
//    ground plane (y = 0), centered on the origin.
// ---------------------------------------------------------------------
const GRID_SIZE = 100;   // 10 × 10 = 100 cubes
const SPACING = 1.5;    // distance between cube centers

const cubes = [];

for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    cubes.push({
      x: (col - (GRID_SIZE - 1) / 2) * SPACING,
      z: (row - (GRID_SIZE - 1) / 2) * SPACING,

      row: row,
      col: col,

      height: 1,
      color: [0.2, 0.7, 0.9]
    });
  }
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
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

// Stretch a point by (sx, sy, sz).
function scaling(sx, sy, sz) {
  return [
    sx, 0,  0,  0,
    0,  sy, 0,  0,
    0,  0,  sz, 0,
    0,  0,  0,  1,
  ];
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
    f / aspect, 0, 0,                               0,
    0,          f, 0,                               0,
    0,          0, (far + near) / (near - far),    -1,
    0,          0, (2 * far * near) / (near - far), 0,
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
  const xAxis = normalize(cross(up, zAxis));      // points to the camera's right
  const yAxis = cross(zAxis, xAxis);              // points to the camera's up

  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
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

      resolve(ctx.getImageData(
        0, 0,
        image.width,
        image.height
      ));
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
async function loadMaps(srcColor, srcDepth) {
  try {
    const [color, depth] = await Promise.all([
      loadImageData(srcColor),
      loadImageData(srcDepth)
    ]);

    // ImageData keeps its pixels in .data, so pass that along.
    noiseSheet = createResizedNoiseSheet(depth.data, depth.width, depth.height);
    colorSheet = createResizedColorSheet(color.data, color.width, color.height);
  } catch (error) {
    console.warn("Could not load maps", error);
  }
}

// NOISE STUFF
let noiseSheet = null;

// Position of our moving sampling window
let noiseOffsetX = 0;
let noiseOffsetY = 0;

let CAMERA_HEIGHT = 104;
let CAMERA_RADIUS = 64 * Math.SQRT2;   // same start spot as the old [64, 104, 64]
let cameraAngle = Math.PI / 4;

// If the tab was in the background, the next frame's deltaTime can be huge.
// Clamp it so nothing jumps.
const MAX_DELTA_TIME = 0.1;

// Height range of the cubes
const MIN_HEIGHT = 0.1;
const MAX_HEIGHT = 40.0;

function getAveragePixel(imageData, width, height, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;

      r += imageData[i];
      g += imageData[i + 1];
      b += imageData[i + 2];
      count++;
    }
  }

  return [
    r / count / 255,
    g / count / 255,
    b / count / 255
  ];
}

function createResizedNoiseSheet(imageData, width, height) {
  const values = new Float32Array(GRID_SIZE * GRID_SIZE);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {

      const x0 = Math.floor(x * width / GRID_SIZE);
      const x1 = Math.floor((x + 1) * width / GRID_SIZE);
      const y0 = Math.floor(y * height / GRID_SIZE);
      const y1 = Math.floor((y + 1) * height / GRID_SIZE);

      const avg = getAveragePixel(
        imageData, width, height, x0, y0, x1, y1
      );

      const index = y * GRID_SIZE + x;

      values[index] =
        0.333 * avg[0] +
        0.333 * avg[1] +
        0.333 * avg[2];
    }
  }

  return {
    width: GRID_SIZE,
    height: GRID_SIZE,

    sample: function(x, y) {
      return values[y * GRID_SIZE + x];
    }
  };
}

function createResizedColorSheet(imageData, width, height) {
  const colors = new Float32Array(GRID_SIZE * GRID_SIZE * 3);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {

      const x0 = Math.floor(x * width / GRID_SIZE);
      const x1 = Math.floor((x + 1) * width / GRID_SIZE);
      const y0 = Math.floor(y * height / GRID_SIZE);
      const y1 = Math.floor((y + 1) * height / GRID_SIZE);

      const avg = getAveragePixel(
        imageData, width, height, x0, y0, x1, y1
      );

      const index = (y * GRID_SIZE + x) * 3;

      colors[index] = avg[0];
      colors[index + 1] = avg[1];
      colors[index + 2] = avg[2];
    }
  }

  return {
    width: GRID_SIZE,
    height: GRID_SIZE,

    sampleInto: function(x, y, out) {
      const index = (y * GRID_SIZE + x) * 3;

      out[0] = colors[index];
      out[1] = colors[index + 1];
      out[2] = colors[index + 2];
    }
  };
}

// Filled in once the grass color map has loaded (null until then).
let colorSheet = null;

loadMaps("resources/grassground.png", "resources/grassground_depth.png");

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

  // Clear the screen to black (red, green, blue, alpha).
  gl.clearColor(0, 0, 0, 1);

  // Depth testing makes near cubes hide far cubes, no matter which
  // order we draw them in. Each frame we clear the depth info too.
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // The camera is the same for every cube, so set it once.
  const aspect = canvas.width / canvas.height;
  gl.uniformMatrix4fv(uProjection, false, perspective(Math.PI / 2, aspect, 0.1, 1000));

  // Orbit the camera around the Y axis using the angle that update() advances.
  const eye = [
    Math.sin(cameraAngle) * CAMERA_RADIUS,
    CAMERA_HEIGHT,
    Math.cos(cameraAngle) * CAMERA_RADIUS,
  ];
  gl.uniformMatrix4fv(uView, false, lookAt(eye, [0, 0, 0], [0, 1, 0]));

  // Draw every cube: same triangles each time, different uniforms.
  for (const cube of cubes) {
    // First stretch the cube to its height, then move it to its spot.
    // (In multiply(a, b), b happens first, so scaling goes on the right.)
    const model = multiply(
      translation(cube.x, 0, cube.z),
      scaling(1, cube.height, 1),
    );

    gl.uniformMatrix4fv(uModel, false, model);
    gl.uniform3fv(uColor, cube.color);
    gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);
  }
}

function update(deltaTime) {
  if (!noiseSheet) return;

  const offsetX = Math.floor(noiseOffsetX);
  const offsetY = Math.floor(noiseOffsetY);

  for (const cube of cubes) {
    const nx = (cube.col + offsetX) % noiseSheet.width;
    const ny = (cube.row + offsetY) % noiseSheet.height;

    const value = noiseSheet.sample(nx, ny);

    cube.height = MIN_HEIGHT + value * (MAX_HEIGHT - MIN_HEIGHT);

    if (colorSheet) {
      const cx = (cube.col + offsetX) % colorSheet.width;
      const cy = (cube.row + offsetY) % colorSheet.height;
      colorSheet.sampleInto(cx, cy, cube.color);
    }
  }
}

let lastTimestamp = null;

function frame(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;   // first frame: no time has passed

  const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA_TIME);
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

const radioButtons = document.querySelectorAll('input[name="image"]');

radioButtons.forEach((button) => {
  button.addEventListener("change", () => {
    const selectedImage = document.querySelector('input[name="image"]:checked').id;

    loadMaps(
      `resources/${selectedImage}.png`,
      `resources/${selectedImage}_depth.png`
    );
})})

const fileInput = document.getElementById("file-input");

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  loadMaps(
    URL.createObjectURL(file),
    URL.createObjectURL(file)
  );
})