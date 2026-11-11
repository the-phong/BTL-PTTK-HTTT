const service = require("./service");
exports.form = (req, res) =>
  res.render("../features/login/views/login", {
    title: "Đăng nhập",
    error: null,
  });
exports.submit = async (req, res, next) => {
  try {
    const user = await service.authenticate(req.body.email, req.body.password);
    if (!user)
      return res
        .status(401)
        .render("../features/login/views/login", {
          title: "Đăng nhập",
          error: "Email hoặc mật khẩu chưa chính xác.",
        });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      res.redirect("/");
    });
  } catch (e) {
    next(e);
  }
};
exports.logout = (req, res, next) =>
  req.session.destroy((e) => (e ? next(e) : res.redirect("/")));
exports.home = (req, res) =>
  res.render("../features/login/views/home", {
    title: "Trang chủ",
    user: req.session.user,
  });
