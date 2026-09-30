# Bước D3 — hoàn tất phiếu đặt nhập nguyên tử

Nghiệm thu ngày 17/09/2026. Phạm vi: chuyển phiếu DRAFT sang COMPLETED; chưa thay toàn bộ create/update.

## Thay đổi

Toàn bộ gán phân loại/serial, nhập kho, thẻ kho, tiền trả thêm, công nợ và kết quả thao tác nằm trong một D1 batch. Kiểm tra trạng thái phiếu, dòng hàng, nhà cung cấp, lịch sử thanh toán, sản phẩm và phân loại được lặp tại commit, ngăn dữ liệu đổi giữa lúc đọc và ghi.

Gửi lại cùng mã cùng nội dung trả kết quả cũ; mã trùng nội dung khác bị từ chối. Hai lần hoàn tất cạnh tranh không nhập/trả tiền hai lần. Phiếu đã hủy/hoàn tất, tiền vượt nợ, tổng dòng sai tổng phiếu hoặc phiếu nháp đã có thẻ kho bị chặn.

Hàng có nhiều phân loại cần chọn rõ. Hàng chưa có phân loại được tạo Tiêu chuẩn cùng giao dịch, kế thừa tồn cũ rồi cộng lượng nhập. Serial cần một dòng số lượng một; mã trùng trong phiếu hoặc mã đã tồn tại bị chặn, không phục hồi serial SOLD/RESERVED/thuộc khách thành hàng sẵn bán. Serial mới ghi quyền sở hữu KGAME và giá vốn từ dòng phiếu; không thay phương pháp phân bổ giá vốn của luồng tạo phiếu trong đợt này.

Giao diện hoàn tất đã sửa sai hợp đồng API: paidAmount/paymentMethod đổi thành additional_paid_cents/payment_method, kiểm tra success thay cho ok, kèm mã yêu cầu chống ghi lại.

## Nghiệm thu

Bộ `npm run verify` hoàn tất với mã thoát 0: 934 kiểm thử đơn vị; Astro kiểm tra 457 tệp, 0 lỗi, 0 cảnh báo và 42 gợi ý. Build, kiểm thử D1, MCP và scaffold đã chạy qua.

Thử giao diện localhost: phiếu TEST-D3-UI-569eed trị giá 1.000đ, xác nhận nhận hàng và trả thêm 200đ. Trang chuyển Đã hoàn thành, hiển thị phiếu chi PC0023: 200đ, đã trả 200đ và nợ 800đ. Đọc lại D1 xác nhận COMPLETED/200/800; tồn sản phẩm và phân loại đều tăng lên 1. Đã xem ảnh giao diện, xóa ảnh tạm sau kiểm tra.

`git diff --check` toàn kho còn khoảng trắng thừa ở các thay đổi ngoài D3; không coi đó là lỗi nghiệp vụ hoặc kết quả kiểm thử D3.

6 ca D1 mới: kho/phân loại/nợ/quỹ cùng cập nhật và gửi lại; lỗi cuối hoàn tác mọi bảng; hoàn tất đồng thời; serial mới đúng chủ/trạng thái; serial có sẵn bị chặn; tổng dòng lệch tổng phiếu bị chặn. Các ca lỗi so sánh cả phiếu, dòng, sản phẩm, phân loại, serial, thẻ kho, quỹ và nhật ký thao tác.

## Còn lại

Tạo và sửa phiếu nhập vẫn dùng các lệnh ghi rời; cần thay trước khi vận hành thật. Sửa phiếu tự tạo hoàn tiền chưa được giải quyết ở D3. Phân bổ chiết khấu/chi phí vào giá vốn và thống nhất nguồn giá vốn cho bán hàng cần rà soát tiếp. Trả hàng bán/nhập, kho chờ kiểm tra, hoàn tiền khách theo thiết kế mới và phân quyền chưa được nghiệm thu trong đợt này.

Không có migration mới, không cài thư viện, không deploy. Dữ liệu trùng cố ý được giữ riêng. Phiếu TEST-D3-UI riêng chỉ dùng kiểm tra.
