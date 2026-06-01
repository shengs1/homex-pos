Website POS cho cửa hàng đồ gia dụng

Cấu Trúc Thư Mục:
homex-pos/
├── frontend/                  # Project Next.js, đã chạy được localhost:3000
├── backend/                   # Project Express.js + TypeScript
│   ├── prisma/
│   │   ├── migrations/        # Migration khởi tạo database
│   │   ├── schema.prisma      # Mô hình dữ liệu của hệ thống
│   │   └── seed.ts            # Dữ liệu khởi tạo
│   └── src/
│       ├── lib/prisma.ts      # Kết nối Prisma Client
│       ├── middlewares/
│       │   └── auth.middleware.ts
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── test.routes.ts
│       │   ├── category.routes.ts
│       │   └── supplier.routes.ts
│       └── index.ts           # Điểm khởi động backend
└── docs/                      # Tài liệu phân tích/thiết kế
