# Hiện trạng và thứ tự tiếp tục

## Phạm vi đã chốt với chủ cửa hàng

- Ra mắt POS một cửa hàng, một kho. Thiếu tồn phải chặn xuất bán; vẫn cho đặt trước.
- Dữ liệu cũ là test, trùng sản phẩm/đối tác có chủ ý: không tự gộp theo tên/số điện thoại.
- Hủy chứng từ không xóa lịch sử tiền đã thực nhận/thực trả. Tiền hoàn chỉ ghi tiền mặt/ngân hàng khi đã thực hoàn; hàng đã giao cần phiếu trả hàng.
- Người dùng đã chọn chuyển khoản cần hoàn thành số dư khách; phần chuyển nghĩa vụ hoàn đang chờ sang số dư là D17 chưa thực hiện. Không khẳng định lựa chọn này đã hoạt động đầy đủ.
- Hàng khách trả cần kiểm tra, chỉ hàng đạt mới nhập lại tồn có thể bán. Hàng lỗi giữ riêng; tiêu hủy không trừ tồn lần thứ hai và không tự tạo chi phí/hoàn tiền lần nữa.

## Hoàn tất đến D16

A–C: nền kiểm thử, POS cập nhật nguyên tử tồn/serial/tiền/số dư, chống xử lý lặp, sổ quỹ/công nợ.
D1–D7: phiếu nhập, nháp/sửa/hoàn tất/hủy, hoàn tiền và trả hàng nhà cung cấp.
D8: báo cáo POS theo giá vốn gốc, loại cách ước lượng giá vốn.
D9–D12: hủy/hoàn khách, trả hàng, kiểm hàng trả, hàng chờ xử lý.
D13–D15: tài khoản nhân viên, mật khẩu băm, phiên hữu hạn, đổi mật khẩu bắt buộc, 15 quyền được kiểm tra phía máy chủ và ẩn giá vốn khi thiếu quyền.
D16: tiêu hủy toàn phần/một phần, cả serial; lưu lý do/người/thời gian, chống xử lý lặp và vượt số lượng.

Đọc `project/docs/MASTER_AUDIT_AND_SYSTEM_HANDOVER.md`, `SYSTEM_BUSINESS_ARCHITECTURE.md` và các `PHASE_1_WAVE_*_COMPLETION.md`. Tài liệu cũ có thể nói về trạng thái trước khi sửa: đối chiếu mốc mới nhất và mã/test. AGENTS.md có quy tắc upstream “orders paid-only”; POS KGAME đã mở rộng đơn/công nợ theo hợp đồng nghiệp vụ và test, không xóa luồng đó chỉ để áp máy móc quy tắc upstream.

## D17 chưa bắt đầu triển khai

Chưa có migration 0067. Migration mới nhất 0066. Cần thiết kế chuyển phần còn phải hoàn sang số dư khách, có phiếu/lịch sử riêng, quyền rõ ràng, xử lý lặp và cạnh tranh với hoàn tiền thật.

Lưu ý khi thiết kế: `kgame_refund_obligations.settled_cents` và settlement hiện gắn tiền thật, `cash_id` bắt buộc/duy nhất. Không giả lập chuyển số dư bằng phiếu chi. `orders.refunded_cents` là generated column từ provider + external (migration 0025), không sửa trực tiếp. Các bộ đếm đơn/trả hàng/công nợ/báo cáo phải được đối chiếu cùng nhau. Test đồng thời hoàn tiền và chuyển số dư phải chứng minh tổng không vượt nghĩa vụ còn lại.

## Việc còn lại, theo ưu tiên

1. Chạy nền kiểm thử sạch trên Linux và lưu kết quả trước khi sửa.
2. Hoàn thiện D17 theo lựa chọn đã chốt, trước code phải mô tả bút toán và tình huống kiểm chứng; xử lý một luồng trọn vẹn.
3. Nghiệm thu cuối ngày xuyên suốt POS–quỹ–công nợ–tồn–giá vốn; rà soát số dư đầu kỳ, thao tác sửa/hủy, trả một phần, đồng thời và quyền nhân viên.
4. Sao lưu/khôi phục thử, cấu hình production, giới hạn truy cập, nghiệm thu triển khai và hướng dẫn vận hành. Chưa được coi là sẵn sàng dùng tiền/hàng thật chỉ vì verify xanh.
5. Web bán hàng/giao hàng: rà soát hợp đồng trạng thái, giữ tồn, thanh toán, COD, đối soát, retry/webhook rồi mới bật. Chưa nghiệm thu đầy đủ tích hợp hãng vận chuyển.
6. Sửa chữa, thu mua, sản xuất/lắp ráp, ứng trước nhà cung cấp, phục hồi hàng lỗi chỉ là điều kiện ra mắt nếu cửa hàng sử dụng; nhiều màn hình có sẵn không đồng nghĩa nghiệp vụ đã nghiệm thu.

Không có phần trăm hoàn tất đáng tin cậy cho toàn web. Mốc A–D16 là phần đã có bằng chứng; các nhóm trên cần kiểm tra theo phạm vi bật thực tế.
