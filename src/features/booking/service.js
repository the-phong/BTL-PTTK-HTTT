const repo = require("./repository");

// Chuyển giờ Việt Nam từ form thành timestamp UTC.
// Ví dụ: 2026-11-12T08:00 là 08:00 tại Việt Nam.
function vietnamTime(value) {
  if (typeof value !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [year, month, day, hour, minute] = match.slice(1).map(Number);

  // Bài toán thuê xe chỉ sử dụng giờ tròn.
  if (year < 2000 || year > 2100 || minute !== 0) return null;

  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Chặn ngày không tồn tại, ví dụ 30/02.
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour
  ) {
    return null;
  }

  // Việt Nam UTC+7.
  return Date.UTC(year, month - 1, day, hour - 7, minute);
}

function validPeriod(start, end) {
  const a = vietnamTime(start);
  const b = vietnamTime(end);

  return (
    a !== null &&
    b !== null &&
    a > Date.now() &&
    b > a &&
    b - a <= 90 * 24 * 60 * 60 * 1000
  );
}

function hoursBetween(start, end) {
  return (vietnamTime(end) - vietnamTime(start)) / 3600000;
}

exports.validPeriod = validPeriod;

// Sinh thời gian mặc định: 08:00 ngày mai đến 08:00 ngày sau.
exports.defaultPeriod = () => {
  const nowVN = new Date(Date.now() + 7 * 3600000);
  const y = nowVN.getUTCFullYear();
  const m = nowVN.getUTCMonth();
  const d = nowVN.getUTCDate();

  const startUTC = Date.UTC(y, m, d + 1, 1);
  const endUTC = startUTC + 24 * 3600000;

  const formatVN = (ms) =>
    new Date(ms + 7 * 3600000).toISOString().slice(0, 16);

  return {
    start: formatVN(startUTC),
    end: formatVN(endUTC),
  };
};

// Tìm kiếm xe.
exports.search = async (filters, rawPage = 1) => {
  const allowedTypes = ["", "SUV", "Sedan", "MPV", "Hatchback", "Bán tải"];
  const allowedSeats = ["", "4", "5", "7", "9", "16"];
  if (
    !allowedTypes.includes(filters.type) ||
    !allowedSeats.includes(filters.seats)
  ) {
    return { error: "Bộ lọc loại xe hoặc số chỗ không hợp lệ." };
  }
  if (!validPeriod(filters.start, filters.end)) {
    return {
      error:
        "Giờ nhận phải ở tương lai, là giờ tròn; giờ trả phải sau giờ nhận và không quá 90 ngày.",
    };
  }

  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1) {
    return { error: "Số trang không hợp lệ." };
  }
  return repo.searchPage(filters, page, 12);
};

// Kiểm tra lại toàn bộ xe trong giỏ.
// refreshPrices=true: cập nhật giá khách hàng sẽ nhìn thấy.
exports.syncCart = async (selected, refreshPrices = false) => {
  const original = Array.isArray(selected) ? selected : [];
  const availability = new Map();

  const items = [];
  const cars = [];
  const seen = new Set();
  let priceChanged = 0;

  for (const previous of original) {
    const id = Number(previous.id);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      seen.has(id) ||
      !validPeriod(previous.start, previous.end)
    ) {
      continue;
    }
    seen.add(id);
    const key = `${previous.start}|${previous.end}`;
    if (!availability.has(key)) {
      const available = await repo.search({
        start: previous.start,
        end: previous.end,
      });
      availability.set(
        key,
        new Map(available.map((car) => [Number(car.MaXe), car])),
      );
    }
    const car = availability.get(key).get(id);
    if (!car) continue;

    const currentPrice = Number(car.DonGiaGio);
    const oldPrice =
      previous.quotedPrice == null ? null : Number(previous.quotedPrice);

    if (refreshPrices && oldPrice !== null && oldPrice !== currentPrice) {
      priceChanged++;
    }

    const quotedPrice =
      refreshPrices || oldPrice === null || !Number.isFinite(oldPrice)
        ? currentPrice
        : oldPrice;

    items.push({
      id,
      start: previous.start,
      end: previous.end,
      quotedPrice,
    });

    cars.push({
      ...car,
      id,
      start: previous.start,
      end: previous.end,
      hours: hoursBetween(previous.start, previous.end),
      quotedPrice,
    });
  }

  return {
    items,
    cars,
    removed: original.length - items.length,
    priceChanged,
  };
};

// Kiểm tra xe trước khi thêm vào giỏ.
exports.addToCart = async (selected, period, rawId) => {
  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw Error("Mã xe không hợp lệ.");
  }

  if (!period || !validPeriod(period.start, period.end)) {
    throw Error("Hãy tìm kiếm lại với khoảng thời gian hợp lệ.");
  }

  const synced = await exports.syncCart(selected);

  // Không thêm trùng xe.
  if (synced.items.some((item) => item.id === id)) {
    throw Error(
      "Xe đã có trong danh sách. Hãy xóa xe trước khi chọn lại thời gian thuê.",
    );
  }

  const available = await repo.search({
    start: period.start,
    end: period.end,
  });

  const car = available.find((item) => Number(item.MaXe) === id);

  if (!car) {
    throw Error("Xe không còn khả dụng trong khoảng thời gian này.");
  }

  return {
    ...synced,
    items: [
      ...synced.items,
      {
        id,
        start: period.start,
        end: period.end,
        quotedPrice: Number(car.DonGiaGio),
      },
    ],
  };
};

// Kiểm tra lần cuối trước khi tạo phiếu.
exports.confirm = async (customerId, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw Error("Vui lòng chọn ít nhất một xe.");
  }

  const ids = new Set();

  const prepared = items.map((item) => {
    const id = Number(item.id);
    const price = Number(item.quotedPrice);

    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      ids.has(id) ||
      !validPeriod(item.start, item.end) ||
      item.quotedPrice == null ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      throw Error(
        "Danh sách xe đã chọn không hợp lệ. Vui lòng kiểm tra lại giỏ hàng.",
      );
    }

    ids.add(id);

    return {
      id,
      start: item.start,
      end: item.end,
      quotedPrice: price,
      hours: hoursBetween(item.start, item.end),
    };
  });

  return repo.confirm(customerId, prepared);
};

exports.history = repo.history;
exports.detail = repo.detail;
exports.findCar = async (id, period) => {
  if (!period || !validPeriod(period.start, period.end)) return null;
  return repo.findCar(id, period);
};
