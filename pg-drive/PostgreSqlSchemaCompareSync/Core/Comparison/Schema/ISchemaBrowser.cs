namespace PostgreSqlSchemaCompareSync.Core.Comparison.Schema
{
    /// <summary>
    /// Interface for browsing database schema objects
    /// </summary>
    public interface ISchemaBrowser : IDisposable
    {
        /// <summary>
        /// Gets all database objects for a connection
        /// </summary>
        Task<List<DatabaseObject>> GetDatabaseObjectsAsync(
            ConnectionInfo connectionInfo,
            string? schemaFilter = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets detailed information about a specific database object
        /// </summary>
        Task<DatabaseObjectDetails> GetObjectDetailsAsync(
            ConnectionInfo connectionInfo,
            ObjectType objectType,
            string schema,
            string objectName,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Searches for database objects by name or pattern
        /// </summary>
        Task<List<DatabaseObject>> SearchObjectsAsync(
            ConnectionInfo connectionInfo,
            string searchTerm,
            List<ObjectType>? objectTypes = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets dependencies for a database object
        /// </summary>
        Task<List<string>> GetObjectDependenciesAsync(
            ConnectionInfo connectionInfo,
            ObjectType objectType,
            string schema,
            string objectName,
            CancellationToken cancellationToken = default);
    }
}