# D16 — Ghi nhận tiêu hủy hàng lỗi sau khách trả

Cập nhật ngày 29/09/2026. Phạm vi D16 là tiêu hủy hàng đã được kiểm tra và kết luận lỗi; không phải hoàn tất toàn bộ quy trình sửa chữa hàng trả. Chưa triển khai lên máy chủ.

## Quy trình đã làm

Tại đơn bán gốc, phần **Kiểm tra hàng khách trả** phân biệt: chờ kiểm tra, đã nhập lại kho bán, hàng lỗi còn giữ và đã tiêu hủy. Người có quyền kho mở **Ghi nhận tiêu hủy hàng lỗi**, nhập số lượng, lý do/cách xử lý và xác nhận đã tiêu hủy thực tế hoặc vô hiệu hóa phần mềm/key. Phần mềm ghi nhận xác nhận của người thao tác; không tự tiêu hủy vật lý hay thu hồi bản quyền ở hệ thống bên ngoài.

Có thể tiêu hủy từng phần. Ví dụ nhận trả 4, nhập lại 2, kết luận lỗi 2, tiêu hủy 1 thì còn giữ riêng 1. Hàng còn sửa được tiếp tục giữ riêng, không bị tự đánh dấu đã xử lý hay tự nhập lại kho bán.

Mỗi lần ghi có mã **THL**, dòng trả và đơn gốc, số lượng, serial nếu có, lý do, người thực hiện và thời gian. Lịch sử hiện ngay tại đơn. Danh sách **Cần xử lý** chỉ đếm phần lỗi còn giữ, loại phần đã tiêu hủy; khoản hoàn tiền vẫn được theo dõi độc lập.

## Bảo toàn nghiệp vụ

D11 đã đưa hàng lỗi ra ngoài tồn có thể bán và chưa hoàn lại giá vốn gốc của phần đó vào tồn. Vì vậy D16 **không trừ tồn lần thứ hai, không hoàn lại giá vốn và không ghi thêm chi phí**. Đây là chứng từ xử lý số hàng đang giữ riêng, không phải phiếu xuất từ kho bán. Giá vốn gốc được lưu tại phiếu tiêu hủy để đối chiếu, không cộng thêm vào báo cáo chi phí. Không thay đổi hóa đơn, phiếu trả, tiền đã thu/hoàn, số dư khách hay nghĩa vụ hoàn còn lại.

Serial phải đúng dòng bán/phiếu trả, thuộc cửa hàng, đang giữ lỗi và không bị giữ cho đơn khác. Khi ghi thành công chuyển từ `RETURN_REJECTED` sang `DISPOSED`; không thể bán hoặc xuất lại bằng luồng kho thường. Hàng quản lý số lượng cập nhật số lượng đã tiêu hủy tại dòng trả và lịch sử riêng, giữ nguyên tồn sản phẩm/phân loại.

Máy chủ kiểm tra lượng đã nhận, đã nhập lại, đã kết luận lỗi, đã tiêu hủy và các nhật ký liên quan. Chặn số lượng âm, 0, phân số, vượt còn giữ, thiếu xác nhận/lý do, hàng chưa kiểm tra, serial sai quyền sở hữu/trạng thái và lịch sử số lượng lệch. Các kiểm tra và ghi chứng từ, cập nhật bộ đếm/serial, lưu kết quả chống gửi lại nằm trong cùng giao dịch. Lỗi cuối phải hoàn tác tất cả; gửi lại cùng yêu cầu không ghi hai phiếu; hai người xử lý cạnh tranh không vượt số còn giữ.

## Quyền và dữ liệu

Dùng quyền **inventory.adjust** đã có ở D15; không cấp quyền mới mặc định cho nhân viên. Giao diện tại đơn cần thêm quyền xem đơn. Máy chủ kiểm tra quyền ở cả bộ lọc truy cập và API, gắn người thực hiện từ phiên đã xác thực, không tin tên người gửi. Tài khoản chỉ xem không ghi được; dữ liệu giá vốn gốc không gửi xuống khi thiếu quyền giá vốn. Quyền hủy/hoàn tiền không tự cho phép tiêu hủy hàng lỗi.

