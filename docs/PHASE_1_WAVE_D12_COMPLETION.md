# D12 — Danh sách công việc còn chờ

Hoàn thành ngày 26/09/2026, phạm vi một cửa hàng / một kho.

## Hành vi đã có

Menu **Cần xử lý** mở `/admin/pending-actions`, tập trung bốn nhóm:

- Chờ hoàn tiền cho khách: số phải hoàn trừ số đã thực trả.
- Chờ nhà cung cấp hoàn: số phải nhận trừ số đã thực nhận.
- Hàng khách trả chờ kiểm tra: lượng nhận trả trừ lượng đã nhập lại và lượng đã xác định lỗi.
- Hàng lỗi giữ riêng: lượng bị từ chối nhập lại, không phải tồn sẵn bán.

Mỗi dòng có mã chứng từ, mã và ID đối tác, nội dung, số còn lại và đường dẫn về phần xử lý tại chứng từ gốc. Đối tác trùng tên vẫn tách theo ID. Không cộng bù tiền cần nhận với tiền cần trả; không nhầm số mục với số lượng sản phẩm.

Tìm kiếm theo mã/tên đối tác, chứng từ hoặc nội dung hàng; lọc theo nhóm, 50 mục mỗi trang, việc cũ lên trước. Tổng tính trên toàn bộ kết quả phù hợp bộ lọc. Ký tự `%`, `_` không mở rộng kết quả tìm kiếm. Tìm kiếm dùng SQLite lower, chưa hỗ trợ bỏ dấu tiếng Việt hoặc chuẩn hóa đầy đủ chữ hoa Unicode.

Hoàn đủ tiền thì khoản đó biến mất khi tải lại; kiểm tra hết thì hết mục chờ kiểm tra. Phần hàng lỗi vẫn hiển thị độc lập. Nguồn hoàn tiền bị thiếu, sai đối tác hoặc chưa hỗ trợ vẫn hiện số tiền và yêu cầu đối soát, không dẫn nhầm sang chứng từ khác. Đây là danh sách chỉ đọc, thao tác tiền/kho vẫn qua quy trình đã được kiểm tra tại chứng từ gốc.

## Kiểm tra đã đạt

Bộ D1 mới `test/integration/kgame-pending-actions.mjs` chạy trong `npm run verify`:

1. Tạo bán → trả hàng → kiểm tra từng phần → hoàn một phần bằng nghiệp vụ thật; danh sách khớp số tiền và số lượng còn lại.
2. Hoàn đủ và kiểm tra đủ loại đúng mục khỏi danh sách; giữ hàng lỗi.
3. Đối tác trùng tên, tổng hai chiều, bộ lọc kết hợp và tìm kiếm ký tự đặc biệt.
4. Nguồn thiếu, nguồn không hỗ trợ, nguồn sai đối tác vẫn hiện để đối soát, không tạo liên kết sai.
5. 55 mục qua hai trang không trùng hoặc sót, tổng không chỉ lấy 50 mục đầu; trang trống và tham số sai được xử lý.

`npm run verify` hoàn tất mã thoát 0: 938 kiểm tra đơn vị; toàn bộ D1, kiểm tra giao diện Astro 477 tệp (0 lỗi, 0 cảnh báo, 43 gợi ý), bản dựng, kiểm tra CSS, Stripe, MCP và scaffold đều đạt.

Đã thử giao diện với dữ liệu test local: 5 mục, chờ trả khách 400, chờ nhận NCC 450, chờ kiểm tra 0, hàng lỗi 4. Tìm mã khách còn đúng một khoản 400 và mở đúng phần hoàn tiền đơn nguồn. Lọc hàng chờ kiểm tra hiển thị danh sách trống. Đã xem ảnh bố cục desktop và điện thoại 390 × 844, sau đó xóa ảnh tạm và trả kích thước trình duyệt về mặc định. Phiên kiểm tra điện thoại bị mất kết nối một lần; đã mở lại tab và hoàn tất xem bố cục.

Không thay đổi dữ liệu local trong kiểm tra giao diện đợt này. Kiểm tra nghiệp vụ ghi dữ liệu vào DB test cô lập. Không thêm migration. Bằng chứng tại `docs/audit/wave-d12`.

## Phần còn lại và thứ tự tiếp theo

1. Tài khoản nhân viên và phân quyền: kiểm kê cơ chế hiện tại, khóa từng API theo quyền, kiểm tra trên chế độ triển khai thực; bảo đảm người ghi đúng tài khoản đăng nhập.
2. Hoàn thiện lựa chọn chuyển tiền chờ hoàn thành số dư khách, số dư ứng trước NCC và xử lý hoàn từ số dư; không tự coi khoản chờ hoàn là đã chuyển số dư.
3. Hàng lỗi: chuyển sửa chữa, đánh giá/tiêu hủy và quy trình điều chỉnh kiểm tra; hiện chỉ giữ riêng và xem lịch sử.
4. Đối soát các báo cáo/dashboard còn lại, chứng từ in và dữ liệu lịch sử; kiểm tra riêng sửa chữa, thu mua, lắp ráp và web bán hàng.
5. Tích hợp vận chuyển, nghiệm thu cuối ngày, sao lưu/khôi phục và thử vận hành trước triển khai.

D12 chưa phải danh sách mọi công việc trong cửa hàng: chưa gom đơn chưa giao, đơn mua chờ nhận, nợ thông thường hoặc việc sửa chữa. Chưa có thông báo tự động/nhắc hạn và chưa có thao tác xử lý hàng loạt. Đợt này không triển khai lên máy chủ.

Cây làm việc còn nhiều thay đổi từ trước; `git diff --check` có cảnh báo khoảng trắng tồn tại trong các tệp cũ. Không tuyên bố toàn bộ repository sạch.
