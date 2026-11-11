const service = require("./service");
const registerView = "../features/registration/views/register";
const reviewView = "../features/registration/views/review";

exports.form = (req, res) => {
  res.render(registerView, {
    title: "Đăng ký tài khoản",
    form: req.session.registrationDraft || {},
    errors: [],
  });
};

exports.review = async (req, res, next) => {
  try {
    const result = await service.prepare(req.body);
    if (result.errors) {
      return res.status(422).render(registerView, {
        title: "Đăng ký tài khoản",
        form: req.body,
        errors: result.errors,
      });
    }
    req.session.registrationDraft = result.data;
    return res.render(reviewView, {
      title: "Xác nhận thông tin đăng ký",
      profile: result.data,
      errors: [],
    });
  } catch (error) {
    next(error);
  }
};

exports.reviewPage = (req, res) => {
  if (!req.session.registrationDraft) return res.redirect("/dang-ky");
  res.render(reviewView, {
    title: "Xác nhận thông tin đăng ký",
    profile: req.session.registrationDraft,
    errors: [],
  });
};

exports.edit = (req, res) => {
  if (!req.session.registrationDraft) return res.redirect("/dang-ky");
  res.render(registerView, {
    title: "Đăng ký tài khoản",
    form: req.session.registrationDraft,
    errors: [],
  });
};

exports.submit = async (req, res, next) => {
  try {
    const draft = req.session.registrationDraft;
    if (!draft) return res.redirect("/dang-ky");
    const result = await service.complete(draft);
    if (result.errors) {
      return res.status(422).render(reviewView, {
        title: "Xác nhận thông tin đăng ký",
        profile: draft,
        errors: result.errors,
      });
    }
    delete req.session.registrationDraft;
    return res.render("../features/registration/views/success", {
      title: "Đăng ký thành công",
      email: draft.email,
    });
  } catch (error) {
    next(error);
  }
};
