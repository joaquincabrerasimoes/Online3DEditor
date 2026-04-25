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

void main () {
    // Minor grid lines (every uSpacing units)
    vec2 coord = vWorldPos.xz / uSpacing;
    vec2 grid = abs (fract (coord - 0.5) - 0.5) / fwidth (coord);
    float line = min (grid.x, grid.y);
    float alpha = 1.0 - min (line, 1.0);

    // Major grid lines (every 10x uSpacing)
    vec2 majorCoord = vWorldPos.xz / (uSpacing * 10.0);
    vec2 majorGrid = abs (fract (majorCoord - 0.5) - 0.5) / fwidth (majorCoord);
    float majorLine = min (majorGrid.x, majorGrid.y);
    float majorAlpha = 1.0 - min (majorLine, 1.0);

    // Fade based on distance from camera (XZ plane)
    float dist = length (vWorldPos.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep (uFadeDistance * 0.4, uFadeDistance, dist);
    if (fade < 0.01) discard;

    // Blend major over minor
    vec3 color;
    float finalAlpha;
    if (majorAlpha > 0.0) {
        color = uMajorColor;
        finalAlpha = majorAlpha * 0.85 * fade;
    } else {
        color = uGridColor;
        finalAlpha = alpha * 0.45 * fade;
    }

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
                uFadeDistance : { value : 500.0 },
                // Tuned for a mid-gray viewport background.
                // Minor lines: subtle but clearly readable; major lines: stronger.
                uGridColor : { value : new THREE.Color (0.55, 0.58, 0.62) },
                uMajorColor : { value : new THREE.Color (0.78, 0.80, 0.84) }
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
        // Adjust fade distance based on camera distance to center
        // (camera is engine Camera object: {eye, center, up, fov})
        if (camera && camera.eye && camera.center) {
            let dx = camera.eye.x - camera.center.x;
            let dy = camera.eye.y - camera.center.y;
            let dz = camera.eye.z - camera.center.z;
            let camDist = Math.sqrt (dx * dx + dy * dy + dz * dz);
            // Show grid up to ~20x camera distance for distant cameras
            let fadeDistance = Math.max (100, camDist * 20);
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
