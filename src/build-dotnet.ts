import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';

class DotNetBuilder {
    private sourceDir: string;
    private outputDir: string;
    private projectFile: string;
    constructor() {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        this.sourceDir = join(currentDir, 'pg-drive', 'PostgreSqlSchemaCompareSync');
        this.outputDir = join(currentDir, 'bin');
        this.projectFile = join(this.sourceDir, 'PostgreSqlSchemaCompareSync.csproj');
    }
    async build(): Promise<void> {
        try {
            if (!existsSync(this.outputDir)) {
                mkdirSync(this.outputDir, { recursive: true });
            }

            this.checkDotNetSdk();

            if (!existsSync(this.projectFile)) {
                this.createProjectFile();
            }

            execSync('dotnet restore', {
                cwd: this.sourceDir,
                stdio: 'inherit'
            });

            execSync(`dotnet build --configuration Release --output ${this.outputDir}`, {
                cwd: this.sourceDir,
                stdio: 'inherit'
            });

            this.verifyBuild();

        } catch (error) {
            throw new Error(error instanceof Error ? error.message : String(error));
        }
    }

    checkDotNetSdk(): void {
        try {
            execSync('dotnet --version', { encoding: 'utf8' });
        } catch (error) {
            throw new Error('.NET SDK not found. Please install .NET 6.0 or later.');
        }
    }

    createProjectFile(): void {
        const projectContent = `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup>
        <TargetFramework>net9.0</TargetFramework>
        <Nullable>enable</Nullable>
        <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
        <AssemblyName>PostgreSqlSchemaCompareSync</AssemblyName>
        <RootNamespace>PostgreSqlSchemaCompareSync</RootNamespace>
        <Version>1.0.0</Version>
        <Authors>PostgreSQL Schema Sync Team</Authors>
        <Description>Advanced PostgreSQL schema comparison and synchronization extension for Visual Studio Code</Description>
        <PackageTags>postgresql;database;schema;comparison;synchronization;vscode</PackageTags>
    </PropertyGroup>
    <ItemGroup>
        <PackageReference Include="Npgsql" Version="9.0.3" />
        <PackageReference Include="Npgsql.DependencyInjection" Version="9.0.3" />
        <PackageReference Include="Microsoft.Extensions.DependencyInjection" Version="9.0.9" />
        <PackageReference Include="Microsoft.Extensions.Logging" Version="9.0.9" />
        <PackageReference Include="Microsoft.Extensions.Logging.Console" Version="9.0.9" />
        <PackageReference Include="Microsoft.Extensions.Configuration" Version="9.0.9" />
        <PackageReference Include="Microsoft.Extensions.Configuration.Json" Version="9.0.9" />
        <PackageReference Include="Microsoft.Extensions.Configuration.EnvironmentVariables" Version="9.0.9" />
        <PackageReference Include="System.Text.Json" Version="9.0.9" />
    </ItemGroup>

    <ItemGroup>
        <None Update="appsettings.json">
        <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
        </None>
    </ItemGroup>
    </Project>`;
        writeFileSync(this.projectFile, projectContent);
    }

    verifyBuild(): void {
        const expectedDll = join(this.outputDir, 'PostgreSqlSchemaCompareSync.dll');

        if (!existsSync(expectedDll)) {
            throw new Error(`Expected DLL not found at: ${expectedDll}`);
        }

        try {
            const pdbFile = join(this.outputDir, 'PostgreSqlSchemaCompareSync.pdb');
            const runtimeConfigFile = join(this.outputDir, 'PostgreSqlSchemaCompareSync.runtimeconfig.json');

            if (existsSync(pdbFile)) {
                statSync(pdbFile);
            }

            if (existsSync(runtimeConfigFile)) {
            }

            const files = readdirSync(this.outputDir);
            files.forEach(file => {
                const filePath = join(this.outputDir, file);
                statSync(filePath);
            });

        } catch (error) {
        }
    }

}

if (import.meta.url === `file://${process.argv[1]}`) {
    const builder = new DotNetBuilder();
    builder.build().catch(() => process.exit(1));
}

export default { DotNetBuilder };