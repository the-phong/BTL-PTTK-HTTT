# Lăn Bánh — hệ thống thuê xe ô tô

Ứng dụng Node.js/Express, EJS SSR và MySQL cho đăng ký tài khoản, đăng nhập, tìm/chọn nhiều xe, xác nhận đặt xe và xem lịch sử phiếu.

## Chạy ứng dụng

1. Cài Node.js 18+ và MySQL 8.
2. `cp .env.example .env`, cập nhật cấu hình kết nối MySQL.
3. `npm install`
4. `npm run db:init` để tạo schema và dữ liệu xe mẫu.
5. `npm start` rồi mở `http://localhost:3000`.

Không có tài khoản mẫu với mật khẩu mặc định; tạo tài khoản qua `/dang-ky`.

## Cấu trúc

- `src/features`: registration, login, booking theo routes/controller/service/repository.
- `src/shared`: kết nối MySQL, CSRF và middleware đăng nhập.
- `db/migrations`: bảng thành viên, khách hàng, xe, phiếu đặt, chi tiết phiếu.
- `scripts`: khởi tạo schema và xe mẫu.
- `public`: CSS và hình ảnh tĩnh.

## Bảo vệ xung đột

Xác nhận đặt xe dùng transaction, khóa các dòng xe bằng `SELECT ... FOR UPDATE`, kiểm tra lại toàn bộ khoảng thuê rồi mới ghi phiếu và chi tiết. Giá giờ được sao lưu vào chi tiết phiếu. Lịch sử/chi tiết chỉ truy vấn theo mã khách hàng trong session.
