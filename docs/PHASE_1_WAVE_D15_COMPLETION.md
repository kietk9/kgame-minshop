# D15 — Quyền riêng cho từng tài khoản

Cập nhật ngày 28/09/2026. Tiếp nối D14. Chưa triển khai lên máy chủ.

## Hành vi

Chỉ chủ cửa hàng được tạo tài khoản và bật/tắt quyền của nhân viên. Vai trò là mẫu khởi đầu; danh sách quyền đã lưu của từng người mới là quyền có hiệu lực. Trang tài khoản hiển thị các công tắc, nút áp dụng lại mẫu và lịch sử thay đổi. Nhân viên có trang **Quyền của tôi**, không có chức năng tự cấp quyền.

Có 15 quyền: xem đơn, lập đơn/đặt trước, thu tiền, giao đặt trước, xem giá vốn, đổi giá bán, giảm giá, bán còn nợ, dùng số dư khách, hủy đơn chưa giao, nhận hàng khách trả, hoàn tiền khách, nhập mua, xuất dùng/hủy kho và kiểm tra hàng trả, xem báo cáo.

Mẫu chỉ xem có quyền xem đơn. Mẫu thu ngân thêm lập đơn, thu tiền và giao đặt trước. Giá vốn, đổi giá, giảm giá, nợ, số dư, hủy/trả/hoàn, nhập mua, kho và báo cáo đều phải được chủ cấp riêng. Bỏ tất cả công tắc là không còn quyền nghiệp vụ; nhân viên vẫn xem quyền của mình, đổi mật khẩu và đăng xuất được.

Mọi quyền thao tác bán hàng cần quyền xem đơn. Quyền nhập mua cần quyền xem giá vốn vì chứng từ chứa giá mua, tổng nhập và tiền thanh toán; giao diện và máy chủ từ chối tổ hợp thiếu quyền này. Kho có thể dùng riêng để xem thẻ kho và xuất dùng/hủy; muốn kiểm tra hàng khách trả tại đơn thì cấp thêm xem đơn.

## Kiểm soát máy chủ và dữ liệu

- Danh sách cho phép theo trang, phương thức và hành động; đường mới/không biết tiếp tục chỉ dành cho chủ. Cùng kiểm tra cho JSON và biểu mẫu. Quyền hủy chỉ cho trạng thái hủy, không mở mọi thay đổi trạng thái.
- Quyền giá/giảm giá/nợ/số dư lấy từ phiên đã xác thực, không lấy từ nội dung người gửi. Không được đổi giá thì giá dòng phải đúng bảng giá sản phẩm/phiên bản và tình trạng mới/cũ; kiểm tra lại bảng giá trong giao dịch ghi để tránh thay đổi giữa lúc đọc và lưu.
- Đặt trước vẫn được cọc một phần hoặc chưa cọc. Xuất bán/giao đặt trước còn nợ cần quyền bán nợ. Thu thêm một phần để giảm nợ không cần quyền cho bán nợ. Dùng số dư cần quyền riêng ở cả lập đơn, thu thêm và giao đặt trước.
- Giá vốn và các giá trị lợi nhuận được bỏ khỏi dữ liệu POS/đơn/kho trước khi gửi tới trình duyệt. Giá trị không được xem hiển thị dấu gạch, không giả thành giá vốn bằng không.
- Báo cáo nhân viên ở `/admin/reports/staff` có doanh thu POS tháng hiện tại. Giá vốn/lợi nhuận chỉ hiện khi được cấp. Các báo cáo chi tiết cũ yêu cầu cả quyền báo cáo và giá vốn, vì chứa nhiều phép tính suy ra giá vốn.
- Lưu quyền, tăng phiên bản phiên, xóa phiên và ghi lịch sử trong cùng giao dịch. Các yêu cầu tiếp theo từ phiên cũ bị từ chối; không hủy ngược giao dịch đã được chấp nhận trước đó.
- Người lập đơn/thu tiền/xuất kho và tạo nhập/chi nhập dùng danh tính máy chủ. Không nhận tên người thực hiện giả do trình duyệt gửi.

Migration `0065_kgame_staff_permissions.sql` thêm danh sách quyền, chuyển tài khoản cũ về mẫu an toàn và thu hồi phiên. Đã áp dụng local; không đổi mật khẩu chủ cửa hàng và không xóa dữ liệu nghiệp vụ hoặc gộp sản phẩm/đối tác trùng.

