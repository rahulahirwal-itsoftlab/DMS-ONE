const { Op } = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const {
  sequelize,
  User,
  Dealer,
  Product,
  ProductVariant,
  CompanyInventory,
  DealerInventory,
  DealerExchangeInventory,
  DealerStockTransferRequest,
  DealerStockTransferLog,
  InternalNotification,
  Message
} = require("../models");

const activeStatuses = ["REQUESTED", "MANAGER_APPROVED", "TRANSFER_COMPLETED"];
function enabled(req, res, next) {
  if (process.env.ENABLE_DEALER_STOCK_EXCHANGE === "false") return res.status(404).json({ message: "Dealer Stock Exchange is disabled" });
  next();
}

function variantWhere(productVariantId) {
  return productVariantId ? { productVariantId } : { productVariantId: { [Op.is]: null } };
}

function requireExchangeManager(req, res, next) {
  if (req.user?.role !== "DEALER_STOCK_DELIVERY_MANAGER") return res.status(403).json({ message: "Dealer Stock & Delivery Manager access is required" });
  if (!req.user.dealerId || !req.user.companyId) return res.status(403).json({ message: "Dealer and organization access are required" });
  next();
}

function requestInclude() {
  return [
    { model: Dealer, as: "requesterDealer", attributes: ["id", "dealerName", "ownerName", "area", "city", "address", "pincode"] },
    { model: Dealer, as: "senderDealer", attributes: ["id", "dealerName", "ownerName", "area", "city", "address", "pincode"] },
    { model: Product, attributes: ["id", "productName", "sku", "image"] },
    { model: ProductVariant, attributes: ["id", "variantName", "colorName"] }
  ];
}

async function dealerDisplay(dealerId) {
  const dealer = await Dealer.findByPk(dealerId);
  return dealer?.dealerName || `Dealer #${dealerId}`;
}

async function notifyCompanyRoles(companyId, roles, payload, transaction) {
  const users = await User.findAll({ where: { companyId, role: roles, status: "active" }, transaction });
  await Promise.all(users.map((user) => InternalNotification.create({
    companyId,
    userId: user.id,
    roleTarget: "ADMIN",
    title: payload.title,
    message: payload.message,
    type: "INVENTORY",
    priority: payload.priority || "MEDIUM",
    metadata: payload.metadata || null
  }, { transaction })));
}

async function notifyDealer(companyId, dealerId, payload, transaction) {
  await InternalNotification.create({
    companyId,
    dealerId,
    roleTarget: "DEALER",
    title: payload.title,
    message: payload.message,
    type: "INVENTORY",
    priority: payload.priority || "MEDIUM",
    metadata: payload.metadata || null
  }, { transaction });
}

async function createDealerMessage(companyId, dealerId, senderId, title, text, transaction) {
  await Message.create({
    companyId,
    senderId,
    receiverId: null,
    dealerId,
    conversationId: `${companyId}-${dealerId}`,
    title,
    message: text,
    messageType: "dealer_stock_exchange",
    isRead: false
  }, { transaction });
}

async function logAction(request, action, actionBy, message, transaction) {
  await DealerStockTransferLog.create({ transferRequestId: request.id, companyId: request.companyId, action, actionBy, message }, { transaction });
}

async function currentSenderStock(request, transaction) {
  return DealerInventory.findOne({
    where: {
      companyId: request.companyId,
      dealerId: request.senderDealerId,
      productId: request.productId,
      ...variantWhere(request.productVariantId)
    },
    lock: transaction ? true : undefined,
    transaction
  });
}

exports.enabled = enabled;

exports.requireExchangeManager = requireExchangeManager;

exports.inventory = asyncHandler(async (req, res) => {
  const [main, exchange] = await Promise.all([
    DealerInventory.findAll({ where: { companyId: req.user.companyId, dealerId: req.user.dealerId, quantity: { [Op.gt]: 0 } }, include: [Product, ProductVariant], order: [[Product, "productName", "ASC"]] }),
    DealerExchangeInventory.findAll({ where: { companyId: req.user.companyId, dealerId: req.user.dealerId, quantity: { [Op.gt]: 0 } }, include: [Product, ProductVariant], order: [[Product, "productName", "ASC"]] })
  ]);
  res.json({ main, exchange });
});

