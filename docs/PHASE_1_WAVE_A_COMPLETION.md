# Đợt 1 — Hoàn tất bước A: khôi phục độ tin cậy của bộ kiểm tra

Ngày: 13/09/2026. Phạm vi ra mắt: một cửa hàng, một kho. Dữ liệu hiện có là dữ liệu thử. Quy tắc đã chốt: chặn xuất bán khi thiếu tồn; vẫn cho đặt trước.

## Kết quả nghiệm thu bước A

| Hạng mục | Trước sửa | Sau sửa |
|---|---|---|
| Kiểm tra đơn vị | 920 đạt, 2 lỗi | 931 đạt, 0 lỗi |
| Kiểm tra toàn dự án | 60 lỗi | 0 lỗi, 0 cảnh báo, 42 gợi ý |
| Cổng `npm run verify` | Dừng ở kiểm tra đơn vị | Đạt toàn bộ, mã thoát 0 |
| Audit đọc dữ liệu thất bại | Có thể báo đạt | Dừng và trả mã thoát 2 |
| Audit có sai lệch | Vẫn trả mã thành công | Trả mã thoát 1 |
| Audit tự sửa | Có thể gán nợ cho khách tùy ý, xóa dấu vết tiền trả vượt | Đã loại bỏ; công cụ chỉ đọc |

Cổng đầy đủ gồm kiểm tra đơn vị, Astro, bộ màu, bản dựng, CSS, kiểm tra audit trên D1 tách biệt, sáu nhóm tích hợp sẵn có, áp dụng toàn bộ migration và kiểm tra Worker D1, quốc gia Stripe, MCP kiểm tra kiểu và đóng gói dry-run, cùng bộ tạo dự án. MCP đã được cài bằng tệp khóa phiên bản sau khi người dùng cho phép. Không triển khai lên môi trường thật.

## Thay đổi thực tế

- Khôi phục trường cần giao hàng, khối lượng và tệp tải xuống trong form sản phẩm. Khi sửa, giữ đúng khối lượng theo đơn vị cửa hàng, trạng thái sản phẩm số, thông tin tệp và lựa chọn gỡ tệp cho đơn sau. Đã kiểm tra bằng render thành phần và quan sát form thật trên trình duyệt; không tạo chứng từ từ giao diện.
- Sửa các trường chọn sai kiểu bằng kiểm tra phần tử lúc chạy; thêm kiểm tra cấu trúc phản hồi API. Không bỏ chế độ kiểm tra nghiêm ngặt, không thêm `any` hàng loạt hoặc vô hiệu hóa kiểm tra.
- Khôi phục tham chiếu trường mã phiếu nhập; thay hàm tính tổng thu mua đặt trên `window` bằng hàm trong phạm vi trang; xác thực dữ liệu bộ chuyển đổi địa chỉ; dùng đúng trường giá bán mục tiêu của serial.
- Bổ sung chỉ số số phiếu thu mua hoàn thành bằng truy vấn trạng thái thực tế; thống nhất kiểu nhóm phiếu quỹ với các nhóm đã được sử dụng; thêm nhãn tiếng Việt cho nhóm COD và phí giao hàng, vẫn hiển thị nhóm cũ.
- Sửa phản hồi API có cờ thành công bị ghi hai lần; dùng màu quản trị chung và giữ màu nền hiện hành.
- Audit trong lệnh chạy và dịch vụ dùng chung tám truy vấn. Truy vấn lỗi không được chuyển thành danh sách rỗng. Lệnh sử dụng Wrangler đã cài trong dự án, truyền SQL bằng đối số riêng, không qua shell hoặc tải thư viện bằng `npx`.

## Phạm vi và giới hạn của audit mới

Tám kiểm tra: số tiền còn lại trên đơn KGAME; tiền nguyên, không âm và không trả vượt; số tiền còn lại trên phiếu nhập hoàn thành; đơn còn tiền chưa trả nhưng thiếu khách; tổng các lần thanh toán so với tiền đã thu; tham chiếu phiếu quỹ tới đơn/phiếu nhập; tồn tổng sản phẩm so với tồn mới/cũ; tồn phân loại không âm và nguyên.

Đơn từ luồng storefront gốc chưa có mã KGAME dùng mô hình thanh toán khác nên chưa đưa vào phép đối chiếu KGAME. Đặt trước được kiểm tra số tiền còn lại trên chứng từ, không mặc định coi số tiền đó là công nợ phải thu đã phát sinh. Phiếu nhập nháp chưa đưa vào kiểm tra công nợ phiếu hoàn thành. Giao dịch tiền thật của đơn đã hủy không bị coi là sai chỉ vì trạng thái đơn; chính sách hoàn tiền chưa được chốt.

