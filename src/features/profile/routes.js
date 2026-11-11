const express = require("express");
const auth = require("../../shared/requireLogin");
const csrf = require("../../shared/csrf");
const controller = require("./controller");
const router = express.Router();

router.get("/thong-tin-ca-nhan", auth, controller.show);
router.post("/thong-tin-ca-nhan", auth, csrf.verify, controller.update);

module.exports = router;
