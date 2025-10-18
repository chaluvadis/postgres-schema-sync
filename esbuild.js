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

/**
 * @type {import('esbuild').Plugin}
 */
const pathAliasPlugin = {
  name: "path-alias-resolver",
  setup(build) {
    // Resolve @/* path aliases
    build.onResolve({ filter: /^@\// }, (args) => {
      const baseUrl = tsconfig.compilerOptions?.baseUrl || "./src";
      const paths = tsconfig.compilerOptions?.paths || {};

      // Find matching path pattern
      for (const [alias, aliasPaths] of Object.entries(paths)) {
        if (args.path.startsWith(alias.replace("/*", "/"))) {
          const relativePath = args.path.replace(alias.replace("/*", "/"), "");
          const fullPath = path.resolve(
            process.cwd(),
            baseUrl,
            aliasPaths[0].replace("/*", ""),
            relativePath
          );

          return {
            path: fullPath,
            external: false,
          };
        }
      }

      // Fallback to default resolution
      const fallbackPath = path.resolve(
        process.cwd(),
        baseUrl,
        args.path.replace("@/", "")
      );
      return {
        path: fallbackPath,
        external: false,
      };
    });
  },
};

async function main() {
  // Create alias mappings from tsconfig paths
  const alias = /** @type {Record<string, string>} */ ({});
  const baseUrl = tsconfig.compilerOptions?.baseUrl || "./src";
  const paths = tsconfig.compilerOptions?.paths || {};

  for (const [aliasPattern, aliasPaths] of Object.entries(paths)) {
    const aliasKey = aliasPattern.replace("/*", "");
    const aliasValue = aliasPaths[0].replace("/*", "");
    alias[aliasKey] = path.resolve(process.cwd(), baseUrl, aliasValue);
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
    logLevel: "silent",
    tsconfig: "tsconfig.json",
    alias: alias, // Use esbuild's built-in alias feature
    plugins: [esbuildProblemMatcherPlugin],
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
