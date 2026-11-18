const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const { verifyMailTransport, sendTestEmail, getMailConfig } = require("../src/utils/mailService");

(async () => {
  console.log("=========================================");
  console.log("       DMS SMTP Verification Test        ");
  console.log("=========================================\n");

  try {
    const config = getMailConfig();
    console.log("[Config Details]:");
    console.log(`  Host: ${config.host}`);
    console.log(`  Port: ${config.port}`);
    console.log(`  Secure: ${config.secure}`);
    console.log(`  RequireTLS: ${config.requireTLS}`);
    console.log(`  User: ${config.user}`);
    console.log(`  From: ${config.from}`);
    console.log(`  Pass configured: ${config.pass ? "YES (" + config.pass.length + " chars)" : "NO"}\n`);

    console.log("Verifying SMTP connection and credentials with smtp.gmail.com...");
    const verifyResult = await verifyMailTransport({ force: true });
    console.log("\n>>> SMTP Verification SUCCESSFUL! <<<");
    console.log(verifyResult);

    console.log("\nAttempting to send a test email to:", config.user);
    const info = await sendTestEmail();
    console.log(">>> Test email delivered successfully! <<<");
    console.log(`  Message ID: ${info.messageId}`);
    console.log(`  Response: ${info.response}`);
    console.log("\n=========================================");
  } catch (error) {
    console.error("\n>>> SMTP Verification / Delivery FAILED <<<");
    console.error(`Status: ${error.status || 500}`);
    console.error(`Code: ${error.code || "UNKNOWN"}`);
    console.error(`Message: ${error.message}\n`);
    process.exitCode = 1;
  }
})();
