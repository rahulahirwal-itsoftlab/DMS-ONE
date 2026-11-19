const { Op, fn, col } = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const {
  sequelize,
  Product,
  ProductVariant,
  CompanyInventory,
  DealerInventory,
  DealerExchangeInventory,
  DealerSale,
  InternalNotification,
  Order,
  OrderItem,
  DeliveryTracking,
  OrderScheduledMessage,
  Payment,
  Policy,
  Message,
  Report,
  DealerCreditWallet,
  DealerCreditTransaction,
  CreditReward,
  CreditRedemption,
  Dealer,
  User
} = require("../models");
const { progressForStatus, activeDeliveryStep, daysUntil } = require("../utils/delivery");
const { awardCreditCoinsForPayment, getOrCreateWallet } = require("../utils/credit");
const cacheService = require("../services/cacheService");
const { broadcastChatMessage } = require("../services/websocketService");

function daysUnpaid(payment) {
  if (payment.paymentStatus === "paid") return 0;
  const start = payment.orderApprovedAt || payment.paymentRequestSentAt || payment.createdAt;
  if (!start) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86400000));
}

const scope = (req) => ({ companyId: req.user.companyId, dealerId: req.user.dealerId });

exports.dashboard = asyncHandler(async (req, res) => {
  const cacheKey = cacheService.key(req.user.companyId, "dealer_dashboard", req.user.dealerId);
  const data = await cacheService.getOrSet(cacheKey, 15, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const wallet = await DealerCreditWallet.findOne({ where: scope(req) });
    const balance = Number(wallet?.balance || 0);

    const [stockRows, lowStockCount, orderCounts, purchaseRows, pendingPayments, todaySalesRows, monthSalesRows, recentSales, monthEarned, redeemed, activeRewards, affordableRewardsCount] = await Promise.all([
      DealerInventory.findAll({ where: scope(req), attributes: [[fn("SUM", col("quantity")), "total"]] }),
      DealerInventory.count({ where: { ...scope(req), quantity: { [Op.lte]: col("lowStockLimit") } } }),
      Order.findAll({
        where: scope(req),
        attributes: ["status", [fn("COUNT", col("id")), "count"]],
        group: ["status"],
        raw: true
      }),
      Order.findAll({ where: { ...scope(req), status: { [Op.ne]: "rejected" } }, attributes: [[fn("SUM", col("totalAmount")), "total"]] }),
      Payment.count({ where: { ...scope(req), paymentStatus: "pending" } }),
      DealerSale.findAll({ where: { ...scope(req), saleDate: today }, attributes: [[fn("SUM", col("quantitySold")), "total"]] }),
      DealerSale.findAll({ where: { ...scope(req), saleDate: { [Op.gte]: monthStart } }, attributes: [[fn("SUM", col("quantitySold")), "total"]] }),
      DealerSale.findAll({
        where: scope(req),
        include: [
          { model: Product, attributes: ["id", "productName", "sku", "image"] },
          { model: ProductVariant, attributes: ["id", "variantName", "colorName", "image"] }
        ],
        order: [["createdAt", "DESC"]],
        limit: 5
      }),
      DealerCreditTransaction.sum("coins", { where: { ...scope(req), type: "EARN", createdAt: { [Op.gte]: monthStart } } }),
      DealerCreditTransaction.sum("coins", { where: { ...scope(req), type: "REDEEM" } }),
      CreditReward.count({ where: { companyId: req.user.companyId, status: "active", quantity: { [Op.gt]: 0 } } }),
      balance > 0 ? CreditReward.count({ where: { companyId: req.user.companyId, status: "active", quantity: { [Op.gt]: 0 }, requiredCoins: { [Op.lte]: balance } } }) : Promise.resolve(0)
    ]);

    const orderMap = Object.fromEntries(orderCounts.map((o) => [o.status, Number(o.count || 0)]));

    return {
      ownTotalStock: Number(stockRows[0]?.get("total") || 0),
      lowStockCount,
      pendingOrders: orderMap.pending || 0,
      approvedOrders: orderMap.approved || 0,
      deliveredOrders: orderMap.delivered || 0,
      rejectedOrders: orderMap.rejected || 0,
      totalPurchaseAmount: Number(purchaseRows[0]?.get("total") || 0),
      pendingPayments,
      todaySalesUnits: Number(todaySalesRows[0]?.get("total") || 0),
      monthSalesUnits: Number(monthSalesRows[0]?.get("total") || 0),
      recentSales,
      creditBalance: balance,
      coinsEarnedThisMonth: Number(monthEarned || 0),
      coinsRedeemed: Number(redeemed || 0),
      affordableRewardsCount: Number(affordableRewardsCount || 0),
      activeRewardsCount: activeRewards
    };
  });
  res.json(data);
});