exports.moveInventory = asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId), productVariantId = req.body.productVariantId ? Number(req.body.productVariantId) : null, amount = Number(req.body.quantity);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ message: "Quantity must be a positive whole number" });
  const result = await sequelize.transaction(async (transaction) => {
    const main = await DealerInventory.findOne({ where: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, ...variantWhere(productVariantId) }, lock: true, transaction });
    if (!main || Number(main.quantity) < amount) { const error = new Error("Quantity exceeds main inventory available"); error.status = 400; throw error; }
    const [exchange] = await DealerExchangeInventory.findOrCreate({ where: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, ...variantWhere(productVariantId) }, defaults: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, productVariantId, variantName: main.variantName, colorName: main.colorName, quantity: 0 }, transaction, lock: transaction.LOCK.UPDATE });
    await main.update({ quantity: Number(main.quantity) - amount }, { transaction });
    await exchange.update({ quantity: Number(exchange.quantity) + amount }, { transaction });
    return exchange;
  }).catch((error) => { if (error.status) { res.status(error.status).json({ message: error.message }); return null; } throw error; });
  if (result) res.json({ message: "Moved into exchange inventory", inventory: result });
});

exports.removeInventory = asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId), productVariantId = req.body.productVariantId ? Number(req.body.productVariantId) : null, amount = Number(req.body.quantity);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ message: "Quantity must be a positive whole number" });
  const result = await sequelize.transaction(async (transaction) => {
    const exchange = await DealerExchangeInventory.findOne({ where: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, ...variantWhere(productVariantId) }, lock: true, transaction });
    if (!exchange || Number(exchange.quantity) < amount) { const error = new Error("Quantity exceeds exchange inventory available"); error.status = 400; throw error; }
    const [main] = await DealerInventory.findOrCreate({ where: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, ...variantWhere(productVariantId) }, defaults: { companyId: req.user.companyId, dealerId: req.user.dealerId, productId, productVariantId, variantName: exchange.variantName, colorName: exchange.colorName, quantity: 0, lowStockLimit: 5 }, transaction, lock: transaction.LOCK.UPDATE });
    await exchange.update({ quantity: Number(exchange.quantity) - amount }, { transaction });
    await main.update({ quantity: Number(main.quantity) + amount }, { transaction });
  }).catch((error) => { if (error.status) { res.status(error.status).json({ message: error.message }); return false; } throw error; });
  if (result !== false) res.json({ message: "Returned to main inventory" });
});

exports.search = asyncHandler(async (req, res) => {
  const term = String(req.query.q || req.query.sku || "").trim();
  const selectedId = Number(req.query.productId);
  if (!term && !selectedId) return res.status(400).json({ message: "Product name or SKU is required" });
  const products = await Product.findAll({
    where: { companyId: req.user.companyId, status: "active", ...(selectedId ? { id: selectedId } : { [Op.or]: [{ sku: { [Op.like]: `%${term}%` } }, { productName: { [Op.like]: `%${term}%` } }] }) },
    include: [{ model: CompanyInventory }, { model: ProductVariant, as: "variants", where: { status: "active" }, required: false }],
    order: [["productName", "ASC"]], limit: 10
  });
  if (!products.length) return res.status(404).json({ message: "Product not found" });
  const product = products[0];
  const dealerInventory = await DealerExchangeInventory.findAll({
    where: { companyId: req.user.companyId, productId: product.id, dealerId: { [Op.ne]: req.user.dealerId }, quantity: { [Op.gt]: 0 } },
    include: [{ model: Dealer, where: { companyId: req.user.companyId, status: "active" } }, ProductVariant],
    order: [[Dealer, "dealerName", "ASC"]]
  });
  const selectedProduct = products.find((item) => item.id === selectedId) || product;
  const matchingInventory = selectedProduct?.id === product.id ? dealerInventory : await DealerExchangeInventory.findAll({ where: { companyId: req.user.companyId, productId: selectedId, dealerId: { [Op.ne]: req.user.dealerId }, quantity: { [Op.gt]: 0 } }, include: [{ model: Dealer, where: { companyId: req.user.companyId, status: "active" } }, ProductVariant], order: [[Dealer, "dealerName", "ASC"]] });
  res.json({ suggestions: products.map(({ id, productName, sku }) => ({ id, productName, sku })),
    product: {
      id: selectedProduct.id,
      productName: selectedProduct.productName,
      sku: selectedProduct.sku,
      image: selectedProduct.image,
      description: selectedProduct.description,
      companyStock: Number(selectedProduct.CompanyInventory?.quantity || 0),
      isCompanyOutOfStock: Number(selectedProduct.CompanyInventory?.quantity || 0) <= 0
    },
    availableDealers: matchingInventory.map((item) => ({
      dealerId: item.dealerId,
      dealerName: item.Dealer?.dealerName,
      ownerName: item.Dealer?.ownerName,
      city: item.Dealer?.city,
      area: item.Dealer?.area,
      address: item.Dealer?.address,
      pincode: item.Dealer?.pincode,
      productId: item.productId,
      productVariantId: item.productVariantId,
      variantName: item.variantName || item.ProductVariant?.variantName,
      colorName: item.colorName || item.ProductVariant?.colorName,
      skuSuffix: item.ProductVariant?.skuSuffix,
      availableQuantity: Number(item.quantity || 0),
      lowStockLimit: Number(item.lowStockLimit || 0)
    }))
  });
});