## Sửa luồng kho trước khi cấp cho nhân viên

Xuất dùng/hủy trước đây ghi từng phần và chặn tồn âm bằng cách ép tồn về 0. Nay kiểm tra số lượng nguyên dương, đủ tồn sản phẩm/phiên bản, tình trạng, quyền sở hữu và khả dụng serial; kho, thẻ kho và kết quả chống gửi lại cùng thành công hoặc hoàn tác. Gửi trùng không trừ kho hai lần; cạnh tranh không xuất vượt tồn. Màn hình chọn đúng phân loại/serial và nhận diện đúng người thực hiện. Đây là ghi giảm tồn, không tự tạo phiếu chi tiền hay hạch toán đầy đủ chi phí kế toán.

## Kiểm tra

`npm run verify` đạt, mã thoát 0: **951 kiểm tra đơn vị**, Astro **493 tệp, 0 lỗi, 0 cảnh báo, 44 gợi ý**; bản dựng, CSS, toàn bộ D1/HTTP, Stripe, MCP và scaffold đạt. Bằng chứng ở `docs/audit/wave-d15`. Kiểm tra khoảng trắng còn 72 dòng cảnh báo cũ; không coi toàn repository sạch.

- Kiểm tra đơn vị: mẫu an toàn, đầu vào quyền lạ, phụ thuộc quyền, JSON/biểu mẫu hủy, đường chưa biết và loại bỏ dữ liệu giá vốn lồng nhau.
- HTTP trên bản dựng có bảo vệ đăng nhập: chủ cấp quyền; nhân viên không tự cấp; quyền tùy chỉnh khác mẫu; thay quyền thu hồi phiên; trang/API được cho phép hoặc từ chối; chặn giá, giảm giá, nợ, số dư chưa cấp; dữ liệu giá vốn có/không có theo quyền.
- D1: quyền đổi giá, giảm giá và bán nợ độc lập; cọc trước không bị chặn nhưng giao còn nợ bị chặn; đổi bảng giá làm yêu cầu giá cũ bị từ chối. Hồi quy thu tiền, số dư, hủy/trả/hoàn và nhập mua tiếp tục chạy.
- Kho: số lượng sai, vượt tồn, dòng cuối sai, gửi lại đồng thời, hai người xuất cạnh tranh và lỗi ghi lịch sử đều được kiểm tra.
- Giao diện: xem trang công tắc quyền, quyền của tôi, báo cáo không có giá vốn và kho; kiểm tra desktop và điện thoại 390 × 844. Ảnh tạm đã xem và xóa. Tài khoản thử local đã khóa, bỏ quyền và thu hồi hết phiên; không sửa tài khoản có sẵn hoặc dữ liệu bán hàng khi thử giao diện.

Các lần thử trung gian gặp giới hạn theo dõi tệp và bộ nhớ đệm công cụ. Dùng chế độ theo dõi phù hợp và cache riêng để chạy lại; không thêm tự động thử lại thao tác tiền/kho vào sản phẩm.

## Giới hạn và việc tiếp theo

D15 hoàn thành phạm vi quyền cá nhân cho các luồng nêu trên, không phải nghiệm thu toàn hệ thống. Chưa có hạn mức số tiền/chiết khấu, cơ chế chủ duyệt từng giao dịch, giới hạn xem theo nhân viên hoặc quyền tách riêng thông tin liên hệ khách. Danh mục sản phẩm/đối tác, sửa chữa, thu mua, lắp ráp, cấu hình và các đường chưa liệt kê vẫn chỉ dành cho chủ. Quyền kho hiện chưa tạo thêm nghiệp vụ kiểm kê/điều chỉnh tăng tồn.

Báo cáo vẫn là POS tạm tính theo phạm vi D8–D11. Cần tiếp tục: hàng lỗi sau kiểm tra; chuyển khoản chờ hoàn thành số dư; ứng trước NCC; hoàn thiện báo cáo và chứng từ cũ; sửa chữa/thu mua/lắp ráp; đối chiếu web bán hàng và giao vận; sao lưu/khôi phục và thử vận hành cuối ngày. Chưa tự động triển khai lên máy chủ.
