# Nghiệm thu nhập hàng: giá vốn và nhận hoàn khoản trả dư

Ngày 18/09/2026. Tiếp nối D1–D5; chưa phải chứng nhận toàn bộ hệ thống sẵn sàng vận hành.

## Đã hoàn thiện trong đợt này

Tạo, sửa nháp và nhận hàng dùng chung công thức giá vốn: trừ giảm dòng, phân bổ giảm phiếu và chi phí theo giá trị dòng. Phần lẻ được chia theo phần dư lớn nhất, ưu tiên thứ tự dòng khi bằng nhau. Tổng giá vốn dòng lưu riêng, không mất tiền do chia số lượng. Thẻ kho có tối đa hai mức đơn giá nguyên cho một dòng để tổng số lượng và tổng giá vốn khớp chính xác.

Khi nhận hàng, cập nhật giá vốn bình quân của sản phẩm và phân loại theo tình trạng mới/cũ; đơn giá bình quân làm tròn đến đơn vị tiền nguyên. POS lấy giá vốn cũ từ đúng phân loại nếu đã có. Serial ghi giá vốn riêng chính xác. Không viết lại giá vốn của các hóa đơn đã bán hoặc tự sửa lịch sử phiếu cũ; các luồng thu mua, sản xuất và sửa chữa chưa được đồng bộ toàn diện theo cách tính này.

Sửa giảm phiếu đã cọc giữ nguyên tổng tiền thực trả và tạo khoản cần NCC hoàn; chưa nhận tiền thì không tạo phiếu thu. Đã nhận hoàn được lưu riêng. Công nợ = tối đa 0 của tổng phải trả trừ tổng đã trả cộng đã nhận hoàn. Nhận từng phần, nhận hàng trong khi còn chờ hoàn, hoặc hủy sau khi nhận hoàn một phần đều giữ lịch sử và chỉ xử lý khoản còn lại. Gửi lại cùng mã hoàn không thu hai lần. Trả nợ NCC đã được đối chiếu cả cọc và tiền hoàn.

Giao diện chi tiết hiển thị tiền đã chi, NCC đã hoàn và tiền còn tại NCC. Danh sách phiếu có liên kết chờ nhận hoàn. Khi sửa nháp, tiền đã trả chỉ đọc, không tự điền lại tổng tiền khi đã chọn trả 0; nhãn trạng thái đúng và không đưa thao tác nhận hàng vào nút lưu sửa. Phân loại đã chọn được giữ khi gửi lại phiếu sửa. Chi phí bên ngoài đã có phiếu chi không được đổi số tiền bằng thao tác sửa phiếu nhập.

## Kiểm chứng

P12 đối chiếu phân bổ và tổng thẻ kho tới từng đồng. P13: cọc 1.000 → sửa còn 600 → chờ hoàn 400 → nhận 100 → nhận hàng → nhận nốt 300; tiền đã trả vẫn 1.000, đã hoàn 400, nợ 0. P14: hủy sau khi nhận hoàn 100 thì tổng nghĩa vụ thành 1.000, đã nhận 100, còn nhận 900. Các ca P01–P11, hủy/hoàn D01–D10 và kiểm thử POS/nợ tiếp tục chạy.

Lượt kiểm tra ban đầu phát hiện lỗi kiểm tra giá vốn serial dùng nhầm cột của phân loại. Đã sửa đúng bảng, sau đó chạy lại toàn bộ thành công trước khi thêm các nhãn cuối.

Thử giao diện local phiếu PN000019: chờ hoàn 400, xác nhận nhận thực tế 100 → có phiếu thu 100, còn chờ 300; phiếu chi gốc 1.000 còn nguyên. Đã xem ảnh màn hình và kiểm tra trường tiền trên màn hình sửa chỉ đọc.

`npm run verify` cuối cùng hoàn tất mã thoát 0: 935 kiểm thử đơn vị, Astro 0 lỗi/0 cảnh báo/43 gợi ý; build, bộ D1, MCP và scaffold qua. Danh sách đã thử hiện Chờ nhận hoàn: 300đ và màn sửa hiện Phiếu tạm, tiền đã trả chỉ đọc. Đã xóa ảnh tạm sau khi kiểm tra.

## Dữ liệu và giới hạn còn lại

Migration 0059 bổ sung tổng giá vốn/giảm phân bổ dòng, tiền hoàn riêng của phiếu và giá vốn hàng cũ của phân loại. Đã áp dụng ở local, chưa triển khai thật. Các dòng cũ giữ giá trị tổng giá vốn NULL cho tới khi được tính lại qua sửa/nhận hợp lệ; không diễn giải NULL là giá vốn 0.

Chưa hoàn tất: trả hàng đã nhập theo dòng/serial; chuyển khoản dư thành ứng trước NCC dùng cho phiếu khác; điều chỉnh hoặc nợ chi phí bên vận chuyển; đối chiếu số dư NCC toàn danh bạ/báo cáo và giá vốn các luồng thu mua–lắp ráp–sửa chữa. Sửa phiếu nháp hiện cập nhật nguyên tử nhưng chưa có nhật ký phiên bản sửa đầy đủ. Chưa thể tuyên bố toàn bộ nhập hàng hay báo cáo lợi nhuận đã hoàn thiện.

Không cài thư viện, không deploy, không gộp các đối tác/sản phẩm trùng có chủ ý.
