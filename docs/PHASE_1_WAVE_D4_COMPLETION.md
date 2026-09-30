# D4 — Bảo vệ sửa phiếu nhập và sửa đường lưu biểu mẫu

Nghiệm thu ngày 17/09/2026.

## Đã sửa

- Chỉ sửa phiếu DRAFT chưa có biến động kho. Phiếu đã nhận hoặc hủy bị chặn trước khi ghi; không xóa thẻ kho hay trừ lại tồn lịch sử.
- Giữ nguyên tiền thực trả. Sửa tăng/giảm trường tiền đã trả bị từ chối, không tự lập chi bổ sung hoặc thu hoàn. Phiếu có tiền không được đổi nhà cung cấp. Tổng mới thấp hơn tiền đã trả bị chặn.
- Thay dòng hàng và thông tin phiếu trong một D1 batch; kiểm tra lại phiếu, dòng tiền, nhà cung cấp, sản phẩm và phân loại tại lúc ghi.
- Biểu mẫu có action update trước đây gọi tạo mới; nay cập nhật đúng id và chuyển về phiếu vừa sửa.

## Kiểm chứng

`npm run verify` mã thoát 0: 934 kiểm thử đơn vị, Astro 0 lỗi/0 cảnh báo/42 gợi ý; build, D1, MCP và scaffold qua. P07 kiểm tra sửa nháp không đổi kho/quỹ và chặn sửa tiền/phiếu đã nhận/chuyển trạng thái qua sửa. P08 gây lỗi ở bước cập nhật cuối, xác nhận hoàn tác dòng hàng và toàn bộ trạng thái tài chính/kho.

Kiểm tra biểu mẫu trên phiên localhost mới: phiếu TEST-D4-fd41d4d6 cập nhật từ 1.000 lên 2.000, DRAFT/đã trả 0/nợ 2.000, chuyển về success=updated và số phiếu không tăng. Phiên cũ giữ mã trước sửa đã tái hiện việc tạo mới; không dùng phiên đó để nghiệm thu.

Không sửa bố cục giao diện trong đợt này. Kiểm tra khoảng trắng cho route và package không báo lỗi; các thay đổi ngoài phạm vi còn giữ nguyên.

## Giới hạn và bước tiếp

Đây là bước ngăn ghi sai và bảo vệ sửa nháp, chưa hoàn tất toàn bộ nhập hàng. Tạo phiếu mới vẫn dùng luồng cũ, cần chuyển nguyên tử. Khi sửa giảm dưới tiền đã trả, hiện chặn để giữ sổ quỹ đúng; cần bổ sung xử lý nghĩa vụ nhận hoàn/ứng trước tại nguồn trước khi mở tình huống này. Phân bổ giá vốn đang giữ cách tính cũ, chưa nghiệm thu. Giao diện sửa vẫn có các lựa chọn bị máy chủ từ chối; cần hoàn thiện hướng dẫn và điều khiển tương ứng.

Ưu tiên tiếp theo: tạo nhập nguyên tử và giá vốn; xử lý khoản dư; trả hàng/hoàn tiền khách theo thiết kế mới; đối chiếu báo cáo; tài khoản/phân quyền; giao hàng và nghiệm thu vận hành. Chưa triển khai lên hệ thống thật.
