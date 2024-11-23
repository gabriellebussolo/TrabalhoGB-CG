document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');

  const canvas = document.getElementById('glcanvas');
  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));

  const gl = canvas.getContext('webgl');

  if (!gl) {
    console.error('WebGL not supported, falling back on experimental-webgl');
    gl = canvas.getContext('experimental-webgl');
  }

  if (!gl) {
    alert('Your browser does not support WebGL');
    return;
  }

  console.log('WebGL context obtained');

  // Vertex shader program
  const vsSource = `
          attribute vec4 aVertexPosition;
          attribute vec3 aVertexNormal;
  
          uniform mat4 uNormalMatrix;
          uniform mat4 uModelViewMatrix;
          uniform mat4 uProjectionMatrix;
          uniform mat4 uViewMatrix;
  
          varying vec3 vNormal;
          varying vec3 vFragPos;
  
          void main(void) {
            vec4 fragPos = uModelViewMatrix * aVertexPosition;
            vFragPos = fragPos.xyz;
            vNormal = mat3(uNormalMatrix) * aVertexNormal;
            gl_Position = uProjectionMatrix * uViewMatrix * fragPos;
        }
    `;

  // Fragment shader program
  const fsSource = `
        precision highp float;
  
        varying vec3 vNormal;
        varying vec3 vFragPos;
  
        uniform vec3 uLightPosition;
        uniform vec3 uLightColor;
        uniform vec3 uViewPosition;
  
        uniform vec3 uObjectColor;
        uniform float uShininess;
        uniform bool uIsSelected; 
  
        uniform float uKa; 
        uniform float uKd; 
        uniform float uKs; 

        void main(void) {
            vec3 norm = normalize(vNormal);
            vec3 lightDir = normalize(uLightPosition - vFragPos);

            // Componente Ambiente
            vec3 ambient = uKa * uLightColor;

            // Componente Difuso
            float diff = max(dot(norm, lightDir), 0.0);
            vec3 diffuse = uKd * diff * uLightColor;

            // Componente Especular
            vec3 viewDir = normalize(-vFragPos);
            vec3 reflectDir = reflect(-lightDir, norm);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
            vec3 specular = uKs * spec * uLightColor;

            // Cor do objeto e combinação dos componentes
            vec3 finalColor = uObjectColor;
            if (uIsSelected) {
                finalColor = vec3(1.0, 0.0, 0.0); // Cor vermelha para o objeto selecionado
            }
              
            // Combinação dos componentes
            vec3 result = (ambient + diffuse + specular) * finalColor;
            gl_FragColor = vec4(result, 1.0);
        }

    `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(
        shaderProgram,
        'uProjectionMatrix'
      ),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      viewMatrix: gl.getUniformLocation(shaderProgram, 'uViewMatrix'),
      normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
      lightPosition: gl.getUniformLocation(shaderProgram, 'uLightPosition'),
      lightColor: gl.getUniformLocation(shaderProgram, 'uLightColor'),
      viewPosition: gl.getUniformLocation(shaderProgram, 'uViewPosition'),
      objectColor: gl.getUniformLocation(shaderProgram, 'uObjectColor'),
      shininess: gl.getUniformLocation(shaderProgram, 'uShininess'),
      isSelected: gl.getUniformLocation(shaderProgram, 'uIsSelected'),
    },
  };

  console.log('Shader program initialized');

  // Object structure and initial object load
  const objects = [];

  class SceneObject {
    constructor(gl, objStr) {
      this.mesh = new OBJ.Mesh(objStr);
      OBJ.initMeshBuffers(gl, this.mesh);
      this.rotation = [0, 0, 0];
      this.position = [0, 0, 0];
      this.scale = [1, 1, 1];
      this.color = [1.0, 0.5, 0.31];
    }
  }

  // Example OBJ string data
  const objStr1 = [
    'v 1.0 -1.0  1.0',
    'v 1.0 -1.0 -1.0',
    'v -1.0 -1.0 -1.0',
    'v -1.0 -1.0  1.0',
    'v 1.0  1.0  1.0',
    'v 1.0  1.0 -1.0',
    'v -1.0  1.0 -1.0',
    'v -1.0  1.0  1.0',
    'vn 0.0 -1.0 0.0',
    'vn 0.0  1.0 0.0',
    'vn 1.0  0.0 0.0',
    'vn -1.0  0.0 0.0',
    'vn 0.0  0.0 1.0',
    'vn 0.0  0.0 -1.0',
    'f 1//1 2//1 3//1',
    'f 1//1 3//1 4//1',
    'f 5//2 8//2 7//2',
    'f 5//2 7//2 6//2',
    'f 1//3 5//3 6//3',
    'f 1//3 6//3 2//3',
    'f 2//6 6//6 7//6',
    'f 2//6 7//6 3//6',
    'f 3//4 7//4 8//4',
    'f 3//4 8//4 4//4',
    'f 4//5 8//5 5//5',
    'f 4//5 5//5 1//5',
  ].join('\n');

  const objStr2 = [
    // Vértices
    'v  0.0  1.0  0.0',
    'v -1.0 -1.0 -1.0',
    'v  1.0 -1.0 -1.0',
    'v  1.0 -1.0  1.0',
    'v -1.0 -1.0  1.0',
    'vn  0.0  0.4472 -0.8944',
    'vn  0.8944  0.4472  0.0',
    'vn -0.8944  0.4472  0.0',
    'vn  0.0 -1.0  0.0',
    'f 1//1 2//1 3//1',
    'f 1//2 3//2 4//2',
    'f 1//3 4//3 5//3',
    'f 2//4 5//4 4//4',
    'f 2//4 4//4 3//4',
  ].join('\n');

  const curve = {
    controlPoints: [], // Pontos de controle da curva
    curvePoints: [], // Pontos da curva
    M: mat4.create(), // Matriz dos coeficientes da curva
  };

  // Gera pontos de controle da curva
  generateInfiniteControlPoints(20, curve.controlPoints);

  // Gera pontos da curva de Bézier
  let numCurvePoints = 100; // Quantidade de pontos por segmento na curva
  generateBezierCurvePoints(curve, numCurvePoints);

  // Variaveis para movimentar o objeto na tela
  let index = 0;

  // Carregar os objetos
  objects.push(new SceneObject(gl, objStr1)); // Cubo
  objects.push(new SceneObject(gl, objStr2)); // Triângulo

  // Definir cores para cada objeto
  objects[0].color = [1.0, 0.5, 0.31]; // Cor para o cubo (laranja)
  objects[1].color = [0.0, 1.0, 0.0]; // Cor para o triângulo (verde)

  // Posicionar os objetos separadamente
  objects[0].position = [-1.5, 0.0, 0.0]; // Cubo à esquerda
  objects[1].position = [1.5, 0.0, 0.0]; // Triângulo à direita

  console.log('Objects loaded:', objects);

  let selectedObject = 0;

  // Listen for key presses to change selected object
  document.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowRight') {
      selectedObject = (selectedObject + 1) % objects.length;
    } else if (event.code === 'ArrowLeft') {
      selectedObject = (selectedObject - 1 + objects.length) % objects.length;
    }
    console.log(`Selected Object: ${selectedObject}`);
  });

  // Variables for camera position and view movement
  let cameraPosX = 0.0,
    cameraPosY = 0.0,
    cameraPosZ = 10.0;

  let cameraViewX = 0.0,
    cameraViewY = 0.0,
    cameraViewZ = 0.0;

  // Set light properties
  gl.useProgram(programInfo.program);

  const lightPosition = [2.0, 2.0, 2.0]; // Light position in view space
  const lightColor = [1.0, 1.0, 1.0]; // White light color

  const objectColor = [1.0, 0.5, 0.31]; // Object color
  const shininess = 32.0; // Shininess factor

    // Adicionar localizações para Ka, Kd e Ks
  programInfo.uniformLocations.ka = gl.getUniformLocation(shaderProgram, "uKa");
  programInfo.uniformLocations.kd = gl.getUniformLocation(shaderProgram, "uKd");
  programInfo.uniformLocations.ks = gl.getUniformLocation(shaderProgram, "uKs");

  // Configurar os valores de Ka, Kd e Ks
  var ka = 0.5;
  var kd = 0.5; 
  var ks = 0.5; 

  gl.useProgram(programInfo.program);
  gl.uniform1f(programInfo.uniformLocations.ka, ka);
  gl.uniform1f(programInfo.uniformLocations.kd, kd);
  gl.uniform1f(programInfo.uniformLocations.ks, ks);


  // Set uniforms
  gl.uniform3fv(programInfo.uniformLocations.lightPosition, lightPosition);
  gl.uniform3fv(programInfo.uniformLocations.lightColor, lightColor);
  gl.uniform3fv(programInfo.uniformLocations.objectColor, objectColor);
  gl.uniform1f(programInfo.uniformLocations.shininess, shininess);

  const sliders = document.querySelectorAll("input[type='range']");

  sliders.forEach((slider) => {
    slider.addEventListener('input', function () {
      const sliderId = slider.id;
      const obj = objects[selectedObject];
      if (sliderId === 'moveX') obj.position[0] = parseFloat(slider.value);
      if (sliderId === 'moveY') obj.position[1] = parseFloat(slider.value);
      if (sliderId === 'moveZ') obj.position[2] = parseFloat(slider.value);
      if (sliderId === 'rotateX') obj.rotation[0] = parseFloat(slider.value);
      if (sliderId === 'rotateY') obj.rotation[1] = parseFloat(slider.value);
      if (sliderId === 'rotateZ') obj.rotation[2] = parseFloat(slider.value);
      if (sliderId === 'scaleX') obj.scale[0] = parseFloat(slider.value);
      if (sliderId === 'scaleY') obj.scale[1] = parseFloat(slider.value);
      if (sliderId === 'scaleZ') obj.scale[2] = parseFloat(slider.value);
      if (sliderId == 'cameraPosX') cameraPosX = parseFloat(slider.value);
      if (sliderId == 'cameraPosY') cameraPosY = parseFloat(slider.value);
      if (sliderId == 'cameraPosZ') cameraPosZ = parseFloat(slider.value);
      if (sliderId == 'cameraViewX') cameraViewX = parseFloat(slider.value);
      if (sliderId == 'cameraViewY') cameraViewY = parseFloat(slider.value);
      if (sliderId == 'cameraViewZ') cameraViewZ = parseFloat(slider.value);
      if (sliderId == 'lightKs') ks = parseFloat(slider.value);
      if (sliderId == 'lightKa') ka = parseFloat(slider.value);
      if (sliderId == 'lightKd') kd = parseFloat(slider.value);
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
      ka,
      ks,
      kd,
      45,
      0.1,
      100.0,
      selectedObject
    );
    index = moveObjectInCurve(objects[0], curve, index);
    requestAnimationFrame(render);
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
      'Unable to initialize the shader program: ' +
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
      'An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
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
  ka,
  ks,
  kd,
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

  // Atualizar os valores Ka, Kd, Ks no shader
  gl.uniform1f(programInfo.uniformLocations.ka, ka);
  gl.uniform1f(programInfo.uniformLocations.kd, kd);
  gl.uniform1f(programInfo.uniformLocations.ks, ks);

  objects.forEach((obj, index) => {
    const isSelected = index === selectedObject;
    gl.uniform1i(programInfo.uniformLocations.isSelected, isSelected ? 1 : 0);

    // Definir a cor do objeto
    gl.uniform3fv(programInfo.uniformLocations.objectColor, obj.color);

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

    // Configure position buffers
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

    // Configure normal buffers
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

    // Draw the object
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
  const gl = canvas.getContext('webgl');
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function generateInfiniteControlPoints(numPoints, controlPoints) {
  // Define o intervalo para t: de 0 a 2 * PI, dividido em numPoints
  step = (2.0 * 3.14159) / (numPoints - 1.0);

  let scale = 1;

  for (let i = 0; i < numPoints - 1; i++) {
    let t = i * step;

    // Calcula x(t) e y(t) usando as fórmulas paramétricas
    x = (scale * Math.cos(t)) / (Math.sin(t) ** 2 + 1);
    y = (scale * Math.sin(t) * Math.cos(t)) / (Math.sin(t) ** 2 + 1);

    // Aumenta o X e Y para a curva ficar maior e melhor de visualizar
    x *= 2.0;
    y *= 2.0;
    y += 0.15;

    point = vec3.create();
    vec3.set(point, x, y, 0.0);

    // Adiciona o ponto ao vetor de pontos de controle
    controlPoints.push(point);
  }
  controlPoints.push(controlPoints[0]);
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
    for (let j = 0; j < numPoints; j++) {
      let t = j * piece;

      // Vetor t para o polinômio de Bernstein
      vecT = vec4.create();
      vec4.set(vecT, t * t * t, t * t, t, 1);
      P0 = vec3.clone(curve.controlPoints[i]);
      P1 = vec3.clone(curve.controlPoints[i + 1]);
      P2 = vec3.clone(curve.controlPoints[i + 2]);
      P3 = vec3.clone(curve.controlPoints[i + 3]);

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
