# Lăn Bánh — hệ thống thuê xe ô tô

Ứng dụng Node.js/Express, EJS SSR và MySQL cho đăng ký tài khoản, đăng nhập, cập nhật thông tin cá nhân, tìm/chọn nhiều xe, xác nhận đặt xe và xem lịch sử phiếu. Danh sách xe được chia 12 xe mỗi trang.

## Chạy ứng dụng

1. Cài Node.js 18+ và MySQL 8.
2. `cp .env.example .env`, cập nhật cấu hình kết nối MySQL.
3. `npm install`
4. `npm run db:init` để tạo schema và dữ liệu xe mẫu.
5. `npm start` rồi mở `http://localhost:3000`.

## Dữ liệu demo mở rộng

Điền `DEMO_SEED_PASSWORD` (tối thiểu 8 ký tự) vào `.env`, chạy `npm run db:init` rồi `npm run db:seed`. Script tạo thêm 300 xe mã `DEMO-XE-0001` đến `DEMO-XE-0300`, 6 khách hàng và 10 thành viên nhân viên. Có 72 phiếu đặt mẫu: 24 phiếu đã hoàn tất, 12 phiếu đang thuê và 36 phiếu sắp tới. Mỗi phiếu có 1–3 xe; lịch của các xe mẫu không giao nhau. Chạy lại script không tạo trùng dữ liệu. Sáu xe mẫu cũ do `db:init` tạo vẫn được giữ nguyên, nên tổng số xe thường là 306.

Email khách hàng: `demo.kh01@example.test` đến `demo.kh06@example.test`. Email nhân viên: `demo.nv01@example.test` đến `demo.nv10@example.test`. Mật khẩu là giá trị `DEMO_SEED_PASSWORD` ở lần chạy seed đầu tiên. Tài khoản nhân viên có vai trò trong dữ liệu; giao diện hiện chỉ hỗ trợ đăng nhập khách hàng.

Trong môi trường WSL hiện tại, MySQL chạy trên Windows và `localhost:3306` từ WSL không kết nối được. Chạy lệnh Node bằng Windows Terminal tại thư mục dự án, hoặc dùng `node.exe scripts/init-db.js` và `node.exe scripts/seed-demo.js` từ WSL. Khi chạy ứng dụng trong WSL, cần cấu hình một địa chỉ MySQL mà WSL truy cập được; chạy ứng dụng bằng Node trên Windows sẽ dùng được `DB_HOST=localhost` hiện tại.

Không có tài khoản mẫu với mật khẩu mặc định; tạo tài khoản qua `/dang-ky`.

`SESSION_SECRET` phải dài ít nhất 32 ký tự. `DB_HOST`, `DB_USER` và `DB_NAME` là các biến bắt buộc. `DB_NAME` chỉ dùng chữ, số và dấu gạch dưới.

Chạy `npm test` cho các kiểm tra không cần database. Khi MySQL đã chạy và schema đã được khởi tạo, dùng `RUN_DB_TESTS=1 npm test` để kiểm tra rollback và hai yêu cầu đặt cùng xe đồng thời. Các bài kiểm tra MySQL tạo dữ liệu riêng rồi xóa sau khi chạy.

## Cấu trúc

- `src/features`: registration, login, booking theo routes/controller/service/repository.
- `src/shared`: kết nối MySQL, CSRF và middleware đăng nhập.
- `db/migrations`: bảng thành viên, khách hàng, xe, phiếu đặt, chi tiết phiếu.
- `scripts`: khởi tạo schema và xe mẫu.
- `public`: CSS và hình ảnh tĩnh.

Ảnh xe minh họa theo nhóm Sedan/Hatchback, SUV, MPV và bán tải nằm trong `public/images/vehicles/`. Các ảnh được tạo cho demo và không phải ảnh của từng xe thực tế.

## Bảo vệ xung đột

Xác nhận đặt xe dùng transaction, khóa các dòng xe bằng `SELECT ... FOR UPDATE`, kiểm tra lại toàn bộ khoảng thuê rồi mới ghi phiếu và chi tiết. Giá giờ được sao lưu vào chi tiết phiếu. Lịch sử/chi tiết chỉ truy vấn theo mã khách hàng trong session.

Phiếu đặt mới có mã hiển thị `PD` theo sau bởi ID được đệm tối thiểu 6 chữ số, ví dụ `PD000001`. Mã này được ghi trong cùng transaction với phiếu và các chi tiết.
