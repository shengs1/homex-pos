# HomeX POS

Hệ thống quản lý bán hàng tại quầy dành cho cửa hàng đồ gia dụng HomeX. Dự án gồm giao diện web, máy chủ API và cơ sở dữ liệu PostgreSQL; hỗ trợ đầy đủ quy trình bán hàng, kho, thanh toán, bảo hành, báo cáo và trợ lý AI.

> README này được đối chiếu với mã nguồn hiện tại ngày 12/08/2026. Không đưa API key, mật khẩu thật hoặc thông tin bí mật vào Git.

## 1. Chức năng chính

- Bán hàng tại quầy: tìm hoặc quét sản phẩm, quản lý giỏ hàng, áp dụng khuyến mãi, lưu đơn nháp và thanh toán.
- Quản lý hàng hóa: sản phẩm, danh mục, nhà cung cấp, ảnh, SKU, mã vạch và tồn kho.
- Quản lý nhập hàng, điều chỉnh kho, phiếu nhập và đơn hoàn trả.
- Quản lý khách hàng, điểm tích lũy, hạng thành viên và bảo hành điện tử.
- Thanh toán tiền mặt hoặc PayOS; theo dõi giao dịch và hoàn tiền.
- Quản lý hóa đơn VAT, gửi email và cung cấp trang hóa đơn công khai.
- Quản lý ca làm việc, người dùng, cấu hình cửa hàng, thông báo và nhật ký thao tác.
- Dashboard và báo cáo doanh thu, lợi nhuận, sản phẩm bán chạy, khách hàng và tồn kho thấp.
- Chuyển đổi giao diện tiếng Việt/tiếng Anh.
- Quét mã vạch bằng camera điện thoại thông qua phiên quét từ xa.
- AI hỗ trợ bán hàng tại POS, dự báo nhập kho và bổ sung thông tin sản phẩm từ mã vạch/ảnh.

## 2. Kiến trúc tổng quát

```text
Trình duyệt / điện thoại
        │
        ▼
Frontend Next.js (cổng 3000)
        │  REST API + JWT
        ▼
Backend Express (cổng 5000)
   ├── PostgreSQL qua Prisma
   ├── Gemini → Groq → xử lý nội bộ
   ├── PayOS
   └── SMTP và dịch vụ tra cứu bên ngoài
```

Frontend không truy cập trực tiếp cơ sở dữ liệu hoặc API key. Các khóa dịch vụ chỉ được đặt trong `backend/.env` và được backend sử dụng.

## 3. Công nghệ đang sử dụng

| Phần | Công nghệ chính |
| --- | --- |
| Frontend | Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind CSS 4 |
| Giao diện và biểu đồ | Radix UI, TanStack Table, Recharts, Lucide React, Sonner |
| Biểu mẫu và kiểm tra dữ liệu | React Hook Form, Zod |
| Quét và tạo mã | html5-qrcode, JsBarcode, qrcode.react |
| Backend | Node.js, Express 5.2.1, TypeScript |
| Cơ sở dữ liệu | PostgreSQL, Prisma 6.19.3 |
| Xác thực | JWT, bcrypt |
| Dịch vụ ngoài | Gemini, Groq, PayOS, Nodemailer/SMTP |

Lưu ý: thư viện npm `openai` trong backend chỉ được dùng làm chương trình kết nối theo chuẩn tương thích OpenAI tới Gemini và Groq. Dự án **không sử dụng OpenAI API key** và không còn sử dụng GitHub Models.

## 4. AI trong dự án

AI hiện được áp dụng ở ba luồng:

| Vị trí | AI làm gì? |
| --- | --- |
| Trang POS | Đọc nhu cầu, ngân sách và giỏ hàng để gợi ý bán kèm/nâng cấp sản phẩm; giải thích lý do và đưa mẹo tư vấn. |
| Trang kho hàng | Phân tích tồn kho và lịch sử bán để dự báo số lượng cần nhập, mức ưu tiên và lý do. |
| Trang sản phẩm | Hỗ trợ bổ sung thông tin sản phẩm từ mã vạch, dữ liệu tra cứu hoặc hình ảnh khi có đủ cấu hình. |

Thứ tự xử lý của dịch vụ AI:

```text
1. Gemini (dịch vụ chính)
        ↓ nếu thiếu key, lỗi hoặc hết thời gian chờ
2. Groq (dịch vụ dự phòng)
        ↓ nếu tiếp tục không dùng được
3. Công thức/quy tắc nội bộ (hệ thống vẫn trả kết quả cơ bản)
```

Model mặc định trong mã nguồn:

- Gemini văn bản và hình ảnh: `gemini-flash-latest`.
- Groq văn bản: `openai/gpt-oss-120b`.
- Groq hình ảnh: `qwen/qwen3.6-27b`.

Có thể đổi model qua biến môi trường mà không cần sửa mã nguồn. Kết quả AI hỗ trợ cả tiếng Việt và tiếng Anh theo ngôn ngữ giao diện. AI chỉ có vai trò hỗ trợ; dữ liệu bán hàng, tồn kho và các quy tắc kiểm tra trong hệ thống vẫn là nguồn quyết định chính.

Các tệp backend quan trọng:

- `backend/src/services/ai-provider.service.ts`: chọn Gemini hoặc Groq.
- `backend/src/services/sales-assistant.service.ts`: trợ lý bán hàng POS.
- `backend/src/services/inventory-ai.service.ts`: dự báo và gợi ý nhập kho.
- `backend/src/services/barcode-enrichment.service.ts`: bổ sung dữ liệu sản phẩm.
- `backend/src/routes/sales-assistant.routes.ts`: API trợ lý POS.
- `backend/src/routes/inventory.routes.ts`: API kho và dự báo AI.

## 5. Phân quyền

| Vai trò | Phạm vi sử dụng |
| --- | --- |
| `ADMIN` | Quản trị toàn bộ hệ thống, hàng hóa, kho, báo cáo, người dùng, cài đặt và nhật ký. |
| `CASHIER` | Dashboard, POS, đơn hàng, khách hàng, bảo hành và ca làm việc. |

Backend kiểm tra JWT và vai trò tại API. Frontend đồng thời ẩn mục menu và chặn URL không phù hợp với vai trò.

## 6. Các trang của website

### Trang nội bộ

| Đường dẫn | Nội dung |
| --- | --- |
| `/login` | Đăng nhập bằng email hoặc mã nhân viên. |
| `/dashboard` | Tổng quan theo vai trò. |
| `/pos` | Bán hàng, giỏ hàng, quét mã, khuyến mãi, thanh toán và trợ lý AI. |
| `/orders` | Danh sách, chi tiết, tiếp tục đơn nháp và hủy đơn. |
| `/customers` | Khách hàng, điểm tích lũy và hạng thành viên. |
| `/products` | Sản phẩm, ảnh, SKU, mã vạch, nhập JSON/CSV và tra cứu dữ liệu. |
| `/categories` | Danh mục sản phẩm. |
| `/suppliers` | Nhà cung cấp. |
| `/inventory` | Tồn kho, nhập/điều chỉnh kho, lịch sử và dự báo AI. |
| `/purchase-orders` | Phiếu mua/nhập hàng. |
| `/return-orders` | Đơn hoàn trả. |
| `/payments` | Giao dịch thanh toán và hoàn tiền. |
| `/promotions` | Mã và điều kiện khuyến mãi. |
| `/warranties` | Quản lý bảo hành nội bộ. |
| `/vat-invoices` | Tiếp nhận, duyệt/từ chối và gửi hóa đơn VAT. |
| `/shifts` | Mở ca, đóng ca và đối soát tiền. |
| `/reports` | Báo cáo doanh thu, lợi nhuận, sản phẩm, khách hàng và kho. |
| `/settings` | Thông tin cửa hàng, hóa đơn, email và các cấu hình hệ thống. |
| `/users` | Tài khoản nhân viên. |
| `/audit-logs` | Nhật ký thao tác. |

### Trang công khai và trang hỗ trợ

| Đường dẫn | Nội dung |
| --- | --- |
| `/mobile-scan` | Dùng camera điện thoại quét mã cho phiên POS/sản phẩm. |
| `/tra-cuu-bao-hanh` | Khách hàng tra cứu bảo hành điện tử. |
| `/invoice/[orderCode]` | Xem và tải thông tin hóa đơn theo mã đơn. |
| `/payment/payos/return` | Nhận kết quả quay về sau khi thanh toán PayOS. |
| `/payment/payos/cancel` | Xử lý khi người dùng hủy thanh toán PayOS. |
| `/unauthorized` | Thông báo người dùng không có quyền truy cập. |

