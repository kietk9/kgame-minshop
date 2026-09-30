# Bước D1 — hủy đặt nhập và nhận tiền NCC hoàn lại

Nghiệm thu ngày 15/09/2026. Áp dụng phần đầu của thiết kế hủy/trả hàng/hoàn tiền đã chốt. Giữ dữ liệu trùng có chủ ý riêng biệt.

## Đã triển khai

- Hủy phiếu đặt nhập DRAFT chưa có biến động kho bằng một D1 batch. Kiểm tra lại trạng thái, nhà cung cấp, tiền/nợ và lịch sử quỹ tại commit. Giữ phiếu chi thực tế; khoản đã trả trở thành nghĩa vụ chờ nhận hoàn từ đúng NCC, không tự tăng quỹ.
- Phiếu đã nhận hàng bị chặn hủy; cần luồng trả hàng nhập riêng. Phiếu đã hủy bị chặn hoàn tất lại. Không đảo kho hoặc xóa thẻ kho bằng thao tác hủy đặt nhập.
- Ngay tại chi tiết phiếu hiển thị số phải nhận, đã nhận, còn lại và biểu mẫu xác nhận thực nhận. Có quỹ tiền mặt/ngân hàng, thông tin giao dịch và ghi chú. Nhân viên không phải lập phiếu thu rời ở sổ quỹ.
- Xác nhận nhận tiền tự lập phiếu thu REFUND tham chiếu purchase_receipt, nhật ký lần hoàn, cập nhật khoản còn lại và biên nhận thao tác trong một batch. Không sửa hoặc hủy phiếu chi gốc.
- Hoàn từng phần, gửi lại cùng mã không ghi lại; đổi nội dung cùng mã bị từ chối. Hai lần nhận đồng thời không vượt khoản còn lại. Ngân hàng cần thông tin giao dịch; chưa xác nhận tiền thật không ghi thành công.
- Migration mới 0058 thêm nghĩa vụ hoàn và nhật ký lần nhận. Không sửa migration cũ; không triển khai môi trường thật.

## Kiểm tra

Bộ kiểm tra đầy đủ npm run verify kết thúc exit 0: 934 kiểm tra đơn vị đạt; 454 tệp được kiểm tra, 0 lỗi, 0 cảnh báo, 42 gợi ý. 9 ca D1 hoàn tiền đạt cùng các bộ POS/công nợ/storefront.

Đã kiểm tra biểu mẫu thực tế tại /api/admin/purchase-refunds: nhận thêm 50đ trên khoản đã nhận 100/200đ, kết quả 150đ đã nhận và 50đ còn lại; gửi lại cùng biểu mẫu không ghi thêm. Xem giao diện xác nhận tổng hàng 1.000đ, trạng thái Đã hủy và phiếu chi gốc 200đ cùng hai phiếu thu 100đ/50đ. Đã xem ảnh giao diện và xóa ảnh tạm.

Sửa lỗi dùng trùng API: phục hồi nguyên trạng /api/admin/refunds phục vụ đối soát hoàn tiền từ nhà cung cấp thanh toán storefront; tách hoàn tiền NCC sang /api/admin/purchase-refunds.

9 ca D1 trên toàn bộ migration thật: giữ dòng tiền khi hủy; hủy lặp và chặn hoàn tất; chặn hủy phiếu đã nhận; tiền sai/chưa xác nhận/vượt/thiếu thông tin ngân hàng; nhận từng phần và gửi lại; nhận đồng thời; lỗi ghi nhật ký cuối rollback; lỗi hủy rollback; nhận đủ và chặn nhận thêm.

## Phạm vi còn lại

Đây chưa phải hoàn tất bước D hoặc toàn bộ thiết kế hoàn tiền. Lỗi trả vượt lúc complete, tự sinh hoàn tiền khi edit và ghi dở lúc create đã có bằng chứng nhưng các đường đó chưa được viết lại nguyên tử. Cần xử lý trước khi dùng vận hành. Không dùng kết quả full verify để tuyên bố những nghiệp vụ chưa có ca kiểm chứng là đúng.

Khách hàng vẫn đang theo mã bước B/C chuyển số dư khi hủy; thiết kế mới chưa được áp dụng cho luồng khách. Phiếu trả hàng bán/nhập, kho chờ kiểm tra, thu hồi key, lựa chọn ứng trước NCC/giữ số dư/chờ hoàn, báo cáo nghĩa vụ tổng và phân quyền nhân viên còn cần triển khai và nghiệm thu riêng. Tích hợp chuyển khoản thật chưa có; thao tác này chỉ ghi nhận khoản nhân viên xác nhận đã nhận.

DB thử cũ có schema/lịch sử migration lệch được ghi ở bước B. Chỉ migration 0058 của đợt này được bổ sung tại DB thử; không gán giả lịch sử migration cũ. Các fixture UI TEST-D riêng không thay chứng từ người dùng.
