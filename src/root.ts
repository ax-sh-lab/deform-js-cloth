// import * as THREE from '../js/three.min.js'

var THREE: any;

class Particle {
  position = new THREE.Vector3();
  previous = new THREE.Vector3();
  original = new THREE.Vector3();
  a = new THREE.Vector3(0, 0, 0);
  mass = 0;
  invMass = 0;

  tmp = new THREE.Vector3();
  tmp2 = new THREE.Vector3();
  distance = 0;
  adj = [];
  constructor(x: number, y: number, z: number, mass: number) {
    this.position.set(x, y, z);
    this.previous.set(x, y, z);
    this.original.set(x, y, z);
    this.mass = mass;
    this.invMass = 1 / mass;
  }

  addForce(force) {
    this.a.add(
      this.tmp2.copy(force).multiplyScalar(this.invMass),
    );
  }

  integrate(timesq) {
    const newPos = this.tmp.subVectors(
      this.position,
      this.previous,
    );
    newPos.multiplyScalar(DRAG).add(this.position);
    newPos.add(this.a.multiplyScalar(timesq));

    this.tmp = this.previous;
    this.previous = this.position;
    this.position = newPos;

    this.a.set(0, 0, 0);
  }
}

renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

scene = new THREE.Scene();
renderer.setClearColor(0x0F1519);

camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  10000,
);
camera.position.z = -150;
camera.position.y = 300;
// camera.position.x = 160;

controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.maxDistance = 400;
controls.minDistance = 150;
controls.minPolarAngle = 0.8;
controls.maxPolarAngle = (Math.PI * 2) / 5;
controls.target.y = 0;
controls.update();

const stats = new Stats();
document.body.appendChild(stats.dom);
const particles = [];
const constraints = [];
const plane = new THREE.Vector3();

width = height = 100;
dim = 200;

const restDistance = dim / height;
const diagonalDist = Math.sqrt(restDistance * restDistance * 2);
const bigDist = Math.sqrt(restDistance * restDistance * 4);

let click = false;
mouse = new THREE.Vector2(0.5, 0.5);
tmpmouse = new THREE.Vector3();
mouse3d = new THREE.Vector3(0, 0, 0);
raycaster = new THREE.Raycaster();
plane3d = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
psel = undefined;

let verts;

const directionalLight = new THREE.DirectionalLight(0xBA8B8B, 1.0);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(
  0x8BBAB4,
  1.6,
);
directionalLight2.position.set(1, 1, -1);
scene.add(directionalLight2);

const light = new THREE.AmbientLight(0x999999); // soft white light
scene.add(light);
const plight = new THREE.PointLight(0xFFFFFF, 1.0, 700);
plight.position.set(0, 350, 0);
scene.add(plight);

const textureLoader = new THREE.TextureLoader();
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const texture1 = textureLoader.load(
  "https://raw.githubusercontent.com/aatishb/drape/master/textures/patterns/circuit_pattern.png",
);

texture1.anisotropy = maxAnisotropy;
texture1.repeat.x = 0.8;
texture1.offset.x = 0.1;
texture1.updateMatrix();

let mesh;

function createParticles() {
  const MeshMaterial = new THREE.MeshPhongMaterial({
    color: 0xAA2949,
    specular: 0x030303,
    // map: texture1,
    side: THREE.DoubleSide,
    alphaTest: 0.7,
  });

  // geometry = new THREE.PlaneGeometry(dim, dim, width-1, height-1);
  // geometry.rotateX ( -Math.PI/2 );

  geometry = new THREE.SphereGeometry(100, 100, 100); // modify to your linking
  // geometry = new THREE.SphereGeometry(100, 1, 1); // modify to your linking

  const { faces, vertices } = geometry;
  vertices.forEach(({ x, y, z }) => {
    particles.push(new Particle(x, y, z, 0.1));
  });

  // for all the neighbouring vertices
  faces.forEach((face) => {
    if (
      !particles[face.b].adj.includes(face.a) &&
      !particles[face.a].adj.includes(face.b)
    ) {
      particles[face.a].adj.push(face.b);
    }
    if (
      !particles[face.c].adj.includes(face.a) &&
      !particles[face.a].adj.includes(face.c)
    ) {
      particles[face.a].adj.push(face.c);
    }
  });

  particles.forEach((particle) => {
    const { adj } = particle;

    adj.forEach((i) => {
      constraints.push([
        particle,
        particles[i],
        particle.original.distanceTo(particles[i].original),
      ]);
    });
  });

  mesh = new THREE.Mesh(geometry, MeshMaterial);
  scene.add(mesh);

  requestAnimationFrame(update);
}

