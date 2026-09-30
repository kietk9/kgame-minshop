# D7 — Trả hàng đã nhập cho nhà cung cấp

Nghiệm thu ngày 18/09/2026. Phạm vi một cửa hàng, một kho, dữ liệu thử.

## Hành vi đã triển khai

Tạo phiếu trả riêng từ phiếu nhập COMPLETED. Giữ nguyên phiếu nhập, dòng nhập, tổng tiền gốc, phiếu chi và thẻ kho nhập; thêm lịch sử xuất trả, giảm tồn sản phẩm/phân loại và ghi tổng giá trị đã trả riêng.

Chỉ trả các dòng thuộc phiếu; tổng lượng đã trả không vượt lượng gốc. Mỗi dòng trả tham chiếu dòng nhập; lượng và giá trị từng lần được lưu. Số tiền trả hàng tính từ giá dòng sau giảm dòng và phần giảm phiếu phân bổ. Chia tiền theo lượng trả lũy kế bằng số nguyên, nên trả từng phần hết hàng khớp tổng giá trị hàng. Phí nhập/vận chuyển không mặc định được NCC hoàn. Giá vốn xuất trả hàng số lượng dùng giá vốn bình quân hiện tại; serial dùng giá vốn riêng. Giá trị giảm nợ và giá vốn xuất kho là hai đại lượng khác nhau, được lưu riêng.

Giảm nghĩa vụ chưa thanh toán trước; phần tiền đã chi vượt giá trị phiếu còn lại thành khoản chờ NCC hoàn. Nhận tiền bằng form đã có ở chứng từ gốc, hỗ trợ từng phần, không tự tạo phiếu thu khi mới trả hàng. Trả nợ còn lại sau trả hàng vẫn hoạt động. Công nợ = max(0, tổng gốc − giá trị đã trả hàng − tổng đã chi + tổng đã nhận hoàn).

Serial phải đúng dòng nhập/phân loại/tình trạng, thuộc KGAME và IN_STOCK; serial đã bán hoặc đang giữ cho đơn bị từ chối. Khi xuất trả chuyển RETURNED_SUPPLIER, chủ sở hữu SUPPLIER gắn đúng NCC. Tra cứu mã hiển thị Đã trả NCC và thông tin NCC, không nhầm sang khách trùng id.

Chứng từ trả, dòng trả, tồn, serial, thẻ kho, công nợ, khoản chờ hoàn và kết quả yêu cầu ghi trong một batch có điều kiện kiểm tra tại commit. Cùng mã yêu cầu cùng nội dung không xuất hai lần; nội dung khác bị từ chối. Lỗi cuối hoàn tác toàn bộ. Hai yêu cầu trả toàn bộ đồng thời chỉ một thành công.

## Giao diện

Ngay trong phiếu đã nhập có form chọn lượng từng dòng, lý do và xác nhận đã giao hàng trả NCC; không chuyển tiền ngân hàng. Lịch sử hiển thị mã phiếu trả, giá trị và lý do. Hiển thị giá trị gốc, giá trị đã trả và giá trị còn lại riêng. Khoản chờ nhận hoàn tiếp tục xuất hiện ở đầu phiếu và danh sách nhập hàng.

## Kiểm chứng

- R01 giảm nợ trước, giữ chứng từ gốc, gửi lại một lần.
- R02 nhiều lần trả và nhận hoàn, chặn trả vượt.
- R03 phiếu chưa thanh toán: giảm nợ rồi trả nốt phần còn lại.
- R04 lỗi ghi cuối không thay đổi bảng nào; cạnh tranh không xuất hai lần.
- R05 chặn serial đã bán; serial hợp lệ rời tồn và quyền sở hữu cửa hàng.
- R06 sai phiếu, chưa xác nhận, thiếu lý do, lượng phân số bị chặn.

`npm run verify` mã thoát 0: 936 kiểm thử đơn vị; Astro 0 lỗi/0 cảnh báo/43 gợi ý; build, D1, MCP và scaffold qua. Kiểm tra Astro riêng sau bổ sung phần hiển thị: 463 tệp, 0 lỗi/0 cảnh báo/43 gợi ý. Thay nhãn văn bản cuối cùng được xem lại trên giao diện.

Thử thực tế local PN000020: nhập 2 hàng, tổng 1.000, đã chi 600, nợ 400. Xuất trả 1 hàng trị giá 500 → THN000001; tồn còn 1, nợ 0, chờ nhận hoàn 100. Chỉ có phiếu chi gốc 600, chưa có phiếu thu giả. Đọc lại D1 xác nhận các số liệu trên. Đã xem ảnh giao diện và xóa ảnh tạm.

## Giới hạn và việc tiếp

Migration 0060 thêm bảng trả hàng và tổng giá trị trả trên phiếu, đã áp dụng local; chưa deploy. Phiếu cũ chưa có phân bổ giá vốn được kiểm chứng bị chặn trả, cần đối chiếu riêng; không tự suy đoán giá vốn lịch sử. Chưa hỗ trợ sửa/hủy phiếu trả đã xác nhận, in phiếu trả riêng hoặc hoàn phí theo thỏa thuận đặc biệt.

Còn phải hoàn thiện đối chiếu danh bạ/báo cáo với hàng trả và tiền hoàn, ứng trước NCC chuyển sang phiếu khác, chi phí bên thứ ba chưa trả/điều chỉnh. Luồng khách trả hàng và hoàn tiền khách, tài khoản/phân quyền chưa được nghiệm thu bởi đợt này. Chưa coi toàn hệ thống sẵn sàng vận hành thật.
