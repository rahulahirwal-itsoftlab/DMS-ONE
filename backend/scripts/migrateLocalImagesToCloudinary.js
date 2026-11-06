require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const {
  sequelize,
  Product,
  ProductVariant,
  CreditReward,
  Payment,
  Company,
  AdminInternalMessage
} = require("../src/models");
const cloudinaryService = require("../src/services/cloudinaryService");

const uploadsRoot = path.join(__dirname, "../uploads");

function resolveLocalFilePath(dbPath) {
  if (!dbPath || typeof dbPath !== "string") return null;
  // If it already is an absolute URL or cloudinary URL, ignore
  if (dbPath.startsWith("http://") || dbPath.startsWith("https://")) return null;

  const normalized = dbPath.replace(/^\/+/, "");
  // Try relative to backend root: e.g. "uploads/products/..."
  const fullPath = path.join(__dirname, "..", normalized);
  if (fs.existsSync(fullPath)) return fullPath;

  // Try direct in uploads folder
  const inUploads = path.join(uploadsRoot, path.basename(normalized));
  if (fs.existsSync(inUploads)) return inUploads;

  return null;
}

async function migrateTable({ modelName, model, field, idField = "id", folder, publicIdField }) {
  console.log(`\n--- Scanning ${modelName} for local files in column '${field}' ---`);
  const records = await model.findAll();
  let migrated = 0;
  let skipped = 0;
  let missingFiles = 0;

  for (const record of records) {
    const rawPath = record[field];
    if (!rawPath) {
      skipped++;
      continue;
    }

    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
      skipped++;
      continue;
    }

    const localFile = resolveLocalFilePath(rawPath);
    if (!localFile) {
      console.warn(`[Missing File] Record #${record[idField]} has path "${rawPath}" but file was not found on disk.`);
      missingFiles++;
      continue;
    }

    try {
      console.log(`Uploading ${modelName} #${record[idField]} (${path.basename(localFile)}) to Cloudinary...`);
      const uploadRes = await cloudinaryService.uploadFile(localFile, { folder });
      const updates = { [field]: uploadRes.secure_url };
      if (publicIdField) updates[publicIdField] = uploadRes.public_id;

      await record.update(updates);
      migrated++;
      console.log(`  ✓ Updated ${modelName} #${record[idField]} -> ${uploadRes.secure_url}`);
    } catch (err) {
      console.error(`  ✗ Failed to migrate ${modelName} #${record[idField]}:`, err.message);
    }
  }

  console.log(`${modelName} migration finished. Migrated: ${migrated}, Skipped (already remote/empty): ${skipped}, Missing files: ${missingFiles}`);
  return { migrated, skipped, missingFiles };
}

async function run() {
  console.log("=================================================");
  console.log("  DMS Cloudinary Image & Document Migration Tool ");
  console.log("=================================================");

  if (!cloudinaryService.isConfigured()) {
    console.error("\n[ERROR] Cloudinary credentials are not configured in backend/.env!");
    console.error("Please add the following variables to backend/.env and re-run:");
    console.error("  CLOUDINARY_CLOUD_NAME=your_cloud_name");
    console.error("  CLOUDINARY_API_KEY=your_api_key");
    console.error("  CLOUDINARY_API_SECRET=your_api_secret\n");
    process.exit(1);
  }

  console.log("Cloudinary connection verified.");
  await sequelize.authenticate();
  console.log("Database connection verified.\n");

  const results = {
    products: await migrateTable({
      modelName: "Product",
      model: Product,
      field: "image",
      folder: "products",
      publicIdField: "imagePublicId"
    }),
    productVariants: await migrateTable({
      modelName: "ProductVariant",
      model: ProductVariant,
      field: "image",
      folder: "products",
      publicIdField: "imagePublicId"
    }),
    creditRewards: await migrateTable({
      modelName: "CreditReward",
      model: CreditReward,
      field: "image",
      folder: "rewards",
      publicIdField: "imagePublicId"
    }),
    payments: await migrateTable({
      modelName: "Payment",
      model: Payment,
      field: "invoiceFile",
      folder: "invoices",
      publicIdField: "invoicePublicId"
    }),
    chatMessages: await migrateTable({
      modelName: "AdminInternalMessage",
      model: AdminInternalMessage,
      field: "attachmentUrl",
      folder: "chat"
    }),
    companies: await migrateTable({
      modelName: "Company",
      model: Company,
      field: "logo",
      folder: "organizations",
      publicIdField: "logoPublicId"
    })
  };

  const totalMigrated = Object.values(results).reduce((sum, r) => sum + r.migrated, 0);
  console.log("\n=================================================");
  console.log(`  Migration Complete! Total assets migrated: ${totalMigrated}`);
  console.log("  Existing local files in backend/uploads/ have been");
  console.log("  preserved as backup.");
  console.log("=================================================\n");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed with fatal error:", err);
  process.exit(1);
});

