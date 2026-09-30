# D9 — Hủy đơn chưa giao và hoàn tiền khách

## Đã triển khai

- API quản trị và biểu mẫu hủy đơn chuyển tiền thực thu sang nghĩa vụ chờ hoàn, giữ phiếu thu và lịch sử thanh toán gốc.
- Phần thanh toán bằng số dư được hoàn về số dư, không trở thành tiền mặt mới. Thanh toán hỗn hợp tách hai nguồn.
- Ngay trên chi tiết đơn có số phải hoàn, đã hoàn, còn chờ; chọn quỹ, số tiền thực trả, mã giao dịch và xác nhận thực trả. Hệ thống ghi phiếu chi liên kết đơn cùng nghĩa vụ hoàn trong một giao dịch.
- Gửi lại cùng mã yêu cầu không chi trùng; thay nội dung cùng mã bị chặn. Hai lần hoàn đồng thời không vượt phần còn lại. Phiếu chi xuất hiện với dấu trừ trong lịch sử quỹ.
- Đơn đã giao/đang giao không được dùng thao tác hủy để tự đưa hàng về kho bán. Cần triển khai phiếu khách trả hàng riêng; đây chưa phải nghiệm thu luồng hàng đã giao.

## Kiểm tra

`test/integration/kgame-order-refunds.mjs` được thêm vào cổng toàn hệ thống, gồm ba nhóm:

1. Hủy và hoàn từng phần, gửi lại, sai xác nhận, vượt số còn lại, hoàn đồng thời.
2. Thanh toán hỗn hợp tiền mặt và số dư; chỉ hoàn lại nguồn tương ứng.
3. Chặn hủy hàng đã giao; lỗi ghi cuối khi hủy/hoàn không để sót khoản tài chính dở dang.

Đã thử biểu mẫu trên dữ liệu test: đặt trước 1.000, thu 600, hủy tạo chờ hoàn 600; xác nhận trả 200 tạo phiếu chi và còn chờ 400. Thu gốc 600 còn nguyên, nợ phải thu bằng 0. Không chuyển tiền ngân hàng thật.

## Giới hạn và việc tiếp theo

- Phiếu khách trả hàng từng dòng/serial, kho chờ kiểm tra và thu hồi key chưa triển khai trong D9. Chưa cho hủy hàng đã giao qua API quản trị.
- Chưa có lựa chọn chuyển khoản chờ hoàn mới sang số dư, hoàn số dư ra tiền mặt hoặc danh sách tổng hợp mọi khoản khách chờ hoàn. Số dư cũ vẫn được bảo toàn.
- Hàm hủy nội bộ vẫn giữ chế độ tương thích CREDIT cho các luồng/test cũ; API quản trị đã ép chế độ PENDING và chặn hàng đã giao. Cần chuyển nốt hàm nội bộ khi thay toàn bộ luồng trả hàng; không dùng chế độ cũ để xây thêm điểm gọi mới.
- Khoản hoàn của đơn hủy không phải giảm doanh thu lần thứ hai: các báo cáo POS đã loại đơn hủy. Báo cáo tổng hợp trả hàng theo ngày phát sinh vẫn cần triển khai.
- Không đổi/xóa bản ghi trùng, không deploy, chưa nghiệm thu hệ thống để vận hành thật.

## Kết quả nghiệm thu kỹ thuật

`npm run verify` đạt, mã thoát 0: 936 kiểm tra đơn vị, các kiểm tra D1 (bao gồm O01–O03 mới), bản dựng, MCP và scaffold. Astro kiểm tra 468 tệp: 0 lỗi, 0 cảnh báo, 43 gợi ý. Sau chỉnh dấu tiền chi và thông báo, chạy lại kiểm tra Astro đạt và kiểm tra giao diện trực tiếp. Ảnh tạm đã xóa.

Kiểm tra diff vẫn có khoảng trắng từ các thay đổi trước; không tuyên bố toàn bộ cây làm việc sạch. Bằng chứng lưu tại `docs/audit/wave-d9`.
