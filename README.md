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

It is appropriate to your project if it uses babel and webpack.

## Install
```ts
npm i react-to-uml
```

## Connect to your project
```ts
// webpack.base.ts
import { makePlugins } from 'react-to-uml';

const rootPath = process.cwd();
const packagesPaths = new RegExp(rootPath + '/(packages)');
const entryFileName = rootPath + '/packages/app/client.js';
const gatheredComponentsFileName = `${rootPath}/build/assets/gatheredComponentsByFileName.json`;
const outUmlFileName = `${rootPath}/build/assets/treeComponentsUML.json`;

const { babelPlugin, webpackPlugin } = makePlugins({
  packagesPaths,
  entryFileName,
  gatheredComponentsFileName,
  outUmlFileName,
});

export default {
  entry: './packages/app/client.js',
  plugins: [new HtmlWebpackPlugin({ template: './public/index.html' }), webpackPlugin],
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'build'),
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '...'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [babelPlugin],
            presets: [
              ['@babel/preset-typescript'],
              ['@babel/preset-react', { runtime: 'automatic' }],
              ['@babel/preset-env'],
            ],
          },
        },
      },
    ],
  },
} as Configuration;
```

## After build your project
1. You will get the treeComponentsUML.uml file where will be stored your diagram
2. On a small project, you can test it [here](https://www.plantuml.com/plantuml/uml/hPJBhjem48RtUGhhTCr95FN2gZf1G5T8KONK1M9XaY6uTUp8dbHK5U_UHC8b7P0OGhE8hP7dculzpvj7wR2jTQHXZmAjSAewe2YLWmALDT7UoHh4YsoQ5_4x4gAtIrFfplRLMdpzxdlxAHhO2ritre117sTDerKXUz9mlx8xfU4L_N64S-xiJrM2UyGzbzv3kRQTR-FlEURMeTInCYKSH-PupsrzQEkTaKeFjxokh6mfTLX6nM56o6K5Sz20obJVf3FTSil6f6M8iZZKdMcm7PN-qbe4zqI72O2Tznpy3xHDM6y3j09pKKKaJa51HUlHrXEjTawwNrTY-k9K6VU_2pOI_w3ZDVX1npPd-Mt5PFCkIJw-JvBjvBFO_3ss9KUwxto4BT3RbEKoKFXAfPnfbiuMQU1m94i9sOSqIpD2eDgbJlF5R3hzn4p_xFz8j-XbC2K_EX2zqki1mKNJxFypjFzuBHa53s_oeY928HMGQXclY44Y9OwPfVnOeMBcf0raHlDfNtZpc1dWMQdGODpQhwFn1ts85aOxPOK14xs1ATjQ_m40)
3. But to visualize it for the real project the simplest way is to use the plantUML java library
4. Download the jar file [here](https://plantuml.com/download)
5. Download the [graphviz](https://graphviz.org/download/) it is needed for the kind of diagrams generated by the library
6. Run `java -Xmx2G -jar plantuml-1.2023.11.jar ./build/assets/treeComponentsUML.uml -tsvg -verbose -t4` (more CLI params [here](https://plantuml.com/command-line))
7. Use your svg file. It is possible to render other formats (more CLI params [here](https://plantuml.com/command-line))

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


It is appropriate to your project if it uses babel and webpack.

## Install
```ts
npm i react-to-uml
```

## Connect to your project
```ts
// webpack.base.ts
import { makePlugins } from 'react-to-uml';

const rootPath = process.cwd();
const packagesPaths = new RegExp(rootPath + '/(packages)');
const entryFileName = rootPath + '/packages/app/client.js';
const gatheredComponentsFileName = `${rootPath}/build/assets/gatheredComponentsByFileName.json`;
const outUmlFileName = `${rootPath}/build/assets/treeComponentsUML.json`;

const { babelPlugin, webpackPlugin } = makePlugins({
  packagesPaths,
  entryFileName,
  gatheredComponentsFileName,
  outUmlFileName,
});

export default {
  entry: './packages/app/client.js',
  plugins: [new HtmlWebpackPlugin({ template: './public/index.html' }), webpackPlugin],
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'build'),
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '...'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [babelPlugin],
            presets: [
              ['@babel/preset-typescript'],
              ['@babel/preset-react', { runtime: 'automatic' }],
              ['@babel/preset-env'],
            ],
          },
        },
      },
    ],
  },
} as Configuration;
```

## After build your project
1. You will get the treeComponentsUML.uml file where will be stored your diagram
2. On a small project, you can test it [here](https://www.plantuml.com/plantuml/uml/hPJBhjem48RtUGhhTCr95FN2gZf1G5T8KONK1M9XaY6uTUp8dbHK5U_UHC8b7P0OGhE8hP7dculzpvj7wR2jTQHXZmAjSAewe2YLWmALDT7UoHh4YsoQ5_4x4gAtIrFfplRLMdpzxdlxAHhO2ritre117sTDerKXUz9mlx8xfU4L_N64S-xiJrM2UyGzbzv3kRQTR-FlEURMeTInCYKSH-PupsrzQEkTaKeFjxokh6mfTLX6nM56o6K5Sz20obJVf3FTSil6f6M8iZZKdMcm7PN-qbe4zqI72O2Tznpy3xHDM6y3j09pKKKaJa51HUlHrXEjTawwNrTY-k9K6VU_2pOI_w3ZDVX1npPd-Mt5PFCkIJw-JvBjvBFO_3ss9KUwxto4BT3RbEKoKFXAfPnfbiuMQU1m94i9sOSqIpD2eDgbJlF5R3hzn4p_xFz8j-XbC2K_EX2zqki1mKNJxFypjFzuBHa53s_oeY928HMGQXclY44Y9OwPfVnOeMBcf0raHlDfNtZpc1dWMQdGODpQhwFn1ts85aOxPOK14xs1ATjQ_m40)
3. But to visualize it for the real project the simplest way is to use the plantUML java library
4. Download the jar file [here](https://plantuml.com/download)
5. Download the [graphviz](https://graphviz.org/download/) it is needed for the kind of diagrams generated by the library
6. Run `java -Xmx2G -jar plantuml-1.2023.11.jar ./build/assets/treeComponentsUML.uml -tsvg -verbose -t4` (more CLI params [here](https://plantuml.com/command-line))
7. Use your svg file. It is possible to render other formats (more CLI params [here](https://plantuml.com/command-line))

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
