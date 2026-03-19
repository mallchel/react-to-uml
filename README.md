<p align="center">
  <a href="https://github.com/mallchel/react-to-uml/" target="blank">
    <img src="https://i.ibb.co/JyQv3x4/react-to-uml.png" width="100" alt="react-to-uml logo">
  </a>
</p>

<h3 align="center">
  react-to-uml
</h3>

<p align="center">
  Visualize your react components tree with uml diagram
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/react-to-uml"><img src="https://img.shields.io/npm/v/react-to-uml?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/react-to-uml"><img src="https://img.shields.io/npm/dm/react-to-uml?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/react-to-uml"><img src="https://img.shields.io/github/stars/mallchel/react-to-uml?style=flat-square"></a>
</p>

It analyzes your source files and generates a UML diagram for the React component tree.

## Framework-agnostic mode (recommended)

You can now run `react-to-uml` without wiring Babel/Webpack plugins by using a two-step flow:

1. Gather component graph from source files
2. Build UML from gathered graph

```sh
# Step 1: gather
IS_GATHER_INFO=true IS_BUILD_UML=false ENTRY=./packages/app/client.js yarn run-uml

# Step 2: build uml
IS_GATHER_INFO=false IS_BUILD_UML=true ENTRY=./packages/app/client.js yarn run-uml
```

Environment variables:
- `ENTRY`: entry file path
- `PACKAGES_PATHS_REGEX`: regex for package roots (default: `<cwd>/(packages)`)
- `EXTENSIONS`: comma-separated extensions (default: `jsx,js,tsx,ts`)
- `DUMP_DIR`: output directory (default: `./build/assets`)
- `GATHERED_GRAPH_FILE`: gathered graph file path
- `OUT_UML_FILE`: target tree JSON output path (`.uml` is generated next to it)

## Install
```ts
npm i react-to-uml
```

## Programmatic usage
```ts
import path from 'node:path';
import { runGatherInfo, runBuildUml } from 'react-to-uml';

const rootPath = process.cwd();
const packagesPaths = new RegExp(rootPath + '/(packages)');
const entryFileName = path.join(rootPath, 'packages/app/client.js');
const gatheredGraphFilePath = path.join(rootPath, 'build/assets/gatheredComponentsByFileName.json');
const outUmlFileName = path.join(rootPath, 'build/assets/treeComponentsUML.json');

runGatherInfo({
  entryFileName,
  packagesPaths,
  outFileName: gatheredGraphFilePath,
});

runBuildUml({
  entryFileName,
  packagesPaths,
  gatheredGraphFilePath,
  outUmlFileName,
  isGroupByParentDirNeeded: true,
});
```

## After build your project
1. You will get `treeComponentsUML.json` with the graph tree data.
2. You can start the React+D3 graph viewer app:

```sh
yarn run-uml
yarn start-graph
```

3. The viewer loads graph data from `build/assets/treeComponentsUML.json`.
4. `treeComponentsUML.uml` is still generated for compatibility.

## Local run modes

- `yarn start` - runs the original demo app from `packages/app/client.js`
- `yarn start-graph` - runs the interactive graph viewer from `packages/graph-viewer/client.jsx`

## Extra options
### acceptableExts?: string[];
by default `['jsx', 'js', 'tsx', 'ts']` - files in which library will looking for the jsx

### isGroupByParentDirNeeded?: boolean;
by default `false` - grouping your components by root dir, e.g. for monorepo with packages root dir it will group it like in the picture below

<img width="1989" alt="image" src="https://github.com/mallchel/react-to-uml/assets/21968689/851de3e9-ee2f-4a84-8dc1-97007a028102">

### repetitiveCountForRemoveFromTree?: number;
by default `4` - to adjust your zoom of view, components with a count of repetitive more than this param will be removed from the diagram.

## Troubleshooting
To turn on extra logs in this library use `--debug` with your build script.
```ts
npm run build --debug
```

## What is next?
Once you gathered the data from your code base, just imagine what you could do in the next step. This library right now just organizes the process of traverse, so it is possible to add logic into the library and gather extra data on the way like:
1. Test coverage for each file and component
2. Size of your files and components
3. Component names into files (if you use an approach with multiple components in one file)
4. Something else
5. Render it with the interactive like d3.js with the real-time input search filter, and highlights of the arcs when you select one of the nodes
