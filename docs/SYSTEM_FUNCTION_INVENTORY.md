# Ma trận chức năng và cấu trúc hiện trạng — Đợt 1

Ngày: 13/09/2026. Phạm vi ra mắt đã chốt: một cửa hàng, một kho. Dữ liệu hiện tại đều là dữ liệu thử.

Kiểm kê được 124 tệp route: 41 API và 83 tệp trang/endpoint ngoài API. Trong đó có 56 tệp thuộc quản trị. Đây là số tệp route, không phải số nghiệp vụ đã hoàn thành.

Có tệp hoặc có menu không chứng minh chức năng hoạt động đúng. Các dòng “chưa xác minh” cần kiểm thử runtime/UI; kết quả nền storefront không tự áp dụng cho Kgame.

## Toàn bộ route

| Tệp | Nhóm | Phương thức API | Trạng thái và bằng chứng |
|---|---|---|---|
| `src/pages/404.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/account/index.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/account/login.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/account/logout.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/account/verify.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/brands/index.astro` | Thương hiệu | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/buybacks/[id]/print.astro` | Thu mua | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/buybacks/[id].astro` | Thu mua | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/buybacks/index.astro` | Thu mua | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn; 1 lỗi chẩn đoán |
| `src/pages/admin/buybacks/new.astro` | Thu mua | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn; 15 lỗi chẩn đoán |
| `src/pages/admin/cash/index.astro` | Sổ quỹ | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/categories/[id]/edit.astro` | Nhóm hàng | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/categories/index.astro` | Nhóm hàng | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/categories/new.astro` | Nhóm hàng | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/customers/[email].astro` | Khách hàng/đối tác | — | CẦN SỬA — customers/partners cùng được dùng |
| `src/pages/admin/customers/index.astro` | Khách hàng/đối tác | — | CẦN SỬA — customers/partners cùng được dùng |
| `src/pages/admin/delivery-partners/index.astro` | Đối tác giao hàng | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/delivery-reconciliations/index.astro` | Đối soát COD | — | CẦN SỬA — thiếu guard đối soát qua rà mã |
| `src/pages/admin/index.astro` | index | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/inventory/index.astro` | Kho | — | CHƯA XÁC MINH — tồn bị ảnh hưởng B01/B03/B07 |
| `src/pages/admin/inventory/outbound/new.astro` | Kho | — | CHƯA XÁC MINH — tồn bị ảnh hưởng B01/B03/B07 |
| `src/pages/admin/login.astro` | login | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/logout.astro` | logout | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/media/index.astro` | Hình ảnh | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/navigation.astro` | navigation | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/orders/[id]/print.astro` | Đơn hàng | — | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/admin/orders/[id].astro` | Đơn hàng | — | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/admin/orders/[id].legacy.astro` | Đơn hàng | — | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/admin/orders/export.csv.ts` | Đơn hàng | GET | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/admin/orders/index.astro` | Đơn hàng | — | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/admin/orders/new.astro` | Đơn hàng | — | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/admin/pages/[id]/edit.astro` | Trang nội dung | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/pages/index.astro` | Trang nội dung | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/pages/new.astro` | Trang nội dung | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/production/index.astro` | Lắp ráp | — | CẦN SỬA — giá vốn 60% và cập nhật tồn đã đối chiếu tĩnh |
| `src/pages/admin/production/new.astro` | Lắp ráp | — | CẦN SỬA — giá vốn 60% và cập nhật tồn đã đối chiếu tĩnh; 1 lỗi chẩn đoán |
| `src/pages/admin/products/[id]/edit.astro` | Hàng hóa | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/products/index.astro` | Hàng hóa | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn; 5 lỗi chẩn đoán |
| `src/pages/admin/products/new.astro` | Hàng hóa | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/purchases/[id]/print.astro` | Nhập hàng | — | CHƯA XÁC MINH — hủy và sửa cần kiểm thử đầy đủ |
| `src/pages/admin/purchases/[id].astro` | Nhập hàng | — | CHƯA XÁC MINH — hủy và sửa cần kiểm thử đầy đủ |
| `src/pages/admin/purchases/index.astro` | Nhập hàng | — | CHƯA XÁC MINH — hủy và sửa cần kiểm thử đầy đủ; 2 lỗi chẩn đoán |
| `src/pages/admin/purchases/new.astro` | Nhập hàng | — | CHƯA XÁC MINH — hủy và sửa cần kiểm thử đầy đủ; 6 lỗi chẩn đoán |
| `src/pages/admin/repairs/[id]/index.astro` | Sửa chữa | — | LỖI — B07; giao diện còn phải thử |
| `src/pages/admin/repairs/[id]/print.astro` | Sửa chữa | — | LỖI — B07; giao diện còn phải thử |
| `src/pages/admin/repairs/index.astro` | Sửa chữa | — | LỖI — B07; giao diện còn phải thử |
| `src/pages/admin/repairs/new.astro` | Sửa chữa | — | LỖI — B07; giao diện còn phải thử |
| `src/pages/admin/reports/customers.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/reports/daily.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/reports/financial.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/reports/index.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/reports/orders.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/reports/products.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/reports/sales.astro` | Báo cáo | — | CẦN SỬA — SQL và số ước lượng đã đối chiếu tĩnh |
| `src/pages/admin/sale.astro` | sale | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/settings.astro` | settings | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/setup.astro` | setup | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/shipments/index.astro` | Vận đơn | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/shipping.astro` | shipping | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/suppliers/index.astro` | suppliers | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/admin/units/lookup.astro` | Serial | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn; 1 lỗi chẩn đoán |
| `src/pages/api/admin/brands.ts` | Thương hiệu | GET, POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/buybacks.ts` | Thu mua | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/cash.ts` | Sổ quỹ | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/categories/[id].ts` | Nhóm hàng | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/categories.ts` | Nhóm hàng | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/customers.ts` | Khách hàng/đối tác | GET, POST | CẦN SỬA — customers/partners cùng được dùng |
| `src/pages/api/admin/delivery-partners.ts` | Đối tác giao hàng | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/delivery-reconciliations.ts` | Đối soát COD | POST | CẦN SỬA — thiếu guard đối soát qua rà mã; 2 lỗi chẩn đoán |
| `src/pages/api/admin/email/test.ts` | Email | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/geo.ts` | geo | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/inventory/outbound.ts` | Kho | POST | CHƯA XÁC MINH — tồn bị ảnh hưởng B01/B03/B07; 1 lỗi chẩn đoán |
| `src/pages/api/admin/media/[id].ts` | Hình ảnh | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/media.ts` | Hình ảnh | GET, POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/navigation.ts` | navigation | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/orders/[id].ts` | Đơn hàng | POST | LỖI — B01–B06; giao diện/API còn phải thử |
| `src/pages/api/admin/orders.ts` | Đơn hàng | POST | LỖI — B01–B06; giao diện/API còn phải thử; 1 lỗi chẩn đoán |
| `src/pages/api/admin/pages/[id].ts` | Trang nội dung | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/pages/preview.ts` | Trang nội dung | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/pages.ts` | Trang nội dung | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/partners/pay-debt.ts` | Đối tác | POST | CẦN SỬA — thu nợ thiếu guard qua rà mã |
| `src/pages/api/admin/partners.ts` | Đối tác | GET, POST | CẦN SỬA — thu nợ thiếu guard qua rà mã |
| `src/pages/api/admin/production.ts` | Lắp ráp | POST | CẦN SỬA — giá vốn 60% và cập nhật tồn đã đối chiếu tĩnh |
| `src/pages/api/admin/products/[id]/images.ts` | Hàng hóa | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/products/[id].ts` | Hàng hóa | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/products.ts` | Hàng hóa | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn; 1 lỗi chẩn đoán |
| `src/pages/api/admin/purchases.ts` | Nhập hàng | POST | CHƯA XÁC MINH — hủy và sửa cần kiểm thử đầy đủ; 3 lỗi chẩn đoán |
| `src/pages/api/admin/quick-product.ts` | quick-product | GET, POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/refunds.ts` | refunds | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/repairs/[id].ts` | Sửa chữa | POST | LỖI — B07; giao diện còn phải thử |
| `src/pages/api/admin/repairs.ts` | Sửa chữa | POST | LỖI — B07; giao diện còn phải thử |
| `src/pages/api/admin/search/reindex.ts` | Tìm kiếm | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/shipments.ts` | Vận đơn | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/admin/suppliers.ts` | suppliers | GET, POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/cart.ts` | storefront | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/checkout.ts` | storefront | GET, POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/health.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/internal/cache-purge.ts` | storefront | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/products/[slug].ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/products/index.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/webhook/[provider].ts` | storefront | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/api/webhook.ts` | storefront | POST | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/cart.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/categories/[slug].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/category/[slug].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/checkout.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/express.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/images/[...key].ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/index.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/llms.txt.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/order/[token]/download/[itemPublicId].ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/order/[token]/status.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/order/[token].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/pages/[slug].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/partials/cart-count.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/partials/cart.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/pay/[publicId].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/payment-setup.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/product/[slug].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/products/[slug].astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/products/index.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/robots.txt.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/search.astro` | storefront | — | CHƯA XÁC MINH — mới kiểm kê mã nguồn |
| `src/pages/sitemap.xml.ts` | storefront | GET | CHƯA XÁC MINH — mới kiểm kê mã nguồn |

