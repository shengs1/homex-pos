import base64
import urllib.request
import os

# New diagrams to render
diagrams = {
    "05_2_sequence_thanh_toan_payos.png": """sequenceDiagram
    actor TN as Thu ngân
    participant UI as POS UI
    participant API as Backend API
    participant PAYOS as Cổng PayOS
    participant DB as Database
    actor KH as Khách hàng

    TN->>UI: 1. Chọn phương thức PayOS QR & click Checkout
    activate UI
    UI->>API: 2. POST /api/orders/{id}/payos-payment
    activate API
    API->>DB: 3. Lấy thông tin đơn hàng
    activate DB
    DB-->>API: 3.1 Trả về thông tin đơn hàng
    deactivate DB
    API->>PAYOS: 4. Gọi API tạo link thanh toán (createPaymentLink)
    activate PAYOS
    PAYOS-->>API: 4.1 Trả link thanh toán & mã QR code
    deactivate PAYOS
    API->>DB: 5. Cập nhật Order trạng thái sang PENDING_PAYMENT
    API-->>UI: 6. Trả về thông tin QR code & link thanh toán
    deactivate API
    UI-->>TN: 7. Hiển thị mã QR lên màn hình phụ cho khách
    deactivate UI
    
    KH->>PAYOS: 8. Quét mã QR bằng App Ngân hàng & thực hiện chuyển khoản
    activate PAYOS
    PAYOS-->>KH: 8.1 Giao dịch thành công
    deactivate PAYOS
    
    Note over PAYOS, API: Quy trình Webhook tự động (Bất đồng bộ)
    PAYOS->>API: 9. Gửi POST Webhook thông báo thanh toán thành công
    activate API
    API->>API: 9.1 Xác thực chữ ký (checksum) từ PayOS
    API->>DB: 9.2 Cập nhật trạng thái đơn thành COMPLETED & lưu thông tin Payment
    activate DB
    DB-->>API: 9.2.1 Hoàn tất cập nhật CSDL
    deactivate DB
    API-->>PAYOS: 10. Phản hồi Webhook thành công (200 OK)
    deactivate API
    
    Note over UI, API: POS Client liên tục kiểm tra trạng thái đơn hàng (Polling/Socket)
    UI->>API: 11. GET /api/orders/{id} (Check status)
    activate UI
    activate API
    API->>DB: 11.1 Kiểm tra trạng thái đơn hàng
    activate DB
    DB-->>API: 11.2 Trả về trạng thái COMPLETED
    deactivate DB
    API-->>UI: 11.3 Trả về trạng thái đơn hàng đã hoàn tất
    deactivate API
    UI-->>TN: 12. Hiển thị thông báo thanh toán thành công & in hóa đơn
    deactivate UI""",

    "05_4_sequence_ai_goi_y_ban_hang.png": """sequenceDiagram
    actor TN as Thu ngân
    participant UI as POS UI
    participant API as POS API
    participant AI as AI Sales Assistant Service
    participant GEMINI as Gemini API (Google Cloud)
    participant DB as Database

    TN->>UI: 1. Nhập yêu cầu khách hàng (Ngân sách, Nhu cầu) & click "Gợi ý AI"
    activate UI
    UI->>API: 2. POST /api/pos/suggest (cartItems, budget, prompt)
    activate API
    API->>DB: 3. Lấy thông tin các sản phẩm tương thích/còn tồn trong CSDL
    activate DB
    DB-->>API: 3.1 Trả về danh sách sản phẩm
    deactivate DB
    API->>AI: 4. Chuẩn bị ngữ cảnh (Context) & gọi dịch vụ gợi ý
    activate AI
    AI->>GEMINI: 5. Gửi prompt yêu cầu phân tích Cross-sell / Up-sell
    activate GEMINI
    GEMINI-->>AI: 5.1 Trả về danh sách gợi ý dạng JSON (productId, lý do đề xuất)
    deactivate GEMINI
    AI-->>API: 6. Parse JSON & cấu trúc lại kết quả gợi ý
    deactivate AI
    API-->>UI: 7. Trả về danh sách sản phẩm gợi ý kèm lý do
    deactivate API
    UI-->>TN: 8. Hiển thị danh sách gợi ý thông minh lên POS UI
    deactivate UI
    TN->>TN: 9. Tư vấn sản phẩm cho khách hàng
    TN->>UI: 10. Click "Thêm nhanh" sản phẩm gợi ý vào giỏ hàng
    activate UI
    UI-->>TN: 10.1 Giỏ hàng được cập nhật sản phẩm mới
    deactivate UI""",

    "05_6_sequence_bao_cao_doanh_thu.png": """sequenceDiagram
    actor AD as Admin
    participant UI as Admin Dashboard (Next.js)
    participant API as Reports API
    participant DB as Database

    AD->>UI: 1. Truy cập trang Báo cáo & Thống kê
    activate UI
    UI->>API: 2. GET /api/reports/sales?startDate={...}&endDate={...}
    activate API
    API->>DB: 3. Truy vấn các đơn hàng hoàn tất & chi phí nhập tương ứng
    activate DB
    DB-->>API: 3.1 Trả về dữ liệu Order, OrderDetail và PurchaseOrder
    deactivate DB
    API->>API: 4. Tính toán các chỉ số thống kê:<br/>- Tổng doanh thu (Revenue)<br/>- Tổng lợi nhuận (Profit = Revenue - Cost)<br/>- Tỉ lệ tăng trưởng
    API->>API: 5. Nhóm dữ liệu theo mốc thời gian (ngày/tháng) và danh mục
    API-->>UI: 6. Trả kết quả thống kê dạng JSON cấu trúc
    deactivate API
    UI->>UI: 7. Truyền dữ liệu vào thư viện Recharts để vẽ biểu đồ
    UI-->>AD: 8. Hiển thị Dashboard với các biểu đồ doanh thu dạng cột/đường
    deactivate UI""",

    "05_7_sequence_canh_bao_ton_kho.png": """sequenceDiagram
    actor TN as Thu ngân
    participant UI as POS UI
    participant API as Orders API
    participant DB as Database
    participant NT as Notification System

    TN->>UI: 1. Tiến hành thanh toán đơn hàng (Checkout)
    activate UI
    UI->>API: 2. PATCH /orders/{id}/checkout
    activate API
    API->>DB: 3. Cập nhật trạng thái đơn & trừ số lượng tồn kho sản phẩm (Product.stockQuantity)
    activate DB
    DB-->>API: 3.1 Cập nhật thành công
    deactivate DB
    
    API->>DB: 4. Đọc lại số lượng tồn kho hiện tại & mức tồn tối thiểu (Product.minStock)
    activate DB
    DB-->>API: 4.1 Trả về thông tin sản phẩm (stockQuantity, minStock)
    deactivate DB
    
    alt Tồn kho hiện tại <= Mức tồn tối thiểu (stockQuantity <= minStock)
        API->>DB: 5. Ghi nhận sự kiện Cảnh báo tồn kho thấp vào hệ thống
        API->>NT: 6. Trigger thông báo Cảnh báo Tồn kho (Low Stock Alert)
        activate NT
        NT->>DB: 6.1 Lưu thông báo cảnh báo (Notification)
        NT-->>API: 6.2 Đã phát thông báo thành công
        deactivate NT
    end
    
    API-->>UI: 7. Hoàn tất phản hồi thông tin đơn hàng
    deactivate API
    UI-->>TN: 8. Hiển thị hóa đơn thành công
    deactivate UI
    
    Note over NT, UI: Khi Admin tải lại trang quản trị Dashboard
    UI->>API: 9. GET /api/notifications (Lấy thông báo)
    activate UI
    activate API
    API->>DB: 9.1 Truy vấn các thông báo chưa đọc
    activate DB
    DB-->>API: 9.2 Trả về danh sách thông báo tồn kho thấp
    deactivate DB
    API-->>UI: 9.3 Trả về danh sách thông báo
    deactivate API
    UI-->>UI: 10. Hiển thị icon cảnh báo màu đỏ & danh sách sản phẩm sắp hết hàng
    deactivate UI""",

    "06_1_state_vong_doi_don_hang.png": """stateDiagram-v2
    [*] --> DRAFT : Khởi tạo đơn hàng nháp (Màn hình POS)
    DRAFT --> CANCELLED : Hủy đơn nháp (Chưa thanh toán)
    DRAFT --> PENDING_PAYMENT : Thanh toán chuyển khoản (PayOS QR)
    PENDING_PAYMENT --> COMPLETED : Webhook báo thanh toán thành công
    PENDING_PAYMENT --> CANCELLED : Hủy link thanh toán / Hết hạn thanh toán
    DRAFT --> COMPLETED : Checkout thanh toán bằng Tiền mặt thành công
    COMPLETED --> RETURNED : Khách hoàn trả hàng (Hoàn tiền toàn bộ hoặc một phần)
    CANCELLED --> [*]
    RETURNED --> [*]
    COMPLETED --> [*]""",

    "06_2_state_canh_bao_ton_kho.png": """stateDiagram-v2
    [*] --> IN_STOCK : Khởi tạo sản phẩm với tồn kho lớn (stock > minStock)
    IN_STOCK --> LOW_STOCK : Bán hàng làm giảm tồn kho xuống (stock <= minStock)
    LOW_STOCK --> OUT_OF_STOCK : Bán hết sản phẩm (stock == 0)
    OUT_OF_STOCK --> IN_STOCK : Nhập thêm hàng số lượng lớn (stock > minStock)
    LOW_STOCK --> IN_STOCK : Nhập thêm hàng bổ sung (stock > minStock)
    OUT_OF_STOCK --> LOW_STOCK : Nhập thêm hàng số lượng nhỏ (stock <= minStock)
    
    IN_STOCK --> [*]
    LOW_STOCK --> [*]
    OUT_OF_STOCK --> [*]"""
}

output_dir = r"d:\Đồ-án-cơ-sở-01\homex-pos\docs\images"
os.makedirs(output_dir, exist_ok=True)

for filename, code in diagrams.items():
    print(f"Rendering {filename}...")
    
    # 1. Encode code in base64 URL-safe format
    code_bytes = code.encode("utf-8")
    encoded = base64.urlsafe_b64encode(code_bytes).decode("ascii").strip("=")
    
    # 2. Call mermaid.ink API
    url = f"https://mermaid.ink/img/{encoded}"
    
    # 3. Download the PNG
    output_path = os.path.join(output_dir, filename)
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            with open(output_path, "wb") as f:
                f.write(response.read())
        print(f"  Successfully downloaded to {output_path}")
    except Exception as e:
        print(f"  Error rendering/downloading {filename}: {e}")

print("All tasks completed.")
