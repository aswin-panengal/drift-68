import * as T from 'three';
import type { VehicleState } from '../../shared/types';
import type { CarConfig } from '../vehicle/CarConfigs';

const SMOKE_LIMIT = 48;
const MARK_LIMIT = 180;

export class EffectsManager {
  readonly group = new T.Group();
  private readonly marks: T.InstancedMesh;
  private readonly smoke: T.Points<T.BufferGeometry, T.ShaderMaterial>;
  private readonly particles = Array.from({ length: SMOKE_LIMIT }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vz: 0, age: 0, life: 0, strength: 0,
  }));
  private readonly lastWheel = [new T.Vector2(), new T.Vector2()];
  private readonly markTransform = new T.Object3D();
  private readonly positions = new T.BufferAttribute(new Float32Array(SMOKE_LIMIT * 3), 3).setUsage(T.DynamicDrawUsage);
  private readonly sizes = new T.BufferAttribute(new Float32Array(SMOKE_LIMIT), 1).setUsage(T.DynamicDrawUsage);
  private readonly opacities = new T.BufferAttribute(new Float32Array(SMOKE_LIMIT), 1).setUsage(T.DynamicDrawUsage);
  private readonly viewportHeight = { value: 1 };
  private nextMark = 0;
  private nextPuff = 0;
  private smokeTime = 0;
  private hasTrail = false;

  constructor(private readonly car: CarConfig) {
    this.marks = new T.InstancedMesh(
      new T.PlaneGeometry(.23, 1),
      new T.MeshBasicMaterial({ color: '#29332e', transparent: true, opacity: .28, depthWrite: false }),
      MARK_LIMIT,
    );
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);

    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('puffSize', this.sizes);
    geometry.setAttribute('puffOpacity', this.opacities);
    geometry.setDrawRange(0, 0);
    // Each point is a soft, camera-facing puff with no texture or per-particle draw call.
    this.smoke = new T.Points(geometry, new T.ShaderMaterial({
      uniforms: { viewportHeight: this.viewportHeight, tint: { value: new T.Color('#f1eee4') } },
      vertexShader: `
        uniform float viewportHeight;
        attribute float puffSize;
        attribute float puffOpacity;
        varying float opacity;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          float depth = projectionMatrix[2][3] < -0.5 ? max(1.0, -viewPosition.z) : 1.0;
          gl_PointSize = clamp(puffSize * viewportHeight * projectionMatrix[1][1] / (2.0 * depth), 1.0, 96.0);
          gl_Position = projectionMatrix * viewPosition;
          opacity = puffOpacity;
        }`,
      fragmentShader: `
        uniform vec3 tint;
        varying float opacity;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float core = 1.0 - smoothstep(0.08, 0.83, length(uv * vec2(1.05, 1.23)));
          float lobe = 1.0 - smoothstep(0.06, 0.58, length(uv - vec2(0.24, -0.22)));
          gl_FragColor = vec4(tint, opacity * max(core, lobe * 0.72));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    }));
    this.smoke.frustumCulled = false;
    this.smoke.visible = false;
    this.smoke.renderOrder = 2;
    this.group.add(this.marks, this.smoke);
  }

  setViewportHeight(height: number): void { this.viewportHeight.value = height; }

  breakTrail(): void {
    this.hasTrail = false;
    this.smokeTime = 0;
  }

  update(vehicle: VehicleState, strength: number, dt: number, low: boolean): void {
    if (strength > .08) {
      this.smokeTime -= dt;
      const emit = this.smokeTime <= 0;
      if (emit) this.smokeTime = (low ? .125 : .055) + (1 - strength) * .045;
      const sin = Math.sin(vehicle.heading);
      const cos = Math.cos(vehicle.heading);
      let newMarks = false;
      for (const [index, wheel] of this.lastWheel.entries()) {
        const side = (index === 0 ? -1 : 1) * this.car.width * .51;
        const axle = this.car.length * .3;
        const x = vehicle.x - sin * axle + cos * side;
        const z = vehicle.z - cos * axle - sin * side;
        const dx = x - wheel.x;
        const dz = z - wheel.y;
        const distance = Math.hypot(dx, dz);

        if (this.hasTrail && distance >= .32 && distance < 5.5) {
          const mark = this.markTransform;
          mark.position.set((x + wheel.x) / 2, .091, (z + wheel.y) / 2);
          mark.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
          mark.scale.set(.85 + strength * .35, distance, 1);
          mark.updateMatrix();
          this.marks.setMatrixAt(this.nextMark++ % MARK_LIMIT, mark.matrix);
          this.marks.count = Math.min(this.marks.count + 1, MARK_LIMIT);
          newMarks = true;
        }
        if (!this.hasTrail || distance >= .32) wheel.set(x, z);

        if (emit) {
          const puff = this.particles[this.nextPuff++ % SMOKE_LIMIT]!;
          puff.x = x;
          puff.y = .32;
          puff.z = z;
          puff.vx = vehicle.vx * .12 + cos * side * .33;
          puff.vz = vehicle.vz * .12 - sin * side * .33;
          puff.age = 0;
          puff.life = low ? .64 : 1.02;
          puff.strength = strength ** .75 * (low ? .72 : 1);
        }
      }
      this.hasTrail = true;
      if (newMarks) this.marks.instanceMatrix.needsUpdate = true;
    } else {
      this.breakTrail();
    }

    let count = 0;
    for (const puff of this.particles) {
      if (puff.age >= puff.life) continue;
      puff.age += dt;
      const age = puff.age / puff.life;
      if (age >= 1) continue;
      puff.x += puff.vx * dt;
      puff.z += puff.vz * dt;
      puff.y += dt * .83;
      this.positions.setXYZ(count, puff.x, puff.y, puff.z);
      this.sizes.setX(count, .72 + age * (1.6 + puff.strength));
      this.opacities.setX(count, .67 * puff.strength * (1 - age) ** 1.3);
      count++;
    }
    this.smoke.visible = count > 0;
    this.smoke.geometry.setDrawRange(0, count);
    if (count > 0) {
      this.positions.needsUpdate = true;
      this.sizes.needsUpdate = true;
      this.opacities.needsUpdate = true;
    }
  }
}
