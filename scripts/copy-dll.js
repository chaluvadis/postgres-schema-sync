#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Script to copy .NET DLL to VSCode extension directory
 * This ensures the DLL is available at runtime for Edge.js
 */

const sourceDllPath = path.join(process.cwd(), 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'Debug', 'net9.0', 'PostgreSqlSchemaCompareSync.dll');
const targetDllPath = path.join(process.cwd(), 'out', 'PostgreSqlSchemaCompareSync.dll');

console.log('🔄 Copying .NET DLL for Edge.js integration...');

try {
    // Check if source DLL exists
    if (!fs.existsSync(sourceDllPath)) {
        console.error('❌ Source DLL not found:', sourceDllPath);
        console.error('💡 Make sure to run "pnpm run build:dotnet" first');
        process.exit(1);
    }

    // Create out directory if it doesn't exist
    const outDir = path.dirname(targetDllPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
        console.log('📁 Created output directory:', outDir);
    }

    // Copy DLL
    fs.copyFileSync(sourceDllPath, targetDllPath);
    console.log('✅ DLL copied successfully:');
    console.log('   From:', sourceDllPath);
    console.log('   To:', targetDllPath);

    // Verify copy
    if (fs.existsSync(targetDllPath)) {
        const stats = fs.statSync(targetDllPath);
        console.log('✅ DLL verification successful');
        console.log('   Size:', (stats.size / 1024).toFixed(2), 'KB');
        console.log('   Modified:', stats.mtime.toISOString());
    } else {
        console.error('❌ DLL copy failed');
        process.exit(1);
    }

} catch (error) {
    console.error('❌ Error copying DLL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
}

console.log('🎉 .NET DLL ready for Edge.js integration!');