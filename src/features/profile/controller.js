const service = require("./service");
const view = "../features/profile/views/profile";

exports.show = async (req, res, next) => {
  try {
    const profile = await service.get(req.session.user.id);
    if (!profile)
      return res.status(404).render("error", {
        title: "Không tìm thấy tài khoản",
        message: "Hồ sơ khách hàng không tồn tại.",
      });
    res.render(view, {
      title: "Thông tin cá nhân",
      profile,
      errors: [],
      success: null,
    });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const result = await service.update(req.session.user.id, req.body);
    if (result.errors)
      return res.status(422).render(view, {
        title: "Thông tin cá nhân",
        profile: { ...result.data, MaKhachHang: req.session.user.customerCode },
        errors: result.errors,
        success: null,
      });
    req.session.user.name = result.data.name;
    req.session.user.email = result.data.email;
    const profile = await service.get(req.session.user.id);
    return res.render(view, {
      title: "Thông tin cá nhân",
      profile,
      errors: [],
      success: "Thông tin cá nhân đã được cập nhật.",
    });
  } catch (error) {
    next(error);
  }
};
