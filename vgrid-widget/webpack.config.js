const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const plugins = [new MiniCssExtractPlugin({filename: 'index.css'})];

module.exports = {
  entry: './src/index.jsx',
  module: {
   rules: [
     {
       test: /\.(js|jsx)$/,
       exclude: /node_modules/,
       use: ['babel-loader']
     },
     { test: /\.*css$/,
       use: ['style-loader', MiniCssExtractPlugin.loader, 'css-loader']
     }
   ]
  },
  resolve: {
   extensions: ['*', '.js', '.jsx', '.ts', '.tsx']
  },
  output: {
    path: __dirname + '/dist',
    publicPath: '/',
    filename: 'bundle.js'
  },
  devServer: {
    contentBase: './dist'
  },
  plugins
};