exports.createRequest = asyncHandler(async (req, res) => {
  const senderDealerId = Number(req.body.senderDealerId);
  const productId = Number(req.body.productId);
  const productVariantId = req.body.productVariantId ? Number(req.body.productVariantId) : null;
  const requestedQuantity = Number(req.body.requestedQuantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) return res.status(400).json({ message: "requestedQuantity must be greater than 0" });
  if (senderDealerId === Number(req.user.dealerId)) return res.status(400).json({ message: "You cannot request stock from yourself" });

  const result = await sequelize.transaction(async (transaction) => {
    const [sender, requester, product] = await Promise.all([
      Dealer.findOne({ where: { id: senderDealerId, companyId: req.user.companyId, status: "active" }, transaction }),
      Dealer.findOne({ where: { id: req.user.dealerId, companyId: req.user.companyId, status: "active" }, transaction }),
      Product.findOne({ where: { id: productId, companyId: req.user.companyId, status: "active" }, transaction })
    ]);
    if (!sender || !requester) {
      const error = new Error("Requester and sender must belong to the same company");
      error.status = 400;
      throw error;
    }
    if (!product) {
      const error = new Error("Product not found");
      error.status = 404;
      throw error;
    }
    const inventory = await DealerExchangeInventory.findOne({
      where: { companyId: req.user.companyId, dealerId: senderDealerId, productId, ...variantWhere(productVariantId), quantity: { [Op.gt]: 0 } },
      lock: true,
      transaction
    });
    if (!inventory) {
      const error = new Error("Sender dealer does not have stock for this product");
      error.status = 400;
      throw error;
    }
    const available = Number(inventory.quantity || 0);
    if (requestedQuantity > available) {
      const error = new Error("Requested quantity cannot exceed sender dealer available stock");
      error.status = 400;
      error.availableStock = available;
      throw error;
    }
    const duplicate = await DealerStockTransferRequest.findOne({
      where: { companyId: req.user.companyId, requesterDealerId: req.user.dealerId, senderDealerId, productId, ...variantWhere(productVariantId), isReturn: false,
        [Op.or]: [{ status: { [Op.in]: ["REQUESTED", "MANAGER_APPROVED"] } }, { status: "TRANSFER_COMPLETED", exchangeReceivedAt: { [Op.is]: null } }] },
      transaction
    });
    if (duplicate) {
      const error = new Error("An active request for this product from this dealer already exists");
      error.status = 409;
      throw error;
    }
    const request = await DealerStockTransferRequest.create({
      companyId: req.user.companyId,
      requesterDealerId: req.user.dealerId,
      senderDealerId,
      productId,
      productVariantId,
      sku: product.sku,
      productNameSnapshot: product.productName,
      variantNameSnapshot: inventory.variantName,
      colorNameSnapshot: inventory.colorName,
      requestedQuantity,
      availableQuantityAtRequest: available,
      reason: req.body.reason || null,
      status: "REQUESTED"
    }, { transaction });
    const text = `New inter-dealer stock request: ${requester.dealerName} requested ${requestedQuantity} ${product.productName} from ${sender.dealerName}.`;
    await notifyDealer(req.user.companyId, senderDealerId, { title: "Stock requested from your inventory", message: `${requester.dealerName} has requested ${requestedQuantity} ${product.productName} from your inventory. Awaiting your product and delivery manager's approval.`, metadata: { transferRequestId: request.id } }, transaction);
    await createDealerMessage(req.user.companyId, senderDealerId, req.user.id, "Inter-dealer stock request", `${requester.dealerName} has requested ${requestedQuantity} ${product.productName} from your inventory. Awaiting your manager's approval.`, transaction);
    await logAction(request, "REQUESTED", req.user.id, text, transaction);
    return request;
  }).catch((error) => {
    if (error.status) {
      res.status(error.status).json({ message: error.message, availableStock: error.availableStock });
      return null;
    }
    throw error;
  });
  if (!result) return;
  res.status(201).json(await DealerStockTransferRequest.findByPk(result.id, { include: requestInclude() }));
});

