# Đợt 1 — Bước B: kho, thanh toán và số dư khách

Ngày: 13/09/2026. Phạm vi: một cửa hàng, một kho. Dữ liệu hiện tại là dữ liệu thử; dữ liệu trùng do người dùng tạo có chủ ý được giữ riêng.

## Chính sách đã chốt

Chặn xuất khi không đủ tồn; vẫn nhận đặt trước. Hủy đơn đã thanh toán giữ phiếu thu và chuyển tiền thành số dư đúng khách. Đơn khách lẻ đã thu tiền cần chọn khách nhận số dư. Hàng đang giao/đã giao cần xác nhận thực tế đã nhận lại trước khi hoàn kho. Không tự hoàn tiền mặt.

Quy tắc chính thức: [POS_ATOMIC_OPERATION_CONTRACT.md](POS_ATOMIC_OPERATION_CONTRACT.md).

## Thay đổi

- Tạo đơn, thu thêm và xuất đặt trước ghi chứng từ, tiền, tồn, serial và kết quả giao dịch trong một D1 batch nguyên tử. Lỗi ở bước cuối hoàn tác toàn bộ. Điều kiện được kiểm tra lại trong giao dịch để chặn các yêu cầu đồng thời.
- Mã giao dịch chống thu/xuất lại khi nhấn lại hoặc gửi lại. Hai hóa đơn giống nhau với mã mới vẫn là hai giao dịch riêng. Nội dung khác dùng cùng mã bị từ chối.
- Kiểm tra nhu cầu cộng dồn giữa các dòng; chặn tồn thiếu hoặc tồn tổng/mới/cũ lệch, số lượng/phân loại/serial sai. Không ép tồn âm thành 0. Phân loại mặc định kế thừa tồn cùng giao dịch; nhiều phân loại phải chọn rõ.
- Đặt trước giữ serial RESERVED nhưng không trừ tồn vật lý. Khi xuất được gán serial chưa chọn hoặc thay serial cùng phân loại/tình trạng; giữ giá và số lượng đã đặt. Đơn đã hủy/đã xuất không được xuất tiếp hoặc thu thêm sau hủy.
- Hủy hoàn lượng thực tế còn đã xuất trong thẻ kho, không phụ thuộc riêng trạng thái COMPLETED. Giữ phiếu thu, ghi tăng số dư một lần. Thanh toán bằng số dư ghi giảm số dư và thanh toán, không tạo phiếu quỹ mới.
- POS sử dụng partners cùng nguồn danh sách khách. Điện thoại trùng nhiều khách không tự gán; chọn khách cụ thể vẫn vận hành bình thường. Không tự gộp khách hoặc sản phẩm.
- Xuất linh kiện sửa chữa cập nhật tồn mới, tồn tổng, tồn phân loại, thẻ kho, chi phí và sự kiện cùng giao dịch.
- Giao diện bỏ hành động xuất/thu trên đơn hủy; nội dung tồn, công nợ, số dư khớp trạng thái. Bổ sung thanh toán bằng số dư và lịch sử số dư tại khách hàng. Tính tổng gồm chiết khấu dòng và phí giao; xuất đặt trước dùng tổng đã lưu. Khách đưa dư tiền mặt chỉ ghi nhận tiền bằng giá trị còn phải trả.

## Kiểm tra

Cổng `npm run verify` đạt toàn bộ, mã thoát 0: **933 kiểm tra đơn vị**, **0 lỗi, 0 cảnh báo, 42 gợi ý** trên 446 tệp; bản dựng/CSS; **21 ca POS và áp dụng toàn bộ migration D1**; audit và sáu nhóm tích hợp có sẵn; Worker D1; quốc gia Stripe; MCP kiểm tra kiểu/đóng gói dry-run; 14 ca bộ tạo dự án.

