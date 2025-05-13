import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Stats from "three/addons/libs/stats.module.js";
import { Particle } from "./particle.ts";

// --- Constants ---

const PULL = 107.5; // Adjusted pull for potentially more particles
const TIMESTEP = 18 / 1000;
const TIMESTEP_SQ = TIMESTEP * TIMESTEP;
const SEGMENTS = 30; // Reduced for performance, original was 200
// const GRAVITY_FORCE = 981 * 1.4; // Original, not used currently
// const gravity = new THREE.Vector3(0, -GRAVITY_FORCE * 0.1, 0); // Example if used

// --- Global Variables ---
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let stats: Stats;

const particles: Particle[] = [];
type Constraint = [Particle, Particle, number]; // [particle1, particle2, restDistance]
const constraints: Constraint[] = [];

let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
let geometry: THREE.BufferGeometry;

let clickActive: boolean = false;
const mouseCoords = new THREE.Vector2(0.5, 0.5); // Normalized screen coords
const mouse3D = new THREE.Vector3(); // Intersection point in 3D
const raycaster = new THREE.Raycaster();
let selectedParticleIndex: number | undefined = undefined;
const interactionPlaneNormal = new THREE.Vector3();
const interactionPlane = new THREE.Plane();
const tempMouseProjection = new THREE.Vector3(); // For projecting mouse onto plane

// --- Initialization ---
function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x0F1519);
  document.body.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    10000,
  );
  camera.position.set(0, 150, -300); // Adjusted Z to be negative for typical view
  camera.lookAt(0, 0, 0);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.maxDistance = 600;
  controls.minDistance = 100;
  controls.minPolarAngle = 0.7;
  controls.maxPolarAngle = Math.PI / 2 - 0.1; // Ensure camera doesn't go below ground
  controls.target.set(0, 0, 0); // Centered target
  controls.update();

  // Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Lights
  const directionalLight1 = new THREE.DirectionalLight(0xBA8B8B, 1.5);
  directionalLight1.position.set(1, 1, 1);
  scene.add(directionalLight1);

  const directionalLight2 = new THREE.DirectionalLight(0x8BBAB4, 2.0);
  directionalLight2.position.set(-1, 1, -1); // Changed direction for more complex lighting
  scene.add(directionalLight2);

  const ambientLight = new THREE.AmbientLight(0x999999, 0.8);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xFFFFFF, 1.5, 700);
  pointLight.position.set(0, 250, 0); // Slightly lower
  scene.add(pointLight);

  // Texture (optional)
  // const textureLoader = new THREE.TextureLoader();
  // const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  // const texture1 = textureLoader.load(
  //     "https://raw.githubusercontent.com/aatishb/drape/master/textures/patterns/circuit_pattern.png"
  // );
  // texture1.anisotropy = maxAnisotropy;
  // texture1.wrapS = THREE.RepeatWrapping;
  // texture1.wrapT = THREE.RepeatWrapping;
  // texture1.repeat.set(2, 2); // Example repeat
  // texture1.offset.x = 0.1;
  // texture1.matrixAutoUpdate = true; // Ensure matrix updates if offset/repeat changes

  createClothParticles(100, 0.1); // Sphere radius 100, particle mass 0.1

  // Event Listeners
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointerout", onPointerUp); // Treat pointer out as pointer up for simplicity

  // Start animation loop
  animate();
}

