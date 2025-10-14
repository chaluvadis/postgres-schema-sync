namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata
{
    /// <summary>
    /// Interface for extracting metadata from database objects
    /// </summary>
    public interface ISchemaMetadataExtractor : IDisposable
    {
        /// <summary>
        /// Extracts comprehensive metadata for database objects
        /// </summary>
        Task<List<DatabaseObject>> ExtractMetadataAsync(
            ConnectionInfo connectionInfo,
            List<ObjectType>? objectTypes = null,
            string? schemaFilter = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Extracts metadata for a specific object
        /// </summary>
        Task<DatabaseObjectDetails> ExtractObjectMetadataAsync(
            ConnectionInfo connectionInfo,
            ObjectType objectType,
            string schema,
            string objectName,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Extracts dependency information for objects
        /// </summary>
        Task<Dictionary<string, List<string>>> ExtractDependenciesAsync(
            ConnectionInfo connectionInfo,
            List<DatabaseObject> objects,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Validates object integrity and consistency
        /// </summary>
        Task<ObjectValidationResult> ValidateObjectAsync(
            ConnectionInfo connectionInfo,
            DatabaseObject databaseObject,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Result of object validation
    /// </summary>
    public class ObjectValidationResult
    {
        public bool IsValid { get; set; }
        public List<string> Errors { get; set; } = [];
        public List<string> Warnings { get; set; } = [];
        public Dictionary<string, object> Metadata { get; set; } = [];
    }
}