import * as THREE from 'three';

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
varying vec3 vWorldPos;

void main () {
    vec2 coord = vWorldPos.xz / uSpacing;
    vec2 grid = abs (fract (coord - 0.5) - 0.5) / fwidth (coord);
    float line = min (grid.x, grid.y);
    float alpha = 1.0 - min (line, 1.0);

    vec2 majorCoord = vWorldPos.xz / (uSpacing * 5.0);
    vec2 majorGrid = abs (fract (majorCoord - 0.5) - 0.5) / fwidth (majorCoord);
    float majorLine = min (majorGrid.x, majorGrid.y);
    float majorAlpha = 1.0 - min (majorLine, 1.0);

    float dist = length (vWorldPos.xz);
    float fade = 1.0 - smoothstep (uFadeDistance * 0.5, uFadeDistance, dist);

    float finalAlpha = max (alpha * 0.25, majorAlpha * 0.55) * fade;

    if (finalAlpha < 0.01) discard;
    gl_FragColor = vec4 (uGridColor, finalAlpha);
}
`;

export class InfiniteGrid
{
    constructor (viewer)
    {
        this.viewer = viewer;
        this.mesh = null;
        this.inScene = false;
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
                uGridColor : { value : new THREE.Color (0.4, 0.4, 0.4) }
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
        // Camera position from engine Camera data object {eye: {x,y,z}}
        let camY = camera.eye ? Math.abs (camera.eye.y) : 10;
        let fadeDistance = Math.max (50, camY * 10);
        this.mesh.material.uniforms.uFadeDistance.value = fadeDistance;
    }

    show ()
    {
        if (!this.inScene) {
            this.viewer.AddExtraObject (this.mesh);
            this.inScene = true;
        }
        this.setVisible (true);
    }

    hide ()
    {
        this.setVisible (false);
    }
}
