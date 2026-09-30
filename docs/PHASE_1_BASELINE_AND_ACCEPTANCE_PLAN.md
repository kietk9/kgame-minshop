# Đợt 1 — Hiện trạng có bằng chứng và kế hoạch nghiệm thu

Ngày: 13/09/2026. Trạng thái: hoàn thành kiểm kê route và baseline kỹ thuật/nghiệp vụ có trọng tâm; chưa hoàn thành audit sâu toàn hệ thống hoặc nghiệm thu vận hành.

## 1. Phạm vi đã được chủ cửa hàng xác nhận

- Dữ liệu hiện tại đều là dữ liệu thử; không cần bảo toàn giao dịch hay danh bạ thử.
- Bản ra mắt đầu tiên: một cửa hàng, một kho.
- Không đủ tồn: chặn xuất bán, vẫn cho phép đặt trước. Đặt trước không đồng nghĩa đã xuất hàng.

Đã lưu mốc mã nguồn đầy đủ, gồm cả phần Kgame chưa được Git theo dõi, để so sánh và phục hồi thay đổi mã. Không sao lưu hay reset dữ liệu cũ vì không cần thiết cho baseline; các ca chạy trên DB thử riêng. Không triển khai lên Cloudflare hoặc gọi API hãng giao hàng/thanh toán thật.

## 2. Kết quả kiểm tra ban đầu

Kiểm tra bằng Node 22.23.2; bản tải được đối chiếu SHA256. Không nâng cấp hay cài bổ sung các gói npm của dự án.

| Bước | Kết quả | Ý nghĩa |
|---|---|---|
| npm run verify | Không đạt; 920/922 test đạt, 2 test thất bại; chuỗi dừng ở unit/source-contract tests | Chưa có tín hiệu nghiệm thu tổng thể |
| npm run check | 60 lỗi, 0 warnings, 44 hints trên 429 tệp | Build không thay thế kiểm tra kiểu dữ liệu/chẩn đoán |
| npm run theme:check | Đạt | Kiểm tra cấu trúc theme nền |
| npm run build | Đạt | Tạo được bản ứng dụng; không chứng minh nghiệp vụ đúng |
| Kiểm tra CSS đã build và quốc gia Stripe | Đạt | Các cổng kỹ thuật nền này đạt |
| Sáu chương trình integration Miniflare nền | Đạt | Reservation, refunds, media, menus, guest access, shipping nền; chưa bao trùm POS Kgame |
| Integration D1/Worker đầy đủ | Lần đầu bị chặn bởi môi trường watcher/registry; bản chẩn đoán cùng assertions sau điều chỉnh môi trường đạt | Migration, seed, đọc/ghi qua binding và cron đạt; không được ghi nhận lỗi môi trường là lỗi nghiệp vụ |
| Typecheck MCP trực tiếp | Không đạt trong môi trường hiện tại, thiếu SDK agents/MCP; có lỗi kiểu kéo theo | Chưa chạy deploy dry-run; chưa kết luận toàn bộ lỗi này là lỗi logic MCP |
| Scaffold check | Đạt | Công cụ tạo storefront nền đạt |

Integration Worker được chạy lại với registry/log trong thư mục được phép ghi và watcher polling. Bản chẩn đoán giữ nguyên các assertion nhưng giảm thời gian chờ/curl và giữ log trước dọn DB. Không sửa script integration gốc. Npm verify đầy đủ vẫn KHÔNG ĐẠT; không được cộng các bước kiểm tra riêng thành một lần verify xanh.

Hai test thất bại ban đầu:

1. test/scripts/rollout-gates.test.mjs: ProductForm thiếu cấu trúc gate attachmentActive mà test yêu cầu. Cần kiểm tra chức năng tệp đính kèm đã bị bỏ hay gate thay đổi, không chỉ sửa regex cho đạt.
2. test/storefront/admin-isolation.test.mjs: AdminLayout không còn token body mà test yêu cầu. Cần quyết định palette quản trị độc lập và kiểm tra theme/CSS thực tế; một thất bại kiểm tra chuỗi chưa đủ kết luận màn hình không đọc được.

