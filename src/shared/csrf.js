const crypto = require("crypto");
function token(req) {
  if (!req.session.csrfToken)
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}
function verify(req, res, next) {
  const a = req.body?._csrf,
    b = req.session.csrfToken;
  if (!a || !b || !crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)))
    return res
      .status(403)
      .render("error", {
        title: "Yêu cầu không hợp lệ",
        message:
          "Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang và thử lại.",
      });
  next();
}
module.exports = { token, verify };