Migration mới `0066_kgame_return_disposals.sql` thêm bộ đếm `disposed_quantity` mặc định 0 và bảng chứng từ mới. Giữ nguyên số lượng kết luận lỗi lịch sử `rejected_quantity`; phần còn giữ = kết luận lỗi trừ đã tiêu hủy. Không sửa migration cũ, không xử lý tự động số hàng lỗi tồn tại trước đó. Đã áp dụng migration vào DB local qua Local Explorer; không tạo chứng từ tiêu hủy trong dữ liệu cửa hàng. Các giao dịch thử chỉ chạy trong DB cô lập.

## Kiểm tra và bằng chứng

`npm run verify` đạt mã thoát 0: **952 kiểm tra đơn vị**; Astro **496 tệp, 0 lỗi, 0 cảnh báo, 44 gợi ý**. Bản dựng, CSS, các kiểm tra D1/HTTP, Stripe, MCP và scaffold đều đạt. Bằng chứng ở `docs/audit/wave-d16`. Kiểm tra khoảng trắng vẫn có 72 dòng cảnh báo cũ; không coi toàn repository sạch.

- RD01: từng phần/toàn bộ, danh sách còn xử lý, không đổi tiền–tồn–giá vốn–báo cáo, gửi lại không trùng.
- RD02: serial đã tiêu hủy không bán được, không trừ tồn thêm.
- RD03: đầu vào sai, chưa kết luận lỗi, sai trạng thái/chủ sở hữu serial không ghi dữ liệu.
- RD04: cạnh tranh, gửi lại đồng thời và lỗi ở lần ghi cuối; hoàn tác serial/bộ đếm/phiếu khi thất bại.
- RD05: bộ đếm tiêu hủy không khớp lịch sử bị chặn.
- RD06: HTTP có đăng nhập, quyền cho phép/từ chối, chặn khác nguồn, thay tên người thực hiện giả bằng phiên, không lộ giá vốn.
- RD07: một dòng trả vừa có phần nhập lại, phần lỗi, phần đã tiêu hủy và phần đang kiểm tra vẫn theo dõi độc lập.
- Kiểm tra giao diện trên DB cô lập: ghi qua biểu mẫu 1/3 hàng lỗi, hiện phiếu THL, còn giữ 2, chờ hoàn không thay đổi. Kiểm tra desktop và điện thoại 390 × 844; lịch sử không bị cắt chữ. Ảnh tạm đã xem rồi xóa, đăng xuất và đóng trình duyệt thử. DB/tài khoản thử nằm ngoài dữ liệu cửa hàng và được dọn sau kiểm tra.
- Hồi quy D15 cùng các luồng bán hàng, đặt trước, nhập mua, trả hàng, kiểm tra, tiền/nợ và báo cáo chạy trong bộ kiểm tra đầy đủ.

## Chưa nằm trong D16

Chưa chuyển hàng lỗi vào sửa chữa/tân trang, chưa nhập lại sau sửa, chưa phân bổ chi phí sửa, thu hồi linh kiện hay bán phế liệu. Chưa có sửa/đảo chứng từ tiêu hủy và mẫu in biên bản riêng; lịch sử hiện tại là bản ghi nội bộ liên kết đơn nguồn. Không dùng tiêu hủy để đóng những trường hợp này. Cần thiết kế và kiểm thử riêng trước khi cho vận hành.

Các việc lớn còn lại vẫn theo D15: chuyển khoản chờ hoàn thành số dư; ứng trước NCC; hoàn thiện báo cáo/chứng từ cũ; sửa chữa/thu mua/lắp ráp; đối chiếu web bán hàng và giao vận; sao lưu/khôi phục và thử vận hành cuối ngày. D16 đạt trong phạm vi ghi nhận tiêu hủy nêu trên, không có nghĩa toàn hệ thống đã sẵn sàng vận hành thật.
