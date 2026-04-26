import * as THREE from 'three';

// Built-in three.js fragment uniforms available to ShaderMaterial:
//   uniform mat4 viewMatrix;
//   uniform vec3 cameraPosition;
//   uniform bool isOrthographic;

const VERT = `
varying vec3 vWorldPos;
void main () {
    vec3 pos = position * 10000.0;
    vec4 worldPos = modelMatrix * vec4 (pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAG = `
uniform float uSpacing;
uniform float uFadeDistance;
uniform vec3 uGridColor;
uniform vec3 uMajorColor;
varying vec3 vWorldPos;

// Lines are scaled to be a constant ~1.5 px wide regardless of camera
// distance, so the grid stays clearly visible in any zoom.
const float MINOR_THICKNESS = 1.5;
const float MAJOR_THICKNESS = 2.5;

void main () {
    // Minor grid lines (every uSpacing units)
    vec2 coord = vWorldPos.xz / uSpacing;
    vec2 grid = abs (fract (coord - 0.5) - 0.5) / fwidth (coord);
    float line = min (grid.x, grid.y);
    float alpha = 1.0 - smoothstep (0.0, MINOR_THICKNESS, line);

    // Major grid lines (every 10x uSpacing)
    vec2 majorCoord = vWorldPos.xz / (uSpacing * 10.0);
    vec2 majorGrid = abs (fract (majorCoord - 0.5) - 0.5) / fwidth (majorCoord);
    float majorLine = min (majorGrid.x, majorGrid.y);
    float majorAlpha = 1.0 - smoothstep (0.0, MAJOR_THICKNESS, majorLine);

    // Soft fade at horizon. uFadeDistance is set very high so most scenes
    // stay fully filled with grid.
    float dist = length (vWorldPos.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep (uFadeDistance * 0.7, uFadeDistance, dist);
    if (fade < 0.001) discard;

    // Major lines win over minor; both blended over the dark background.
    vec3 color = mix (uGridColor, uMajorColor, majorAlpha);
    float finalAlpha = max (alpha * 0.55, majorAlpha * 0.95) * fade;

    if (finalAlpha < 0.01) discard;
    gl_FragColor = vec4 (color, finalAlpha);
}
`;

export class InfiniteGrid
{
    constructor (viewer)
    {
        this.viewer = viewer;
        this.mesh = null;
        this.spacing = 10.0;
        this.Build ();
    }

    Build ()
    {
        let geo = new THREE.PlaneGeometry (1, 1);
        let mat = new THREE.ShaderMaterial ({
            uniforms : {
                uSpacing : { value : 10.0 },
                uFadeDistance : { value : 10000.0 },
                // Tuned for the dark navy viewport background — pale-blue lines
                // pop without being harshly bright.
                uGridColor : { value : new THREE.Color (0.40, 0.50, 0.65) },
                uMajorColor : { value : new THREE.Color (0.62, 0.74, 0.88) }
            },
            vertexShader : VERT,
            fragmentShader : FRAG,
            transparent : true,
            depthWrite : false,
            side : THREE.DoubleSide,
            polygonOffset : true,
            polygonOffsetFactor : 1,
            polygonOffsetUnits : 1
        });

        this.mesh = new THREE.Mesh (geo, mat);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.renderOrder = -1;
        // Don't let raycasting hit the grid (avoids selection on grid clicks)
        this.mesh.raycast = function () {};
    }

    setSpacing (meters)
    {
        this.spacing = meters;
        if (this.mesh) {
            this.mesh.material.uniforms.uSpacing.value = meters;
        }
    }

    setVisible (bool)
    {
        if (this.mesh) {
            this.mesh.visible = bool;
        }
    }

    update (camera)
    {
        if (!this.mesh) {
            return;
        }
        // Keep the grid visible across the entire scene regardless of camera
        // distance. We still scale the fade with camera distance so the soft
        // outer fade is at the horizon, but the floor of 5000 means short
        // viewing distances still get a generous grid.
        if (camera && camera.eye && camera.center) {
            let dx = camera.eye.x - camera.center.x;
            let dy = camera.eye.y - camera.center.y;
            let dz = camera.eye.z - camera.center.z;
            let camDist = Math.sqrt (dx * dx + dy * dy + dz * dz);
            let fadeDistance = Math.max (5000, camDist * 100);
            this.mesh.material.uniforms.uFadeDistance.value = fadeDistance;
        }
    }

    // Add to scene directly via the persistent-object API so it survives
    // viewer.Clear() (which disposes anything inside mainModel + extraModel).
    show ()
    {
        if (!this.mesh.parent) {
            this.viewer.AddPersistentObject (this.mesh);
        }
        this.setVisible (true);
        this.viewer.Render ();
    }

    hide ()
    {
        this.setVisible (false);
        this.viewer.Render ();
    }
}