exports.sentRequests = asyncHandler(async (req, res) => {
  const where = { companyId: req.user.companyId, requesterDealerId: req.user.dealerId, isReturn: false };
  if (req.query.status && req.query.status !== "ALL") where.status = req.query.status;
  if (req.query.search) {
    where[Op.or] = [{ productNameSnapshot: { [Op.like]: `%${req.query.search}%` } }, { sku: { [Op.like]: `%${req.query.search}%` } }];
  }
  res.json(await DealerStockTransferRequest.findAll({ where, include: requestInclude(), order: [["createdAt", "DESC"]] }));
});

exports.receivedRequests = asyncHandler(async (req, res) => {
  const where = { companyId: req.user.companyId, senderDealerId: req.user.dealerId, isReturn: false };
  if (req.query.search) {
    where[Op.or] = [{ productNameSnapshot: { [Op.like]: `%${req.query.search}%` } }, { sku: { [Op.like]: `%${req.query.search}%` } }];
  }
  res.json(await DealerStockTransferRequest.findAll({ where, include: requestInclude(), order: [["createdAt", "DESC"]] }));
});

exports.incomingRequests = asyncHandler(async (req, res) => {
  const rows = await DealerStockTransferRequest.findAll({ where: { companyId: req.user.companyId, senderDealerId: req.user.dealerId, isReturn: false }, include: requestInclude(), order: [["createdAt", "DESC"]] });
  res.json(rows);
});

exports.returnRequests = asyncHandler(async (req, res) => {
  const rows = await DealerStockTransferRequest.findAll({ where: { companyId: req.user.companyId, isReturn: true, [Op.or]: [{ requesterDealerId: req.user.dealerId }, { senderDealerId: req.user.dealerId }] }, include: requestInclude(), order: [["createdAt", "DESC"]] });
  res.json(rows);
});

exports.acceptRequest = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, senderDealerId: req.user.dealerId, isReturn: false, status: "REQUESTED" } });
  if (!request) return res.status(404).json({ message: "Pending incoming request not found" });
  await request.update({ status: "MANAGER_APPROVED", managerApprovedBy: req.user.id, managerApprovedAt: new Date() });
  await logAction(request, "MANAGER_APPROVED", req.user.id, "Accepted by sender dealer Stock & Delivery Manager");
  await notifyDealer(request.companyId, request.requesterDealerId, { title: "Exchange request accepted", message: `${request.productNameSnapshot} request accepted. The sender will dispatch it shortly.`, metadata: { transferRequestId: request.id } });
  res.json(request);
});

exports.rejectRequest = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, senderDealerId: req.user.dealerId, status: "REQUESTED" } });
  if (!request) return res.status(404).json({ message: "Pending incoming request not found" });
  await request.update({ status: "MANAGER_REJECTED", managerApprovedBy: req.user.id, managerApprovedAt: new Date(), managerRejectReason: req.body.reason || "Rejected by sender dealer" });
  await logAction(request, "MANAGER_REJECTED", req.user.id, request.managerRejectReason);
  await notifyDealer(request.companyId, request.requesterDealerId, { title: "Exchange request declined", message: request.managerRejectReason, metadata: { transferRequestId: request.id } });
  res.json(request);
});

