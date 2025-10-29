import { BackupManager } from '../../src/core/BackupManager';
import { ConnectionService } from '../../src/core/ConnectionService';
import * as child_process from 'child_process';

describe('BackupManager', () => {
    let backupManager: BackupManager;
    let mockConnectionService: any;
    let execMock: jest.SpyInstance;

    beforeEach(() => {
        mockConnectionService = {
            getConnection: jest.fn(),
            getConnectionPassword: jest.fn()
        };

        // Mock exec before creating BackupManager
        execMock = jest.spyOn(child_process, 'exec').mockImplementation((command, options, callback) => {
            if (callback) {
                callback(null, '', '');
            }
            return {} as any;
        });

        backupManager = new BackupManager(mockConnectionService);
    });

    afterEach(() => {
        execMock.mockRestore();
    });

    describe('createBackup', () => {
        it('should create a backup successfully', async () => {
            mockConnectionService.getConnection.mockResolvedValue({
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                user: 'testuser'
            });
            mockConnectionService.getConnectionPassword.mockResolvedValue('password');

            // Mock execAsync to simulate successful backup
            const mockExecAsync = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
            jest.doMock('child_process', () => ({
                exec: jest.fn(),
                execSync: jest.fn(),
                execFile: jest.fn(),
                execFileSync: jest.fn(),
                spawn: jest.fn(),
                spawnSync: jest.fn(),
                fork: jest.fn(),
                execAsync: mockExecAsync
            }));

            const result = await backupManager.createBackup('test-connection');

            expect(result.success).toBe(true);
            expect(result.backupPath).toContain('.sql');
            expect(result.size).toBeGreaterThan(0);
        });

        it('should handle backup failure', async () => {
            mockConnectionService.getConnection.mockResolvedValue({
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                user: 'testuser'
            });
            mockConnectionService.getConnectionPassword.mockResolvedValue('password');

            // Mock exec to simulate failure for this specific test
            execMock.mockImplementationOnce((command, options, callback) => {
                if (callback) {
                    callback(new Error('pg_dump: command not found'), '', '');
                }
                return {} as any;
            });

            const result = await backupManager.createBackup('test-connection');

            expect(result.success).toBe(false);
            expect(result.error).toContain('pg_dump: command not found');
        });
    });

    describe('restoreBackup', () => {
        it('should restore from backup successfully', async () => {
            mockConnectionService.getConnection.mockResolvedValue({
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                user: 'testuser'
            });
            mockConnectionService.getConnectionPassword.mockResolvedValue('password');

            const mockExecAsync = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
            jest.doMock('child_process', () => ({
                exec: jest.fn(),
                execSync: jest.fn(),
                execFile: jest.fn(),
                execFileSync: jest.fn(),
                spawn: jest.fn(),
                spawnSync: jest.fn(),
                fork: jest.fn(),
                execAsync: mockExecAsync
            }));

            const result = await backupManager.restoreBackup('test-connection', '/path/to/backup.sql');

            expect(result.success).toBe(true);
        });

        it('should handle restore failure', async () => {
            mockConnectionService.getConnection.mockResolvedValue({
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                user: 'testuser'
            });
            mockConnectionService.getConnectionPassword.mockResolvedValue('password');

            // Mock exec to simulate failure for this specific test
            execMock.mockImplementationOnce((command, options, callback) => {
                if (callback) {
                    callback(new Error('psql: command not found'), '', '');
                }
                return {} as any;
            });

            const result = await backupManager.restoreBackup('test-connection', '/path/to/backup.sql');

            expect(result.success).toBe(false);
            expect(result.error).toContain('psql: command not found');
        });
    });

    describe('listBackups', () => {
        it('should list available backups', () => {
            const backups = backupManager.listBackups();

            expect(Array.isArray(backups)).toBe(true);
            // In a real test environment, we would check the actual backup files
        });
    });
});