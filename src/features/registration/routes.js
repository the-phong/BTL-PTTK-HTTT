const express = require("express"),
  c = require("./controller"),
  csrf = require("../../shared/csrf");
const r = express.Router();
r.get("/dang-ky", c.form);
r.post("/dang-ky", csrf.verify, c.submit);
module.exports = r;
