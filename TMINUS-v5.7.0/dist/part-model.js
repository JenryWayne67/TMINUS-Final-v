// Shared construction asset factory; dimensions are in original spacecraft units.
export function createPartModel(
  {
    THREE,
    SPECIALISTS,
    SHIP_SCALE,
    sphere,
    box,
    cylinder,
    glow,
    mesh,
    material,
  },
  state,
  p,
  parent,
) {
  const g = new THREE.Group();
  parent.add(g);
  const col = SPECIALISTS[p.owner].color;
  if (p.type === "turret") {
    sphere(0.45, "#6e5d65", g);
    box(0.25, 0.2, 1.4, "#e8dbc0", g, 0, 0.25, -0.3);
    if (state.upgrades.includes("weapons"))
      box(0.2, 0.2, 1.4, "#d2c2a6", g, 0.33, 0.25, -0.3);
    glow(0.08, 0.04, 0.2, "#f79442", g, 0, 0.38, -0.4);
  } else if (p.type === "engine") {
    const en = cylinder(0.43, 0.53, 1.8, "#858796", g, 0, 0, 0, 24);
    en.rotation.x = Math.PI / 2;
    const nozzle = cylinder(0.32, 0.4, 0.35, "#24293d", g, 0, 0, 1.02, 24);
    nozzle.rotation.x = Math.PI / 2;
    glow(0.48, 0.12, 0.04, col, g, 0, 0, 1.21);
  } else if (p.type === "antenna") {
    cylinder(0.07, 0.07, 1, "#aba8bd", g, 0, 0, 0, 12);
    const dish = mesh(
      new THREE.SphereGeometry(0.65, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      material("#bcb3cc", 0.6, 0.4),
      g,
      0,
      0.4,
      0,
    );
    dish.rotation.z = 0.3;
  } else if (p.type === "hull") {
    const hull = sphere(1, "#eadebf", g, 0, 0, 0, 24);
    hull.scale.set(1, 0.6, 2.9);
    box(1.6, 0.1, 4, "#4c4b64", g, 0, -0.5, 0);
  } else if (p.type === "bridge") {
    const shell = sphere(0.8, "#e4ccaa", g);
    shell.scale.set(1, 0.6, 1.4);
    const glass = sphere(0.62, "#1c2943", g, 0, 0.2, -0.1);
    glass.scale.set(1, 0.55, 1.3);
    glass.material = material("#222a47", 0.8, 0.16);
  } else {
    box(
      ...p.size.map((n) => n / SHIP_SCALE),
      p.type === "radiator"
        ? "#475c80"
        : p.type === "wing"
          ? "#e7d9b9"
          : "#6e7184",
      g,
    );
    for (let i = 0; i < 3; i++)
      glow(
        (p.size[0] / SHIP_SCALE) * 0.7,
        0.025,
        0.035,
        col,
        g,
        0,
        p.size[1] / SHIP_SCALE / 2 + 0.015,
        (-p.size[2] * 0.3 + i * p.size[2] * 0.3) / SHIP_SCALE,
      );
  }
  g.rotation.y = (-p.angle * Math.PI) / 2;
  return g;
}
