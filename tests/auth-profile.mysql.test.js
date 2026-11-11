require("dotenv").config();
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const app = require("../src/app");
const { getPool } = require("../src/shared/db");

const enabled = process.env.RUN_DB_TESTS === "1";
const password = "auth-profile-test-123";
const csrf = (html) => {
  const found = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
  assert.ok(found, "form có CSRF token");
  return found[1];
};
const unique = () => crypto.randomBytes(6).toString("hex");

async function makeCustomer() {
  const pool = getPool();
  const suffix = unique();
  const email = `auth-${suffix}@example.test`;
  const phone = `09${String(crypto.randomInt(0, 100000000)).padStart(8, "0")}`;
  const hash = await bcrypt.hash(password, 4);
  const [member] = await pool.execute(
    "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
    ["Khách Kiểm Thử", "2000-01-01", phone, email, "Địa chỉ ban đầu", hash],
  );
  await pool.execute("INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)", [
    member.insertId,
    `AUTH-${suffix}`,
  ]);
  return { id: member.insertId, email, phone };
}
async function removeCustomer(customer) {
  await getPool().execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
    customer.id,
  ]);
}
async function login(agent, email, secret = password) {
  const form = await agent.get("/dang-nhap").expect(200);
  return agent
    .post("/dang-nhap")
    .type("form")
    .send({
      email,
      password: secret,
      _csrf: csrf(form.text),
    });
}
const profileData = (customer, changes = {}) => ({
  name: "Khách Kiểm Thử",
  birth: "2000-01-01",
  phone: customer.phone,
  email: customer.email,
  address: "Địa chỉ ban đầu",
  ...changes,
});

if (enabled) after(async () => getPool().end());

test(
  "AUTH-01: tài khoản đúng vào trang chủ khách hàng",
  { skip: !enabled },
  async () => {
    const customer = await makeCustomer();
    try {
      const agent = request.agent(app);
      const response = await login(agent, customer.email);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/");
      const home = await agent.get("/").expect(200);
      assert.match(home.text, /Xin chào/);
      assert.match(home.text, /Khách Kiểm Thử/);
    } finally {
      await removeCustomer(customer);
    }
  },
);

test(
  "AUTH-02: mật khẩu sai hoặc email không có đều không đăng nhập",
  { skip: !enabled },
  async () => {
    const customer = await makeCustomer();
    try {
      for (const [email, secret] of [
        [customer.email, "wrong-password"],
        [`missing-${unique()}@example.test`, password],
      ]) {
        const agent = request.agent(app);
        const response = await login(agent, email, secret);
        assert.equal(response.status, 401);
        assert.match(response.text, /Email hoặc mật khẩu chưa chính xác/);
        await agent.get("/dat-xe/gio-hang").expect(302, /\/dang-nhap/);
      }
    } finally {
      await removeCustomer(customer);
    }
  },
);

test(
  "AUTH-03: email viết hoa, có khoảng trắng ngoài vẫn đăng nhập",
  { skip: !enabled },
  async () => {
    const customer = await makeCustomer();
    try {
      const agent = request.agent(app);
      const response = await login(
        agent,
        `  ${customer.email.toUpperCase()}  `,
      );
      assert.equal(response.status, 302);
      await agent.get("/").expect(200);
    } finally {
      await removeCustomer(customer);
    }
  },
);

test("AUTH-04: khách chưa đăng nhập mở giỏ được chuyển đến đăng nhập", async () => {
  const response = await request(app).get("/dat-xe/gio-hang").expect(302);
  assert.equal(response.headers.location, "/dang-nhap");
});

test(
  "AUTH-05: sau đăng xuất, phiên cũ không truy cập nghiệp vụ và trang không được cache",
  { skip: !enabled },
  async () => {
    const customer = await makeCustomer();
    try {
      const agent = request.agent(app);
      await login(agent, customer.email);
      const home = await agent.get("/").expect(200);
      assert.match(home.headers["cache-control"], /no-store/);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.headers["cache-control"], /no-store/);
      await agent
        .post("/dang-xuat")
        .type("form")
        .send({ _csrf: csrf(home.text) })
        .expect(302);
      await agent.get("/dat-xe/gio-hang").expect(302, /\/dang-nhap/);
      await agent.get("/thong-tin-ca-nhan").expect(302, /\/dang-nhap/);
      const landing = await agent.get("/").expect(200);
      assert.doesNotMatch(landing.text, /Xin chào, Thử/);
    } finally {
      await removeCustomer(customer);
    }
  },
);

