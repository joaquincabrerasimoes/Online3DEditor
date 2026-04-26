// GLB export optimizers.
// Each function takes a Model and mutates it in place. Designed to be run
// on a *clone* of the live viewer model so the on-screen state is preserved.
//
// Recommended pass order (most → least invasive):
//   flattenNodes → joinMeshes → weldVertices → removeUnusedVertices
//     → simplifyGeometry → removeDuplicates / instanceMeshes
//
// All passes are best-effort. If a model has features they don't understand
// (e.g. lines, exotic materials), they fall back to leaving things alone.

import { Coord3D } from '../engine/geometry/coord3d.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Node } from '../engine/model/node.js';
import { Model } from '../engine/model/model.js';
import { MeshInstanceId } from '../engine/model/meshinstance.js';
import { TransformMesh } from '../engine/model/meshutils.js';

const DEFAULT_WELD_EPSILON = 1e-5;

// -----------------------------------------------------------------------------
// Model deep clone — needed so optimizations don't mutate the live viewer model
// -----------------------------------------------------------------------------

// Recreate a node, preserving its source ID so caller-supplied
// (nodeId, meshIndex) → visibility look-ups still resolve in the clone.
function CloneNodeRecursive (sourceNode, targetParent)
{
    let cloned = new Node ();
    cloned.SetName (sourceNode.GetName ());
    cloned.SetTransformation (sourceNode.GetTransformation ().Clone ());
    for (let meshIdx of sourceNode.GetMeshIndices ()) {
        cloned.AddMeshIndex (meshIdx);
    }
    // Manual attach (skips AddChildNode's id regeneration)
    cloned.parent = targetParent;
    cloned.idGenerator = targetParent.idGenerator;
    cloned.id = sourceNode.GetId ();
    targetParent.childNodes.push (cloned);

    for (let child of sourceNode.GetChildNodes ()) {
        CloneNodeRecursive (child, cloned);
    }
    return cloned;
}

export function CloneModel (model)
{
    let clone = new Model ();
    clone.SetUnit (model.GetUnit ());

    // Materials — share references (immutable for our purposes here)
    for (let i = 0; i < model.MaterialCount (); i++) {
        clone.AddMaterial (model.GetMaterial (i));
    }

    // Meshes — deep clone so mutations don't leak to viewer
    for (let i = 0; i < model.MeshCount (); i++) {
        clone.AddMesh (model.GetMesh (i).Clone ());
    }

    // Node hierarchy — recreate, preserving source IDs throughout
    let sourceRoot = model.GetRootNode ();
    let cloneRoot = clone.GetRootNode ();
    cloneRoot.id = sourceRoot.GetId ();

    for (let meshIdx of sourceRoot.GetMeshIndices ()) {
        cloneRoot.AddMeshIndex (meshIdx);
    }
    for (let child of sourceRoot.GetChildNodes ()) {
        CloneNodeRecursive (child, cloneRoot);
    }
    return clone;
}

// Drop hidden mesh instances from the clone in-place. Call BEFORE running
// optimizations that change tree structure (FlattenNodes, JoinMeshes, etc.)
// so the visibility filter can still resolve by source nodeId.
export function ApplyVisibilityFilter (model, isMeshVisible)
{
    if (!isMeshVisible) {
        return;
    }
    model.GetRootNode ().Enumerate ((node) => {
        node.meshIndices = node.meshIndices.filter ((meshIdx) => {
            let id = new MeshInstanceId (node.GetId (), meshIdx);
            return isMeshVisible (id);
        });
    });
}

// -----------------------------------------------------------------------------
// Weld Vertices: merge vertices within `epsilon` distance into a single index
// -----------------------------------------------------------------------------

