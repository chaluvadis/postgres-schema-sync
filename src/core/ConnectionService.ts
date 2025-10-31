import { ConnectionManager } from "@/managers/ConnectionManager";
import { Logger } from "@/utils/Logger";
import {
  PostgreSqlConnectionManager,
  ConnectionInfo,
} from "./PostgreSqlConnectionManager";
import { ValidationFramework, ValidationRequest } from "./ValidationFramework";

export interface ConnectionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  connectionTime?: number;
}

export interface ConnectionServiceOptions {
  retryAttempts?: number;
  connectionTimeout?: number;
  validateOnGet?: boolean;
}

export class ConnectionService {
  private connectionManager: ConnectionManager;
  private dotNetService: PostgreSqlConnectionManager;
  private validationFramework: ValidationFramework;
  private options: Required<ConnectionServiceOptions>;

  constructor(
    connectionManager: ConnectionManager,
    validationFramework: ValidationFramework,
    options: ConnectionServiceOptions = {}
  ) {
    this.connectionManager = connectionManager;
    this.validationFramework = validationFramework;
    this.dotNetService = PostgreSqlConnectionManager.getInstance();
    this.options = {
      retryAttempts: 3,
      connectionTimeout: 30000,
      validateOnGet: true,
      ...options,
    };
  }
  async getConnection(connectionId: string): Promise<ConnectionInfo | null> {
    try {
      const connection = this.connectionManager.getConnection(connectionId);

      if (!connection) {
        Logger.warn("Connection not found", "ConnectionService.getConnection", {
          connectionId,
        });
        return null;
      }

      if (this.options.validateOnGet) {
        const validation = await this.validateConnection(connectionId);
        if (!validation.isValid) {
          Logger.error(
            "Connection validation failed",
            "ConnectionService.getConnection",
            {
              connectionId,
              errors: validation.errors,
            }
          );
          return null;
        }
      }

      const password = await this.getConnectionPassword(connectionId);
      return {
        id: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: password || '',
        createdDate:
          connection.lastConnected?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      Logger.error(
        "Failed to get connection",
        error as Error,
        "ConnectionService.getConnection",
        { connectionId }
      );
      return null;
    }
  }
  async getConnectionPassword(connectionId: string): Promise<string | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        const password = await this.connectionManager.getConnectionPassword(
          connectionId
        );

        if (password) {
          if (attempt > 1) {
            Logger.info(
              "Password retrieved successfully after retry",
              "ConnectionService.getConnectionPassword",
              {
                connectionId,
                attempt,
              }
            );
          }
          return password;
        }

        lastError = new Error("Password not found");
      } catch (error) {
        lastError = error as Error;
        Logger.warn(
          "Password retrieval attempt failed",
          "ConnectionService.getConnectionPassword",
          {
            connectionId,
            attempt,
            error: lastError.message,
          }
        );

        if (attempt < this.options.retryAttempts) {
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    Logger.error(
      "Failed to get connection password after all retries",
      lastError as Error,
      "ConnectionService.getConnectionPassword",
      {
        connectionId,
        attempts: this.options.retryAttempts,
      }
    );

    return null;
  }
  async toDotNetConnection(
    connectionId: string
  ): Promise<ConnectionInfo | null> {
    try {
      const connection = await this.getConnection(connectionId);
      if (!connection) {
        return null;
      }

      const password = await this.getConnectionPassword(connectionId);
      if (!password) {
        return null;
      }

      // Password is already managed securely by ConnectionManager
      return {
        id: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: password, // Password from secure storage
        createdDate: connection.createdDate,
      };
    } catch (error) {
      Logger.error(
        "Failed to convert to DotNet connection",
        error as Error,
        "ConnectionService.toDotNetConnection",
        { connectionId }
      );
      return null;
    }
  }
  async validateConnection(
    connectionId: string
  ): Promise<ConnectionValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // First run ValidationFramework validation for comprehensive checks
      const frameworkValidationReport =
        await this.performConnectionValidationFramework(connectionId);

      // Extract errors and warnings from framework validation
      frameworkValidationReport.results.forEach((result) => {
        if (!result.passed) {
          if (result.severity === "error") {
            errors.push(`ValidationFramework: ${result.message}`);
          } else {
            warnings.push(`ValidationFramework: ${result.message}`);
          }
        }
      });

      // If framework validation fails, don't proceed with basic checks
      if (!frameworkValidationReport.canProceed) {
        return {
          isValid: false,
          errors,
          warnings,
          connectionTime: Date.now() - startTime,
        };
      }

      // Continue with existing basic validation checks
      const connection = this.connectionManager.getConnection(connectionId);
      if (!connection) {
        errors.push(`Connection ${connectionId} not found`);
        return { isValid: false, errors, warnings };
      }

      // Check if password is available
      const password = await this.getConnectionPassword(connectionId);
      if (!password) {
        errors.push("Connection password not available");
        return { isValid: false, errors, warnings };
      }

      // Test actual connectivity via DotNet service
      const dotNetConnection = await this.toDotNetConnection(connectionId);
      if (!dotNetConnection) {
        errors.push("Failed to create DotNet connection info");
        return { isValid: false, errors, warnings };
      }

      try {
        // Test connection with timeout
        await Promise.race([
          this.dotNetService.testConnection(dotNetConnection),
          this.delay(this.options.connectionTimeout),
        ]);

        const connectionTime = Date.now() - startTime;
        warnings.push(`Connection test completed in ${connectionTime}ms`);
      } catch (testError) {
        errors.push(`Connection test failed: ${(testError as Error).message}`);
      }
    } catch (error) {
      errors.push(`Connection validation error: ${(error as Error).message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      connectionTime: Date.now() - startTime,
    };
  }
  getServiceStats(): {
    options: Required<ConnectionServiceOptions>;
    health: "healthy" | "degraded" | "unhealthy";
  } {
    return {
      options: this.options,
      health: "healthy", // Would be determined by connection success rates
    };
  }
  private async performConnectionValidationFramework(connectionId: string) {
    Logger.info(
      "Performing ValidationFramework connection validation",
      "performConnectionValidationFramework",
      {
        connectionId,
      }
    );

    try {
      // Get connection information for validation context
      const connection = this.connectionManager.getConnection(connectionId);
      if (!connection) {
        throw new Error(`Connection ${connectionId} not found`);
      }

      // Create validation context with connection information
      const validationContext = {
        connectionId,
        connectionName: connection.name,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        validationType: "connection",
      };

      // Create validation request for connection-specific rules
      const validationRequest: ValidationRequest = {
        connectionId,
        rules: [
          "connection_connectivity",
          "connection_security",
          "connection_performance",
        ],
        failOnWarnings: false,
        stopOnFirstError: true,
        context: validationContext,
      };

      // Execute validation using the ValidationFramework
      const validationReport = await this.validationFramework.executeValidation(
        validationRequest
      );

      Logger.info(
        "ValidationFramework connection validation completed",
        "performConnectionValidationFramework",
        {
          connectionId,
          totalRules: validationReport.totalRules,
          passedRules: validationReport.passedRules,
          failedRules: validationReport.failedRules,
          overallStatus: validationReport.overallStatus,
          canProceed: validationReport.canProceed,
        }
      );

      return validationReport;
    } catch (error) {
      Logger.error(
        "ValidationFramework connection validation failed",
        error as Error,
        "performConnectionValidationFramework",
        {
          connectionId,
        }
      );

      // Return a failed validation report
      return {
        requestId: connectionId,
        validationTimestamp: new Date(),
        totalRules: 0,
        passedRules: 0,
        failedRules: 1,
        warningRules: 0,
        results: [
          {
            ruleId: "connection_validation_framework",
            ruleName: "Connection Validation Framework Check",
            passed: false,
            severity: "error",
            message: `Connection validation framework error: ${
              (error as Error).message
            }`,
            executionTime: 0,
            timestamp: new Date(),
          },
        ],
        overallStatus: "failed",
        canProceed: false,
        recommendations: [
          "Fix connection validation framework error before proceeding",
        ],
        executionTime: 0,
      };
    }
  }
  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  dispose(): void {
    Logger.info("ConnectionService disposed", "ConnectionService.dispose");
  }
}
