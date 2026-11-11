const express = require("express"),
  c = require("./controller"),
  auth = require("../../shared/requireLogin"),
  csrf = require("../../shared/csrf");
const r = express.Router();
r.use(auth);
r.get("/tim", c.search);
r.get("/xe/:id", c.carDetail);
r.post("/chon", csrf.verify, c.select);
r.get("/gio-hang", c.cart);
r.post("/xoa", csrf.verify, c.remove);
r.post("/xac-nhan", csrf.verify, c.confirm);
r.get("/phieu-cua-toi", c.history);
r.get("/phieu/:id", c.detail);
module.exports = r;