export function WeldVertices (model, epsilon)
{
    let eps = epsilon || DEFAULT_WELD_EPSILON;
    let invEps = 1.0 / eps;

    for (let m = 0; m < model.MeshCount (); m++) {
        let mesh = model.GetMesh (m);
        if (mesh.VertexCount () === 0 || mesh.TriangleCount () === 0) {
            continue;
        }

        let oldVerts = mesh.vertices;
        let key = (v) => {
            return Math.round (v.x * invEps) + ':' +
                   Math.round (v.y * invEps) + ':' +
                   Math.round (v.z * invEps);
        };

        let newVerts = [];
        let map = new Map (); // hash → newIndex
        let remap = new Array (oldVerts.length); // oldIndex → newIndex

        for (let i = 0; i < oldVerts.length; i++) {
            let h = key (oldVerts[i]);
            if (map.has (h)) {
                remap[i] = map.get (h);
            } else {
                let newIdx = newVerts.length;
                newVerts.push (oldVerts[i]);
                map.set (h, newIdx);
                remap[i] = newIdx;
            }
        }

        if (newVerts.length === oldVerts.length) {
            continue; // nothing to weld
        }
        mesh.vertices = newVerts;
        for (let i = 0; i < mesh.triangles.length; i++) {
            let t = mesh.triangles[i];
            t.v0 = remap[t.v0];
            t.v1 = remap[t.v1];
            t.v2 = remap[t.v2];
        }
        // Drop degenerate triangles (two indices collapsed to same vertex)
        mesh.triangles = mesh.triangles.filter ((t) => {
            return t.v0 !== t.v1 && t.v1 !== t.v2 && t.v0 !== t.v2;
        });
    }
}

// -----------------------------------------------------------------------------
// Remove Unused Vertices: drop vertices not referenced by any triangle
// (also normals and UVs whose triangle reference dies with them)
// -----------------------------------------------------------------------------

export function RemoveUnusedVertices (model)
{
    for (let m = 0; m < model.MeshCount (); m++) {
        let mesh = model.GetMesh (m);
        if (mesh.VertexCount () === 0 || mesh.TriangleCount () === 0) {
            continue;
        }
        let used = new Set ();
        for (let t of mesh.triangles) {
            used.add (t.v0);
            used.add (t.v1);
            used.add (t.v2);
        }

        let newVerts = [];
        let newColors = mesh.vertexColors.length > 0 ? [] : null;
        let remap = new Array (mesh.vertices.length);
        for (let i = 0; i < mesh.vertices.length; i++) {
            if (used.has (i)) {
                remap[i] = newVerts.length;
                newVerts.push (mesh.vertices[i]);
                if (newColors !== null && i < mesh.vertexColors.length) {
                    newColors.push (mesh.vertexColors[i]);
                }
            }
        }
        if (newVerts.length === mesh.vertices.length) {
            continue;
        }
        mesh.vertices = newVerts;
        if (newColors !== null) {
            mesh.vertexColors = newColors;
        }
        for (let t of mesh.triangles) {
            t.v0 = remap[t.v0];
            t.v1 = remap[t.v1];
            t.v2 = remap[t.v2];
        }
    }
}

// -----------------------------------------------------------------------------
// Flatten Nodes: bake world transformations into vertices, then collapse the
// node hierarchy so every mesh sits directly under the root with identity transform.
// -----------------------------------------------------------------------------

export function FlattenNodes (model)
{
    let root = model.GetRootNode ();
    // Collect (meshIndex, worldTransform) pairs from the existing hierarchy.
    // Each occurrence is preserved (so an instance reused 3× becomes 3 entries).
    let meshOccurrences = []; // { meshIndex, transform }
    root.Enumerate ((node) => {
        let worldT = node.GetWorldTransformation ();
        for (let mi of node.GetMeshIndices ()) {
            meshOccurrences.push ({ meshIndex : mi, transform : worldT });
        }
    });

    // Per (meshIndex, transformId) bake transform into a fresh mesh clone so
    // multiple instances don't trample each other's vertex data.
    let newMeshList = [];
    let occurrenceToNewMeshIdx = [];
    for (let occ of meshOccurrences) {
        let baked = model.GetMesh (occ.meshIndex).Clone ();
        TransformMesh (baked, occ.transform);
        newMeshList.push (baked);
        occurrenceToNewMeshIdx.push (newMeshList.length - 1);
    }

    // Replace mesh list and rebuild node tree as a flat root containing all
    // baked meshes.
    model.meshes = newMeshList;
    let newRoot = new Node ();
    newRoot.SetName (root.GetName ());
    for (let i = 0; i < newMeshList.length; i++) {
        newRoot.AddMeshIndex (i);
    }
    model.root = newRoot;
}

