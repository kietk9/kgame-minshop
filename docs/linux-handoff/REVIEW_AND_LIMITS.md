# Phạm vi rà soát và giới hạn bàn giao

## Nội dung xuất

Snapshot source hiện tại, không chứa `.git` hoặc lịch sử commit, không gắn remote. Cả tracked/untracked được xét trong SOURCE_MANIFEST.json. Không thực hiện commit, push, tạo repo, upload hay deploy. Không xóa/sửa source gốc. 12 checksum tệp của bằng chứng D16 khớp bản xuất trước khi thử.

Đã loại dữ liệu runtime, cơ sở dữ liệu, cấu hình cá nhân, chat dump, seed KGAME cũ và bằng chứng raw có thể chứa bản ghi của cửa hàng. Giữ LICENSE, tài liệu nguồn và test fixtures tổng hợp. Workflow verify được giữ vì test cần nó và nó chỉ chạy kiểm thử; workflow publish upstream bị loại. Các script deploy/reset upstream vẫn có trong source để bảo toàn cấu trúc, không chạy chúng khi chuyển máy.

## Rà soát thông tin nhạy cảm

Quét source dạng văn bản cho private key, token provider phổ biến, gán secret dạng literal, email và đường dẫn Mac. Không phát hiện private key/token provider theo các mẫu đã dùng. Ba kết quả nghi vấn secret đã đối chiếu: hai guest token giả trong unit test và một biểu thức biến shell, không phải credential cửa hàng. Các email thuộc test, placeholder hoặc địa chỉ báo lỗi công khai upstream. `src/store.config.ts` chỉ có override rỗng; cấu hình Wrangler là mẫu không có ID tài khoản thật. Không chép .dev.vars hoặc cấu hình MCP local.

Đây là rà soát theo mẫu và phân loại có mục tiêu, không phải chứng nhận tuyệt đối không có bí mật. Không quét/chuyển lịch sử Git cũ vì lịch sử đó không nằm trong gói hoặc phạm vi xuất bản đề xuất. Nếu sau này muốn push cả lịch sử cũ, phải rà soát riêng trước. Trước upload phải kiểm tra lại đúng tệp cuối, kho đích private và chủ sở hữu; không push vào upstream ddyy/minshop.

## Kiểm chứng

Xem `evidence/handoff-verification.json` và `evidence/handoff-verify.log` cho kết quả chạy trên bản xuất, cùng bằng chứng D16. Việc chạy thực hiện trên macOS/Node22 với thư viện bản Mac trong thư mục thử riêng; chúng được tháo khỏi gói cuối. Không có máy Linux/GPU trong phiên này: chưa chứng minh npm ci Linux, tốc độ model, VRAM, driver hay kết nối model local. Lần đầu trên Linux bắt buộc chạy lại verify.

Kho nguồn gốc còn 72 dòng báo whitespace từ trước ở git diff --check. Không tuyên bố Git sạch hoặc đã commit. Các tài liệu lịch sử được giữ để tra cứu, có liên kết tới evidence không xuất theo gói. Chỉ các bằng chứng trong thư mục evidence của gói này được chuyển.

Gói không có backup dữ liệu cửa hàng, không bảo toàn tài khoản/phiên/ảnh hàng trong R2, và không nối thanh toán/vận chuyển thật. Tình huống này phù hợp với yêu cầu dùng dữ liệu test. Muốn chuyển dữ liệu vận hành thật về sau phải có quy trình sao lưu/khôi phục riêng và kiểm chứng.

Trong quá trình xác nhận bản xuất, một lần kiểm thử HTTP quyền nhân viên trả 500 thay vì 403 tại `/api/admin/inventory/outbound`; chạy lại riêng cùng bài kiểm thử đạt. Chưa xác định nguyên nhân lỗi gián đoạn này, không sửa mã hoặc làm yếu assertion để bỏ qua. Lưu cả `verify-http-failure.log` và `http-recheck.log`; cần theo dõi trên Linux và điều tra nếu tái diễn, trước khi nghiệm thu vận hành.
