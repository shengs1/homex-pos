Website POS cho cửa hàng đồ gia dụng

Cấu Trúc Thư Mục:
```text
homex-pos/
├── frontend/                  # Project Next.js
├── backend/                   # Project Express.js + TypeScript
│   ├── prisma/
│   │   ├── migrations/        # Migration khởi tạo database
│   │   ├── schema.prisma      # Mô hình dữ liệu của hệ thống
│   │   └── seed.ts            # Dữ liệu khởi tạo
│   └── src/
│       ├── lib/prisma.ts      # Kết nối Prisma Client
│       ├── middlewares/       # Các hàm xử lý trung gian (xác thực JWT, phân quyền...)
│       │   └── auth.middleware.ts
│       ├── routes/
│       │   ├── auth.routes.ts      #Xác Thực
│       │   ├── test.routes.ts      #Test 
│       │   ├── category.routes.ts  #Module QL.Danh Mục
│       │   └── supplier.routes.ts  #Module QL.Nhà Cung Cấp
│       └── index.ts           # Điểm khởi động backend
└── docs/                      # Tài liệu phân tích/thiết kế

Npm run dev
