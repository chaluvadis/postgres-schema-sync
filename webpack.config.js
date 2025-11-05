const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    dashboard: './src/views/pages/Dashboard.tsx',
    schemaBrowser: './src/views/pages/SchemaBrowser.tsx',
    migrationWizard: './src/views/pages/MigrationWizard.tsx',
    queryEditor: './src/views/pages/QueryEditor.tsx',
    settings: './src/views/pages/Settings.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'out/views'),
    filename: '[name].bundle.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/views/templates/base.html',
      filename: 'dashboard.html',
      chunks: ['dashboard']
    }),
    new HtmlWebpackPlugin({
      template: './src/views/templates/base.html',
      filename: 'schema-browser.html',
      chunks: ['schemaBrowser']
    }),
    new HtmlWebpackPlugin({
      template: './src/views/templates/base.html',
      filename: 'migration-wizard.html',
      chunks: ['migrationWizard']
    }),
    new HtmlWebpackPlugin({
      template: './src/views/templates/base.html',
      filename: 'query-editor.html',
      chunks: ['queryEditor']
    }),
    new HtmlWebpackPlugin({
      template: './src/views/templates/base.html',
      filename: 'settings.html',
      chunks: ['settings']
    })
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  },
  externals: {
    'vscode': 'commonjs vscode'
  },
  performance: {
    hints: 'warning',
    maxAssetSize: 512000, // 500KB
    maxEntrypointSize: 512000
  }
};