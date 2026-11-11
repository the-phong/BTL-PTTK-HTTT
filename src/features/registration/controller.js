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
    return res.render("../features/registration/views/success", {
      title: "Đăng ký thành công",
      email: d.email.trim().toLowerCase(),
    });
  } catch (e) {
    next(e);
  }
};
