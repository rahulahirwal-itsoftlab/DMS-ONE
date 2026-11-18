const path = require("path");
const { Sequelize } = require("sequelize");

// Ensure .env is loaded correctly from backend directory or project root
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const isPostgresUrl = Boolean(process.env.DATABASE_URL && (
  process.env.DATABASE_URL.startsWith("postgres://") ||
  process.env.DATABASE_URL.startsWith("postgresql://")
));
const dialect = process.env.DB_DIALECT || (isPostgresUrl ? "postgres" : "mysql");

const commonOptions = {
  dialect,
  logging: false,
  define: { underscored: false },
  pool: {
    // Serverless NeonDB / PgBouncer pooler optimizations:
    // min: 0 ensures connections are not held open indefinitely to avoid serverless socket drops
    max: Number(process.env.DB_POOL_MAX || (dialect === "postgres" ? 10 : 20)),
    min: Number(process.env.DB_POOL_MIN || 0),
    acquire: Number(process.env.DB_POOL_ACQUIRE || 60000),
    idle: Number(process.env.DB_POOL_IDLE || 5000),
    evict: Number(process.env.DB_POOL_EVICT || 5000)
  },
  retry: {
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/,
      /Connection terminated unexpectedly/,
      /ECONNRESET/,
      /ETIMEDOUT/,
      /EPIPE/,
      /EAI_AGAIN/
    ],
    max: 3
  }
};

if (dialect === "postgres") {
  commonOptions.dialectOptions = {
    ssl: process.env.DB_SSL === "false" ? false : { require: true, rejectUnauthorized: false },
    keepAlive: true,
    statement_timeout: 30000
  };
} else if (dialect === "mysql") {
  commonOptions.dialectOptions = {
    connectTimeout: 15000,
    decimalNumbers: true
  };
}

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, commonOptions)
  : new Sequelize(
    process.env.DB_NAME || "dms_db",
    process.env.DB_USER || "root",
    process.env.DB_PASSWORD || "Ram1234",
    {
      ...commonOptions,
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || (dialect === "postgres" ? 5432 : 3306)
    }
  );

module.exports = sequelize;
