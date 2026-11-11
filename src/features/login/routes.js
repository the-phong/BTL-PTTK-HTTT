const express = require("express"),
  c = require("./controller"),
  csrf = require("../../shared/csrf"),
  auth = require("../../shared/requireLogin");
const r = express.Router();
r.get("/dang-nhap", c.form);
r.post("/dang-nhap", csrf.verify, c.submit);
r.post("/dang-xuat", auth, csrf.verify, c.logout);
r.get("/", (req, res) =>
  req.session.user
    ? c.home(req, res)
    : res.render("landing", { title: "Thuê xe ô tô", user: null }),
);
module.exports = r;
