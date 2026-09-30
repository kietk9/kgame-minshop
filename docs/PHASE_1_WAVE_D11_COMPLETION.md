# D11 — Kiểm tra hàng trả và đưa hàng đủ điều kiện trở lại kho

> Cập nhật D16: đã có [ghi nhận tiêu hủy hàng lỗi](PHASE_1_WAVE_D16_COMPLETION.md), giữ nguyên kết luận kiểm tra và chỉ giảm phần lỗi còn giữ. Sửa chữa/đưa lại kho sau sửa vẫn chưa hoàn thiện.

## Hành vi mới

Từ chi tiết đơn bán, mỗi dòng trả có ba số độc lập: chờ kiểm tra, đã nhập lại kho bán, hàng lỗi giữ riêng. Có thể kiểm tra từng phần, ví dụ nhận trả 7, duyệt nhập lại 3 và giữ riêng 4 hàng lỗi. Lưu số lượng, quyết định, tình trạng, kết quả kiểm tra, người ghi và thời gian cho từng lần.

- Nhập lại kho yêu cầu xác nhận đã kiểm tra và đủ điều kiện bán lại. Với phần mềm/key, nhân viên phải xác nhận đã thu hồi quyền cũ và có thể bán lại; phần mềm không tự xác minh hệ thống bản quyền bên ngoài.
- Chọn tình trạng mới hoặc qua sử dụng theo thực tế. Hàng gốc qua sử dụng không được đổi thành mới bằng bước kiểm tra.
- Hàng đạt tăng tồn sản phẩm và phân loại theo đúng tình trạng. Serial phải còn ở RETURN_INSPECTION, thuộc cửa hàng, khớp dòng bán và không giữ cho đơn khác; sau duyệt mới thành IN_STOCK.
- Hàng lỗi không tăng tồn bán. Serial lỗi chuyển RETURN_REJECTED; đây là giữ riêng, chưa phải tiêu hủy hoặc chuyển sửa chữa.
- Giữ nguyên phiếu trả và khoản tiền đã thống nhất với khách. Kiểm tra kho không tự thu thêm/chi thêm/đổi nghĩa vụ hoàn tiền.

## Giá vốn và báo cáo

Hàng nhập lại dùng giá vốn được lưu ở dòng bán gốc, không dùng giá bán hoặc giá nhập mới. Tồn hiện có tính lại giá vốn bình quân theo tình trạng, bằng số nguyên. Thẻ kho liên kết từng lần kiểm tra.

Báo cáo POS tổng hợp, theo ngày và nhân viên giảm giá vốn hàng bán đúng tổng giá vốn đã nhập lại. Hàng lỗi không được coi là tài sản sẵn bán nên chưa hoàn lại giá vốn; báo cáo có thể hiện lỗ. Còn hàng chờ kiểm tra thì báo cáo vẫn đánh dấu thiếu cơ sở lợi nhuận.

Trạng thái tổng RESTOCKED ở dòng trả có nghĩa đã xử lý hết và có phần nhập lại; có thể đồng thời có hàng lỗi. Các trường restocked_quantity/rejected_quantity và nhật ký từng lần là nguồn xác định số lượng, không suy luận toàn bộ hàng đã bán được từ trạng thái tổng.

## Kiểm tra

`test/integration/kgame-return-inspection.mjs` được đưa vào bộ kiểm tra đầy đủ:

1. Kiểm tra từng phần tốt/lỗi; giá vốn gốc và bình quân đúng; tiền không thay đổi; báo cáo chỉ giảm giá vốn phần nhập lại; gửi lại không nhập trùng.
2. Chặn serial bị đổi trạng thái; serial được duyệt sang qua sử dụng có thể bán lại ở đúng tình trạng.
3. Serial lỗi giữ riêng và không thể bán.
4. Hai người duyệt cùng số hàng chỉ một lần thành công; lỗi ghi cuối hoàn tác kho, giá vốn, trạng thái và nhật ký.
5. Chặn số lượng âm/0/phân số/vượt còn chờ, thiếu xác nhận, sai tình trạng và thiếu ghi chú.

## Giới hạn còn lại

- Chưa có đảo/sửa một kết quả kiểm tra đã ghi, chuyển hàng lỗi sang sửa chữa, đánh giá giảm giá trị hoặc tiêu hủy; không sửa trực tiếp trạng thái để lách quy trình.
- Cập nhật D12: đã có [danh sách tập trung](PHASE_1_WAVE_D12_COMPLETION.md) hàng chờ kiểm tra và hàng lỗi; thao tác vẫn tại đơn nguồn.
- Mã người thực hiện đang theo cơ chế người ghi của hệ thống hiện tại; việc gắn với tài khoản và quyền nhân viên cần nghiệm thu riêng.
- Báo cáo còn theo tập đơn bán trong kỳ, không phải sổ trả hàng theo ngày phát sinh; số liệu cũ thiếu giá vốn vẫn cần đối chiếu.
- Chưa triển khai lên máy chủ. Migration 0062 thêm mới, không viết lại migration đã áp dụng.

## Kết quả nghiệm thu kỹ thuật

`npm run verify` đạt, mã thoát 0: 938 kiểm tra đơn vị; D1 gồm I01–I05 và hồi quy các nghiệp vụ trước; bản dựng, MCP, scaffold. Astro kiểm tra 474 tệp: 0 lỗi, 0 cảnh báo, 43 gợi ý.

Đã áp dụng migration 0062 cho DB local qua Local Explorer. Thử trên phiếu trả 7 sản phẩm: duyệt 3 qua sử dụng, giữ riêng 4 lỗi; kho tổng 3, kho mới 0, kho qua sử dụng 3, đơn giá vốn 40, giá vốn nhập lại 120. Tiền thu gốc 600, tiền hoàn 300, nợ 0 không đổi. Đã kiểm tra bố cục, lịch sử và xóa ảnh tạm.

Bằng chứng: `docs/audit/wave-d11`. Cây làm việc còn nhiều thay đổi trước đó; kiểm tra diff có cảnh báo khoảng trắng cũ, không tuyên bố toàn bộ repository sạch.
