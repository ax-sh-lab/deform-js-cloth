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
    specular: 0x111111,
    shininess: 50,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  // SEGMENTS is used for both widthSegments and heightSegments in SphereGeometry
  const widthSegments = SEGMENTS;
  const heightSegments = SEGMENTS;

  geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    particles.push(new Particle(x, y, z, particleMass));
  }

  const indices = geometry.index!.array;
  const addedConstraints = new Set<string>();

  // Using a canonical key for the set is slightly cleaner
  function addConstraintIfNewWithDistance(
    p1Idx: number,
    p2Idx: number,
    restDistance: number,
  ) {
    const canonicalKey = `${Math.min(p1Idx, p2Idx)}-${Math.max(p1Idx, p2Idx)}`;
    if (!addedConstraints.has(canonicalKey)) {
      const p1 = particles[p1Idx];
      const p2 = particles[p2Idx];
      if (p1 && p2) { // Ensure particles exist
        constraints.push([p1, p2, restDistance]);
        addedConstraints.add(canonicalKey);
      } else {
        console.warn(
          "Tried to create constraint with non-existent particle(s)",
          p1Idx,
          p2Idx,
        );
      }
    }
  }

  // Your original addConstraintIfNew function (calculates distance internally)
  function addConstraintIfNewDefaultDistance(p1Idx: number, p2Idx: number) {
    const canonicalKey = `${Math.min(p1Idx, p2Idx)}-${Math.max(p1Idx, p2Idx)}`;
    if (!addedConstraints.has(canonicalKey)) {
      const p1 = particles[p1Idx];
      const p2 = particles[p2Idx];
      if (p1 && p2) {
        constraints.push([p1, p2, p1.original.distanceTo(p2.original)]);
        addedConstraints.add(canonicalKey);
      } else {
        console.warn(
          "Tried to create constraint (default dist) with non-existent particle(s)",
          p1Idx,
          p2Idx,
        );
      }
    }
  }

  // 1. Create constraints from triangle edges (structural springs)
  for (let i = 0; i < indices.length; i += 3) {
    const vA = indices[i];
    const vB = indices[i + 1];
    const vC = indices[i + 2];
    addConstraintIfNewDefaultDistance(vA, vB);
    addConstraintIfNewDefaultDistance(vB, vC);
    addConstraintIfNewDefaultDistance(vC, vA);
  }

  // 2. Add constraints for the longitudinal seam to make the sphere seamless
  // A SphereGeometry(radius, widthSegments, heightSegments) generates
  // (widthSegments + 1) vertices per latitude row, for (heightSegments + 1) rows.
  // Vertices are ordered by row (v), then by column (u) within that row.
  // Index of vertex(u,v) = v * (widthSegments + 1) + u

  for (let v = 0; v <= heightSegments; v++) { // Iterate through all latitude rows
    // Particle at the start of the row (phi = 0)
    const pIdxStart = v * (widthSegments + 1) + 0;
    // Particle at the end of the row (phi = 2*PI, same physical location as start)
    const pIdxEnd = v * (widthSegments + 1) + widthSegments;

    // These particles should be at the same location, so rest distance is 0.
    // The addConstraintIfNewWithDistance function will use this 0.
    if (pIdxStart !== pIdxEnd) { // Should always be true if widthSegments > 0
      addConstraintIfNewWithDistance(pIdxStart, pIdxEnd, 0);
    }
  }

  // Note: The poles (v=0 and v=heightSegments) are also handled by the loop above.
  // For v=0 (top pole), pIdxStart will be particle 0, and pIdxEnd will be particle 'widthSegments'.
  // All vertices in the first row (v=0) are coincident at the North Pole.
  // All vertices in the last row (v=heightSegments) are coincident at the South Pole.
  // The triangle edge constraints should already pull these pole vertices together.
  // The seam constraint for v=0 and v=heightSegments connects the "first" and "last"
  // of these coincident pole vertices, further reinforcing their connection.

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}

// NOTE kind of works but the simulation is broken
// ... (other constants and Particle class)
// const ICOSAHEDRON_DETAIL = 3;
// const CLOTH_RADIUS = 100;
// ...

// function createClothParticles(radius: number, particleMass: number) {
//   const material = new THREE.MeshPhongMaterial({
//     color: 0xAA2949,
//     specular: 0x111111,
//     shininess: 50,
//     side: THREE.DoubleSide,
//     wireframe: false,
//   });
//
//   geometry = new THREE.IcosahedronGeometry(radius, ICOSAHEDRON_DETAIL);
//
//   const positions = geometry.attributes.position;
//   for (let i = 0; i < positions.count; i++) {
//     const x = positions.getX(i);
//     const y = positions.getY(i);
//     const z = positions.getZ(i);
//     particles.push(new Particle(x, y, z, particleMass));
//   }
//
//   const addedConstraints = new Set<string>();
//
//   function addConstraintIfNew(p1Idx: number, p2Idx: number) {
//     const canonicalKey = `${Math.min(p1Idx, p2Idx)}-${Math.max(p1Idx, p2Idx)}`;
//     if (!addedConstraints.has(canonicalKey)) {
//       const p1 = particles[p1Idx];
//       const p2 = particles[p2Idx];
//       if (p1 && p2) {
//         constraints.push([p1, p2, p1.original.distanceTo(p2.original)]);
//         addedConstraints.add(canonicalKey);
//       } else {
//         console.warn(
//           "Tried to create constraint with non-existent particle(s)",
//           p1Idx,
//           p2Idx,
//         );
//       }
//     }
//   }
//
//   // Check if the geometry is indexed
//   if (geometry.index) {
//     const indices = geometry.index.array; // Now we know geometry.index is not null
//     for (let i = 0; i < indices.length; i += 3) {
//       const vA = indices[i];
//       const vB = indices[i + 1];
//       const vC = indices[i + 2];
//       addConstraintIfNew(vA, vB);
//       addConstraintIfNew(vB, vC);
//       addConstraintIfNew(vC, vA);
//     }
//   } else {
//     // Fallback for non-indexed geometry (less common for IcosahedronGeometry)
//     // Here, every 3 vertices in the position attribute form a triangle
//     console.warn(
//       "Geometry is non-indexed. Creating constraints from sequential vertices.",
//     );
//     for (let i = 0; i < positions.count; i += 3) {
//       const vA = i;
//       const vB = i + 1;
//       const vC = i + 2;
//
//       // Ensure we don't go out of bounds if positions.count is not a multiple of 3
//       if (vC < positions.count) {
//         addConstraintIfNew(vA, vB);
//         addConstraintIfNew(vB, vC);
//         addConstraintIfNew(vC, vA);
//       }
//     }
//   }
//
//   mesh = new THREE.Mesh(geometry, material);
//   scene.add(mesh);
// }

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
