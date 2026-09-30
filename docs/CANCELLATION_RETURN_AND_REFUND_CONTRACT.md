# Quy tắc hủy, trả hàng và hoàn tiền

Ngày 13/09/2026. Thiết kế được người dùng chấp thuận sau khi đối chiếu ba tình huống thực tế. Thay thế mặc định chuyển mọi khoản tiền đơn hủy thành số dư và hướng dẫn cũ tự hủy phiếu thu/chi. Đây là thiết kế để triển khai; chưa phải báo cáo nghiệm thu mã nguồn.

## Dòng xử lý tại chứng từ gốc

| Tình huống | Thao tác | Chứng từ tự tạo sau xác nhận tiền thực tế |
|---|---|---|
| Đặt nhập chưa nhận hàng, NCC hết hàng trả tiền | Hủy và nhận hoàn tiền | Phiếu thu hoàn tiền NCC, liên kết phiếu đặt và khoản chi gốc; không đảo tồn |
| Khách đặt cọc phần mềm chưa giao, không có hàng | Hủy và hoàn tiền | Phiếu chi hoàn tiền khách, liên kết đơn và khoản thu cọc; giải phóng giữ chỗ, không tạo hàng trả |
| Đã bán/giao, khách trả lại | Tạo phiếu trả hàng từ hóa đơn | Phiếu nhận hàng trả và thanh toán hoàn tiền nếu có; giữ hóa đơn bán gốc |
| Đã nhập/nhận, trả hàng NCC | Tạo phiếu trả hàng nhập từ phiếu nhập | Phiếu xuất trả NCC; khoản hoàn tiền theo số tiền thực nhận, không tự hủy phiếu nhập gốc |

Nhân viên không phải sang sổ quỹ lập phiếu rời. Hộp xử lý có số tiền hoàn, quỹ tiền mặt/ngân hàng, thời gian, lý do và thông tin giao dịch. Xác nhận đã nhận/đã trả mới ghi phiếu tiền. Việc bấm nút trên phần mềm không tự chuyển tiền ngân hàng nếu chưa có tích hợp.

## Tiền chưa hoàn và số dư

- Giữ nguyên phiếu thu/chi phản ánh tiền đã phát sinh. Hủy nghĩa vụ mua/bán không xóa dòng tiền thật.
- Chưa chuyển/nhận tiền: ghi nghĩa vụ hoàn còn lại, trạng thái Chờ hoàn tiền, hiển thị ngay tại chứng từ, danh bạ và danh sách cần xử lý. Cho hoàn từng phần; còn lại = phải hoàn trừ các lần đã hoàn thành công.
- Khách có thể chọn Giữ làm số dư khách. Khoản tại NCC có thể chọn Giữ làm ứng trước NCC. Đây là lựa chọn rõ ràng, không phải mặc định mọi lần hủy. Tăng số dư không tạo phiếu tiền mới.
- Hoàn từ số dư phải giảm số dư và lập phiếu tiền cùng giao dịch; chặn dùng/hoàn vượt số dư và hoàn đồng thời hai lần.
- Thanh toán gốc bằng số dư: hoàn về số dư trước, không tự coi là tiền mặt mới đã thu. Muốn trả tiền mặt/ngân hàng từ số dư dùng bước hoàn số dư riêng trong cùng màn hình.
- Nếu kết quả chuyển khoản chưa rõ, giữ trạng thái cần đối chiếu; không tự ghi thành công hoặc gửi chuyển lần nữa. Bản đầu chưa tích hợp ngân hàng dùng xác nhận nhân viên và thông tin giao dịch thực tế.
- Phiếu thu/chi lập nhầm không có tiền thực tế được hủy với người, thời gian, lý do. Ghi sai quỹ/số tiền của giao dịch có thật cần điều chỉnh có liên kết và lịch sử, không xóa dòng tiền để che sai.

## Kho, công nợ và hàng trả

