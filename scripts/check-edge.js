#!/usr/bin/env node

import { exec } from 'child_process';

/**
 * Post-install script to check Edge.js compatibility and provide helpful warnings
 */

console.log('🔍 Checking Edge.js compatibility...');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

console.log(`📋 Node.js version: ${nodeVersion}`);

if (majorVersion >= 22) {
    console.warn('⚠️  Warning: Node.js version 22+ detected');
    console.warn('   Edge.js may have compatibility issues with Node.js 22+');
    console.warn('   Consider upgrading to a modern alternative like Node-API or gRPC');
    console.log('');
}

// Check if edge-js is installed
try {
    await import('edge-js');
    console.log('✅ Edge.js is available');
} catch (error) {
    console.warn('⚠️  Edge.js not found or failed to load');
    console.warn('   Run "pnpm install" to install dependencies');
    console.log('');
}

// Check .NET SDK
const dotnetCommand = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
exec(`${dotnetCommand} --version`, (error, stdout) => {
    if (error) {
        console.warn('⚠️  .NET SDK not found');
        console.warn('   Install .NET SDK to build the PostgreSQL extension');
        console.warn('   Download from: https://dotnet.microsoft.com/download');
    } else {
        console.log('✅ .NET SDK found:', stdout.trim());
    }
    console.log('');
    console.log('🎉 Edge.js compatibility check complete!');
});