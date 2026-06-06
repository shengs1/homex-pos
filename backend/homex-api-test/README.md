# Homex POS REST Client Test Files

## Cách dùng

1. Cài extension **REST Client** trong VS Code.
2. Copy thư mục `api-test` này vào thư mục `backend` của project.
3. Mở file `01-auth.http`.
4. Bấm `Send Request` ở request login ADMIN và CASHIER.
5. Copy token trong response rồi dán vào biến `@adminToken` và `@cashierToken` ở đầu từng file `.http`.
6. Khi tạo mới category, supplier, product, customer, order..., copy `data.id` trong response rồi cập nhật lại biến tương ứng ở đầu file.

## Thứ tự test khuyến nghị

1. `01-auth.http`
2. `02-master-data.http`
3. `03-inventory.http`
4. `04-order-pos.http`
5. `05-warranty-payment.http`
6. `06-report-audit.http`

## Lưu ý

- Các biến trong REST Client chỉ có phạm vi trong từng file, nên bạn cần dán token/id vào từng file cần test.
- Không test bằng id cũ nếu dữ liệu đã bị hủy, xóa mềm, hoặc checkout trước đó.
- Với Order POS, hãy luôn lấy `orderId` mới từ request `POST /api/orders/draft`.
