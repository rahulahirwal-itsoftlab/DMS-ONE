const progressByStatus = {
  pending: 0,
  payment: 15,
  approved: 15,
  packing: 35,
  shipping: 60,
  out_for_delivery: 80,
  delivered: 100,
  rejected: 0,
  cancelled: 0
};

const deliverySteps = ["packing", "shipping", "out_for_delivery", "delivered"];

function progressForStatus(status) {
  return progressByStatus[status] ?? 0;
}

function activeDeliveryStep(status) {
  if (deliverySteps.includes(status)) return status;
  if (status === "approved" || status === "payment") return "packing";
  return status;
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

module.exports = { progressForStatus, activeDeliveryStep, daysUntil, deliverySteps };
