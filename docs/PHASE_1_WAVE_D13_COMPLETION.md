# D13 — Tài khoản nhân viên và phân quyền bán hàng

> Cập nhật sau D13: [D14](PHASE_1_WAVE_D14_COMPLETION.md) đã hoàn tất nhân viên tự đổi mật khẩu và bắt buộc đổi mật khẩu được cấp. Các giới hạn D13 bên dưới là trạng thái tại thời điểm bàn giao D13.

Kiểm tra hoàn tất ngày 27/09/2026; khôi phục kết quả sau gián đoạn và hoàn tất bàn giao ngày 28/09/2026. Phạm vi một cửa hàng / một kho. Chưa triển khai lên máy chủ.

## Đã hoàn thành

Chủ cửa hàng có màn hình **Tài khoản nhân viên** tại `/admin/staff`, từ menu cấu hình hoặc menu điện thoại. Có thể tạo tài khoản, đổi vai trò, khóa/mở đăng nhập và đặt lại mật khẩu. Mỗi thay đổi ghi lịch sử người thực hiện; không ghi mật khẩu vào lịch sử.

Tên đăng nhập duy nhất, chuẩn hóa chữ thường; tên hiển thị có thể trùng. Tài khoản bị khóa được giữ lại để không làm mất danh tính trên chứng từ. Chủ cửa hàng tiếp tục dùng mật khẩu quản trị có sẵn; đợt này không đổi mật khẩu chủ cửa hàng và không tạo nhân viên thật trên DB local.

| Quyền | Chủ cửa hàng | Chỉ xem bán hàng | Thu ngân |
|---|---|---|---|
| Xem danh sách, chi tiết và in đơn bán | Có | Có | Có |
| Lập đơn bán/đặt trước | Có | Không | Có |
| Thu thêm tiền, giao đơn đặt trước | Có | Không | Có |
| Hủy đơn, nhận hàng trả, hoàn tiền | Có | Không | Không |
| Nhập mua, sửa kho, kiểm tra hàng trả | Có | Không | Không |
| Danh bạ đối tác, cấu hình, quản lý tài khoản | Có | Không | Không |
| Các trang báo cáo tổng hợp | Có | Không | Không |

Nhân viên xem được toàn bộ đơn trong cửa hàng, thông tin khách trên đơn và các tổng số hiện có ở danh sách đơn; chưa giới hạn chỉ xem đơn của bản thân. Thu ngân dùng giá bán, chiết khấu, bán nợ và thanh toán bằng số dư theo quy trình POS hiện có. Chưa có quyền riêng để ẩn giá vốn hoặc giới hạn mức giảm giá. Các dữ liệu sản phẩm/khách được POS tải về vẫn nằm trong phạm vi đọc của thu ngân.

## Cách sử dụng

1. Chủ cửa hàng vào **Tài khoản nhân viên**, tạo tên đăng nhập, tên hiển thị, mật khẩu 12–128 ký tự và vai trò.
2. Nhân viên vào `/admin/login`, nhập tên đăng nhập và mật khẩu riêng. Chủ cửa hàng để trống tên đăng nhập và dùng mật khẩu quản trị hiện có.
3. Khi nhân viên nghỉ hoặc đổi nhiệm vụ, khóa/đổi quyền rồi lưu. Các phiên cũ bị thu hồi, nhân viên cần đăng nhập lại theo quyền mới.
4. Nếu quên mật khẩu, chủ cửa hàng đặt lại tại tài khoản đó. Chưa có chức năng nhân viên tự đổi mật khẩu hoặc khôi phục bằng email.

## Bảo vệ phía máy chủ

- Mặc định từ chối đường dẫn và hành động chưa cấp quyền; API mới không tự được mở cho nhân viên.
- Thu ngân chỉ có ba hành động ghi tại API POS: tạo đơn, thu thêm và hoàn tất đặt trước. Thử trực tiếp API, thay JSON bằng biểu mẫu hoặc sửa tên hành động đều không vượt quyền.
- Phiên nhân viên kéo dài 12 giờ, dùng mã ngẫu nhiên 256 bit; DB chỉ lưu dấu băm của mã phiên. Mật khẩu dùng cơ chế PBKDF2 của dự án.
- Mỗi yêu cầu kiểm tra trạng thái tài khoản, phiên bản phiên và thời hạn. Đổi quyền, khóa hoặc đặt lại mật khẩu thu hồi phiên cũ; đăng xuất xóa phiên phía máy chủ. Đổi mật khẩu chủ cửa hàng cũng làm phiên nhân viên cũ mất hiệu lực.
- Có cookie nhân viên hết hạn/đã thu hồi thì không chuyển sang quyền chủ cửa hàng dù trình duyệt còn cookie chủ cửa hàng. Khóa có hiệu lực với yêu cầu tiếp theo, không hủy ngược giao dịch đã được xử lý.
- Sai mật khẩu năm lần sẽ tạm khóa đăng nhập tài khoản 10 phút. Vẫn dùng bộ giới hạn đăng nhập và Turnstile hiện có khi được cấu hình.
- Yêu cầu ghi của nhân viên và quản lý tài khoản phải cùng nguồn với ứng dụng.
- Chế độ phát triển vẫn cho quyền chủ cửa hàng khi không có cookie nhân viên, theo cơ chế cũ của dự án. Có cookie nhân viên thì vẫn kiểm tra quyền. Bằng chứng phân quyền được chạy trên bản dựng với bảo vệ đăng nhập bật, không dựa vào chế độ phát triển.

