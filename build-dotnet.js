#!/usr/bin/env node

/**
 * Build script for .NET components
 * Compiles the C# wrapper library for use with Edge.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DotNetBuilder {
    constructor() {
        this.sourceDir = path.join(__dirname, 'pg-drive', 'PostgreSqlSchemaCompareSync');
        this.outputDir = path.join(__dirname, 'bin');
        this.projectFile = path.join(this.sourceDir, 'PostgreSqlSchemaCompareSync.csproj');
    }

    async build() {
        console.log('🔨 Building .NET components for PostgreSQL Schema Sync...\n');

        try {
            // Ensure output directory exists
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
            }

            // Check if .NET SDK is available
            await this.checkDotNetSdk();

            // Create .NET project file if it doesn't exist
            if (!fs.existsSync(this.projectFile)) {
                await this.createProjectFile();
            }

            // Restore NuGet packages
            console.log('📦 Restoring NuGet packages...');
            execSync('dotnet restore', {
                cwd: this.sourceDir,
                stdio: 'inherit'
            });

            // Build the project
            console.log('🔨 Building .NET library...');
            execSync('dotnet build --configuration Release --output ' + this.outputDir, {
                cwd: this.sourceDir,
                stdio: 'inherit'
            });

            // Verify build output
            await this.verifyBuild();

            console.log('\n✅ .NET library built successfully!');
            console.log(`📍 Output location: ${this.outputDir}`);
            console.log('🔗 Ready for use with Edge.js');

        } catch (error) {
            console.error('\n❌ .NET build failed:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }

    async checkDotNetSdk() {
        try {
            const version = execSync('dotnet --version', { encoding: 'utf8' }).trim();
            console.log(`✅ .NET SDK found: ${version}`);
        } catch (error) {
            throw new Error('.NET SDK not found. Please install .NET 6.0 or later.');
        }
    }

    async createProjectFile() {
        console.log('📄 Creating .NET project file...');

        const projectContent = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <AssemblyName>PostgreSqlSchemaCompareSync</AssemblyName>
    <RootNamespace>PostgreSqlSchemaCompareSync</RootNamespace>
    <OutputType>Library</OutputType>
    <Configurations>Release</Configurations>
    <EnableDefaultCompileItems>true</EnableDefaultCompileItems>
    <Nullable>enable</Nullable>
    <LangVersion>10.0</LangVersion>
    <EnableUnsafeBinaryFormatterSerialization>true</EnableUnsafeBinaryFormatterSerialization>
  </PropertyGroup>

  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Release|AnyCPU'">
    <Optimize>true</Optimize>
    <DebugType>portable</DebugType>
    <DebugSymbols>true</DebugSymbols>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Npgsql" Version="7.0.6" />
    <PackageReference Include="Microsoft.Extensions.Logging" Version="7.0.0" />
    <PackageReference Include="Microsoft.Extensions.Logging.Console" Version="7.0.0" />
    <PackageReference Include="Microsoft.Extensions.DependencyInjection" Version="9.0.9" />
    <PackageReference Include="Microsoft.Extensions.Configuration" Version="7.0.0" />
    <PackageReference Include="Microsoft.Extensions.Configuration.Json" Version="7.0.0" />
    <PackageReference Include="Microsoft.Extensions.Configuration.EnvironmentVariables" Version="7.0.0" />
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Edge.js" Version="8.2.1" />
  </ItemGroup>

  <ItemGroup>
    <None Update="appsettings.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </None>
  </ItemGroup>

  <ItemGroup>
    <Compile Remove="Core\**" />
    <Compile Remove="Infrastructure\**" />
  </ItemGroup>

  <ItemGroup>
    <None Remove="Core\**" />
    <None Remove="Infrastructure\**" />
  </ItemGroup>
</Project>`;

        fs.writeFileSync(this.projectFile, projectContent);
        console.log('✅ .NET project file created');
    }

    async verifyBuild() {
        const expectedDll = path.join(this.outputDir, 'PostgreSqlSchemaCompareSync.dll');

        if (!fs.existsSync(expectedDll)) {
            throw new Error(`Expected DLL not found at: ${expectedDll}`);
        }

        const stats = fs.statSync(expectedDll);
        console.log(`✅ Build verified: ${expectedDll} (${this.formatBytes(stats.size)})`);

        // Additional verification - check if DLL is a valid .NET assembly
        try {
            // Check if other expected files exist
            const pdbFile = path.join(this.outputDir, 'PostgreSqlSchemaCompareSync.pdb');
            const runtimeConfigFile = path.join(this.outputDir, 'PostgreSqlSchemaCompareSync.runtimeconfig.json');

            if (fs.existsSync(pdbFile)) {
                const pdbStats = fs.statSync(pdbFile);
                console.log(`✅ Debug symbols found: ${this.formatBytes(pdbStats.size)}`);
            }

            if (fs.existsSync(runtimeConfigFile)) {
                console.log(`✅ Runtime configuration found`);
            }

            // List all files in output directory for transparency
            const files = fs.readdirSync(this.outputDir);
            console.log(`📁 Build output contains ${files.length} files:`);
            files.forEach(file => {
                const filePath = path.join(this.outputDir, file);
                const fileStats = fs.statSync(filePath);
                const sizeStr = this.formatBytes(fileStats.size);
                console.log(`   - ${file} (${sizeStr})`);
            });

        } catch (error) {
            console.warn(`⚠️  Additional verification failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Format bytes to human readable format
     * @param {number} bytes - The number of bytes
     * @returns {string} Formatted bytes string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Execute build if run directly
if (require.main === module) {
    const builder = new DotNetBuilder();
    builder.build().catch(error => {
        console.error('Build failed:', error);
        process.exit(1);
    });
}

module.exports = { DotNetBuilder };