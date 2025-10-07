import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

interface VerificationConfig {
    dllName: string;
    expectedClass: string;
    expectedMethod: string;
    minDllSize: number;
    commandTimeout: number;
    strictMode: boolean;
}

interface CommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
}

interface DllFileInfo {
    dllPath: string;
    stats: fsSync.Stats;
    isValid: boolean;
}

interface BuildOutputInfo {
    files: Array<{
        name: string;
        size: number;
        path: string;
    }>;
}

interface ProjectStructureInfo {
    projectFile: string;
    mainFile: string;
    exists: boolean;
}

interface DotNetSdkInfo {
    available: boolean;
    version?: string;
}

interface DllMetadataInfo {
    metadata: string;
    hasExpectedClass: boolean;
}

interface EdgeJsInfo {
    available: boolean;
    canCreateFunc: boolean;
}

interface VerificationResults {
    fileSystem: DllFileInfo | null;
    dotnet: DllMetadataInfo | null;
    edgeJs: EdgeJsInfo | null;
    project: ProjectStructureInfo | null;
    buildOutput: BuildOutputInfo | null;
}

interface VerificationSummary {
    dllExists: boolean;
    dllSize: number;
    dllModified: string | undefined;
    projectStructureValid: boolean;
    dotnetSdkAvailable: boolean;
    expectedClassFound: boolean;
    edgeJsAvailable: boolean;
    edgeJsFunctionCreated: boolean;
    totalFilesInBuild: number;
}

interface VerificationResult {
    success: boolean;
    results: VerificationResults;
    summary: VerificationSummary;
    error?: Error;
}

const DEFAULT_CONFIG: VerificationConfig = {
    dllName: 'PostgreSqlSchemaCompareSync.dll',
    expectedClass: 'PostgreSqlSchemaCompareSync',
    expectedMethod: 'GetSystemHealth',
    minDllSize: 1024,
    commandTimeout: 10000,
    strictMode: false
};

class VerificationError extends Error {
    public readonly code: string;
    public readonly details: Record<string, unknown>;
    public readonly timestamp: string;