exports.availableStock = asyncHandler(async (req, res) => {
  const productWhere = { companyId: req.user.companyId, status: "active" };
  if (req.query.search) productWhere.productName = { [Op.like]: `%${req.query.search}%` };
  if (req.query.category) productWhere.category = req.query.category;
  res.json(await CompanyInventory.findAll({
    where: { companyId: req.user.companyId },
    include: [{ model: Product, where: productWhere, include: [{ model: ProductVariant, as: "variants", where: { status: "active" }, required: false }] }]
  }));
});

exports.createOrder = asyncHandler(async (req, res) => {
  const items = req.body.items || [];
  if (!items.length) return res.status(400).json({ message: "Order items are required" });
  const order = await sequelize.transaction(async (transaction) => {
    let totalAmount = 0;
    const preparedItems = [];
    for (const row of items) {
      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ message: "Quantity must be at least 1" });
      const product = await Product.findOne({ where: { id: row.productId, companyId: req.user.companyId, status: "active" }, transaction });
      if (!product) return res.status(400).json({ message: "Invalid product" });
      let variant = null;
      let availableStock = 0;
      let price = Number(product.price || 0);
      if (row.productVariantId) {
        variant = await ProductVariant.findOne({
          where: { id: row.productVariantId, companyId: req.user.companyId, productId: product.id, status: "active" },
          lock: transaction.LOCK.UPDATE,
          transaction
        });
        if (!variant) {
          const error = new Error("Invalid variant or color selection");
          error.status = 400;
          throw error;
        }
        availableStock = Number(variant.stockQuantity || 0);
        price = Number(variant.priceOverride || product.price || 0);
      } else {
        const inventory = await CompanyInventory.findOne({
          where: { companyId: req.user.companyId, productId: product.id },
          lock: transaction.LOCK.UPDATE,
          transaction
        });
        availableStock = inventory?.quantity || 0;
      }
      if (quantity > availableStock) {
        const error = new Error("You cannot order more than available stock");
        error.status = 400;
        error.availableStock = availableStock;
        error.requestedQuantity = quantity;
        throw error;
      }
      const creditCoinsEarned = Number(product.creditCoins || 0) * quantity;
      const subtotal = price * quantity;
      totalAmount += subtotal;
      preparedItems.push({
        productId: product.id,
        productVariantId: variant?.id || null,
        variantName: variant?.variantName || null,
        colorName: variant?.colorName || null,
        quantity,
        price,
        creditCoinsEarned,
        subtotal
      });
    }
    const created = await Order.create({
      orderNumber: `DMS-${Date.now()}`,
      companyId: req.user.companyId,
      dealerId: req.user.dealerId,
      status: "pending",
      currentDeliveryStep: "pending",
      deliveryProgress: 0,
      totalAmount
    }, { transaction });
    await OrderItem.bulkCreate(preparedItems.map((item) => ({ ...item, orderId: created.id })), { transaction });
    await DeliveryTracking.create({ orderId: created.id, status: "pending", message: "Order Requested", updatedBy: req.user.id }, { transaction });
    return created;
  }).catch((error) => {
    if (error.status === 400) {
      res.status(400).json({ message: error.message, availableStock: error.availableStock, requestedQuantity: error.requestedQuantity });
      return null;
    }
    throw error;
  });
  if (!order) return;
  res.status(201).json(await Order.findByPk(order.id, { include: [{ model: OrderItem, as: "items", include: [Product, ProductVariant] }] }));
});

exports.orders = asyncHandler(async (req, res) => {
  const priority = { pending: 1, approved: 2, packing: 3, shipping: 4, out_for_delivery: 5, rejected: 6, delivered: 7 };
  const orders = await Order.findAll({
    where: scope(req),
    include: [{ model: OrderItem, as: "items", include: [Product, ProductVariant] }, { model: DeliveryTracking, as: "tracking" }, { model: OrderScheduledMessage, as: "scheduledMessages" }],
    order: [["createdAt", "DESC"]]
  });
  res.json(orders.sort((a, b) => (priority[a.status] || 99) - (priority[b.status] || 99) || new Date(b.createdAt) - new Date(a.createdAt)));
});

exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.id, ...scope(req) } });
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.status !== "pending") return res.status(400).json({ message: "Only pending orders can be cancelled" });
  await order.update({ status: "cancelled", rejectionReason: "Cancelled by dealer manager" });
  await DeliveryTracking.create({ orderId: order.id, status: "cancelled", message: "Order cancelled by dealer manager", updatedBy: req.user.id });
  res.json(order);
});

exports.delivery = asyncHandler(async (req, res) => {
  const orders = await Order.findAll({
    where: { ...scope(req), status: { [Op.notIn]: ["pending", "rejected", "cancelled"] } },
    include: [{ model: OrderItem, as: "items", include: [Product, ProductVariant] }, { model: DeliveryTracking, as: "tracking" }, { model: OrderScheduledMessage, as: "scheduledMessages" }],
    order: [["updatedAt", "DESC"]]
  });
  res.json(orders.map((order) => ({
    ...order.toJSON(),
    progressPercentage: progressForStatus(order.status),
    activeStep: activeDeliveryStep(order.status),
    daysLeftUntilDelivered: daysUntil(order.deliveredDate)
  })));
});

exports.stockRequest = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.body.productId, companyId: req.user.companyId } });
  if (!product) return res.status(404).json({ message: "Product not found" });
  const inventory = await CompanyInventory.findOne({ where: { companyId: req.user.companyId, productId: product.id } });
  const availableStock = Number(req.body.availableStock ?? inventory?.quantity ?? 0);
  const requestedQuantity = Number(req.body.requestedQuantity);
  const message = await Message.create({
    companyId: req.user.companyId,
    senderId: req.user.id,
    receiverId: null,
    dealerId: req.user.dealerId,
    conversationId: `${req.user.companyId}-${req.user.dealerId}`,
    title: "Stock request",
    message: req.body.message,
    messageType: "stock_request",
    productId: product.id,
    requestedQuantity,
    availableStock,
    isRead: false
  });
  const fullMessage = await Message.findByPk(message.id, {
    include: [{ model: User, as: "sender", attributes: ["id", "name", "role"] }]
  });
  broadcastChatMessage(fullMessage || message);
  res.status(201).json({ message: fullMessage || message, productName: product.productName });
});

exports.inventory = asyncHandler(async (req, res) => {
  const [main, exchange] = await Promise.all([
    DealerInventory.findAll({ where: scope(req), include: [Product, ProductVariant] }),
    DealerExchangeInventory.findAll({ where: scope(req), include: [Product, ProductVariant] })
  ]);
  const exchangeByKey = new Map(exchange.map((row) => [`${row.productId}:${row.productVariantId || ""}`, Number(row.quantity || 0)]));
  const mainKeys = new Set(main.map((row) => `${row.productId}:${row.productVariantId || ""}`));
  res.json([...main.map((row) => {
    const exchangeQuantity = exchangeByKey.get(`${row.productId}:${row.productVariantId || ""}`) || 0;
    return { ...row.toJSON(), mainQuantity: Number(row.quantity || 0), exchangeQuantity, quantity: Number(row.quantity || 0) + exchangeQuantity };
  }), ...exchange.filter((row) => !mainKeys.has(`${row.productId}:${row.productVariantId || ""}`)).map((row) => ({ ...row.toJSON(), id: `exchange-${row.id}`, mainQuantity: 0, exchangeQuantity: Number(row.quantity || 0), quantity: Number(row.quantity || 0) }))]);
});

exports.updateInventory = asyncHandler(async (req, res) => {
  const inv = await DealerInventory.findOne({ where: { id: req.params.id, ...scope(req) } });
  if (!inv) return res.status(404).json({ message: "Inventory record not found" });
  await inv.update({ quantity: req.body.quantity, lowStockLimit: req.body.lowStockLimit });
  res.json(inv);
});

