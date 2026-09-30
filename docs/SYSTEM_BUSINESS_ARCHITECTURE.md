# HỆ THỐNG KIẾN TRÚC NGHIỆP VỤ & MA TRẬN TRẠNG THÁI (KGAME - MINSHOP)

> **D16 — tiêu hủy hàng lỗi sau trả:** [Quy trình, kiểm thử và giới hạn](PHASE_1_WAVE_D16_COMPLETION.md). Ghi phiếu từng phần/serial, giữ lịch sử, không trừ tồn hoặc ghi chi phí lần nữa, không đổi tiền hoàn. Luồng sửa chữa hàng lỗi vẫn chưa thuộc phạm vi này; chưa triển khai.

> **D15 — quyền từng nhân viên:** [Phân quyền cá nhân, bảo vệ giá vốn và kiểm tra máy chủ](PHASE_1_WAVE_D15_COMPLETION.md). Chỉ chủ cấp quyền; 15 công tắc, thu hồi phiên khi thay đổi, chặn giá/giảm giá/nợ/số dư và sửa xuất kho đồng bộ. Đã đạt kiểm tra đầy đủ; chưa triển khai.

> **D14 — mật khẩu nhân viên:** [Đổi mật khẩu và thu hồi phiên](PHASE_1_WAVE_D14_COMPLETION.md). Nhân viên tự đổi mật khẩu; tài khoản mới/được đặt lại phải đổi trước khi dùng nghiệp vụ. Đã kiểm tra giao dịch, cạnh tranh, API và giao diện.

> **D13 — tài khoản và phân quyền:** [Tài khoản nhân viên bán hàng](PHASE_1_WAVE_D13_COMPLETION.md). Có vai trò chỉ xem/thu ngân, kiểm tra quyền tại máy chủ, thu hồi phiên và ghi đúng người lập đơn. Đã kiểm tra trên bản có bật đăng nhập; quyền chuyên sâu và phạm vi còn lại xem tài liệu.

> **D12 — việc còn chờ:** [Danh sách hoàn tiền và hàng trả](PHASE_1_WAVE_D12_COMPLETION.md). Đã gom khoản chờ hoàn hai chiều, hàng chờ kiểm tra và hàng lỗi giữ riêng; có lọc, phân trang và mở đúng chứng từ. Phạm vi còn lại và thứ tự tiếp theo xem tài liệu.

> **D11 — kiểm tra hàng trả:** [Nhập lại kho và giữ riêng hàng lỗi](PHASE_1_WAVE_D11_COMPLETION.md). Xử lý từng phần, lưu lịch sử kiểm tra, hoàn lại giá vốn đúng phần nhập kho. Các bước sửa chữa/tiêu hủy và giới hạn khác xem tài liệu.

> **D10 — khách trả hàng:** [Tiếp nhận, giảm nợ và hoàn tiền](PHASE_1_WAVE_D10_COMPLETION.md). Trả từng dòng, giảm nợ trước, giữ hóa đơn. Hàng nhận lại chờ kiểm tra; bước kiểm tra/đưa lại lên kệ còn tiếp tục.

> **D9 — hoàn tiền đơn chưa giao:** [Hủy và hoàn tiền khách](PHASE_1_WAVE_D9_COMPLETION.md). Giữ thu gốc, chờ hoàn và ghi chi tại đơn; tách tiền mặt/số dư. Phiếu khách trả hàng đã giao còn tiếp tục.

> **D8 — báo cáo và công nợ:** [Phạm vi sửa báo cáo POS](PHASE_1_WAVE_D8_COMPLETION.md). Bỏ giá vốn giả định; tách tiền NCC chờ hoàn. Báo cáo còn tạm tính, xem giới hạn và việc tiếp theo trong tài liệu.

