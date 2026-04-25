# Online 3D Viewer

[![Build status](https://github.com/kovacsv/Online3DViewer/actions/workflows/build.yml/badge.svg)](https://github.com/kovacsv/Online3DViewer/actions/workflows/build.yml)
[![npm version](https://badge.fury.io/js/online-3d-viewer.svg)](https://badge.fury.io/js/online-3d-viewer)
[![DeepScan grade](https://deepscan.io/api/teams/16586/projects/19893/branches/524595/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=16586&pid=19893&bid=524595)

Online 3D Viewer (https://3dviewer.net) is a free and open source web solution to visualize and explore 3D models in your browser. This repository contains the source code of the website and the library behind it.

[Live website](https://3dviewer.net) &nbsp;-&nbsp; [Website documentation](https://3dviewer.net/info) &nbsp;-&nbsp; [Developer documentation](https://kovacsv.github.io/Online3DViewer) &nbsp;-&nbsp; [Discord server](https://discord.gg/C7x9u833yN)

## Example

![Start Page](assets/images/3dviewer_net_start_page.png?raw=true)

[Check the live version!](https://3dviewer.net/#model=https://raw.githubusercontent.com/kovacsv/Online3DViewer/dev/test/testfiles/gltf/DamagedHelmet/glTF-Binary/DamagedHelmet.glb)

## Supported file formats

* **Import**: 3dm, 3ds, 3mf, amf, bim, brep, dae, fbx, fcstd, gltf, ifc, iges, step, stl, obj, off, ply, wrl.
* **Export**: 3dm, bim, gltf, obj, off, stl, ply.

## Docker

Self-host the editor with the bundled Dockerfile:

```bash
# Build
docker build -t online3deditor:latest .

# Run on default port 8085
docker run --rm -p 8085:8085 online3deditor:latest

# Run on a custom port (host -> container)
docker run --rm -e PORT=9000 -p 9000:9000 online3deditor:latest
```

Or with Docker Compose:

```bash
docker compose up -d
# Override port:
HOST_PORT=9000 PORT=9000 docker compose up -d
```

Open `http://localhost:8085` in your browser.

## External Libraries

Online 3D Viewer uses these wonderful libraries: [three.js](https://github.com/mrdoob/three.js), [pickr](https://github.com/Simonwep/pickr), [fflate](https://github.com/101arrowz/fflate), [draco](https://github.com/google/draco), [rhino3dm](https://github.com/mcneel/rhino3dm), [web-ifc](https://github.com/tomvandig/web-ifc), [occt-import-js](https://github.com/kovacsv/occt-import-js).
