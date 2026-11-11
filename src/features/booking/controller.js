const service = require("./service");

exports.search = async (req, res, next) => {
  try {
    const field = (value) => (typeof value === "string" ? value : "");

    const firstLoad = Object.keys(req.query).length === 0;
    const previousPeriod = req.session.bookingPeriod;

    // Giữ thời gian khách đã chọn nếu vẫn còn hợp lệ.
    const preset =
      previousPeriod &&
      service.validPeriod(previousPeriod.start, previousPeriod.end)
        ? previousPeriod
        : service.defaultPeriod();

    const filters = {
      type: field(req.query.type),
      seats: field(req.query.seats),
      start: firstLoad ? preset.start : field(req.query.start),
      end: firstLoad ? preset.end : field(req.query.end),
    };

    const result = await service.search(filters);

    if (result.error) {
      return res.status(422).render("../features/booking/views/search", {
        title: "Tìm xe",
        filters,
        cars: [],
        error: result.error,
        notice: null,
      });
    }

    let notice = null;

    const periodChanged =
      !previousPeriod ||
      previousPeriod.start !== filters.start ||
      previousPeriod.end !== filters.end;

    // Khi thời gian đổi, kiểm tra lại giỏ trước khi cập nhật.
    if (periodChanged && (req.session.selectedCars || []).length > 0) {
      const synced = await service.syncCart(req.session.selectedCars, {
        start: filters.start,
        end: filters.end,
      });

      req.session.selectedCars = synced.items;

      if (synced.removed > 0) {
        notice =
          `${synced.removed} xe đã bị loại khỏi danh sách ` +
          "vì không còn phù hợp với thời gian thuê mới.";
      }
    }

    req.session.bookingPeriod = {
      start: filters.start,
      end: filters.end,
    };

    return res.render("../features/booking/views/search", {
      title: "Tìm xe",
      filters,
      cars: result.cars,
      error: null,
      notice,
    });
  } catch (e) {
    next(e);
  }
};

exports.select = async (req, res) => {
  try {
    const selected = req.session.selectedCars || [];
    const period = req.session.bookingPeriod;

    const updated = await service.addToCart(selected, period, req.body.carId);

    req.session.selectedCars = updated;

    return res.redirect("/dat-xe/gio-hang");
  } catch (e) {
    return res.redirect(
      "/dat-xe/gio-hang?error=" + encodeURIComponent(e.message),
    );
  }
};

exports.cart = async (req, res, next) => {
  try {
    const selected = req.session.selectedCars || [];
    const period = req.session.bookingPeriod;

    // Kiểm tra lại xe và cập nhật giá đang hiển thị.
    const result = await service.syncCart(selected, period, true);

    // Session và danh sách hiển thị phải thống nhất.
    req.session.selectedCars = result.items;

    const messages = [];

    if (result.removed > 0) {
      messages.push(
        `${result.removed} xe không còn khả dụng và đã bị loại khỏi giỏ.`,
      );
    }

    if (result.priceChanged > 0) {
      messages.push("Đơn giá đã thay đổi. Vui lòng kiểm tra lại tổng tiền.");
    }

    return res.render("../features/booking/views/cart", {
      title: "Xe đã chọn",
      cars: result.cars,
      error: req.query.error || null,
      notice: messages.join(" ") || null,
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
      return res.status(404).render("error", {
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
