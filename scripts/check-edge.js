import { exec } from "child_process";
try {
    await import("edge-js");
    console.log("Edge.js is available");
}
catch (error) {
    console.warn("Edge.js not found or failed to load");
    console.warn('Run "pnpm install" to install dependencies');
}
const dotnetCommand = process.platform === "win32" ? "dotnet.exe" : "dotnet";
exec(`${dotnetCommand} --version`, (error, stdout) => {
    if (error) {
        console.warn(".NET SDK not found");
    }
    else {
        console.log(".NET SDK found:", stdout.trim());
    }
    console.log("Environment check complete!");
});