function createClothParticles(radius: number, particleMass: number) {
  const material = new THREE.MeshPhongMaterial({
    color: 0xAA2949,
    specular: 0x111111, // Darker specular
    shininess: 50,
    // map: texture1, // Uncomment to use texture
    side: THREE.DoubleSide,
    wireframe: false, // Set to true to see wireframe
    // alphaTest: 0.5, // If using transparent textures
  });

  geometry = new THREE.SphereGeometry(radius, SEGMENTS, SEGMENTS);

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    particles.push(new Particle(x, y, z, particleMass));
  }

  // Pin top particles (example)
  // particles.forEach(p => {
  //     if (p.original.y > radius * 0.8) { // Pin particles near the top
  //         p.invMass = 0; // Make them immovable
  //     }
  // });

  // Create constraints from triangle edges
  const indices = geometry.index!.array; // SphereGeometry is indexed
  const addedConstraints = new Set<string>();

  function addConstraintIfNew(p1Idx: number, p2Idx: number) {
    const key1 = `${p1Idx}-${p2Idx}`;
    const key2 = `${p2Idx}-${p1Idx}`;
    if (!addedConstraints.has(key1) && !addedConstraints.has(key2)) {
      const p1 = particles[p1Idx];
      const p2 = particles[p2Idx];
      constraints.push([p1, p2, p1.original.distanceTo(p2.original)]);
      addedConstraints.add(key1);
    }
  }

  for (let i = 0; i < indices.length; i += 3) {
    const vA = indices[i];
    const vB = indices[i + 1];
    const vC = indices[i + 2];
    addConstraintIfNew(vA, vB);
    addConstraintIfNew(vB, vC);
    addConstraintIfNew(vC, vA);
  }

  // Add some diagonal constraints for more structure (Bend springs)
  // This is a simplified way; proper bend springs often connect vertices skipping one vertex.
  // For a sphere, the existing edges provide good structure. For a plane, this is more critical.
  // Example: For every vertex, connect to its "next next" neighbor if available
  // This part is complex for a sphere and might not be needed with enough segments.
  // If you were using a PlaneGeometry, you would add constraints like:
  // particles[i*width + j] to particles[(i+2)*width+j] and particles[i*width + (j+2)] etc.

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}

const diff = new THREE.Vector3(); // Scratch vector for satisfyConstraints
function satisfyConstraints(
  p1: Particle,
  p2: Particle,
  restDistance: number,
): void {
  diff.subVectors(p2.position, p1.position);
  const currentDist = diff.length();
  if (currentDist === 0) return; // Prevent division by zero

  const correctionFactor = (currentDist - restDistance) / currentDist;
  const correction = diff.multiplyScalar(correctionFactor * 0.5); // Each particle moves half the correction

  if (p1.invMass !== 0) p1.position.add(correction);
  if (p2.invMass !== 0) p2.position.sub(correction);
}

function simulate(): void {
  // Apply forces (e.g., gravity, spring forces to original positions)
  particles.forEach((particle) => {
    if (particle.invMass === 0) return; // Skip fixed particles

    // Spring force towards original position (global shape retention)
    const forceToOriginal = new THREE.Vector3().copy(particle.original);
    forceToOriginal.sub(particle.position).multiplyScalar(PULL * particle.mass); // Mass dependent pull
    particle.addForce(forceToOriginal);

    // Gravity (example, can be enabled)
    // particle.addForce(gravity.clone().multiplyScalar(particle.mass));

    particle.integrate(TIMESTEP_SQ);
  });

  // Satisfy constraints (multiple iterations for stability)
  const iterationCount = 5;
  for (let j = 0; j < iterationCount; j++) {
    // Iterate forwards and backwards for better convergence (Gauss-Seidel like)
    if (j % 2 === 0) {
      for (let i = 0; i < constraints.length; i++) {
        const constraint = constraints[i];
        satisfyConstraints(constraint[0], constraint[1], constraint[2]);
      }
    } else {
      for (let i = constraints.length - 1; i >= 0; i--) {
        const constraint = constraints[i];
        satisfyConstraints(constraint[0], constraint[1], constraint[2]);
      }
    }
  }

  const isActiveClick = clickActive && selectedParticleIndex !== undefined;

  // Mouse interaction
  if (isActiveClick) {
    const selectedP = particles[selectedParticleIndex];
    if (selectedP.invMass !== 0) {
      const fixedOffsetForAllAffected = mouse3D.clone().sub(selectedP.position); // Calculate ONCE

      particles.forEach((particle) => {
        if (particle === selectedP) return; // Don't apply to self here, it's handled below
        if (particle.invMass === 0) return;
        if (particle.distanceToSelectedOriginal === undefined) return;

        const interactionRadius = 10; // Match original's magic number
        if (particle.distanceToSelectedOriginal < interactionRadius) {
          // All affected particles get the SAME offset added
          particle.position.add(fixedOffsetForAllAffected);
        }
      });
      selectedP.position.copy(mouse3D); // Selected particle still snaps
    }
  }
}

