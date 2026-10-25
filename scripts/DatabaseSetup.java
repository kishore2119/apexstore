import java.sql.*;
import java.util.*;

/** Creates service databases or schemas; Flyway owns application tables and migrations. */
class DatabaseSetup {
    private static final List<String> SERVICES = List.of("users", "products", "orders", "invoices");

    public static void main(String[] args) throws Exception {
        String database = System.getenv("DATABASE_NAME");
        if (database != null && !database.isBlank()) {
            database = database.trim();
            if (!database.matches("[A-Za-z_][A-Za-z0-9_]{0,62}")) {
                throw new IllegalArgumentException("DATABASE_NAME must be a SQL identifier of at most 63 letters, digits or underscores.");
            }
        } else {
            database = null;
        }
        String url = System.getenv("DATABASE_SETUP_URL");
        if (url == null || url.isBlank()) {
            String host = System.getenv("DATABASE_HOST");
            if (host == null || host.isBlank()) {
                throw new IllegalArgumentException("Set DATABASE_HOST or DATABASE_SETUP_URL before initializing the databases.");
            }
            url = "jdbc:postgresql://" + host + ":26257/defaultdb?sslmode=verify-full"
                    + "&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory&connectTimeout=15&socketTimeout=30";
        } else if (!url.startsWith("jdbc:postgresql://")) {
            throw new IllegalArgumentException("DATABASE_SETUP_URL must be a PostgreSQL JDBC connection URL.");
        }
        try (Connection connection = DriverManager.getConnection(url,
                System.getenv("DB_USERNAME"), System.getenv("DB_PASSWORD"))) {
            Set<String> existing = databases(connection);
            if (database != null) {
                // Check every existing target schema before making changes. Public and other schemas are left alone.
                if (existing.contains(database)) {
                    for (String service : SERVICES) {
                        requireManagedSchema(connection, database, service);
                    }
                }
                createDatabase(connection, database, existing.contains(database));
                try (Statement statement = connection.createStatement()) {
                    for (String service : SERVICES) {
                        statement.execute("CREATE SCHEMA IF NOT EXISTS " + identifier(database) + "." + identifier(service));
                        System.out.println(database + "." + service + ": schema ready");
                    }
                }
            } else {
                // Compatibility mode for existing installations with one database per service.
                for (String service : SERVICES) {
                    String name = service + "_db";
                    if (existing.contains(name)) {
                        requireManagedSchema(connection, name, "public");
                    }
                }
                for (String service : SERVICES) {
                    String name = service + "_db";
                    createDatabase(connection, name, existing.contains(name));
                }
            }
        }
    }

    private static Set<String> databases(Connection connection) throws SQLException {
        Set<String> result = new HashSet<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery("SHOW DATABASES")) {
            while (rows.next()) result.add(rows.getString(1));
        }
        return result;
    }

    private static void requireManagedSchema(Connection connection, String database, String schema) throws SQLException {
        String sql = "SELECT count(*), count(*) FILTER (WHERE table_name='flyway_schema_history') FROM "
                + identifier(database) + ".information_schema.tables WHERE table_schema=?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, schema);
            try (ResultSet rows = statement.executeQuery()) {
                rows.next();
                if (rows.getLong(1) > 0 && rows.getLong(2) == 0) {
                    throw new IllegalStateException(database + "." + schema
                            + " already contains unmanaged tables; refusing to reuse it");
                }
            }
        }
    }

    private static void createDatabase(Connection connection, String name, boolean exists) throws SQLException {
        if (exists) {
            System.out.println(name + ": existing database retained");
        } else {
            try (Statement statement = connection.createStatement()) {
                statement.execute("CREATE DATABASE IF NOT EXISTS " + identifier(name));
            }
            System.out.println(name + ": database ready");
        }
    }

    private static String identifier(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }
}