const DRAG = 0.97;
const PULL = 7.5;
const TIMESTEP = 18 / 1000;
const TIMESTEP_SQ = TIMESTEP * TIMESTEP;
const GRAVITY = 981 * 1.4;
const gravity = new THREE.Vector3(0, -0.98, 0).multiplyScalar(
  0.1,
);

function simulate() {
  particles.forEach((particle) => {
    const force = new THREE.Vector3().copy(particle.original);
    particle.addForce(
      force.sub(particle.position).multiplyScalar(PULL),
    );
    particle.integrate(TIMESTEP_SQ);
  });

  il = constraints.length;

  for (j = 0; j < 5; j++) {
    if (j % 2 === 1) {
      for (i = il - 1; i >= 0; i--) {
        constraint = constraints[i];
        satisfyConstraints(
          constraint[0],
          constraint[1],
          constraint[2],
        );
      }
    } else {
      for (i = 0; i < il; i++) {
        constraint = constraints[i];
        satisfyConstraints(
          constraint[0],
          constraint[1],
          constraint[2],
        );
      }
    }

    if (click && psel) {
      offset = mouse3d.clone().sub(particles[psel].position);
      particles.forEach((particle) => {
        distance = particles[psel].original.distanceTo(
          particle.original,
        );

        if (particle.distance < 10) {
          particle.position.add(
            offset.multiplyScalar(1.0 - 0 * (distance / 10)),
          );
        }
      });
    }
  }
}

const diff = new THREE.Vector3();

function satisfyConstraints(p1, p2, distance) {
  diff.subVectors(p2.position, p1.position);
  const currentDist = diff.length();
  if (currentDist === 0) {
    return; // prevents division by 0
  }
  const correction = diff.multiplyScalar(
    1 - distance / currentDist,
  );
  const correctionHalf = correction.multiplyScalar(0.5);
  p1.position.add(correctionHalf);
  p2.position.sub(correctionHalf);
}

currentTime = Date.now();
accumulator = 0;
dt = TIMESTEP * 1000;
createParticles();

function update() {
  requestAnimationFrame(update);

  stats.begin();

  updateMouse();
  controls.update();

  simulate();

  for (let i = 0, il = particles.length; i < il; i++) {
    mesh.geometry.vertices[i].copy(particles[i].position);
  }

  mesh.geometry.computeFaceNormals();
  mesh.geometry.computeVertexNormals();

  mesh.geometry.normalsNeedUpdate = true;
  mesh.geometry.verticesNeedUpdate = true;

  renderer.render(scene, camera);

  stats.end();
}

window.onresize = function () {
  w = window.innerWidth;
  h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
};

function updateMouse() {
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([mesh]);

  mouse3d.set(0, 0, 0);

  if (intersects.length !== 0) {
    mouse3d.copy(intersects[0].point);
  }

  if (
    psel === undefined &&
    click &&
    !mouse3d.equals(new THREE.Vector3(0, 0, 0))
  ) {
    dist = 9999;
    particles.forEach((particle, n) => {
      tmp = mouse3d.distanceTo(particle.position);
      if (tmp < dist) {
        dist = tmp;
        psel = n;
      }
    });

    // individual
    particles.forEach((particle) => {
      particle.distance = particles[psel].original.distanceTo(
        particle.original,
      );
    });
  }

  newPlane = new THREE.Plane(
    camera.position.clone().normalize(),
    -100,
  );
  raycaster.ray.intersectPlane(newPlane, tmpmouse);
  if (tmpmouse != null) {
    mouse3d.copy(tmpmouse);
  }
}

window.onmousemove = function (evt) {
  mouse.x = (evt.pageX / window.innerWidth) * 2 - 1;
  mouse.y = -(evt.pageY / window.innerHeight) * 2 + 1;
};

window.onmousedown = function (evt) {
  if (evt.button === 0) {
    click = true;
  }
};

window.onmouseup = function (evt) {
  if (evt.button === 0) {
    click = false;
    psel = undefined;
  }
};

window.onmouseout = function (evt) {
  if (evt.button === 0) {
    click = false;
    psel = undefined;
  }
};