Danh tính ghi đơn/thu tiền/giao đơn lấy từ phiên xác thực (`NV#ID (username)`), không lấy tên người bán do trình duyệt tự gửi. Các API hủy đơn, hoàn khách/NCC, trả khách/NCC và kiểm tra hàng trả cũng dùng danh tính máy chủ. Nhật ký ở các phân hệ khác chưa được kiểm kê và chuẩn hóa hết.

## Kiểm thử và bằng chứng

`npm run verify` đã kết thúc mã thoát 0, được xác nhận lại từ tiến trình và log sau khi khôi phục lượt làm việc:

- 943 kiểm tra đơn vị đạt.
- Astro: 484 tệp, 0 lỗi, 0 cảnh báo, 43 gợi ý.
- Bản dựng, CSS, toàn bộ D1 và hồi quy nghiệp vụ cũ, Stripe, MCP và scaffold đều đạt.
- S01–S05: tên đăng nhập, mật khẩu băm, vai trò, phiên giả/hết hạn, đổi quyền, khóa, đổi mật khẩu, giới hạn đăng nhập và hoàn tác khi ghi lịch sử lỗi.
- H01–H04 trên bản dựng có bật đăng nhập, DB cô lập: người chưa đăng nhập bị chặn; chủ quản lý được tài khoản; nhân viên bị chặn API nhạy cảm; thu ngân bán hàng, thu thêm và hoàn tất đặt trước được; giả tên người ghi không có tác dụng; quyền mới và đăng xuất thu hồi phiên cũ.
- Đã xem ảnh trang quản lý và đăng nhập ở desktop, trang quản lý ở điện thoại 390 × 844; ảnh tạm đã xóa và kích thước trình duyệt đã trả về mặc định. Phần tạo/sửa/đăng nhập tài khoản được kiểm tra tự động qua HTTP; không thao tác mật khẩu thật trên giao diện.

Một lần kiểm tra HTTP ban đầu gặp phản hồi 500 từ phiên chạy cục bộ. Lần kiểm tra tập trung tiếp theo và lần `verify` cuối đều đạt; không thêm cơ chế tự thử lại thao tác ghi để che lỗi. Không khẳng định nguyên nhân của phản hồi tạm thời này.

Migration bổ sung `0063_kgame_staff_accounts.sql` đã áp dụng vào DB local qua Local Explorer. Kiểm tra tạo tài khoản và bán hàng dùng DB tạm riêng, được dọn sau kiểm tra. Không đổi dữ liệu sản phẩm, đối tác hoặc mật khẩu chủ cửa hàng local.

Bằng chứng: `docs/audit/wave-d13`. Log lưu đã loại đường dẫn cá nhân. Cây làm việc còn nhiều thay đổi từ các đợt trước; kiểm tra diff toàn dự án còn cảnh báo khoảng trắng cũ, không tuyên bố repository sạch.

## Phần còn lại

1. Mở rộng phân quyền kho, mua hàng, sửa chữa và kế toán sau khi kiểm kê các thao tác; hiện chỉ chủ cửa hàng được dùng các phân hệ này.
2. Quyền ẩn giá vốn/thông tin khách, giới hạn giảm giá, bán nợ và sử dụng số dư; quy trình duyệt thao tác vượt quyền. Thu ngân hiện có phạm vi rộng trong chính luồng bán hàng được cấp.
3. Nhân viên tự đổi mật khẩu, yêu cầu đổi mật khẩu lần đầu, chính sách MFA/SSO từng người và nhật ký đăng nhập. Chế độ chỉ dùng Cloudflare Access chưa ánh xạ danh tính Access sang vai trò nhân viên; tài khoản nhân viên hiện yêu cầu có mật khẩu chủ cửa hàng cấu hình sẵn.
4. Kiểm kê/chuẩn hóa danh tính người ghi ở các phân hệ còn lại. Bảo vệ quyền web không thay thế quyền của tích hợp MCP hoặc quyền truy cập DB trực tiếp; cần nghiệm thu riêng trước vận hành.
5. Các việc nghiệp vụ còn lại từ D12: chuyển tiền chờ hoàn thành số dư, xử lý hàng lỗi, báo cáo/in ấn còn lại, sửa chữa/thu mua/lắp ráp, web bán hàng, vận chuyển, sao lưu và thử vận hành cuối ngày.

Bước tiếp theo nên chốt giới hạn thao tác thu ngân (giá vốn, giảm giá, bán nợ/số dư) và bổ sung tự đổi mật khẩu trước khi cấp tài khoản cho nhân viên thực tế. Không coi D13 là nghiệm thu toàn bộ bảo mật hoặc sẵn sàng triển khai.