test(
  "PRO-01: sửa hồ sơ cập nhật MySQL và session",
  { skip: !enabled },
  async () => {
    const customer = await makeCustomer();
    try {
      const agent = request.agent(app);
      await login(agent, customer.email);
      const form = await agent.get("/thong-tin-ca-nhan").expect(200);
      const newEmail = `new-${unique()}@example.test`;
      const response = await agent
        .post("/thong-tin-ca-nhan")
        .type("form")
        .send({
          ...profileData(customer, {
            name: "Nguyễn Văn Mới",
            address: "Địa chỉ mới tại Hà Nội",
            email: newEmail,
          }),
          _csrf: csrf(form.text),
        })
        .expect(200);
      assert.match(response.text, /Thông tin cá nhân đã được cập nhật/);
      const [[saved]] = await getPool().execute(
        "SELECT HoTen,DiaChi,Email FROM tblThanhVien WHERE MaTV=?",
        [customer.id],
      );
      assert.deepEqual(
        [saved.HoTen, saved.DiaChi, saved.Email],
        ["Nguyễn Văn Mới", "Địa chỉ mới tại Hà Nội", newEmail],
      );
      const home = await agent.get("/").expect(200);
      assert.match(home.text, /Xin chào, Mới/);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, new RegExp(newEmail));
    } finally {
      await removeCustomer(customer);
    }
  },
);

test(
  "PRO-02: email của khách khác bị từ chối, dữ liệu cũ được giữ",
  { skip: !enabled },
  async () => {
    const first = await makeCustomer();
    const second = await makeCustomer();
    try {
      const agent = request.agent(app);
      await login(agent, first.email);
      const form = await agent.get("/thong-tin-ca-nhan").expect(200);
      const response = await agent
        .post("/thong-tin-ca-nhan")
        .type("form")
        .send({
          ...profileData(first, { email: second.email }),
          _csrf: csrf(form.text),
        })
        .expect(422);
      assert.match(response.text, /Email hoặc số điện thoại đã được sử dụng/);
      const [[saved]] = await getPool().execute(
        "SELECT Email FROM tblThanhVien WHERE MaTV=?",
        [first.id],
      );
      assert.equal(saved.Email, first.email);
    } finally {
      await removeCustomer(first);
      await removeCustomer(second);
    }
  },
);

test(
  "PRO-03: hai khách đồng thời chọn một email, chỉ một cập nhật được",
  { skip: !enabled },
  async () => {
    const first = await makeCustomer();
    const second = await makeCustomer();
    try {
      const target = `shared-${unique()}@example.test`;
      const agents = [request.agent(app), request.agent(app)];
      const customers = [first, second];
      const forms = [];
      for (let i = 0; i < 2; i++) {
        await login(agents[i], customers[i].email);
        forms.push(await agents[i].get("/thong-tin-ca-nhan").expect(200));
      }
      const results = await Promise.all(
        agents.map((agent, i) =>
          agent
            .post("/thong-tin-ca-nhan")
            .type("form")
            .send({
              ...profileData(customers[i], { email: target }),
              _csrf: csrf(forms[i].text),
            }),
        ),
      );
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 422],
      );
      const [[count]] = await getPool().execute(
        "SELECT COUNT(*) AS total FROM tblThanhVien WHERE Email=?",
        [target],
      );
      assert.equal(count.total, 1);
    } finally {
      await removeCustomer(first);
      await removeCustomer(second);
    }
  },
);

test(
  "PRO-04: CSRF token sai trả 403, hồ sơ không đổi",
  { skip: !enabled },
  async () => {
    const customer = await makeCustomer();
    try {
      const agent = request.agent(app);
      await login(agent, customer.email);
      await agent.get("/thong-tin-ca-nhan").expect(200);
      await agent
        .post("/thong-tin-ca-nhan")
        .type("form")
        .send({
          ...profileData(customer, { name: "Không Được Lưu" }),
          _csrf: "invalid-token",
        })
        .expect(403);
      const [[saved]] = await getPool().execute(
        "SELECT HoTen FROM tblThanhVien WHERE MaTV=?",
        [customer.id],
      );
      assert.equal(saved.HoTen, "Khách Kiểm Thử");
    } finally {
      await removeCustomer(customer);
    }
  },
);
