class SceneObject {
  constructor(gl, objStr, objConfig, material) {
    this.gl = gl;
    this.mesh = new OBJ.Mesh(objStr);
    OBJ.initMeshBuffers(gl, this.mesh);

    this.rotation = [
      objConfig.rotation.x,
      objConfig.rotation.y,
      objConfig.rotation.z,
    ];
    this.position = [
      objConfig.position.x,
      objConfig.position.y,
      objConfig.position.z,
    ];
    this.scale = [objConfig.scale.x, objConfig.scale.y, objConfig.scale.z];
    this.curve = objConfig.isMovingAlongCurve;

    if (material) {
      this.color = material.diffuse || [1.0, 1.0, 1.0];
      this.ka = (material.ambient && material.ambient[0]) || 0.1;
      this.kd = (material.diffuse && material.diffuse[0]) || 0.6;
      this.ks = (material.specular && material.specular[0]) || 0.3;
      this.shininess = material.shininess || 32.0;

      if (material.texture) {
        this.texture = loadTexture(gl, material.texture);
      }
    } else {
      this.color = [1.0, 0.5, 0.31];
      this.ka = 0.5;
      this.kd = 0.7;
      this.ks = 0.9;
      this.shininess = 32.0;
    }
  }

  // Method to draw the object
  draw(programInfo) {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.vertexBuffer);
    gl.vertexAttribPointer(
      programInfo.attribLocations.vertexPosition,
      3,
      gl.FLOAT,
      false,
      0,
      0
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    if (this.mesh.normalBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.normalBuffer);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexNormal,
        3,
        gl.FLOAT,
        false,
        0,
        0
      );
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
    }

    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(programInfo.uniformLocations.uSampler, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indexBuffer);

    const ambient = gl.getUniformLocation(programInfo.program, "uKa");
    const diffuse = gl.getUniformLocation(programInfo.program, "uKd");
    const specular = gl.getUniformLocation(programInfo.program, "uKs");
    const shininess = gl.getUniformLocation(programInfo.program, "uShininess");
    const isSelected = gl.getUniformLocation(
      programInfo.program,
      "uIsSelected"
    );
    const objectColor = gl.getUniformLocation(
      programInfo.program,
      "uObjectColor"
    );

    gl.uniform3fv(objectColor, this.color);
    gl.uniform1f(ambient, this.ka);
    gl.uniform1f(diffuse, this.kd);
    gl.uniform1f(specular, this.ks);
    gl.uniform1f(shininess, this.shininess);
    gl.uniform1f(isSelected, false);

    gl.drawElements(
      gl.TRIANGLES,
      this.mesh.indexBuffer.numItems,
      gl.UNSIGNED_SHORT,
      0
    );
  }
}

class MTLParser {
  constructor() {
    this.materials = {};
  }

