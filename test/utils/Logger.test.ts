import { Logger, LogLevel } from '../../src/utils/Logger';

describe('Logger', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe('log levels', () => {
        it('should log debug messages', () => {
            Logger.debug('Test debug message', 'TestMethod', { key: 'value' });

            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should log info messages', () => {
            Logger.info('Test info message', 'TestMethod', { key: 'value' });

            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should log warn messages', () => {
            Logger.warn('Test warn message', 'TestMethod', { key: 'value' });

            expect(consoleSpy).toHaveBeenCalled();
        });

        it('should log error messages', () => {
            const error = new Error('Test error');
            Logger.error('Test error message', error, 'TestMethod', { key: 'value' });

            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    describe('log formatting', () => {
        it('should include timestamp in log messages', () => {
            Logger.info('Test message', 'TestMethod');

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('should include log level in log messages', () => {
            Logger.info('Test message', 'TestMethod');

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('[INFO]');
        });

        it('should include method name in log messages', () => {
            Logger.info('Test message', 'TestMethod');

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('[TestMethod]');
        });
    });

    describe('error handling', () => {
        it('should handle error objects properly', () => {
            const error = new Error('Test error');
            error.stack = 'Test stack trace';

            Logger.error('Test error message', error, 'TestMethod');

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Test error');
            expect(loggedMessage).toContain('Test stack trace');
        });

        it('should handle non-error objects as errors', () => {
            const fakeError = { message: 'Fake error', code: 500 };

            Logger.error('Test error message', fakeError as any, 'TestMethod');

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Fake error');
        });
    });

    describe('metadata handling', () => {
        it('should include metadata in log messages', () => {
            const metadata = { userId: 123, action: 'login' };
            Logger.info('Test message', 'TestMethod', metadata);

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('"userId":123');
            expect(loggedMessage).toContain('"action":"login"');
        });

        it('should handle empty metadata', () => {
            Logger.info('Test message', 'TestMethod');

            const loggedMessage = consoleSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Test message');
        });
    });
});