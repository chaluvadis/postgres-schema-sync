#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const sourceDllPath = path.join(process.cwd(), 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'Debug', 'net9.0', 'PostgreSqlSchemaCompareSync.dll');
const sourcePublishDir = path.join(process.cwd(), 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'Publish', 'net9.0');
const targetDllPath = path.join(process.cwd(), 'out', 'PostgreSqlSchemaCompareSync.dll');
const targetDir = path.join(process.cwd(), 'out');
console.log('🔄 Copying .NET DLL and runtime dependencies for Edge.js integration...');
async function copyDlls() {
    try {
        if (!fs.existsSync(sourceDllPath)) {
            console.error('❌ Source DLL not found:', sourceDllPath);
            console.error('💡 Make sure to run "pnpm run build:dotnet" first');
            process.exit(1);
        }
        if (!fs.existsSync(sourcePublishDir)) {
            console.error('❌ Published DLLs not found:', sourcePublishDir);
            console.error('💡 Make sure to run "pnpm run build:dotnet" first');
            process.exit(1);
        }
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log('📁 Created output directory:', targetDir);
        }
        fs.copyFileSync(sourceDllPath, targetDllPath);
        const mainDllStats = fs.statSync(targetDllPath);
        console.log('✅ Main DLL copied successfully:');
        console.log('   From:', sourceDllPath);
        console.log('   To:', targetDllPath);
        const runtimeDlls = fs.readdirSync(sourcePublishDir)
            .filter((file) => file.endsWith('.dll') && file !== 'PostgreSqlSchemaCompareSync.dll')
            .map((file) => ({
            name: file,
            source: path.join(sourcePublishDir, file),
            target: path.join(targetDir, file)
        }));
        console.log(`🔄 Copying ${runtimeDlls.length} runtime DLLs...`);
        let copiedCount = 0;
        const copiedRuntimeDlls = [];
        for (const { name, source, target } of runtimeDlls) {
            fs.copyFileSync(source, target);
            const stats = fs.statSync(target);
            copiedRuntimeDlls.push({
                name,
                source,
                target,
                size: stats.size,
                copied: true
            });
            copiedCount++;
        }
        console.log(`✅ Runtime DLLs copied successfully (${copiedCount} files)`);
        if (fs.existsSync(targetDllPath)) {
            console.log('✅ Main DLL verification successful');
            console.log('   Size:', (mainDllStats.size / 1024).toFixed(2), 'KB');
            console.log('   Modified:', mainDllStats.mtime.toISOString());
        }
        else {
            console.error('❌ Main DLL copy failed');
            process.exit(1);
        }
        if (copiedRuntimeDlls.length === runtimeDlls.length) {
            console.log('✅ All runtime DLLs verified successfully');
            console.log('📋 Runtime DLLs copied:');
            copiedRuntimeDlls.forEach(({ name, size }) => {
                console.log(`   - ${name} (${(size / 1024).toFixed(2)} KB)`);
            });
        }
        else {
            console.error(`❌ Some runtime DLLs failed to copy (${copiedRuntimeDlls.length}/${runtimeDlls.length} succeeded)`);
            process.exit(1);
        }
        const configFiles = ['appsettings.json', 'PostgreSqlSchemaCompareSync.deps.json'];
        const copiedConfigFiles = [];
        for (const configFile of configFiles) {
            const sourceConfigPath = path.join(sourcePublishDir, configFile);
            const targetConfigPath = path.join(targetDir, configFile);
            if (fs.existsSync(sourceConfigPath)) {
                fs.copyFileSync(sourceConfigPath, targetConfigPath);
                copiedConfigFiles.push({ name: configFile, copied: true });
                console.log(`✅ Configuration file copied: ${configFile}`);
            }
            else {
                copiedConfigFiles.push({ name: configFile, copied: false });
            }
        }
        const result = {
            mainDll: {
                source: sourceDllPath,
                target: targetDllPath,
                size: mainDllStats.size,
                copied: true
            },
            runtimeDlls: copiedRuntimeDlls,
            configFiles: copiedConfigFiles,
            totalFilesCopied: 1 + copiedCount + copiedConfigFiles.filter(c => c.copied).length
        };
        console.log(`🎉 .NET DLLs and runtime dependencies ready for Edge.js integration! (${result.totalFilesCopied} files copied)`);
    }
    catch (error) {
        console.error('❌ Error copying DLLs:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
copyDlls().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
