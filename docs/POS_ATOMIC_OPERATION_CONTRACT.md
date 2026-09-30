# Quy tắc ghi nhận POS — bước B

> Cập nhật 13/09/2026: chính sách hủy/hoàn tiền đã được thay bởi [thiết kế mới](CANCELLATION_RETURN_AND_REFUND_CONTRACT.md). Các mô tả mặc định chuyển số dư bên dưới là mốc mã nguồn bước B/C, không phải chính sách cho lần triển khai tiếp theo.

Phạm vi đã được người dùng xác nhận: một cửa hàng, một kho; chặn xuất bán khi thiếu tồn, vẫn cho đặt trước. Dữ liệu hiện tại chỉ là dữ liệu thử; mọi lỗi đã xác nhận đều được phép sửa.

Quy tắc “orders paid-only” trong AGENTS.md mô tả storefront Minshop gốc. POS KGAME đã dùng cùng bảng orders cho đơn bán và đặt trước, kể cả trả một phần. Giữ nguyên quy tắc của storefront; chỉ các hàm POS có mã đơn KGAME được sử dụng mô hình đặt trước/công nợ. Không viết đơn chưa thanh toán vào luồng checkout gốc.

- Một thao tác tạo đơn, xuất đặt trước hoặc thu thêm phải ghi toàn bộ chứng từ liên quan trong một D1 batch nguyên tử. Điều kiện tồn, serial và trạng thái được kiểm tra lại ngay trong giao dịch, không chỉ kiểm tra trước đó.
- Mỗi yêu cầu có mã giao dịch. Gửi lại cùng mã và cùng nội dung trả lại kết quả đã ghi; cùng mã nhưng khác nội dung bị từ chối. Mã mới biểu thị một giao dịch mới, không tự gộp hai hóa đơn giống nhau.
- Tiền là số nguyên theo đơn vị lưu trữ hiện tại; số lượng là số nguyên dương. Từ chối giá/chiết khấu không hợp lệ hoặc tiền trả vượt tổng; không tự ép số sai về 0.
- Đơn còn tiền chưa trả phải có khách hàng xác định. POS dùng partners với is_customer = 1, cùng nguồn danh sách khách đang được giao diện sử dụng; không tự chọn khách bất kỳ.
- Phân loại phải thuộc đúng sản phẩm. Khi bỏ trống, chỉ tự chọn nếu có đúng một phân loại; không chọn đại giữa nhiều phiên bản. Nếu chưa có phân loại, tạo phân loại tiêu chuẩn cùng giao dịch, kế thừa tồn đang ghi của sản phẩm.
- Serial phải thuộc KGAME, đúng phân loại và tình trạng, đang sẵn sàng. Đặt trước có serial giữ trạng thái RESERVED, không trừ tồn vật lý. Khi xuất đúng đơn, serial chuyển SOLD; đơn đặt trước đã hủy/đã xuất không được xuất tiếp.
- Với hàng số lượng, đặt trước không trừ tồn. Xuất bán kiểm tra cả các dòng trùng sản phẩm/phân loại. Tồn tổng, mới/cũ, phân loại và thẻ kho thay đổi cùng nhau; không dùng MAX(0, ...) để che thiếu tồn.
- Hủy đơn phải dựa vào lượng thực tế đã xuất trong thẻ kho, không chỉ trạng thái COMPLETED. Hủy không tạo dòng xuất mới hoặc cho hoàn lần thứ hai. Hàng đã giao/đang giao chỉ được hoàn kho khi nhân viên xác nhận đã nhận lại hàng.
- Chính sách tiền đơn hủy do người dùng chốt: giữ phiếu thu, chuyển toàn bộ tiền đã thanh toán thành số dư của đúng khách. Đơn khách lẻ đã thu tiền phải chọn khách nhận số dư trước khi hủy. Lịch sử thanh toán lệch tiền đã thu bị chặn; không xóa tiền hoặc tự gán khách.
- Số dư được tính từ nhật ký tăng/giảm. Thanh toán bằng số dư ghi giảm số dư và một lần thanh toán CONFIRMED cùng giao dịch; không tạo phiếu thu mới. Không cho dùng vượt số dư, kể cả hai yêu cầu đồng thời. Hủy đơn đã thanh toán bằng số dư cộng lại số dư một lần.
- Dữ liệu khách/sản phẩm trùng do người dùng tạo có chủ ý không bị tự gộp hoặc xóa. Điện thoại khớp nhiều khách yêu cầu chọn khách cụ thể bằng id/mã.
- Xuất đặt trước giữ nguyên dòng hàng, số lượng, tình trạng và giá đã đặt; được gán hoặc thay serial sẵn sàng cùng phân loại/tình trạng. Không thêm hàng hoặc tự thay giá khi xuất. Muốn sửa nội dung đã đặt cần luồng sửa đơn riêng.
- Khách đưa dư tiền mặt: giao diện hiển thị tiền thừa, chỉ ghi thanh toán/phiếu thu bằng số còn phải trả. Không đưa tiền thừa vào paid_amount hoặc tự chuyển thành số dư.

Các chính sách giá vốn tính lại, hoàn tiền mặt từ số dư, tồn đầu kỳ và tích hợp vận chuyển chưa được xem là đã nghiệm thu. Giá vốn tại lúc xuất được lưu trên dòng đơn; không tự định giá vốn theo phần trăm doanh thu.