- Chưa giao/nhận: hủy giải phóng giữ chỗ; không tăng/giảm tồn vật lý và không tạo phiếu trả hàng.
- Đã giao/nhận: dùng trả hàng toàn bộ hoặc một phần, tham chiếu từng dòng/serial gốc. Tổng lượng trả không vượt lượng thực giao trừ lượng đã trả. Giữ lịch sử xuất/nhập gốc và thêm dòng đảo tương ứng.
- Hàng nhận lại đủ điều kiện bán mới tăng tồn sẵn bán; hàng lỗi vào khu chờ kiểm tra. Serial không tự trở thành IN_STOCK trước khi kiểm tra tình trạng và quyền sở hữu.
- Phần mềm/key đã giao cần xác minh thu hồi/vô hiệu hóa quyền sử dụng. Hoàn tiền không tự khôi phục key về kho để bán tiếp.
- Ví dụ hóa đơn 1.000, khách trả 600, còn nợ 400; trả hàng trị giá 700: giảm nợ 400, hoàn khách 300. Trả hàng trị giá 200: nợ còn 200, không phát sinh hoàn tiền. Giá trị trả là tổng phần trả đã chốt sau phân bổ chiết khấu; phí vận chuyển/khấu trừ xử lý minh bạch riêng.
- Với NCC áp dụng đối xứng: giảm nghĩa vụ chưa thanh toán trước, phần đã thanh toán vượt nghĩa vụ còn lại trở thành khoản cần nhận hoàn hoặc ứng trước theo lựa chọn.
- Không đổi nhà cung cấp/khách trên chứng từ đã có tiền để chuyển nghĩa vụ cho người khác. Chọn bằng id/mã; giữ các bản ghi trùng có chủ ý riêng biệt.

## Thiết kế dữ liệu và chống ghi sai

Cần nhật ký nghĩa vụ hoàn và các lần thanh toán, phiếu trả hàng/dòng trả tham chiếu chứng từ gốc, nhật ký số dư NCC, liên kết giữa hoàn tiền và khoản thu/chi gốc. Mỗi thao tác có mã yêu cầu duy nhất và dấu kiểm tra nội dung. Cùng mã cùng nội dung trả kết quả cũ; khác nội dung từ chối.

Trạng thái chứng từ, giữ chỗ/tồn, thẻ kho, công nợ, nghĩa vụ hoàn/số dư và phiếu tiền liên quan ghi trong một D1 batch có điều kiện kiểm tra tại commit. Chuyển tiền bên ngoài là quá trình riêng: lưu yêu cầu, xác minh kết quả rồi ghi thành công một lần. Không coi D1 batch có thể hoàn tác giao dịch ngân hàng.

paid_amount và payments gốc là lịch sử đã thanh toán, không sửa về 0 chỉ vì trả hàng. Báo cáo phải thể hiện riêng doanh số gốc, trả hàng, thu/chi thực tế và nghĩa vụ/số dư còn lại. Không trừ cả khoản chờ hoàn lẫn số dư cho cùng một đồng tiền.

## Nghiệm thu trước triển khai

Ba tình huống người dùng nêu; hủy chưa thu/chi; hoàn toàn bộ/từng phần/chờ hoàn/giữ số dư; trả hàng một phần; nợ chưa trả; thanh toán bằng số dư hoặc hỗn hợp; serial đã chuyển trạng thái; hàng lỗi; key không thu hồi; hai người hoàn đồng thời; gửi lại yêu cầu; lỗi ghi chứng từ cuối; chuyển khoản chưa rõ; sai khách/NCC; số tiền âm/phân số/vượt còn phải hoàn. Kiểm tra số dư quỹ, nghĩa vụ còn lại, tồn từng trạng thái và báo cáo, không chỉ thông báo thành công.

Ưu tiên triển khai: chặn và sửa năm lỗi nhập hàng đã kiểm chứng; thêm nghĩa vụ hoàn và xác nhận hoàn tại nguồn; phiếu trả hàng bán/nhập và kho chờ kiểm tra; đối chiếu báo cáo và tài khoản/phân quyền. Migration phải thêm mới, không viết lại migration đã áp dụng. Không deploy khi chưa nghiệm thu.
