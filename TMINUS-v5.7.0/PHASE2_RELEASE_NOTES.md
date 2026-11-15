# T-MINUS v5.2.0 — Phase 2 Engineering Release

## Delivered (source implementation)

- **Solid actor movement**: deterministic substep collision with AABB hulls, assembled parts, stations, crates, rocks, and Planet B cover. Walls slide naturally rather than tunneling. Shared by human-controlled and teammate actors.
- **Spacecraft solidity**: installed modules are collidable during assembly, then the complete spacecraft is solid (with side-door alcove) on Planet A and Planet B. Rival spacecraft use the same collision dimensions.
- **AI avoidance**: bot crew attempt a small deterministic tangent steer around obstructions, rather than walking through them or endlessly running against a face.
- **Inside the ship**: engineer and raider encounter solid consoles in the competitive flight interior; walls and limits are enforced. Campaign interior continues using the authored 0.5 m navigation grid.
- **Camera**: Third-person boom collision responds to world obstacles. Campaign camera uses the nav grid to stay inside actual walkable spaces and smoothly follows the character. First-person view remains responsive.
- **Locomotion**: Walking animation responds to realized ground motion rather than key presses; smooth turning avoids yaw-wrap snapping; procedural arm/leg motion is eased; 3P footstep feedback and persistent contact shadows are added.
- **Shadows**: Campaign interior props also cast real shadows; local floor contact cues show grounding. Phase 1 terrain and lighting fixes are retained.
- **Performance**: Nearby collision context cached per simulation tick; fixed <=0.2 m movement substeps; shared GPU materials for contact shadows; hull ghost materials are reused rather than cloned on every phase switch.
- **QA**: New deterministic motion/camera/occlusion/navigation regression tests. Release metadata and static bundle version updated.

## Not part of this release

No true foot IK/retargeted animations for every imported rig; no general 3D rigid-body physics engine; no pathfinding navmesh for competitive bots; no complete multiplayer backend; no server-side physics; no new missions or economy. These remain future work. Camera collision uses a fast *planar* approximation, not per-triangle raycasts. Third-person visual acceptance still requires an interactive GPU-capable browser QA pass.

## Test procedure

`npm install` then `npm run dev` and open http://localhost:8095.

In **competitive bot practice**, skip intro, walk into an installed part during assembly, try circling the built ship in outfit mode, run along a wall, and follow bots near rocks and terminals. Switch between first- and third-person with V; verify the camera avoids solid hull corners and that walking animations idle against walls. Try Planet B rocks and rival ships, then deliver flags at the home receiving station. Confirm ship interiors still allow repairing. 

In **single player campaign**, walk across all modules and through the workshop airlock; turn the camera beside a bulkhead and toggle V. Try pausing and resuming mid-animation, and the EVA transition. Check browser consoles for module/asset loading errors.

## Deployment

The source archive is editable. For Netlify Drop, extract the separate NETLIFY.zip and upload its *contents folder*. This is a static site (no API/server). No live Netlify site was automatically changed.
