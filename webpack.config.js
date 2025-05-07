const path = require('path');
const AssetRelocatorLoader = require('@vercel/webpack-asset-relocator-loader');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'hidden-source-map',
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded.
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: AssetRelocatorLoader.loader,
            options: {
              // Options for the asset relocator loader if needed
              // By default, it will emit files to the output path (dist)
              // and adjust paths in the code.
              // 'outputAssetBase': 'native_modules' // To put them in dist/native_modules
            },
          },
          { loader: 'ts-loader' },
        ],
      },
      // You might need a similar rule for .js files if your dependencies have them
      // and they also require native modules.
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!some-module-that-needs-processing)/, // exclude node_modules generally
        use: [
          {
            loader: AssetRelocatorLoader.loader,
          },
          // Add other loaders for JS if needed, e.g., babel-loader
        ],
      },
      // Rule for .node files (though AssetRelocatorLoader should handle them)
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  // Optional: If you want to see more logs from the relocator
  // stats: {
  //   logging: 'verbose',
  // },
}; 