// -----------------------------------------------------------------------------
// Join Meshes: merge all meshes that share a primary material into a single
// mesh per material. Reduces draw calls dramatically.
// -----------------------------------------------------------------------------

function GetMeshPrimaryMaterial (mesh)
{
    if (mesh.triangles.length === 0) {
        return -1;
    }
    return mesh.triangles[0].mat !== null ? mesh.triangles[0].mat : -1;
}

export function JoinMeshes (model)
{
    if (model.MeshCount () === 0) {
        return;
    }

    // Group mesh indices by primary material (mixed-material meshes left alone)
    let groups = new Map (); // matIdx → [meshIdx, ...]
    let mixedMeshIndices = []; // meshes with multiple materials we don't touch
    for (let i = 0; i < model.MeshCount (); i++) {
        let mesh = model.GetMesh (i);
        let primary = GetMeshPrimaryMaterial (mesh);
        let allSame = true;
        for (let t of mesh.triangles) {
            let mat = t.mat !== null ? t.mat : -1;
            if (mat !== primary) {
                allSame = false;
                break;
            }
        }
        if (!allSame) {
            mixedMeshIndices.push (i);
            continue;
        }
        if (!groups.has (primary)) {
            groups.set (primary, []);
        }
        groups.get (primary).push (i);
    }

    let newMeshes = [];
    let oldToNewMesh = new Map (); // oldMeshIdx → newMeshIdx

    // Each material group → one merged mesh
    for (let [matIdx, meshIndices] of groups.entries ()) {
        if (meshIndices.length === 1) {
            oldToNewMesh.set (meshIndices[0], newMeshes.length);
            newMeshes.push (model.GetMesh (meshIndices[0]));
            continue;
        }
        let merged = new Mesh ();
        merged.SetName ('Joined_' + (matIdx === -1 ? 'no_material' : 'mat_' + matIdx));
        for (let oldIdx of meshIndices) {
            let src = model.GetMesh (oldIdx);
            let vOffset = merged.vertices.length;
            let nOffset = merged.normals.length;
            let uOffset = merged.uvs.length;
            let cOffset = merged.vertexColors.length;
            for (let v of src.vertices) {
                merged.vertices.push (v);
            }
            for (let n of src.normals) {
                merged.normals.push (n);
            }
            for (let u of src.uvs) {
                merged.uvs.push (u);
            }
            for (let c of src.vertexColors) {
                merged.vertexColors.push (c);
            }
            for (let t of src.triangles) {
                let nt = new Triangle (t.v0 + vOffset, t.v1 + vOffset, t.v2 + vOffset);
                if (t.HasNormals ()) {
                    nt.SetNormals (t.n0 + nOffset, t.n1 + nOffset, t.n2 + nOffset);
                }
                if (t.HasTextureUVs ()) {
                    nt.SetTextureUVs (t.u0 + uOffset, t.u1 + uOffset, t.u2 + uOffset);
                }
                if (t.HasVertexColors ()) {
                    nt.SetVertexColors (t.c0 + cOffset, t.c1 + cOffset, t.c2 + cOffset);
                }
                nt.SetMaterial (t.mat);
                merged.triangles.push (nt);
            }
            oldToNewMesh.set (oldIdx, newMeshes.length);
        }
        // All old indices in this group → same new merged mesh index
        let mergedIdx = newMeshes.length;
        for (let oldIdx of meshIndices) {
            oldToNewMesh.set (oldIdx, mergedIdx);
        }
        newMeshes.push (merged);
    }

    // Mixed-material meshes pass through untouched
    for (let oldIdx of mixedMeshIndices) {
        oldToNewMesh.set (oldIdx, newMeshes.length);
        newMeshes.push (model.GetMesh (oldIdx));
    }

    model.meshes = newMeshes;

    // Remap node mesh indices, deduping to avoid re-adding the same merged
    // mesh multiple times in one node.
    model.GetRootNode ().Enumerate ((node) => {
        let newSet = new Set ();
        for (let oldIdx of node.GetMeshIndices ()) {
            newSet.add (oldToNewMesh.get (oldIdx));
        }
        node.meshIndices = Array.from (newSet);
    });
}

