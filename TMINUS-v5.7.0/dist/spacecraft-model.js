// The same spacecraft geometry and component tags are used by offline and online play.
export function createSpacecraft(
  { THREE, SHIP_SCALE, SHIP_Y, cylinder, sphere, box, mesh, material, glow },
  parent,
) {
  const ship = new THREE.Group();
  parent.add(ship);
  ship.scale.setScalar(SHIP_SCALE);
  ship.position.y = SHIP_Y;
  let _tagged = 0;
  const tag = (id) => {
    for (let k = _tagged; k < ship.children.length; k++)
      ship.children[k].userData.partId ??= id;
    _tagged = ship.children.length;
  };
  const hull = cylinder(1.12, 1.12, 4.7, "#f0e4c9", ship, 0, 1.4, -0.1, 24);
  hull.rotation.x = Math.PI / 2;
  hull.userData.hullShell = true;
  tag("keel");
  const nose = sphere(1, "#f4e9d2", ship, 0, 1.4, -2.45, 24);
  nose.scale.set(1.12, 1.12, 1.6);
  nose.userData.hullShell = true;
  tag("bridge");
  const belly = box(1.45, 0.35, 4, "#393447", ship, 0, 0.42, 0.1, 0.5);
  tag("keel");
  for (const z of [-2.15, 1.8]) {
    const band = mesh(
      new THREE.TorusGeometry(1.13, 0.12, 8, 32),
      material("#e3853e"),
      ship,
      0,
      1.4,
      z,
    );
  }
  tag("keel");
  for (const x of [-0.46, 0.46]) {
    const win = sphere(0.47, "#3c4d59", ship, x, 2.14, -2.4, 16);
    win.scale.set(0.8, 0.5, 1);
  }
  tag("bridge");
  for (const sign of [-1, 1]) {
    box(0.8, 0.18, 1.4, "#51485d", ship, sign * 1.2, 1.15, 1);
    const pod = cylinder(
      0.49,
      0.49,
      2.9,
      "#eee1be",
      ship,
      sign * 1.8,
      1.12,
      1.3,
      20,
    );
    pod.rotation.x = Math.PI / 2;
    const back = cylinder(
      0.36,
      0.47,
      0.45,
      "#504554",
      ship,
      sign * 1.8,
      1.12,
      2.9,
      20,
    );
    back.rotation.x = Math.PI / 2;
    const rim = mesh(
      new THREE.TorusGeometry(0.47, 0.1, 6, 24),
      material("#ed9447"),
      ship,
      sign * 1.8,
      1.12,
      2.65,
    );
    glow(0.32, 0.1, 0.05, "#f5c284", ship, sign * 1.8, 1.12, 3.15);
    const cover = box(0.06, 0.45, 2, "#ed9447", ship, sign * 1.13, 1.35, 0.35);
    for (const z of [-1.4, 1.7]) {
      const leg = box(0.11, 0.9, 0.12, "#544956", ship, sign * 1.07, 0.12, z);
      leg.rotation.z = sign * -0.25;
      leg.userData.landingGear = true;
      box(
        0.55,
        0.12,
        0.65,
        "#463e4f",
        ship,
        sign * 1.2,
        -0.35,
        z,
      ).userData.landingGear = true;
    }
    tag(sign < 0 ? "port" : "thruster");
  }
  const turretBase = sphere(0.51, "#575062", ship, 0, 2.6, 0.3, 16);
  turretBase.scale.y = 0.55;
  const turret = box(0.34, 0.25, 1.45, "#ded5bd", ship, 0, 2.78, -0.15, 0.5);
  glow(0.1, 0.035, 0.25, "#ed9447", ship, 0, 2.93, -0.2);
  tag("engine");
  const airlock = mesh(
    new THREE.TorusGeometry(0.43, 0.07, 6, 24),
    material("#e88d43"),
    ship,
    1.12,
    1.4,
    -0.6,
  );
  airlock.rotation.y = Math.PI / 2;
  tag("cargo");
  for (let i = 0; i < 3; i++) {
    box(0.13, 0.6, 0.1, "#514958", ship, 1.31, 0.85, -0.6);
    box(0.48, 0.08, 0.1, "#6b5f69", ship, 1.45, 0.3 + i * 0.25, -0.6);
  }
  tag("cargo");
  cylinder(0.035, 0.035, 0.6, "#6d5a64", ship, 0, 2.7, 1.65, 8);
  const antennaDish = mesh(
    new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    material("#e5d0ae"),
    ship,
    0,
    3,
    1.65,
  );
  antennaDish.rotation.z = 0.3;
  tag("antenna");
  box(0.9, 0.4, 1.1, "#6b5f75", ship, 0, 2.55, -1.1, 0.3);
  glow(0.4, 0.05, 0.5, "#80e6c1", ship, 0, 2.78, -1.1);
  tag("reactor");
  box(0.7, 0.5, 1.2, "#5b5470", ship, 1.05, 0.62, 1.7, 0.3);
  tag("battery");
  for (const sx of [-1, 1])
    box(1.7, 0.07, 2.3, "#9aa2b8", ship, sx * 3.3, 1.4, 0.1);
  tag("coolant");
  const scrub = cylinder(
    0.28,
    0.28,
    1.5,
    "#d7dde6",
    ship,
    -1.2,
    0.85,
    -1.2,
    16,
  );
  scrub.rotation.x = Math.PI / 2;
  tag("scrubber");
  const store = cylinder(0.28, 0.28, 1.5, "#e1d2b4", ship, 1.2, 0.85, -1.2, 16);
  store.rotation.x = Math.PI / 2;
  tag("stores");
  const shipLight = new THREE.PointLight("#f4b374", 8, 9, 2);
  shipLight.position.set(0, 1, 2.7);
  ship.add(shipLight);
  const engineFlames = [];
  for (const sign of [-1, 1]) {
    const f = mesh(
      new THREE.ConeGeometry(0.34, 2, 12),
      material("#ffc984", 0, 0.2, true),
      ship,
      sign * 1.8,
      1.12,
      4,
    );
    f.rotation.x = Math.PI / 2;
    f.visible = false;
    f.userData.engineFlame = true;
    engineFlames.push(f);
  }
  return { ship, engineFlames };
}
