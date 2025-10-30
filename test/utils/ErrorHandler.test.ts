import { ErrorHandler, ErrorContext, ErrorSeverity } from '../../src/utils/ErrorHandler';

describe('ErrorHandler', () => {
    describe('createContext', () => {
        it('should create error context with operation', () => {
            const context = ErrorHandler.createContext('test-operation');

            expect(context).toBeDefined();
            expect(context.operation).toBe('test-operation');
            expect(context.timestamp).toBeInstanceOf(Date);
            expect(context.sessionId).toBeDefined();
        });

        it('should create error context with additional data', () => {
            const contextData = { userId: 123, component: 'test' };
            const context = ErrorHandler.createContext('test-operation', contextData);

            expect(context.contextData).toEqual(contextData);
        });
    });

    describe('categorizeError', () => {
        it('should categorize connection errors', () => {
            const category = ErrorHandler.categorizeError('Connection refused');

            expect(category).toBe('connection');
        });

        it('should categorize authentication errors', () => {
            const category = ErrorHandler.categorizeError('Authentication failed');

            expect(category).toBe('authentication');
        });

        it('should categorize migration errors', () => {
            const category = ErrorHandler.categorizeError('Migration failed');

            expect(category).toBe('migration');
        });

        it('should categorize unknown errors', () => {
            const category = ErrorHandler.categorizeError('Some random error');

            expect(category).toBe('unknown');
        });
    });

    describe('generateRecoveryActions', () => {
        it('should generate recovery actions for connection errors', () => {
            const context = ErrorHandler.createContext('test-connection');
            const actions = ErrorHandler.generateRecoveryActions(new Error('Connection refused'), context);

            expect(actions).toBeDefined();
            expect(Array.isArray(actions)).toBe(true);
            expect(actions.length).toBeGreaterThan(0);
            expect(actions.some(action => action.id === 'retry_connection')).toBe(true);
        });

        it('should generate recovery actions for authentication errors', () => {
            const context = ErrorHandler.createContext('test-auth');
            const actions = ErrorHandler.generateRecoveryActions(new Error('Authentication failed'), context);

            expect(actions).toBeDefined();
            expect(actions.some(action => action.id === 'edit_credentials')).toBe(true);
        });
    });

    describe('generateSuggestions', () => {
        it('should generate suggestions for connection errors', () => {
            const suggestions = ErrorHandler.generateSuggestions(new Error('Connection refused'), 'connection');

            expect(suggestions).toBeDefined();
            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.includes('network connectivity'))).toBe(true);
        });

        it('should generate suggestions for authentication errors', () => {
            const suggestions = ErrorHandler.generateSuggestions(new Error('Authentication failed'), 'authentication');

            expect(suggestions).toBeDefined();
            expect(suggestions.some(s => s.includes('username and password'))).toBe(true);
        });
    });

    describe('handleError', () => {
        it('should handle Error objects', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const error = new Error('Test error');
            const context = ErrorHandler.createContext('test-operation');

            ErrorHandler.handleError(error, context);

            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should handle string errors', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const error = 'String error message';
            const context = ErrorHandler.createContext('test-operation');

            ErrorHandler.handleError(error, context);

            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('handleErrorWithSeverity', () => {
        it('should handle errors with different severity levels', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const errorSpy = jest.spyOn(console, 'error').mockImplementation();

            const error = new Error('Test error');
            const context = ErrorHandler.createContext('test-operation');

            // Test different severity levels
            ErrorHandler.handleErrorWithSeverity(error, context, ErrorSeverity.LOW);
            ErrorHandler.handleErrorWithSeverity(error, context, ErrorSeverity.MEDIUM);
            ErrorHandler.handleErrorWithSeverity(error, context, ErrorSeverity.HIGH);

            expect(consoleSpy).toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
            warnSpy.mockRestore();
            errorSpy.mockRestore();
        });
    });
});