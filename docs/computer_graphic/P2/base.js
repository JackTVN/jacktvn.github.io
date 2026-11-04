// ==========================================
// 1. SETTINGS
// ==========================================

const GRID_SIZE = 100;
const BLOCK_GAP = 0.05; // 5% gap

const MIN_HEIGHT = 0.1;
const HEIGHT_STRENGTH = 8.0;

// Target update/render frequency
const FPS = 60;
const FRAME_TIME = 1000 / FPS;

// ==========================================
// 2. NOISE AND COLOR SHEETS
// ==========================================

function createImageNoiseSheet(imageData, width, height) {
    return {
        width,
        height,

        sample: function(x, y) {
            const index = (y * width + x) * 4;

            const r = imageData[index];
            const g = imageData[index + 1];
            const b = imageData[index + 2];

            return (
                0.299 * r +
                0.587 * g +
                0.114 * b
            ) / 255;
        }
    };
}

function createArrayNoiseSheet(data) {
    return {
        width: data[0].length,
        height: data.length,

        sample: function(x, y) {
            return data[y][x];
        }
    };
}

function generateTestNoise(width, height) {
    return {
        width,
        height,

        sample: function(x, y) {
            return (
                0.5 +
                0.2 * Math.sin(x * 0.05) +
                0.15 * Math.cos(y * 0.08) +
                0.1 * Math.sin((x + y) * 0.03)
            );
        }
    };
}

// Noise animation
const NOISE_ANIMATION = {
    enabled: true,

    // How quickly we move across the noise map
    speedX: 5.0,
    speedY: 2.0,

    // Smoothness of transition
    transitionSpeed: 2.0
};

let noiseOffsetX = 0;
let noiseOffsetY = 0;

let targetNoiseOffsetX = 0;
let targetNoiseOffsetY = 0;

// Color image sheet
function createImageColorSheet(imageData, width, height) {
    return {
        width,
        height,

        sample: function(x, y) {
            const index = (y * width + x) * 4;

            return {
                r: imageData[index] / 255,
                g: imageData[index + 1] / 255,
                b: imageData[index + 2] / 255
            };
        }
    };
}

// Current maps
let noiseSheet = generateTestNoise(500, 500);
let colorSheet = null;

// ==========================================
// 3. WEBGL INITIALIZATION
// ==========================================

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 not supported");
}

// ==========================================
// 4. SHADERS
// ==========================================

const vertexShaderSource = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

layout(location = 2) in vec3 aInstancePosition;
layout(location = 3) in vec3 aInstanceColor;
layout(location = 4) in vec3 aInstanceScale;

uniform mat4 uView;
uniform mat4 uProjection;

out vec3 vColor;
out vec3 vNormal;

