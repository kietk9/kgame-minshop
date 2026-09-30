# Bước D2 — kiểm tra dữ liệu trước ghi nhập hàng

Ngày 15/09/2026. Phạm vi: bổ sung kiểm tra đầu vào, chưa viết lại toàn bộ giao dịch nhập hàng.

- Tạo phiếu kiểm tra dòng hàng, sản phẩm tồn tại, phân loại thuộc sản phẩm, nhà cung cấp đúng vai trò, số lượng nguyên dương, tiền nguyên không âm, chiết khấu không vượt tiền hàng, trả tiền không vượt tổng. Kiểm tra trước khi tự tạo nhà cung cấp hoặc ghi phiếu.
- Hoàn tất phiếu kiểm tra tổng/đã trả/nợ khớp, tiền trả thêm nguyên không âm và không vượt số còn nợ trước khi ghi kho.
- Ca D10 dùng D1 thật kiểm chứng sản phẩm không tồn tại, phiếu rỗng và tiền hoàn tất âm/phân số/vượt nợ: dữ liệu phiếu/quỹ/nghĩa vụ không thay đổi.

Bộ kiểm tra đầy đủ npm run verify kết thúc thành công (exit 0): 934 kiểm tra đơn vị, 455 tệp, 0 lỗi, 0 cảnh báo, 42 gợi ý. Bộ D1 hoàn tiền/nhập hàng có 10 ca đạt cùng các bộ kiểm tra tích hợp khác.

Giới hạn: kiểm tra trước ghi chưa thay thế giao dịch nguyên tử; thay đổi đồng thời hoặc lỗi giữa các lệnh ghi vẫn cần sửa ở create/complete/update. Lỗi sửa phiếu tự tạo hoàn tiền chưa xử lý ở bước này. Không coi bước D2 là hoàn tất phân hệ nhập hàng. Không có migration mới, không deploy.
