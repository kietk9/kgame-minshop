# Quy tắc thu/trả nợ và sổ quỹ — bước C

> Cập nhật 13/09/2026: chính sách hủy/hoàn tiền đã được thay bởi [thiết kế mới](CANCELLATION_RETURN_AND_REFUND_CONTRACT.md). Các mô tả mặc định chuyển số dư bên dưới là mốc mã nguồn bước B/C, không phải chính sách cho lần triển khai tiếp theo.

Phạm vi: một cửa hàng, một kho; dữ liệu thử; giữ khách/sản phẩm trùng có chủ ý. Kế thừa [quy tắc POS](POS_ATOMIC_OPERATION_CONTRACT.md), nhất là giữ phiếu thu và chuyển tiền đơn hủy thành số dư đúng khách.

- Một nhóm thanh toán ghi toàn bộ hoặc không ghi gì. Chứng từ thiếu, trùng, sai đối tác, đã hủy, tiền không hợp lệ/vượt nợ hoặc lỗi ghi cuối cùng phải từ chối cả nhóm. Không bỏ qua dòng sai rồi báo thành công.
- Chọn đối tác bằng id/mã, kiểm tra vai trò và quyền sở hữu từng chứng từ trong giao dịch. Tên, điện thoại và mã chứng từ do trình duyệt gửi không quyết định quyền sở hữu.
- Thu đơn hàng sử dụng cùng phần lập thanh toán với POS: payment CONFIRMED, tiền đã thu, payment_status PARTIALLY_PAID/PAID, COD đơn/vận chuyển và phiếu thu cùng cập nhật. Không tự ép nợ âm thành 0 hoặc dùng trạng thái PARTIAL khác bộ giá trị hiện có.
- Nhận cọc đặt trước tại chi tiết đơn vẫn được giữ. Màn hình công nợ tổng liệt kê nợ hóa đơn bán và phí sửa chữa, không cộng đơn đặt trước chưa xuất vào nợ hóa đơn.
- Trả nợ phiếu nhập kiểm tra đúng nhà cung cấp, tổng/đã trả/nợ và lịch sử phiếu chi. Giữ khả năng trả tiền cho phiếu nháp hiện có; đây chỉ là ghi tiền, không hoàn tất nhập kho hoặc tự xuất/nhập tồn.
- Thu phí sửa tính số đã thu thực tế từ phiếu quỹ REPAIR_FEE còn hiệu lực, trừ các khoản trả lại cùng tham chiếu; chỉ thu trong phần giá sửa còn lại. Phiếu hủy hoặc thiết bị thuộc KGAME không phải khoản thu khách.
- Sửa chữa còn dùng customers cũ. Chỉ liên kết khi id và customer_code khớp id và partner_code được giữ khi chuyển danh bạ. Không dùng tên/điện thoại hoặc sự trùng id đơn thuần để đoán khách. Chứng từ không xác định được liên kết bị chặn, cần luồng đối chiếu riêng.
- Phiếu quỹ thủ công chỉ dành thu chi khác/chi phí vận hành. Tiền đơn, nhập hàng, thu mua, sửa chữa, đặt cọc/số dư, hoàn tiền và COD phải đi từ nghiệp vụ tương ứng để có chứng từ và cập nhật đúng nghĩa vụ. Màn hình sổ quỹ vẫn tra cứu các khoản mục đó; chỉ lựa chọn tạo phiếu rời bị giới hạn.
- Số tiền là số nguyên dương; không biến số âm thành dương, không bỏ dấu thập phân để thu sai. EXPENSE là phiếu OUT.
- Mã PT/PC sinh ngay trong lệnh ghi. Mã yêu cầu chống ghi lại khi gửi lại hoặc nhấn hai lần. Cùng mã khác nội dung bị từ chối; mã mới là giao dịch mới. Cả điều kiện nợ và lịch sử thanh toán được kiểm tra lại ngay trong D1 batch.
- Lịch sử quỹ của một khách/nhà cung cấp chỉ lấy từ tham chiếu chứng từ thuộc họ. Không ghép theo recipient_name vì tên có thể trùng; phiếu thủ công chưa có tham chiếu đối tác vẫn ở sổ quỹ chung.

Các sai lệch lịch sử bị báo để rà soát, không tự tạo tiền, xóa phiếu hoặc gán nợ cho đối tác khác. Quy tắc này chưa nghiệm thu hủy/sửa phiếu nhập, hủy/đổi giá sửa chữa, hoàn tiền từ số dư, giá vốn/báo cáo hoặc các đường tạo chứng từ cũ ngoài các đường nêu trên.