> **D7 — trả hàng đã nhập:** [Nghiệm thu trả NCC](PHASE_1_WAVE_D7_COMPLETION.md). Xuất trả theo dòng/serial, giữ phiếu gốc, giảm nợ trước và theo dõi nhận hoàn. Đã kiểm tra lỗi cuối, cạnh tranh và giao diện; xem giới hạn phiếu cũ/báo cáo trong tài liệu.

> **D6 — giá vốn và tiền trả dư:** [Nghiệm thu nhập hàng](PHASE_1_WAVE_D6_COMPLETION.md). Phân bổ giá vốn chính xác; giữ tiền chi gốc, nhận hoàn từng phần, theo dõi khoản còn chờ. Đã kiểm tra tạo–sửa–nhận–hủy–hoàn; trả hàng đã nhập và các giới hạn khác xem báo cáo.

> **Bước D5:** [Tạo nhập đồng bộ](PHASE_1_WAVE_D5_COMPLETION.md). Tạo trực tiếp/nháp cùng kho–quỹ–nợ trong một giao dịch, có chống gửi lại. Giá vốn và khoản trả dư chưa hoàn thiện; xem giới hạn trong báo cáo.

> **Bước D4:** [Bảo vệ sửa phiếu nhập](PHASE_1_WAVE_D4_COMPLETION.md). Sửa nháp nguyên tử, giữ tiền thực trả và kho lịch sử; biểu mẫu sửa không còn tạo mới. Tạo phiếu và xử lý khoản dư còn tiếp tục.

> **Bước D3 đã nghiệm thu:** [Hoàn tất phiếu đặt nhập](PHASE_1_WAVE_D3_COMPLETION.md). Kho, serial, thanh toán và công nợ cùng thành công hoặc cùng hoàn tác; đã thử giao diện trả một phần. Tạo/sửa phiếu và giá vốn vẫn cần hoàn thiện.

> **Bước D2:** [Kiểm tra dữ liệu trước ghi nhập hàng](PHASE_1_WAVE_D2_COMPLETION.md). Đã chặn đầu vào sai; chưa hoàn tất chuyển luồng nhập hàng sang giao dịch nguyên tử.

> **Bước D1 đã kiểm tra:** [Hủy đặt nhập và nhận tiền NCC hoàn lại](PHASE_1_WAVE_D1_COMPLETION.md). Chưa nghiệm thu tạo/sửa/hoàn tất nhập hàng hoặc trả hàng; xem phạm vi còn lại trong báo cáo.

> **Quy tắc mới đã chốt:** [Hủy, trả hàng và hoàn tiền](CANCELLATION_RETURN_AND_REFUND_CONTRACT.md). Hoàn tiền tại chứng từ gốc, tự tạo phiếu tiền sau xác nhận thực tế; số dư là lựa chọn. Thiết kế này thay hướng dẫn cũ tự hủy phiếu thu/chi và mặc định chuyển số dư.

> **Rà soát bước D:** [5 lỗi nhập hàng đã kiểm chứng trước sửa](PHASE_1_WAVE_D_PURCHASE_BASELINE.md). Chưa nghiệm thu bước D; quy tắc hoàn tiền đã chốt trong thiết kế mới.

> **Cập nhật bước C:** [Thu/trả nợ và sổ quỹ](PHASE_1_WAVE_C_COMPLETION.md) · [Quy tắc thanh toán công nợ](DEBT_AND_CASHBOOK_OPERATION_CONTRACT.md). Đã chặn thu sai khách, thu vượt và ghi dở nhóm chứng từ; dữ liệu trùng có chủ ý được giữ riêng.

> **Cập nhật bước B:** [Kho, thanh toán và số dư khách](PHASE_1_WAVE_B_COMPLETION.md) · [Quy tắc ghi nhận POS](POS_ATOMIC_OPERATION_CONTRACT.md). Kết quả bước B thay thế trạng thái các ca B01–B08 ở báo cáo mốc cũ. Bước A: [Khôi phục bộ kiểm tra](PHASE_1_WAVE_A_COMPLETION.md).

