const service = require("./service");
exports.search = async (req, res, next) => {
  try {
    const f = {
      type: req.query.type || "",
      seats: req.query.seats || "",
      start: req.query.start || "",
      end: req.query.end || "",
    };
    const r = await service.search(f);
    if (r.error)
      return res
        .status(422)
        .render("../features/booking/views/search", {
          title: "Tìm xe",
          filters: f,
          cars: [],
          error: r.error,
        });
    req.session.bookingPeriod = { start: f.start, end: f.end };
    res.render("../features/booking/views/search", {
      title: "Tìm xe",
      filters: f,
      cars: r.cars,
      error: null,
    });
  } catch (e) {
    next(e);
  }
};
exports.select = (req, res) => {
  req.session.selectedCars = req.session.selectedCars || [];
  const id = Number(req.body.carId),
    period = req.session.bookingPeriod;
  if (!period) return res.redirect("/dat-xe/tim");
  if (!req.session.selectedCars.some((x) => x.id === id))
    req.session.selectedCars.push({ id, ...period });
  res.redirect("/dat-xe/gio-hang");
};
exports.cart = async (req, res, next) => {
  try {
    const cars = [];
    for (const item of req.session.selectedCars || []) {
      const list = await require("./repository").search({
        start: item.start,
        end: item.end,
      });
      const car = list.find((c) => c.MaXe === item.id);
      if (car)
        cars.push({
          ...car,
          ...item,
          hours: (new Date(item.end) - new Date(item.start)) / 3600000,
        });
    }
    res.render("../features/booking/views/cart", {
      title: "Xe đã chọn",
      cars,
      error: req.query.error || null,
    });
  } catch (e) {
    next(e);
  }
};
exports.remove = (req, res) => {
  req.session.selectedCars = (req.session.selectedCars || []).filter(
    (x) => x.id !== Number(req.body.carId),
  );
  res.redirect("/dat-xe/gio-hang");
};
exports.confirm = async (req, res) => {
  try {
    const result = await service.confirm(
      req.session.user.customerId,
      req.session.selectedCars || [],
    );
    req.session.selectedCars = [];
    res.redirect(`/dat-xe/phieu/${result.id}`);
  } catch (e) {
    res.redirect("/dat-xe/gio-hang?error=" + encodeURIComponent(e.message));
  }
};
exports.history = async (req, res, next) => {
  try {
    res.render("../features/booking/views/history", {
      title: "Phiếu đặt của tôi",
      bookings: await service.history(req.session.user.customerId),
    });
  } catch (e) {
    next(e);
  }
};
exports.detail = async (req, res, next) => {
  try {
    const booking = await service.detail(
      req.session.user.customerId,
      req.params.id,
    );
    if (!booking)
      return res
        .status(404)
        .render("error", {
          title: "Không tìm thấy phiếu",
          message: "Phiếu đặt không tồn tại hoặc bạn không có quyền xem.",
        });
    res.render("../features/booking/views/detail", {
      title: "Chi tiết phiếu đặt",
      booking,
    });
  } catch (e) {
    next(e);
  }
};
