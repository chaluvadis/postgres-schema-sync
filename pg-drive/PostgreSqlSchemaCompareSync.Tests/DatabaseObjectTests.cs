namespace PostgreSqlSchemaCompareSync.Tests;

public class DatabaseObjectTests
{
    [Fact]
    public void Table_Definition_ShouldGenerateValidCreateStatement()
    {
        // Arrange
        var table = new Table
        {
            Name = "test_table",
            Schema = "public",
            Database = "test_db"
        };
        var column = new Column
        {
            Name = "id",
            DataType = "integer",
            IsNullable = false
        };
        table.Columns.Add(column);
        // Act
        var definition = table.Definition;
        // Assert
        Assert.Contains("CREATE TABLE", definition);
        Assert.Contains("test_db.public.test_table", definition);
        Assert.Contains("id integer NOT NULL", definition);
    }
    [Fact]
    public void Domain_Definition_ShouldGenerateValidCreateStatement()
    {
        // Arrange
        var domain = new Domain
        {
            Name = "positive_int",
            Schema = "public",
            Database = "test_db",
            BaseType = "integer",
            CheckConstraint = "VALUE > 0"
        };
        // Act
        var definition = domain.Definition;
        // Assert
        Assert.Contains("CREATE DOMAIN", definition);
        Assert.Contains("test_db.public.positive_int", definition);
        Assert.Contains("integer", definition);
        Assert.Contains("CHECK (VALUE > 0)", definition);
    }
    [Fact]
    public void Collation_Definition_ShouldGenerateValidCreateStatement()
    {
        // Arrange
        var collation = new Collation
        {
            Name = "case_insensitive",
            Schema = "public",
            Database = "test_db",
            Provider = "icu",
            IsDeterministic = true,
            Collate = "und-u-ks-level1",
            Ctype = "und-u-ks-level1"
        };
        // Act
        var definition = collation.Definition;
        // Assert
        Assert.Contains("CREATE COLLATION", definition);
        Assert.Contains("test_db.public.case_insensitive", definition);
        Assert.Contains("provider = icu", definition);
        Assert.Contains("deterministic = True", definition);
    }
    [Fact]
    public void Extension_Definition_ShouldGenerateValidCreateStatement()
    {
        // Arrange
        var extension = new Extension
        {
            Name = "uuid-ossp",
            Schema = "public",
            Database = "test_db",
            ExtVersion = "1.1"
        };
        // Act
        var definition = extension.Definition;
        // Assert
        Assert.Contains("CREATE EXTENSION IF NOT EXISTS", definition);
        Assert.Contains("uuid-ossp", definition);
        Assert.Contains("VERSION 1.1", definition);
    }
    [Fact]
    public void Role_Definition_ShouldGenerateValidCreateStatement()
    {
        // Arrange
        var role = new Role
        {
            Name = "app_user",
            Schema = "pg_catalog",
            Database = "test_db",
            IsSuperuser = false,
            CanCreateDatabases = false,
            CanCreateRoles = false,
            CanLogin = true
        };
        // Act
        var definition = role.Definition;
        // Assert
        Assert.Contains("CREATE ROLE", definition);
        Assert.Contains("app_user", definition);
        Assert.Contains("NOSUPERUSER", definition);
        Assert.Contains("NOCREATEDB", definition);
        Assert.Contains("NOCREATEROLE", definition);
        Assert.Contains("LOGIN", definition);
    }
    [Fact]
    public void Tablespace_Definition_ShouldGenerateValidCreateStatement()
    {
        // Arrange
        var tablespace = new Tablespace
        {
            Name = "app_tablespace",
            Schema = "pg_catalog",
            Database = "test_db",
            Owner = "postgres",
            Location = "/var/lib/postgresql/tablespaces/app"
        };
        // Act
        var definition = tablespace.Definition;
        // Assert
        Assert.Contains("CREATE TABLESPACE", definition);
        Assert.Contains("app_tablespace", definition);
        Assert.Contains("OWNER postgres", definition);
        Assert.Contains("/var/lib/postgresql/tablespaces/app", definition);
    }
    [Fact]
    public void DatabaseObject_QualifiedName_ShouldBeFormattedCorrectly()
    {
        // Arrange
        var table = new Table
        {
            Database = "test_db",
            Schema = "public",
            Name = "users"
        };
        // Act
        var qualifiedName = table.QualifiedName;
        // Assert
        Assert.Equal("test_db.public.users", qualifiedName);
    }
    [Fact]
    public void ObjectType_Enum_ShouldContainAllExpectedValues()
    {
        // Arrange & Act
        var objectTypes = Enum.GetValues(typeof(ObjectType)).Cast<ObjectType>();
        // Assert
        Assert.Contains(ObjectType.Table, objectTypes);
        Assert.Contains(ObjectType.View, objectTypes);
        Assert.Contains(ObjectType.Function, objectTypes);
        Assert.Contains(ObjectType.Procedure, objectTypes);
        Assert.Contains(ObjectType.Trigger, objectTypes);
        Assert.Contains(ObjectType.Index, objectTypes);
        Assert.Contains(ObjectType.Sequence, objectTypes);
        Assert.Contains(ObjectType.Type, objectTypes);
        Assert.Contains(ObjectType.Domain, objectTypes);
        Assert.Contains(ObjectType.Collation, objectTypes);
        Assert.Contains(ObjectType.Extension, objectTypes);
        Assert.Contains(ObjectType.Role, objectTypes);
        Assert.Contains(ObjectType.Tablespace, objectTypes);
    }
}