21 tình huống nghiệp vụ trên D1 tách biệt và một kiểm tra áp dụng toàn bộ migration thật: B01–B08; bán món cuối đồng thời; gửi lại/đổi nội dung mã giao dịch; thu thêm/xuất đồng thời; hủy đã thu tiền; thanh toán số dư, không đủ số dư và dùng đồng thời; gán serial khi xuất; lỗi thật tại phiếu quỹ/số dư/sự kiện sửa chữa để kiểm tra rollback; chuyển trạng thái không được bỏ qua xuất đặt trước; phân loại thiếu/nhiều; tồn phân số; yêu cầu gửi lại hoàn tất trong lúc đang kiểm tra; khách trùng điện thoại chọn tự động/cụ thể.

Kiểm tra trực tiếp qua giao diện và đối chiếu D1 cục bộ:

| Tình huống | Kết quả |
|---|---|
| Đặt trước 1.000, cọc tiền mặt 200, hủy | Giữ phiếu thu 200, số dư +200, COD 0; không xuất kho; không còn nút xuất/thu |
| Bán 1.000, dùng số dư 200 | Thanh toán CREDIT 200, COD 800, số dư 0, không tạo phiếu thu mới |
| Bán 1.000, khách đưa 1.500 tiền mặt | Thanh toán và phiếu thu 1.000, COD 0, tồn giảm đúng một; màn hình hóa đơn mới đặt lại tiền mặt/số dư 0 |

Màn hình khách thử hiển thị số dư 0, nhật ký +200 khi hủy và -200 khi thanh toán, nợ cần thu 800. Đã kiểm tra giao diện POS, hủy đơn và lịch sử số dư; ảnh chỉ lưu tạm, xem và xóa sau xác minh. Không triển khai môi trường thật.

## Cơ sở dữ liệu thử và migration

Bổ sung 0056 và 0057; không sửa migration đã áp dụng. Toàn bộ chuỗi migration chạy được từ cơ sở dữ liệu mới trong kiểm tra D1.

Cơ sở dữ liệu thử cũ có schema được sửa thủ công nhưng lịch sử migration không khớp: chạy cập nhật cục bộ vướng cột address đã có ở bước cũ. Chỉ bổ sung hai migration mới qua Local Explorer và ghi lại đúng hai tên trong d1_migrations; không tự đánh dấu những migration cũ chưa được đối chiếu. Không xóa dữ liệu trùng có chủ ý. Khi chuẩn bị bộ nghiệm thu toàn hệ thống, nên tạo cơ sở dữ liệu thử mới từ chuỗi migration rồi dựng từng tình huống chuẩn, thay vì vá số liệu cũ cho báo cáo đạt.

## Giới hạn và công việc kế tiếp

Kết quả này nghiệm thu các đường POS/thu/hủy/số dư và xuất linh kiện nêu trên; không chứng minh toàn bộ ứng dụng đã sẵn sàng vận hành.

1. Tài khoản nhân viên và phân quyền theo hành động; kiểm tra ở chế độ production vì chế độ phát triển đang bỏ qua cổng đăng nhập.
2. Thống nhất định danh khách/đối tác ở sửa chữa, thu mua và các đường cũ còn sử dụng customers; thống nhất đơn web và POS, không tự ghép id giữa hai nguồn.
3. Kiểm chứng nhập/thu mua, đổi trả từng phần, xuất khác, lắp ráp và sửa chứng từ; xử lý gửi lại ở các luồng ngoài POS. Các đường thu nợ tổng/quỹ thủ công, hoàn tiền mặt từ số dư và sửa nội dung đơn đặt trước chưa được nghiệm thu.
4. Chốt tồn đầu kỳ/giá vốn/đổi trả và đối chiếu báo cáo doanh thu, nợ, quỹ, số dư. Tiền giữ trong quỹ sau hủy là nghĩa vụ số dư khách; không coi là doanh thu hoặc khoản nợ phải thu của đơn hủy.
5. Sau các bước trên mới tích hợp giao hàng qua môi trường thử, kiểm tra gọi lại, lỗi giữa chừng, COD và đối soát. Giao diện tạo đơn GHN hiện chưa có nghĩa là đã mua vận đơn thật.

Bằng chứng bước B nằm trong docs/audit/wave-b. Báo cáo mốc bước A và đợt 1 được giữ để so sánh; các mô tả “B01–B07 đang mở” ở mốc cũ là trạng thái trước bước B, không phải kết quả mới.
