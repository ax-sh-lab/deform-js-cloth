// --- Particle Class ---
import * as THREE from "three";

const DRAG = 0.97;
export class Particle {
  position: THREE.Vector3;
  previous: THREE.Vector3;
  original: THREE.Vector3;
  a: THREE.Vector3; // Acceleration
  mass: number;
  invMass: number;

  // Scratch vectors for calculations
  private tmp: THREE.Vector3 = new THREE.Vector3();
  private tmp2: THREE.Vector3 = new THREE.Vector3();

  // Distance from selected particle (for interaction)
  distanceToSelectedOriginal: number | undefined = undefined;

  constructor(x: number, y: number, z: number, mass: number) {
    this.position = new THREE.Vector3(x, y, z);
    this.previous = new THREE.Vector3(x, y, z);
    this.original = new THREE.Vector3(x, y, z);
    this.a = new THREE.Vector3(0, 0, 0);
    this.mass = mass;
    this.invMass = (mass === 0) ? 0 : 1 / mass; // Handle infinite mass
  }

  addForce(force: THREE.Vector3): void {
    if (this.invMass === 0) return; // Infinite mass particles are not affected by forces
    this.a.add(
      this.tmp2.copy(force).multiplyScalar(this.invMass),
    );
  }

  integrate(timesq: number): void {
    if (this.invMass === 0) return;

    const newPos = this.tmp.subVectors(this.position, this.previous);
    newPos.multiplyScalar(DRAG).add(this.position);
    newPos.add(this.a.multiplyScalar(timesq));

    this.tmp.copy(this.previous); // Store old previous
    this.previous.copy(this.position);
    this.position.copy(newPos);

    this.a.set(0, 0, 0); // Reset acceleration
  }
}