exports.dispatch = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, senderDealerId: req.user.dealerId, status: "MANAGER_APPROVED" } });
  if (!request) return res.status(404).json({ message: "Accepted request not found" });
  const result = await sequelize.transaction(async (transaction) => {
    const locked = await DealerStockTransferRequest.findByPk(request.id, { lock: true, transaction });
    const stock = await DealerExchangeInventory.findOne({ where: { companyId: locked.companyId, dealerId: locked.senderDealerId, productId: locked.productId, ...variantWhere(locked.productVariantId) }, lock: true, transaction });
    if (!stock || Number(stock.quantity) < Number(locked.requestedQuantity)) { const error = new Error("Exchange inventory no longer has enough stock"); error.status = 400; throw error; }
    await stock.update({ quantity: Number(stock.quantity) - Number(locked.requestedQuantity) }, { transaction });
    await locked.update({ status: "TRANSFER_COMPLETED", completedAt: new Date(), exchangeReceivedAt: null }, { transaction });
    await logAction(locked, "TRANSFER_DISPATCHED", req.user.id, "Sender dispatched the exchange stock", transaction);
    await notifyDealer(locked.companyId, locked.requesterDealerId, { title: "Exchange stock dispatched", message: `${locked.requestedQuantity} ${locked.productNameSnapshot} is on its way. Mark it received when delivered.`, metadata: { transferRequestId: locked.id } }, transaction);
    return locked;
  }).catch((error) => { if (error.status) { res.status(error.status).json({ message: error.message }); return null; } throw error; });
  if (result) res.json(result);
});

exports.receive = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, requesterDealerId: req.user.dealerId, status: "TRANSFER_COMPLETED", exchangeReceivedAt: { [Op.is]: null }, isReturn: false } });
  if (!request) return res.status(404).json({ message: "Dispatched exchange transfer not found" });
  await sequelize.transaction(async (transaction) => {
    const locked = await DealerStockTransferRequest.findByPk(request.id, { lock: true, transaction });
    if (locked.exchangeReceivedAt) { const error = new Error("This transfer has already been received"); error.status = 409; throw error; }
    const [stock] = await DealerExchangeInventory.findOrCreate({ where: { companyId: locked.companyId, dealerId: locked.requesterDealerId, productId: locked.productId, ...variantWhere(locked.productVariantId) }, defaults: { companyId: locked.companyId, dealerId: locked.requesterDealerId, productId: locked.productId, productVariantId: locked.productVariantId, variantName: locked.variantNameSnapshot, colorName: locked.colorNameSnapshot, quantity: 0 }, transaction, lock: transaction.LOCK.UPDATE });
    await stock.update({ quantity: Number(stock.quantity) + Number(locked.requestedQuantity) }, { transaction });
    await locked.update({ exchangeReceivedAt: new Date() }, { transaction });
    await logAction(locked, "TRANSFER_RECEIVED", req.user.id, "Requester confirmed receipt into exchange inventory", transaction);
    await notifyDealer(locked.companyId, locked.senderDealerId, { title: "Exchange stock received", message: `Requester confirmed receipt of ${locked.productNameSnapshot}. It can be requested back when no longer needed.`, metadata: { transferRequestId: locked.id } }, transaction);
  });
  res.json({ message: "Received into your exchange inventory" });
});

exports.createReturn = asyncHandler(async (req, res) => {
  const original = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, requesterDealerId: req.user.dealerId, isReturn: false, exchangeReceivedAt: { [Op.ne]: null } } });
  if (!original) return res.status(404).json({ message: "Received exchange transfer not found" });
  const held = Number(original.requestedQuantity) - Number(original.returnedQuantity || 0);
  const amount = Number(req.body.quantity || held);
  if (!Number.isInteger(amount) || amount <= 0 || amount > held) return res.status(400).json({ message: `Return quantity must be between 1 and ${held}` });
  const result = await sequelize.transaction(async (transaction) => {
    const stock = await DealerExchangeInventory.findOne({ where: { companyId: original.companyId, dealerId: req.user.dealerId, productId: original.productId, ...variantWhere(original.productVariantId) }, lock: true, transaction });
    if (!stock || Number(stock.quantity) < amount) { const error = new Error("Return quantity exceeds your exchange inventory"); error.status = 400; throw error; }
    await stock.update({ quantity: Number(stock.quantity) - amount }, { transaction });
    const returnRequest = await DealerStockTransferRequest.create({ companyId: original.companyId, requesterDealerId: original.senderDealerId, senderDealerId: original.requesterDealerId, productId: original.productId, productVariantId: original.productVariantId, sku: original.sku, productNameSnapshot: original.productNameSnapshot, variantNameSnapshot: original.variantNameSnapshot, colorNameSnapshot: original.colorNameSnapshot, requestedQuantity: amount, availableQuantityAtRequest: amount, reason: req.body.reason || "Return to original exchange owner", status: "TRANSFER_COMPLETED", isReturn: true, parentTransferId: original.id, completedAt: new Date() }, { transaction });
    await logAction(returnRequest, "RETURN_DISPATCHED", req.user.id, "Return stock dispatched to original exchange owner", transaction);
    await notifyDealer(original.companyId, original.senderDealerId, { title: "Exchange return is on its way", message: `${amount} ${original.productNameSnapshot} is being returned. Confirm receipt when it arrives.`, metadata: { transferRequestId: returnRequest.id } }, transaction);
    return returnRequest;
  }).catch((error) => { if (error.status) { res.status(error.status).json({ message: error.message }); return null; } throw error; });
  if (result) res.status(201).json(result);
});

