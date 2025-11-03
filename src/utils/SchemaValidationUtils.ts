import { Logger } from './Logger';

export class SchemaValidationUtils {
  /**
   * Validates SchemaDifference object structure
   */
  static validateSchemaDifference(change: any): boolean {
    if (!change || typeof change !== 'object') {
      Logger.warn('SchemaDifference validation failed: change must be a valid object', 'SchemaValidationUtils.validateSchemaDifference');
      return false;
    }

    const requiredFields = ['type', 'objectType', 'objectName', 'schema', 'differenceDetails'];
    for (const field of requiredFields) {
      if (!(field in change)) {
        Logger.warn(`SchemaDifference validation failed: missing required field '${field}'`, 'SchemaValidationUtils.validateSchemaDifference');
        return false;
      }
    }

    const validTypes = ['Added', 'Removed', 'Modified'];
    if (!validTypes.includes(change.type)) {
      Logger.warn(`SchemaDifference validation failed: invalid type '${change.type}'`, 'SchemaValidationUtils.validateSchemaDifference');
      return false;
    }

    return true;
  }

  /**
   * Validates MigrationStep object structure
   */
  static validateMigrationStep(step: any): boolean {
    if (!step || typeof step !== 'object') {
      Logger.warn('MigrationStep validation failed: step must be a valid object', 'SchemaValidationUtils.validateMigrationStep');
      return false;
    }

    const requiredFields = ['id', 'order', 'name', 'sqlScript', 'objectType', 'objectName', 'schema', 'operation'];
    for (const field of requiredFields) {
      if (!(field in step)) {
        Logger.warn(`MigrationStep validation failed: missing required field '${field}'`, 'SchemaValidationUtils.validateMigrationStep');
        return false;
      }
    }

    return true;
  }

  /**
   * Validates EnhancedMigrationScript object structure
   */
  static validateEnhancedMigrationScript(script: any): boolean {
    if (!script || typeof script !== 'object') {
      Logger.warn('EnhancedMigrationScript validation failed: script must be a valid object', 'SchemaValidationUtils.validateEnhancedMigrationScript');
      return false;
    }

    const requiredFields = ['id', 'name', 'sourceSchema', 'targetSchema', 'migrationSteps'];
    for (const field of requiredFields) {
      if (!(field in script)) {
        Logger.warn(`EnhancedMigrationScript validation failed: missing required field '${field}'`, 'SchemaValidationUtils.validateEnhancedMigrationScript');
        return false;
      }
    }

    return true;
  }
}