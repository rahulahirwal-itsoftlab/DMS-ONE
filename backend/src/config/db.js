const { Sequelize } = require("sequelize");
require("dotenv").config();

const dialect = process.env.DB_DIALECT || "mysql";
const commonOptions = {
  dialect,
  logging: false,
  define: { underscored: false },
  pool: {
    max: Number(process.env.DB_POOL_MAX || 20),
    min: Number(process.env.DB_POOL_MIN || 5),
    acquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
    idle: Number(process.env.DB_POOL_IDLE || 10000)
  }
};

if (dialect === "postgres") {
  commonOptions.dialectOptions = {
    ssl: process.env.DB_SSL === "false" ? false : { require: true, rejectUnauthorized: false }
  };
} else if (dialect === "mysql") {
  commonOptions.dialectOptions = {
    connectTimeout: 10000,
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
