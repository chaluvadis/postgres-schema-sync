namespace PostgreSqlSchemaCompareSync.Core.Migration;

/// <summary>
/// Splits SQL scripts into executable statements while respecting PostgreSQL syntax constructs.
/// </summary>
internal static class SqlStatementSplitter
{
    public static string[] SplitStatements(string sqlScript)
    {
        if (string.IsNullOrWhiteSpace(sqlScript))
        {
            return [];
        }

        var statements = new List<string>();
        var builder = new StringBuilder();
        var length = sqlScript.Length;
        var inSingleQuote = false;
        var inDoubleQuote = false;
        var inLineComment = false;
        var inBlockComment = false;
        string? dollarTag = null;
        var index = 0;

        while (index < length)
        {
            var current = sqlScript[index];
            var next = index + 1 < length ? sqlScript[index + 1] : '\0';

            if (inLineComment)
            {
                builder.Append(current);
                if (current == '\n')
                {
                    inLineComment = false;
                }

                index++;
                continue;
            }

            if (inBlockComment)
            {
                builder.Append(current);
                if (current == '*' && next == '/')
                {
                    builder.Append(next);
                    inBlockComment = false;
                    index += 2;
                }
                else
                {
                    index++;
                }

                continue;
            }

            if (dollarTag != null)
            {
                if (current == '$' && IsMatch(sqlScript, index, dollarTag))
                {
                    builder.Append(dollarTag);
                    index += dollarTag.Length;
                    dollarTag = null;
                }
                else
                {
                    builder.Append(current);
                    index++;
                }

                continue;
            }

            if (inSingleQuote)
            {
                builder.Append(current);
                if (current == '\'' && next == '\'')
                {
                    builder.Append(next);
                    index += 2;
                    continue;
                }

                if (current == '\'')
                {
                    inSingleQuote = false;
                }

                index++;
                continue;
            }

            if (inDoubleQuote)
            {
                builder.Append(current);
                if (current == '"' && next == '"')
                {
                    builder.Append(next);
                    index += 2;
                    continue;
                }

                if (current == '"')
                {
                    inDoubleQuote = false;
                }

                index++;
                continue;
            }

            if (current == '-' && next == '-')
            {
                builder.Append(current).Append(next);
                inLineComment = true;
                index += 2;
                continue;
            }

            if (current == '/' && next == '*')
            {
                builder.Append(current).Append(next);
                inBlockComment = true;
                index += 2;
                continue;
            }

            if (current == '\'')
            {
                builder.Append(current);
                inSingleQuote = true;
                index++;
                continue;
            }

            if (current == '"')
            {
                builder.Append(current);
                inDoubleQuote = true;
                index++;
                continue;
            }

            if (current == '$')
            {
                var tag = TryReadDollarTag(sqlScript, index);
                if (tag != null)
                {
                    builder.Append(tag);
                    dollarTag = tag;
                    index += tag.Length;
                    continue;
                }
            }

            if (current == ';')
            {
                AppendStatement(builder, statements);
                builder.Clear();
                index++;
                continue;
            }

            builder.Append(current);
            index++;
        }

        AppendStatement(builder, statements);
        return statements.ToArray();
    }

    private static void AppendStatement(StringBuilder builder, List<string> statements)
    {
        var text = builder.ToString().Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var trimmedLeading = text.TrimStart();
        if (trimmedLeading.StartsWith("--", StringComparison.Ordinal))
        {
            return;
        }

        if (trimmedLeading.StartsWith("/*", StringComparison.Ordinal) && trimmedLeading.EndsWith("*/", StringComparison.Ordinal))
        {
            return;
        }

        statements.Add(text);
    }

    private static string? TryReadDollarTag(string text, int startIndex)
    {
        if (text[startIndex] != '$')
        {
            return null;
        }

        var end = startIndex + 1;
        while (end < text.Length)
        {
            var ch = text[end];
            if (ch == '$')
            {
                end++;
                return text[startIndex..end];
            }

            if (!char.IsLetterOrDigit(ch) && ch != '_')
            {
                return null;
            }

            end++;
        }

        return null;
    }

    private static bool IsMatch(string text, int index, string tag)
    {
        if (index + tag.Length > text.Length)
        {
            return false;
        }

        for (var offset = 0; offset < tag.Length; offset++)
        {
            if (text[index + offset] != tag[offset])
            {
                return false;
            }
        }

        return true;
    }
}