exports.receiveReturn = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const returned = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, requesterDealerId: req.user.dealerId, isReturn: true, exchangeReceivedAt: { [Op.is]: null } }, lock: true, transaction });
    if (!returned) return null;
    const [stock] = await DealerExchangeInventory.findOrCreate({ where: { companyId: returned.companyId, dealerId: returned.requesterDealerId, productId: returned.productId, ...variantWhere(returned.productVariantId) }, defaults: { companyId: returned.companyId, dealerId: returned.requesterDealerId, productId: returned.productId, productVariantId: returned.productVariantId, variantName: returned.variantNameSnapshot, colorName: returned.colorNameSnapshot, quantity: 0 }, transaction, lock: transaction.LOCK.UPDATE });
    await stock.update({ quantity: Number(stock.quantity) + Number(returned.requestedQuantity) }, { transaction });
    await returned.update({ exchangeReceivedAt: new Date() }, { transaction });
    const parent = await DealerStockTransferRequest.findByPk(returned.parentTransferId, { lock: true, transaction });
    if (parent) await parent.update({ returnedQuantity: Number(parent.returnedQuantity || 0) + Number(returned.requestedQuantity) }, { transaction });
    await logAction(returned, "RETURN_RECEIVED", req.user.id, "Original exchange owner confirmed returned stock", transaction);
    return returned;
  });
  if (!result) return res.status(404).json({ message: "Unconfirmed return not found" });
  res.json({ message: "Returned stock added to your exchange inventory" });
});

exports.history = asyncHandler(async (req, res) => {
  res.json(await DealerStockTransferRequest.findAll({
    where: { companyId: req.user.companyId, [Op.or]: [{ requesterDealerId: req.user.dealerId }, { senderDealerId: req.user.dealerId }] },
    include: requestInclude(),
    order: [["createdAt", "DESC"]]
  }));
});

exports.cancel = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, requesterDealerId: req.user.dealerId, status: "REQUESTED" } });
  if (!request) return res.status(404).json({ message: "Cancelable request not found" });
  await request.update({ status: "CANCELLED" });
  await logAction(request, "CANCELLED", req.user.id, "Request cancelled by dealer");
  res.json(request);
});

exports.reminder = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, senderDealerId: req.user.dealerId, status: "TRANSFER_COMPLETED" }, include: requestInclude() });
  if (!request) return res.status(404).json({ message: "Completed transfer not found" });
  const note = req.body.note || `Reminder: We shared ${request.requestedQuantity} units of ${request.productNameSnapshot} with you. Please return the product when available in your stock or complete the payment/settlement as discussed.`;
  await request.update({ reminderSentAt: new Date(), returnReminderNote: note });
  await createDealerMessage(request.companyId, request.requesterDealerId, req.user.id, "Return/Payment reminder", note);
  await notifyDealer(request.companyId, request.requesterDealerId, { title: "Return/Payment reminder", message: note, metadata: { transferRequestId: request.id } });
  await logAction(request, "REMINDER_SENT", req.user.id, note);
  res.json({ message: "Reminder sent", request });
});

exports.adminRequests = asyncHandler(async (req, res) => {
  const where = { companyId: req.user.companyId };
  if (req.query.status) where.status = req.query.status;
  const rows = await DealerStockTransferRequest.findAll({ where, include: requestInclude(), order: [["createdAt", "DESC"]] });
  const counts = await Promise.all(["REQUESTED", "MANAGER_APPROVED", "TRANSFER_COMPLETED", "MANAGER_REJECTED", "ADMIN_REJECTED"].map(async (status) => ({ status, count: await DealerStockTransferRequest.count({ where: { companyId: req.user.companyId, status } }) })));
  const analytics = Object.fromEntries(counts.map((row) => [row.status, row.count]));
  analytics.REQUESTED = (analytics.REQUESTED || 0) + (analytics.MANAGER_APPROVED || 0);
  res.json({ rows: rows.filter((row) => ["REQUESTED", "MANAGER_APPROVED"].includes(row.status)), analytics });
});