Lỗi chẩn đoán nằm trong 16 tệp. Phân bổ đáng chú ý: buybacks/new 15, QuickProductModal 11, kgame/db 8, purchases/new 6, products/index 5. Danh sách từng lỗi có tệp, dòng và mã tại audit/phase-1/diagnostics.json. Không xử lý bằng cách bỏ strict, thêm any hàng loạt hoặc vô hiệu hóa cổng kiểm tra.

## 3. Các lỗi đã tái hiện bằng dữ liệu riêng

Dùng hàm nghiệp vụ thật trong kgame/db.ts và ledger.ts, chuyển TypeScript sang JS để chạy độc lập. SQL chạy trên D1 Miniflare với toàn bộ migration thật. Không thay logic hàm; không giả lập kết quả SQL. B06 chỉ tiêm lỗi vào bước ghi quỹ để kiểm tra trạng thái còn lại. Các ca này kiểm tra tầng dịch vụ, chưa xác minh giao diện/API/xác thực.

| Ca | Hành động | Kết quả thực tế | Kết quả cần đạt |
|---|---|---|---|
| B01 | Tồn 10, tạo ORDER giao hàng PROCESSING, hủy khi hàng vẫn ở cửa hàng | Tồn 9 trước và sau hủy | Giải phóng/hoàn đúng phần xuất hoặc giữ; không làm mất 1 hàng |
| B02 | Chọn một Serial cho PREORDER | Serial vẫn IN_STOCK | Serial giữ riêng cho đơn không còn khả dụng cho đơn khác |
| B03 | Tồn 1, bán 2 | Được tạo đơn; tồn bị ép 0, thẻ kho -2 | Từ chối và không đổi dữ liệu theo chính sách đã chốt |
| B04 | Hủy PREORDER rồi gọi fulfill | Đơn thành ORDER/COMPLETED, tồn giảm | Từ chối và không tái mở đơn hủy |
| B05 | Tạo bán hàng chưa trả tiền với customer_id null | Được chấp nhận | Bắt buộc gắn khách có thật khi phát sinh nợ |
| B06 | Gây lỗi tại ghi sổ quỹ khi tạo đơn | Còn thêm 1 đơn, kho từ 10 còn 9 | Không để lại giao dịch nội bộ nửa chừng |
| B07 | Xuất một linh kiện mới cho sửa chữa | stock 9 nhưng stock_new 10 | Các số tổng hợp cùng phản ánh 9 |
| B08 | Đơn 10 triệu, cọc 2, giao thu thêm 5, thu nốt 3 | Nợ trung gian 3 triệu; tổng payments 10 triệu; tồn từ 10 còn 9 | Đạt cho tình huống cơ bản này; cần thêm lặp/đồng thời và các đường thu khác |

B00: toàn bộ migration áp dụng được trên D1 sạch trong phép thử. Tổng: 7 ca nghiệp vụ thất bại, 1 ca nghiệp vụ cơ bản đạt; migration setup đạt riêng. Không coi đây là tỷ lệ đúng/sai của toàn hệ thống.

Đã kiểm tra riêng cách audit xử lý lỗi truy vấn: thay npx bằng executable luôn trả lỗi, không truy vấn hay sửa DB nào. Script gặp 5 lỗi truy vấn nhưng vẫn báo “100%” và thoát 0. Đây là lỗi kiểm soát đã tái hiện. Không dùng audit:fix để sửa dữ liệu: việc tự gán nợ cho khách đầu tiên hoặc cắt số tiền không được chấp nhận.

Bằng chứng kết quả tại audit/phase-1/business-results.json và audit-query-failure.json.

## 4. Kiểm kê hệ thống và mâu thuẫn đặc tả

Ma trận đầy đủ: [SYSTEM_FUNCTION_INVENTORY.md](SYSTEM_FUNCTION_INVENTORY.md). Có 124 tệp route, gồm 41 API; 56 tệp route quản trị. Chưa đánh dấu chức năng đúng chỉ dựa vào việc có tệp. Schema được dựng từ migration; không suy ra từ mô tả tài liệu.

Các điểm phải thống nhất trước sửa cốt lõi:

- orders được nền quy định paid-only nhưng POS chứa cả cọc/chưa thanh toán.
- Web dùng order_items/product_variants, POS dùng order_lines/product_types/Serial. Cùng bảng orders nhưng chưa dùng cùng cơ chế kho/tiền. Route admin chi tiết hiện nhận số hoặc mã ĐH; API nền và liên kết web dùng public_id. Cần một đường mở/quản lý chung; đây là đối chiếu tĩnh, chưa phải ca UI đã chạy.
- customers, suppliers và partners chưa có một điểm ghi/đọc thống nhất.
- PARTIAL trong tài liệu/đường thu nợ khác PARTIALLY_PAID trong POS/bộ lọc.
- Tài liệu mô tả cost_cents trong order_lines nhưng schema hiện không có cột này; cần snapshot giá vốn thật theo sự kiện xuất.
- Giá vốn báo cáo tài chính lấy tổng nhập trong kỳ hoặc 65% doanh thu; lắp ráp lấy 60% giá bán. Những số này không được coi là lợi nhuận vận hành thật.
- store.config.ts không override currency, config mặc định USD; POS hardcode VND. Cần chốt VND và đơn vị tiền thống nhất trước nối hai kênh; chưa xác minh giá trị cấu hình runtime trên hệ thống đang chạy.
- Công thức nợ “mọi đơn chưa hủy” tính cả PREORDER chưa giao; phiếu nhập DRAFT cũng cần tách. Tổng tiền thu phải theo ngày giao dịch tiền, không theo ngày tạo đơn và paid_amount lũy kế.
- Hủy chứng từ, trả hàng, hoàn tiền và hủy phiếu tiền nhập sai là các hành động khác nhau. Quy tắc vô hiệu hóa toàn bộ tiền gốc khi hủy trong hai tài liệu hiện tại cần sửa phạm vi; chưa tự triển khai chính sách mới.

Các chính sách chưa được chủ cửa hàng xác nhận phải ghi là đề xuất/cần chốt, không tự coi là yêu cầu đã duyệt. Các quy tắc kỹ thuật AGENTS còn phù hợp vẫn áp dụng; mâu thuẫn nghiệp vụ paid-only phải được giải quyết trong đặc tả mới trước khi thay mô hình đơn.

## 5. Kế hoạch sửa theo thứ tự phụ thuộc

### Đợt A — Khôi phục cổng kiểm tra đáng tin

Đầu ra: sửa 60 lỗi chẩn đoán bằng kiểu/ràng buộc đúng, xử lý nguyên nhân hai test thất bại, audit chỉ đọc có trạng thái không kiểm tra được và mã thoát lỗi. Phân biệt phần MCP tùy chọn cần dependency riêng, không cài vào root.

Nghiệm thu: check và các test nền đạt; audit gặp lỗi truy vấn phải báo không kiểm tra được; dữ liệu cố tình sai phải bị phát hiện. Cấm bỏ kiểm tra để tạo kết quả xanh.

### Đợt B — Bảo vệ giao dịch kho/tiền và trạng thái

Đầu ra: dịch vụ kho và thanh toán chung; guard trạng thái/đối tác/Serial/đầu vào; chống gửi lặp và thao tác đồng thời; xử lý các bước ghi DB nhất quán theo khả năng D1. Tầng API/UI gọi cùng dịch vụ. Không chỉ thêm guard đầu hàm rồi tiếp tục nhiều lần ghi không được bảo vệ.

Nghiệm thu: B01–B07 đạt; B08 giữ đạt; thêm ca hai người bán món cuối, fulfill/hủy/thu tiền hai lần, thu nhầm đối tác, thu vượt nợ, thu đơn đã hủy, lỗi giữa chừng. Mỗi lần từ chối phải không đổi tiền/kho/nợ.

### Đợt C — Hoàn thiện quy trình một cửa hàng và nối web

Đầu ra: nhập, POS, đặt trước, giao nhận, thanh toán nhiều đợt, công nợ, hủy/hoàn cọc, trả từng dòng/toàn bộ; VND và danh bạ thống nhất; có cách mở và xử lý đơn web trong quản trị. Thiết kế tài khoản/quyền ngay trong đợt này, gắn quyền phía máy chủ vào mọi thao tác ghi.

Nghiệm thu: mỗi sự kiện xác minh cả DB và giao diện; đơn online/Serial/phiên bản phản ánh cùng nguồn kho; tiền, payments và quỹ khớp theo chứng từ.

### Đợt D — Nghiệp vụ đặc thù và giá vốn thật