// -----------------------------------------------------------------------------
// Remove Duplicates / Instance Meshes: detect meshes with identical content and
// collapse them to a single shared mesh referenced by all their owners.
// (For glTF this is the natural way to express instancing.)
// -----------------------------------------------------------------------------

function HashMesh (mesh)
{
    // Fast hash using vertex count, triangle count, first/last vertex coords,
    // and first triangle materials. Good enough for a primary bucket; full
    // comparison happens in MeshesEqual().
    let parts = [
        mesh.vertices.length,
        mesh.triangles.length,
        mesh.normals.length,
        mesh.uvs.length
    ];
    if (mesh.vertices.length > 0) {
        let v0 = mesh.vertices[0];
        let vN = mesh.vertices[mesh.vertices.length - 1];
        parts.push (v0.x.toFixed (4), v0.y.toFixed (4), v0.z.toFixed (4));
        parts.push (vN.x.toFixed (4), vN.y.toFixed (4), vN.z.toFixed (4));
    }
    if (mesh.triangles.length > 0) {
        parts.push (mesh.triangles[0].mat);
    }
    return parts.join ('|');
}

function MeshesEqual (a, b)
{
    if (a.vertices.length !== b.vertices.length) return false;
    if (a.triangles.length !== b.triangles.length) return false;
    if (a.normals.length !== b.normals.length) return false;
    if (a.uvs.length !== b.uvs.length) return false;
    let eps = 1e-6;
    for (let i = 0; i < a.vertices.length; i++) {
        let av = a.vertices[i];
        let bv = b.vertices[i];
        if (Math.abs (av.x - bv.x) > eps ||
            Math.abs (av.y - bv.y) > eps ||
            Math.abs (av.z - bv.z) > eps) {
            return false;
        }
    }
    for (let i = 0; i < a.triangles.length; i++) {
        let at = a.triangles[i];
        let bt = b.triangles[i];
        if (at.v0 !== bt.v0 || at.v1 !== bt.v1 || at.v2 !== bt.v2) return false;
        if (at.mat !== bt.mat) return false;
    }
    return true;
}

export function RemoveDuplicateMeshes (model)
{
    if (model.MeshCount () < 2) {
        return;
    }
    let buckets = new Map (); // hash → [meshIdx, ...]
    for (let i = 0; i < model.MeshCount (); i++) {
        let h = HashMesh (model.GetMesh (i));
        if (!buckets.has (h)) {
            buckets.set (h, []);
        }
        buckets.get (h).push (i);
    }

    let oldToNew = new Map ();
    for (let [, indices] of buckets.entries ()) {
        if (indices.length === 1) {
            oldToNew.set (indices[0], indices[0]);
            continue;
        }
        // Within a bucket, group by exact equality
        let canonicals = []; // [meshIdx, ...]
        for (let idx of indices) {
            let mesh = model.GetMesh (idx);
            let foundCanon = -1;
            for (let canon of canonicals) {
                if (MeshesEqual (mesh, model.GetMesh (canon))) {
                    foundCanon = canon;
                    break;
                }
            }
            if (foundCanon === -1) {
                canonicals.push (idx);
                oldToNew.set (idx, idx);
            } else {
                oldToNew.set (idx, foundCanon);
            }
        }
    }

    // Compact the meshes array: keep canonical meshes only
    let kept = new Set (oldToNew.values ());
    let newMeshes = [];
    let oldToCompacted = new Map ();
    for (let i = 0; i < model.MeshCount (); i++) {
        if (kept.has (i)) {
            oldToCompacted.set (i, newMeshes.length);
            newMeshes.push (model.GetMesh (i));
        }
    }
    model.meshes = newMeshes;

    // Remap node mesh indices via the two-step mapping
    model.GetRootNode ().Enumerate ((node) => {
        node.meshIndices = node.meshIndices.map (
            (oldIdx) => oldToCompacted.get (oldToNew.get (oldIdx))
        );
    });
}

