const service = require("./service");
exports.form = (req, res) =>
  res.render("../features/registration/views/register", {
    title: "Đăng ký tài khoản",
    form: {},
    errors: [],
  });

exports.submit = async (req, res, next) => {
  try {
    const d = req.body;
    const r = await service.register(d);
    if (r.errors)
      return res.status(422).render("../features/registration/views/register", {
        title: "Đăng ký tài khoản",
        form: d,
        errors: r.errors,
      });
    req.session.flashMessage =
      "Đăng ký thành công. Hãy đăng nhập bằng email vừa đăng ký.";
    return res.redirect("/dang-nhap");
  } catch (e) {
    next(e);
  }
};
