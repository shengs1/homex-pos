import nodemailer from "nodemailer";

type SmtpConfig = {
  vatEmailEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  storeName: string;
  storeHotline: string | null;
};

type VatRequestData = {
  id: number;
  companyName: string;
  taxCode: string;
  companyAddress: string;
  buyerEmail: string | null;
  note: string | null;
  redInvoiceCode: string | null;
  adminNote: string | null;
  order: {
    orderCode: string;
    totalAmount: any;
  } | null;
};

export async function sendVatEmail(setting: SmtpConfig, request: VatRequestData) {
  if (!setting.vatEmailEnabled || !setting.smtpHost || !setting.smtpUser || !setting.smtpPassword) {
    throw new Error("Dịch vụ gửi email chưa được kích hoạt hoặc chưa cấu hình đầy đủ.");
  }

  if (!request.buyerEmail) {
    throw new Error("Không có email người nhận.");
  }

  // Create transporter dynamically from settings
  const transporter = nodemailer.createTransport({
    host: setting.smtpHost,
    port: Number(setting.smtpPort || 587),
    secure: Number(setting.smtpPort) === 465, // true for port 465, false for other ports
    auth: {
      user: setting.smtpUser,
      pass: setting.smtpPassword,
    },
  });

  const orderCode = request.order?.orderCode || "N/A";
  const totalAmountFormatted = request.order
    ? new Intl.NumberFormat("vi-VN").format(Number(request.order.totalAmount))
    : "0";

  const mailOptions = {
    from: `"${setting.storeName}" <${setting.smtpUser}>`,
    to: request.buyerEmail,
    subject: `[Homex POS] Hóa đơn VAT điện tử cho đơn hàng #${orderCode}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <!-- LOGO HEADER -->
        <div style="text-align: center; padding: 24px; background-color: #0b192c; border-bottom: 3px solid #0d9488;">
          <div style="display: inline-block; background-color: #0f2a4a; padding: 10px; border-radius: 12px; margin-bottom: 10px; border: 1.5px solid #0d9488;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto;">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 1.5px;">HOMEX POS</div>
        </div>

        <div style="padding: 24px;">
          <h2 style="color: #0f172a; text-align: center; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px; letter-spacing: 0.5px;">THÔNG TIN HÓA ĐƠN VAT</h2>
          
          <p style="color: #334155; font-size: 15px; line-height: 1.5; margin-bottom: 24px;">
            Kính chào Quý khách,<br/>
            Cửa hàng <strong>${setting.storeName}</strong> xin trân trọng gửi tới Quý khách thông tin hóa đơn VAT đã được duyệt phát hành:
          </p>

          <!-- 🏠 THÔNG TIN KHÁCH HÀNG -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="color: #0f172a; font-size: 15px; margin-top: 0; margin-bottom: 12px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;">
              🏠 THÔNG TIN KHÁCH HÀNG
            </h3>
            <ul style="list-style-type: none; padding: 0; margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">
              <li style="margin-bottom: 6px;"><strong style="color: #334155;">• Công ty:</strong> ${request.companyName}</li>
              <li style="margin-bottom: 6px;"><strong style="color: #334155;">• Mã số thuế:</strong> ${request.taxCode}</li>
              <li style="margin-bottom: 0;"><strong style="color: #334155;">• Địa chỉ:</strong> ${request.companyAddress || "N/A"}</li>
            </ul>
          </div>

          <!-- 🧾 THÔNG TIN HÓA ĐƠN -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <h3 style="color: #0f172a; font-size: 15px; margin-top: 0; margin-bottom: 12px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;">
              🧾 THÔNG TIN HÓA ĐƠN
            </h3>
            <ul style="list-style-type: none; padding: 0; margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">
              <li style="margin-bottom: 6px;"><strong style="color: #334155;">• Mã đơn hàng:</strong> #${orderCode}</li>
              <li style="margin-bottom: 6px;"><strong style="color: #334155;">• Mã hóa đơn đỏ:</strong> <span style="color: #0d9488; font-weight: bold;">${request.redInvoiceCode || "Đang xử lý"}</span></li>
              <li style="margin-bottom: 0;"><strong style="color: #334155;">• Tổng tiền:</strong> <span style="color: #0d9488; font-weight: bold; font-size: 15px;">${totalAmountFormatted} VND</span></li>
            </ul>
          </div>

          <!-- [ NÚT: XEM VÀ TẢI HÓA ĐƠN (PDF) ] -->
          <div style="text-align: center; margin: 24px 0 32px 0;">
            <a href="https://hoadondientu.gdt.gov.vn" target="_blank" style="display: inline-block; background-color: #0d9488; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.2), 0 2px 4px -2px rgba(13, 148, 136, 0.2);">
              XEM VÀ TẢI HÓA ĐƠN (PDF)
            </a>
          </div>

          <!-- HƯỚNG DẪN TRA CỨU & HỖ TRỢ -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 13px; color: #64748b; line-height: 1.6;">
            <p style="margin-top: 0; margin-bottom: 8px;"><strong>Hướng dẫn tra cứu hóa đơn:</strong></p>
            <p style="margin-top: 0; margin-bottom: 12px;">
              Quý khách vui lòng nhấn nút <strong>Xem và tải hóa đơn (PDF)</strong> ở trên để truy cập Cổng thông tin Hóa đơn điện tử của Tổng cục Thuế, sử dụng thông tin <strong>Mã số thuế</strong> và <strong>Mã hóa đơn đỏ</strong> để đối soát và tải hóa đơn gốc (.xml/.pdf).
            </p>
            ${request.adminNote ? `
            <p style="margin-top: 0; margin-bottom: 12px; color: #b45309; font-style: italic;">
              <strong>Ghi chú hỗ trợ từ cửa hàng:</strong> ${request.adminNote}
            </p>
            ` : ""}
            <p style="margin-top: 0; margin-bottom: 0; border-top: 1px dashed #e2e8f0; padding-top: 12px; text-align: center; font-size: 12px; color: #94a3b8;">
              Nếu Quý khách cần hỗ trợ thêm, vui lòng liên hệ hotline <strong>${setting.storeHotline || "N/A"}</strong> hoặc gửi email tới <strong>${setting.smtpUser || ""}</strong>.<br/>
              Đây là email tự động từ hệ thống quản lý <strong>${setting.storeName}</strong>. Vui lòng không phản hồi lại email này.
            </p>
          </div>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}
