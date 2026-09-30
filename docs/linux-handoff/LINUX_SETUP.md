# Cài và kiểm tra trên Linux

## Chuẩn bị

Máy Linux x86_64, Bash, Git, curl, Python 3 và Node **22 từ 22.12 trở lên**. Bản Mac đã kiểm tra bằng Node 22.23.2. Cài Node bằng công cụ quản lý phiên bản bạn tin cậy; nếu đã có nvm, dùng `nvm install 22` và `nvm use 22`. Cần mạng khi tải thư viện. GPU chỉ cần cho mô hình local, không cần để chạy web.

Vào `project` trong gói, kiểm tra `node --version`, rồi:

```bash
npm ci
npm ci --prefix mcp
npm run verify
```

Hai thư mục có khóa phiên bản riêng. Không chép node_modules từ Mac. Không dùng `sudo npm`. Nếu cache cũ bị lỗi quyền, chọn cache riêng bằng `npm_config_cache="$HOME/.cache/kgame-npm" npm ci`. Lưu kết quả Linux vào một tệp local; lần đầu phải đạt đầy đủ trước khi sửa tiếp. Bộ verify tạo DB riêng; không cần nhập dữ liệu cửa hàng, không cần API key hay tài khoản Cloudflare. MCP có bước `deploy --dry-run`, chỉ đóng gói kiểm tra, không xuất bản.

## Tạo cửa hàng thử mới

Chỉ dùng trên máy cá nhân, không mở dev server ra mạng. Từ `project`:

```bash
node scripts/handoff-local-secrets.mjs
npm run build
npm run preview -- --ip 127.0.0.1 --port 4321
```

Giữ terminal server chạy. Mở terminal thứ hai tại `project`:

```bash
node scripts/handoff-fresh-db.mjs http://127.0.0.1:4321
```

Script này dùng Local Explorer của server để chạy migration thật theo thứ tự, chỉ chấp nhận DB mới rỗng. Nó tạo một sản phẩm TEST, không nhập tài khoản, đơn, quỹ hoặc số dư. Không chạy thêm `db:seed` nếu không cần các sản phẩm mẫu upstream. Nếu migration bị ngắt giữa chừng, script sẽ từ chối chạy lại trên DB nửa chừng: dừng server và dùng bản giải nén mới để thử lại; không tự xóa DB có dữ liệu.

Cấu hình build-time được giữ nguyên source: `src/store.config.ts` đang rỗng, tiền tệ mặc định upstream là USD. Sản phẩm bootstrap chỉ là fixture VND để thử dữ liệu. Trước khi nhập bộ sản phẩm dùng thử cửa hàng Việt, đặt `currency: 'vnd'` trong storeOverrides, build lại và đối chiếu định dạng/đơn vị tiền trong POS–web; không đổi tiền tệ giữa chừng trên dữ liệu vận hành.

Mở `http://127.0.0.1:4321/admin/setup`, tạo mật khẩu chủ cửa hàng mới, rồi đăng nhập. Tạo nhân viên thử và quyền tại trang nhân viên. Không dùng dữ liệu đăng nhập từ Mac. Chạy production preview để kiểm tra quyền; chế độ `npm run dev -- --host 127.0.0.1` có hành vi phát triển khác, không dùng làm bằng chứng xác thực.

Script tạo secrets không in giá trị và sẽ dừng nếu `.dev.vars` đã tồn tại; không ghi đè khóa của DB cũ. Giữ `.dev.vars` riêng, không đưa lên Git. Thiết lập cổng thanh toán, mail, vận chuyển sau khi có bài nghiệm thu và cấu hình thử của provider; gói này chưa nối dịch vụ thật.

## Codex và mô hình local

Cài Codex CLI theo [tài liệu OpenAI chính thức](https://learn.chatgpt.com/docs/codex/cli), mở terminal tại `project`, chạy `codex` và đăng nhập. Gói không chứa thông tin đăng nhập Codex. Dán `CONTINUE_PROMPT.md` để khôi phục ngữ cảnh công việc; lịch sử trò chuyện không nằm trong source.

Sau khi cài một provider local và tải mô hình tương thích trên Linux, Codex có thể chọn provider với `--oss --local-provider ollama` hoặc `lmstudio`; chọn tên model thực tế bằng `-m`, theo [tham chiếu lệnh chính thức](https://learn.chatgpt.com/docs/developer-commands?surface=cli):

```bash
codex --oss --local-provider ollama -m '<ten-model-da-cai>' --sandbox read-only
```

Lệnh trên là mẫu: phải thay tên model đã cài và khởi chạy provider trên loopback. Chưa chọn/cài/đo tốc độ model trên RTX 3080 Ti 12GB trong đợt bàn giao này. Khả năng chứa ngữ cảnh và chất lượng gọi công cụ cần kiểm tra trực tiếp, không suy ra chỉ từ RAM/VRAM. Không có cam kết model local sẽ làm nhanh hơn.

Quy trình đề xuất: Codex chịu trách nhiệm thiết kế nghiệp vụ tiền/tồn/quyền và kiểm duyệt; model local đọc mã, tìm nơi ảnh hưởng, đề xuất ca kiểm thử hoặc sửa một phạm vi hẹp. Bắt đầu read-only, đánh giá kết quả trên lỗi đã biết rồi mới cho sửa. Mỗi AI dùng nhánh/bản làm việc riêng khi đã thiết lập Git; không để hai AI cùng sửa một checkout. Mỗi đợt phải có diff rõ ràng, kiểm thử hồi quy, verify và cập nhật bàn giao. Chưa tự tải model hoặc mua dịch vụ.
