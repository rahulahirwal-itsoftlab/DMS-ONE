require("dotenv").config();
const app = require("./app");
const { sequelize } = require("./models");
const ensureDatabase = require("./utils/ensureDatabase");
const migrateMissingColumns = require("./utils/migrateMissingColumns");
const addPerformanceIndexes = require("./utils/addPerformanceIndexes");
const { ensureSuperAdminAccount } = require("./utils/ensureSuperAdminAccount");
const { startScheduledMessagesJob } = require("./jobs/scheduledMessagesJob");

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await ensureDatabase();
    await sequelize.authenticate();
    await sequelize.sync();
    await migrateMissingColumns();
    await addPerformanceIndexes();
    await ensureSuperAdminAccount();
    startScheduledMessagesJob();
    const server = app.listen(PORT, () => console.log(`DMS API running on port ${PORT}`));

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
  } catch (error) {
    console.error("Unable to start server", error);
    process.exit(1);
  }
})();