exports.updateLowStockLimit = asyncHandler(async (req, res) => {
  const lowStockLimit = Number(req.body.lowStockLimit);
  if (!Number.isInteger(lowStockLimit) || lowStockLimit < 0) return res.status(400).json({ message: "lowStockLimit must be 0 or greater" });
  const inv = await DealerInventory.findOne({ where: { id: req.params.id, ...scope(req) }, include: [Product, ProductVariant] });
  if (!inv) return res.status(404).json({ message: "Inventory record not found" });
  await inv.update({ lowStockLimit });
  res.json(inv);
});

exports.sales = asyncHandler(async (req, res) => {
  const where = scope(req);
  if (req.query.date) where.saleDate = req.query.date;
  if (req.query.productId) where.productId = req.query.productId;
  res.json(await DealerSale.findAll({ where, include: [Product, ProductVariant], order: [["saleDate", "DESC"], ["createdAt", "DESC"]] }));
});

exports.createSale = asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId);
  const productVariantId = req.body.productVariantId ? Number(req.body.productVariantId) : null;
  const quantitySold = Number(req.body.quantitySold);
  const saleDate = req.body.saleDate || new Date().toISOString().slice(0, 10);
  if (!Number.isInteger(productId)) return res.status(400).json({ message: "productId is required" });
  if (!Number.isInteger(quantitySold) || quantitySold <= 0) return res.status(400).json({ message: "quantitySold must be greater than 0" });

  const sale = await sequelize.transaction(async (transaction) => {
    const inventory = await DealerInventory.findOne({
      where: { ...scope(req), productId, productVariantId },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const exchangeInventory = await DealerExchangeInventory.findOne({
      where: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, productVariantId },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!inventory && !exchangeInventory) { const error = new Error("Product is not available in your inventory"); error.status = 404; throw error; }
    const mainStock = Number(inventory?.quantity || 0);
    const exchangeStock = Number(exchangeInventory?.quantity || 0);
    const availableStock = mainStock + exchangeStock;
    if (quantitySold > availableStock) {
      const error = new Error("You cannot sell more than available inventory stock");
      error.status = 400;
      error.availableStock = availableStock;
      error.requestedQuantity = quantitySold;
      throw error;
    }
    const mainSold = Math.min(mainStock, quantitySold);
    const exchangeSold = quantitySold - mainSold;
    const stockAfter = availableStock - quantitySold;
    const created = await DealerSale.create({
      companyId: req.user.companyId,
      dealerId: req.user.dealerId,
      productId,
      productVariantId,
      variantName: inventory?.variantName || exchangeInventory?.variantName,
      colorName: inventory?.colorName || exchangeInventory?.colorName,
      saleDate,
      quantitySold,
      stockBefore: availableStock,
      stockAfter,
      remarks: req.body.remarks || null,
      createdBy: req.user.id
    }, { transaction });
    if (inventory && mainSold) await inventory.update({ quantity: mainStock - mainSold }, { transaction });
    if (exchangeInventory && exchangeSold) await exchangeInventory.update({ quantity: exchangeStock - exchangeSold }, { transaction });

    const limit = Number(inventory?.lowStockLimit || 0);
    if (stockAfter <= limit) {
      let productName = "Product";
      const product = await Product.findByPk(productId, { transaction });
      if (product?.productName) productName = product.productName;
      const message = `${productName} has low stock in your inventory. Current stock: ${stockAfter}. Minimum limit: ${limit}.`;
      const existing = await InternalNotification.findOne({
        where: {
          companyId: req.user.companyId,
          dealerId: req.user.dealerId,
          type: "LOW_STOCK",
          isRead: false,
          title: "Low Stock Alert",
          message: { [Op.like]: `${productName}%` }
        },
        transaction
      });
      const payload = {
        companyId: req.user.companyId,
        dealerId: req.user.dealerId,
        roleTarget: "DEALER",
        title: "Low Stock Alert",
        message,
        type: "LOW_STOCK",
        priority: stockAfter === 0 ? "CRITICAL" : "HIGH",
        metadata: { productId, productName, saleId: created.id, stockAfter, lowStockLimit: limit }
      };
      if (existing) await existing.update(payload, { transaction });
      else await InternalNotification.create(payload, { transaction });
    }
    return created;
  }).catch((error) => {
    if (error.status) {
      res.status(error.status).json({ message: error.message, availableStock: error.availableStock, requestedQuantity: error.requestedQuantity });
      return null;
    }
    throw error;
  });
  if (!sale) return;
  res.status(201).json(await DealerSale.findByPk(sale.id, { include: [Product, ProductVariant] }));
});

