require("dotenv").config();
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const app = require("../src/app");
const service = require("../src/features/registration/service");
const repository = require("../src/features/registration/repository");
const { getPool } = require("../src/shared/db");

const enabled = process.env.RUN_DB_TESTS === "1";
const emails = new Set();
const token = (html) => {
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
  assert.ok(match);
  return match[1];
};
const unique = () => crypto.randomBytes(5).toString("hex");
const phone = () =>
  `09${String(crypto.randomInt(0, 100000000)).padStart(8, "0")}`;
const input = (changes = {}) => {
  const data = {
    name: "Khách Kiểm Thử",
    birth: "2000-01-01",
    phone: phone(),
    email: `reg-${unique()}@example.test`,
    address: "Hà Đông, Hà Nội",
    password: "registration-password",
    confirm: "registration-password",
    ...changes,
  };
  emails.add(data.email.trim().toLowerCase());
  return data;
};
const memberCount = async (email) => {
  const [[row]] = await getPool().execute(
    "SELECT COUNT(*) AS total FROM tblThanhVien WHERE Email=?",
    [email.trim().toLowerCase()],
  );
  return row.total;
};
const createMember = async (data) => {
  const prepared = await service.prepare(data);
  assert.ok(prepared.data?.hash);
  return repository.create(prepared.data);
};

if (enabled)
  after(async () => {
    const pool = getPool();
    for (const email of emails) {
      await pool.execute("DELETE FROM tblThanhVien WHERE Email=?", [email]);
    }
    await pool.end();
  });

test(
  "REG-01: hợp lệ, qua trang xác nhận rồi tạo đúng một thành viên và khách hàng",
  { skip: !enabled },
  async () => {
    const data = input();
    const agent = request.agent(app);
    const form = await agent.get("/dang-ky").expect(200);
    const review = await agent
      .post("/dang-ky")
      .type("form")
      .send({ ...data, _csrf: token(form.text) })
      .expect(200);
    assert.match(review.text, /Xác nhận đăng ký/);
    assert.equal(await memberCount(data.email), 0);
    const done = await agent
      .post("/dang-ky/xac-nhan")
      .type("form")
      .send({ _csrf: token(review.text) })
      .expect(200);
    assert.match(done.text, /Đăng ký thành công/);
    const [[row]] = await getPool().execute(
      "SELECT COUNT(*) AS total FROM tblThanhVien t JOIN tblKhachHang k ON k.MaTV=t.MaTV WHERE t.Email=?",
      [data.email],
    );
    assert.equal(row.total, 1);
  },
);

test(
  "REG-02: thiếu trường bắt buộc thì không tạo tài khoản",
  { skip: !enabled },
  async () => {
    const data = input({ name: "" });
    const agent = request.agent(app);
    const form = await agent.get("/dang-ky").expect(200);
    const response = await agent
      .post("/dang-ky")
      .type("form")
      .send({ ...data, _csrf: token(form.text) })
      .expect(422);
    assert.match(response.text, /Họ tên phải có/);
    assert.equal(await memberCount(data.email), 0);
  },
);

test("REG-03: email trùng bị từ chối", { skip: !enabled }, async () => {
  const original = input();
  await createMember(original);
  const attempt = input({ email: original.email });
  const result = await service.prepare(attempt);
  assert.match(result.errors.join(" "), /đã được sử dụng/);
  assert.equal(await memberCount(original.email), 1);
});

test("REG-04: số điện thoại trùng bị từ chối", { skip: !enabled }, async () => {
  const original = input();
  await createMember(original);
  const attempt = input({ phone: original.phone });
  const result = await service.prepare(attempt);
  assert.match(result.errors.join(" "), /đã được sử dụng/);
  assert.equal(await memberCount(attempt.email), 0);
});

test(
  "REG-05: email hoa và khoảng trắng được chuẩn hóa trước khi lưu",
  { skip: !enabled },
  async () => {
    const data = input();
    data.email = `  ${data.email.toUpperCase()}  `;
    const prepared = await service.prepare(data);
    await repository.create(prepared.data);
    assert.equal(prepared.data.email, data.email.trim().toLowerCase());
    assert.equal(await memberCount(data.email), 1);
  },
);

test(
  "REG-06: 0912345678 và +84912345678 là một số",
  { skip: !enabled },
  async () => {
    const original = input({ phone: "0912345678" });
    await createMember(original);
    const attempt = input({ phone: "+84912345678" });
    assert.equal(service.normalize(attempt).phone, original.phone);
    const result = await service.prepare(attempt);
    assert.match(result.errors.join(" "), /đã được sử dụng/);
    assert.equal(await memberCount(attempt.email), 0);
  },
);