exports.managerApprove = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, status: { [Op.in]: ["REQUESTED", "MANAGER_APPROVED"] } } });
  if (!request) return res.status(404).json({ message: "Pending request not found" });
  const result = await sequelize.transaction(async (transaction) => {
    const lockedRequest = await DealerStockTransferRequest.findOne({ where: { id: request.id, companyId: req.user.companyId, status: { [Op.in]: ["REQUESTED", "MANAGER_APPROVED"] } }, lock: true, transaction });
    if (!lockedRequest) return null;
    const senderInventory = await currentSenderStock(lockedRequest, transaction);
    const available = Number(senderInventory?.quantity || 0);
    const amount = Number(lockedRequest.requestedQuantity);
    if (!senderInventory || available < amount) {
      const error = new Error("Sender dealer no longer has enough stock."); error.status = 400; throw error;
    }
    const [requesterInventory] = await DealerInventory.findOrCreate({
      where: { companyId: lockedRequest.companyId, dealerId: lockedRequest.requesterDealerId, productId: lockedRequest.productId, ...variantWhere(lockedRequest.productVariantId) },
      defaults: { companyId: lockedRequest.companyId, dealerId: lockedRequest.requesterDealerId, productId: lockedRequest.productId, productVariantId: lockedRequest.productVariantId, variantName: lockedRequest.variantNameSnapshot, colorName: lockedRequest.colorNameSnapshot, quantity: 0, lowStockLimit: 5 }, transaction, lock: transaction.LOCK.UPDATE
    });
    await senderInventory.update({ quantity: available - amount }, { transaction });
    await requesterInventory.update({ quantity: Number(requesterInventory.quantity || 0) + amount }, { transaction });
    await lockedRequest.update({ status: "TRANSFER_COMPLETED", managerApprovedBy: req.user.id, managerApprovedAt: new Date(), completedAt: new Date() }, { transaction });
    await logAction(lockedRequest, "TRANSFER_COMPLETED", req.user.id, "Sender dealer Product & Delivery Manager approved and completed the transfer", transaction);
    const senderName = await dealerDisplay(lockedRequest.senderDealerId);
    const requesterName = await dealerDisplay(lockedRequest.requesterDealerId);
    await notifyDealer(lockedRequest.companyId, lockedRequest.requesterDealerId, { title: "Stock transfer completed", message: `${amount} ${lockedRequest.productNameSnapshot} transferred from ${senderName}.`, metadata: { transferRequestId: lockedRequest.id } }, transaction);
    await notifyDealer(lockedRequest.companyId, lockedRequest.senderDealerId, { title: "Stock transfer completed", message: `${amount} ${lockedRequest.productNameSnapshot} transferred to ${requesterName}.`, metadata: { transferRequestId: lockedRequest.id } }, transaction);
    await notifyCompanyRoles(lockedRequest.companyId, ["PRODUCT_DELIVERY_MANAGER"], { title: "Transfer completed", message: "A sender dealer manager completed the inter-dealer stock transfer.", metadata: { transferRequestId: lockedRequest.id } }, transaction);
    return lockedRequest;
  });
  if (!result) return res.status(404).json({ message: "Pending request not found" });
  res.json(await DealerStockTransferRequest.findByPk(result.id, { include: requestInclude() }));
});

exports.managerReject = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, status: { [Op.in]: ["REQUESTED", "MANAGER_APPROVED"] } } });
  if (!request) return res.status(404).json({ message: "Pending request not found" });
  await request.update({ status: "MANAGER_REJECTED", managerApprovedBy: req.user.id, managerApprovedAt: new Date(), managerRejectReason: req.body.reason || "Rejected by Product & Delivery Manager" });
  await notifyDealer(request.companyId, request.requesterDealerId, { title: "Stock request rejected", message: request.managerRejectReason, metadata: { transferRequestId: request.id } });
  await logAction(request, "MANAGER_REJECTED", req.user.id, request.managerRejectReason);
  res.json(request);
});

