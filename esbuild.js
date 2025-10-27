import { context } from "esbuild";
import path from "path";
import fs from "fs";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location?.file}:${location?.line}:${location?.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};


async function main() {
  // Create alias mappings from tsconfig paths
  const alias = /** @type {Record<string, string>} */ ({});
  const baseUrl = tsconfig.compilerOptions?.baseUrl || "./src";
  const paths = tsconfig.compilerOptions?.paths || {};

  for (const [aliasPattern, aliasPaths] of Object.entries(paths)) {
    // Keep the @/ prefix in the alias key for proper mapping
    const aliasKey = aliasPattern.replace("/*", "");
    const aliasValue = aliasPaths[0].replace("/*", "");
    const resolvedPath = path.resolve(process.cwd(), baseUrl, aliasValue);

    // Only add alias if the resolved path actually exists
    if (fs.existsSync(resolvedPath)) {
      alias[aliasKey] = resolvedPath;
      console.log(`[esbuild] Alias: ${aliasKey} -> ${resolvedPath}`);
    } else {
      console.warn(`[esbuild] Warning: Alias path does not exist: ${resolvedPath}`);
    }
  }

  const ctx = await context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode", "*.node"],
    logLevel: "info", // Changed from silent to info for better debugging
    tsconfig: "tsconfig.json",
    alias: alias, // Use esbuild's built-in alias feature
    plugins: [
      esbuildProblemMatcherPlugin,
      // Plugin to prevent copying the entire src directory
      {
        name: "prevent-src-copy",
        setup(build) {
          // Intercept any attempts to copy the src directory
          build.onResolve({ filter: /^src$/ }, (args) => {
            console.log(`[esbuild] Preventing src directory copy for: ${args.path}`);
            return { path: args.path, external: true };
          });

          // Handle src subdirectories that shouldn't be copied
          build.onResolve({ filter: /^src\/[^/]+$/ }, (args) => {
            // Only allow specific src files that are actually imported
            const allowedSrcFiles = ['extension.ts', 'PostgreSqlExtension.ts'];
            if (allowedSrcFiles.includes(args.path.replace('src/', ''))) {
              return null; // Allow these specific files
            }
            console.log(`[esbuild] Filtering src path: ${args.path}`);
            return { path: args.path, external: true };
          });
        },
      },
    ],
    // Add loader configuration for TypeScript files
    loader: {
      '.ts': 'ts',
      '.js': 'js',
    },
    // Ensure we don't copy the entire src directory
    absWorkingDir: process.cwd(),
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