Audit chưa chứng nhận giá vốn, tồn đầu kỳ so với toàn bộ thẻ kho, quyền sở hữu serial, công nợ giữa các bảng đối tác, luồng storefront/POS thống nhất, hoàn tiền hay đối soát vận chuyển. Bản thân cổng kiểm tra mã đạt không chứng minh toàn bộ nghiệp vụ KGAME đã đúng.

## Dữ liệu thử đang có

Chạy lệnh audit thật trên D1 cục bộ trả mã thoát **1**, phát hiện **17 sai lệch**: **13** đơn lệch giữa tiền đã thu và tổng các lần thanh toán; **4** sản phẩm lệch tồn tổng với tồn mới/cũ. Audit không thay đổi bản ghi. Số này đếm các sai lệch thuộc tám kiểm tra, không phải danh sách đầy đủ lỗi vận hành hay số nguyên nhân gốc.

Không sửa dữ liệu để làm báo cáo đẹp. Sau khi sửa luồng tạo chứng từ, sẽ dựng lại dữ liệu thử từ tình huống chuẩn và kiểm tra lại. Bản ghi hoặc báo cáo cũ không được tự coi là đúng chỉ vì hết lỗi biên dịch.

## Bước B tiếp theo: sửa luồng ghi nhận kho và thanh toán

Dùng các ca B01–B08 trong báo cáo hiện trạng, giữ kết quả cũ làm mốc. Bảy ca thất bại vẫn đang mở; bước A chưa sửa hoặc nghiệm thu lại các ca này.

1. Tạo đơn phải ghi đơn, dòng hàng, serial, thẻ kho, tồn, thanh toán và phiếu quỹ trong thao tác nguyên tử. Lỗi ở bước cuối phải hoàn tác toàn bộ. Thêm tình huống gửi đồng thời; chỉ kiểm tra tồn trước khi ghi là chưa đủ.
2. Chặn xuất vượt tồn, số lượng không hợp lệ và serial không thuộc hàng/điều kiện/nguồn sở hữu phù hợp. Tính cả các dòng trùng sản phẩm. Đặt trước vẫn được tạo khi thiếu tồn; serial đã chọn phải được giữ cho đúng đơn.
3. Chặn hoàn tất đặt trước đã hủy, đã hoàn tất hoặc không phải đơn đặt trước; chống nhấn lại và thao tác đồng thời. Đối chiếu tiền cọc, tiền bổ sung, lịch sử thanh toán và phiếu quỹ.
4. Hoàn kho dựa vào lượng thực tế đã xuất và đã hoàn, không dựa riêng vào trạng thái `COMPLETED`. Quy tắc hủy và hoàn tiền thật cần được xác nhận trước khi sửa phần tiền.
5. Sửa xuất linh kiện sửa chữa để tồn mới/cũ, tồn tổng, tồn phân loại và thẻ kho cùng khớp; cũng phải chặn thiếu tồn và ghi nguyên tử.
6. Đối chiếu nguồn khách hàng/nhà cung cấp/đối tác để tránh gắn chứng từ vào sai đối tượng. Chưa tự gán khoản thiếu thông tin cho khách bất kỳ.

Chỉ sau khi các ca này đạt mới đi tiếp tài khoản/phân quyền, thống nhất đơn web và POS, giá vốn/báo cáo, rồi tích hợp vận chuyển. Chứng từ có thể bỏ để dựng lại vì là dữ liệu thử; mã nguồn và migration đã áp dụng vẫn phải có mốc phục hồi và không được viết lại tùy tiện.

## Bằng chứng và tình trạng mã nguồn

Kết quả bước A được lưu riêng tại `docs/audit/wave-a/`; bằng chứng đợt 1 được giữ nguyên để đối chiếu. Có bản sao mã nguồn trước khi bắt đầu trong vùng làm việc của quá trình rà soát. Không thay đổi migration, không xóa dữ liệu cục bộ, không đưa bí mật vào tài liệu.

`git diff --check` còn báo khoảng trắng ở các chỉnh sửa sẵn có của dự án. Đây không phải lỗi kiểm tra kiểu hoặc nghiệp vụ; không hoàn tác các chỉnh sửa cũ để làm sạch kết quả. Các tệp đã sửa trong bước A được đối chiếu với bản mã nguồn trước sửa.