Đường dẫn `/` tự chuyển người dùng tới trang phù hợp theo trạng thái đăng nhập.

## 7. Cấu trúc thư mục

```text
homex-pos/
├── backend/
│   ├── prisma/                 # Lược đồ, migration và dữ liệu mẫu
│   ├── scripts/                # Kiểm tra AI, benchmark, sao lưu dữ liệu
│   └── src/
│       ├── routes/             # API theo từng phân hệ
│       ├── services/           # Nghiệp vụ, AI, PayOS, email...
│       ├── middlewares/        # Xác thực, phân quyền, chế độ demo
│       ├── utils/              # Hàm dùng chung
│       └── lib/                # Prisma client
├── frontend/
│   ├── app/                    # Các trang theo Next.js App Router
│   ├── components/             # Thành phần giao diện dùng chung
│   ├── contexts/               # Ngôn ngữ, xác thực, thông báo
│   ├── lib/                    # API client và hàm hỗ trợ
│   ├── services/               # Hàm gọi API theo phân hệ
│   └── types/                  # Kiểu dữ liệu TypeScript
├── docs/                       # Báo cáo, hướng dẫn, slide và sơ đồ
└── README.md
```

## 8. Yêu cầu trước khi cài đặt

- Node.js 20 trở lên.
- npm.
- PostgreSQL đang hoạt động và một cơ sở dữ liệu trống.
- Git (nếu lấy mã nguồn từ kho Git).

Camera trên điện thoại chỉ hoạt động trong môi trường an toàn: `https://` hoặc `localhost`.

## 9. Cài đặt và chạy

### 9.1. Backend

Tạo `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/homex_pos"
JWT_SECRET="thay_bang_chuoi_bi_mat_dai_va_kho_doan"
PORT=5000
FRONTEND_URL="http://localhost:3000"
APP_URL="http://localhost:3000"

# AI: có thể khai báo một hoặc cả hai; Gemini được ưu tiên trước
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-flash-latest"
GEMINI_VISION_MODEL="gemini-flash-latest"

GROQ_API_KEY=""
GROQ_MODEL="openai/gpt-oss-120b"
GROQ_VISION_MODEL="qwen/qwen3.6-27b"

# PayOS: chỉ cần khi dùng thanh toán trực tuyến
PAYOS_CLIENT_ID=""
PAYOS_API_KEY=""
PAYOS_CHECKSUM_KEY=""
PAYOS_RETURN_URL="http://localhost:3000/payment/payos/return"
PAYOS_CANCEL_URL="http://localhost:3000/payment/payos/cancel"

# Tùy chọn
IS_DEMO=false
TAX_LOOKUP_PROVIDER_URL="https://api.vietqr.io/v2/business"
UPCITEMDB_API_KEY=""
BARCODE_SPIDER_API_KEY=""
BARCODE_LOOKUP_API_KEY=""
```

Sau đó chạy:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Backend mặc định: `http://localhost:5000`

Kiểm tra nhanh: `http://localhost:5000/api/health`

Nếu cơ sở dữ liệu đã có migration đầy đủ, chỉ cần chạy `npx prisma migrate dev` khi có thay đổi mới. Lệnh seed tạo tài khoản và một số dữ liệu mẫu theo cách không tạo trùng.

### 9.2. Frontend

Tạo `frontend/.env.local`:

```env
# API mà trình duyệt gọi trực tiếp
NEXT_PUBLIC_API_BASE_URL="http://localhost:5000/api"

# Đích rewrite phía máy chủ Next.js
BACKEND_API_URL="http://localhost:5000/api"

# Tùy chọn: địa chỉ HTTPS công khai để điện thoại mở trang quét mã
NEXT_PUBLIC_MOBILE_SCAN_BASE_URL=""
```

`NEXT_PUBLIC_API_URL` vẫn được hỗ trợ để tương thích cấu hình cũ, nhưng nên dùng `NEXT_PUBLIC_API_BASE_URL`.

Chạy frontend:

```bash
cd frontend
npm install
npm run dev
```

Mở `http://localhost:3000`.

## 10. Tài khoản mẫu

Sau khi chạy `npx prisma db seed`:

| Vai trò | Email hoặc mã nhân viên | Mật khẩu |
| --- | --- | --- |
| ADMIN | `admin@homex.com` hoặc `ADMIN` | `123456` |
| CASHIER | `cashier@homex.com` hoặc `TN0001` | `123456` |

Chỉ dùng các tài khoản và mật khẩu trên cho môi trường học tập/demo.

## 11. Nhóm API chính

Backend cung cấp các nhóm API dưới tiền tố `/api`:

```text
auth, categories, suppliers, products, customers, inventory,
orders, users, warranties, payments, reports, audit-logs,
promotions, settings, shifts, purchase-orders, return-orders,
vat-invoices, notifications, invoices/public, pos, test, health
```

Hai chức năng cùng dùng `/api/pos`: phiên quét mã từ xa và trợ lý bán hàng. API công khai chỉ phục vụ các luồng được thiết kế công khai; các API quản trị yêu cầu JWT và quyền phù hợp.

## 12. Kiểm tra dự án

### Kiểm tra frontend

```bash
cd frontend
npm run lint
npm run build
```

### Kiểm tra TypeScript backend

```bash
cd backend
npx tsc --noEmit
```

### Kiểm tra AI

```bash
cd backend
npx tsx scripts/verify-gemini-ai.ts
npx tsx scripts/verify-groq-ai.ts
npx tsx scripts/benchmark-sales-ai-current.ts
npx tsx scripts/benchmark-inventory-ai-current.ts
```

Hai lệnh `verify-*` cần key tương ứng và kết nối mạng. Các bài benchmark dùng dữ liệu thử; không nên dùng dữ liệu khách hàng thật trong nội dung gửi tới AI.

### Sao lưu và phục hồi dữ liệu sản phẩm

```bash
cd backend
npm run db:backup
npm run db:restore
```

Hãy kiểm tra tệp sao lưu trước khi phục hồi để tránh ghi đè dữ liệu không mong muốn.

## 13. Lưu ý bảo mật và vận hành

- Không commit `backend/.env`, `frontend/.env.local` hoặc ảnh chụp có chứa khóa.
- Không đặt khóa Gemini, Groq, PayOS, SMTP hoặc mật khẩu cơ sở dữ liệu vào biến bắt đầu bằng `NEXT_PUBLIC_` vì các biến này có thể xuất hiện ở trình duyệt.
- Đổi `JWT_SECRET` và mật khẩu tài khoản mẫu trước khi triển khai thật.
- SMTP được cấu hình trong trang Cài đặt và lưu trong cơ sở dữ liệu. Trước khi triển khai thật cần che hoặc mã hóa `smtpPassword` trong API cài đặt và giới hạn quyền đọc cấu hình nhạy cảm.
- Khi dùng địa chỉ công khai/ngrok, cập nhật đồng bộ `FRONTEND_URL`, `APP_URL`, URL PayOS và `NEXT_PUBLIC_MOBILE_SCAN_BASE_URL`.
- Kết quả AI có thể thay đổi giữa các lần gọi. Luôn kiểm tra lại tồn kho, giá bán và số lượng đề xuất trước khi thực hiện nghiệp vụ.

## 14. Tài liệu đi kèm

- [Tài liệu sơ đồ hệ thống](docs/README.md)
- [Phân tích hoạt động AI](docs/Phan_tich_hoat_dong_AI_trong_HomeX_POS.docx)
- [Hướng dẫn học nhanh](docs/Huong_dan_hoc_nhanh_HomeX_POS.docx)
- [Hướng dẫn thuyết trình website](docs/Huong_dan_thuyet_trinh_gioi_thieu_toan_bo_website_HomeX_POS.docx)
- [Báo cáo đồ án](docs/Bao_cao_do_an_HomeX_POS.docx)

---

HomeX POS là dự án phục vụ học tập và trình bày đồ án. Trước khi triển khai thực tế cần bổ sung quy trình sao lưu toàn bộ cơ sở dữ liệu, HTTPS ổn định, giám sát lỗi và quản lý bí mật chuyên dụng.