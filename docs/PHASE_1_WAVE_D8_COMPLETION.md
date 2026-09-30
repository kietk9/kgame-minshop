# D8 — Báo cáo POS và đối chiếu công nợ NCC

## Phạm vi đã sửa

- Báo cáo tài chính bỏ việc lấy tổng nhập hàng hoặc 65% doanh thu làm giá vốn. Giá vốn lấy từ số lượng và giá vốn lưu trên dòng bán POS.
- Báo cáo bán hàng theo ngày/nhân viên cũng bỏ công thức 65%; dùng giá vốn từng đơn, giữ bộ lọc nhân viên/vận chuyển. Truy vấn không nhân đôi đơn khi có nhiều dòng vận chuyển; chi tiết tra đúng bảng đối tác. Khi thiếu cơ sở, ẩn biểu đồ lợi nhuận và đánh dấu ô giá vốn/lãi chưa đủ dữ liệu.
- Loại đặt trước chưa hoàn tất và đơn hủy khỏi phạm vi doanh thu. Bao gồm chiết khấu dòng hàng và hóa đơn; không ép lỗ về 0.
- Chi phí dùng phiếu chi còn hiệu lực thuộc EXPENSE/SHIPPING_FEE. Không đưa mua hàng, cọc, hoàn tiền, thu mua vào chi phí hoạt động; loại phí nhập hàng đã phân bổ vào giá vốn.
- Khoản thu phí giao hàng trong tổng đơn là doanh thu; phí trả vận chuyển dùng số thực chi, không lấy lại khoản khách trả để làm chi phí.
- Ngày báo cáo POS và chi phí theo giờ Việt Nam; ngày mặc định và ngày lập trên màn hình cùng múi giờ.
- Khi thiếu dòng hàng hoặc giá vốn NULL, giao diện không hiển thị số giá vốn/lợi nhuận chưa đủ cơ sở.
- Tổng mua NCC trừ giá trị đã trả hàng. Nợ phải trả và khoản NCC chờ hoàn tách riêng theo ID đối tác; đối tác trùng tên vẫn độc lập.

## Kiểm tra nghiệp vụ

`test/integration/kgame-financial.mjs` được đưa vào cổng kiểm tra toàn bộ:

1. Bán 1.000, giảm dòng 100 và hóa đơn 50: doanh thu thuần 850, vốn 400, chi hoạt động 50, vận chuyển 20, lợi nhuận tạm tính 380. Đặt trước/hủy/cọc/hoàn/mua hàng/phí vốn hóa không làm sai phép tính. Kiểm tra ranh giới ngày UTC sang Việt Nam.
2. Hoàn tiền làm phát sinh lỗ vẫn hiển thị lỗ; thiếu dòng hàng bị đánh dấu; kỳ không phát sinh không tự bịa giá vốn.
3. Nhập 1.000, trả NCC 600, trả hàng 500: tổng mua còn 500, nợ phải trả 0, chờ NCC hoàn 100. Danh sách và chi tiết đối tác thống nhất; đối tác trùng tên không nhận nhầm số tiền.

## Giới hạn cần giữ rõ

Đây là kết quả POS tạm tính, chưa phải báo cáo lợi nhuận tổng hợp toàn hệ thống. Tiền hoàn đang theo tập đơn bán trong kỳ, không phải báo cáo sự kiện trả hàng/hoàn tiền phát sinh trong kỳ. Giá vốn trả hàng của khách cần tích hợp sau khi hoàn tất luồng trả hàng. Đơn web, chi phí chưa thanh toán và các phân hệ xưởng chưa nằm trong phép đối chiếu này.

Giá vốn bằng 0 trong dữ liệu cũ chưa chứng minh là hàng miễn phí hay dữ liệu thiếu; không tự suy đoán hoặc dùng giá nhập hiện tại thay lịch sử. Tổng mua NCC vẫn bao gồm phiếu nháp chưa hủy theo cách theo dõi mua hàng hiện tại, không đồng nghĩa giá trị hàng đã nhận kho.

Không hợp nhất hay xóa đối tác/sản phẩm trùng. Không di chuyển dữ liệu cũ hoặc triển khai lên máy chủ.

## Việc tiếp theo

1. Hoàn tất bán–hủy–khách trả hàng–hoàn tiền theo hợp đồng nghiệp vụ: giữ thu gốc, tạo nghĩa vụ hoàn, xác nhận tiền thực hoàn; hàng/serial trả lại phải kiểm tra trước khi bán lại.
2. Nối kết quả trả hàng vào báo cáo theo ngày phát sinh; đối chiếu các báo cáo doanh thu, tồn kho, sổ quỹ và công nợ còn lại.
3. Hoàn thiện ứng trước NCC dùng cho nhiều phiếu, in chứng từ và xử lý phiếu cũ thiếu lịch sử.
4. Nghiệm thu tài khoản/quyền truy cập; thu mua, sửa chữa, sản xuất và luồng bán web trong phạm vi ra mắt.
5. Chạy kịch bản vận hành trọn ngày, đối chiếu cuối ngày và thử sao lưu/khôi phục trước nghiệm thu sử dụng thật.

## Kết quả nghiệm thu kỹ thuật

- Cổng `npm run verify` hoàn tất với mã thoát 0: 936 kiểm tra đơn vị, kiểm tra D1, bản dựng, MCP và scaffold đạt.
- Astro: 465 tệp, 0 lỗi, 0 cảnh báo, 43 gợi ý. Sau chỉnh múi giờ nhãn ngày lập báo cáo bán hàng, chạy lại kiểm tra Astro đạt.
- Đã kiểm tra màn hình báo cáo tài chính, bảng lợi nhuận theo ngày và danh sách đối tác; ảnh tạm đã xóa.
- `git diff --check` còn báo khoảng trắng trong các thay đổi có sẵn; không coi toàn bộ cây làm việc là sạch.
- Bằng chứng: `docs/audit/wave-d8/verification-summary.json` và `verify.log` đã ẩn đường dẫn máy cá nhân.