Đầu ra: kiểm kho có chứng từ, thẻ kho, thu mua, sửa chữa và lắp ráp. Giá vốn Serial theo từng máy; hàng số lượng theo phương pháp được chốt; không tự ước lượng bằng tỷ lệ giá bán. Máy khách gửi sửa không được lẫn hàng sở hữu của cửa hàng.

Nghiệm thu: tồn tổng/tình trạng/Serial/thẻ kho khớp, giá vốn đơn cũ không đổi tùy tiện khi sửa giá vốn hiện tại; kiểm kho không tạo tiền ảo.

### Đợt E — Báo cáo, giao hàng và chạy thử

Đầu ra: định nghĩa đúng doanh thu/tiền thu/nợ/COGS/lợi nhuận và ngày ghi nhận; drilldown khớp tổng. Đối soát COD thủ công đúng trước khi nối một hãng; kiểm tra đúng hãng, đúng vận đơn, chưa đối soát, số thực nhận/phí/chênh lệch. Hoàn thiện giao diện sau khi hành vi nghiệp vụ ổn định.

Nghiệm thu: dữ liệu có đáp án biết trước; tiền hãng giữ khác tiền cửa hàng nhận; không đối soát/thu nợ trùng; có nhật ký người thực hiện và kiểm tra quyền âm. Verify kỹ thuật và bộ nghiệp vụ Kgame đều đạt trước chạy thí điểm.

## 6. Các quyết định cần chốt bằng ví dụ

1. Khi tạo ORDER giao hàng: giữ hàng trước và xuất lúc bàn giao đơn vị giao hàng, hay xuất ngay? Đề xuất giữ lúc nhận đơn và xuất khi bàn giao; hàng đã ra ngoài chỉ nhập lại khi nhận hoàn thực tế.
2. Hủy cọc: hoàn toàn bộ, giữ phí theo điều kiện hay chủ cửa hàng quyết định từng lần? Đề xuất lưu tiền gốc; chỉ ghi hoàn khi thực trả, khoản chưa hoàn thể hiện riêng.
3. Trả hàng: có giới hạn thời gian/phí, hàng lỗi đưa vào trạng thái nào, giảm giá được phân bổ thế nào? Cần phương án cụ thể trước triển khai.
4. Giá vốn phụ kiện số lượng: phương pháp nào; chi phí vận chuyển nhập hàng/lắp ráp/sửa thuê được phân bổ ra sao? Máy Serial nên lấy chi phí từng máy.
5. Khi khách đã trả COD cho hãng: chuyển khoản phải thu sang hãng và đối soát khi shop nhận tiền? Đề xuất tách rõ hai mốc để không đòi khách lần nữa.
6. Vai trò ra mắt: chủ cửa hàng, quản lý, bán hàng, kho và kỹ thuật cần quyền gì? Ai được giảm giá, hủy, hoàn tiền, xem giá vốn và xuất dữ liệu?

Các phương án ở đây là đề xuất để chuẩn bị quyết định, chưa phải chính sách đã duyệt. Việc sửa cổng kỹ thuật và tái hiện lỗi không phụ thuộc câu trả lời cho toàn bộ nhóm này.

## 7. Quy tắc làm việc và bàn giao từng đợt

Một đầu việc có: quy tắc đã chốt → bài kiểm tra tái hiện → điểm phụ thuộc → thay đổi nhỏ → test tầng dữ liệu và màn hình → bằng chứng. Đi theo một sự kiện xuyên kho/tiền/nợ, tránh sửa SQL riêng từng trang.

Chủ cửa hàng xác nhận quy tắc thực tế và một số tình huống mẫu. Người triển khai chịu trách nhiệm chạy thử, ca lỗi/đồng thời/quyền, dữ liệu trước/sau và ảnh giao diện. Không yêu cầu chủ cửa hàng tự dò từng câu SQL hay kiểm lại toàn bộ hệ thống sau mỗi sửa.

Đợt 1 chưa sửa logic nghiệp vụ; đã thêm hồ sơ kiểm kê/bằng chứng và liên kết vào hai tài liệu chính. Các tệp mã nguồn ban đầu được kiểm tra checksum và không đổi. Những giới hạn còn lại: chưa audit sâu từng SQL của mọi route, chưa nghiệm thu UI, chưa xác minh cấu hình/dữ liệu trên bản triển khai thực tế, chưa kiểm tra MCP deploy dry-run.