test(
  "REG-07: ngày không tồn tại và ngày tương lai bị từ chối",
  { skip: !enabled },
  async () => {
    for (const birth of ["2027-02-30", "2090-01-01"]) {
      const data = input({ birth });
      const result = await service.prepare(data);
      assert.match(result.errors.join(" "), /Ngày sinh không hợp lệ/);
      assert.equal(await memberCount(data.email), 0);
    }
  },
);

test(
  "REG-08: mật khẩu ngắn hoặc vượt 72 byte bị từ chối",
  { skip: !enabled },
  async () => {
    for (const password of ["1234567", "đ".repeat(40)]) {
      const data = input({ password, confirm: password });
      const result = await service.prepare(data);
      assert.match(result.errors.join(" "), /Mật khẩu phải có/);
      assert.equal(await memberCount(data.email), 0);
    }
  },
);

test(
  "REG-09: xác nhận mật khẩu khác thì không đến bước xác nhận",
  { skip: !enabled },
  async () => {
    const data = input({ confirm: "another-password" });
    const agent = request.agent(app);
    const form = await agent.get("/dang-ky").expect(200);
    const response = await agent
      .post("/dang-ky")
      .type("form")
      .send({ ...data, _csrf: token(form.text) })
      .expect(422);
    assert.match(response.text, /Mật khẩu xác nhận không khớp/);
    await agent.get("/dang-ky/xac-nhan").expect(302);
    assert.equal(await memberCount(data.email), 0);
  },
);

test(
  "REG-10: quay lại sửa rồi xác nhận chỉ lưu bản mới",
  { skip: !enabled },
  async () => {
    const oldData = input();
    const newData = input();
    const agent = request.agent(app);
    const form = await agent.get("/dang-ky").expect(200);
    const firstReview = await agent
      .post("/dang-ky")
      .type("form")
      .send({ ...oldData, _csrf: token(form.text) })
      .expect(200);
    const edit = await agent.get("/dang-ky/sua").expect(200);
    assert.match(edit.text, new RegExp(oldData.email));
    await agent
      .post("/dang-ky/xac-nhan")
      .type("form")
      .send({ _csrf: token(firstReview.text) })
      .expect(302);
    const secondReview = await agent
      .post("/dang-ky")
      .type("form")
      .send({ ...newData, _csrf: token(edit.text) })
      .expect(200);
    await agent
      .post("/dang-ky/xac-nhan")
      .type("form")
      .send({ _csrf: token(secondReview.text) })
      .expect(200);
    assert.equal(await memberCount(oldData.email), 0);
    assert.equal(await memberCount(newData.email), 1);
  },
);

test(
  "REG-11: gửi xác nhận hai lần chỉ tạo một tài khoản",
  { skip: !enabled },
  async () => {
    const data = input();
    const agent = request.agent(app);
    const form = await agent.get("/dang-ky").expect(200);
    const review = await agent
      .post("/dang-ky")
      .type("form")
      .send({ ...data, _csrf: token(form.text) })
      .expect(200);
    const responses = await Promise.all([
      agent
        .post("/dang-ky/xac-nhan")
        .type("form")
        .send({ _csrf: token(review.text) }),
      agent
        .post("/dang-ky/xac-nhan")
        .type("form")
        .send({ _csrf: token(review.text) }),
    ]);
    assert.equal(
      responses.filter(
        (response) =>
          response.status === 200 && /Đăng ký thành công/.test(response.text),
      ).length,
      1,
    );
    assert.equal(await memberCount(data.email), 1);
  },
);

test(
  "REG-12: lỗi ghi tblKhachHang rollback bản ghi tblThanhVien",
  { skip: !enabled },
  async () => {
    const data = input({ name: `REG-12-${unique()}` });
    const trigger = `trg_reg12_${unique()}`;
    const pool = getPool();
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON tblKhachHang FOR EACH ROW BEGIN
    IF (SELECT HoTen FROM tblThanhVien WHERE MaTV = NEW.MaTV) LIKE 'REG-12-%' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'REG-12 forced failure';
    END IF;
  END`);
    try {
      const prepared = await service.prepare(data);
      await assert.rejects(
        repository.create(prepared.data),
        /REG-12 forced failure/,
      );
      assert.equal(await memberCount(data.email), 0);
      const [[row]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM tblKhachHang k JOIN tblThanhVien t ON t.MaTV=k.MaTV WHERE t.Email=?",
        [data.email],
      );
      assert.equal(row.total, 0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
  },
);