exports.adminCeoRequests = asyncHandler(async (req, res) => {
  const rows = await DealerStockTransferRequest.findAll({ where: { companyId: req.user.companyId }, include: requestInclude(), order: [["createdAt", "DESC"]] });
  const completed = rows.filter((row) => row.status === "TRANSFER_COMPLETED");
  const topBy = (field, labelFn) => {
    const map = completed.reduce((acc, row) => {
      const key = row[field];
      acc[key] = acc[key] || { id: key, label: labelFn(row), count: 0 };
      acc[key].count += 1;
      return acc;
    }, {});
    return Object.values(map).sort((a, b) => b.count - a.count)[0] || null;
  };
  res.json({
    rows,
    approvals: rows.filter((row) => row.status === "MANAGER_APPROVED"),
    analytics: {
      totalTransferRequests: rows.length,
      pendingApprovals: rows.filter((row) => ["REQUESTED", "MANAGER_APPROVED"].includes(row.status)).length,
      completedTransfers: completed.length,
      rejectedRequests: rows.filter((row) => ["MANAGER_REJECTED", "ADMIN_REJECTED"].includes(row.status)).length,
      topProductRequested: topBy("productId", (row) => row.productNameSnapshot),
      topDealerSender: topBy("senderDealerId", (row) => row.senderDealer?.dealerName),
      topDealerRequester: topBy("requesterDealerId", (row) => row.requesterDealer?.dealerName)
    }
  });
});

exports.finalApprove = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, status: "MANAGER_APPROVED" }, lock: true, transaction });
    if (!request) {
      const error = new Error("Manager-approved request not found");
      error.status = 404;
      throw error;
    }
    const senderInventory = await currentSenderStock(request, transaction);
    const available = Number(senderInventory?.quantity || 0);
    if (!senderInventory || available < Number(request.requestedQuantity)) {
      const error = new Error("Sender dealer no longer has enough stock.");
      error.status = 400;
      throw error;
    }
    const [requesterInventory] = await DealerInventory.findOrCreate({
      where: { companyId: request.companyId, dealerId: request.requesterDealerId, productId: request.productId, ...variantWhere(request.productVariantId) },
      defaults: {
        companyId: request.companyId,
        dealerId: request.requesterDealerId,
        productId: request.productId,
        productVariantId: request.productVariantId,
        variantName: request.variantNameSnapshot,
        colorName: request.colorNameSnapshot,
        quantity: 0,
        lowStockLimit: 5
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    await senderInventory.update({ quantity: available - Number(request.requestedQuantity) }, { transaction });
    await requesterInventory.update({ quantity: Number(requesterInventory.quantity || 0) + Number(request.requestedQuantity) }, { transaction });
    await request.update({ status: "TRANSFER_COMPLETED", adminApprovedBy: req.user.id, adminApprovedAt: new Date(), completedAt: new Date() }, { transaction });
    await logAction(request, "TRANSFER_COMPLETED", req.user.id, "Admin CEO final approval completed inventory transfer", transaction);
    const senderName = await dealerDisplay(request.senderDealerId);
    const requesterName = await dealerDisplay(request.requesterDealerId);
    await notifyDealer(request.companyId, request.requesterDealerId, { title: "Stock transfer completed", message: `${request.requestedQuantity} ${request.productNameSnapshot} transferred from ${senderName}.`, metadata: { transferRequestId: request.id } }, transaction);
    await notifyDealer(request.companyId, request.senderDealerId, { title: "Stock transfer completed", message: `${request.requestedQuantity} ${request.productNameSnapshot} transferred to ${requesterName}.`, metadata: { transferRequestId: request.id } }, transaction);
    await notifyCompanyRoles(request.companyId, ["PRODUCT_DELIVERY_MANAGER"], { title: "Transfer completed", message: "Admin CEO final approval completed the inter-dealer stock transfer.", metadata: { transferRequestId: request.id } }, transaction);
    return request;
  }).catch((error) => {
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return null;
    }
    throw error;
  });
  if (!result) return;
  res.json(await DealerStockTransferRequest.findByPk(result.id, { include: requestInclude() }));
});

exports.finalReject = asyncHandler(async (req, res) => {
  const request = await DealerStockTransferRequest.findOne({ where: { id: req.params.id, companyId: req.user.companyId, status: "MANAGER_APPROVED" } });
  if (!request) return res.status(404).json({ message: "Manager-approved request not found" });
  await request.update({ status: "ADMIN_REJECTED", adminApprovedBy: req.user.id, adminApprovedAt: new Date(), adminRejectReason: req.body.reason || "Rejected by Admin CEO" });
  await notifyDealer(request.companyId, request.requesterDealerId, { title: "Stock request rejected", message: request.adminRejectReason, metadata: { transferRequestId: request.id } });
  await logAction(request, "ADMIN_REJECTED", req.user.id, request.adminRejectReason);
  res.json(request);
});
