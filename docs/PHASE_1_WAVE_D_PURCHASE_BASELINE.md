# Bước D — kiểm chứng lỗi nhập hàng trước sửa

> Cập nhật 13/09/2026: chính sách hủy/hoàn tiền đã được thay bởi [thiết kế mới](CANCELLATION_RETURN_AND_REFUND_CONTRACT.md). Các mô tả mặc định chuyển số dư bên dưới là mốc mã nguồn bước B/C, không phải chính sách cho lần triển khai tiếp theo.

Ngày 13/09/2026. Phạm vi: một cửa hàng/một kho. Kiểm chứng bằng các hàm nghiệp vụ thật trên Miniflare D1 mới, áp dụng toàn bộ migration dự án; fixture TEST-D riêng, không chỉnh hoặc gộp dữ liệu người dùng.

| Ca | Kết quả thực tế trước sửa |
|---|---|
| D01 | Phiếu nháp đã chi 200đ: hủy đổi phiếu chi thành CANCELLED dù chưa nhận hoàn tiền |
| D02 | Phiếu đã CANCELLED vẫn hoàn tất thành COMPLETED, tăng tồn lên 1, tái lập nợ 800đ trong khi phiếu chi 200đ bị hủy |
| D03 | Tổng 1.000đ, hoàn tất trả 1.100đ được chấp nhận, nợ bị ép thành 0 |
| D04 | Sửa đã trả từ 200đ về 0đ tự sinh phiếu thu REFUND 200đ, không có bước xác nhận nhận tiền thật |
| D05 | Tạo phiếu với sản phẩm không tồn tại: lỗi khóa ngoại nhưng số phiếu tăng từ 3 lên 4, để lại phiếu ghi dở |

Bằng chứng: purchase-before.json. Đây là lỗi đường ghi, không phải lỗi dữ liệu trùng do người dùng tạo.

## Quy tắc cần chốt

Giữ phiếu chi khi tiền đã thực sự trả. Khi hủy/sửa giảm nghĩa vụ mà nhà cung cấp chưa hoàn tiền, khoản còn ở nhà cung cấp cần được ghi là số dư ứng trước để trừ lần nhập sau, hoặc khoản phải thu hoàn riêng. Chưa suy đoán lựa chọn này từ quy tắc số dư khách đã chốt.

## Hướng sửa và nghiệm thu

1. Chốt nghiệp vụ tiền còn ở nhà cung cấp, đối chiếu lại hướng dẫn cũ yêu cầu hủy phiếu chi: hướng dẫn đó mâu thuẫn dòng tiền thực tế.
2. Dùng một D1 batch cho phiếu, dòng hàng, tồn/serial, nhật ký kho và tiền; kiểm tra lại trạng thái/quyền sở hữu/tồn khi commit.
3. Chặn phiếu hủy nhập lại; tiền nguyên không âm, không vượt nghĩa vụ; kiểm tra vai trò nhà cung cấp và từng dòng hàng trước ghi.
4. Giữ lịch sử kho và tiền; không xóa nhật ký để viết lại, không tạo hoàn tiền chỉ vì sửa một ô tiền.
5. Thử lỗi ở dòng cuối/phiếu quỹ cuối, gửi lại, thao tác đồng thời, serial đã bán/giữ chỗ, hàng không đủ để đảo nhập, phiếu nháp và phiếu hoàn tất; kiểm tra cả sản phẩm lẫn phân loại.
6. Chạy lại bộ nghiệm thu đầy đủ rồi kiểm tra UI; kết quả bước C vẫn là mốc công nợ/quỹ, không đại diện nghiệm thu tạo/sửa/hủy nhập hàng.

Trạng thái: đã kiểm chứng trước sửa; chưa nghiệm thu hoặc triển khai sửa bước D. Không migration mới, không cài thư viện, không deploy.