## Chức năng cần có nhưng chưa thấy đường triển khai hoàn chỉnh

| Chức năng | Bằng chứng hiện trạng | Cần nghiệm thu |
|---|---|---|
| Kiểm kho | Có stocktakes/stocktake_items; không thấy route kiểm kho trong kiểm kê | Phiếu nháp, đếm, chênh lệch, duyệt, thẻ kho và quyền |
| Trả hàng POS | Có cơ chế refunds của thanh toán nền; chưa thấy route/chứng từ trả từng dòng POS | Trả một phần/toàn bộ, hàng lỗi, Serial, nợ và hoàn tiền |
| Người dùng và phân quyền | Có admin session/Access; chưa thấy CRUD người dùng/vai trò hay guard quyền Kgame | Tài khoản riêng, quyền phía máy chủ, nhật ký actor từ phiên |
| Đồng bộ POS–web | Hai mô hình order_items/order_lines và product_variants/product_types | Cùng kho và thanh toán, mở đúng đơn, giao/hoàn đúng |

## Mô tả tài liệu khác cấu trúc tệp thực tế

- MASTER liệt kê cash/new.astro, customers/new.astro, customers/[id].astro, partners/ và settings/index.astro; các đường này không có trong kiểm kê hiện tại. Thực tế có cash/index.astro, customers/[email].astro và settings.astro; API partners có nhưng chưa có thư mục trang partners.
- Có thêm thu mua, vận đơn, đối tác giao hàng và đối soát COD mà bản đồ MASTER chưa liệt kê đầy đủ.
- orders/[id].legacy.astro nằm trong thư mục pages nên có thể trở thành route; cần xác minh việc giữ màn hình cũ và các liên kết public_id.

