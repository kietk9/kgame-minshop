# D14 — Mật khẩu riêng của nhân viên

Hoàn thành ngày 28/09/2026. Tiếp nối tài khoản/phân quyền D13; chưa triển khai lên máy chủ.

## Hành vi đã hoàn thiện

Nhân viên có mục **Đổi mật khẩu** trong thanh điều hướng, mở `/admin/change-password`. Phải nhập mật khẩu hiện tại, mật khẩu mới và xác nhận. Mật khẩu mới dài 12–128 ký tự, khác mật khẩu hiện tại. Chủ cửa hàng vẫn dùng luồng cấu hình quản trị riêng, không dùng API đổi mật khẩu nhân viên.

Tài khoản mới hoặc vừa được chủ cửa hàng đặt lại mật khẩu phải đổi mật khẩu được cấp trước khi sử dụng. Trong thời gian đó, máy chủ chỉ cho phép màn hình/API đổi mật khẩu và đăng xuất; truy cập trang nghiệp vụ chuyển về màn hình đổi mật khẩu, gọi API nghiệp vụ trả 403. Chỉ đổi vai trò không buộc đổi lại mật khẩu đã cá nhân hóa.

Sau khi đổi thành công, tất cả phiên của chính tài khoản đó bị thu hồi, kể cả phiên đang dùng. Nhân viên đăng nhập lại bằng mật khẩu mới. Mật khẩu cũ không còn dùng được. Màn hình chủ cửa hàng hiển thị tài khoản nào còn cần đổi mật khẩu được cấp.

Migration mới `0064_kgame_staff_password_change.sql` đặt trạng thái cần đổi mật khẩu cho cả tài khoản nhân viên tồn tại trước D14. Điều này áp dụng từ yêu cầu tiếp theo sau khi migration và mã mới cùng được đưa vào sử dụng. Không đổi mật khẩu chủ cửa hàng.

## Tính toàn vẹn và kiểm soát

- Chọn tài khoản bằng phiên đăng nhập đang có hiệu lực, không lấy ID/vai trò gửi trong biểu mẫu.
- Kiểm tra mật khẩu hiện tại và nguồn yêu cầu; người ngoài và chủ cửa hàng không dùng API này để tự chọn tài khoản khác.
- Sai mật khẩu hiện tại năm lần bị tạm khóa thao tác xác minh trong 10 phút, dùng cùng bộ đếm với đăng nhập. Bộ giới hạn đăng nhập hiện có cũng bao phủ API đổi mật khẩu.
- Lưu mật khẩu băm mới, bỏ cờ bắt buộc đổi, thu hồi phiên và ghi lịch sử trong một giao dịch. Ghi lịch sử lỗi thì không đổi mật khẩu và không xóa phiên.
- Kiểm tra lại phiên, trạng thái khóa, phiên bản tài khoản và mật khẩu băm tại thời điểm ghi. Hai yêu cầu đổi đồng thời chỉ một yêu cầu thành công; phiên cũ không thể gửi lại để đổi lần nữa.
- Lịch sử ghi `SELF_PASSWORD_CHANGE` và danh tính `NV#ID (username)`, không chứa mật khẩu.

## Kiểm tra đã đạt

`npm run verify` đạt, mã thoát 0:

- 946 kiểm tra đơn vị.
- Astro 487 tệp: 0 lỗi, 0 cảnh báo, 44 gợi ý. Có một gợi ý biến `identity` chưa dùng tại trang đăng nhập dù biến được dùng ở lệnh chuyển hướng ngay sau; hành vi chuyển hướng được xác nhận qua HTTP và giao diện.
- Toàn bộ kiểm tra D1, bản dựng, CSS, Stripe, MCP và scaffold đạt.
- W01–W05: bắt buộc đổi ban đầu; đầu vào sai không ghi; thu hồi tất cả phiên; mật khẩu cũ bị từ chối; đổi quyền không đặt lại cờ; chủ đặt lại mật khẩu có đặt cờ; giới hạn thử sai; cạnh tranh; gửi lại phiên cũ; hoàn tác khi lỗi lịch sử; tài khoản khóa không được đổi.
- H05 và hồi quy H01–H04 trên bản dựng có bật bảo vệ đăng nhập: chặn nghiệp vụ trước khi đổi; ID/vai trò giả không điều khiển tài khoản đích; đổi xong đăng nhập lại và dùng đúng quyền; đổi tự nguyện sau lần đầu vẫn hoạt động; yêu cầu khác nguồn bị chặn.

Đã áp dụng migration 0064 vào DB local qua Local Explorer. Tạo một tài khoản **chỉ xem dùng riêng cho kiểm tra**, đăng nhập trên trình duyệt và xác nhận được đưa tới màn hình đổi mật khẩu; bấm vào Đơn hàng vẫn trở lại màn hình bắt buộc đổi. Đã xem bố cục desktop và điện thoại 390 × 844. Không gửi biểu mẫu đổi mật khẩu thật trên trình duyệt; các thao tác thay mật khẩu được kiểm tra tự động bằng tài khoản trong DB cô lập.

Tài khoản thử local đã bị khóa, số phiên còn lại bằng 0. Tệp thông tin đăng nhập tạm và ảnh chụp đã xóa; trình duyệt đăng xuất, đóng tab và trả kích thước về mặc định. Không thay đổi mật khẩu tài khoản có sẵn hay dữ liệu bán hàng local.

Bằng chứng: `docs/audit/wave-d14`. Các cảnh báo khoảng trắng cũ trong cây làm việc vẫn còn, không coi toàn repository sạch.

## Còn lại và bước kế tiếp

- Giới hạn giảm giá, giá bán, bán nợ và sử dụng số dư của thu ngân; quyền ẩn giá vốn/thông tin khách. Đây là bước ưu tiên tiếp theo trước cấp tài khoản bán hàng thực tế.
- Vai trò kho, nhập mua, sửa chữa, kế toán và cơ chế chủ duyệt thao tác vượt quyền; hiện các phân hệ đó vẫn dành cho chủ.
- MFA/SSO theo từng nhân viên, khôi phục qua email và lịch sử đăng nhập đầy đủ. D14 không thay cơ chế chủ cửa hàng hay tích hợp MCP/DB trực tiếp.
- Các nghiệp vụ còn lại theo D12/D13: chuyển khoản chờ hoàn thành số dư, xử lý hàng lỗi, hoàn thiện báo cáo/chứng từ, sửa chữa/thu mua/lắp ráp, web bán hàng và vận chuyển; sao lưu/khôi phục và thử vận hành cuối ngày.

D14 hoàn tất phạm vi mật khẩu nhân viên, không phải nghiệm thu toàn bộ bảo mật hay toàn bộ hệ thống.