void main() {
    vec3 worldPosition =
        aPosition * aInstanceScale + aInstancePosition;

    gl_Position = uProjection * uView *
                  vec4(worldPosition, 1.0);

    vColor = aInstanceColor;

    // Correct normals for non-uniform scaling
    vNormal = normalize(aNormal / aInstanceScale);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vNormal;

out vec4 fragColor;

void main() {
    vec3 lightDir = normalize(vec3(-0.5, 1.0, 0.7));

    float diffuse = max(dot(vNormal, lightDir), 0.0);

    float lighting = 0.3 + diffuse * 0.7;

    fragColor = vec4(vColor * lighting, 1.0);
}
`;

function createShader(type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
}

const program = gl.createProgram();

gl.attachShader(program,
    createShader(gl.VERTEX_SHADER, vertexShaderSource));

gl.attachShader(program,
    createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));

gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
}

// ==========================================
// 5. CUBE GEOMETRY
// ==========================================

// 24 vertices: 4 vertices per face.
// This allows each face to have its own normal.

const vertices = new Float32Array([
    // Front (+Z)
    -0.5,0,0.5,  0,0,1,
     0.5,0,0.5,  0,0,1,
     0.5,1,0.5,  0,0,1,
    -0.5,1,0.5,  0,0,1,

    // Back (-Z)
     0.5,0,-0.5,  0,0,-1,
    -0.5,0,-0.5,  0,0,-1,
    -0.5,1,-0.5,  0,0,-1,
     0.5,1,-0.5,  0,0,-1,

    // Right (+X)
     0.5,0,0.5,  1,0,0,
     0.5,0,-0.5, 1,0,0,
     0.5,1,-0.5, 1,0,0,
     0.5,1,0.5,  1,0,0,

    // Left (-X)
    -0.5,0,-0.5, -1,0,0,
    -0.5,0,0.5,  -1,0,0,
    -0.5,1,0.5,  -1,0,0,
    -0.5,1,-0.5, -1,0,0,

    // Top (+Y)
    -0.5,1,0.5,  0,1,0,
     0.5,1,0.5,  0,1,0,
     0.5,1,-0.5, 0,1,0,
    -0.5,1,-0.5, 0,1,0,

    // Bottom (-Y)
    -0.5,0,-0.5, 0,-1,0,
     0.5,0,-0.5, 0,-1,0,
     0.5,0,0.5,  0,-1,0,
    -0.5,0,0.5,  0,-1,0
]);

const indices = new Uint16Array([
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    8,9,10, 8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23
]);

// ==========================================
// 6. SAMPLE MAPS
// ==========================================

function sampleSheet(sheet, gridX, gridY, offsetX = 0, offsetY = 0) {

    if (!sheet) return null;

    const x = Math.floor(
        gridX / (GRID_SIZE - 1) * (sheet.width - 1)
        + offsetX
    );

    const y = Math.floor(
        gridY / (GRID_SIZE - 1) * (sheet.height - 1)
        + offsetY
    );

    // Wrap around the noise map
    const wrappedX =
        ((x % sheet.width) + sheet.width) % sheet.width;

    const wrappedY =
        ((y % sheet.height) + sheet.height) % sheet.height;

    return sheet.sample(wrappedX, wrappedY);
}

// ==========================================
// 7. GENERATE INSTANCE DATA
// ==========================================

// 9 floats per instance:
// Position: 3
// Color:    3
// Scale:    3

const INSTANCE_STRIDE = 9;
const INSTANCE_COUNT = GRID_SIZE * GRID_SIZE + 1;

const instanceData = new Float32Array(
    INSTANCE_COUNT * INSTANCE_STRIDE
);

function rebuildInstances() {

    let index = 0;

    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {

            // Sample height map
            const noise = sampleSheet(noiseSheet, x, z) ?? 0;

            const height =
                MIN_HEIGHT + noise * HEIGHT_STRENGTH;

            // Sample color map
            const color = sampleSheet(colorSheet, x, z);

            // Default blue
            const r = color ? color.r : 0.2;
            const g = color ? color.g : 0.45;
            const b = color ? color.b : 0.9;

            // Position
            instanceData[index++] =
                x - (GRID_SIZE - 1) / 2;

            instanceData[index++] = 0;

            instanceData[index++] =
                z - (GRID_SIZE - 1) / 2;

            // Color
            instanceData[index++] = r;
            instanceData[index++] = g;
            instanceData[index++] = b;

            // Scale
            instanceData[index++] = 1 - BLOCK_GAP;
            instanceData[index++] = height;
            instanceData[index++] = 1 - BLOCK_GAP;
        }
    }

    // Last instance: ground
    instanceData[index++] = 0;
    instanceData[index++] = -0.1;
    instanceData[index++] = 0;

    instanceData[index++] = 0.25;
    instanceData[index++] = 0.25;
    instanceData[index++] = 0.25;

    instanceData[index++] = GRID_SIZE;
    instanceData[index++] = 0.1;
    instanceData[index++] = GRID_SIZE;

}

// ==========================================
// 8. VAO AND BUFFERS
// ==========================================

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const vertexBuffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

// Position
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);

// Normal
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

// Indices
const indexBuffer = gl.createBuffer();

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

// Instance buffer
const instanceBuffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

rebuildInstances();

gl.bufferData(
    gl.ARRAY_BUFFER,
    instanceData,
    gl.DYNAMIC_DRAW
);

// Instance position
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 0);
gl.vertexAttribDivisor(2, 1);

// Instance color
gl.enableVertexAttribArray(3);
gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 36, 12);
gl.vertexAttribDivisor(3, 1);

// Instance scale
gl.enableVertexAttribArray(4);
gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 36, 24);
gl.vertexAttribDivisor(4, 1);

gl.bindVertexArray(null);

// ==========================================
// 9. MATRIX UTILITIES
// ==========================================

function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);

    return new Float32Array([
        f/aspect,0,0,0,
        0,f,0,0,
        0,0,(far+near)*nf,-1,
        0,0,2*far*near*nf,0
    ]);
}

function lookAt(eye, target, up) {
    const normalize = v => {
        const l = Math.hypot(...v);
        return v.map(x => x/l);
    };

    const subtract = (a,b) =>
        a.map((v,i) => v-b[i]);

    const cross = (a,b) => [
        a[1]*b[2]-a[2]*b[1],
        a[2]*b[0]-a[0]*b[2],
        a[0]*b[1]-a[1]*b[0]
    ];

    const dot = (a,b) =>
        a.reduce((s,v,i) => s+v*b[i], 0);

    const z = normalize(subtract(eye,target));
    const x = normalize(cross(up,z));
    const y = cross(z,x);

    return new Float32Array([
        x[0],y[0],z[0],0,
        x[1],y[1],z[1],0,
        x[2],y[2],z[2],0,
        -dot(x,eye),-dot(y,eye),-dot(z,eye),1
    ]);
}

// ==========================================
// 10. UPDATE LOOP
// ==========================================

let elapsedTime = 0;
let cameraAngle = 0;

function updateTerrainHeights() {

    let index = 0;

    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {

            const noise = sampleSheet(
                noiseSheet,
                x,
                z,
                noiseOffsetX,
                noiseOffsetY
            ) ?? 0;

            const height =
                MIN_HEIGHT + noise * HEIGHT_STRENGTH;

            // Skip position
            index += 3;

            // Skip color
            index += 3;

            // Update scale
            instanceData[index++] = 1;
            instanceData[index++] = height;
            instanceData[index++] = 1;
        }
    }

    // Upload updated instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

    gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        instanceData
    );
}

function update(deltaTime) {

    elapsedTime += deltaTime;

    cameraAngle += deltaTime * 0.15;
}

// ==========================================
// 11. RENDER LOOP
// ==========================================

const uView = gl.getUniformLocation(program, "uView");
const uProjection = gl.getUniformLocation(program, "uProjection");

gl.enable(gl.DEPTH_TEST);

function render() {

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor(0.12, 0.14, 0.17, 1);

    gl.clear(
        gl.COLOR_BUFFER_BIT |
        gl.DEPTH_BUFFER_BIT
    );

    gl.useProgram(program);

    const projection = perspective(
        Math.PI / 4,
        canvas.width / canvas.height,
        0.1,
        500
    );

    const distance = 100;

    const view = lookAt(
        [
            Math.cos(cameraAngle) * distance,
            60,
            Math.sin(cameraAngle) * distance
        ],
        [0, 0, 0],
        [0, 1, 0]
    );

    gl.uniformMatrix4fv(uProjection, false, projection);
    gl.uniformMatrix4fv(uView, false, view);

    gl.bindVertexArray(vao);

    gl.drawElementsInstanced(
        gl.TRIANGLES,
        36,
        gl.UNSIGNED_SHORT,
        0,
        INSTANCE_COUNT
    );

    gl.bindVertexArray(null);
}

// ==========================================
// 12. FIXED 60 FPS SCHEDULER
// ==========================================

let previousTime = 0;
let accumulator = 0;

function loop(timestamp) {

    if (!previousTime) previousTime = timestamp;

    let frameDelta = timestamp - previousTime;
    previousTime = timestamp;

    frameDelta = Math.min(frameDelta, 250);
    accumulator += frameDelta;

    let updated = false;

    while (accumulator >= FRAME_TIME) {
        update(FRAME_TIME / 1000);
        accumulator -= FRAME_TIME;
        updated = true;
    }

    if (updated) {
        render();
    }

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);