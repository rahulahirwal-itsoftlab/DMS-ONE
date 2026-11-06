const { sequelize } = require("../models");

const indexesToEnsure = [
  // Orders
  { table: "orders", name: "idx_orders_company_status", fields: ["companyId", "status"] },
  { table: "orders", name: "idx_orders_dealer_status", fields: ["dealerId", "status"] },
  { table: "orders", name: "idx_orders_company_created", fields: ["companyId", "createdAt"] },
  
  // Payments
  { table: "payments", name: "idx_payments_company_status", fields: ["companyId", "paymentStatus"] },
  { table: "payments", name: "idx_payments_dealer_status", fields: ["dealerId", "paymentStatus"] },
  { table: "payments", name: "idx_payments_company_created", fields: ["companyId", "createdAt"] },

  // Inventory
  { table: "company_inventory", name: "idx_company_inv_company_prod", fields: ["companyId", "productId"] },
  { table: "company_inventory", name: "idx_company_inv_company_qty", fields: ["companyId", "quantity"] },
  { table: "dealer_inventory", name: "idx_dealer_inv_company_dealer", fields: ["companyId", "dealerId"] },
  { table: "dealer_inventory", name: "idx_dealer_inv_dealer_prod", fields: ["dealerId", "productId"] },

  // Sales
  { table: "dealer_sales", name: "idx_dealer_sales_company_date", fields: ["companyId", "saleDate"] },
  { table: "dealer_sales", name: "idx_dealer_sales_dealer_date", fields: ["dealerId", "saleDate"] },

  // Users
  { table: "users", name: "idx_users_company_role", fields: ["companyId", "role"] },
  { table: "users", name: "idx_users_dealer_role", fields: ["dealerId", "role"] },
  { table: "users", name: "idx_users_status", fields: ["status"] },

  // Dealers
  { table: "dealers", name: "idx_dealers_company_status", fields: ["companyId", "status"] },
  { table: "dealers", name: "idx_dealers_company_area", fields: ["companyId", "area"] },

  // Products & Variants
  { table: "products", name: "idx_products_company_status", fields: ["companyId", "status"] },
  { table: "products", name: "idx_products_sku", fields: ["sku"] },
  { table: "product_variants", name: "idx_variants_prod_sku", fields: ["productId", "sku"] },

  // Notifications & Messages
  { table: "internal_notifications", name: "idx_notif_company_read", fields: ["companyId", "isRead"] },
  { table: "internal_notifications", name: "idx_notif_user_read", fields: ["userId", "isRead"] },
  { table: "admin_internal_messages", name: "idx_admin_msg_company_created", fields: ["companyId", "createdAt"] }
];

async function addPerformanceIndexes() {
  const queryInterface = sequelize.getQueryInterface();
  let added = 0;
  let skipped = 0;

  for (const item of indexesToEnsure) {
    try {
      // Check if table exists
      const tableExists = await queryInterface.tableExists(item.table);
      if (!tableExists) {
        skipped++;
        continue;
      }

      // Check existing indexes
      const existingIndexes = await queryInterface.showIndex(item.table);
      const exists = existingIndexes.some((idx) => idx.name === item.name);

      if (exists) {
        skipped++;
        continue;
      }

      // Check if all columns exist on the table before creating index
      const tableDescription = await queryInterface.describeTable(item.table);
      const allColsExist = item.fields.every((col) => tableDescription[col]);
      if (!allColsExist) {
        skipped++;
        continue;
      }

      await queryInterface.addIndex(item.table, item.fields, { name: item.name });
      added++;
      console.log(`[Index Created] ${item.table} -> ${item.name} (${item.fields.join(", ")})`);
    } catch (err) {
      console.warn(`[Index Skipped/Error] ${item.table} -> ${item.name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`Performance indexes check completed. Added: ${added}, Skipped/Existing: ${skipped}`);
  return { added, skipped };
}

module.exports = addPerformanceIndexes;

if (require.main === module) {
  addPerformanceIndexes()
    .then(() => {
      console.log("Database index optimization completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to add performance indexes:", err);
      process.exit(1);
    });
}