  parse(mtlFileContent) {
    const lines = mtlFileContent.split("\n");
    let currentMaterial = null;

    lines.forEach((line) => {
      line = line.trim();
      const parts = line.split(/\s+/);
      const type = parts[0];

      switch (type) {
        case "newmtl":
          currentMaterial = parts[1];
          this.materials[currentMaterial] = {};
          break;
        case "Kd":
          if (currentMaterial) {
            this.materials[currentMaterial].diffuse = parts
              .slice(1)
              .map(parseFloat);
          }
          break;
        case "Ka":
          if (currentMaterial) {
            this.materials[currentMaterial].ambient = parts
              .slice(1)
              .map(parseFloat);
          }
          break;
        case "Ks":
          if (currentMaterial) {
            this.materials[currentMaterial].specular = parts
              .slice(1)
              .map(parseFloat);
          }
          break;
        case "Ns":
          if (currentMaterial) {
            this.materials[currentMaterial].shininess = parseFloat(parts[1]);
          }
          break;
        case "map_Kd":
          if (currentMaterial) {
            this.materials[currentMaterial].texture = parts[1];
          }
          break;
      }
    });

    return this.materials;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed");

  const canvas = document.getElementById("glcanvas");
  resizeCanvas(canvas);
  window.addEventListener("resize", () => resizeCanvas(canvas));

  const gl = canvas.getContext("webgl");

  if (!gl) {
    console.error("WebGL not supported, falling back on experimental-webgl");
    gl = canvas.getContext("experimental-webgl");
  }

  if (!gl) {
    alert("Your browser does not support WebGL");
    return;
  }

  console.log("WebGL context obtained");

  // Vertex and Fragment shader programs (unchanged)
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec3 aVertexNormal;

    uniform mat4 uNormalMatrix;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uViewMatrix;

    varying vec3 vNormal;
    varying vec3 vFragPos;
    varying vec2 vTextureCoord;

    void main(void) {
      vec4 fragPos = uModelViewMatrix * aVertexPosition;
      vFragPos = fragPos.xyz;
      vNormal = mat3(uNormalMatrix) * aVertexNormal;
      gl_Position = uProjectionMatrix * uViewMatrix * fragPos;
      vTextureCoord = aVertexPosition.xy;  // Assuming you use XYZ world positions as coordinates for simplicity
    }
  `;

  const fsSource = `
    precision highp float;

    varying vec3 vNormal;
    varying vec3 vFragPos;
    varying vec2 vTextureCoord;  // Add texture coordinate varying
    
    uniform vec3 uLightPosition;
    uniform vec3 uLightColor;
    uniform vec3 uViewPosition;
    
    uniform vec3 uObjectColor;
    uniform bool uHasTexture;
    uniform sampler2D uSampler;  // Add texture sampler
    
    uniform float uKa; 
    uniform float uKd; 
    uniform float uKs; 
    uniform float uShininess;
    uniform bool uIsSelected; 
    
    void main(void) {
      vec3 norm = normalize(vNormal);
      vec3 lightDir = normalize(uLightPosition - vFragPos);
    
      vec3 ambient = uKa * uLightColor;
      float diff = max(dot(norm, lightDir), 0.0);
      vec3 diffuse = uKd * diff * uLightColor;
    
      vec3 viewDir = normalize(-vFragPos);
      vec3 reflectDir = reflect(-lightDir, norm);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
      vec3 specular = uKs * spec * uLightColor;
    
      vec3 finalColor = uObjectColor;
      if (uIsSelected) {
        finalColor = vec3(1.0, 0.0, 0.0);
      }
    
      if (uHasTexture) {
        vec4 texColor = texture2D(uSampler, vTextureCoord);
        finalColor = texColor.rgb;
      }
    
      vec3 result = (ambient + diffuse + specular) * finalColor;
      gl_FragColor = vec4(result, 1.0);
    }
  `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
      vertexNormal: gl.getAttribLocation(shaderProgram, "aVertexNormal"),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(
        shaderProgram,
        "uProjectionMatrix"
      ),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
      viewMatrix: gl.getUniformLocation(shaderProgram, "uViewMatrix"),
      normalMatrix: gl.getUniformLocation(shaderProgram, "uNormalMatrix"),
      lightPosition: gl.getUniformLocation(shaderProgram, "uLightPosition"),
      lightColor: gl.getUniformLocation(shaderProgram, "uLightColor"),
      viewPosition: gl.getUniformLocation(shaderProgram, "uViewPosition"),
      objectColor: gl.getUniformLocation(shaderProgram, "uObjectColor"),
      shininess: gl.getUniformLocation(shaderProgram, "uShininess"),
      isSelected: gl.getUniformLocation(shaderProgram, "uIsSelected"),
      ka: gl.getUniformLocation(shaderProgram, "uKa"),
      kd: gl.getUniformLocation(shaderProgram, "uKd"),
      ks: gl.getUniformLocation(shaderProgram, "uKs"),
    },
  };

  console.log("Shader program initialized");

  const objects = [];

  let cameraPosX = 0.0,
    cameraPosY = 0.0,
    cameraPosZ = 0.0;
  let cameraViewX = 0.0,
    cameraViewY = 0.0,
    cameraViewZ = 0.0;
  let fov = 45,
    zNear = 0.1,
    zFar = 100.0;

  const fileInput = document.getElementById("fileInput");
  const processButton = document.getElementById("processFiles");

  let fileContents = [];

  processButton.addEventListener("click", () => {
    const files = fileInput.files;
    if (files.length < 2) {
      alert("Please select at least a JSON and OBJ file.");
      return;
    }

    fileContents = [];

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        fileContents[index] = {
          name: file.name,
          content: event.target.result,
        };

        if (fileContents.length === files.length) {
          let configFileContent;
          const objFiles = {};
          const mtlFiles = {};

          fileContents.forEach((fileContent) => {
            if (fileContent.name.endsWith(".json")) {
              configFileContent = JSON.parse(fileContent.content);
            } else if (fileContent.name.endsWith(".obj")) {
              objFiles[fileContent.name] = fileContent.content;
            } else if (fileContent.name.endsWith(".mtl")) {
              mtlFiles[fileContent.name] = fileContent.content;
            }
          });

          const mtlParser = new MTLParser();
          const materials = {};

          for (const mtlFileName in mtlFiles) {
            const parsedMaterials = mtlParser.parse(mtlFiles[mtlFileName]);
            Object.assign(materials, parsedMaterials);
          }

          configFileContent.objects.forEach((objConfig) => {
            let objFileContent = objFiles[objConfig.file];
            if (objFileContent) {
              const materialName = objConfig.materialName;
              const material = materialName ? materials[materialName] : null;
              objects.push(
                new SceneObject(gl, objFileContent, objConfig, material)
              );
            }
          });

          const camera = configFileContent.camera;
          const frustum = configFileContent.frustum;

          cameraPosX = camera.position.x;
          cameraPosY = camera.position.y;
          cameraPosZ = camera.position.z;

          cameraViewX = camera.viewDirection.x;
          cameraViewY = camera.viewDirection.y;
          cameraViewZ = camera.viewDirection.z;

          fov = frustum.fieldOfView;
          zNear = frustum.nearPlane;
          zFar = frustum.farPlane;
        }
      };

      reader.readAsText(file);
    });
  });

  const curve = {
    controlPoints: [],
    curvePoints: [],
    M: mat4.create(),
  };

  generateElipseControlPoints(20, curve.controlPoints);
  let numCurvePoints = 100;
  generateBezierCurvePoints(curve, numCurvePoints);
  let index = 0;

  console.log("Objects loaded:", objects);

  let selectedObject = 0;

  document.addEventListener("keydown", (event) => {
    if (event.code === "ArrowRight") {
      selectedObject = (selectedObject + 1) % objects.length;
    } else if (event.code === "ArrowLeft") {
      selectedObject = (selectedObject - 1 + objects.length) % objects.length;
    }
    console.log(`Selected Object: ${selectedObject}`);
  });

  const lightPosition = [2.0, 2.0, 2.0];
  const lightColor = [1.0, 1.0, 1.0];
  const objectColor = [1.0, 0.5, 0.31];
  const shininess = 32.0;

  gl.useProgram(programInfo.program);
  gl.uniform3fv(programInfo.uniformLocations.lightPosition, lightPosition);
  gl.uniform3fv(programInfo.uniformLocations.lightColor, lightColor);
  gl.uniform3fv(programInfo.uniformLocations.objectColor, objectColor);
  gl.uniform1f(programInfo.uniformLocations.shininess, shininess);

  const sliders = document.querySelectorAll("input[type='range']");
  sliders.forEach((slider) => {
    slider.addEventListener("input", function () {
      const sliderId = slider.id;
      const obj = objects[selectedObject];
      if (sliderId === "moveX") obj.position[0] = parseFloat(slider.value);
      if (sliderId === "moveY") obj.position[1] = parseFloat(slider.value);
      if (sliderId === "moveZ") obj.position[2] = parseFloat(slider.value);
      if (sliderId === "rotateX") obj.rotation[0] = parseFloat(slider.value);
      if (sliderId === "rotateY") obj.rotation[1] = parseFloat(slider.value);
      if (sliderId === "rotateZ") obj.rotation[2] = parseFloat(slider.value);
      if (sliderId === "scaleX") obj.scale[0] = parseFloat(slider.value);
      if (sliderId === "scaleY") obj.scale[1] = parseFloat(slider.value);
      if (sliderId === "scaleZ") obj.scale[2] = parseFloat(slider.value);
      if (sliderId == "cameraPosX") cameraPosX = parseFloat(slider.value);
      if (sliderId == "cameraPosY") cameraPosY = parseFloat(slider.value);
      if (sliderId == "cameraPosZ") cameraPosZ = parseFloat(slider.value);
      if (sliderId == "cameraViewX") cameraViewX = parseFloat(slider.value);
      if (sliderId == "cameraViewY") cameraViewY = parseFloat(slider.value);
      if (sliderId == "cameraViewZ") cameraViewZ = parseFloat(slider.value);
      if (sliderId == "lightKs") obj.ks = parseFloat(slider.value);
      if (sliderId == "lightKa") obj.ka = parseFloat(slider.value);
      if (sliderId == "lightKd") obj.kd = parseFloat(slider.value);
    });
  });

  function render() {
    drawScene(
      gl,
      programInfo,
      objects,
      cameraPosX,
      cameraPosY,
      cameraPosZ,
      cameraViewX,
      cameraViewY,
      cameraViewZ,
      fov,
      zNear,
      zFar,
      selectedObject
    );
    gl.useProgram(programInfo.program);

    objects.forEach((object) => {
      gl.uniform1i(
        gl.getUniformLocation(shaderProgram, "uHasTexture"),
        object.texture ? 1 : 0
      );
      object.draw(programInfo);
    });
    tick();
    requestAnimationFrame(render);
  }

  function tick() {
    if (objects.length > 0) {
      for (let obj of objects) {
        if (obj.curve) {
          index = moveObjectInCurve(obj, curve, index);
        }
      }
    }
  }

  requestAnimationFrame(render);
});

function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error(
      "Unable to initialize the shader program: " +
        gl.getProgramInfoLog(shaderProgram)
    );
    return null;
  }

  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function loadTexture(gl, url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Temporary pixel while the texture is loaded
  const pixel = new Uint8Array([255, 255, 255, 255]);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel
  );

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // WebGL parameters for texture
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };
  image.src = url;

  return texture;
}

function drawScene(
  gl,
  programInfo,
  objects,
  cameraPosX,
  cameraPosY,
  cameraPosZ,
  cameraViewX,
  cameraViewY,
  cameraViewZ,
  fov,
  zNear,
  zFar,
  selectedObject
) {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const projectionMatrix = mat4.create();
  mat4.perspective(
    projectionMatrix,
    (fov * Math.PI) / 180,
    gl.canvas.clientWidth / gl.canvas.clientHeight,
    zNear,
    zFar
  );

  const viewMatrix = mat4.create();
  mat4.lookAt(
    viewMatrix,
    [cameraPosX, cameraPosY, cameraPosZ],
    [cameraViewX, cameraViewY, cameraViewZ],
    [0, 1, 0]
  );

  gl.useProgram(programInfo.program);
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  );
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.viewMatrix,
    false,
    viewMatrix
  );

  objects.forEach((obj, index) => {
    const isSelected = index === selectedObject;
    gl.uniform1i(programInfo.uniformLocations.isSelected, isSelected ? 1 : 0);

    gl.uniform3fv(programInfo.uniformLocations.objectColor, obj.color);
    gl.uniform1f(programInfo.uniformLocations.ka, obj.ka);
    gl.uniform1f(programInfo.uniformLocations.kd, obj.kd);
    gl.uniform1f(programInfo.uniformLocations.ks, obj.ks);
    gl.uniform1f(programInfo.uniformLocations.shininess, obj.shininess);

    const modelViewMatrix = mat4.create();
    mat4.translate(modelViewMatrix, modelViewMatrix, obj.position);
    mat4.rotateX(
      modelViewMatrix,
      modelViewMatrix,
      (obj.rotation[0] * Math.PI) / 180.0
    );
    mat4.rotateY(
      modelViewMatrix,
      modelViewMatrix,
      (obj.rotation[1] * Math.PI) / 180.0
    );
    mat4.rotateZ(
      modelViewMatrix,
      modelViewMatrix,
      (obj.rotation[2] * Math.PI) / 180.0
    );
    mat4.scale(modelViewMatrix, modelViewMatrix, obj.scale);

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, modelViewMatrix);
    mat4.transpose(normalMatrix, normalMatrix);

    gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix
    );
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.normalMatrix,
      false,
      normalMatrix
    );

    {
      const vertexPosition = obj.mesh.vertexBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosition);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        3,
        gl.FLOAT,
        false,
        0,
        0
      );
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    {
      const vertexNormal = obj.mesh.normalBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexNormal);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexNormal,
        3,
        gl.FLOAT,
        false,
        0,
        0
      );
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
    }

    {
      const indexBuffer = obj.mesh.indexBuffer;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.drawElements(
        gl.TRIANGLES,
        obj.mesh.indexBuffer.numItems,
        gl.UNSIGNED_SHORT,
        0
      );
    }
  });
}

function resizeCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const gl = canvas.getContext("webgl");
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function generateElipseControlPoints(numPoints, controlPoints) {
  const step = (2.0 * 3.14159) / (numPoints - 1.0);
  const a = 2;
  const b = 1;

  for (let i = 0; i < numPoints; i++) {
    const t = i * step;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    const point = vec3.fromValues(x, y, 0.0);
    controlPoints.push(point);
  }
}

function initializeBernsteinMatrix(matrix) {
  mat4.set(
    matrix,
    -1.0,
    3.0,
    -3.0,
    1.0,
    3.0,
    -6.0,
    3.0,
    0.0,
    -3.0,
    3.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0
  );
}

function generateBezierCurvePoints(curve, numPoints) {
  curve.curvePoints = []; // Limpa quaisquer pontos antigos da curva

  initializeBernsteinMatrix(curve.M);
  // Calcular os pontos ao longo da curva com base em Bernstein
  // Loop sobre os pontos de controle em grupos de 4

  let piece = 1.0 / numPoints;

  for (let i = 0; i < curve.controlPoints.length - 3; i += 3) {
    // Gera pontos para o segmento atual
    for (let j = 0; j <= numPoints; j++) {
      let t = j * piece;

      // Vetor t para o polinômio de Bernstein
      vecT = vec4.create();
      vec4.set(vecT, t * t * t, t * t, t, 1);
      let P0 = vec3.clone(curve.controlPoints[i]);
      let P1 = vec3.clone(curve.controlPoints[i + 1]);
      let P2 = vec3.clone(curve.controlPoints[i + 2]);
      let P3 = vec3.clone(curve.controlPoints[i + 3]);

      const G = [P0, P1, P2, P3];

      // Multiplica a matriz de bernstein com o vetor T
      let result1 = vec4.create();
      vec4.transformMat4(result1, vecT, curve.M);

      // Calcula o ponto da curva multiplicando o resultado de cima com os pontos de controle G
      let point = vec3.create();
      multiplyVec4ByMat4x3(G, result1, point);

      curve.curvePoints.push(point);
    }
  }

  console.log(curve.curvePoints);

  // Conectar o último ponto ao primeiro ponto suavemente
  let lastPoint = curve.curvePoints[curve.curvePoints.length - 1];
  let firstPoint = curve.curvePoints[0];

  let additionalPoints = 20;
  // Gerar pontos adicionais entre o último e o primeiro ponto
  for (let i = 1; i <= additionalPoints; i++) {
    let t = i / additionalPoints; // Variar t de 0 a 1
    let intermediatePoint = vec3.create();

    // Interpolação linear entre o último e o primeiro ponto
    vec3.lerp(intermediatePoint, lastPoint, firstPoint, t);
    curve.curvePoints.push(intermediatePoint);
  }
}

// Multiplica um vetor 4D pela matriz 4x3
function multiplyVec4ByMat4x3(mat4x3, vec, resultVec) {
  // Matriz resultado 1x3
  let result = [0, 0, 0];

  // Multiplicando a matriz 1x4 por 4x3
  for (let j = 0; j < 3; j++) {
    for (let k = 0; k < 4; k++) {
      result[j] += vec[k] * mat4x3[k][j];
    }
  }

  vec3.set(resultVec, result[0], result[1], result[2]);
}

function moveObjectInCurve(object, curve, index) {
  let nextPos = vec3.clone(curve.curvePoints[index]);

  object.position[0] = nextPos[0];
  object.position[1] = nextPos[1];
  object.position[2] = nextPos[2];

  index++;
  if (index >= curve.curvePoints.length) {
    index = 0;
  }

  return index;
}