exports.finance = asyncHandler(async (req, res) => {
  const payments = (await Payment.findAll({
    where: scope(req),
    include: [{ model: Order, include: [{ model: OrderItem, as: "items", include: [Product, ProductVariant] }] }, Dealer],
    order: [["createdAt", "DESC"]]
  })).map((payment) => ({ ...payment.toJSON(), daysUnpaid: daysUnpaid(payment) })).sort((a, b) => {
    const isUnsettled = (s) => s === "pending" || s === "under_review";
    if (isUnsettled(a.paymentStatus) && isUnsettled(b.paymentStatus)) {
      if (a.paymentStatus === "under_review" && b.paymentStatus !== "under_review") return -1;
      if (b.paymentStatus === "under_review" && a.paymentStatus !== "under_review") return 1;
      return b.daysUnpaid - a.daysUnpaid || new Date(b.createdAt) - new Date(a.createdAt);
    }
    if (isUnsettled(a.paymentStatus)) return -1;
    if (isUnsettled(b.paymentStatus)) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  res.json(payments);
});

exports.pay = asyncHandler(async (req, res) => {
  const method = String(req.body.paymentMethod || "").trim().toLowerCase();
  const allowed = ["online", "cash", "upi", "card", "bank_transfer", "net_banking"];
  if (!allowed.includes(method)) return res.status(400).json({ message: "paymentMethod must be online, cash, or upi" });
  
  const payment = await Payment.findOne({ where: { id: req.params.paymentId, ...scope(req) } });
  if (!payment) return res.status(404).json({ message: "Payment request not found" });
  if (payment.paymentStatus === "paid") return res.status(400).json({ message: "This payment has already been verified and paid" });
  if (payment.paymentStatus === "under_review") return res.status(400).json({ message: "Payment has already been submitted and is under review by Organization Finance Manager" });

  const txnId = req.body.transactionId || (method === "cash" ? `CASH-${Date.now().toString().slice(-6)}` : `TXN-${Date.now()}`);

  await payment.update({
    paymentStatus: "under_review",
    paymentMethod: method,
    paidAt: new Date(),
    paidBy: req.user.id,
    transactionId: txnId
  });

  await Message.create({
    companyId: req.user.companyId,
    senderId: req.user.id,
    receiverId: null,
    dealerId: req.user.dealerId,
    conversationId: `${req.user.companyId}-${req.user.dealerId}`,
    title: "Payment submitted - Verification required",
    message: `Payment submitted for order #${payment.orderNumber || payment.orderId}. Amount: Rs ${payment.amount}. Method: ${method}. Transaction ID: ${txnId}. Awaiting Organization Finance confirmation.`,
    messageType: "system_finance",
    orderNumber: payment.orderNumber,
    isRead: false
  });

  res.json(await Payment.findByPk(payment.id, { include: [{ model: Order, include: [{ model: OrderItem, as: "items", include: [Product, ProductVariant] }] }] }));
});

exports.creditWallet = asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user.companyId, req.user.dealerId);
  res.json(wallet);
});

exports.creditStore = asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user.companyId, req.user.dealerId);
  const where = { companyId: req.user.companyId, status: "active" };
  if (req.query.category) where.category = req.query.category;
  if (req.query.search) where.title = { [Op.like]: `%${req.query.search}%` };
  if (req.query.affordable === "true") where.requiredCoins = { [Op.lte]: Number(wallet.balance || 0) };
  const rewards = await CreditReward.findAll({ where, order: [["requiredCoins", "ASC"], ["createdAt", "DESC"]] });
  const categories = await CreditReward.findAll({ where: { companyId: req.user.companyId, status: "active" }, attributes: ["category"], group: ["category"] });
  res.json({ wallet, rewards, categories: categories.map((row) => row.category).filter(Boolean) });
});

