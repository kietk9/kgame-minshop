# Đợt 1 — Bước C: thu/trả nợ và sổ quỹ

Ngày: 13/09/2026. Dữ liệu trùng có chủ ý không được gộp hoặc xóa. Quy tắc: [DEBT_AND_CASHBOOK_OPERATION_CONTRACT.md](DEBT_AND_CASHBOOK_OPERATION_CONTRACT.md).

## Lỗi đã kiểm chứng trước sửa

Thực hiện API thật trên dữ liệu thử riêng, lưu bằng chứng trước sửa:

| Ca | Hành vi trước sửa |
|---|---|
| C01 | Chọn khách B nhưng thu vào đơn khách A: báo thành công, paid tăng 100 nhưng không ghi payments |
| C02 | Đơn tổng 1.000 thu 1.100: vẫn thành công, nợ bị ép 0 |
| C03 | Đơn CANCELLED vẫn nhận thu thêm 100 |
| C04 | Nhóm có một đơn thật và một id không tồn tại: vẫn thu đơn đầu, bỏ dòng sau và báo thành công |

Đây là lỗi luồng ghi, khác với việc người dùng tạo khách/sản phẩm trùng để thử. Không sửa số liệu để che lỗi.

## Đã sửa

- Nhóm thanh toán dùng một giao dịch D1: không còn cập nhật đơn/phiếu nhập rồi ghi quỹ rời nhau. Không bỏ dòng sai. Kiểm tra lại nợ, tiền, lịch sử, trạng thái, đối tác và vai trò ngay trong giao dịch.
- Thu nợ đơn dùng chung phần lập thanh toán với POS, ghi payments, quỹ, paid/COD và trạng thái chính xác. Phiếu nhập và sửa chữa có kiểm tra tiền còn phải trả/thu; chỉ cập nhật tiền, không tự động thay tồn.
- Gửi lại cùng yêu cầu không ghi lại. Thu đồng thời với POS hoặc cùng chứng từ không làm mất cập nhật hoặc thu vượt. Mã PT/PC sinh trong lệnh ghi tránh đụng mã khi lập đồng thời.
- Số âm/phân số bị từ chối, không dùng Math.abs hoặc xóa dấu để biến thành tiền hợp lệ. Quỹ thủ công không tạo phiếu doanh nghiệp rời làm mất liên kết nợ; hướng người dùng về chứng từ nguồn.
- Sửa chữa trên danh bạ tính nợ còn lại sau các lần thu. Liên kết khách cũ bằng id và mã ổn định; không đoán theo tên/điện thoại. Lịch sử quỹ bỏ ghép theo tên, bảo đảm khách trùng tên không thấy tiền của nhau.
- Hộp thu nợ chặn tiền sai/vượt nợ, tránh gắn sự kiện hai lần, giữ mã yêu cầu khi gửi lại và hiển thị mã chứng từ an toàn. Công nợ tổng và danh sách chứng từ cùng phạm vi; cọc đặt trước tiếp tục thu từ chi tiết đơn.

## Nghiệm thu

- Bộ kiểm tra đầy đủ `npm run verify`: kết thúc thành công (exit 0), bao gồm kiểm tra giao diện/kiểu dữ liệu, dựng ứng dụng, CSS, D1, MCP và scaffold.
- 933 kiểm tra đơn vị đạt; Astro kiểm tra 450 tệp, 0 lỗi, 0 cảnh báo, 42 gợi ý.
- 21 ca POS đã có vẫn đạt, thêm 16 ca công nợ/sổ quỹ D1 đều đạt trên schema migration thật.
- Sau điều chỉnh cuối cùng chỉ về nhãn phí nhập/vận hành, Astro kiểm tra lại đạt (exit 0), không thay đường ghi nghiệp vụ.

Kiểm tra giao diện thật bằng chứng từ TEST-C-UI: hai hóa đơn mỗi đơn 1.000đ và phí sửa 1.000đ đã thu 200đ. Danh bạ/hộp thu cùng hiển thị nợ 2.800đ; phân bổ 200 + 300 + 100, sau gửi nợ còn 2.200đ. D1 xác nhận payments và quỹ đúng từng đơn, phí sửa đã thu 300đ, tồn vẫn 1. Phiếu chi vận hành 100đ lập thành công, có operation_key và mã PC riêng. Đã xem ảnh hộp thu/hộp chi; ảnh thử được xóa sau kiểm tra. Nhãn chi phí nhập hàng giữ theo tham chiếu purchase_receipt/purchase_receipt_other_fee; phiếu EXPENSE thủ công là chi phí vận hành.

16 ca D1 mới: sai khách/vai trò/quyền sở hữu; tiền sai/vượt/trùng/thiếu chứng từ; đơn/phiếu nhập hủy; thu nhiều đơn; lỗi quỹ thứ hai; gửi lại/đổi nội dung; thu tổng tranh chấp với POS; trả nợ phiếu nhập nháp/hoàn tất không đổi tồn; lịch sử tiền lệch; phí sửa đã thu và liên kết khách; âm/phân số/quỹ nghiệp vụ rời; lập quỹ đồng thời; trả nợ nhà cung cấp đồng thời/rollback; hủy sau thu tổng giữ quỹ và tăng số dư; phí sửa đồng thời/rollback nhóm đơn + sửa; hai khách trùng tên không ghép lịch sử.

## Giới hạn và bước tiếp theo

Tài khoản nhân viên/phân quyền còn cần triển khai và kiểm tra ở chế độ production. Các đường tạo/sửa/hủy nhập hàng, thu mua, sửa chữa và lắp ráp còn cần kiểm tra riêng; không coi kết quả bước C là nghiệm thu toàn bộ phân hệ đó. Định danh khách cũ chưa liên kết được phải được đối chiếu trước khi thu, không tự gán; bước thống nhất danh bạ cần xử lý cả luồng tạo khách sửa chữa/thu mua.

Không có migration mới hoặc thư viện mới trong bước C. Không sửa migration đã áp dụng, không triển khai môi trường thật. Cơ sở dữ liệu thử cũ vẫn có lịch sử/schema migration không khớp đã ghi ở bước B; bộ nghiệm thu chạy từ migration thật trên D1 mới.

Các dữ liệu riêng tạo để chứng minh lỗi trước sửa được đánh dấu TEST-C và có danh sách id trong bằng chứng. Không xóa dữ liệu trùng của người dùng. Các phiếu UI TEST-C-UI gồm hai hóa đơn bán và một phiếu sửa được tạo riêng để nghiệm thu, không sửa chứng từ của người dùng. Bằng chứng lưu tại docs/audit/wave-c; các báo cáo bước A/B là mốc trước thay đổi này.
