const router = require("express").Router();
const ctrl = require("../controllers/dealerStockExchangeController");
const { protect, permit } = require("../middleware/auth");

router.use(ctrl.enabled, protect, permit("DEALER_STOCK_DELIVERY_MANAGER"), ctrl.requireExchangeManager);
router.get("/inventory", ctrl.inventory);
router.post("/inventory/move", ctrl.moveInventory);
router.post("/inventory/remove", ctrl.removeInventory);
router.get("/search", ctrl.search);
router.post("/requests", ctrl.createRequest);
router.get("/requests/sent", ctrl.sentRequests);
router.get("/requests/received", ctrl.receivedRequests);
router.get("/requests/incoming", ctrl.incomingRequests);
router.get("/requests/returns", ctrl.returnRequests);
router.get("/requests/history", ctrl.history);
router.patch("/requests/:id/accept", ctrl.acceptRequest);
router.patch("/requests/:id/reject", ctrl.rejectRequest);
router.patch("/requests/:id/dispatch", ctrl.dispatch);
router.patch("/requests/:id/receive", ctrl.receive);
router.post("/requests/:id/return", ctrl.createReturn);
router.patch("/requests/:id/receive-return", ctrl.receiveReturn);
router.post("/requests/:id/reminder", ctrl.reminder);
router.patch("/requests/:id/cancel", ctrl.cancel);

module.exports = router;
