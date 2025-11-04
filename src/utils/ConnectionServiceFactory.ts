import { ConnectionService } from '@/core/ConnectionService';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { ValidationFramework } from '@/core/ValidationFramework';

export class ConnectionServiceFactory {
  private static instance: ConnectionServiceFactory;
  private connectionServices: Map<string, ConnectionService> = new Map();

  private constructor() {}

  static getInstance(): ConnectionServiceFactory {
    if (!ConnectionServiceFactory.instance) {
      ConnectionServiceFactory.instance = new ConnectionServiceFactory();
    }
    return ConnectionServiceFactory.instance;
  }

  createConnectionService(connectionManager: ConnectionManager): ConnectionService {
    const key = 'default'; // Could be extended to support multiple instances
    if (!this.connectionServices.has(key)) {
      const validationFramework = new ValidationFramework();
      const connectionService = new ConnectionService(
        connectionManager,
        validationFramework,
        { retryAttempts: 3 }
      );
      this.connectionServices.set(key, connectionService);
    }
    return this.connectionServices.get(key)!;
  }

  dispose(): void {
    for (const service of this.connectionServices.values()) {
      service.dispose();
    }
    this.connectionServices.clear();
  }
}