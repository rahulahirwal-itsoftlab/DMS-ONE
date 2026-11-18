const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

// Global resilience handlers to prevent server crashes on transient network / DB blips
process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRITICAL] Unhandled Promise Rejection:", reason);
  // Logged safely without exiting the process
});

process.on("uncaughtException", (error) => {
  console.error("[CRITICAL] Uncaught Exception:", error);
  const isSocketError = error && (
    error.code === "ECONNRESET" ||
    error.code === "EPIPE" ||
    error.code === "ETIMEDOUT" ||
    (error.message && error.message.includes("Connection terminated unexpectedly"))
  );
  if (isSocketError) {
    console.warn("[WARNING] Transient socket error caught by uncaughtException handler. Server kept running.");
    return;
  }
});

const app = require("./app");
const { sequelize } = require("./models");
const ensureDatabase = require("./utils/ensureDatabase");
const migrateMissingColumns = require("./utils/migrateMissingColumns");
const addPerformanceIndexes = require("./utils/addPerformanceIndexes");
const { ensureSuperAdminAccount } = require("./utils/ensureSuperAdminAccount");
const { startScheduledMessagesJob } = require("./jobs/scheduledMessagesJob");

const PORT = process.env.PORT || 5000;

// 1. Immediately bind HTTP port so requests never receive ERR_CONNECTION_REFUSED
const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`  DMS API listening on http://localhost:${PORT}`);
  console.log(`  Process ID: ${process.pid}`);
  console.log(`=========================================`);
});

// 2. Perform DB initialization and migrations asynchronously in background
(async () => {
  try {
    await ensureDatabase();
    console.log("[DB] Connecting to database...");
    await sequelize.authenticate();
    console.log("[DB] Database authenticated successfully.");

    // Smart sync: only run full table scan if DB_SYNC=true or if core tables are missing
    const queryInterface = sequelize.getQueryInterface();
    const usersTableExists = await queryInterface.tableExists("users").catch(() => false);
    if (!usersTableExists || process.env.DB_SYNC === "true") {
      console.log("[DB] Running schema sync...");
      await sequelize.sync();
      console.log("[DB] Schema sync complete.");
    }

    console.log("[DB] Checking schema migrations & seed defaults...");
    await migrateMissingColumns();
    console.log("[DB] Checking performance indexes...");
    await addPerformanceIndexes();
    await ensureSuperAdminAccount();
    startScheduledMessagesJob();
    console.log("[DB] System initialization fully complete and ready.");
  } catch (error) {
    console.error("[DB Init Error] Database background initialization encountered an issue:", error.message || error);
  }
})();

// 3. Graceful shutdown handler
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await sequelize.close();
      console.log("Database connection pool closed cleanly.");
      process.exit(0);
    } catch (err) {
      console.error("Error during database shutdown:", err);
      process.exit(1);
    }
  });
  setTimeout(() => {
    console.error("Forcefully shutting down after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
