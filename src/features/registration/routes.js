const express = require("express");
const controller = require("./controller");
const csrf = require("../../shared/csrf");
const router = express.Router();

router.get("/dang-ky", controller.form);
router.post("/dang-ky", csrf.verify, controller.review);
router.get("/dang-ky/xac-nhan", controller.reviewPage);
router.get("/dang-ky/sua", controller.edit);
router.post("/dang-ky/xac-nhan", csrf.verify, controller.submit);

module.exports = router;
