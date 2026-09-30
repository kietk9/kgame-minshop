# D10 — Nhận hàng khách trả, giảm nợ và hoàn tiền

## Phạm vi

Phiếu trả hàng tham chiếu từng dòng bán đã giao, giữ nguyên hóa đơn và thanh toán gốc. Trả từng phần được phân bổ theo giá bán và chiết khấu gốc, làm tròn cộng dồn để tổng trả không lệch. Không tự hoàn phí vận chuyển. Cần xác nhận đã nhận hàng/quyền sử dụng và ghi lý do.

Hàng nhận lại ở trạng thái chờ kiểm tra, chưa tăng tồn sẵn bán. Serial chuyển RETURN_INSPECTION. Với hàng số lượng, phiếu/dòng trả là sổ tiếp nhận chờ kiểm tra; chưa ghi tăng thẻ kho sẵn bán. Chưa có bước kết thúc kiểm tra/đưa lại lên kệ trong D10.

## Tiền và công nợ

- Đơn 1.000, thu 600, trả hàng 700: giảm nợ 400 trước, tạo nghĩa vụ hoàn 300.
- Trả hàng 200: nợ còn 200; các luồng thu thêm/bulk dùng cùng nghiệp vụ thu tiền chỉ được thu phần này.
- Tiền trả bằng số dư được phục hồi trước trong phạm vi đã sử dụng; chỉ phần còn lại mới là nghĩa vụ hoàn tiền mặt/ngân hàng.
- Nhận thêm hàng trả cập nhật nghĩa vụ hoàn cộng dồn, giữ các lần tiền đã hoàn.
- Phiếu chi thực trả dùng màn hình hoàn tiền tại đơn, xác nhận thực tế và chống chi trùng như D9.
- Giá trị hàng trả giảm doanh thu một lần; thanh toán nghĩa vụ hoàn không làm giảm doanh thu thêm lần nữa. Tổng bán ở danh bạ trừ hàng đã trả.

## Kiểm tra mới

`test/integration/kgame-customer-returns.mjs`:

1. Ví dụ 1.000/600/700, gửi lại, trả tiếp, vượt lượng trả; tồn bán không tăng.
2. Giảm nợ rồi thu đúng số còn lại, chặn thu số nợ cũ.
3. Thanh toán hỗn hợp tiền/số dư, hoàn về đúng nguồn.
4. Serial chờ kiểm tra; phân bổ chiết khấu trả từng phần không mất đơn vị tiền.
5. Hai thao tác trả đồng thời và lỗi ghi cuối không tạo phiếu/tiền dở dang; hàng chưa kiểm tra chặn công bố lợi nhuận chưa đủ cơ sở.

## Giới hạn cần tiếp tục

- Cần hoàn thiện màn hình kiểm tra hàng trả: đủ điều kiện bán lại, hàng lỗi, tiêu hủy và xác minh key. Chưa tự động đưa hàng nhận lại lên kệ.
- Giá vốn hàng trả chưa được đảo về tài sản trong D10. Báo cáo đánh dấu chưa đủ dữ liệu lợi nhuận khi có hàng trả chờ kiểm tra; không trình bày con số lãi giả.
- Serial phải trả theo dòng một mã. Dòng cũ chứa nhiều serial, thiếu lịch sử xuất hoặc không khớp tiền bị chặn để đối chiếu.
- Đơn phải hoàn tất giao mới được lập phiếu; đơn đang vận chuyển cần quy trình giao thất bại/nhận lại và đối soát vận chuyển riêng.
- Chưa có sửa/hủy phiếu trả, giữ khoản chờ hoàn thành số dư theo lựa chọn, danh sách tập trung mọi khoản hoàn hoặc hoàn phí vận chuyển riêng.
- Báo cáo vẫn theo tập đơn bán trong kỳ, chưa phải sổ sự kiện trả hàng theo ngày phát sinh.

Migration `0061_kgame_customer_returns.sql` thêm mới; không sửa migration cũ. Không deploy, không hợp nhất/xóa các bản ghi trùng.

## Nghiệm thu kỹ thuật

Cổng `npm run verify` đã đạt (mã thoát 0): 937 kiểm tra đơn vị, kiểm tra D1 gồm T01–T05 mới và hồi quy các luồng trước, bản dựng, MCP và scaffold. Astro: 471 tệp, 0 lỗi, 0 cảnh báo, 43 gợi ý. Chỉnh cuối phần hiển thị số lượng đã trả và ẩn nút hủy hàng đã giao được kiểm tra lại bằng Astro và trình duyệt.

Đã áp dụng migration 0061 vào DB local qua Local Explorer. Thử biểu mẫu bán 10 món tổng 1.000, đã thu 600; trả 7 món tạo phiếu THB000001 trị giá 700, giảm nợ về 0 và hoàn 300. Sau xác nhận thực trả: thu gốc 600, giá trị hàng trả 700, đã hoàn 300, nợ 0, tồn bán 0, lượng chờ kiểm tra 7. Giới hạn nhập lượng còn trả là 3. Đã kiểm tra ảnh giao diện và xóa ảnh tạm.

`git diff --check` còn cảnh báo khoảng trắng thuộc các thay đổi có sẵn, không tuyên bố toàn bộ cây làm việc sạch. Bằng chứng ở `docs/audit/wave-d10`.
