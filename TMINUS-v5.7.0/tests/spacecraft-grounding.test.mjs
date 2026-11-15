import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../dist/vendor/three.module.js";
import { createSpacecraft } from "../dist/spacecraft-model.js";
import { SHIP_SCALE, SHIP_Y } from "../dist/ship-scale.js";
import { hullBoxes } from "../dist/hull-collision.js";
const material = (c) => new THREE.MeshBasicMaterial({ color: c });
const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
};
const helpers = {
  THREE,
  SHIP_SCALE,
  SHIP_Y,
  material,
  mesh,
  box: (w, h, d, c, p, x, y, z) =>
    mesh(new THREE.BoxGeometry(w, h, d), material(c), p, x, y, z),
  sphere: (r, c, p, x, y, z) =>
    mesh(new THREE.SphereGeometry(r, 8, 6), material(c), p, x, y, z),
  cylinder: (rt, rb, h, c, p, x, y, z) =>
    mesh(new THREE.CylinderGeometry(rt, rb, h, 8), material(c), p, x, y, z),
  glow: (w, h, d, c, p, x, y, z) =>
    mesh(new THREE.BoxGeometry(w, h, d), material(c), p, x, y, z),
};
test("all four rendered landing feet contact the pad and exactly match their shared collider footprints", () => {
  const { ship } = createSpacecraft(helpers, new THREE.Group());
  ship.updateMatrixWorld(true);
  const feet = ship.children.filter(
    (o) =>
      o.userData.landingGear &&
      Math.abs(o.geometry.parameters.height - 0.12) < 1e-8,
  );
  assert.equal(feet.length, 4);
  for (const foot of feet) {
    const b = new THREE.Box3().setFromObject(foot);
    assert.ok(Math.abs(b.min.y - 0.22) < 1e-6, `foot height ${b.min.y}`);
    assert.ok(
      hullBoxes().some(
        (c) =>
          Math.abs(c.x0 - b.min.x) < 1e-6 &&
          Math.abs(c.x1 - b.max.x) < 1e-6 &&
          Math.abs(c.z0 - b.min.z) < 1e-6 &&
          Math.abs(c.z1 - b.max.z) < 1e-6,
      ),
      "no collider displaced from its visible foot",
    );
  }
});
