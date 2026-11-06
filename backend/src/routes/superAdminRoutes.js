const router = require("express").Router();
const ctrl = require("../controllers/superAdminController");
const { protect, permit } = require("../middleware/auth");
const { organizationLogoUpload } = require("../middleware/upload");

router.post("/organizations", organizationLogoUpload.single("logo"), ctrl.createOrganization);

router.use(protect, permit("SUPER_ADMIN", "SUPER_ADMIN_CEO"));
router.get("/dashboard", ctrl.dashboard);
router.get("/organizations", ctrl.listOrganizations);
router.route("/organizations/:id")
  .get(ctrl.getOrganization)
  .put(organizationLogoUpload.single("logo"), ctrl.updateOrganization)
  .delete(ctrl.deleteOrganization);
router.patch("/organizations/:id/status", ctrl.setOrganizationStatus);

// Non-license compatibility aliases for the original single-Super-Admin client.
router.route("/companies")
  .get(ctrl.listOrganizations)
  .post(organizationLogoUpload.single("logo"), ctrl.createOrganization);
router.route("/companies/:id")
  .get(ctrl.getOrganization)
  .put(organizationLogoUpload.single("logo"), ctrl.updateOrganization)
  .delete(ctrl.deleteOrganization);
router.patch("/companies/:id/status", ctrl.setOrganizationStatus);

module.exports = router;
