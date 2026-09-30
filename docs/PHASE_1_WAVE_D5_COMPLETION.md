# D5 — Tạo phiếu nhập đồng bộ và chống ghi lại

Ngày 17/09/2026. Phạm vi: tạo phiếu nháp/nhận trực tiếp, dùng chung kiểm tra kho với hoàn tất nháp. Chưa nghiệm thu giá vốn.

## Thay đổi

Nhà cung cấp mới, phiếu, dòng hàng, phân loại/serial, kho, thẻ kho, tiền trả NCC, chi phí khác và nhật ký kết quả cùng một D1 batch. Nếu bước cuối lỗi, toàn bộ được hoàn tác. Không gộp nhà cung cấp bằng tên hoặc điện thoại; bản ghi trùng có chủ ý được giữ riêng. Phiếu còn nợ phải có nhà cung cấp.

Tạo nhận trực tiếp dùng chung kiểm tra hàng/phân loại/serial với hoàn tất phiếu nháp: chặn serial đã có, thiếu serial, sai phân loại, tồn tổng lệch tình trạng. Không khôi phục serial đã bán thành hàng sẵn bán. Phiếu nháp không nhập kho.

Mỗi biểu mẫu có mã yêu cầu. Cùng mã cùng nội dung trả kết quả cũ, không tạo lại phiếu/tiền/kho; cùng mã khác nội dung bị từ chối. API không cung cấp mã yêu cầu chưa có bảo đảm chống gửi lại giữa các lần gọi độc lập. Hai yêu cầu khác nhau tranh cùng id có thể một yêu cầu bị từ chối; không lưu dở, có thể thử lại.

## Nghiệm thu

P01–P08 được chạy lại sau khi tách phần ghi kho chung. P09: tạo trực tiếp đủ phiếu/kho/quỹ/nợ, gửi lại và đổi nội dung cùng mã. P10: lỗi ghi nhật ký cuối hoàn tác cả NCC mới và hai phiếu chi. P11: tạo nháp không tăng tồn, hoàn tất sau mới tăng đúng lượng.

Thử biểu mẫu localhost: gửi hai lần cùng dữ liệu và mã yêu cầu đều trả về phiếu 18; phiếu COMPLETED tổng 1.000, trả 200, nợ 800. Tồn tăng một; chỉ một phiếu chi tổng 200. Dữ liệu thử riêng.

Bộ `npm run verify` kết thúc mã 0: 934 kiểm thử đơn vị; Astro 0 lỗi, 0 cảnh báo, 42 gợi ý; build, các bộ D1, MCP và scaffold qua. Kiểm tra khoảng trắng trên package và API route không báo lỗi.

## Giá vốn và phần chưa hoàn tất

Đã xác nhận công thức hiện tại chưa trừ giảm giá dòng/phiếu khỏi giá vốn và có thể lệch do làm tròn phân bổ từng dòng/từng đơn vị. Ví dụ 2 hàng giá nhập 1.000, giảm dòng 200 và giảm phiếu 100, không phí: tổng phải trả 1.700 nhưng giá vốn hiện giữ 1.000 mỗi hàng. Chưa thay cách tính trong đợt D5: cần lưu tổng giá vốn dòng chính xác, phân bổ phần lẻ có quy tắc và đối chiếu nguồn giá vốn khi bán/hoàn trả, tránh sửa riêng một chỗ rồi làm lệch báo cáo.

Chi phí khác vẫn theo hành vi hiện có: ghi phiếu chi khi nhập số tiền; chưa có trạng thái chưa trả cho chi phí bên thứ ba. Sửa khoản phí này sau khi đã có phiếu chi cần được rà soát với lịch sử thực chi. Sửa giảm tổng thấp hơn tiền đã trả vẫn bị chặn; nghĩa vụ nhận hoàn/ứng trước khi sửa chưa hoàn thiện. Trả hàng, hoàn tiền khách, giá vốn báo cáo và phân quyền vẫn chưa đủ điều kiện vận hành thật.

Không migration mới, không cài thư viện, không deploy. Không thay bố cục giao diện; chỉ thêm mã yêu cầu vào dữ liệu gửi.
