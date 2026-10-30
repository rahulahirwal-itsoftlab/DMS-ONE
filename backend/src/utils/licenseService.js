const { Op, fn, col } = require("sequelize");
const { Company, Dealer, LicensePlan, LicensePurchaseRequest, User } = require("../models");

const ORGANIZATION_ROLES = ["ADMIN", "ADMIN_CEO", "DEALER_MANAGER", "PRODUCT_DELIVERY_MANAGER", "FINANCE_MANAGER"];
const DEALER_MANAGER_ROLES = ["DEALER_STOCK_INVENTORY_MANAGER", "DEALER_STOCK_DELIVERY_MANAGER", "DEALER_SALES_FINANCE_MANAGER"];

async function licenseCapacity(companyId, options = {}) {
  const query = options.transaction ? { transaction: options.transaction } : {};
  const [company, organizationUsers, dealers, plans, pendingRequests] = await Promise.all([
    Company.findByPk(companyId, { attributes: ["id", "numberOfLicenses"], ...(options.transaction ? { transaction: options.transaction, lock: options.transaction.LOCK.UPDATE } : {}) }),
    User.count({ where: { companyId, dealerId: null, role: { [Op.in]: ORGANIZATION_ROLES } }, ...query }),
    Dealer.findAll({ where: { companyId }, attributes: ["id", "dealerName", "allocatedLicenses"], ...query }),
    LicensePlan.findAll({ where: { status: "active" }, order: [["price", "ASC"]], ...query }),
    LicensePurchaseRequest.findAll({ where: { companyId, status: { [Op.in]: ["REQUESTED", "SALES_APPROVED", "FINANCE_PENDING", "PAYMENT_CONFIRMED"] } }, include: [LicensePlan], order: [["createdAt", "DESC"]], ...query })
  ]);
  if (!company) { const error = new Error("Organization not found"); error.status = 404; throw error; }
  const dealerAllocations = dealers.reduce((sum, dealer) => sum + Math.max(1, Number(dealer.allocatedLicenses || 1)), 0);
  const total = Math.max(1, Number(company.numberOfLicenses || 1));
  const used = organizationUsers + dealerAllocations;
  return {
    totalLicenses: total, usedLicenses: used, availableLicenses: Math.max(0, total - used),
    organizationUsers, dealerAllocations, dealerCount: dealers.length,
    dealers: dealers.map((dealer) => ({ id: dealer.id, dealerName: dealer.dealerName, allocatedLicenses: Math.max(1, Number(dealer.allocatedLicenses || 1)) })),
    plans, pendingRequests, limitReached: used >= total,
    capacity: total, remainingSlots: Math.max(0, total - used), licenses: []
  };
}

async function dealerLicenseCapacity(dealerId, options = {}) {
  const query = options.transaction ? { transaction: options.transaction } : {};
  const dealer = await Dealer.findByPk(dealerId, { attributes: ["id", "companyId", "dealerName", "allocatedLicenses"], ...query });
  if (!dealer) { const error = new Error("Dealer not found"); error.status = 404; throw error; }
  const managerCount = await User.count({ where: { dealerId, role: { [Op.in]: DEALER_MANAGER_ROLES } }, ...query });
  const total = Math.max(1, Number(dealer.allocatedLicenses || 1));
  const used = 1 + managerCount;
  return { dealerId, totalLicenses: total, usedLicenses: used, availableLicenses: Math.max(0, total - used), managerCount, limitReached: used >= total };
}

function licenseLimitError(message, licenseStatus) {
  const error = new Error(message);
  error.status = 403;
  error.code = "LICENSE_LIMIT_REACHED";
  error.licenseStatus = licenseStatus;
  return error;
}

async function licenseOverview() {
  const [totalCompanies, totalDealers, soldLicenses, revenueRows, pendingRequests, paymentPendingRequests, companies] = await Promise.all([
    Company.count(), Dealer.count(), Company.sum("numberOfLicenses"),
    Promise.all([
      LicensePurchaseRequest.findAll({ where: { paymentStatus: "PAID" }, attributes: [[fn("SUM", col("amount")), "total"]] }),
      Company.findAll({ where: { paymentStatus: "PAID" }, attributes: [[fn("SUM", col("subscriptionAmount")), "total"]] })
    ]),
    LicensePurchaseRequest.count({ where: { status: "REQUESTED" } }),
    LicensePurchaseRequest.count({ where: { status: { [Op.in]: ["SALES_APPROVED", "FINANCE_PENDING"] } } }),
    Company.findAll({ include: [Dealer] })
  ]);
  const revenue = Number(revenueRows[0]?.[0]?.get("total") || 0) + Number(revenueRows[1]?.[0]?.get("total") || 0);
  const topCompanies = companies.map((company) => ({ id: company.id, companyName: company.companyName, dealers: company.Dealers?.length || 0, licenseQuantity: Number(company.numberOfLicenses || 0), dealerCapacity: Number(company.numberOfLicenses || 0) })).sort((a, b) => b.licenseQuantity - a.licenseQuantity).slice(0, 5);
  return { totalCompanies, totalDealers, soldLicenses: Number(soldLicenses || 0), revenue, pendingRequests, paymentPendingRequests, topCompanies };
}

module.exports = { licenseCapacity, dealerLicenseCapacity, licenseLimitError, licenseOverview };