> **Kết quả kiểm chứng mới — Đợt 1:** [Hiện trạng và kế hoạch nghiệm thu](PHASE_1_BASELINE_AND_ACCEPTANCE_PLAN.md) · [Ma trận chức năng](SYSTEM_FUNCTION_INVENTORY.md). Phạm vi đã chốt: một cửa hàng, một kho; dữ liệu thử; chặn xuất bán thiếu tồn. Các mâu thuẫn nghiệp vụ trong hồ sơ này được liệt kê ở báo cáo đợt 1, chưa được coi là quy tắc đã nghiệm thu.
> **Tài liệu đặc tả chuẩn nghiệp vụ bán lẻ - Dành cho Lập trình viên & AI Model kế thừa**  
> *Phiên bản: 2.0 | Cập nhật: 13/09/2026*  
> 👉 **Xem cẩm nang bàn giao & rà soát toàn diện:** [`MASTER_AUDIT_AND_SYSTEM_HANDOVER.md`](file://<PROJECT_ROOT>/docs/MASTER_AUDIT_AND_SYSTEM_HANDOVER.md)

---

## 1. TỔNG QUAN HỆ THỐNG & MIỀN NGHIỆP VỤ (DOMAIN OVERVIEW)
**Kgame - Minshop** là hệ thống quản lý bán lẻ chuyên sâu cho chuỗi cửa hàng máy chơi game (Nintendo Switch, PS4/PS5, Steam Deck...), phụ kiện, dịch vụ thu mua và sửa chữa kỹ thuật.

### Các đặc thù sống còn của ngành hàng game:
1. **Quản lý Serial / IMEI từng chiếc máy:** Máy chơi game quản lý theo từng số Serial (`product_units`), phân tách trạng thái Mới (`NEW`) và Đã qua sử dụng (`QSD`). Phụ kiện/đĩa game quản lý theo số lượng (`quantity`).
2. **Khách hàng thân thiết & Đặt hàng trước (Pre-order):** Máy game hoặc game mới thường đặt cọc trước (Pre-order). Khi hàng về, xuất bán giao hàng, cấn trừ cọc và cho phép **nợ lại phần còn lại**.
3. **Thu mua máy cũ & Nhập hàng từ NCC:** Nhập sỉ từ nhà phân phối hoặc thu mua máy cũ từ khách lẻ/đối tác. Thường phát sinh nợ NCC cần trả dần.
4. **Dịch vụ sửa chữa phần cứng:** Tiếp nhận máy lỗi $\rightarrow$ Kỹ thuật kiểm tra $\rightarrow$ Báo giá $\rightarrow$ Sửa chữa $\rightarrow$ Trả máy và thu tiền dịch vụ.
5. **Sổ quỹ & Dòng tiền thực tế:** Mọi biến động tiền mặt / chuyển khoản ngân hàng phải được ghi nhận chính xác theo thời gian thực. **Tuyệt đối không tạo giao dịch ảo/khống khi hủy đơn.**

---

## 2. MA TRẬN THỰC THỂ DỮ LIỆU CỐT LÕI (CORE ENTITIES & RELATIONS)

| Bảng dữ liệu | Mục đích | Ràng buộc nghiệp vụ quan trọng |
| :--- | :--- | :--- |
| `products` | Danh mục sản phẩm cha | Quản lý giá bán, giá vốn (Mới / Cũ), tồn kho tổng (`stock_new`, `stock_used`). |
| `product_units` | Từng chiếc máy cụ thể theo Serial | Trạng thái `availability`: `IN_STOCK`, `HOLD`, `SOLD`, `DEFECTIVE`. Gắn với vòng đời thẻ kho. |
| `orders` | Đơn bán hàng & Đặt hàng | `order_type`: `'ORDER'` (Bán hàng) \| `'PREORDER'` (Đặt hàng).<br>`order_status`: `'PENDING'`, `'PROCESSING'`, `'COMPLETED'`, `'CANCELLED'`.<br>`payment_status`: `'UNPAID'`, `'PARTIAL'`, `'PAID'`.<br>`paid_amount_cents`, `cod_amount_cents` (tiền nợ lại). |
| `order_lines` | Chi tiết sản phẩm trong đơn | Số lượng, đơn giá, giá vốn, tình trạng (`NEW` / `QSD`). |
| `purchase_receipts` | Phiếu nhập hàng từ NCC | `receipt_status`: `'DRAFT'`, `'COMPLETED'`, `'CANCELLED'`.<br>`total_amount_cents`, `paid_amount_cents`, `debt_amount_cents`. |
| `cash_transactions` | Sổ quỹ Thu - Chi | `flow_type`: `'IN'` (Thu) \| `'OUT'` (Chi).<br>`status`: `'ACTIVE'` \| `'CANCELLED'`.<br>`reference_type`: `'ORDER'`, `'purchase_receipt'`, `'repair_ticket'`, v.v.<br>`reference_id`: ID của chứng từ gốc phát sinh tiền. |
| `inventory_transactions` | Sổ thẻ kho (Nhập / Xuất) | Ghi nhận số lượng tăng (+), giảm (-), loại giao dịch (`SALE`, `PURCHASE`, `ADJUSTMENT`, `RETURN`). |
| `partners` | Danh bạ Đối tác thống nhất | Cờ phân loại: `is_customer = 1`, `is_supplier = 1`. Quản lý riêng 2 tài khoản nợ:<br>- `receivable_debt_cents`: Nợ cần thu từ khách.<br>- `payable_debt_cents`: Nợ cần trả cho NCC. |
| `repair_tickets` | Phiếu tiếp nhận sửa chữa | `ticket_code`, `customer_id`, `repair_cost_cents` (giá vốn linh kiện), `repair_price_cents` (giá thu khách), `status`. |

---

## 3. MA TRẬN 7 NGHIỆP VỤ & CHUYỂN DỊCH TRẠNG THÁI (STATE MACHINE)

### 📌 Nghiệp vụ 1: Bán hàng trực tiếp / Giao hàng (POS Sales)
- **Tạo đơn & Thanh toán đủ:**
  - `orders`: Tạo với `order_type = 'ORDER'`, `order_status = 'COMPLETED'`, `payment_status = 'PAID'`.
  - `cash_transactions`: Sinh phiếu thu `'IN'` (danh mục `'ORDER_PAYMENT'`, gắn `reference_id = order.id`).
  - `inventory_transactions`: Trừ tồn kho sản phẩm, đánh dấu Serial `SOLD`.
- **Bán hàng có NỢ LẠI (Khách nợ COD hoặc nợ ghi sổ):**
  - **Bắt buộc:** Phải gắn Khách hàng (`customer_id != null`), không cho phép khách ẩn danh nợ tiền.
  - `orders`: `paid_amount_cents = Số tiền khách trả`, `cod_amount_cents = Tổng tiền - Đã trả`, `payment_status = 'PARTIAL'`.
  - `cash_transactions`: Chỉ sinh phiếu thu cho phần tiền thực thu hôm nay.
  - `partners`: Nợ cần thu (`receivable_debt_cents`) của khách tăng thêm đúng bằng `cod_amount_cents`.

---

### 📌 Nghiệp vụ 2: Đặt hàng trước (Pre-order) & Vòng đời chuyển đổi
1. **Khách đặt cọc:**
   - `orders`: Tạo với `order_type = 'PREORDER'`, `order_status = 'PENDING'`, `paid_amount_cents = Tiền cọc`.
   - `inventory_transactions`: **CHƯA trừ kho** (nếu chọn đích danh Serial thì giữ chỗ `HOLD`, kho chưa xuất).
   - `cash_transactions`: Sinh phiếu thu tiền cọc (`category = 'ORDER_PAYMENT'`).
2. **Xuất bán giao máy (Fulfill Pre-order):**
   - Chuyển hẳn thành Đơn bán hàng: `order_type = 'ORDER'`, `order_status = 'COMPLETED'`.
   - Khách trả thêm tiền đợt 2: `paid_amount_cents = Cọc + Trả thêm`.
   - `inventory_transactions`: Xuất kho trừ tồn hàng loạt, Serial chuyển thành `SOLD`.
   - `cash_transactions`: Sinh phiếu thu đợt 2 cho phần tiền trả thêm.
   - **Nếu khách vẫn NỢ LẠI:** `cod_amount_cents = Tổng tiền - (Cọc + Trả thêm)`, `payment_status = 'PARTIAL'`. Khoản nợ này nổi ngay trên hồ sơ khách hàng.

---

### 📌 Nghiệp vụ 3: Nhập hàng Nhà Cung Cấp (Purchase Receipts)
1. **Hoàn tất phiếu nhập:**
   - `purchase_receipts`: `receipt_status = 'COMPLETED'`.
   - `inventory_transactions`: Cộng tồn kho Mới/Cũ, nạp danh sách Serial vào kho với trạng thái `IN_STOCK`.
   - `cash_transactions`: Nếu có trả trước tiền hàng $\rightarrow$ Sinh phiếu chi `'OUT'` (`reference_type = 'purchase_receipt'`, `reference_id = receipt.id`).
   - `debt_amount_cents = Tổng tiền hàng - Tiền đã trả`. Khoản nợ này ghi vào `payable_debt_cents` của NCC.
2. **Hủy phiếu nhập:**
   - `purchase_receipts`: Chuyển sang `'CANCELLED'`, nợ phiếu tự động về 0.
   - `inventory_transactions`: Trừ trả lại lượng hàng đã nhập.
   - Giữ phiếu chi thực tế. Khoản đã trả ghi Chờ hoàn tiền hoặc ứng trước theo lựa chọn; xác nhận nhận tiền thật mới tự lập phiếu thu liên kết. Phiếu đã nhận hàng dùng trả hàng nhập, theo thiết kế hoàn tiền mới.

---

### 📌 Nghiệp vụ 4: Thanh toán & Thu hồi nợ (Debt Settlement)
> **NGUYÊN TẮC VÀNG:** Tiền thanh toán nợ PHẢI GẮN CHẶT với từng chứng từ gốc (`purchase_receipts` hoặc `orders`). Tuyệt đối không sinh phiếu thu/chi trôi nổi không gắn chứng từ.

- **Trả nợ Nhà Cung Cấp:**
  - Cập nhật đúng phiếu nhập: `paid_amount_cents += số tiền trả`, `debt_amount_cents -= số tiền trả`.
  - Sinh phiếu chi `'OUT'`, `category = 'PURCHASE'`, `reference_type = 'purchase_receipt'`, `reference_id = receipt.id`.
- **Thu nợ Khách Hàng:**
  - Cập nhật đúng đơn bán: `paid_amount_cents += số tiền thu`, `cod_amount_cents -= số tiền thu`. Khi hết nợ chuyển `payment_status = 'PAID'`.
  - Sinh phiếu thu `'IN'`, `category = 'ORDER_PAYMENT'`, `reference_type = 'ORDER'`, `reference_id = order.id`.

---

### 📌 Nghiệp vụ 5: Hủy, trả hàng và hoàn tiền
- Chưa giao: hủy đơn, giải phóng giữ chỗ, bỏ nghĩa vụ chưa thanh toán; giữ phiếu thu thật. Xử lý Chờ hoàn tiền, Hoàn tiền hoặc Giữ số dư ngay tại đơn.
- Đã giao: tạo phiếu trả hàng liên kết hóa đơn, giảm nợ trước và xử lý phần tiền phải hoàn. Không hủy hóa đơn để xóa lịch sử bán.
- Chỉ nhận hàng đủ điều kiện mới đưa lại vào tồn sẵn bán; hàng lỗi/key đã giao cần xử lý riêng.
- Quy tắc chi tiết và trạng thái: [CANCELLATION_RETURN_AND_REFUND_CONTRACT.md](CANCELLATION_RETURN_AND_REFUND_CONTRACT.md).

---

### 📌 Nghiệp vụ 6: Dịch vụ Sửa chữa (Repair Tickets)
- `repair_tickets` theo dõi từ khi nhận máy $\rightarrow$ sửa $\rightarrow$ bàn giao.
- Khi khách nhận máy và trả phí sửa:
  - Sinh phiếu thu `'IN'`, `category = 'REPAIR_FEE'`, `reference_type = 'repair_ticket'`, `reference_id = ticket.id`.
- Trong hồ sơ Đối tác: Khách hàng hiện lịch sử sửa chữa và chi phí; Nhà Cung Cấp **tuyệt đối không hiện phiếu sửa**.

---

### 📌 Nghiệp vụ 7: Báo cáo Doanh Thu, Sổ Quỹ & Lợi Nhuận
- Mọi câu lệnh SQL trong báo cáo **bắt buộc phải có điều kiện loại trừ hủy**:
  - Đơn hàng: `WHERE order_status != 'CANCELLED'`
  - Phiếu nhập: `WHERE receipt_status != 'CANCELLED'`
  - Sổ quỹ: `WHERE status = 'ACTIVE' OR status IS NULL` (không tính các phiếu đã hủy)
- Tính năng Drilldown: Bấm vào từng ngày / từng nhân viên phải sổ ra danh sách chi tiết các đơn cấu thành con số đó.

---

## 4. BỘ BẤT BIẾN KẾ TOÁN (ACCOUNTING INVARIANTS - KIỂM SOÁT LỖI TỰ ĐỘNG)

Một hệ thống chuẩn không được phép vi phạm 4 bất biến sau:
1. **Bất biến Nợ Khách:**
   $$\sum \text{receivable\_debt của Khách} \equiv \sum_{\text{đơn chưa hủy}} (\text{amount\_total} - \text{paid\_amount})$$
2. **Bất biến Nợ NCC:**
   $$\sum \text{payable\_debt của NCC} \equiv \sum_{\text{phiếu nhập chưa hủy}} (\text{total\_amount} - \text{paid\_amount})$$
3. **Bất biến Sổ Quỹ:**
   $$\text{Tồn quỹ hiện tại} \equiv \text{Số dư ban đầu} + \sum \text{Thu ACTIVE} - \sum \text{Chi ACTIVE}$$
4. **Bất biến Tồn Kho:**
   $$\text{Tồn kho thực tế} \equiv \text{Tổng Nhập} - \text{Tổng Bán} + \text{Tổng Hoàn}$$

---

## 5. CÁC BẪY NGHIỆP VỤ ĐÃ BỊ LOẠI BỎ (POST-MORTEM & LESSONS LEARNED)
1. **Giữ dòng tiền thật:** Không tự hủy phiếu thu/chi đã phát sinh hoặc tự sinh hoàn tiền chỉ vì hủy đơn. Xác nhận hoàn tiền thật mới lập phiếu đối ứng liên kết tại chứng từ nguồn.
2. **Fulfill Pre-order phải chuyển `order_type = 'ORDER'`:** Đơn đặt hàng khi đã xuất kho giao cho khách phải trở thành đơn bán hàng hoàn tất, không để lơ lửng làm ẩn các nút thu nợ tiếp theo.
3. **Bắt buộc có Khách hàng khi Ghi nợ:** Không cho phép tạo đơn nợ lại với `customer_id = null`.
4. **Giao diện không dùng chữ mở ngoặc giải thích:** Gọt sạch các nhãn mở ngoặc `(...)` rườm rà (ví dụ: `(Bán hàng)`, `(3 cấp)`), giữ giao diện tinh gọn, sắc sảo.
