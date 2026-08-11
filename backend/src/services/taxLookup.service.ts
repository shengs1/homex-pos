export async function lookupTaxCode(taxCode: string) {
  const providerUrl = process.env.TAX_LOOKUP_PROVIDER_URL || "https://api.vietqr.io/v2/business";
  
  try {
    const response = await fetch(`${providerUrl}/${taxCode}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000), // 5 seconds timeout
    });

    if (!response.ok) {
      throw new Error(`Tax lookup provider returned ${response.status}`);
    }

    const result = await response.json();

    if (result.code !== "00" || !result.data) {
      return {
        success: false,
        message: "Không tìm thấy thông tin từ mã số thuế này",
      };
    }

    return {
      success: true,
      data: {
        taxCode: taxCode,
        companyName: result.data.name || "",
        companyAddress: result.data.address || "",
        source: "vietqr",
      },
    };
  } catch (error: any) {
    console.error("Tax lookup error:", error.message || error);
    return {
      success: false,
      message: "Lỗi kết nối đến dịch vụ tra cứu mã số thuế",
    };
  }
}