// Alias — InstanceMeshes is the same logical operation; we just expose both
// names so the UI checkboxes can be wired independently.
export function InstanceMeshes (model)
{
    RemoveDuplicateMeshes (model);
}

// -----------------------------------------------------------------------------
// Simplify Geometry: vertex-clustering decimation. Snap vertices to a grid
// with cell size = (boundingDiagonal * factor), then weld + remove unused.
// Higher factor = coarser grid = more simplification. factor in (0, 0.5].
// Note: this is a fast, lossy approach — not QEM. Topology can break for
// extreme factors. Default factor = 0.005 (0.5% of bounding diagonal).
// -----------------------------------------------------------------------------

function GetMeshAabb (mesh)
{
    if (mesh.vertices.length === 0) {
        return null;
    }
    let v0 = mesh.vertices[0];
    let min = new Coord3D (v0.x, v0.y, v0.z);
    let max = new Coord3D (v0.x, v0.y, v0.z);
    for (let v of mesh.vertices) {
        if (v.x < min.x) min.x = v.x;
        if (v.y < min.y) min.y = v.y;
        if (v.z < min.z) min.z = v.z;
        if (v.x > max.x) max.x = v.x;
        if (v.y > max.y) max.y = v.y;
        if (v.z > max.z) max.z = v.z;
    }
    return { min, max };
}

export function SimplifyGeometry (model, factor)
{
    let f = factor || 0.005;
    if (f <= 0) {
        return;
    }

    for (let m = 0; m < model.MeshCount (); m++) {
        let mesh = model.GetMesh (m);
        if (mesh.VertexCount () === 0) {
            continue;
        }
        let aabb = GetMeshAabb (mesh);
        if (!aabb) continue;
        let dx = aabb.max.x - aabb.min.x;
        let dy = aabb.max.y - aabb.min.y;
        let dz = aabb.max.z - aabb.min.z;
        let diag = Math.sqrt (dx * dx + dy * dy + dz * dz);
        if (diag < 1e-9) continue;
        let cell = diag * f;
        // Snap vertex positions to the grid in-place
        for (let v of mesh.vertices) {
            v.x = Math.round (v.x / cell) * cell;
            v.y = Math.round (v.y / cell) * cell;
            v.z = Math.round (v.z / cell) * cell;
        }
    }
    // Now merge the now-coincident vertices and drop dead triangles
    WeldVertices (model, 1e-9);
    RemoveUnusedVertices (model);
}

// -----------------------------------------------------------------------------
// Run optimizations in place on a model. Caller is responsible for cloning
// first (use CloneModel) — that lets the caller apply ApplyVisibilityFilter
// between cloning and optimization while node IDs are still source-equal.
// `flags` shape: { weldVertices, removeUnusedVertices, removeDuplicates,
//                  instanceMeshes, flattenNodes, joinMeshes, simplifyGeometry }
// -----------------------------------------------------------------------------

export function ApplyOptimizations (model, flags)
{
    if (flags.flattenNodes) {
        FlattenNodes (model);
    }
    if (flags.joinMeshes) {
        JoinMeshes (model);
    }
    if (flags.weldVertices) {
        WeldVertices (model);
    }
    if (flags.removeUnusedVertices) {
        RemoveUnusedVertices (model);
    }
    if (flags.simplifyGeometry) {
        SimplifyGeometry (model);
    }
    if (flags.removeDuplicates || flags.instanceMeshes) {
        RemoveDuplicateMeshes (model);
    }
}
