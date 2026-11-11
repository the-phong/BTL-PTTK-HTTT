require("dotenv").config();
const express = require("express"),
  session = require("express-session"),
  path = require("path"),
  csrf = require("./shared/csrf");
const app = express();
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET phải có ít nhất 32 ký tự trong .env");
}
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use(
  session({
    name: "oto.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);
app.use((req, res, next) => {
  if (req.session.user) res.set("Cache-Control", "private, no-store");
  res.locals.user = req.session.user || null;
  res.locals.csrfToken = csrf.token(req);
  res.locals.flashMessage =
    req.session.flashMessage || req.flashMessage || null;
  delete req.session.flashMessage;
  next();
});
app.use("/", require("./features/login/routes"));
app.use("/", require("./features/registration/routes"));
app.use("/", require("./features/profile/routes"));
app.use("/dat-xe", require("./features/booking/routes"));
app.use((req, res) =>
  res.status(404).render("error", {
    title: "Không tìm thấy trang",
    message: "Trang bạn yêu cầu không tồn tại.",
  }),
);
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render("error", {
    title: "Có lỗi xảy ra",
    message: "Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại sau.",
  });
});
const port = Number(process.env.PORT || 3000);
if (require.main === module)
  app.listen(port, () =>
    console.log(`Ứng dụng chạy tại http://localhost:${port}`),
  );
module.exports = app;