## Cấu trúc dữ liệu sau 56 migration

Danh sách bảng được dựng từ toàn bộ migration trên SQLite sạch, gồm cả bảng nội bộ của FTS. Thông tin cột chi tiết ở audit/phase-1/schema.json. Không đọc DB hiện hữu.

| Bảng | Cột |
|---|---|
| `activity_logs` | `id`, `user_id`, `action`, `entity_type`, `entity_id`, `reason`, `created_at` |
| `attachments` | `id`, `entity_type`, `entity_id`, `event_type`, `r2_key`, `is_internal`, `uploaded_by`, `created_at` |
| `brands` | `id`, `name`, `description`, `created_at`, `updated_at` |
| `buyback_items` | `id`, `buyback_id`, `product_id`, `product_type_id`, `product_unit_id`, `quantity`, `condition`, `condition_note`, `purchase_price_cents` |
| `buybacks` | `id`, `buyback_code`, `customer_id`, `total_amount_cents`, `status`, `note`, `created_by`, `created_at`, `payment_method`, `bank_account`, `paid_amount_cents`, `cash_transaction_id` |
| `cash_transactions` | `id`, `transaction_code`, `flow_type`, `category`, `amount_cents`, `reference_type`, `reference_id`, `note`, `created_by`, `created_at`, `account_type`, `bank_name`, `recipient_name`, `status` |
| `categories` | `id`, `name`, `slug`, `parent_id`, `created_at`, `public_id` |
| `checkout_reservations` | `public_id`, `items`, `payment_method`, `status`, `expires_at`, `created_at`, `terminal_at` |
| `customer_addresses` | `id`, `customer_id`, `label`, `address`, `is_default` |
| `customers` | `id`, `customer_code`, `name`, `phone`, `email`, `note`, `created_at`, `updated_at`, `address`, `province`, `ward`, `address_detail` |
| `delivery_partners` | `id`, `partner_code`, `name`, `partner_type`, `phone`, `address`, `contact_person`, `note`, `status`, `created_at`, `updated_at` |
| `delivery_reconciliations` | `id`, `reconciliation_code`, `partner_id`, `period_start`, `period_end`, `total_orders`, `total_cod_cents`, `total_fee_cents`, `net_amount_cents`, `status`, `cash_transaction_id`, `verified_at`, `verified_by`, `notes`, `created_at` |
| `inventory_transactions` | `id`, `product_id`, `product_type_id`, `product_unit_id`, `condition`, `quantity`, `transaction_type`, `reference_type`, `reference_id`, `unit_cost_cents`, `location_id`, `note`, `created_by`, `created_at` |
| `media` | `id`, `image_key`, `original_name`, `mime_type`, `size_bytes`, `created_at`, `width`, `height`, `public_id` |
| `menu_items` | `id`, `location`, `target_type`, `target_id`, `label`, `position`, `created_at`, `public_id` |
| `order_guest_access` | `order_public_id`, `access_token`, `generation`, `created_at`, `rotated_at`, `hidden_at` |
| `order_inventory_exceptions` | `id`, `public_id`, `order_id`, `product_id`, `variant_id`, `requested_qty`, `consumed_qty`, `shortfall_qty`, `resolved_at`, `created_at` |
| `order_item_ids` | `public_id`, `order_public_id`, `created_at` |
| `order_items` | `id`, `order_id`, `product_id`, `name`, `price_cents`, `quantity`, `variant_id`, `public_id`, `file_key`, `file_name`, `file_mime`, `file_size_bytes`, `downloads` |
| `order_lines` | `id`, `order_id`, `product_id`, `product_type_id`, `product_name_snapshot`, `type_name_snapshot`, `condition`, `quantity`, `unit_price_cents`, `discount_cents`, `line_total_cents` |
| `order_notifications` | `order_id`, `kind`, `state`, `attempts`, `lease_expires_at`, `last_error`, `created_at`, `sent_at` |
| `order_reference_aliases` | `reference`, `order_public_id` |
| `order_units` | `id`, `order_line_id`, `product_unit_id` |
| `orders` | `id`, `provider_session_id`, `email`, `amount_total_cents`, `currency`, `status`, `created_at`, `public_id`, `discount_cents`, `tax_cents`, `fulfillment_status`, `tracking_carrier`, `tracking_number`, `fulfilled_at`, `shipping_cents`, `ship_address`, `payment_method`, `settlement_token`, `provider_payment_id`, `provider_refunded_cents`, `external_refunded_cents`, `refund_review_reason`, `refund_reviewed_at`, `refund_reviewed_by`, `shipping_label`, `shipping_weight_grams`, `label_url`, `delivery_method`, `order_code`, `customer_id`, `order_type`, `order_status`, `payment_status`, `paid_amount_cents`, `cod_amount_cents`, `note`, `updated_at`, `created_by` |
| `page_media` | `page_id`, `media_id` |
| `pages` | `id`, `title`, `slug`, `body_markdown`, `published`, `created_at`, `updated_at`, `layout`, `public_id` |
| `partners` | `id`, `partner_code`, `name`, `phone`, `email`, `tax_code`, `province`, `ward`, `address_detail`, `address`, `note`, `is_customer`, `is_supplier`, `created_at`, `updated_at` |
| `payments` | `id`, `order_id`, `amount_cents`, `payment_method`, `payment_type`, `reference_code`, `status`, `note`, `created_by`, `created_at` |
| `pending_payments` | `id`, `public_id`, `payment_hash`, `backend`, `bolt11`, `amount_sat`, `amount_total_cents`, `currency`, `email`, `items`, `status`, `expires_at`, `created_at`, `shipping_cents`, `ship_address`, `reservation_id`, `shipping_label`, `shipping_weight_grams`, `delivery_method` |
| `product_categories` | `product_id`, `category_id` |
| `product_extras` | `id`, `product_id`, `label`, `price_delta_cents`, `position`, `active`, `public_id` |
| `product_images` | `id`, `product_id`, `image_key`, `position`, `alt`, `public_id` |
| `product_types` | `id`, `product_id`, `name`, `code`, `tracking_mode`, `sale_price_cents`, `cost_price_cents`, `market_price_cents`, `floor_price_cents`, `cached_stock_new`, `cached_stock_used`, `is_active`, `sort_order`, `created_at`, `updated_at` |
| `product_units` | `id`, `product_type_id`, `program_code`, `condition`, `availability`, `owner_type`, `owner_id`, `expiry_days`, `expiry_date`, `production_date`, `cost_price_cents`, `target_sale_price_cents`, `location_id`, `note`, `created_at`, `updated_at`, `is_self_produced`, `manufacturer_name`, `supplier_name` |
| `product_variants` | `id`, `product_id`, `label`, `price_cents`, `stock`, `sku`, `position`, `active`, `image_id`, `weight_grams`, `public_id` |
| `production_config_items` | `id`, `config_id`, `input_product_id`, `input_product_type_id`, `quantity`, `is_default` |
| `production_configs` | `id`, `name`, `output_product_id`, `output_product_type_id`, `is_active`, `created_at` |
| `production_inputs` | `id`, `production_order_id`, `product_id`, `product_type_id`, `product_unit_id`, `quantity`, `unit_cost_cents` |
| `production_orders` | `id`, `production_code`, `output_product_id`, `output_product_type_id`, `quantity`, `status`, `created_by`, `created_at`, `completed_at` |
| `production_outputs` | `id`, `production_order_id`, `product_unit_id`, `quantity`, `unit_cost_cents`, `expiry_days`, `expiry_date` |
| `products` | `id`, `name`, `description`, `price_cents`, `currency`, `image_key`, `stock`, `active`, `created_at`, `slug`, `variant_label`, `related_ids`, `weight_grams`, `requires_shipping`, `public_id`, `file_key`, `file_name`, `file_mime`, `file_size_bytes`, `product_code`, `category_id`, `tracking_mode`, `production_enabled`, `expiry_enabled`, `note`, `default_manufacturer`, `price_used_cents`, `cost_price_cents`, `cost_price_used_cents`, `stock_new`, `stock_used`, `has_serial`, `brand`, `unit_name`, `brand_id`, `barcode`, `invoice_note`, `warranty_info`, `warranty_period_months` |
| `products_fts` | `name`, `description` |
| `products_fts_config` | `k`, `v` |
| `products_fts_data` | `id`, `block` |
| `products_fts_docsize` | `id`, `sz` |
| `products_fts_idx` | `segid`, `term`, `pgno` |
| `purchase_expense_categories` | `id`, `name`, `category_type`, `is_default`, `created_at` |
| `purchase_items` | `id`, `receipt_code_id`, `product_id`, `product_type_id`, `product_unit_id`, `condition`, `quantity`, `unit_cost_cents`, `program_code`, `discount_cents`, `item_note`, `allocated_fee_cents`, `final_cost_cents` |
| `purchase_receipts` | `id`, `receipt_code`, `supplier_id`, `total_amount_cents`, `note`, `created_by`, `created_at`, `receipt_status`, `paid_amount_cents`, `debt_amount_cents`, `discount_cents`, `extra_fee_cents`, `payment_method`, `bank_name`, `cash_transaction_id`, `other_fee_cents`, `other_fee_note`, `other_fee_cash_id`, `invoice_number`, `order_receipt_code`, `completed_at`, `extra_fee_category`, `other_fee_category` |
| `refund_sync_events` | `provider_event_id`, `provider`, `provider_payment_id`, `provider_charge_id`, `cumulative_refunded_cents`, `currency`, `status`, `attempts`, `last_error`, `created_at`, `processed_at` |
| `refunds` | `id`, `public_id`, `order_id`, `kind`, `status`, `amount_cents`, `provider`, `provider_refund_id`, `provider_event_id`, `reason`, `note`, `created_by`, `idempotency_key`, `reverses_refund_id`, `created_at`, `updated_at` |
| `repair_events` | `id`, `repair_ticket_id`, `event_type`, `note`, `created_by`, `created_at` |
| `repair_items` | `id`, `repair_ticket_id`, `product_id`, `product_type_id`, `quantity`, `unit_cost_cents` |
| `repair_tickets` | `id`, `ticket_code`, `owner_type`, `customer_id`, `product_id`, `product_type_id`, `product_unit_id`, `unidentified_product_name`, `problem_reported`, `accessories_received`, `diagnosis`, `repair_location`, `external_partner`, `status`, `repair_cost_cents`, `repair_price_cents`, `received_at`, `expected_return_at`, `returned_at`, `assigned_to`, `note`, `created_at`, `updated_at`, `sent_partner_at`, `expected_receive_at`, `actual_received_at`, `partner_cost_cents`, `is_key_serviced`, `new_expiry_date` |
| `reservations` | `id`, `order_id`, `product_type_id`, `product_unit_id`, `quantity`, `status`, `created_at`, `released_at` |
| `settings` | `key`, `value`, `updated_at` |
| `shipments` | `id`, `order_id`, `carrier`, `tracking_code`, `cod_amount_cents`, `bus_station`, `bus_plate`, `sender_name`, `sender_phone`, `sender_address`, `receiver_name`, `receiver_phone`, `receiver_address`, `shipping_fee_cents`, `status`, `created_at`, `updated_at`, `delivery_partner_id`, `shipping_payer`, `weight_grams`, `dimensions`, `reconciliation_id`, `reconciliation_status`, `settled_at`, `settled_by` |
| `shipping_label_attempts` | `id`, `order_id`, `claim_token`, `outcome`, `shipment_id`, `rate_id`, `transaction_id`, `provider`, `service`, `amount_cents`, `tracking_number`, `label_url`, `error`, `created_at`, `settled_at` |
| `shipping_labels` | `order_id`, `status`, `shipment_id`, `rate_id`, `transaction_id`, `provider`, `service`, `amount_cents`, `tracking_number`, `label_url`, `error`, `created_at`, `updated_at`, `claim_token` |
| `stocktake_items` | `id`, `stocktake_id`, `product_id`, `product_type_id`, `product_unit_id`, `condition`, `book_quantity`, `actual_quantity`, `difference` |
| `stocktakes` | `id`, `stocktake_code`, `location_id`, `status`, `note`, `created_by`, `created_at`, `completed_at` |
| `suppliers` | `id`, `supplier_code`, `name`, `phone`, `address`, `note`, `created_at`, `province`, `ward`, `address_detail`, `email`, `updated_at` |

## Hai miền dữ liệu cần thống nhất

- Đơn trực tuyến: orders + order_items + checkout_reservations + pending_payments, biến thể product_variants.
- POS Kgame: cùng orders + order_lines + order_units + payments + shipments, phiên bản product_types và Serial product_units.
- Tồn có products.stock, stock_new/stock_used, cached_stock_new/cached_stock_used, product_variants.stock và thẻ kho. Mỗi trường phải có chủ sở hữu và công thức đồng bộ rõ.
- Danh bạ có customers, suppliers và partners. Cần chọn điểm ghi/đọc chung, tránh ghép sai đối tác.
