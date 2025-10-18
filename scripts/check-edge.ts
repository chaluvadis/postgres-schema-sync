import { exec } from "child_process";
interface CompatibilityCheckResult {
  nodeVersion: string;
  majorVersion: number;
  edgeJsAvailable: boolean;
  dotNetSdkAvailable: boolean;
  warnings: string[];
}

async function checkEdgeJsCompatibility(): Promise<CompatibilityCheckResult> {
  const warnings: string[] = [];

  console.log("🔍 Checking Edge.js compatibility...");
  const nodeVersion: string = process.version;
  const majorVersion: number = parseInt(nodeVersion.slice(1).split(".")[0]);

  console.log(`📋 Node.js version: ${nodeVersion}`);

  if (majorVersion >= 22) {
    warnings.push("Node.js version 22+ detected");
    warnings.push("Edge.js may have compatibility issues with Node.js 22+");
    warnings.push(
      "Consider upgrading to a modern alternative like Node-API or gRPC"
    );
    console.warn("⚠️  Warning: Node.js version 22+ detected");
    console.warn("   Edge.js may have compatibility issues with Node.js 22+");
    console.warn(
      "   Consider upgrading to a modern alternative like Node-API or gRPC"
    );
    console.log("");
  }

  // Check if edge-js is installed
  let edgeJsAvailable = false;
  try {
    await import("edge-js");
    console.log("✅ Edge.js is available");
    edgeJsAvailable = true;
  } catch (error) {
    warnings.push("Edge.js not found or failed to load");
    console.warn("⚠️  Edge.js not found or failed to load");
    console.warn('   Run "pnpm install" to install dependencies');
    console.log("");
  }

  // Check .NET SDK
  const dotnetCommand: string =
    process.platform === "win32" ? "dotnet.exe" : "dotnet";
  let dotNetSdkAvailable = false;

  return new Promise<CompatibilityCheckResult>((resolve) => {
    exec(`${dotnetCommand} --version`, (error, stdout) => {
      if (error) {
        warnings.push(".NET SDK not found");
        console.warn("⚠️  .NET SDK not found");
        console.warn("   Install .NET SDK to build the PostgreSQL extension");
        console.warn("   Download from: https://dotnet.microsoft.com/download");
      } else {
        console.log("✅ .NET SDK found:", stdout.trim());
        dotNetSdkAvailable = true;
      }
      console.log("");
      console.log("🎉 Edge.js compatibility check complete!");

      resolve({
        nodeVersion,
        majorVersion,
        edgeJsAvailable,
        dotNetSdkAvailable,
        warnings,
      });
    });
  });
}

// Run the compatibility check
checkEdgeJsCompatibility().catch((error: Error) => {
  console.error("❌ Error during compatibility check:", error);
  process.exit(1);
});