    constructor(message: string, code: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

class DllNotFoundError extends VerificationError {
    constructor(dllPath: string, details: Record<string, unknown> = {}) {
        super(`DLL not found at: ${dllPath}`, 'DLL_NOT_FOUND', details);
    }
}

class DotNetSdkError extends VerificationError {
    constructor(details: Record<string, unknown> = {}) {
        super('.NET SDK is not available or not properly installed', 'DOTNET_SDK_ERROR', details);
    }
}

class MetadataError extends VerificationError {
    constructor(dllPath: string, cause: Error, details: Record<string, unknown> = {}) {
        super(`Failed to read metadata from DLL: ${dllPath}`, 'METADATA_ERROR', { ...details, cause: cause.message });
    }
}

class EdgeJsError extends VerificationError {
    constructor(details: Record<string, unknown> = {}) {
        super('Edge.js integration test failed', 'EDGE_JS_ERROR', details);
    }
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function executeCommand(
    command: string,
    options: { timeout?: number; encoding?: string; } = {}
): Promise<CommandResult> {
    const { timeout = DEFAULT_CONFIG.commandTimeout, encoding = 'utf8' } = options;
    return new Promise((resolve) => {
        try {
            const stdout = execSync(command, {
                encoding: encoding as BufferEncoding,
                timeout,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            resolve({ success: true, stdout, stderr: '' });
        } catch (error: any) {
            resolve({
                success: false,
                stdout: error.stdout?.toString() || '',
                stderr: error.stderr?.toString() || error.message
            });
        }
    });
}

async function validateFileAccess(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath, fsSync.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

class FileSystemVerifier {
    private binDir: string;
    private dllPath: string;
    private baseDir: string;
    private config: VerificationConfig;

    constructor(baseDir: string, config: VerificationConfig = DEFAULT_CONFIG) {
        this.baseDir = baseDir;
        this.config = config;
        this.binDir = path.join(baseDir, 'bin');
        this.dllPath = path.join(this.binDir, config.dllName);
    }

    async verifyDllFile(): Promise<DllFileInfo> {
        if (!(await validateFileAccess(this.dllPath))) {
            throw new DllNotFoundError(this.dllPath);
        }

        const stats = await fs.stat(this.dllPath);

        if (stats.size < this.config.minDllSize) {
            throw new VerificationError(
                `DLL size (${formatBytes(stats.size)}) is below minimum threshold (${formatBytes(this.config.minDllSize)})`,
                'DLL_TOO_SMALL',
                { actualSize: stats.size, minSize: this.config.minDllSize }
            );
        }

        return { dllPath: this.dllPath, stats, isValid: true };
    }

    async verifyBuildOutput(): Promise<BuildOutputInfo> {
        if (!(await validateFileAccess(this.binDir))) {
            throw new VerificationError(`Build output directory not found: ${this.binDir}`, 'BUILD_DIR_NOT_FOUND');
        }

        const files = await fs.readdir(this.binDir);
        const fileDetails = [];

        for (const file of files) {
            const filePath = path.join(this.binDir, file);
            const stats = await fs.stat(filePath);
            fileDetails.push({
                name: file,
                size: stats.size,
                path: filePath
            });
        }

        return { files: fileDetails };
    }

    async verifyProjectStructure(): Promise<ProjectStructureInfo> {
        const projectFile = path.join(this.baseDir, 'pg-drive', 'PostgreSqlSchemaCompareSync', 'PostgreSqlSchemaCompareSync.csproj');
        const mainFile = path.join(this.baseDir, 'pg-drive', 'PostgreSqlSchemaCompareSync', 'PostgreSqlSchemaCompareSync.cs');

        const projectExists = await validateFileAccess(projectFile);
        const mainExists = await validateFileAccess(mainFile);

        if (!projectExists || !mainExists) {
            throw new VerificationError(
                'Project structure verification failed',
                'PROJECT_STRUCTURE_ERROR',
                { projectExists, mainExists }
            );
        }

        return { projectFile, mainFile, exists: true };
    }
}

class DotNetVerifier {
    private dllPath: string;
    private config: VerificationConfig;

    constructor(dllPath: string, config: VerificationConfig = DEFAULT_CONFIG) {
        this.dllPath = dllPath;
        this.config = config;
    }

    async verifyDotNetSdk(): Promise<DotNetSdkInfo> {
        const result = await executeCommand('dotnet --version');
        if (result.success) {
            return { available: true, version: result.stdout.trim() };
        } else {
            throw new DotNetSdkError({ stderr: result.stderr });
        }
    }

    async verifyDllMetadata(): Promise<DllMetadataInfo> {
        await executeCommand(`file "${this.dllPath}"`);
        const metadataResult = await executeCommand(`dotnet metadata "${this.dllPath}"`);

        if (!metadataResult.success) {
            throw new MetadataError(this.dllPath, new Error(metadataResult.stderr));
        }

        const metadata = metadataResult.stdout;
        const hasExpectedClass = metadata.includes(this.config.expectedClass);

        if (this.config.strictMode && !hasExpectedClass) {
            throw new VerificationError(
                `Expected class '${this.config.expectedClass}' not found in DLL metadata`,
                'EXPECTED_CLASS_NOT_FOUND'
            );
        }

        return { metadata, hasExpectedClass };
    }
}

class EdgeJsVerifier {
    private dllPath: string;
    private config: VerificationConfig;

    constructor(dllPath: string, config: VerificationConfig = DEFAULT_CONFIG) {
        this.dllPath = dllPath;
        this.config = config;
    }

    async verifyEdgeJsIntegration(): Promise<EdgeJsInfo> {
        try {
            const edge = await import('edge-js');
            const funcResult = await this.testFunctionCreation(edge);
            return { available: true, canCreateFunc: funcResult.success };
        } catch (error: any) {
            if (this.config.strictMode) {
                throw new EdgeJsError({ cause: error.message });
            }
            return { available: false, canCreateFunc: false };
        }
    }

    async testFunctionCreation(edge: any): Promise<{ success: boolean; error?: string; }> {
        try {
            edge.func({
                assemblyFile: this.dllPath,
                typeName: `${this.config.expectedClass}.${this.config.expectedClass}`,
                methodName: this.config.expectedMethod
            });
            return { success: true };
        } catch (error_: any) {
            return { success: false, error: error_.message };
        }
    }
}

class DotNetDllVerifier {
    private baseDir: string;
    private config: VerificationConfig;

    constructor(config: Partial<VerificationConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config } as VerificationConfig;
        this.baseDir = path.dirname(fileURLToPath(import.meta.url));
    }

    async verify(): Promise<VerificationResult> {
        const results: VerificationResults = {
            fileSystem: null,
            dotnet: null,
            edgeJs: null,
            project: null,
            buildOutput: null
        };

        try {
            const fileVerifier = new FileSystemVerifier(this.baseDir, this.config as VerificationConfig);
            results.fileSystem = await fileVerifier.verifyDllFile();
            results.project = await fileVerifier.verifyProjectStructure();
            results.buildOutput = await fileVerifier.verifyBuildOutput();

            const dotnetVerifier = new DotNetVerifier(results.fileSystem.dllPath, this.config as VerificationConfig);
            await dotnetVerifier.verifyDotNetSdk();
            results.dotnet = await dotnetVerifier.verifyDllMetadata();

            const edgeJsVerifier = new EdgeJsVerifier(results.fileSystem.dllPath, this.config as VerificationConfig);
            results.edgeJs = await edgeJsVerifier.verifyEdgeJsIntegration();

            const summary = this.generateSummary(results);
            return { success: true, results, summary };

        } catch (error: any) {
            const summary = this.generateSummary(results);
            return { success: false, results, summary, error };
        }
    }

    generateSummary(results: VerificationResults): VerificationSummary {
        return {
            dllExists: !!results.fileSystem?.isValid,
            dllSize: results.fileSystem?.stats?.size || 0,
            dllModified: results.fileSystem?.stats?.mtime?.toISOString(),
            projectStructureValid: !!results.project?.exists,
            dotnetSdkAvailable: true,
            expectedClassFound: results.dotnet?.hasExpectedClass || false,
            edgeJsAvailable: results.edgeJs?.available || false,
            edgeJsFunctionCreated: results.edgeJs?.canCreateFunc || false,
            totalFilesInBuild: results.buildOutput?.files?.length || 0
        };
    }
}

async function verifyDotNetDll(config: Partial<VerificationConfig> = {}): Promise<VerificationResult> {
    const verifier = new DotNetDllVerifier(config);
    return await verifier.verify();
}

// Run verification if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    verifyDotNetDll().then(result => {
        if (!result.success) {
            process.exit(1);
        }
    }).catch(_error => {
        process.exit(1);
    });
}

export {
    verifyDotNetDll,
    DotNetDllVerifier,
    FileSystemVerifier,
    DotNetVerifier,
    EdgeJsVerifier,
    VerificationError,
    DllNotFoundError,
    DotNetSdkError,
    MetadataError,
    EdgeJsError,
    DEFAULT_CONFIG,
    type VerificationConfig,
    type VerificationResult,
    type VerificationResults,
    type VerificationSummary
};