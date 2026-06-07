Website POS cho cửa hàng đồ gia dụng

---

## 📂 Cấu Trúc Tổng Quan Hệ Thống

```text
homex-pos/
├── docs/                  # Tài liệu phân tích thiết kế & sơ đồ hệ thống
├── frontend/              # Mã nguồn giao diện người dùng (Next.js + TS)
│   ├── app/               # Định nghĩa các trang giao diện (Pages & Routes)
│   ├── components/        # Thành phần UI dùng chung (UI Components, Layout)
│   └── services/          # Các hàm xử lý gọi API sang Backend
└── backend/               # Mã nguồn xử lý logic & API (Express.js + TS)
    ├── prisma/            # Cấu hình Database, Migrations & Seed dữ liệu mẫu
    └── src/
        ├── middlewares/   # Bộ lọc trung gian (Xác thực, Bắt lỗi toàn cục)
        ├── routes/        # Định nghĩa các tuyến đường API
        └── utils/         # Hàm tiện ích bổ trợ hệ thống

```

---

## 🔐 Phân Hệ Backend (`backend/`)

### 1. Danh sách API Routes (`src/routes/`)

| API Route | Chức năng chính |
| --- | --- |
| `auth` / `user` | Đăng nhập, đăng ký, cấp lại token & Quản lý nhân viên |
| `product` / `category` | Quản lý hàng hóa, giá cả, mã vạch & Danh mục sản phẩm |
| `inventory` / `supplier` | Quản lý xuất-nhập kho, tồn kho & Đối tác cung ứng |
| `order` / `payment` | Xử lý giỏ hàng, hóa đơn lẻ tại quầy & Phương thức thanh toán |
| `customer` / `warranty` | Quản lý thông tin khách hàng, tích điểm & Phiếu bảo hành |
| `report` / `audit-log` | Thống kê doanh thu, lợi nhuận & Nhật ký thao tác hệ thống |
| `test` | Endpoint nội bộ phục vụ kiểm thử |

### 2. Thành phần Core

* **Middlewares**:
* `auth.middleware.ts`: Xác thực Token JWT và phân quyền truy cập.
* `error.middleware.ts`: Gom và chuẩn hóa toàn bộ lỗi hệ thống tập trung.


* **Utils**:
* `catchAsync.ts`: Triệt tiêu khối `try-catch` lặp lại trong các Controller.
* `auditLog.ts`: Tự động lưu vết lịch sử thao tác dữ liệu của người dùng vào DB.



---

## 💻 Phân Hệ Frontend (`frontend/`)

### 1. Các Trang Giao Diện (`app/`)

| Cụm chức năng | Router chính | Chức năng trên UI |
| --- | --- | --- |
| Xác thực** | `(auth)/login` | Màn hình đăng nhập hệ thống |
| Bán hàng & Đơn hàng | `pos` / `orders` | Giao diện tính tiền tại quầy & Danh sách hóa đơn |
| Quản lý sản phẩm | `products` / `categories` | Quản lý danh mục, giá bán và thuộc tính hàng hóa |
| Kho & Nhà cung ứng | `inventory` / `suppliers` | Giao diện theo dõi tồn kho & Nhập hàng từ đối tác |
| Khách hàng & Bảo hành | `customers` / `warranties` | Hồ sơ khách hàng, hạng thành viên & Tra cứu bảo hành |
| Báo cáo & Giám sát | `reports` / `audit-logs` / `users` | Biểu đồ doanh thu, lịch sử hệ thống & Quản lý nhân sự |
| Điều hướng bảo mật | `unauthorized` | Màn hình chặn quyền khi truy cập trái phép |

### 2. Kiến trúc Giao diện & Kết nối API

* Phân quyền (Guard): `components/auth/role-guard.tsx` kiểm tra vai trò người dùng (Admin/Cashier) trước khi render trang.
* Hiển thị dữ liệu: Tích hợp bộ thư viện mạnh mẽ `tanstack-data-table.tsx` hỗ trợ lọc nâng cao, phân trang và tìm kiếm nhanh.
* Cơ chế kết nối: Toàn bộ các logic gọi API đều được tập trung xử lý thông qua `services/homex.service.ts` để đảm bảo tính đồng bộ dữ liệu.

---

## 🚀 Hướng Dẫn Cài Đặt Nhanh

### 1. Cài đặt Backend

```bash
cd backend
npm install
# Cấu hình file .env cho DATABASE_URL
npx prisma migrate dev
npm run dev

```

### 2. Cài đặt Frontend

```bash
cd frontend
npm install
# Cấu hình file .env.local cho API URL
npm run dev

```