exports.redeemCreditReward = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const reward = await CreditReward.findOne({
      where: { id: req.params.rewardId, companyId: req.user.companyId, status: "active" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!reward) {
      const error = new Error("Reward is not available");
      error.status = 404;
      throw error;
    }
    if (Number(reward.quantity || 0) <= 0) {
      const error = new Error("Reward is out of stock");
      error.status = 400;
      throw error;
    }
    const wallet = await getOrCreateWallet(req.user.companyId, req.user.dealerId, transaction);
    await wallet.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const requiredCoins = Number(reward.requiredCoins || 0);
    const before = Number(wallet.balance || 0);
    if (before < requiredCoins) {
      const error = new Error("Insufficient credit coins");
      error.status = 400;
      throw error;
    }
    const after = before - requiredCoins;
    const redemption = await CreditRedemption.create({
      companyId: req.user.companyId,
      dealerId: req.user.dealerId,
      rewardId: reward.id,
      coinsUsed: requiredCoins,
      status: "PENDING",
      requestedAt: new Date()
    }, { transaction });
    await wallet.update({ balance: after, totalRedeemed: Number(wallet.totalRedeemed || 0) + requiredCoins }, { transaction });
    await reward.decrement("quantity", { by: 1, transaction });
    await DealerCreditTransaction.create({
      companyId: req.user.companyId,
      dealerId: req.user.dealerId,
      redemptionId: redemption.id,
      type: "REDEEM",
      coins: requiredCoins,
      balanceBefore: before,
      balanceAfter: after,
      description: `Redeemed ${reward.title}`
    }, { transaction });
    const dealer = await Dealer.findByPk(req.user.dealerId, { transaction });
    await InternalNotification.create({
      companyId: req.user.companyId,
      dealerId: req.user.dealerId,
      roleTarget: "ADMIN",
      title: "Reward redemption",
      message: `${dealer?.dealerName || req.user.name || "Dealer"} redeemed ${reward.title} using ${requiredCoins} coins.`,
      type: "GENERAL",
      priority: "MEDIUM",
      metadata: { rewardId: reward.id, redemptionId: redemption.id }
    }, { transaction });
    return redemption;
  }).catch((error) => {
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return null;
    }
    throw error;
  });
  if (!result) return;
  res.status(201).json(await CreditRedemption.findByPk(result.id, { include: [{ model: CreditReward, as: "reward" }] }));
});

exports.creditRedemptions = asyncHandler(async (req, res) => {
  res.json(await CreditRedemption.findAll({ where: scope(req), include: [{ model: CreditReward, as: "reward" }], order: [["createdAt", "DESC"]] }));
});

exports.creditTransactions = asyncHandler(async (req, res) => {
  res.json(await DealerCreditTransaction.findAll({ where: scope(req), order: [["createdAt", "DESC"]], limit: 100 }));
});

exports.policies = asyncHandler(async (req, res) => {
  res.json(await Policy.findAll({ where: { companyId: req.user.companyId, visibleToDealers: true }, order: [["createdAt", "DESC"]] }));
});

exports.messages = asyncHandler(async (req, res) => {
  res.json(await Message.findAll({
    where: {
      companyId: req.user.companyId,
      [Op.or]: [{ dealerId: req.user.dealerId }, { receiverId: req.user.id }, { receiverId: null, dealerId: null }]
    },
    order: [["createdAt", "DESC"]]
  }));
});

exports.conversation = asyncHandler(async (req, res) => {
  const conversationId = `${req.user.companyId}-${req.user.dealerId}`;
  res.json(await Message.findAll({
    where: {
      companyId: req.user.companyId,
      [Op.or]: [{ conversationId }, { conversationId: `${req.user.companyId}-all` }, { dealerId: req.user.dealerId }, { dealerId: null, receiverId: null }]
    },
    order: [["createdAt", "ASC"]]
  }));
});

exports.reply = asyncHandler(async (req, res) => {
  const conversationId = `${req.user.companyId}-${req.user.dealerId}`;
  const message = await Message.create({
    companyId: req.user.companyId,
    senderId: req.user.id,
    receiverId: null,
    dealerId: req.user.dealerId,
    conversationId,
    title: "Dealer reply",
    message: req.body.message,
    isRead: false
  });
  const fullMessage = await Message.findByPk(message.id, {
    include: [{ model: User, as: "sender", attributes: ["id", "name", "role"] }]
  });
  broadcastChatMessage(fullMessage || message);
  res.status(201).json(fullMessage || message);
});

exports.createReport = asyncHandler(async (req, res) => {
  res.status(201).json(await Report.create({ ...req.body, companyId: req.user.companyId, dealerId: req.user.dealerId }));
});