// --- Update and Render Loop ---
function animate() {
  requestAnimationFrame(animate);

  stats.begin();

  updateMouseProjection();
  controls.update();
  simulate();

  // Update mesh geometry from particle positions
  const positionsAttribute = mesh.geometry.attributes
    .position as THREE.BufferAttribute;
  for (let i = 0; i < particles.length; i++) {
    positionsAttribute.setXYZ(
      i,
      particles[i].position.x,
      particles[i].position.y,
      particles[i].position.z,
    );
  }
  positionsAttribute.needsUpdate = true;

  // Recompute normals for lighting
  mesh.geometry.computeVertexNormals();
  // mesh.geometry.normalsNeedUpdate = true; // computeVertexNormals handles this

  renderer.render(scene, camera);
  stats.end();
}

// --- Event Handlers ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateMouseProjection() {
  raycaster.setFromCamera(mouseCoords, camera);
  const intersects = raycaster.intersectObject(mesh); // Intersect only with the cloth mesh

  if (intersects.length > 0) {
    mouse3D.copy(intersects[0].point);
  } else {
    // If no intersection with mesh, project onto a plane facing the camera
    // at the distance of the selected particle (if any) or a default distance
    let targetDistance = (selectedParticleIndex !== undefined)
      ? camera.position.distanceTo(particles[selectedParticleIndex].position)
      : 200; // Default distance if no particle selected or mesh not hit

    interactionPlaneNormal.subVectors(camera.position, controls.target)
      .normalize();
    interactionPlane.setFromNormalAndCoplanarPoint(
      interactionPlaneNormal,
      selectedParticleIndex !== undefined
        ? particles[selectedParticleIndex].position
        : controls.target,
    );

    raycaster.ray.intersectPlane(interactionPlane, tempMouseProjection);
    if (tempMouseProjection) { // Check if intersection occurred
      mouse3D.copy(tempMouseProjection);
    }
  }
}

const radius = 100; // Should match sphere radius used in createClothParticles

function onPointerMove(event: PointerEvent) {
  mouseCoords.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseCoords.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onPointerDown(event: PointerEvent) {
  if (event.button === 0) { // Left mouse button
    clickActive = true;
    updateMouseProjection(); // Update mouse3D before selecting

    if (
      !mouse3D.equals(new THREE.Vector3(0, 0, 0)) ||
      raycaster.intersectObject(mesh).length > 0
    ) { // Check if mouse3D is valid
      let minDistSq = Infinity;
      let newSelectedParticleIndex: number | undefined = undefined;

      particles.forEach((particle, index) => {
        if (particle.invMass === 0) return; // Don't select fixed particles for dragging
        const distSq = mouse3D.distanceToSquared(particle.position);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          newSelectedParticleIndex = index;
        }
      });

      // Only select if reasonably close (e.g., within a certain radius)
      const selectionThreshold = (radius * 0.15) * (radius * 0.15); // 15% of sphere radius squared
      if (minDistSq < selectionThreshold) {
        selectedParticleIndex = newSelectedParticleIndex;

        // Calculate distances from the newly selected particle for interaction falloff
        if (selectedParticleIndex !== undefined) {
          const selPOriginal = particles[selectedParticleIndex].original;
          particles.forEach((p) => {
            p.distanceToSelectedOriginal = selPOriginal.distanceTo(p.original);
          });
        }
      } else {
        selectedParticleIndex = undefined; // Clicked too far from any particle
      }
    }
  }
}

function onPointerUp(event: PointerEvent) {
  if (event.button === 0) {
    clickActive = false;
    selectedParticleIndex = undefined;
    // Clear distances used for interaction effect
    particles.forEach((p) => p.distanceToSelectedOriginal = undefined);
  }
}

// --- Start ---
init();
