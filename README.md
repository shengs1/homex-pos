# HomeX POS

Website POS quản lý bán hàng cho cửa hàng đồ gia dụng Homex. Dự án được xây dựng theo mô hình tách riêng Frontend và Backend, hỗ trợ bán hàng tại quầy, quản lý sản phẩm, kho hàng, khách hàng, hóa đơn, thanh toán, bảo hành, báo cáo và nhật ký hệ thống.

---

## 📂 Cấu trúc dự án

```text
homex-pos/
├── docs/                 # Tài liệu phân tích, thiết kế và báo cáo tiến độ
├── frontend/             # Giao diện người dùng - Next.js App Router
│   ├── app/              # Các route/page chính của hệ thống
│   ├── components/       # UI components, layout, guard, table dùng chung
│   ├── contexts/         # Context quản lý ngôn ngữ, trạng thái dùng chung
│   ├── lib/              # Helper, format, auth, axios config
│   ├── services/         # Hàm gọi API tập trung
│   └── types/            # TypeScript types
└── backend/              # RESTful API - Express.js + TypeScript
    ├── prisma/           # Prisma schema, migrations, seed data
    └── src/
        ├── routes/       # API routes theo từng module
        ├── middlewares/  # Auth, phân quyền, xử lý lỗi
        ├── utils/        # Helper xử lý lỗi, async wrapper, audit log
        └── lib/          # Prisma client
```

---

## 🛠️ Công nghệ sử dụng

### Frontend

* Next.js App Router
* TypeScript
* Tailwind CSS
* shadcn/ui
* TanStack Table
* Recharts
* Axios
* Zod
* react-hook-form

### Backend

* Express.js
* TypeScript
* PostgreSQL
* Prisma ORM
* Zod
* JWT
* bcrypt

### Công cụ kiểm thử

* REST Client trong Visual Studio Code
* Prisma Studio

---

## 🔐 Phân quyền hệ thống

Hệ thống hiện sử dụng 2 vai trò chính:

| Vai trò   | Quyền sử dụng                                                                  |
| --------- | ------------------------------------------------------------------------------ |
| `ADMIN`   | Quản trị toàn bộ hệ thống, dữ liệu, kho hàng, báo cáo, người dùng và audit log |
| `CASHIER` | Bán hàng POS, quản lý đơn hàng, khách hàng và tra cứu bảo hành                 |

Frontend có xử lý ẩn/hiện sidebar theo vai trò và chặn truy cập URL trái quyền.

---

## 🔧 Backend Modules

| Module    | Chức năng chính                                                 |
| --------- | --------------------------------------------------------------- |
| Auth      | Đăng nhập JWT, xác thực token, kiểm tra user active             |
| Category  | Quản lý danh mục, tìm kiếm, phân trang, xóa mềm, khôi phục      |
| Supplier  | Quản lý nhà cung cấp, tìm kiếm, phân trang, xóa mềm, khôi phục  |
| Product   | Quản lý sản phẩm, SKU/QR, tồn kho thấp, ảnh, xóa mềm, khôi phục |
| Customer  | Quản lý khách hàng, tìm kiếm, điểm tích lũy                     |
| Inventory | Nhập kho, điều chỉnh kho, lịch sử biến động kho                 |
| Order     | Tạo đơn nháp, cập nhật giỏ hàng, checkout, hủy đơn              |
| Payment   | Danh sách thanh toán, chi tiết, tìm theo đơn, hoàn tiền         |
| Warranty  | Tự động tạo bảo hành, tra cứu mã, tạo thủ công, hủy, khôi phục  |
| Report    | Tổng quan, doanh thu, top sản phẩm, tồn kho thấp, khách hàng    |
| User      | Tạo, sửa, khóa, khôi phục và đổi mật khẩu tài khoản             |
| Audit Log | Ghi nhận và lọc lịch sử thao tác hệ thống                       |

---

## 🌐 API Routes chính

| Route             | Chức năng             |
| ----------------- | --------------------- |
| `/api/auth`       | Đăng nhập và xác thực |
| `/api/categories` | Quản lý danh mục      |
| `/api/suppliers`  | Quản lý nhà cung cấp  |
| `/api/products`   | Quản lý sản phẩm      |
| `/api/customers`  | Quản lý khách hàng    |
| `/api/inventory`  | Quản lý kho hàng      |
| `/api/orders`     | Quản lý đơn hàng POS  |
| `/api/payments`   | Quản lý thanh toán    |
| `/api/warranties` | Quản lý bảo hành      |
| `/api/reports`    | Báo cáo thống kê      |
| `/api/users`      | Quản lý người dùng    |
| `/api/audit-logs` | Nhật ký hệ thống      |

---

## 💻 Frontend Pages

| Trang           | Chức năng                                                        |
| --------------- | ---------------------------------------------------------------- |
| `/login`        | Đăng nhập hệ thống                                               |
| `/dashboard`    | Tổng quan theo vai trò ADMIN/CASHIER                             |
| `/pos`          | Bán hàng tại quầy, giỏ hàng, tạo draft, checkout                 |
| `/orders`       | Danh sách đơn hàng, chi tiết, hủy đơn, tiếp tục thanh toán draft |
| `/customers`    | Quản lý và tìm kiếm khách hàng                                   |
| `/warranties`   | Danh sách, tra cứu và tạo bảo hành                               |
| `/products`     | Quản lý sản phẩm, QR, nhập dữ liệu mẫu, import JSON/CSV          |
| `/categories`   | Quản lý danh mục                                                 |
| `/suppliers`    | Quản lý nhà cung cấp                                             |
| `/inventory`    | Nhập kho, điều chỉnh kho, lịch sử kho                            |
| `/payments`     | Quản lý thanh toán và hoàn tiền                                  |
| `/reports`      | Báo cáo doanh thu, top sản phẩm, khách hàng                      |
| `/users`        | Quản lý tài khoản nhân viên                                      |
| `/audit-logs`   | Lịch sử thao tác hệ thống                                        |
| `/unauthorized` | Trang thông báo không có quyền truy cập                          |

---

## ✨ Chức năng Frontend nổi bật

* Giao diện quản trị bằng Tailwind CSS và shadcn/ui.
* Data Table sử dụng TanStack Table.
* Sidebar phân quyền theo `ADMIN` và `CASHIER`.
* Axios client tự gắn token và xử lý token hết hạn.
* POS có giỏ hàng, tạo đơn nháp, checkout và phục hồi đơn nháp.
* Sản phẩm có ảnh, QR code, nhập dữ liệu mẫu, import JSON/CSV.
* Biểu đồ doanh thu và top sản phẩm bằng Recharts.
* Hỗ trợ chuyển đổi ngôn ngữ VI/EN.
* Chuẩn hóa định dạng ngày tháng theo `dd/mm/yyyy`.
* Xử lý loading, error message, logout và redirect.

---

## 🚀 Cài đặt và chạy dự án

### 1. Chạy Backend

```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Backend chạy tại:

```text
http://localhost:5000
```

### 2. Chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend chạy tại:

```text
http://localhost:3000
```

### 3. Cấu hình môi trường

Backend cần file `.env`:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your_jwt_secret"
```

Frontend cần file `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 👤 Tài khoản demo

| Vai trò | Email               | Mật khẩu |
| ------- | ------------------- | -------- |
| ADMIN   | `admin@homex.com`   | `123456` |
| CASHIER | `cashier@homex.com` | `123456` |

---
